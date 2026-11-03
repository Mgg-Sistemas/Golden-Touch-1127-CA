/* ============================================================
   Golden Touch · Inventario · Resumen del reporte para WhatsApp
   (03/11/2026)

   La misma información del reporte (existencias o movimientos del período), en
   texto PUNTUAL para mandarla por el chat sin abrir el sistema del otro lado:
   un ítem por renglón con su cantidad/valor, y al final el total.

   CON emojis, igual que Tesorería y Combustible: un emoji de encabezado por
   ámbito, un marcador por renglón (📦 existencia · tipo de movimiento) y 💰 en
   el total, para escanear de un vistazo.

   Builder PURO sobre las filas ya normalizadas (FilaReporteInventario): no toca
   Supabase ni depende de la pantalla, así el formato se fija con un test propio.
   ============================================================ */
import { identidadEmpresa } from '@/shared/lib/empresa';
import type { AmbitoInventario, FilaReporteInventario, TipoMovInventario } from './inventarioMoldeable';

/** Emoji de encabezado por ámbito (uno distinto, de un vistazo). */
export const EMOJI_AMBITO: Record<AmbitoInventario, string> = {
  existencias: '📦',
  movimientos: '🔄',
};

/** Nombre corto de cada ámbito para el encabezado. */
const TITULO_AMBITO: Record<AmbitoInventario, string> = {
  existencias: 'Existencias',
  movimientos: 'Movimientos del período',
};

/** Marcador de cada renglón de movimiento según su tipo. */
export const EMOJI_TIPO: Record<TipoMovInventario, string> = {
  entrada: '🟢',
  salida: '🔴',
  consumo: '🍽️',
  traslado: '🔁',
  ajuste: '⚙️',
};

/** Tope de ítems listados: más allá, el mensaje dejaría de ser puntual. */
const LIMITE_ITEMS = 40;

/** Número con separador de miles VE (hasta 2 decimales), sin símbolo. */
function num(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Valor en $ con dos decimales. */
function money(n: number | null | undefined): string {
  return `$ ${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

/** Marcador del renglón según el ámbito/tipo. */
function marcador(f: FilaReporteInventario): string {
  if (f.ambito === 'movimientos' && f.tipo_mov) return EMOJI_TIPO[f.tipo_mov];
  return '📦';
}

/** Cantidad propia del renglón (stock en existencias, cantidad en movimientos). */
function cantidadFila(f: FilaReporteInventario): number {
  return f.ambito === 'movimientos' ? (f.cantidad ?? 0) : (f.stock ?? 0);
}

export interface OpcionesWhatsappInventario {
  ambito: AmbitoInventario;
  /** Rango de fechas (ámbito movimientos). En existencias es la foto a hoy. */
  desde?: string;
  hasta?: string;
  /** Muestra el valor en $ de cada renglón además de la cantidad. */
  mostrarValor?: boolean;
}

/**
 * Arma el aviso de WhatsApp para un ámbito del reporte de Inventario. Cada
 * renglón es un ítem con su cantidad (y opcionalmente su valor); el total es la
 * suma de cantidades y el valor consolidado en $.
 */
export function textoWhatsappInventario(filas: FilaReporteInventario[], opts: OpcionesWhatsappInventario): string {
  const mostrarValor = opts.mostrarValor !== false;
  const emp = identidadEmpresa('GT');

  const L: string[] = [];
  L.push(`${EMOJI_AMBITO[opts.ambito]} *Reporte de Inventario — ${TITULO_AMBITO[opts.ambito]}*`);
  if (opts.ambito === 'movimientos' && opts.desde && opts.hasta) {
    L.push(`_${emp.nombre} · ${fechaCorta(opts.desde)} al ${fechaCorta(opts.hasta)}_`);
  } else {
    L.push(`_${emp.nombre} · foto al ${fechaCorta(new Date().toISOString())}_`);
  }
  L.push('');

  if (!filas.length) {
    L.push('Sin registros en este ámbito. ✅');
    return L.join('\n');
  }

  filas.slice(0, LIMITE_ITEMS).forEach((f, i) => {
    const nombre = unaLinea(f.nombre) || unaLinea(f.categoria) || '—';
    const cant = `${num(cantidadFila(f))} ${unaLinea(f.unidad) || 'und'}`;
    const extra = mostrarValor ? ` · ${money(f.valor)}` : '';
    L.push(`${i + 1}. ${marcador(f)} ${nombre} — *${cant}*${extra}`);
  });
  if (filas.length > LIMITE_ITEMS) {
    L.push(`… (+${filas.length - LIMITE_ITEMS} ítem(s) más)`);
  }

  let totCantidad = 0;
  let totValor = 0;
  for (const f of filas) { totCantidad += cantidadFila(f); totValor += f.valor || 0; }

  const partes: string[] = [`${num(totCantidad)} und`];
  if (mostrarValor) partes.push(money(totValor));

  L.push('');
  L.push(`💰 *Total (${filas.length}):* ${partes.join(' · ')}`);
  return L.join('\n');
}
