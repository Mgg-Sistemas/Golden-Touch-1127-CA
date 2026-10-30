/* ============================================================
   Golden Touch · Delivery · Lógica pura (30/10/2026)

   Lo que se calcula sin tocar la base: los avisos de WhatsApp de cada paso
   (aceptado, no se puede buscar, en ruta, entregado), el resumen por
   motorizado, el filtro del histórico (fechas en hora de Venezuela), las
   etiquetas de estado y el enlace para llamar / escribir por WhatsApp.

   Todos los emojis son «emoji por defecto» (ninguno necesita el selector
   U+FE0F, que WhatsApp pierde). Además se quita cualquier U+FE0F que venga
   en lo escrito por el usuario (motivo, detalle, nota).
   ============================================================ */
import { quienSync } from '@/shared/lib/directorioUsuarios';
import type { PagoMetodo } from '@/shared/lib/types';
import type { AdjuntoPago } from '@/modules/pedidos/adjuntosPago';
import {
  ESTADOS_DELIVERY,
  type EstadoDelivery, type EventoDeliveryRow, type PedidoDelivery, type PedidoDeliveryVista,
} from './delivery.types';

/* ───────────── Retención (solo informativa) ───────────── */

/**
 * La OC entra a Delivery en cuanto Tesorería la marca como pagada; la retención
 * NO la frena. Se muestra como dato: hecha, pendiente o no aplica (sin factura).
 */
export type EstadoRetencionDelivery = 'hecha' | 'pendiente' | 'no_aplica';

/**
 * La vista del contrato + extensiones de este módulo (sin tocar delivery.types.ts):
 * · `orden.retencion`: estado de la retención (solo informativo).
 * · `orden.pagada_por` / `pagada_por_email` / `metodo_pago` / `metodo_pago_texto`:
 *   para mostrar «Pagado el … por … · método».
 * · `comprobantesPago`: los comprobantes que adjuntó Tesorería al pagar (bucket
 *   `compras-oc`; se abren con `urlComprobantePago` del repositorio), para que el
 *   motorizado verifique que la orden de verdad se pagó.
 */
export type PedidoDeliveryConRetencion = PedidoDeliveryVista & {
  orden: PedidoDeliveryVista['orden'] & {
    retencion: EstadoRetencionDelivery;
    /** Nombre y apellido de quien pagó (o lo guardado, si no está en el directorio). */
    pagada_por: string | null;
    pagada_por_email: string | null;
    metodo_pago: PagoMetodo[];
    /** «Pago móvil + Efectivo $» (vacío si no se indicó). */
    metodo_pago_texto: string;
  };
  comprobantesPago: AdjuntoPago[];
};
/** Mismo tipo con nombre más claro (la vista completa de este módulo). */
export type PedidoDeliveryCompleto = PedidoDeliveryConRetencion;

export function estadoRetencion(o: { comprobante_tipo?: string | null; retencion_finalizada?: boolean | null }): EstadoRetencionDelivery {
  if (o.comprobante_tipo !== 'factura') return 'no_aplica';
  return o.retencion_finalizada ? 'hecha' : 'pendiente';
}

export const ETIQUETA_RETENCION: Record<EstadoRetencionDelivery, string> = {
  hecha: 'Retención hecha',
  pendiente: 'Retención pendiente',
  no_aplica: 'No lleva retención',
};

/** «Pagado el 30/10/2026 10:15 por Ana Pérez · Pago móvil». '' si la OC no tiene fecha de pago. */
export function textoPagado(o: { pagada_en?: string | null; pagada_por?: string | null; metodo_pago_texto?: string | null }): string {
  const f = fechaHoraVE(o.pagada_en);
  if (!f) return '';
  return [`Pagado el ${f}${o.pagada_por?.trim() ? ` por ${o.pagada_por.trim()}` : ''}`, o.metodo_pago_texto?.trim()]
    .filter(Boolean).join(' · ');
}

/* ───────────── Formatos ───────────── */

const PIE = '🏢 GOLDEN TOUCH 1127 C.A. · Delivery';

export const numDelivery = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 4 });

/** Fecha y hora de Venezuela: «30/10/2026 09:45». */
export function fechaHoraVE(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
}

