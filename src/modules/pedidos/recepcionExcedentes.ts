export function importeRecepcionComprada(items: { cantidad: number; precio: number; cantidad_recibida?: number | null }[]): number {
  return Math.round(items.reduce((total, i) => total + Math.max(0, Math.min(Number(i.cantidad_recibida) || 0, Number(i.cantidad))) * Number(i.precio), 0) * 100) / 100;
}
