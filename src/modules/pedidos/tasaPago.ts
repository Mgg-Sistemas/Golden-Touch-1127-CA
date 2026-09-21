/* ============================================================
   Golden Touch · Directos · La TASA CON LA QUE TESORERÍA PAGA

   Pedido del usuario (21/09/2026): que a las compras y servicios directos se
   les pueda ajustar la tasa de pago desde Tesorería.

   POR QUÉ HACÍA FALTA. La factura la monta el analista con la tasa del día en
   que la carga (`tasa_conversion`). Tesorería paga después —a veces días
   después— y con otra tasa. Esa tasa segunda se usaba en pantalla para saber
   cuánto sacar de la caja, pero no quedaba escrita: la ficha y el PDF seguían
   mostrando la del analista, y nadie podía decir a qué tasa se pagó de verdad.

   Acá vive la aritmética de esa conversión, sin base ni React, para poder
   probarla: qué monto sale de la billetera y cuándo falta la tasa.
   ============================================================ */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Las monedas que el sistema trata como dólar (el USDT se paga 1:1 con el $). */
const ES_DOLAR = new Set(['USD', 'USDT']);

const esDolar = (m: string | null | undefined) => ES_DOLAR.has(String(m ?? '').toUpperCase());
const esBs = (m: string | null | undefined) => String(m ?? '').toUpperCase() === 'BS';

/**
 * ¿Hay que convertir para pagar este documento desde esa billetera? Solo cuando
 * una punta es Bs y la otra dólar: dentro del mismo grupo el monto sale igual.
 */
export function requiereTasa(monedaDoc: string | null | undefined, monedaCaja: string | null | undefined): boolean {
  if (esDolar(monedaDoc) && esDolar(monedaCaja)) return false;
  if (esBs(monedaDoc) && esBs(monedaCaja)) return false;
  return true;
}

/**
 * Cuánto sale de la billetera para pagar `monto` del documento. Devuelve 0 si
 * hace falta una tasa y no la hay: mejor que el pago no arranque a que salga
 * un monto inventado de la caja.
 */
export function convertirConTasa(
  monto: number,
  monedaDoc: string | null | undefined,
  monedaCaja: string | null | undefined,
  tasa: number,
): number {
  const m = r2(monto);
  if (m <= 0) return 0;
  if (!requiereTasa(monedaDoc, monedaCaja)) return m;
  const t = Number(tasa) || 0;
  if (t <= 0) return 0;
  if (esDolar(monedaDoc) && esBs(monedaCaja)) return r2(m * t);
  if (esBs(monedaDoc) && esDolar(monedaCaja)) return r2(m / t);
  // Cualquier otro par (COP, por ejemplo) no se convierte con la tasa BCV.
  return 0;
}

/** Por qué no se puede pagar así, dicho como se le muestra al usuario. `null` si está bien. */
export function errorTasaPago(
  monedaDoc: string | null | undefined,
  monedaCaja: string | null | undefined,
  tasa: number,
): string | null {
  if (!requiereTasa(monedaDoc, monedaCaja)) return null;
  const par = (esDolar(monedaDoc) && esBs(monedaCaja)) || (esBs(monedaDoc) && esDolar(monedaCaja));
  if (!par) {
    return `No se puede pagar un documento en ${monedaDoc ?? '—'} con una billetera en ${monedaCaja ?? '—'}: `
      + 'la tasa BCV solo convierte entre bolívares y dólares.';
  }
  if (!(Number(tasa) > 0)) return 'Indicá la tasa de pago (Bs por $) para convertir el monto a la moneda de la billetera.';
  return null;
}

/** Cómo se lee la tasa de pago en una ficha. Vacío si no hay tasa que mostrar. */
export function textoTasaPago(tasaPago: number | null | undefined, tasaMontaje: number | null | undefined): string {
  const p = Number(tasaPago) || 0;
  if (p <= 0) return '';
  const m = Number(tasaMontaje) || 0;
  const n = p.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (m > 0 && Math.abs(m - p) > 0.009) {
    const nm = m.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n} Bs/$ al pagar (se montó a ${nm})`;
  }
  return `${n} Bs/$`;
}
