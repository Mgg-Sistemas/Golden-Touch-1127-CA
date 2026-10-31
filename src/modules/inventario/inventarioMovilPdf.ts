/* ============================================================
   Golden Touch · Inventario · PDF de la vista de teléfono (30/10/2026)

   Igual que el aviso de WhatsApp, cada pantalla «Listo» del teléfono
   (salida, traslado, entrada y retorno) deja ver su PDF en vista previa.
   NO hay formato nuevo: se usa la MISMA «Orden de Salida / Orden de
   Traslado» del módulo Salidas y Traslados (descargarOrdenSalidaPdf),
   armándole una SolicitudSalida con lo que la pantalla ya tiene. La
   entrada y el retorno usan ese formato con el título «ORDEN DE ENTRADA».
   Los mapeadores son puros (probados en inventarioMovilPdf.test.ts).
   ============================================================ */
import type { Producto, SolicitudSalida } from '@/shared/lib/types';
import type { OpcionesOrdenPdf } from '@/modules/salidas/salidaPdf';
import { num } from '@/shared/lib/format';
import { pendienteRetorno, type SalidaMina } from './salidasMina';
import { nombreDepositoChat, type TrasladoAlmacen } from './inventarioMovil';

/** Lo que el PDF necesita: la solicitud armada y los ajustes del formato. */
export interface DocMovilPdf {
  sol: SolicitudSalida;
  opciones: OpcionesOrdenPdf;
  /** Correo de quien registró (para resolver su «Nombre Apellido»). */
  actor: string | null;
}

/** Quién registró: el nombre, nunca el correo (si ya viene resuelto). */
interface Quien {
  actor?: string | null;
  nombre?: string | null;
}

/** Costo unitario del producto (PMP si lo tiene; si no, el precio de la ficha). */
export function costoProducto(p?: Pick<Producto, 'precio' | 'precio_promedio'> | null): number {
  const pmp = Number(p?.precio_promedio);
  if (Number.isFinite(pmp) && pmp > 0) return pmp;
  const precio = Number(p?.precio);
  return Number.isFinite(precio) && precio > 0 ? precio : 0;
}

const base = (q: Quien, codigo: string, at: string, scope: SolicitudSalida['scope']): SolicitudSalida => ({
  id: codigo,
  codigo,
  scope,
  tipo: 'material',
  estado: 'ejecutada',
  solicitante: q.nombre?.trim() || q.actor || '—',
  actor: q.actor ?? null,
  actor_name: q.nombre ?? null,
  historial: [],
  created_at: at,
  ejecutada_en: at,
});

/** Salida del teléfono (SDM-/SDP-/SIG-…) → «ORDEN DE SALIDA». */
export function docSalidaMovil(
  s: SalidaMina,
  producto: Pick<Producto, 'sku' | 'unidad' | 'precio' | 'precio_promedio'> | null,
  almacen: string,
  q: Quien,
): DocMovilPdf {
  const sol = base({ actor: s.actor ?? q.actor, nombre: s.actor_name ?? q.nombre }, s.codigo, s.created_at, 'salida');
  sol.id = s.id;
  sol.almacen_origen = nombreDepositoChat(s.almacen || almacen);
  sol.motivo = [
    s.motivo?.trim(),
    s.retorna ? 'Retorna: SÍ (queda en «Por retornar»)' : 'Retorna: NO',
    s.fotos?.length ? `Fotos: ${s.fotos.length}` : '',
  ].filter(Boolean).join(' · ');
  sol.items = [{
    producto_id: s.producto_id,
    producto_nombre: s.producto_nombre,
    producto_sku: producto?.sku ?? null,
    unidad: s.unidad ?? producto?.unidad ?? null,
    cantidad: Number(s.cantidad) || 0,
    precio_unit: costoProducto(producto),
  }];
  return { sol, actor: sol.actor ?? null, opciones: { autorizadoPor: s.autorizado_por ?? null } };
}

