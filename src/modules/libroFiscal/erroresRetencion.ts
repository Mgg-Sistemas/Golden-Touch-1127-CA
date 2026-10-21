/* ============================================================
   Golden Touch · Libro fiscal · Errores de la base, en texto de pantalla

   Las funciones de la base (V2, V3, VF, R1) rechazan con un prefijo estable
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
  RET_NUMERO_USADO: 'Ese número de comprobante ya se dio en la serie: no se vuelve a dar, aunque se haya anulado o cambiado.',
  RET_NUMERO_FORMATO: 'El número del comprobante no tiene el formato de su serie: el de IVA lleva 14 dígitos (AAAAMM y 8 de la serie); el de ISLR, ISAE y estadal, 10 dígitos.',
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
  RET_ANIO_INVALIDO: 'El año tiene que estar entre 2020 y 2100.',
  RET_PERIODO_DECLARA_DECLARADO: 'No se puede cambiar quién declara un período ya declarado.',
  RET_PERIODO_SOLO_POR_FUNCION: 'El estado del período solo se cambia con «Declarar» o «Reabrir».',
  RET_MOTIVO_OBLIGATORIO: 'Indica el motivo del cambio.',
  RET_SIN_PERMISO: 'No tienes permiso para esta operación en Retenciones.',
  RET_PERFIL_DESDE: 'La versión nueva del perfil fiscal tiene que empezar después de la vigente.',
  RET_VERSION_DESDE: 'La versión nueva del impuesto tiene que empezar después de la vigente. Para corregir la vigente, usa «Corregir».',
  RET_SERIE_INICIAL: 'El primer número de la serie tiene que ser mayor que el último del otro sistema.',
  RET_SERIE_EN_USO: 'La serie de ese impuesto ya dio números: no cambia de formato.',
  RET_PARAMETRO_DESDE: 'El valor nuevo tiene que empezar después del vigente. Para corregir el vigente, usa «Corregir».',
  RET_PARAMETRO_AMBITO: 'Ese valor no va con ese impuesto: revisa si es general o de un impuesto.',
  RET_PARAMETRO_TIPO: 'El valor no es del tipo que lleva esa clave (número, texto o sí/no).',
  RET_TARIFA_DESDE: 'La versión nueva de la tarifa tiene que empezar después de la vigente.',
  RET_TARIFA_CERRADA: 'La versión está publicada: sus tramos no cambian. Haz una versión nueva.',
  RET_REGLA_NO_EDITABLE: 'La regla ya no está en prueba: para cambiarla, haz una versión nueva.',
  RET_REGLA_ESTADO: 'Ese cambio de estado no corresponde a la regla.',
  RET_REGLA_NO_EXISTE: 'Esa regla no existe.',
  RET_FOTO_NO_CAMBIA: 'La retención ya guarda la regla y la foto con que se calculó: no cambian.',
  RET_DECISION_MOTIVO: '«No aplica» lleva un motivo de ese impuesto.',
  RET_DECISION_DETALLE: 'Ese motivo pide un texto que lo explique.',
  RET_CLASIFICACION_DESDE: 'El valor nuevo del código tiene que empezar después del vigente. Para corregir el vigente, usa «Corregir».',
  RET_ORIGEN_UNO: 'El archivo o el enlace va en exactamente una orden, compra directa o servicio directo.',
  RET_ADJUNTO_REGISTRADO: 'Este archivo ya está registrado como factura en Retenciones: no se cambia ni se borra mientras su documento fiscal exista.',
  RET_ADJUNTO_CAMPO: 'De un archivo solo se cambian el nombre, el tipo y si es factura.',
  RET_ADJUNTO_NO_FACTURA: 'Ese archivo no está marcado como factura (es un pago, una solicitud u otro papel). Márcalo como factura en Compras si lo es.',
  RET_ADJUNTO_SIN_ORIGEN: 'Una factura fuera del sistema no lleva archivo de Compras: el archivo es de una orden, compra o servicio.',
  RET_ORIGEN_CON_DOCUMENTO: 'No se puede eliminar: tiene una factura registrada en Retenciones. Primero hay que borrar ese documento fiscal (solo si no tiene retenciones).',
  RET_ADJUNTO_ORIGEN: 'Ese archivo de factura es de otra orden, compra o servicio.',
  RET_DOCUMENTO_NO_LIBRE: 'Esta factura tiene retenciones (aunque estén anuladas), decisiones o notas que la afectan: no se borra.',
  RET_LICENCIA_TIPO: 'Ese tipo de licencia no está en el catálogo o está inactivo (Parámetros → Tipos de licencia).',
  RET_FORMATO_FORMA: 'El formato no tiene la forma esperada: textos y rótulos van como objeto ({…}) y columnas como lista ([…]).',
  RET_FORMATO_DESDE: 'La versión nueva del formato tiene que empezar después de la vigente.',
};

/**
 * Las reglas de forma y rango de la base (CHECK, por nombre de restricción): R9 y P03.
 * Un 23514 trae el nombre entre comillas; con él se dice qué dato no cumple.
 */
