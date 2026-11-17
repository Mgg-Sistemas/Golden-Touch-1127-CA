/* ============================================================
   Golden Touch · Pre-salidas de Almacén · Repositorio y persistencia
   Portado desde MGG (17-11-2026).

   Manejo híbrido idéntico a MGG:
   1. Lee y guarda en Supabase (tabla `inventario_presalidas`).
   2. Respaldo transparente en `localStorage` si la tabla aún no fue creada
      en la base de datos (sin arrojar errores).
   3. Sincronización silenciosa adicional entre teléfonos vía `image/png` en
      `deposito-mina-salidas` (best-effort en segundo plano, nunca bloquea).
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import {
  desempaquetarPreSalidaPng,
  empaquetarPreSalidaPng,
  siguienteCodigoPreSalida,
  slugAlmacenPreSalida,
  type LineaPreSalida,
  type PreSalida,
  type PreSalidaInput,
} from './presalidas';

const TABLE = 'inventario_presalidas';
const STORAGE_KEY = 'gt.inventario.presalidas';
const BUCKET = 'deposito-mina-salidas';

const faltaSql = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (
    e.code === '42P01'
    || e.code === 'PGRST205'
    || e.code === '42703'
    || e.code === 'PGRST204'
    || /does not exist|Could not find the (table|.*column)/i.test(e.message ?? '')
  );

function leerLocal(): PreSalida[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista: PreSalida[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista.slice(0, 200)));
  } catch {
    // quota exceeded or disabled
  }
}

function upsertLocalItem(item: PreSalida): void {
  const resto = leerLocal().filter((x) => x.id !== item.id);
  guardarLocal([item, ...resto]);
}

function normalizarFila(r: Record<string, unknown>): PreSalida {
  return {
    id: String(r.id),
    codigo: String(r.codigo || ''),
    almacen: String(r.almacen || ''),
    motivo: String(r.motivo || ''),
    retorna: Boolean(r.retorna),
    equipo: (r.equipo as PreSalida['equipo'])
      ?? (r.equipo_id ? { id: String(r.equipo_id), nombre: String(r.equipo_nombre || '') } : null),
    tipoMant: (r.tipoMant as string | null) ?? (r.tipo_mant ? String(r.tipo_mant) : null),
    lineas: Array.isArray(r.lineas) ? (r.lineas as LineaPreSalida[]) : [],
    estado: (r.estado as PreSalida['estado']) || 'pendiente',
    autorizadoPor: (r.autorizadoPor as string | null) ?? (r.autorizado_por ? String(r.autorizado_por) : null),
    salidaCodigo: (r.salidaCodigo as string | null) ?? (r.salida_codigo ? String(r.salida_codigo) : null),
    actor: String(r.actor || ''),
    actorName: r.actorName !== undefined ? (r.actorName ? String(r.actorName) : null) : (r.actor_name ? String(r.actor_name) : null),
    createdAt: String(r.createdAt || r.created_at || new Date().toISOString()),
    updatedAt: String(r.updatedAt || r.updated_at || new Date().toISOString()),
  };
}

/* ─── Sincronización silenciosa en Storage usando PNG válido (`image/png`) ─── */

async function subirRespaldoPngSilencioso(pre: PreSalida): Promise<void> {
  try {
    const carpeta = `presalidas-png/${slugAlmacenPreSalida(pre.almacen)}`;
    const seq = `${Date.now().toString(36).padStart(9, '0')}-${Math.random().toString(36).slice(2, 6)}`;
    const path = `${carpeta}/${pre.id}__${seq}__${pre.estado}.png`;
    const pngBytes = empaquetarPreSalidaPng(pre);
    const blob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });
    await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: false,
      contentType: 'image/png',
    });
  } catch {
    // Best-effort silencioso: nunca bloquea ni muestra error.
  }
}

