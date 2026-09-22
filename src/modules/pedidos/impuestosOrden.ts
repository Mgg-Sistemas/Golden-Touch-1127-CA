/* ============================================================
   Golden Touch · Pedidos · Impuestos de una orden (cálculo puro)

   EL PROBLEMA QUE RESUELVE. El IVA y el IGTF se guardan como MONTO absoluto
   (así lo define la oferta: el % es referencia, el monto manda). Eso está bien
   mientras la base no se mueva — pero cuando se edita la orden y cambia una
   cantidad o un precio, la base cambia y el monto guardado queda viejo.

   El caso real (SP-2026-0194): la OC se armó con 1 unidad a $110 → IVA 16% =
   $17,60. Después se corrigió a 14 unidades → base $1.540, pero el IVA siguió
   en $17,60 y el total quedó en $1.557,60 cuando debía ser $1.786,40. La
   pantalla mostraba renglones que sumaban una cosa y un total que decía otra.

   LA REGLA. Si hay PORCENTAJE, manda el porcentaje: el monto se recalcula
   sobre la base nueva. Si el monto se había escrito A MANO (sin %), se escala
   en la misma proporción que la base, que es lo más fiel a la intención.

   Y el IGTF se calcula sobre BASE + IVA, que es lo que realmente se paga en
   divisa. Así lo arma la oferta, que es la fuente de estos números.
   ============================================================ */

export interface ImpuestosOrden {
  ivaAplicado: boolean;
  /** % de referencia. Si es > 0, manda sobre el monto guardado. */
  ivaPct: number;
  ivaMonto: number;
  igtfAplicado: boolean;
  igtfPct: number;
  igtfMonto: number;
}

export interface ImpuestosRecompuestos {
  ivaMonto: number;
  igtfMonto: number;
  /** IVA + IGTF, que es lo que se suma a la base. */
  impuestos: number;
  /** base nueva + impuestos. */
  total: number;
}

const r2 = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

const noNegativo = (v: number): number => (v > 0 ? v : 0);

/** El % acotado a algo que tenga sentido como alícuota. */
const pct = (v: unknown): number => {
  const n = r2(v);
  return n > 0 ? Math.min(100, n) : 0;
};

/**
 * Recalcula el IVA y el IGTF cuando la base de la orden cambió, y devuelve
 * también el total ya compuesto.
 *
 * `basePrev` y `baseNueva` son bases NETAS (después del descuento y SIN
 * impuestos). Si no cambió nada, devuelve exactamente lo que había.
 */
export function recomponerImpuestos(
  basePrev: number,
  baseNueva: number,
  prev: ImpuestosOrden,
): ImpuestosRecompuestos {
  const anterior = noNegativo(r2(basePrev));
  const nueva = noNegativo(r2(baseNueva));

  const ivaPrev = prev.ivaAplicado ? noNegativo(r2(prev.ivaMonto)) : 0;
  const igtfPrev = prev.igtfAplicado ? noNegativo(r2(prev.igtfMonto)) : 0;
  const ivaPct = pct(prev.ivaPct);
  const igtfPct = pct(prev.igtfPct);

  // Desde una base cero no hay proporción que aplicar: un monto escrito a mano
  // se conserva tal cual, para no borrar en silencio un impuesto que alguien
  // cargó. Con porcentaje no hace falta: se recalcula y listo.
  const escala = anterior > 0 ? nueva / anterior : 1;

  const ivaMonto = !prev.ivaAplicado ? 0
    : ivaPct > 0 ? r2((nueva * ivaPct) / 100)
    : r2(ivaPrev * escala);

  // El IGTF se paga sobre lo que efectivamente sale de la caja: base + IVA.
  const baseIgtfPrev = r2(anterior + ivaPrev);
  const baseIgtfNueva = r2(nueva + ivaMonto);
  const escalaIgtf = baseIgtfPrev > 0 ? baseIgtfNueva / baseIgtfPrev : 1;

  const igtfMonto = !prev.igtfAplicado ? 0
    : igtfPct > 0 ? r2((baseIgtfNueva * igtfPct) / 100)
    : r2(igtfPrev * escalaIgtf);

  const impuestos = r2(ivaMonto + igtfMonto);
  return { ivaMonto, igtfMonto, impuestos, total: r2(nueva + impuestos) };
}

/**
 * La base neta de una orden a partir de su total: total − IVA − IGTF.
 * Se usa para saber de dónde parte una edición, porque `total` ya trae los
 * impuestos sumados desde la oferta.
 */
export function baseNetaDesdeTotal(
  total: number | null | undefined,
  prev: Pick<ImpuestosOrden, 'ivaAplicado' | 'ivaMonto' | 'igtfAplicado' | 'igtfMonto'>,
): number {
  const ivaPrev = prev.ivaAplicado ? noNegativo(r2(prev.ivaMonto)) : 0;
  const igtfPrev = prev.igtfAplicado ? noNegativo(r2(prev.igtfMonto)) : 0;
  return noNegativo(r2((Number(total) || 0) - ivaPrev - igtfPrev));
}

/** Los impuestos de una orden tal como están guardados hoy (sin recalcular). */
export function impuestosDeOrden(o: {
  iva_aplicado?: boolean | null; iva_pct?: number | null; iva_monto?: number | null;
  igtf_aplicado?: boolean | null; igtf_pct?: number | null; igtf_monto?: number | null;
}): ImpuestosOrden {
  return {
    ivaAplicado: !!o.iva_aplicado,
    ivaPct: r2(o.iva_pct),
    ivaMonto: r2(o.iva_monto),
    igtfAplicado: !!o.igtf_aplicado,
    igtfPct: r2(o.igtf_pct),
    igtfMonto: r2(o.igtf_monto),
  };
}
