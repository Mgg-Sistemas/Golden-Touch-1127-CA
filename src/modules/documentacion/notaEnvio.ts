/* ============================================================
   Golden Touch · Documentación · Reglas de la nota de envío

   Funciones puras (sin base ni pantalla) que comparten el formulario,
   el histórico y el PDF: cómo se escribe el correlativo, qué renglones
   cuentan y cuánto suma la nota. El correlativo lo asigna la BASE
   (secuencia `envios_documentacion_numero_seq`): aquí solo se le da formato.
   ============================================================ */

export interface RenglonEnvio {
  descripcion: string;
  cantidad: number | null;
}

export type EstadoEnvio = 'emitido' | 'recibido' | 'anulado';

export const ESTADO_ENVIO_LABEL: Record<EstadoEnvio, string> = {
  emitido: 'Enviada',
  recibido: 'Recibida conforme',
  anulado: 'Anulada',
};

/** N° de la nota con 4 dígitos, como en el formato impreso: 1 → «0001». */
export function numeroEnvio(n: number | null | undefined): string {
  const v = Math.max(0, Math.trunc(Number(n) || 0));
  return String(v).padStart(4, '0');
}

/** Renglones que van a la nota: con descripción. La cantidad vacía se guarda como null. */
export function renglonesValidos(items: RenglonEnvio[]): RenglonEnvio[] {
  return items
    .map((r) => ({
      descripcion: (r.descripcion ?? '').trim(),
      cantidad: r.cantidad == null || Number.isNaN(Number(r.cantidad)) ? null : Number(r.cantidad),
    }))
    .filter((r) => r.descripcion.length > 0);
}

/** Suma de cantidades (los renglones sin cantidad no suman). */
export function totalRenglones(items: RenglonEnvio[]): number {
  return renglonesValidos(items).reduce((a, r) => a + (r.cantidad ?? 0), 0);
}

/** Texto de cantidad para tabla/PDF: enteros sin decimales, el resto con coma. */
export function cantidadTexto(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toLocaleString('es-VE', { maximumFractionDigits: 2 });
}
