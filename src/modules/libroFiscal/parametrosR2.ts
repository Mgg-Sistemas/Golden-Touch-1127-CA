/* ============================================================
   Golden Touch · Retenciones · Impuestos y reglas: piezas puras de pantalla (R2)
   ============================================================ */
import { PERIODICIDADES, type CambioHistorial, type VersionImpuesto } from './impuestos.repository';

const etiqueta = <K extends string>(xs: { key: K; label: string }[], k: K) => xs.find((x) => x.key === k)?.label ?? k;

/** «Mensual · vence el 15 · entrega en 2 días hábiles». */
export function resumenVersion(v: VersionImpuesto | null): string {
  if (!v) return 'Sin versión';
  const partes = [etiqueta(PERIODICIDADES, v.periodicidad)];
  if (v.venceDia) partes.push(`vence el día ${v.venceDia}`);
  partes.push(`entrega en ${v.plazoEntregaDias} día${v.plazoEntregaDias === 1 ? '' : 's'}${v.plazoDiasHabiles ? ' hábiles' : ''}`);
  if (v.convive) partes.push(`convive con ${v.otroSistemaNombre ?? 'otro sistema'}`);
  return partes.join(' · ');
}

/** «: nombre, serie_inicial» — qué campos cambiaron en un cambio del historial. */
export function cambiosTexto(h: Pick<CambioHistorial, 'antes' | 'despues'>): string {
  if (!h.antes || !h.despues) return '';
  const ignorar = new Set(['created_at', 'id']);
  const campos = Object.keys(h.despues).filter((k) => !ignorar.has(k) && JSON.stringify(h.antes?.[k]) !== JSON.stringify(h.despues?.[k]));
  return campos.length ? ` · cambió: ${campos.join(', ')}` : '';
}
