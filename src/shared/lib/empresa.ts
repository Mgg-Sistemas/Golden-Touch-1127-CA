/* ============================================================
   Golden Touch · Identidad de la empresa en los documentos

   RIF, correo y WhatsApp que salen impresos en constancias, planillas y
   carnets. Están aquí y en ningún otro lado a propósito: estaban escritos a
   mano en cada archivo que los dibujaba, así que cambiar el correo obligaba a
   ir a buscarlo a tres lugares y el que se olvidaba quedaba desfasado. Si
   mañana cambia cualquiera de estos datos, se edita este archivo y listo.
   ============================================================ */

/** Razón social tal como va en los documentos formales. */
export const EMPRESA_NOMBRE = 'GOLDEN TOUCH 1127, C.A.';

/** Domicilio fiscal (membrete de la nota de envío y documentos formales). */
export const EMPRESA_DOMICILIO = 'Calle Manzana 19 Casa Parcela N° 11 Urb. Villa Granada UD 208, Puerto Ordaz, Ciudad Guayana, Bolívar, Zona Postal 8050';

/** RIF fiscal, para el membrete de los documentos formales. */
export const EMPRESA_RIF = 'J-50129993-5';

/** Correo de contacto que va impreso en los documentos. */
export const EMPRESA_EMAIL = 'info@goldentouch1127.com';

/** WhatsApp de contacto que va impreso en los documentos. */
export const EMPRESA_WHATSAPP = '+58 424-9349731';

/** La línea de contacto tal como aparece en el membrete. */
export const EMPRESA_CONTACTO = `${EMPRESA_EMAIL}  ·  WhatsApp ${EMPRESA_WHATSAPP}`;

/* ───────── Las dos empresas del grupo (06/10/2026) ─────────
   RRHH lleva dos nóminas: GT (Golden Touch) y MTO, que es OTRA empresa:
   Minería Tin Oxide, C.A. Todo papel de una persona de la nómina MTO
   (carnet, ficha, constancia, hoja de ingreso, recibo, préstamos…) sale
   con el nombre, el RIF, el domicilio y el logo de MTO, no los de GT. */

export interface IdentidadEmpresa {
  clave: 'GT' | 'MTO';
  /** Razón social, como va en el membrete y en el texto de los documentos. */
  nombre: string;
  rif: string;
  domicilio: string;
  /** Ciudad de expedición por defecto de constancias y cartas. */
  ciudad: string;
  email: string;
  whatsapp: string;
  contacto: string;
  /** Logo horizontal de los PDF (archivo en `public/`). */
  logoPdf: string;
  /** Logo para pantalla y Excel (archivo en `public/`). */
  logoPantalla: string;
}

export const IDENTIDAD_GT: IdentidadEmpresa = {
  clave: 'GT',
  nombre: 'GOLDEN TOUCH 1127 C.A.',
  rif: EMPRESA_RIF,
  domicilio: EMPRESA_DOMICILIO,
  ciudad: 'Puerto Ordaz, Estado Bolívar',
  email: EMPRESA_EMAIL,
  whatsapp: EMPRESA_WHATSAPP,
  contacto: EMPRESA_CONTACTO,
  logoPdf: 'Logo Golden Touch.jpg',
  logoPantalla: 'LOGO.jpg',
};

/** Datos del RIF de MTO (SENIAT, actualizado el 20/08/2026). El contacto es el del grupo. */
export const IDENTIDAD_MTO: IdentidadEmpresa = {
  clave: 'MTO',
  nombre: 'MINERÍA TIN OXIDE, C.A.',
  rif: 'J-50319019-1',
  domicilio: 'Calle Urdaneta, Local Nro S/N, Sector Maturín, Upata, Bolívar, Zona Postal 8052',
  ciudad: 'Upata, Estado Bolívar',
  email: EMPRESA_EMAIL,
  whatsapp: EMPRESA_WHATSAPP,
  contacto: EMPRESA_CONTACTO,
  logoPdf: 'Logo MTO.png',
  logoPantalla: 'Logo MTO.png',
};

/** Identidad de la empresa de una nómina ('GT' | 'MTO'). Sin dato o desconocida → GT. */
export function identidadEmpresa(empresa?: string | null): IdentidadEmpresa {
  return empresa === 'MTO' ? IDENTIDAD_MTO : IDENTIDAD_GT;
}
