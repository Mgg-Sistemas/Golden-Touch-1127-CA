/* ============================================================
   Golden Touch · Retenciones · las cuentas, como las pide la ley venezolana

   Pedido del usuario (21/09/2026): que el módulo sea real. Lo que había
   guardaba cuatro números —base, porcentaje, monto y tipo— y con eso no se
   emite un comprobante ni se declara nada. Cada impuesto tiene su propia
   regla y ninguna es «base × porcentaje»:

   · IVA (Providencia SNAT/2015/0049). Se retiene sobre el IVA DE LA FACTURA,
     no sobre la base imponible. Es 75%, y 100% cuando la factura no cumple los
     requisitos, el RIF del proveedor no aparece o no está al día en el portal
     del SENIAT, el IVA facturado no coincide con el que corresponde, o se
     compran metales y piedras preciosas. El comprobante se numera
     AAAAMM + 8 dígitos correlativos y se entera por QUINCENA.

   · ISLR (Decreto 1808). Depende del CONCEPTO y de quién cobra: jurídica o
     natural, domiciliada o no. A la persona natural residente se le resta el
     SUSTRAENDO —83,3334 × UT × %/100, que es el mínimo anual exento repartido
     en doce meses— y no se le retiene nada por debajo de ese mínimo.

   · MUNICIPAL (ordenanza de actividades económicas) y ESTADAL (timbre fiscal):
     alícuota del municipio o estado donde se presta el servicio, sobre el pago
     sin IVA.

   · IGTF (Ley de IGTF). 3% de lo pagado en divisas. No es una retención sino
     una percepción, pero se lleva en el mismo libro porque se declara igual.

   QUIÉN RETIENE. Golden Touch NO es agente de retención: no está designada
   contribuyente especial para retener IVA. Lo que vive de verdad es lo
   contrario — sus CLIENTES le retienen y le entregan el comprobante, y ese
   papel es un ANTICIPO DE IMPUESTO que se descuenta en la declaración.
   Perderlo es pagar dos veces. Por eso el libro tiene dos roles y arranca en
   «sufrida» (nos la practicaron); «practicada» queda para el caso excepcional.
   Las cuentas son las mismas en los dos sentidos: lo que cambia es de qué lado
   está la empresa y de dónde sale el número del comprobante.

   Todo se declara en BOLÍVARES aunque la factura esté en dólares, así que cada
   cálculo sabe llevarse a Bs con la tasa del día del pago.

   Piezas puras: se prueban sin base de datos ni React.
   ============================================================ */

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const n = (v: unknown) => Number(v) || 0;

/* ───────── Tipos ───────── */

export type TipoRetencion = 'IVA' | 'ISLR' | 'MUNICIPAL' | 'ESTADAL' | 'IGTF';

/** De qué lado está la empresa en esta retención. */
export type RolRetencion = 'sufrida' | 'practicada';

export const ROL_LABEL: Record<RolRetencion, string> = {
  sufrida: 'Nos la practicaron',
  practicada: 'La practicamos',
};

/** Qué significa para la empresa, que es lo que interesa al leer el libro. */
export const ROL_AYUDA: Record<RolRetencion, string> = {
  sufrida: 'Anticipo de impuesto a favor de la empresa: se descuenta en la declaración.',
  practicada: 'Impuesto retenido a un tercero que la empresa debe enterar al fisco.',
};

export const TIPO_RETENCION_LABEL: Record<TipoRetencion, string> = {
  IVA: 'Retención de IVA',
  ISLR: 'Retención de ISLR',
  MUNICIPAL: 'Retención municipal',
  ESTADAL: 'Timbre fiscal (estadal)',
  IGTF: 'IGTF',
};

/** Etiqueta corta, para las columnas y los badges. */
export const TIPO_RETENCION_CORTO: Record<TipoRetencion, string> = {
  IVA: 'IVA', ISLR: 'ISLR', MUNICIPAL: 'MUNICIPAL', ESTADAL: 'ESTADAL', IGTF: 'IGTF',
};

/** Quién cobra. Define el porcentaje de ISLR y si lleva sustraendo. */
export type SujetoRetenido = 'PJD' | 'PJND' | 'PNR' | 'PNNR';