const RESTRICCIONES: Record<string, string> = {
  retencion_documentos_forma: 'El número y el control de la factura van de 1 a 30 caracteres, sin espacios al borde ni saltos de línea, y la fecha entre 2000 y 2100.',
  retenciones_forma: 'El número de factura, el de control, el de comprobante y el código del concepto van de 1 a 30 caracteres, sin espacios al borde ni saltos de línea.',
  retenciones_montos_no_negativos: 'Los montos de la retención (base, monto, sustraendo, IVA, exento, total) no pueden ser negativos.',
  retenciones_porcentajes: 'El porcentaje retenido y la alícuota del IVA van de 0 a 100.',
  retenciones_tasa_positiva: 'La tasa de cambio tiene que ser mayor que 0.',
  retenciones_valor_ut_positivo: 'El valor de la UT tiene que ser mayor que 0 (revisa la UT vigente en Parámetros → Valores).',
  retenciones_quincena: 'La quincena es 1 o 2.',
  retenciones_periodo_forma: 'El período va como AAAAMM (por ejemplo, 202610).',
  retenciones_fechas: 'La fecha de la retención y la de la factura van entre 2000 y 2100.',
  retenciones_moneda: 'La moneda es Bs o USD.',
  retencion_documentos_montos: 'Los montos de la factura no pueden ser negativos.',
  retencion_documentos_porcentajes: 'La alícuota del IVA de la factura va de 0 a 100.',
  retencion_documentos_tasa_positiva: 'La tasa de cambio de la factura tiene que ser mayor que 0.',
  retencion_documentos_moneda: 'La moneda de la factura es Bs o USD.',
  retencion_entes_rif_forma: 'El RIF del ente no es válido: letra V, E, J, P o G y 9 números (los guiones no cuentan).',
  retencion_ente_impuestos_desde_rango: 'La fecha «desde» va entre 2000 y 2100.',
  retencion_ente_logos_desde_rango: 'La fecha «desde» del logo va entre 2000 y 2100.',
  retencion_agente_imagenes_desde_rango: 'La fecha «desde» de la firma, el sello o el logo va entre 2000 y 2100.',
  retencion_contraparte_perfiles_licencia_vence_rango: 'El vencimiento de la licencia va entre 2000 y 2100.',
};

/** El texto de una restricción de forma o rango nombrada en el mensaje, o null. */
export function textoRestriccion(mensaje: string | null | undefined): string | null {
  const m = String(mensaje ?? '').match(/constraint "([a-z0-9_]+)"/i) ?? String(mensaje ?? '').match(/"([a-z0-9_]+)"\s*$/i);
  return m && RESTRICCIONES[m[1]] ? RESTRICCIONES[m[1]] : null;
}

/** Textos propios de una pantalla para los rechazos genéricos de Postgres. */
export interface TextosError {
  /** 23505: ya existe (nombre, fecha de versión, actividad repetida…). */
  unico?: string;
  /** 23514: no cumple una regla de la tabla. */
  regla?: string;
}

/** El código RET_* que trae un mensaje de la base, o null. */
export function codigoRet(mensaje: string | null | undefined): string | null {
  const m = String(mensaje ?? '').match(/\bRET_[A-Z_]+\b/);
  return m ? m[0] : null;
}

