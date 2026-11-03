/* ============================================================
   Golden Touch · Tesorería · Resumen del reporte para WhatsApp
   (02/11/2026)

   La misma información del reporte (movimientos, pendientes por pagar o
   cuentas a crédito), en texto PUNTUAL y en TONO NEUTRO para mandarla por el
   chat sin abrir el sistema del otro lado: un ítem por renglón con su monto en
   la moneda propia, y al final un total consolidado en $ y Bs.

   SIN emojis y sin adornos, a propósito: es un aviso directo, no un informe.

   Builder PURO sobre las filas ya normalizadas (FilaReporteTesoreria): no toca
   Supabase ni depende de la pantalla, así el formato se fija con un test propio
   y un cambio accidental se nota aquí y no en el chat. No reemplaza al builder
   de Pedidos (textoPendientesPorPagarWhatsapp), que sigue vivo y aparte.
   ============================================================ */
import { identidadEmpresa } from '@/shared/lib/empresa';
import type { AmbitoTesoreria, FilaReporteTesoreria } from './reporteTesoreriaMoldeable';

/** Nombre corto de cada ámbito para el encabezado. */
const TITULO_AMBITO: Record<AmbitoTesoreria, string> = {
  movimientos: 'Movimientos de caja',
  por_pagar: 'Pendientes por pagar',
  creditos_cartera: 'Cuentas a crédito (cartera)',
};

/** Tope de ítems listados: más allá, el mensaje dejaría de ser puntual. */
const LIMITE_ITEMS = 40;

/** Número con separador de miles VE y dos decimales, sin símbolo. */
function num(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** dd/mm/aaaa a partir del ISO, sin depender de la zona horaria. */
function fechaCorta(iso: string): string {
  const [a, m, d] = (iso || '').slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : (iso || '').slice(0, 10);
}

/** Texto a una sola línea (en el chat un salto partiría el renglón). */
function unaLinea(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/** Quién/qué es la fila: proveedor o cliente si lo hay; si no, categoría; si no, concepto. */
function etiquetaFila(f: FilaReporteTesoreria): string {
  const prov = unaLinea(f.contraparte);
  if (prov && prov !== '—') return prov;
  return unaLinea(f.categoria) || unaLinea(f.concepto) || '—';
}

export interface OpcionesWhatsappTesoreria {
  ambito: AmbitoTesoreria;
  desde: string;
  hasta: string;
  /** Respetan los interruptores maestros de moneda del reporte (al menos uno activo). */
  mostrarUsd?: boolean;
  mostrarBs?: boolean;
}

/**
 * Arma el aviso de WhatsApp para un ámbito del reporte de Tesorería.
 * Cada renglón es un ítem con su monto en la moneda propia; el total es
 * consolidado y BRUTO (suma de los equivalentes de todas las filas en $ y Bs).
 */
export function textoWhatsappTesoreria(filas: FilaReporteTesoreria[], opts: OpcionesWhatsappTesoreria): string {
  const mostrarUsd = opts.mostrarUsd !== false;
  const mostrarBs = opts.mostrarBs !== false;
  const emp = identidadEmpresa('GT');

  const L: string[] = [];
  L.push(`${emp.nombre} — Reporte de Tesorería`);
  L.push(`${TITULO_AMBITO[opts.ambito]} · ${fechaCorta(opts.desde)} al ${fechaCorta(opts.hasta)}`);
  L.push('');

  if (!filas.length) {
    L.push('Sin registros en este ámbito.');
    return L.join('\n');
  }

  filas.slice(0, LIMITE_ITEMS).forEach((f, i) => {
    L.push(`${i + 1}. ${etiquetaFila(f)} — ${f.moneda_original} ${num(f.monto_original)}`);
  });
  if (filas.length > LIMITE_ITEMS) {
    L.push(`(+${filas.length - LIMITE_ITEMS} ítem(s) más)`);
  }

  // Total consolidado y bruto: suma de los equivalentes de TODAS las filas,
  // aunque mezclen monedas (USDT 1:1 con USD; Bs por la tasa aplicada en cada fila).
  let totUsd = 0;
  let totBs = 0;
  for (const f of filas) { totUsd += f.monto_usd || 0; totBs += f.monto_bs || 0; }
  const partes: string[] = [];
  if (mostrarUsd) partes.push(`$ ${num(totUsd)}`);
  if (mostrarBs) partes.push(`Bs ${num(totBs)}`);

  L.push('');
  L.push(`Total (${filas.length}): ${partes.join(' · ')}`);
  return L.join('\n');
}