export const SUJETO_LABEL: Record<SujetoRetenido, string> = {
  PJD: 'Persona jurídica domiciliada',
  PJND: 'Persona jurídica NO domiciliada',
  PNR: 'Persona natural residente',
  PNNR: 'Persona natural NO residente',
};

/** Solo la persona natural residente lleva sustraendo y mínimo exento. */
export const llevaSustraendo = (s: SujetoRetenido): boolean => s === 'PNR';

/* ───────── 1) Retención de IVA ───────── */

/** Por qué se retiene el 100% en vez del 75%. */
export type MotivoIva100 =
  | 'factura_incompleta'
  | 'rif_no_inscrito'
  | 'iva_no_coincide'
  | 'no_declaro'
  | 'metales_preciosos';

export const MOTIVO_IVA_100: Record<MotivoIva100, string> = {
  factura_incompleta: 'La factura no cumple los requisitos formales',
  rif_no_inscrito: 'El RIF del proveedor no está inscrito en el portal del SENIAT',
  iva_no_coincide: 'El IVA facturado no se corresponde con el que aplica',
  no_declaro: 'El proveedor no declaró el período correspondiente',
  metales_preciosos: 'Compra de metales o piedras preciosas',
};

/** Los dos porcentajes que admite la providencia. Cualquier otro es un error de carga. */
export const PORCENTAJES_IVA = [75, 100] as const;

/**
 * El IVA de una factura a partir de su base imponible y la alícuota.
 * Se usa cuando el usuario carga la base y no el IVA ya calculado.
 */
export function ivaDeFactura(baseImponible: number, alicuota: number): number {
  return r2(Math.max(0, n(baseImponible)) * (Math.max(0, n(alicuota)) / 100));
}

/**
 * Lo que se le retiene al proveedor: un porcentaje del IVA DE LA FACTURA.
 * Este es el error clásico del que hay que cuidarse — retener el 75% de la
 * base imponible en vez del 75% del IVA multiplica la retención por seis.
 */
export function retencionIva(ivaFactura: number, porcentaje: number): number {
  const iva = Math.max(0, n(ivaFactura));
  const pct = Math.max(0, n(porcentaje));
  if (iva <= 0 || pct <= 0) return 0;
  return r2(iva * (pct / 100));
}

/** Por qué no se puede guardar esta retención de IVA; `null` si está bien. */
export function errorRetencionIva(input: {
  baseImponible: number; ivaFactura: number; porcentaje: number; facturaNro?: string | null;
}): string | null {
  if (n(input.baseImponible) <= 0) return 'Indicá la base imponible de la factura.';
  if (n(input.ivaFactura) <= 0) return 'Indicá el IVA de la factura: la retención se calcula sobre él, no sobre la base.';
  if (!PORCENTAJES_IVA.includes(n(input.porcentaje) as 75 | 100)) {
    return 'La retención de IVA solo puede ser 75% o 100% (Providencia SNAT/2015/0049).';
  }
  if (!String(input.facturaNro ?? '').trim()) return 'Indicá el número de la factura: el comprobante lo lleva.';
  return null;
}

/* ───────── 2) Retención de ISLR ───────── */

/** Un concepto del Decreto 1808 con su porcentaje según quién cobra. */
export interface ConceptoIslr {
  codigo: string;
  concepto: string;
  pjd: number | null;
  pjnd: number | null;
  pnr: number | null;
  pnnr: number | null;
  /** Porcentaje del pago sobre el que se aplica (el transporte internacional usa 10%). */
  base_pct: number;
}

/** El porcentaje que le toca a ese sujeto en ese concepto. 0 si el concepto no lo contempla. */
export function porcentajeIslr(concepto: ConceptoIslr | null | undefined, sujeto: SujetoRetenido): number {
  if (!concepto) return 0;
  const v = sujeto === 'PJD' ? concepto.pjd
    : sujeto === 'PJND' ? concepto.pjnd
      : sujeto === 'PNR' ? concepto.pnr
        : concepto.pnnr;
  return Math.max(0, n(v));
}

/**
 * El mínimo mensual por debajo del cual a la persona natural residente NO se le
 * retiene: 83,3334 unidades tributarias (las 1.000 UT anuales exentas ÷ 12).
 */
