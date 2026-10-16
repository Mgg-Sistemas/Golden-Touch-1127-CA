import type { TipoImpuesto } from './retencionesCalculo';

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Un monto escrito a mano: «1.234,56», «1234,56» o «1234.56». Vacío es 0.
 * Lo que no se entiende devuelve null: nunca se convierte en 0 sin avisar.
 */
export function leerMonto(v: string): number | null {
  const s = String(v ?? '').replace(/\s/g, '');
  if (s === '') return 0;
  let normal: string | null = null;
  if (s.includes(',')) {
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s)) normal = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    normal = s.replace(/\./g, '');
  } else if (/^-?\d+(\.\d+)?$/.test(s)) {
    normal = s;
  }
  if (normal == null) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lo que falta para registrar una retención, o null si está todo. El N° de
 * factura es el fiscal (va al comprobante, al libro y a la relación), nunca el
 * código interno de la OC o la compra. El IGTF es una percepción por pago: no
 * lo pide. La fecha la piden todos: de ella salen el período y la quincena.
 */
export function faltaEnLaCarga(c: { tipo: TipoImpuesto; facturaNumero: string; facturaFecha: string }): string | null {
  if (c.tipo !== 'igtf' && !c.facturaNumero.trim()) {
    return 'N° de factura requerido (el número fiscal, no el código de la OC): figura en el comprobante y en el libro.';
  }
  if (!FECHA.test(c.facturaFecha.trim())) return 'Fecha de la factura requerida: determina el período y la quincena.';
  return null;
}
