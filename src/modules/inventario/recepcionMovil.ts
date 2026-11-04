/* ============================================================
   Golden Touch · Inventario (teléfono) · Recepción de lo que entrega el delivery (04/11/2026)

   El motorizado marca «Entregado en almacén» y la OC queda POR RECEPCIONAR: el
   almacenista la ve en «📥 Recepción», revisa lo que llegó de cada renglón y la
   recepciona (delivery_recepcionar): suma al inventario, la OC queda recibida en
   Compras y sale el aviso de WhatsApp con las fotos y el PDF (Orden de Entrada).
   Aquí lo que se calcula sin tocar la base.
   ============================================================ */
import type { ItemOrden } from '@/shared/lib/types';
import { num } from '@/shared/lib/format';
import { fechaHoraVE } from './salidasMina';
import { nombreDepositoChat } from './inventarioMovil';
import type { DocMovilPdf } from './inventarioMovilPdf';
import type { Recepcion } from './recepcionesHistorico';

export interface FotoRecepcion { path: string; filename: string }

/** Una OC entregada por el delivery que falta recepcionar (delivery_por_recepcionar). */
export interface PorRecepcionar {
  pedido_id: string;
  orden_id: string;
  sp: string;
  oc: string | null;
  proveedor: string | null;
  proveedor_rif: string | null;
  solicitante: string | null;
  unidad_solicitante: string | null;
  analista: string | null;
  delivery: string | null;
  entregado_en: string | null;
  almacen_entrega: string | null;
  nota_entrega: string | null;
  fotos_recibo: FotoRecepcion[];
  fotos_entrega: FotoRecepcion[];
  items: ItemOrden[];
  total: number | null;
  almacen_destino: string | null;
  urgente: boolean | null;
}

/** Lo que el almacenista escribió que llegó, renglón por renglón (texto del input). */
export type CantidadesRecepcion = string[];