export function minimoPersonaNatural(unidadTributaria: number): number {
  return r2(83.3334 * Math.max(0, n(unidadTributaria)));
}

/**
 * El sustraendo: lo que se le resta a la retención de una persona natural
 * residente para no cobrarle sobre el mínimo exento.
 */
export function sustraendoIslr(porcentaje: number, unidadTributaria: number): number {
  const pct = Math.max(0, n(porcentaje));
  if (pct <= 0) return 0;
  return r2(83.3334 * Math.max(0, n(unidadTributaria)) * (pct / 100));
}

export interface ResultadoIslr {
  /** Sobre cuánto se aplica realmente el porcentaje (el `base_pct` del concepto). */
  baseAplicada: number;
  porcentaje: number;
  sustraendo: number;
  /** Lo que se retiene, ya sin el sustraendo y nunca negativo. */
  monto: number;
  /** Por qué no se retiene nada, cuando el resultado da cero. */
  aviso: string | null;
}

/**
 * La retención de ISLR de un pago. Para la persona natural residente se aplica
 * (pago × % − sustraendo) y no se retiene nada si el pago no llega al mínimo.
 * La base es el pago SIN IVA: el IVA no forma parte del enriquecimiento.
 */
export function calcularIslr(input: {
  pagoSinIva: number;
  concepto: ConceptoIslr | null | undefined;
  sujeto: SujetoRetenido;
  unidadTributaria: number;
  /** Para pisar el porcentaje del catálogo en un caso puntual. */
  porcentajeManual?: number | null;
}): ResultadoIslr {
  const pago = Math.max(0, n(input.pagoSinIva));
  const pctCatalogo = porcentajeIslr(input.concepto, input.sujeto);
  const porcentaje = n(input.porcentajeManual) > 0 ? n(input.porcentajeManual) : pctCatalogo;
  const basePct = Math.max(0, n(input.concepto?.base_pct) || 100);
  const baseAplicada = r2(pago * (basePct / 100));
  const vacio: ResultadoIslr = { baseAplicada, porcentaje, sustraendo: 0, monto: 0, aviso: null };

  if (pago <= 0) return { ...vacio, aviso: 'Indicá el monto del pago.' };
  if (porcentaje <= 0) {
    return { ...vacio, aviso: 'Ese concepto no prevé retención para este sujeto.' };
  }

  if (!llevaSustraendo(input.sujeto)) {
    return { ...vacio, monto: r2(baseAplicada * (porcentaje / 100)) };
  }

  // Persona natural residente: mínimo exento y sustraendo.
  const minimo = minimoPersonaNatural(input.unidadTributaria);
  if (minimo > 0 && baseAplicada <= minimo) {
    return { ...vacio, aviso: `No se retiene: el pago no supera el mínimo exento (${minimo.toFixed(2)}).` };
  }
  const sustraendo = sustraendoIslr(porcentaje, input.unidadTributaria);
  const monto = r2(baseAplicada * (porcentaje / 100) - sustraendo);
  // Red de seguridad: pasado el mínimo el resultado siempre es positivo, pero una
  // retención negativa devolvería dinero al fisco al revés, así que no se emite.
  if (monto <= 0) return { ...vacio, sustraendo, aviso: 'No se retiene: el sustraendo cubre la retención.' };
  return { baseAplicada, porcentaje, sustraendo, monto, aviso: null };
}

/* ───────── 3) Municipal, estadal e IGTF ───────── */

/**
 * Retención municipal (impuesto a las actividades económicas) o estadal
 * (timbre fiscal): alícuota plana sobre el pago sin IVA.
 */
export function retencionPorAlicuota(pagoSinIva: number, alicuota: number): number {
  const p = Math.max(0, n(pagoSinIva));
  const a = Math.max(0, n(alicuota));
  if (p <= 0 || a <= 0) return 0;
  return r2(p * (a / 100));
}

/**
 * IGTF: alícuota sobre lo PAGADO EN DIVISAS. No se calcula sobre la factura
 * sino sobre lo que efectivamente salió en moneda extranjera, porque el hecho
 * imponible es el pago, no la compra.
 */
export function calcularIgtf(pagadoEnDivisas: number, alicuota: number): number {
  return retencionPorAlicuota(pagadoEnDivisas, alicuota);
}

