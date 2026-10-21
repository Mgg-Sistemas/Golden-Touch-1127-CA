/* ============================================================
   Golden Touch · Compras · «Cierre diario» (lógica, sin pantalla)

   Un resumen de cuatro números —solo los títulos con sus cantidades— que sale
   en PDF, Excel y WhatsApp:

     · Pedidos                        solicitudes hechas en el período
     · Órdenes pendientes por aprobar OC que esperan al Gerente General
     · Órdenes por pagar              aprobadas, con el método indicado o por indicar
     · Órdenes pagadas                pagadas en el período

   EL FILTRO DE FECHAS cuenta cada cosa por SU fecha: si se marca HOY, solo entra
   lo que HOY quedó pendiente por aprobar, lo que HOY pasó a por pagar, lo que HOY
   se pagó y los pedidos que HOY se hicieron. Se puede filtrar por día, semana
   (lunes a domingo), mes o un rango cualquiera. Las fechas son las de Venezuela
   (America/Caracas), no las del navegador.

   Vive aquí, sin pantalla ni base de datos, para poder probarlo.
   ============================================================ */
import type { Orden } from '@/shared/lib/types';

export const ZONA_CIERRE = 'America/Caracas';

export type ModoPeriodo = 'dia' | 'semana' | 'mes' | 'rango';

/** Período con fechas AAAA-MM-DD, ambas incluidas. */
export interface PeriodoCierre {
  modo: ModoPeriodo;
  desde: string;
  hasta: string;
}

/** Lo mínimo de una orden que el cierre necesita (la consulta trae solo estas columnas). */
export type FilaCierre = Pick<
  Orden,
  'id' | 'estado' | 'created_at' | 'op_padre_id' | 'oc_creada_en' | 'oc_aprobada_en' | 'aprobada_en' | 'pagada_en'
>;

export interface ResumenCierre {
  pedidos: number;
  porAprobar: number;
  porPagar: number;
  pagadas: number;
}

export interface TituloCierre {
  clave: keyof ResumenCierre;
  titulo: string;
  /** Emoji por defecto (sin selector invisible U+FE0F, que WhatsApp pierde). */
  emoji: string;
}

/** Los cuatro títulos, en el orden en que salen en los tres formatos. */
export const TITULOS_CIERRE: readonly TituloCierre[] = [
  { clave: 'pedidos', titulo: 'Pedidos', emoji: '📥' },
  { clave: 'porAprobar', titulo: 'Órdenes pendientes por aprobar', emoji: '⏳' },
  { clave: 'porPagar', titulo: 'Órdenes por pagar', emoji: '💵' },
  { clave: 'pagadas', titulo: 'Órdenes pagadas', emoji: '✅' },
];

/** AAAA-MM-DD en hora de Venezuela de un instante (ISO o Date). '' si no es una fecha. */
export function fechaCaracas(v: string | Date | null | undefined): string {
  if (!v) return '';
  // Una fecha sin hora ya es una fecha de calendario: no se corre por zona.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CIERRE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function hoyCaracas(ahora: Date = new Date()): string {
  return fechaCaracas(ahora);
}

/** dd/mm/aaaa a partir de AAAA-MM-DD. */
export function fechaCorta(ymd: string): string {
  const [a, m, d] = ymd.split('-');
  return d && m && a ? `${d}/${m}/${a}` : ymd;
}

/** La hora de Venezuela como «08:45 a. m.». */
export function horaCaracas(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CIERRE, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(ahora);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const periodo = g('dayPeriod').toUpperCase() === 'PM' ? 'p. m.' : 'a. m.';
  return `${g('hour').padStart(2, '0')}:${g('minute')} ${periodo}`;
}

/** «21/10/2026 · 08:45 a. m.» — el momento en que se imprime. */
export function momentoImpresion(ahora: Date = new Date()): string {
  return `${fechaCorta(hoyCaracas(ahora))} · ${horaCaracas(ahora)}`;
}

/** Suma `n` días a una fecha AAAA-MM-DD (sin depender de la zona del navegador). */
function sumarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Arma el período. `ref` es la fecha base:
 *  · dia    → ese día.
 *  · semana → la semana (lunes a domingo) que contiene `ref`.
 *  · mes    → el mes de `ref` (acepta AAAA-MM o AAAA-MM-DD).
 *  · rango  → de `ref` a `hasta`; si vienen al revés se voltean.
 */
export function periodoDe(modo: ModoPeriodo, ref: string, hasta?: string): PeriodoCierre {
  if (modo === 'semana') {
    const dow = new Date(`${ref}T00:00:00Z`).getUTCDay(); // 0 = domingo
    const lunes = sumarDias(ref, -((dow + 6) % 7));
    return { modo, desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  if (modo === 'mes') {
    const [a, m] = ref.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate(); // día 0 del mes siguiente = último de este
    const mm = String(m).padStart(2, '0');
    return { modo, desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` };
  }
  if (modo === 'rango') {
    const h = hasta || ref;
    return h < ref ? { modo, desde: h, hasta: ref } : { modo, desde: ref, hasta: h };
  }
  return { modo: 'dia', desde: ref, hasta: ref };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Cómo se lee el período en el encabezado de los reportes. */
export function etiquetaPeriodo(p: PeriodoCierre, hoy: string = hoyCaracas()): string {
  if (p.modo === 'dia') return p.desde === hoy ? `Hoy · ${fechaCorta(p.desde)}` : `Día ${fechaCorta(p.desde)}`;
  if (p.modo === 'semana') return `Semana del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`;
  if (p.modo === 'mes') {
    const [a, m] = p.desde.split('-').map(Number);
    return `Mes de ${MESES[m - 1]} de ${a}`;
  }
  return p.desde === p.hasta ? `Día ${fechaCorta(p.desde)}` : `Del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`;
}

/** Estados en que una orden no cuenta como pagada aunque tenga fecha de pago (el crédito se salda por abonos). */
const SIN_PAGO_VALIDO = new Set(['cancelada', 'rechazada', 'reasignada', 'desistida_proveedor', 'cuenta_abierta']);

export function calcularCierre(filas: readonly FilaCierre[], p: PeriodoCierre): ResumenCierre {
  const en = (v: string | null | undefined) => {
    const d = fechaCaracas(v);
    return d !== '' && d >= p.desde && d <= p.hasta;
  };
  const r: ResumenCierre = { pedidos: 0, porAprobar: 0, porPagar: 0, pagadas: 0 };
  for (const o of filas) {
    // Una OC hija de un reparto no es otro pedido: es parte del mismo.
    if (!o.op_padre_id && en(o.created_at)) r.pedidos += 1;
    if (o.estado === 'oc_creada' && en(o.oc_creada_en ?? o.created_at)) r.porAprobar += 1;
    if ((o.estado === 'oc_aprobada' || o.estado === 'confirmada_metodo') && en(o.oc_aprobada_en ?? o.aprobada_en ?? o.created_at)) r.porPagar += 1;
    if (o.pagada_en && !SIN_PAGO_VALIDO.has(o.estado) && en(o.pagada_en)) r.pagadas += 1;
  }
  return r;
}