async function leerRespaldoPngSilencioso(almacen?: string): Promise<PreSalida[]> {
  if (!almacen) return [];
  try {
    const carpeta = `presalidas-png/${slugAlmacenPreSalida(almacen)}`;
    const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, {
      limit: 300,
      sortBy: { column: 'name', order: 'desc' },
    });
    if (error || !data?.length) return [];
    const re = /^([a-z0-9-]+)__([a-z0-9-]+)__(pendiente|procesada|descartada)\.png$/i;
    const ultimas = new Map<string, { seq: string; estado: string; name: string }>();
    for (const f of data) {
      const m = re.exec(f.name);
      if (!m) continue;
      const [, id, seq, est] = m;
      const prev = ultimas.get(id);
      if (!prev || seq > prev.seq) ultimas.set(id, { seq, estado: est.toLowerCase(), name: f.name });
    }
    const activas = Array.from(ultimas.values()).filter((x) => x.estado === 'pendiente').slice(0, 40);
    const descargadas = await Promise.all(activas.map(async (v) => {
      try {
        const res = await supabase.storage.from(BUCKET).download(`${carpeta}/${v.name}`);
        if (res.error || !res.data) return null;
        const buf = new Uint8Array(await res.data.arrayBuffer());
        const obj = desempaquetarPreSalidaPng(buf);
        return obj ? normalizarFila(obj) : null;
      } catch {
        return null;
      }
    }));
    return descargadas.filter((x): x is PreSalida => !!x);
  } catch {
    return [];
  }
}

async function proximoCodigoAtomicoOLocal(existentes: PreSalida[]): Promise<string> {
  const ano = new Date().getFullYear();
  try {
    const { data, error } = await supabase.rpc('next_correlativo', { p_clave: `pre-salida-${ano}` });
    if (!error && Number(data) > 0) {
      const candidato = `PRE-${ano}-${String(Number(data)).padStart(4, '0')}`;
      const localSig = siguienteCodigoPreSalida(existentes, ano);
      return candidato > localSig ? candidato : localSig;
    }
  } catch { /* fallback local */ }
  return siguienteCodigoPreSalida(existentes, ano);
}

