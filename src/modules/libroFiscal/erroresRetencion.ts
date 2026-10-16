/* ============================================================
   Golden Touch · Libro fiscal · Errores de la base, en texto de pantalla

   Las funciones de la base (V2, V3, VF) rechazan con un prefijo estable
   RET_* en el mensaje. Aquí se traduce cada código a un texto neutro; si el
   código no está en la lista, se muestra el mensaje de la base tal cual
   (BD ya lo redacta para la pantalla). Pieza pura, sin base de datos.
   ============================================================ */

const TEXTOS: Record<string, string> = {
  RET_FACTURA_SIN_LINEAS: 'La factura necesita al menos una línea de impuesto.',
  RET_FACTURA_ROL: 'Falta indicar quién retuvo (la empresa o el cliente).',
  RET_FACTURA_DOC: 'Falta el documento de origen (OC, compra o servicio) de la factura.',
  RET_FACTURA_DECLARADA: 'La factura tiene líneas ya declaradas: solo se puede cambiar la nota.',
  RET_DOCUMENTO_TIPO: 'El documento debe ser una factura, una nota de débito o una nota de crédito.',
  RET_DOCUMENTO_AFECTADO: 'Una nota de débito o de crédito lleva el N° de la factura que ajusta.',
  RET_LINEA_TIPO: 'Una línea tiene un impuesto que no se reconoce.',
  RET_MONTO_NEGATIVO: 'El monto retenido no puede ser negativo.',
  RET_CERO_SIN_MOTIVO: 'Una retención en 0 se registra solo con su motivo.',
  RET_NUMERO_FALTA: 'Esta serie se numera a mano: escribe el número del comprobante antes de registrar.',
  RET_NUMERO_USADO: 'Ese número de comprobante ya está usado en la serie.',
  RET_NUMERO_FORMATO: 'El número del comprobante no tiene el formato de la serie (el de IVA lleva 14 dígitos: AAAAMM + 8).',
  RET_NUMERO_NO_ES_EL_ULTIMO: 'Solo se puede cambiar el número de la última retención de su serie.',
  RET_NUMERO_NO_EDITABLE: 'El número no se puede cambiar: la retención está declarada o anulada.',
  RET_NUMERO_NO_SE_QUITA: 'El número de un comprobante emitido no se puede quitar.',
  RET_SERIE_NO_NUMERA: 'Ese impuesto no lleva número propio en su serie.',
  RET_SERIE_LLENA: 'La serie de ese impuesto llegó a su último número: revisa la serie en Parámetros.',
  RET_PERIODO_INVALIDO: 'El período de la retención no es válido.',
  RET_PERIODO_DECLARADO: 'El período ya está declarado: no se puede registrar ni mover una retención en él. Reábrelo primero.',
  RET_PERIODO_YA_DECLARADO: 'Ese período ya estaba declarado.',
  RET_PERIODO_NO_DECLARADO: 'Ese período no está declarado: no hay nada que reabrir.',
  RET_PERIODO_NO_EXISTE: 'Ese período no existe. Genera los períodos del año primero.',
  RET_PERIODO_DECLARA_DECLARADO: 'No se puede cambiar quién declara un período ya declarado.',
  RET_PERIODO_SOLO_POR_FUNCION: 'El estado del período solo se cambia con «Declarar» o «Reabrir».',
  RET_MOTIVO_OBLIGATORIO: 'Indica el motivo del cambio.',
  RET_SIN_PERMISO: 'No tienes permiso para esta operación en Retenciones.',
};

/** El código RET_* que trae un mensaje de la base, o null. */
export function codigoRet(mensaje: string | null | undefined): string | null {
  const m = String(mensaje ?? '').match(/\bRET_[A-Z_]+\b/);
  return m ? m[0] : null;
}

/** Un error de Supabase/PostgREST → un Error con texto de pantalla. */
export function errorRetencion(e: { code?: string; message?: string } | null | undefined, porDefecto = 'No se pudo completar la operación.'): Error {
  const code = e?.code ?? '';
  const ret = codigoRet(e?.message);
  if (ret && TEXTOS[ret]) return new Error(TEXTOS[ret]);
  if (code === '42501') return new Error(TEXTOS.RET_SIN_PERMISO);
  if (code === '23514') {
    return new Error('La empresa no puede practicar esa retención con su régimen (revisa agente de IVA / contribuyente especial en Parámetros).');
  }
  if (code === '23505') return new Error(TEXTOS.RET_NUMERO_USADO);
  if (e instanceof Error) return e;
  return new Error(e?.message || porDefecto);
}