/* ───────── 4) Comprobante, quincena y plazos ───────── */

const soloDia = (v: string | null | undefined) => String(v ?? '').slice(0, 10);

/** El período fiscal AAAAMM de una fecha. */
export function periodoFiscal(fecha: string): string {
  const d = soloDia(fecha);
  return d.length >= 7 ? `${d.slice(0, 4)}${d.slice(5, 7)}` : '';
}

/**
 * El número de comprobante: AAAAMM + 8 dígitos correlativos, como exige la
 * providencia. El correlativo lo da la base, que es la única que puede
 * garantizar que dos usuarios no saquen el mismo.
 *
 * Solo hace falta cuando la empresa RETIENE. En una retención sufrida el número
 * lo trae el comprobante del cliente y se transcribe tal cual: inventarle uno
 * propio sería romper el enlace con el papel que respalda el anticipo.
 */
export function numeroComprobante(fecha: string, correlativo: number): string {
  const p = periodoFiscal(fecha);
  if (!p) return '';
  const c = Math.max(1, Math.trunc(n(correlativo)));
  return `${p}${String(c).padStart(8, '0')}`;
}

/** 1 = primera quincena (del 1 al 15), 2 = segunda (del 16 en adelante). */
export function quincena(fecha: string): 1 | 2 {
  const dia = Number(soloDia(fecha).slice(8, 10)) || 1;
  return dia <= 15 ? 1 : 2;
}

/** Cómo se lee un período: «1ra quincena de septiembre 2026». */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function etiquetaQuincena(fecha: string): string {
  const d = soloDia(fecha);
  if (d.length < 10) return '—';
  const mes = MESES[Number(d.slice(5, 7)) - 1] ?? '';
  return `${quincena(d) === 1 ? '1ra' : '2da'} quincena de ${mes} ${d.slice(0, 4)}`;
}

/**
 * Hasta cuándo hay tiempo de ENTREGAR el comprobante al proveedor: el de la
 * primera quincena, dentro de los 5 días continuos siguientes al 15; el de la
 * segunda, dentro de los 5 días continuos del mes siguiente.
 */
export function limiteEntregaComprobante(fecha: string): string {
  const d = soloDia(fecha);
  if (d.length < 10) return '';
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const base = quincena(d) === 1 ? new Date(Date.UTC(y, m - 1, 15)) : new Date(Date.UTC(y, m, 0));
  base.setUTCDate(base.getUTCDate() + 5);
  return base.toISOString().slice(0, 10);
}

/* ───────── 5) Bolívares ───────── */

/**
 * Lo retenido en bolívares, que es como se declara. Si la retención ya está en
 * Bs la tasa no hace falta; si está en divisas, sin tasa no hay equivalente y
 * se devuelve 0 en vez de inventar un número.
 */
export function enBolivares(monto: number, moneda: string | null | undefined, tasa: number): number {
  const m = n(monto);
  if (m === 0) return 0;
  if (String(moneda ?? '').toUpperCase() === 'BS') return r2(m);
  const t = n(tasa);
  return t > 0 ? r2(m * t) : 0;
}

/* ───────── 6) Resumen del libro ───────── */

/** Lo mínimo de una fila para poder totalizar el libro. */
export interface FilaLibro {
  rol: RolRetencion;
  tipo: TipoRetencion;
  estado: 'registrada' | 'declarada' | 'anulada';
  monto: number;
  moneda: string;
  monto_bs?: number | null;
  comprobante_nro?: string | null;
  comprobante_path?: string | null;
}

export interface ResumenLibro {
  porTipo: Map<TipoRetencion, { cantidad: number; bs: number }>;
  /** A favor: lo que nos retuvieron. Se descuenta del impuesto a pagar. */
  aFavorBs: number;
  /** Por enterar: lo que la empresa retuvo y todavía no declaró. */
  porEnterarBs: number;
  /** IGTF: no se recupera, es costo. */
  igtfBs: number;
  /** Filas sin número ni archivo del comprobante: sin papel no se puede descontar. */
  sinComprobante: number;
}

/**
 * Los totales del libro, en BOLÍVARES: mezclar bolívares con dólares daría un
 * número sin significado y la declaración se hace en bolívares. Las anuladas no
 * suman, y el IGTF se cuenta aparte porque no vuelve.
 */
