/**
 * Pagar nómina en Tesorería: buscador y pago por lote (15/10/2026).
 * Lógica pura (sin base) para poder probarla: qué renglones se ven con el
 * buscador y cuánto sale cada uno en la moneda del saldo con que se paga.
 */
import type { NominaRenglon } from '@/shared/lib/types';
import { norm } from '@/shared/lib/texto';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Renglones que coinciden con lo buscado: cada palabra tiene que aparecer en el
 * nombre, la cédula, el cargo, el departamento o el código de la nómina, sin
 * importar acentos ni mayúsculas. Sin texto, todos.
 */
export function filtrarRenglonesNomina(rows: NominaRenglon[], buscar: string, cedulas: Record<string, string> = {}): NominaRenglon[] {
  const palabras = norm(buscar).split(/\s+/).filter(Boolean);
  if (!palabras.length) return rows;
  return rows.filter((r) => {
    const texto = norm([r.nombre, cedulas[r.personal_id ?? ''], r.cargo, r.departamento, r.periodo?.codigo].filter(Boolean).join(' '));
    return palabras.every((p) => texto.includes(p));
  });
}

/** Lo que se le paga a un renglón en la moneda elegida: el neto en $ o, en Bs, a la tasa. */
export function montoRenglonLote(r: NominaRenglon, moneda: string, tasa: number): number {
  const neto = r2(Number(r.neto_usd) || 0);
  return moneda === 'Bs' ? r2(neto * (Number(tasa) || 0)) : neto;
}

/** Total del lote en la moneda elegida (suma de lo que se paga a cada uno). */
export function totalLote(rows: NominaRenglon[], moneda: string, tasa: number): number {
  return r2(rows.reduce((a, r) => a + montoRenglonLote(r, moneda, tasa), 0));
}
