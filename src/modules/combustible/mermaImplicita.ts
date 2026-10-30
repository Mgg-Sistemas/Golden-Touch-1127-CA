/* ============================================================
   Golden Touch · Combustible · Merma Implícita por Movimiento

   REGLA DE NEGOCIO:
   Cada movimiento de combustible (surtido a equipos, traslados, etc.)
   conlleva una merma implícita o tolerancia técnica por manipulación,
   mangueras, goteo o evaporación.

   Este margen (% configurable, por defecto 0.5%) NO se descuenta
   directamente ni altera los litros del movimiento registrado.
   ÚNICAMENTE se calcula y se exhibe como "Merma Sugerida" al momento
   de realizar un movimiento de tipo MERMA en el tanque.

   Para evitar totales a la deriva, la merma sugerida se respalda
   con la lista detallada de movimientos que la fueron originando
   desde el último corte/merma registrada.
   ============================================================ */

import type { MovimientoTanque, TipoMovTanque } from '@/shared/lib/types';

/** Margen de merma implícita por defecto: 0.5% del volumen del movimiento. */
export const DEFAULT_MERMA_IMPLICITA_PCT = 0.5;

export interface ItemMovimientoMermaImplicita {
  id: string;
  fecha: string;
  hora?: string | null;
  tipo: TipoMovTanque;
  equipo?: string | null;
  autorizado_por?: string | null;
  ubicacion?: string | null;
  /** Litros movidos en esta operación */
  litros: number;
  /** Porcentaje de merma implícita aplicado (ej. 0.5) */
  pctAplicado: number;
  /** Litros de merma implícita calculados para este movimiento */
  mermaLitros: number;
  /** Saldo acumulado progresivo de la merma sugerida */
  acumulado: number;
  /** Si fue una salida normal o un ajuste/sobrante */
  naturaleza: 'salida' | 'traslado' | 'entrada' | 'retorno';
}

export interface ResumenMermaImplicita {
  /** Total de litros de merma sugeridos (redondeado a 2 decimales) */
  totalSugerido: number;
  /** Porcentaje utilizado en el cálculo */
  pctUtilizado: number;
  /** Suma de litros de movimientos analizados */
  totalLitrosBase: number;
  /** Cantidad de movimientos que originaron la merma */
  cantidadMovimientos: number;
  /** Fecha del último movimiento de merma previo (o null si es desde el inicio) */
  fechaUltimaMermaPrevia: string | null;
  /** Lista cronológica respaldada de cada movimiento causante */
  items: ItemMovimientoMermaImplicita[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Ordena movimientos cronológicamente ascendente (fecha, hora, orden, created_at).
 */
export function ordenarMovimientosCronologico(movs: MovimientoTanque[]): MovimientoTanque[] {
  return [...movs].sort((a, b) => {
    const fA = a.fecha || '';
    const fB = b.fecha || '';
    if (fA !== fB) return fA.localeCompare(fB);
    const hA = a.hora || '';
    const hB = b.hora || '';
    if (hA !== hB) return hA.localeCompare(hB);
    if ((a.orden ?? 0) !== (b.orden ?? 0)) return (a.orden ?? 0) - (b.orden ?? 0);
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
}

/**
 * Calcula la merma implícita sugerida para un tanque a partir de su historial
 * de movimientos, considerando los despachos ocurridos desde la última merma asentada.
 */
export function calcularMermaImplicitaTanque(args: {
  movimientos: MovimientoTanque[];
  porcentaje?: number | null;
  /** Si es true (por defecto), solo toma los movimientos posteriores a la última merma registrada */
  desdeUltimaMerma?: boolean;
  /** Tipos de movimientos a considerar. Por defecto salidas directas y traslados. */
  tiposIncluidos?: TipoMovTanque[];
}): ResumenMermaImplicita {
  const pct = Number.isFinite(Number(args.porcentaje)) && Number(args.porcentaje)! > 0
    ? Number(args.porcentaje)
    : DEFAULT_MERMA_IMPLICITA_PCT;

  const desdeUltima = args.desdeUltimaMerma ?? true;
  const tipos = args.tiposIncluidos ?? ['uso', 'traslado'];

  if (!args.movimientos || !args.movimientos.length) {
    return {
      totalSugerido: 0,
      pctUtilizado: pct,
      totalLitrosBase: 0,
      cantidadMovimientos: 0,
      fechaUltimaMermaPrevia: null,
      items: [],
    };
  }

  // Ordenamos cronológicamente
  const ordenados = ordenarMovimientosCronologico(args.movimientos);

  // Ubicar la última merma registrada en el tanque
  let corteIndex = -1;
  let fechaUltimaMerma: string | null = null;

  if (desdeUltima) {
    for (let i = ordenados.length - 1; i >= 0; i--) {
      if (ordenados[i].tipo === 'merma') {
        corteIndex = i;
        fechaUltimaMerma = ordenados[i].fecha || null;
        break;
      }
    }
  }

  // Solo consideramos los movimientos posteriores a la última merma
  const candidatos = corteIndex >= 0 ? ordenados.slice(corteIndex + 1) : ordenados;

  const items: ItemMovimientoMermaImplicita[] = [];
  let acumulado = 0;
  let totalLitrosBase = 0;

  for (const m of candidatos) {
    // Si es otra merma, la ignoramos en el cálculo de base
    if (m.tipo === 'merma') continue;

    // Solo incluimos los tipos seleccionados (por defecto uso y traslado)
    if (!tipos.includes(m.tipo)) continue;

    const litrosMov = Math.abs(Number(m.litros) || 0);
    if (litrosMov <= 0) continue;

    const mermaItem = r2(litrosMov * (pct / 100));
    acumulado = r2(acumulado + mermaItem);
    totalLitrosBase = r2(totalLitrosBase + litrosMov);

    items.push({
      id: m.id,
      fecha: m.fecha,
      hora: m.hora,
      tipo: m.tipo,
      equipo: m.equipo,
      autorizado_por: m.autorizado_por,
      ubicacion: m.ubicacion,
      litros: litrosMov,
      pctAplicado: pct,
      mermaLitros: mermaItem,
      acumulado,
      naturaleza: m.tipo === 'traslado' ? 'traslado' : 'salida',
    });
  }

  return {
    totalSugerido: acumulado,
    pctUtilizado: pct,
    totalLitrosBase,
    cantidadMovimientos: items.length,
    fechaUltimaMermaPrevia: fechaUltimaMerma,
    items,
  };
}

/**
 * Genera el texto explicativo para el campo observación de la merma.
 */
export function generarObservacionMermaImplicita(resumen: ResumenMermaImplicita): string {
  const pctStr = resumen.pctUtilizado.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  const litrosStr = resumen.totalLitrosBase.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  const base = `${pctStr}% merma implícita sugerida sobre ${litrosStr} L (${resumen.cantidadMovimientos} movimientos)`;
  if (resumen.fechaUltimaMermaPrevia) {
    return `${base} desde el último corte del ${resumen.fechaUltimaMermaPrevia}`;
  }
  return base;
}