const leer = (t: string | undefined) => {
  const n = Number(String(t ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** Cantidad que llegó de cada renglón (vacío = lo pedido), sin pasar de lo pedido. */
export function cantidadesRecibidas(p: Pick<PorRecepcionar, 'items'>, cants: CantidadesRecepcion): number[] {
  return p.items.map((it, i) => {
    const pedida = Math.max(0, Number(it.cantidad) || 0);
    const t = cants[i];
    if (t == null || String(t).trim() === '') return pedida;
    const n = leer(t);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), pedida) : pedida;
  });
}

/** Lo que impide recepcionar; `null` = se puede. */
export function errorRecepcion(p: Pick<PorRecepcionar, 'items'>, cants: CantidadesRecepcion): string | null {
  if (!p.items.length) return 'La orden no tiene renglones.';
  for (let i = 0; i < p.items.length; i++) {
    const t = cants[i];
    if (t == null || String(t).trim() === '') continue;
    const n = leer(t);
    const pedida = Number(p.items[i].cantidad) || 0;
    if (!Number.isFinite(n) || n < 0) return `Revisa la cantidad de ${p.items[i].nombre}.`;
    if (n > pedida) return `De ${p.items[i].nombre} se pidieron ${num(pedida)}: no se puede recibir más.`;
  }
  if (cantidadesRecibidas(p, cants).every((n) => n <= 0)) return 'No llegó nada: si la orden no vino, no la recepciones.';
  return null;
}

export const esParcial = (p: Pick<PorRecepcionar, 'items'>, cants: CantidadesRecepcion) =>
  cantidadesRecibidas(p, cants).some((n, i) => n < (Number(p.items[i].cantidad) || 0));

/** El aviso de WhatsApp de la recepción. */
export function mensajeRecepcion(p: PorRecepcionar, cants: CantidadesRecepcion, quien: string | null, at: string, nota?: string | null): string {
  const rec = cantidadesRecibidas(p, cants);
  const parcial = esParcial(p, cants);
  const l = [
    '📥 *RECEPCIÓN EN ALMACÉN*',
    `🔖 *OC:* ${p.oc ?? '—'} · ${p.sp}`,
    '',
  ];
  if (p.proveedor) l.push(`🏭 *Proveedor:* ${p.proveedor}`);
  if (p.solicitante) l.push(`👤 *Solicita:* ${p.solicitante}${p.unidad_solicitante ? ` · ${p.unidad_solicitante}` : ''}`);
  if (p.analista) l.push(`🛒 *Analista:* ${p.analista}`);
  if (p.delivery) l.push(`🛵 *Delivery:* ${p.delivery}${p.entregado_en ? ` · entregó ${fechaHoraVE(p.entregado_en)}` : ''}`);
  l.push(`🏬 *Almacén:* ${nombreDepositoChat(p.almacen_destino || 'General')}`);
  l.push('', `📦 *Recibido (${p.items.length}):*`);
  p.items.forEach((it, i) => {
    const pedida = Number(it.cantidad) || 0;
    const u = it.unidad ? ` ${it.unidad}` : '';
    l.push(`${i + 1}. ${it.nombre} — *${num(rec[i])}${u}*${rec[i] < pedida ? ` de ${num(pedida)} ⚠` : ''}`);
  });
  l.push('', parcial ? '⚠ *Llegó incompleta*' : '✅ *Llegó completa*');
  if (nota?.trim()) l.push(`📝 *Nota:* ${nota.trim()}`);
  const fotos = p.fotos_entrega.length + p.fotos_recibo.length;
  if (fotos) l.push(`📷 *Fotos:* ${fotos}`);
  l.push('');
  if (quien) l.push(`👷 *Recepcionó:* ${quien}`);
  const f = fechaHoraVE(at);
  if (f) l.push(`🕒 ${f}`);
  l.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Inventario');
  return l.join('\n');
}

/** El PDF de la recepción: el formato de la Orden de Entrada del teléfono. */
export function docRecepcion(p: PorRecepcionar, cants: CantidadesRecepcion, q: { actor: string | null; nombre: string | null }, at: string, nota?: string | null): DocMovilPdf {
  const rec = cantidadesRecibidas(p, cants);
  const codigo = p.oc ? `${p.oc} · ${p.sp}` : p.sp;
  const motivo = [
    p.proveedor ? `Proveedor: ${p.proveedor}` : '',
    p.delivery ? `Entregó: ${p.delivery} (Delivery)` : '',
    p.solicitante ? `Solicita: ${p.solicitante}${p.unidad_solicitante ? ` · ${p.unidad_solicitante}` : ''}` : '',
    esParcial(p, cants) ? 'Llegó incompleta' : 'Llegó completa',
    nota?.trim() || '',
  ].filter(Boolean).join(' · ');
  return {
    actor: q.actor,
    opciones: { titulo: 'ORDEN DE ENTRADA', subtitulo: 'Recepción de compra', rotuloAlmacen: 'Almacén de entrada', autorizadoPor: p.analista },
    sol: {
      id: p.pedido_id,
      codigo,
      scope: 'salida',
      tipo: 'material',
      estado: 'ejecutada',
      solicitante: q.nombre?.trim() || q.actor || '—',
      actor: q.actor,
      actor_name: q.nombre,
      historial: [],
      created_at: at,
      ejecutada_en: at,
      almacen_origen: nombreDepositoChat(p.almacen_destino || 'General'),
      motivo,
      items: p.items.map((it, i) => ({
        producto_id: it.productoId ?? '',
        producto_nombre: it.nombre,
        producto_sku: it.sku || null,
        unidad: it.unidad ?? null,
        cantidad: rec[i],
        precio_unit: Number(it.precio) || 0,
      })),
    },
  };
}

/* ---------- Histórico de recepciones (teléfono y PC): su PDF y su WhatsApp ---------- */

/** Una recepción del histórico con los nombres que el PDF y el WhatsApp necesitan. */
export interface RecepcionDetallada {
  r: Recepcion;
  proveedor: string | null;
  items: { producto_id: string; nombre: string; sku: string | null; unidad: string | null; cantidad: number; precio: number | null }[];
}

export function mensajeRecepcionHistorica(d: RecepcionDetallada, quien: string | null): string {
  const { r } = d;
  const l = ['📥 *RECEPCIÓN EN ALMACÉN*', `🔖 *N°:* ${r.codigo}`, ''];
  if (d.proveedor) l.push(`🏭 *Proveedor:* ${d.proveedor}`);
  l.push(`🏬 *Almacén:* ${nombreDepositoChat(r.almacen || 'General')}`);
  l.push('', `📦 *Recibido (${d.items.length}):*`);
  d.items.forEach((it, i) => l.push(`${i + 1}. ${it.nombre} — *${num(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''}*`));
  l.push('');
  if (quien) l.push(`👷 *Recepcionó:* ${quien}`);
  const f = fechaHoraVE(r.at);
  if (f) l.push(`🕒 ${f}`);
  l.push('', '🏢 GOLDEN TOUCH 1127 C.A. · Inventario');
  return l.join('\n');
}

export function docRecepcionHistorica(d: RecepcionDetallada): DocMovilPdf {
  const { r } = d;
  return {
    actor: r.actor,
    opciones: { titulo: 'ORDEN DE ENTRADA', subtitulo: 'Recepción de compra', rotuloAlmacen: 'Almacén de entrada', autorizadoPor: null },
    sol: {
      id: `${r.ref_id ?? r.codigo}-${r.numero}`,
      codigo: r.codigo,
      scope: 'salida',
      tipo: 'material',
      estado: 'ejecutada',
      solicitante: r.actor_name?.trim() || r.actor || '—',
      actor: r.actor,
      actor_name: r.actor_name,
      historial: [],
      created_at: r.at,
      ejecutada_en: r.at,
      almacen_origen: nombreDepositoChat(r.almacen || 'General'),
      motivo: [d.proveedor ? `Proveedor: ${d.proveedor}` : '', r.documento ? `Documento: ${r.documento}` : ''].filter(Boolean).join(' · ') || null,
      items: d.items.map((it) => ({
        producto_id: it.producto_id, producto_nombre: it.nombre, producto_sku: it.sku, unidad: it.unidad,
        cantidad: it.cantidad, precio_unit: Number(it.precio) || 0,
      })),
    },
  };
}
