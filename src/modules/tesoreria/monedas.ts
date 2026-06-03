/* ============================================================
   Golden Touch · Tesorería · Catálogo de monedas (registro dinámico)
   Monedas base del sistema + extras registradas por el usuario
   (mismo patrón que las categorías de inventario: tabla `taxonomias`,
   scope 'tesoreria.moneda'). Permite agregar una moneda nueva al vuelo.
   ============================================================ */
import { listTaxonomia, addTaxonomia, invalidateTaxonomia } from '@/shared/lib/taxonomias';

/** Monedas base siempre disponibles. */
export const MONEDAS_BASE = ['Bs', 'USD', 'USDT', 'COP'] as const;

/** Símbolo/etiqueta para mostrar el monto de una moneda. */
export function simboloMoneda(m: string): string {
  return m === 'USD' ? '$' : m;
}

/** Lista de monedas: base + las registradas por el usuario (sin duplicar). */
export async function listMonedas(): Promise<string[]> {
  let extra: string[] = [];
  try { extra = await listTaxonomia('tesoreria.moneda'); } catch { /* sin conexión: solo base */ }
  return Array.from(new Set([...MONEDAS_BASE, ...extra.map((m) => m.trim()).filter(Boolean)]));
}

/** Registra una moneda nueva (idempotente). Devuelve el código normalizado. */
export async function addMoneda(code: string, actorEmail?: string): Promise<string | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  if ((MONEDAS_BASE as readonly string[]).includes(clean)) return clean;
  return addTaxonomia('tesoreria.moneda', clean, actorEmail);
}

export function invalidarMonedas(): void {
  invalidateTaxonomia('tesoreria.moneda');
}