/** Un error de Supabase/PostgREST → un Error con texto de pantalla. */
export function errorRetencion(
  e: { code?: string; message?: string } | null | undefined,
  porDefecto = 'No se pudo completar la operación.',
  textos: TextosError = {},
): Error {
  const code = e?.code ?? '';
  const ret = codigoRet(e?.message);
  if (ret === 'RET_PERFIL_DESDE') {
    const fecha = String(e?.message ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
    return new Error(fecha ? `La versión nueva del perfil fiscal tiene que empezar después del ${fecha}, que es cuando empezó la vigente.` : TEXTOS.RET_PERFIL_DESDE);
  }
  if (ret === 'RET_VERSION_DESDE') {
    const fecha = String(e?.message ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
    if (fecha) return new Error(`La versión nueva tiene que empezar después del ${fecha}, que es cuando empezó la vigente. Para corregir la vigente, usa «Corregir».`);
  }
  if (ret === 'RET_FORMATO_DESDE') {
    const fecha = String(e?.message ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
    if (fecha) return new Error(`La versión nueva del formato tiene que empezar después del ${fecha}, que es cuando empezó la vigente. Para corregir la vigente, edítala.`);
  }
  if (ret === 'RET_PARAMETRO_DESDE') {
    const fecha = String(e?.message ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
    if (fecha) return new Error(`El valor nuevo tiene que empezar después del ${fecha}, que es cuando empezó el vigente. Para corregir el vigente, usa «Corregir».`);
  }
  if (ret === 'RET_CLASIFICACION_DESDE') {
    const fecha = String(e?.message ?? '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
    if (fecha) return new Error(`El valor nuevo del código tiene que empezar después del ${fecha}, que es cuando empezó el vigente. Para corregir el vigente, usa «Corregir».`);
  }
  // Estos traen en el mensaje el detalle que hace falta (qué tramo, qué condición, qué paso, qué fecha).
  if (ret && ['RET_TARIFA_TRAMOS', 'RET_REGLA_CONDICION', 'RET_REGLA_PASO', 'RET_REGLA_ESTADO', 'RET_TARIFA_DESDE'].includes(ret)) {
    const detalle = String(e?.message ?? '').replace(/^.*?RET_[A-Z_]+:\s*/, '').trim();
    const lead: Record<string, string> = {
      RET_TARIFA_TRAMOS: 'No se puede publicar', RET_REGLA_CONDICION: 'La condición no es válida', RET_REGLA_PASO: 'El paso no es válido',
      RET_REGLA_ESTADO: 'No corresponde', RET_TARIFA_DESDE: 'Fecha de la versión',
    };
    if (detalle) return new Error(`${lead[ret]}: ${detalle.replace(/^no se puede publicar:\s*/i, '')}`);
  }
  if (ret === 'RET_SERIE_INICIAL') {
    const ultimo = String(e?.message ?? '').match(/\((\d+)\)/)?.[1];
    if (ultimo) return new Error(`El primer número de la serie tiene que ser mayor que ${ultimo}, el último del otro sistema.`);
  }
  if (ret && TEXTOS[ret]) return new Error(TEXTOS[ret]);
  if (code === '42501') return new Error(TEXTOS.RET_SIN_PERMISO);
  // P03: la misma factura no se registra dos veces; un documento cubre una vez cada origen; forma de número, control y fecha.
  const mensaje = String(e?.message ?? '');
  if (code === '23505' && /retencion_documentos_unica_/.test(mensaje)) return new Error('Esa factura ya está registrada (mismo número, control y tipo de documento del mismo emisor).');
  if (code === '23505' && /retencion_documento_origenes_unico/.test(mensaje)) return new Error('Esa factura ya cubre esa orden, compra o servicio.');
  // R9 y P03: una regla de forma o rango, dicha por su nombre (antes que el texto genérico de la pantalla).
  const restriccion = code === '23514' ? textoRestriccion(mensaje) : null;
  if (restriccion) return new Error(restriccion);
  if (code === '23514' && textos.regla) return new Error(textos.regla);
  if (code === '23505' && textos.unico) return new Error(textos.unico);
  if (code === '23514') {
    return new Error('La empresa no puede practicar esa retención con su régimen (revisa agente de IVA / contribuyente especial en Parámetros).');
  }
  if (code === '23505') return new Error(TEXTOS.RET_NUMERO_USADO);
  if (e instanceof Error) return e;
  return new Error(e?.message || porDefecto);
}
