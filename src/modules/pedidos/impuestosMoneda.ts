/* ============================================================
   Golden Touch · Compras → Tesorería · Moneda de pago de los impuestos (08/11/2026)

   Al indicar el método de pago de una OC, Compras marca si cada impuesto
   (IVA, IGTF, ISLR, ISAE) se paga en $ o en Bs.

     · $  (por defecto): todo igual que antes.
     · Bs: el impuesto sale SOLO en Tesorería, en un bloque «Pago de impuestos en
           Bs» con su monto en bolívares a la tasa BCV del día. NO sale en el
           mensaje de WhatsApp de la orden (ni sus renglones de retención).

   Qué cuenta en cada impuesto:
     IVA  → el IVA de la factura + la retención de IVA (si la hay)
     IGTF → el IGTF de la orden  + la retención de IGTF (si la hay)
     ISLR → la retención de ISLR
     ISAE → la retención municipal (ISAE)

   NO cambia montos: `ordenes.total` y el neto a pagar siguen siendo los mismos.
   Solo dice EN QUÉ MONEDA se paga cada impuesto y DÓNDE se muestra.

   Se guarda en `ordenes.impuestos_moneda` (jsonb) con solo los que van en Bs,
   p. ej. {"iva":"Bs","islr":"Bs"}; null = todos en $.
   ============================================================ */
import type { Orden } from '@/shared/lib/types';
import { leerRetencionesCompras, pctTexto, type CamposRetencionesCompras } from './retencionesCompras';

export const IMPUESTOS_PAGO = ['iva', 'igtf', 'islr', 'isae'] as const;
export type ImpuestoPago = (typeof IMPUESTOS_PAGO)[number];
export type MonedaImpuesto = 'USD' | 'Bs';
/** Solo los impuestos que van en Bs (los demás, en $). */
export type ImpuestosMoneda = Partial<Record<ImpuestoPago, 'Bs'>>;

export const IMPUESTO_LABEL: Record<ImpuestoPago, string> = {
  iva: 'IVA',
  igtf: 'IGTF',
  islr: 'ISLR',
  isae: 'ISAE',
};

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Campo nuevo de la OC; se lee sin tocar el tipo compartido `Orden`. */
export interface CampoImpuestosMoneda {
  impuestos_moneda?: ImpuestosMoneda | Record<string, unknown> | null;
}

/** Lo que se guarda: solo claves conocidas con 'Bs'; null si ninguna. */
export function normalizarImpuestosMoneda(
  input: Partial<Record<string, unknown>> | null | undefined,
  activos?: readonly ImpuestoPago[],
): ImpuestosMoneda | null {
  if (!input || typeof input !== 'object') return null;
  const out: ImpuestosMoneda = {};
  for (const t of IMPUESTOS_PAGO) {
    if (activos && !activos.includes(t)) continue;
    if (input[t] === 'Bs') out[t] = 'Bs';
  }
  return Object.keys(out).length ? out : null;
}

/** true si ese impuesto de la OC se paga en Bs. */
export function impuestoEnBs(o: CampoImpuestosMoneda | null | undefined, t: ImpuestoPago): boolean {
  const m = o?.impuestos_moneda;
  return !!m && typeof m === 'object' && (m as Record<string, unknown>)[t] === 'Bs';
}

/** Un renglón del bloque «Pago de impuestos en Bs». */
export interface LineaImpuestoBs {
  impuesto: ImpuestoPago;
  /** «IVA (16%)», «Retención ISLR (2%)»… */
  concepto: string;
  esRetencion: boolean;
  /** En la moneda de la OC. */
  monto: number;
  moneda: string;
  /** En bolívares (a la tasa si la OC es en $). null = sin tasa para convertir. */
  bs: number | null;
}

export interface ImpuestosEnBs {
  lineas: LineaImpuestoBs[];
  /** Suma en Bs de lo que se paga (impuestos de la factura). null si falta la tasa. */
  totalPagarBs: number | null;
  /** Suma en Bs de las retenciones (lo que se entera al SENIAT / Alcaldía). null si falta la tasa. */
  totalRetenidoBs: number | null;
}

type OrdenImp = Pick<Orden, 'comprobante_tipo' | 'retencion_momento' | 'total' | 'total_moneda' | 'iva_aplicado' | 'iva_pct' | 'iva_monto' | 'igtf_aplicado' | 'igtf_pct' | 'igtf_monto'>
  & CamposRetencionesCompras & CampoImpuestosMoneda;

/**
 * Los impuestos de la OC marcados «en Bs», con su monto en bolívares.
 * `tasaUsd` = Bs por 1 $ (BCV). Si la OC ya es en Bs no hace falta.
 */
export function impuestosEnBs(o: OrdenImp, tasaUsd?: number | null): ImpuestosEnBs {
  const moneda = o.total_moneda === 'Bs' ? 'Bs' : 'USD';
  const tasa = Number(tasaUsd) || 0;
  const aBs = (m: number): number | null => (moneda === 'Bs' ? r2(m) : tasa > 0 ? r2(m * tasa) : null);
  const lineas: LineaImpuestoBs[] = [];
  const push = (impuesto: ImpuestoPago, concepto: string, esRetencion: boolean, monto: number) => {
    const m = r2(monto);
    if (m <= 0) return;
    lineas.push({ impuesto, concepto, esRetencion, monto: m, moneda, bs: aBs(m) });
  };

  if (impuestoEnBs(o, 'iva') && o.iva_aplicado) push('iva', `IVA (${pctTexto(Number(o.iva_pct ?? 16))})`, false, Number(o.iva_monto) || 0);
  if (impuestoEnBs(o, 'igtf') && o.igtf_aplicado) push('igtf', `IGTF (${pctTexto(Number(o.igtf_pct ?? 3))})`, false, Number(o.igtf_monto) || 0);
  const ret = leerRetencionesCompras(o);
  if (ret) {
    for (const t of IMPUESTOS_PAGO) {
      if (!impuestoEnBs(o, t)) continue;
      const l = ret[t];
      if (l.monto > 0) push(t, `Retención ${IMPUESTO_LABEL[t]}${l.pct > 0 ? ` (${pctTexto(l.pct)})` : ''}`, true, l.monto);
    }
  }

  const suma = (ls: LineaImpuestoBs[]): number | null =>
    ls.some((l) => l.bs == null) ? null : r2(ls.reduce((a, l) => a + (l.bs ?? 0), 0));
  return {
    lineas,
    totalPagarBs: suma(lineas.filter((l) => !l.esRetencion)),
    totalRetenidoBs: suma(lineas.filter((l) => l.esRetencion)),
  };
}
