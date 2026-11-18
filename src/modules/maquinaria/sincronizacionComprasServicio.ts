/* ============================================================
   Golden Touch · Sincronización bidireccional Maquinaria ↔ Compras Servicios

   Regla de negocio (18/11/2026):
   1) Si en Control de Maquinaria se ELIMINA una orden/solicitud de servicio (OS-…),
      su Solicitud de Servicio vinculada en Compras → Servicios (SS-… / CS-…) debe
      pasar automáticamente a CANCELADA.
   2) Si en Compras → Servicios se CANCELA (o rechaza / envía a papelera) la
      Solicitud de Servicio, la orden/solicitud en Control de Maquinaria debe
      ELIMINARSE automáticamente.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EstadoOrden, EventoHistorial } from '@/shared/lib/types';
import { listFotosOrden, borrarArchivosFotosOrden } from './osFotos.repository';

export const ESTADOS_ORDEN_CANCELABLES_DESDE_MAQUINARIA: readonly EstadoOrden[] = [
  'revision_almacen',
  'pendiente',
  'aprobada',
  'oc_creada',
  'confirmada_metodo',
  'oc_aprobada',
  'desistida_proveedor',
];

const SET_CANCELABLES_MAQ = new Set<string>(ESTADOS_ORDEN_CANCELABLES_DESDE_MAQUINARIA);

/** Extrae todos los códigos `OS-AAAA-####` de Control de Maquinaria referenciados por una orden de Compras. */
export function codigosOrdenServicioEnOrdenCompra(o: {
  tipo?: string | null;
  items?: unknown;
  notas?: string | null;
}): string[] {
  const codigos = new Set<string>();
  if (Array.isArray(o.items)) {
    for (const raw of o.items) {
      if (!raw || typeof raw !== 'object') continue;
      const cod = String((raw as { orden_servicio?: unknown }).orden_servicio ?? '').trim().toUpperCase();
      if (/^OS-\d{4}-\d+$/.test(cod)) codigos.add(cod);
    }
  }
  const nota = String(o.notas ?? '').trim();
  const matchNota = /^Orden de servicio\s+(OS-\d{4}-\d+)\b/i.exec(nota);
  if (matchNota?.[1]) codigos.add(matchNota[1].toUpperCase());
  return [...codigos];
}

/** Determina si una orden de servicio de Maquinaria debe eliminarse porque su Solicitud de Servicio en Compras fue cancelada, rechazada o eliminada. */
export function ordenServicioDebeEliminarsePorCompras(
  os: { estado: string; nota_cierre?: string | null; orden_compra_id?: string | null },
  compra?: { estado?: string | null; eliminado_en?: unknown } | null,
): boolean {
  if (compra) {
    if (Boolean(compra.eliminado_en)) return true;
    const est = String(compra.estado ?? '').toLowerCase();
    if (est === 'cancelada' || est === 'rechazada') return true;
  }
  if (
    os.estado === 'anulada' &&
    /^(Cancelada|Rechazada)\s+(desde|en)\s+Compras\b/i.test(String(os.nota_cierre ?? '').trim())
  ) {
    return true;
  }
  return false;
}

/** Determina si una Solicitud de Servicio en Compras quedó huérfana porque su OS fue eliminada en Control de Maquinaria. */
export function ordenServicioMaquinariaHuerfana(
  o: { tipo?: string | null; estado: string; items?: unknown; notas?: string | null },
  codigosOsExistentes: ReadonlySet<string>,
): { cancelar: boolean; codigosEliminados: string[] } {
  if (!SET_CANCELABLES_MAQ.has(o.estado)) return { cancelar: false, codigosEliminados: [] };
  const refs = codigosOrdenServicioEnOrdenCompra(o);
  if (!refs.length) return { cancelar: false, codigosEliminados: [] };
  const sigueViva = refs.some((c) => codigosOsExistentes.has(c));
  if (sigueViva) return { cancelar: false, codigosEliminados: [] };
  return { cancelar: true, codigosEliminados: refs };
}