/** Día en Venezuela (YYYY-MM-DD) de un instante. '' si no es una fecha. */
export function diaVE(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Minutos entre dos instantes (null si falta alguno o el orden no tiene sentido). */
export function minutosEntre(desde: string | null | undefined, hasta: string | null | undefined): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 60_000;
}

/** «45 min», «2 h 05 min». */
export function textoDuracion(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

const sinSelector = (s: string) => s.replace(/️/g, '');

/* ───────────── Estados ───────────── */

export function etiquetaEstado(estado: EstadoDelivery | string | null | undefined): string {
  return ESTADOS_DELIVERY.find((e) => e.key === estado)?.label ?? String(estado ?? '');
}

export type AccionDelivery = 'aceptar' | 'en_ruta' | 'entregar';

/** Lo que toca hacer después según el estado (null = ya se entregó). */
export function siguienteAccion(estado: EstadoDelivery): { accion: AccionDelivery; label: string } | null {
  switch (estado) {
    case 'por_tomar': return { accion: 'aceptar', label: '✋ Aceptar' };
    case 'aceptado': return { accion: 'en_ruta', label: '📷 Recibí el pedido · En ruta' };
    case 'en_ruta': return { accion: 'entregar', label: '✅ Entregado en almacén' };
    default: return null;
  }
}

/* ───────────── Teléfono ───────────── */

/**
 * Enlaces para llamar y para WhatsApp. Normaliza los números venezolanos:
 * «0414-123.45.67» → +584141234567; «414 1234567» → +584141234567; «+58 …» igual.
 * Si el campo trae varios números («0414… / 0286…») se usa el primero.
 * Devuelve null si no hay un número utilizable.
 */
export function telLink(telefono: string | null | undefined): { numero: string; tel: string; wa: string } | null {
  const primero = String(telefono ?? '').split(/[/,;]|\sy\s/)[0] ?? '';
  const internacional = primero.trim().startsWith('+');
  let d = primero.replace(/\D/g, '');
  if (!d) return null;
  if (internacional) {
    // ya viene con código de país
  } else if (d.startsWith('58') && d.length === 12) {
    // 58 + 10 dígitos
  } else if (d.startsWith('0') && d.length === 11) {
    d = `58${d.slice(1)}`;
  } else if (d.length === 10 && /^[24]/.test(d)) {
    d = `58${d}`;
  }
  if (d.length < 7) return null;
  return { numero: `+${d}`, tel: `tel:+${d}`, wa: `https://wa.me/${d}` };
}

/* ───────────── Mensajes de WhatsApp ───────────── */

function cabecera(p: PedidoDeliveryVista): string[] {
  const l = [`🔖 *N°:* ${p.codigo}`];
  const oc = p.orden?.oc_codigo || p.orden?.codigo;
  if (oc) l.push(`🧾 *OC:* ${oc}`);
  if (p.orden?.urgente) l.push('🚨 *URGENTE*');
  return l;
}

function lineasProveedor(p: PedidoDeliveryVista, completo: boolean): string[] {
  const pr = p.proveedor;
  if (!pr) return [];
  const l: string[] = [];
  const nombre = [pr.razon_social, pr.rif ? `(${pr.rif})` : ''].filter(Boolean).join(' ');
  if (nombre) l.push(`🏪 *Proveedor:* ${nombre}`);
  if (completo && pr.direccion?.trim()) l.push(`📍 *Dirección:* ${pr.direccion.trim()}`);
  if (completo && pr.telefono?.trim()) l.push(`📞 *Teléfono:* ${pr.telefono.trim()}`);
  return l;
}

/** Renglones que de verdad se compraron (los marcados «no comprar» no se buscan). */
export function itemsABuscar(p: PedidoDeliveryVista) {
  return (p.orden?.items ?? []).filter((i) => i && i.comprar !== false);
}

function lineasProductos(p: PedidoDeliveryVista): string[] {
  const items = itemsABuscar(p);
  if (!items.length) return [];
  return [
    '📦 *Productos:*',
    ...items.map((i) => `• ${i.nombre} — ${numDelivery(i.cantidad)}${i.unidad ? ` ${i.unidad}` : ''}`),
  ];
}

const nombreDe = (p: PedidoDeliveryVista, quien: string | null | undefined) =>
  (quien ?? '').trim() || quienSync(p.repartidor_nombre, p.repartidor_email);

function armar(bloques: string[][]): string {
  const lineas: string[] = [];
  for (const b of bloques) {
    if (!b.length) continue;
    if (lineas.length) lineas.push('');
    lineas.push(...b);
  }
  lineas.push('', PIE);
  return sinSelector(lineas.join('\n'));
}

/** «🛵 PEDIDO ACEPTADO»: el motorizado lo va a buscar. */
export function mensajeAceptado(p: PedidoDeliveryVista, quien?: string | null): string {
  const q = nombreDe(p, quien);
  return armar([
    ['🛵 *PEDIDO ACEPTADO*', ...cabecera(p)],
    lineasProveedor(p, true),
    lineasProductos(p),
    [q ? `👤 *Lo va a buscar:* ${q}` : '', `🕒 ${fechaHoraVE(p.aceptado_en ?? new Date().toISOString())}`].filter(Boolean),
  ]);
}

/** «⚠ NO SE PUEDE BUSCAR EL PEDIDO»: vuelve a «Por tomar» para que otro lo tome. */
export function mensajeCancelado(
  p: PedidoDeliveryVista, motivo: string | null | undefined, detalle: string | null | undefined, quien?: string | null,
): string {
  const q = nombreDe(p, quien);
  const l: string[] = [];
  if (motivo?.trim()) l.push(`📌 *Motivo:* ${motivo.trim()}`);
  if (detalle?.trim()) l.push(`📝 *Detalle:* ${detalle.trim()}`);
  if (q) l.push(`👤 *Avisa:* ${q}`);
  l.push(`🕒 ${fechaHoraVE(new Date().toISOString())}`);
  return armar([
    ['⚠ *NO SE PUEDE BUSCAR EL PEDIDO*', ...cabecera(p)],
    lineasProveedor(p, false),
    l,
    ['🔄 El pedido vuelve a *Por tomar* para que otro motorizado lo busque.'],
  ]);
}

/** «🚚 PEDIDO EN RUTA AL ALMACÉN»: ya lo recibió del proveedor. */
export function mensajeEnRuta(p: PedidoDeliveryVista, quien?: string | null): string {
  const q = nombreDe(p, quien);
  const n = p.fotos_recibido?.length ?? 0;
  return armar([
    ['🚚 *PEDIDO EN RUTA AL ALMACÉN*', ...cabecera(p)],
    lineasProveedor(p, false),
    lineasProductos(p),
    [
      n ? `📷 *Fotos al recibir:* ${n}` : '📷 *Fotos al recibir:* sin fotos',
      q ? `🛵 *Lo lleva:* ${q}` : '',
      `🕒 ${fechaHoraVE(p.en_ruta_en ?? new Date().toISOString())}`,
    ].filter(Boolean),
  ]);
}

/** «✅ PEDIDO ENTREGADO EN ALMACÉN». */
export function mensajeEntregado(p: PedidoDeliveryVista, quien?: string | null, nota?: string | null): string {
  const q = nombreDe(p, quien);
  const n = p.fotos_entrega?.length ?? 0;
  const entregado = p.entregado_en ?? new Date().toISOString();
  const tiempo = minutosEntre(p.aceptado_en, entregado);
  const notaFinal = (nota ?? p.nota_entrega ?? '').trim();
  return armar([
    ['✅ *PEDIDO ENTREGADO EN ALMACÉN*', ...cabecera(p)],
    lineasProveedor(p, false),
    lineasProductos(p),
    [
      n ? `📷 *Fotos al entregar:* ${n}` : '',
      notaFinal ? `📝 *Nota:* ${notaFinal}` : '',
      q ? `🛵 *Entregado por:* ${q}` : '',
      tiempo != null ? `⌛ *Tiempo desde que lo aceptó:* ${textoDuracion(tiempo)}` : '',
      `🕒 ${fechaHoraVE(entregado)}`,
    ].filter(Boolean),
  ]);
}

/* ───────────── Resumen por motorizado ───────────── */

export interface ResumenRepartidor {
  repartidor_email: string;
  repartidor_nombre: string | null;
  aceptados: number;
  entregados: number;
  cancelaciones: number;
  en_curso: number;
  /** Promedio aceptado → entregado, en minutos (null si no entregó ninguno con las dos horas). */
  minutos_promedio: number | null;
}

const clave = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Por motorizado: aceptados (los eventos «aceptado», o al menos los pedidos que
 * tiene), entregados, cancelaciones (eventos «cancelado»), en curso (aceptado o
 * en ruta) y el tiempo promedio de aceptado a entregado. Más entregas primero.
 */
export function resumenPorRepartidor(pedidos: PedidoDelivery[], eventos: EventoDeliveryRow[]): ResumenRepartidor[] {
  type Acc = ResumenRepartidor & { evAceptados: number; evEntregados: number; tiempos: number[] };
  const m = new Map<string, Acc>();
  const de = (email: string | null | undefined, nombre: string | null | undefined): Acc | null => {
    const k = clave(email);
    if (!k) return null;
    let r = m.get(k);
    if (!r) {
      r = {
        repartidor_email: (email ?? '').trim(), repartidor_nombre: null,
        aceptados: 0, entregados: 0, cancelaciones: 0, en_curso: 0, minutos_promedio: null,
        evAceptados: 0, evEntregados: 0, tiempos: [],
      };
      m.set(k, r);
    }
    if (!r.repartidor_nombre && nombre?.trim()) r.repartidor_nombre = nombre.trim();
    return r;
  };

  for (const p of pedidos) {
    const r = de(p.repartidor_email, p.repartidor_nombre);
    if (!r) continue;
    r.aceptados += 1;
    if (p.estado === 'entregado') {
      r.entregados += 1;
      const t = minutosEntre(p.aceptado_en, p.entregado_en);
      if (t != null) r.tiempos.push(t);
    } else if (p.estado === 'aceptado' || p.estado === 'en_ruta') {
      r.en_curso += 1;
    }
  }
  for (const e of eventos) {
    if (e.evento !== 'aceptado' && e.evento !== 'cancelado' && e.evento !== 'entregado') continue;
    const r = de(e.actor_email, e.actor_nombre);
    if (!r) continue;
    if (e.evento === 'aceptado') r.evAceptados += 1;
    else if (e.evento === 'entregado') r.evEntregados += 1;
    else r.cancelaciones += 1;
  }

  return [...m.values()]
    .map(({ evAceptados, evEntregados, tiempos, ...r }) => ({
      ...r,
      aceptados: Math.max(r.aceptados, evAceptados),
      entregados: Math.max(r.entregados, evEntregados),
      minutos_promedio: tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null,
    }))
    .sort((a, b) => b.entregados - a.entregados
      || (a.repartidor_nombre ?? a.repartidor_email).localeCompare(b.repartidor_nombre ?? b.repartidor_email, 'es'));
}

/* ───────────── Histórico ───────────── */

export interface FiltrosHistoricoDelivery {
  /** YYYY-MM-DD (día de Venezuela), inclusive. */
  desde?: string | null;
  hasta?: string | null;
  /** Correo del motorizado. */
  repartidor?: string | null;
  estado?: EstadoDelivery | '' | null;
}

/** El día con que cuenta el pedido en el histórico: cuando se entregó, si no cuando se aceptó, si no cuando entró. */
export function fechaReferencia(p: Pick<PedidoDelivery, 'entregado_en' | 'aceptado_en' | 'created_at'>): string {
  return p.entregado_en || p.aceptado_en || p.created_at;
}

/** Filtra por rango de días (hora de Venezuela), motorizado y estado. Lo más reciente primero. */
export function filtrarHistorico<T extends PedidoDelivery>(pedidos: T[], f: FiltrosHistoricoDelivery = {}): T[] {
  const desde = (f.desde ?? '').trim();
  const hasta = (f.hasta ?? '').trim();
  const rep = clave(f.repartidor);
  const estado = f.estado || null;
  return pedidos
    .filter((p) => {
      if (estado && p.estado !== estado) return false;
      if (rep && clave(p.repartidor_email) !== rep) return false;
      if (desde || hasta) {
        const dia = diaVE(fechaReferencia(p));
        if (!dia) return false;
        if (desde && dia < desde) return false;
        if (hasta && dia > hasta) return false;
      }
      return true;
    })
    .sort((a, b) => fechaReferencia(b).localeCompare(fechaReferencia(a)));
}
