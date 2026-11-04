/* ============================================================
   Golden Touch · Tesorería · Resumen del reporte para WhatsApp
   (02/11/2026)

   La misma información del reporte (movimientos, pendientes por pagar o
   cuentas a crédito), en texto PUNTUAL para mandarla por el chat sin abrir el
   sistema del otro lado: un ítem por renglón con su monto en la moneda propia,
   y al final un total consolidado en $ y Bs.

   CON emojis, igual que el resto del módulo (textoPendientesPorPagarWhatsapp)
   y Combustible: un emoji de encabezado por ámbito, un marcador por renglón
   según el tipo de flujo (egreso/ingreso/traslado) y 💰 en el total, para
   escanear de un vistazo dónde está cada cosa.

   Builder PURO sobre las filas ya normalizadas (FilaReporteTesoreria): no toca
   Supabase ni depende de la pantalla, así el formato se fija con un test propio
   y un cambio accidental se nota aquí y no en el chat. No reemplaza al builder
   de Pedidos (textoPendientesPorPagarWhatsapp), que sigue vivo y aparte.
   ============================================================ */
import { identidadEmpresa } from '@/shared/lib/empresa';
import type { AmbitoTesoreria, FilaReporteTesoreria, TipoFlujoTesoreria } from './reporteTesoreriaMoldeable';
import { esMonedaDivisa, type PreparacionPorPagar } from './pendientesPorPagar';

/** Monto en su moneda nativa para el chat (Bs 1.234,56 · $ 12,34 · USDT 5,00). */
function montoMonedaWsp(moneda: string, monto: number): string {
  const m = (moneda || '').toUpperCase();
  if (m === 'BS') return `Bs ${num(monto)}`;
  if (m === 'USD') return `$ ${num(monto)}`;
  return `${moneda} ${num(monto)}`;
}

/** Emoji de encabezado por ámbito (uno distinto, de un vistazo). */
const EMOJI_AMBITO: Record<AmbitoTesoreria, string> = {
  movimientos: '📊',
  por_pagar: '🧾',
  creditos_cartera: '🤝',
};

/** Nombre corto de cada ámbito para el encabezado. */
const TITULO_AMBITO: Record<AmbitoTesoreria, string> = {
  movimientos: 'Movimientos de caja',
  por_pagar: 'Pendientes por pagar',
  creditos_cartera: 'Cuentas a crédito (cartera)',
};

/** Marcador de cada renglón según el tipo de flujo: a dónde va o de dónde viene la plata. */
const EMOJI_FLUJO: Record<TipoFlujoTesoreria, string> = {
  egreso: '🔻',
  ingreso: '🔺',
  traslado: '🔁',
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
  /** «Por preparar» (solo por_pagar, si el toggle está encendido): totales nativos por moneda/método. */
  preparacion?: PreparacionPorPagar;
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
  L.push(`${EMOJI_AMBITO[opts.ambito]} *Reporte de Tesorería — ${TITULO_AMBITO[opts.ambito]}*`);
  L.push(`_${emp.nombre} · ${fechaCorta(opts.desde)} al ${fechaCorta(opts.hasta)}_`);
  L.push('');

  if (!filas.length) {
    L.push('Sin registros en este ámbito. ✅');
    return L.join('\n');
  }

  filas.slice(0, LIMITE_ITEMS).forEach((f, i) => {
    // Sin Bs en el reporte (04/11/2026): lo pagado en bolívares se muestra por su equivalente en $.
    const enBs = (f.moneda_original || '').toUpperCase() === 'BS';
    const monto = enBs && !mostrarBs ? `$ ${num(f.monto_usd || 0)}` : `${f.moneda_original} ${num(f.monto_original)}`;
    L.push(`${i + 1}. ${EMOJI_FLUJO[f.tipo_movimiento]} ${etiquetaFila(f)} — *${monto}*`);
  });
  if (filas.length > LIMITE_ITEMS) {
    L.push(`… (+${filas.length - LIMITE_ITEMS} ítem(s) más)`);
  }

  // «Por preparar» (solo por_pagar, con el toggle encendido): totales NATIVOS por moneda,
  // independientes (lo de divisa no se reconvierte a Bs ni viceversa) + desglose por método.
  const prep = opts.preparacion;
  if (opts.ambito === 'por_pagar' && prep &&
      (prep.totalesPorMoneda.length > 0 || prep.sinMetodo.nOrdenes > 0)) {
    L.push('');
    L.push('💵 *Por preparar (por moneda):*');
    for (const t of prep.totalesPorMoneda) {
      L.push(`• ${esMonedaDivisa(t.moneda) ? '💵' : '🪙'} *${montoMonedaWsp(t.moneda, t.monto)}*`);
    }
    if (prep.sinMetodo.nOrdenes > 0) {
      L.push(`• ⏳ _Sin método asignado (ref.):_ $ ${num(prep.sinMetodo.usd)}${mostrarBs ? ` · Bs ${num(prep.sinMetodo.bs)}` : ''}`);
    }
    if (prep.porMetodoMoneda.length > 0) {
      L.push('');
      L.push('*Detalle por método:*');
      for (const l of prep.porMetodoMoneda) {
        L.push(`• ${esMonedaDivisa(l.moneda) ? '💵' : '🪙'} ${unaLinea(l.metodoLabel)} (${l.moneda}): ${montoMonedaWsp(l.moneda, l.monto)}`);
      }
    }
    return L.join('\n');   // termina aquí: no se añade el total bruto reconvertido
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
  L.push(`💰 *Total (${filas.length}):* ${partes.join(' · ')}`);
  return L.join('\n');
}