/** Cancela en `ordenes` (Compras → Servicios) toda solicitud vinculada a una OS recién eliminada en Control de Maquinaria. */
export async function cancelarSolicitudesServicioDeOrdenMaquinaria(params: {
  ordenCompraId?: string | null;
  codigoOs: string;
  actorEmail?: string | null;
}): Promise<void> {
  const codigoOs = params.codigoOs.trim().toUpperCase();
  const actor = params.actorEmail?.trim() || 'sistema';

  // Limpiar espejo automático de bitácora creado por la solicitud si no se realizó
  if (codigoOs) {
    await supabase
      .from('maquinaria_mantenimientos')
      .delete()
      .ilike('observacion', `Orden de servicio ${codigoOs}%`)
      .then(() => undefined, () => undefined);
  }

  const consultas: Array<PromiseLike<{ data: unknown[] | null; error: unknown }>> = [];
  if (params.ordenCompraId) {
    consultas.push(
      supabase
        .from('ordenes')
        .select('id, estado, historial, eliminado_en')
        .eq('id', params.ordenCompraId),
    );
  }
  if (codigoOs) {
    consultas.push(
      supabase
        .from('ordenes')
        .select('id, estado, historial, eliminado_en')
        .contains('items', JSON.stringify([{ orden_servicio: codigoOs }])),
    );
  }
  if (!consultas.length) return;

  const resultados = await Promise.all(consultas);
  const vistas = new Map<string, { id: string; estado: string; historial: EventoHistorial[] | null; eliminado_en?: unknown }>();
  for (const res of resultados) {
    if (res.error || !Array.isArray(res.data)) continue;
    for (const raw of res.data as Array<{ id: string; estado: string; historial: EventoHistorial[] | null; eliminado_en?: unknown }>) {
      if (raw?.id && !vistas.has(raw.id)) vistas.set(raw.id, raw);
    }
  }

  const motivo = `Cancelada automáticamente al eliminarse la orden de servicio ${codigoOs} en Control de Maquinaria`;
  const ahora = new Date().toISOString();

  for (const ord of vistas.values()) {
    if (ord.eliminado_en || !SET_CANCELABLES_MAQ.has(ord.estado)) continue;
    const histPrev = Array.isArray(ord.historial) ? ord.historial : [];
    const nuevoHist: EventoHistorial[] = [
      ...histPrev,
      { at: ahora, evento: 'cancelada', actor, motivo },
    ];
    await supabase
      .from('ordenes')
      .update({ estado: 'cancelada', historial: nuevoHist })
      .eq('id', ord.id)
      .then(() => undefined, () => undefined);
  }
}

/** Elimina en Control de Maquinaria toda orden de servicio (`maquinaria_ordenes_servicio`) vinculada a una solicitud cancelada/rechazada/eliminada en Compras. */
export async function eliminarOrdenesMaquinariaDeSolicitudServicio(o: {
  id: string;
  codigo?: string | null;
  tipo?: string | null;
  items?: unknown;
  notas?: string | null;
}): Promise<void> {
  const codigosOs = codigosOrdenServicioEnOrdenCompra(o);
  const consultas: Array<PromiseLike<{ data: unknown[] | null; error: unknown }>> = [
    supabase
      .from('maquinaria_ordenes_servicio')
      .select('id, codigo')
      .eq('orden_compra_id', o.id),
  ];
  if (codigosOs.length > 0) {
    consultas.push(
      supabase
        .from('maquinaria_ordenes_servicio')
        .select('id, codigo')
        .in('codigo', codigosOs),
    );
  }

  const resultados = await Promise.all(consultas);
  const osMap = new Map<string, { id: string; codigo: string }>();
  for (const res of resultados) {
    if (res.error || !Array.isArray(res.data)) continue;
    for (const r of res.data as Array<{ id: string; codigo: string }>) {
      if (r?.id && !osMap.has(r.id)) osMap.set(r.id, r);
    }
  }

  for (const os of osMap.values()) {
    await borrarOrdenMaquinariaFisica(os);
  }
}

const purgandoIds = new Set<string>();

async function borrarOrdenMaquinariaFisica(os: { id: string; codigo: string }): Promise<void> {
  const fotos = await listFotosOrden(os.id).catch(() => []);
  const { data, error } = await supabase
    .from('maquinaria_ordenes_servicio')
    .delete()
    .eq('id', os.id)
    .select('id');
  if (!error && data && data.length > 0) {
    if (fotos.length > 0) {
      await borrarArchivosFotosOrden(fotos.map((f) => f.path)).catch(() => undefined);
    }
    if (os.codigo) {
      await supabase
        .from('maquinaria_mantenimientos')
        .delete()
        .ilike('observacion', `Orden de servicio ${os.codigo}%`)
        .then(() => undefined, () => undefined);
    }
  }
}

/** Purga en segundo plano órdenes de Maquinaria cuya compra ya fue cancelada en Compras (cuando RLS impidió al analista borrarla en caliente). */
export function purgarOrdenServicioEnSegundoPlano(os: { id: string; codigo: string }): void {
  if (!os.id || purgandoIds.has(os.id)) return;
  purgandoIds.add(os.id);
  void borrarOrdenMaquinariaFisica(os).finally(() => {
    purgandoIds.delete(os.id);
  });
}