/** Traslado entre almacenes del teléfono (TRA-####) → «ORDEN DE TRASLADO». */
export function docTrasladoMovil(t: TrasladoAlmacen, precioUnit: number, q: Quien): DocMovilPdf {
  const sol = base(q, t.codigo, t.at, 'traslado');
  sol.almacen_origen = nombreDepositoChat(t.origen);
  sol.almacen_destino = nombreDepositoChat(t.destino);
  sol.motivo = [
    t.nota?.trim(),
    t.creado_en_destino ? `El producto se creó en ${nombreDepositoChat(t.destino)} (${t.sku_destino})` : '',
  ].filter(Boolean).join(' · ') || null;
  sol.items = [{
    producto_id: t.producto_origen_id,
    producto_nombre: t.nombre,
    producto_sku: t.sku_origen,
    unidad: t.unidad,
    cantidad: Number(t.cantidad) || 0,
    precio_unit: Number(precioUnit) || 0,
  }];
  return { sol, actor: sol.actor ?? null, opciones: { autorizadoPor: null } };
}

export interface EntradaMovil {
  /** Id del movimiento de stock (de ahí sale el N°). */
  movId: string;
  at: string;
  almacen: string;
  producto: Pick<Producto, 'id' | 'sku' | 'nombre' | 'unidad' | 'precio' | 'precio_promedio'>;
  cantidad: number;
  /** Costo informado en el movimiento; si no hay, el del producto. */
  precioUnit?: number | null;
  nota?: string | null;
}

/** N° de una entrada del teléfono: no tiene correlativo propio, va el inicio del id del movimiento. */
export const codigoEntradaMovil = (movId: string) => `ENT-${movId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** Entrada del teléfono → mismo formato, título «ORDEN DE ENTRADA». */
export function docEntradaMovil(e: EntradaMovil, q: Quien): DocMovilPdf {
  const sol = base(q, codigoEntradaMovil(e.movId), e.at, 'salida');
  sol.almacen_origen = nombreDepositoChat(e.almacen);
  sol.motivo = e.nota?.trim() || null;
  const precio = Number(e.precioUnit);
  sol.items = [{
    producto_id: e.producto.id,
    producto_nombre: e.producto.nombre,
    producto_sku: e.producto.sku,
    unidad: e.producto.unidad,
    cantidad: Number(e.cantidad) || 0,
    precio_unit: Number.isFinite(precio) && precio > 0 ? precio : costoProducto(e.producto),
  }];
  return {
    sol, actor: sol.actor ?? null,
    opciones: { titulo: 'ORDEN DE ENTRADA', subtitulo: 'Entrada de material', rotuloAlmacen: 'Almacén de entrada', autorizadoPor: null },
  };
}

/** Retorno de una salida (todo o parte) → formato de entrada, con el N° de la salida. */
export function docRetornoMovil(s: SalidaMina, cantidad: number, nota: string | null | undefined, at: string, q: Quien): DocMovilPdf {
  const sol = base(q, s.codigo, at, 'salida');
  sol.id = s.id;
  sol.almacen_origen = nombreDepositoChat(s.almacen || 'Depósito Mina');
  // `s` ya viene actualizada (con este retorno sumado), como en el aviso de WhatsApp.
  const falta = pendienteRetorno(s);
  const u = s.unidad ? ` ${s.unidad}` : '';
  sol.motivo = [
    `Retorno de la salida ${s.codigo} (salió ${num(Number(s.cantidad) || 0)}${u})`,
    falta > 0 ? `Falta por retornar: ${num(falta)}${u}` : 'Retornó completo',
    nota?.trim(),
  ].filter(Boolean).join(' · ');
  sol.items = [{
    producto_id: s.producto_id,
    producto_nombre: s.producto_nombre,
    unidad: s.unidad,
    cantidad: Number(cantidad) || 0,
    precio_unit: 0,
  }];
  return {
    sol, actor: sol.actor ?? null,
    opciones: { titulo: 'ORDEN DE ENTRADA', subtitulo: 'Retorno de material', rotuloAlmacen: 'Almacén de entrada', autorizadoPor: s.autorizado_por ?? null },
  };
}

/** Abre el PDF en vista previa (el mismo visor de todo el sistema). */
export async function verDocMovilPdf(d: DocMovilPdf): Promise<void> {
  const [{ descargarOrdenSalidaPdf }, { resolverQuien }] = await Promise.all([
    import('@/modules/salidas/salidaPdf'),
    import('@/shared/lib/directorioUsuarios'),
  ]);
  const quien = await resolverQuien().catch(() => null);
  await descargarOrdenSalidaPdf(d.sol, (email) => (email && quien ? quien(null, email) : email ?? ''), d.opciones);
}
