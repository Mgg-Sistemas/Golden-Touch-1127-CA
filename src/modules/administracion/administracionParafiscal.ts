/* ============================================================================
   Golden Touch · Administración · parafiscales (cálculo puro)
   FAOV/BANAVIH (Gaceta Extra 6.805, art. 98): la multa = FACTOR × el tipo de
   cambio de referencia de MAYOR valor del BCV, según el tamaño de la nómina:
     · ≤ 50 trabajadores  → 165
     · 51–100 trabajadores → 330
     · > 100 trabajadores  → 1.000
   El total sale en Bs (factor × tasa). Sin React, determinista.
   ============================================================================ */

export type NivelNomina = 'hasta50' | 'hasta100' | 'mas100';

export interface TierFaov {
  nivel: NivelNomina;
  factor: number;
  label: string;
}

export const FAOV_TIERS: TierFaov[] = [
  { nivel: 'hasta50', factor: 165, label: 'Nómina ≤ 50 trabajadores' },
  { nivel: 'hasta100', factor: 330, label: 'Nómina 51–100 trabajadores' },
  { nivel: 'mas100', factor: 1000, label: 'Nómina > 100 trabajadores' },
];

/** Tramo (y factor) según el número de trabajadores de la nómina. */
export function tierPorTrabajadores(n: number): TierFaov {
  const t = Math.max(0, Math.trunc(Number(n) || 0));
  if (t <= 50) return FAOV_TIERS[0];
  if (t <= 100) return FAOV_TIERS[1];
  return FAOV_TIERS[2];
}

/** Total a pagar del FAOV = factor × tasa de referencia (en Bs), a 2 decimales. */
export function calcularFaov(factor: number, tasaReferencia: number): number {
  const f = Number(factor) || 0;
  const t = Number(tasaReferencia) || 0;
  return Math.round(f * t * 100) / 100;
}
