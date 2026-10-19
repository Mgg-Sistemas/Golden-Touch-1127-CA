/* ============================================================
   Golden Touch · Compras · Reporte por estado para WhatsApp
   El mismo reporte que el PDF, en texto con emojis para mandarlo por
   el chat: sirve para pedir/avisar lo que está pendiente sin abrir el
   sistema del otro lado.

   El formato es un acuerdo con quien lo lee en el teléfono: se fija
   con tests para que un cambio accidental se note aquí y no en el chat.
   ============================================================ */
import type { EstadoReporteCompras, RenglonReporteCompras } from './reporteCompras';
import { agruparReporteCompras } from './reporteCompras';
import type { Orden } from '@/shared/lib/types';

export interface OpcionesTextoReporteCompras {
  /** ISO del momento en que se arma; hoy si no se pasa. */
  generadoEn?: string;
}

/** Emoji de cada renglón (uno distinto por estado, de un vistazo). */
const EMOJI: Record<EstadoReporteCompras, string> = {
  oc_creada: '🕓',
  cuenta_abierta: '💳',
  confirmada_metodo: '🏦',
  oc_aprobada: '💵',
};

/** Número con separador de miles VE y dos decimales, sin símbolo. */
function num(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Monto en su moneda: el dólar va con el símbolo pegado, como se escribe en el chat. */
function monto(n: number | null | undefined, moneda: 'USD' | 'Bs'): string {
  return moneda === 'Bs' ? `Bs ${num(n)}` : `$${num(n)}`;
}

/** dd/mm/aaaa a partir del ISO, sin depender de la zona horaria. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso.slice(0, 10);
}

/** Suma de un conjunto, separando por moneda (no se mezclan $ y Bs). */
function sumaPorMoneda(filas: RenglonReporteCompras[]): string {
  const usd = filas.filter((f) => f.moneda === 'USD').reduce((a, f) => a + f.monto, 0);
  const bs = filas.filter((f) => f.moneda === 'Bs').reduce((a, f) => a + f.monto, 0);
  const partes: string[] = [];
  if (usd > 0) partes.push(monto(usd, 'USD'));
  if (bs > 0) partes.push(monto(bs, 'Bs'));
  return partes.join(' · ') || monto(0, 'USD');
}

/** Una línea del renglón: código, motivo (en una sola línea) y monto. */
function lineaRenglon(f: RenglonReporteCompras): string {
  // El motivo puede traer saltos de línea (notas): en WhatsApp partirían la viñeta.
  const motivo = f.motivo.replace(/\s+/g, ' ').trim() || '—';
  const esCredito = f.orden.estado === 'cuenta_abierta';
  return `• *${f.codigo}* — ${motivo} — ${monto(f.monto, f.moneda)}${esCredito ? ' _(saldo)_' : ''}`;
}

export function textoReporteComprasWhatsapp(
  ordenes: Orden[],
  op: OpcionesTextoReporteCompras = {},
): string {
  const generado = op.generadoEn ?? new Date().toISOString();
  const grupos = agruparReporteCompras(ordenes);
  const total = grupos.reduce((a, g) => a + g.filas.length, 0);

  const L: string[] = [];
  L.push('📋 *COMPRAS POR ESTADO*');
  L.push(`_GOLDEN TOUCH 1127 C.A. · ${fechaCorta(generado)}_`);

  if (!total) {
    L.push('');
    L.push('No hay órdenes de compra pendientes en este momento. ✅');
    return L.join('\n');
  }

  for (const g of grupos) {
    if (!g.filas.length) continue;
    L.push('');
    L.push(`${EMOJI[g.estado]} *${g.titulo} (${g.filas.length})*`);
    for (const f of g.filas) L.push(lineaRenglon(f));
    L.push(`   _Subtotal: ${sumaPorMoneda(g.filas)}_`);
  }

  const todas = grupos.flatMap((g) => g.filas);
  L.push('');
  L.push(`*TOTAL:* ${total} orden(es) · ${sumaPorMoneda(todas)}`);
  return L.join('\n');
}