/** Obtiene las pre-salidas (por defecto solo pendientes, opcionalmente de un almacén). */
export async function listPreSalidas(almacen?: string, soloPendientes = true): Promise<PreSalida[]> {
  try {
    let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false });
    if (almacen) q = q.eq('almacen', almacen);
    if (soloPendientes) q = q.eq('estado', 'pendiente');

    const { data, error } = await q;
    if (error) {
      if (faltaSql(error)) {
        const remotasPng = soloPendientes ? await leerRespaldoPngSilencioso(almacen) : [];
        const mapa = new Map<string, PreSalida>();
        for (const r of remotasPng) mapa.set(r.id, r);
        for (const l of leerLocal()) {
          const prev = mapa.get(l.id);
          if (!prev || (l.updatedAt || '') >= (prev.updatedAt || '')) mapa.set(l.id, l);
        }
        const todas = Array.from(mapa.values());
        guardarLocal(todas);
        return todas
          .filter((x) => (!almacen || x.almacen === almacen) && (!soloPendientes || x.estado === 'pendiente'))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
      throw error;
    }

    const remotas = ((data ?? []) as Record<string, unknown>[]).map(normalizarFila);
    const otrasLocales = leerLocal().filter((l) => almacen && l.almacen !== almacen);
    guardarLocal([...remotas, ...otrasLocales]);
    return remotas;
  } catch {
    const local = leerLocal();
    return local
      .filter((x) => (!almacen || x.almacen === almacen) && (!soloPendientes || x.estado === 'pendiente'))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Guarda una nueva pre-salida (borrador) con su código correlativo. */
export async function guardarPreSalida(input: PreSalidaInput): Promise<PreSalida> {
  const existentes = await listPreSalidas(input.almacen, false).catch(() => leerLocal());
  const codigo = input.codigo || await proximoCodigoAtomicoOLocal(existentes);
  const ahora = new Date().toISOString();
  const id = input.id || (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  const nueva: PreSalida = {
    id,
    codigo,
    almacen: input.almacen,
    motivo: input.motivo.trim(),
    retorna: Boolean(input.retorna),
    equipo: input.equipo || null,
    tipoMant: input.tipoMant || null,
    lineas: input.lineas,
    estado: 'pendiente',
    autorizadoPor: null,
    salidaCodigo: null,
    actor: input.actor,
    actorName: input.actorName,
    createdAt: ahora,
    updatedAt: ahora,
  };

  upsertLocalItem(nueva);

  try {
    const fila = {
      id,
      codigo,
      almacen: input.almacen,
      motivo: input.motivo.trim(),
      retorna: Boolean(input.retorna),
      equipo_id: input.equipo?.id || null,
      equipo_nombre: input.equipo?.nombre || null,
      tipo_mant: input.tipoMant || null,
      lineas: input.lineas,
      estado: 'pendiente',
      actor: input.actor,
      actor_name: input.actorName,
      created_at: ahora,
      updated_at: ahora,
    };

    const { data, error } = await supabase.from(TABLE).insert(fila).select('*').single();
    if (!error && data) {
      const guardada = normalizarFila(data as Record<string, unknown>);
      upsertLocalItem(guardada);
      return guardada;
    }
    if (error && faltaSql(error)) {
      void subirRespaldoPngSilencioso(nueva);
      return nueva;
    }
    if (error) throw error;
  } catch {
    void subirRespaldoPngSilencioso(nueva);
  }

  return nueva;
}

/** Modifica un borrador existente de pre-salida (cambiar o quitar materiales, motivo, etc.). */
export async function actualizarPreSalida(id: string, cambios: Partial<PreSalidaInput>, base?: PreSalida): Promise<PreSalida> {
  const ahora = new Date().toISOString();
  const local = leerLocal();
  const index = local.findIndex((x) => x.id === id);
  const previa = index !== -1 ? local[index] : base;
  if (!previa) throw new Error('No se encontró la pre-salida a editar.');

  const actualizada: PreSalida = {
    ...previa,
    motivo: cambios.motivo !== undefined ? cambios.motivo.trim() : previa.motivo,
    retorna: cambios.retorna !== undefined ? Boolean(cambios.retorna) : previa.retorna,
    equipo: cambios.equipo !== undefined ? cambios.equipo : previa.equipo,
    tipoMant: cambios.tipoMant !== undefined ? cambios.tipoMant : previa.tipoMant,
    lineas: cambios.lineas !== undefined ? cambios.lineas : previa.lineas,
    updatedAt: ahora,
  };

  upsertLocalItem(actualizada);

  try {
    const fila: Record<string, unknown> = { updated_at: ahora };
    if (cambios.motivo !== undefined) fila.motivo = cambios.motivo.trim();
    if (cambios.retorna !== undefined) fila.retorna = Boolean(cambios.retorna);
    if (cambios.equipo !== undefined) {
      fila.equipo_id = cambios.equipo?.id || null;
      fila.equipo_nombre = cambios.equipo?.nombre || null;
    }
    if (cambios.tipoMant !== undefined) fila.tipo_mant = cambios.tipoMant;
    if (cambios.lineas !== undefined) fila.lineas = cambios.lineas;

    const { data, error } = await supabase.from(TABLE).update(fila).eq('id', id).select('*').single();
    if (!error && data) {
      const guardada = normalizarFila(data as Record<string, unknown>);
      upsertLocalItem(guardada);
      return guardada;
    }
    if (error && faltaSql(error)) {
      void subirRespaldoPngSilencioso(actualizada);
      return actualizada;
    }
  } catch {
    void subirRespaldoPngSilencioso(actualizada);
  }

  return actualizada;
}

/** Marca una pre-salida como procesada cuando ya se ejecutó la salida formal con su autorizado. */
export async function marcarPreSalidaProcesada(pre: PreSalida, salidaCodigo: string, autorizadoPor: string): Promise<void> {
  const ahora = new Date().toISOString();
  const cerrada: PreSalida = {
    ...pre,
    estado: 'procesada',
    salidaCodigo,
    autorizadoPor,
    updatedAt: ahora,
  };
  upsertLocalItem(cerrada);

  try {
    const { error } = await supabase.from(TABLE).update({
      estado: 'procesada',
      salida_codigo: salidaCodigo,
      autorizado_por: autorizadoPor,
      updated_at: ahora,
    }).eq('id', pre.id);
    if (error && faltaSql(error)) {
      void subirRespaldoPngSilencioso(cerrada);
    }
  } catch {
    void subirRespaldoPngSilencioso(cerrada);
  }
}

/** Descarta / anula una pre-salida cuando el supervisor la rechaza en WhatsApp. */
export async function descartarPreSalida(pre: PreSalida): Promise<void> {
  const ahora = new Date().toISOString();
  const descartada: PreSalida = {
    ...pre,
    estado: 'descartada',
    updatedAt: ahora,
  };
  upsertLocalItem(descartada);

  try {
    const { error } = await supabase.from(TABLE).update({
      estado: 'descartada',
      updated_at: ahora,
    }).eq('id', pre.id);
    if (error && faltaSql(error)) {
      void subirRespaldoPngSilencioso(descartada);
    }
  } catch {
    void subirRespaldoPngSilencioso(descartada);
  }
}