export function resumirLibro(filas: FilaLibro[]): ResumenLibro {
  const porTipo = new Map<TipoRetencion, { cantidad: number; bs: number }>();
  let aFavorBs = 0;
  let porEnterarBs = 0;
  let igtfBs = 0;
  let sinComprobante = 0;

  for (const r of filas) {
    if (r.estado === 'anulada') continue;
    const bs = n(r.monto_bs) || (String(r.moneda ?? '').toUpperCase() === 'BS' ? n(r.monto) : 0);
    const acc = porTipo.get(r.tipo) ?? { cantidad: 0, bs: 0 };
    porTipo.set(r.tipo, { cantidad: acc.cantidad + 1, bs: r2(acc.bs + bs) });
    if (r.tipo === 'IGTF') igtfBs = r2(igtfBs + bs);
    else if (r.rol === 'sufrida') aFavorBs = r2(aFavorBs + bs);
    else if (r.estado === 'registrada') porEnterarBs = r2(porEnterarBs + bs);
    if (!r.comprobante_nro && !r.comprobante_path) sinComprobante += 1;
  }
  return { porTipo, aFavorBs, porEnterarBs, igtfBs, sinComprobante };
}

/* ───────── 7) Validación del RIF ─────────
   Vive en la librería compartida: el RIF no es un asunto de retenciones, lo
   usan también proveedores, ventas y la ficha del personal. Se reexporta para
   no cambiar quién lo importa desde acá. */
export { formatearRif, normalizarRif, rifValido } from '@/shared/lib/rif';

/* ───────── Qué puede retener la empresa ───────── */

/**
 * Impuestos que la empresa NO puede retener si el SENIAT no la designó
 * contribuyente especial.
 *
 * · IVA · La Providencia SNAT/2015/0049 nombra agentes de retención de IVA a
 *   los contribuyentes especiales. Quien no lo es, no retiene IVA: retenerlo
 *   sería quedarse con plata del proveedor que después nadie puede acreditar.
 * · IGTF · La Ley del IGTF pone la percepción en cabeza de los contribuyentes
 *   especiales. Golden Touch lo SUFRE cuando paga en divisas a un especial —y
 *   ahí es un costo—, pero no lo percibe.
 *
 * ISLR, MUNICIPAL y ESTADAL no están acá a propósito: el ISLR (Decreto 1808) lo
 * retiene cualquier persona jurídica que pague un concepto sujeto, y el
 * municipal/estadal sale de la ordenanza, no de la condición de especial.
 */
export const TIPOS_SOLO_CONTRIBUYENTE_ESPECIAL: readonly TipoRetencion[] = ['IVA', 'IGTF'];

/** ¿Puede la empresa practicar una retención de este impuesto? */
export function puedeRetenerLaEmpresa(tipo: TipoRetencion, esContribuyenteEspecial: boolean): boolean {
  if (esContribuyenteEspecial) return true;
  return !TIPOS_SOLO_CONTRIBUYENTE_ESPECIAL.includes(tipo);
}

/**
 * Por qué no puede, en palabras, o `null` si sí puede. Se explica en vez de
 * solo bloquear: quien carga el libro tiene que entender que no es un error del
 * sistema sino una condición de la empresa, y dónde se cambia si algún día el
 * SENIAT la designa.
 */
export function motivoNoPuedeRetener(
  tipo: TipoRetencion,
  esContribuyenteEspecial: boolean,
): string | null {
  if (puedeRetenerLaEmpresa(tipo, esContribuyenteEspecial)) return null;
  const norma = tipo === 'IVA'
    ? 'la Providencia SNAT/2015/0049 designa agentes de retención de IVA a los contribuyentes especiales'
    : 'la Ley del IGTF pone la percepción en cabeza de los contribuyentes especiales';
  return `${TIPO_RETENCION_LABEL[tipo]}: la empresa no puede retener este impuesto porque `
    + `no está designada contribuyente especial, y ${norma}. `
    + 'Si lo que pasó es que te lo retuvieron a vos, cambiá «¿Quién retuvo?» a «Nos la practicaron». '
    + 'Si el SENIAT designó a la empresa, marcá la casilla en Parámetros fiscales.';
}
