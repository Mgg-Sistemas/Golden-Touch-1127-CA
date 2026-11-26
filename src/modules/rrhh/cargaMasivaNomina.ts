/* ============================================================
   Golden Touch · RRHH · Motor de Carga Masiva - Nómina (Banco 0163)
   (19/11/2026)

   Implementa la especificación oficial de 44 columnas (A..AR) de
   «1-FORMATO CARGA MASIVA-MONEDA NACIONAL.xls» (Banco del Tesoro 0163):
     · Correlativos secuenciales de 7 dígitos (0000001, 0000002, …).
     · Cédula rellenada a 15 dígitos con ceros a la izquierda.
     · Fechas en formato bancario DDMMYYYY (8 caracteres sin guiones).
     · Sueldo básico en Bs a 15 dígitos con ceros a la izquierda (céntimos ×100).
     · Zonas postales a 10 dígitos y teléfonos a 11 dígitos.
     · Catálogos oficiales integrados: Estado Civil, Educación, Profesión,
       Tipo de Cargo (79 códigos), Región, Estado, Ciudad, Municipio,
       Parroquia y Oficinas Bancarias (66 agencias).
     · 100% puro, síncrono y determinista.
   ============================================================ */

import type { Personal, PersonalFamiliar } from '@/shared/lib/types';
import { leerCuentas } from './datosBancarios';

/* ───────────── Catálogos Oficiales (extraídos del XLS) ─────────────

   Los catálogos completos del Banco del Tesoro (223 países, 129
   municipios, 1.128 parroquias, 184 profesiones, 79 cargos, 7 niveles
   de educación, …) viven en `catalogosOficiales.ts`. Antes este
   archivo tenía copias parciales; aquí se reexportan para que los
   reportes y las pantallas usen siempre la lista completa.
   ──────────────────────────────────────────────────────────────── */

import {
  CATALOGO_PAISES,
  CATALOGO_MUNICIPIOS,
  CATALOGO_PARROQUIAS,
  CATALOGO_PROFESIONES,
  CATALOGO_TIPOS_CARGO,
  type ItemCatalogo,
} from './catalogosOficiales';

export type { ItemCatalogo } from './catalogosOficiales';
export {
  CATALOGO_TIPO_DOCUMENTO,
  CATALOGO_PAISES,
  CATALOGO_NACIONALIDADES,
  CATALOGO_EDO_CIVIL,
  CATALOGO_REGIONES,
  CATALOGO_ESTADOS,
  CATALOGO_CODIGOS_POSTALES,
  CATALOGO_CONDICION_INMUEBLE,
  CATALOGO_TIPO_VIVIENDA,
  CATALOGO_NIVEL_EDUCACION,
  CATALOGO_PROFESIONES,
  CATALOGO_CODIGO_INDUSTRIA,
  CATALOGO_FUENTE_INGRESO,
  CATALOGO_TIEMPO_CONTRATO,
  CATALOGO_TIPO_NOMINA,
  CATALOGO_TIPO_CUENTA,
  CATALOGO_TIPOS_CARGO,
  CATALOGO_OFICINAS_TESORO,
  CATALOGO_TIPO_SOLICITUD,
  CATALOGOS_OFICIALES,
} from './catalogosOficiales';

/** Alias históricos: los reportes siguen pidiendo los nombres viejos. */
export const CATALOGO_PAISES_ISO2: ItemCatalogo[] = CATALOGO_PAISES;
export const CATALOGO_MUNICIPIOS_PRINCIPALES: ItemCatalogo[] = CATALOGO_MUNICIPIOS;
export const CATALOGO_PARROQUIAS_PRINCIPALES: ItemCatalogo[] = CATALOGO_PARROQUIAS;
export const CATALOGO_PROFESIONES_MAP: Record<string, string> = CATALOGO_PROFESIONES.reduce<Record<string, string>>(
  (mapa, item) => { mapa[item.codigo] = item.descripcion; return mapa; },
  {},
);

export const CATALOGO_CIUDADES_PRINCIPALES: (ItemCatalogo & { estado: string; zonaPostal: string })[] = [
  { codigo: '7029', descripcion: 'PUERTO ORDAZ', estado: '07', zonaPostal: '8050' },
  { codigo: '7031', descripcion: 'SAN FELIX', estado: '07', zonaPostal: '8051' },
  { codigo: '7004', descripcion: 'CIUDAD GUAYANA', estado: '07', zonaPostal: '8050' },
  { codigo: '7026', descripcion: 'MATANZAS', estado: '07', zonaPostal: '8001' },
  { codigo: '7003', descripcion: 'CIUDAD BOLIVAR', estado: '07', zonaPostal: '8001' },
  { codigo: '7040', descripcion: 'UPATA', estado: '07', zonaPostal: '8052' },
  { codigo: '7007', descripcion: 'EL CALLAO', estado: '07', zonaPostal: '8056' },
  { codigo: '7013', descripcion: 'GUASIPATI', estado: '07', zonaPostal: '8050' },
  { codigo: '7039', descripcion: 'TUMEREMO', estado: '07', zonaPostal: '8057' },
  { codigo: '7008', descripcion: 'EL DORADO', estado: '07', zonaPostal: '8050' },
  { codigo: '7009', descripcion: 'EL MANTECO', estado: '07', zonaPostal: '8050' },
  { codigo: '7011', descripcion: 'EL PALMAR', estado: '07', zonaPostal: '8054' },
  { codigo: '7005', descripcion: 'CIUDAD PIAR', estado: '07', zonaPostal: '8003' },
  { codigo: '7002', descripcion: 'CAICARA DEL ORINOCO', estado: '07', zonaPostal: '8007' },
  { codigo: '7035', descripcion: 'SANTA ELENA DE UAIREN', estado: '07', zonaPostal: '8011' },
  { codigo: '1505', descripcion: 'CARACAS', estado: '01', zonaPostal: '1010' },
  { codigo: '3014', descripcion: 'BARCELONA', estado: '03', zonaPostal: '6001' },
  { codigo: '3052', descripcion: 'PUERTO LA CRUZ', estado: '03', zonaPostal: '6023' },
  { codigo: '16036', descripcion: 'MATURIN', estado: '16', zonaPostal: '6201' },
];


/**
 * Datos domiciliarios y bancarios de nómina guardados en la ficha de cada
 * trabajador (`personal.datos_pago.ficha_nomina`), tomados directamente al
 * generar la pestaña «CARGA MASIVA - NOMINA».
 */
export interface FichaNominaBancaria {
  pais_nacimiento?: string | null;
  calle_avenida?: string | null;
  casa_edificio?: string | null;
  piso_nivel?: string | null;
  apto_local?: string | null;
  referencia?: string | null;
  region?: string | null;
  estado?: string | null;
  ciudad?: string | null;
  municipio?: string | null;
  parroquia?: string | null;
  zona_postal?: string | null;
  telefono_local?: string | null;
  condicion_inmueble?: '1' | '2' | '3' | '' | null;
  tipo_vivienda?: '1' | '2' | '3' | '' | null;
  tiempo_residencia?: number | null;
  nivel_educacion_cod?: string | null;
  profesion_cod?: string | null;
  tipo_cargo_cod?: string | null;
  fuente_ingreso?: '1' | '2' | '3' | '4' | '' | null;
  tipo_contrato?: '1' | '2' | '' | null;
  tipo_nomina?: 'W' | 'B' | 'M' | 'S' | 'Y' | '' | null;
  tipo_cuenta_nomina?: 'CCVI' | 'VI01' | '' | null;
  oficina_principal?: string | null;
  oficina_secundaria?: string | null;
}

export const FICHA_NOMINA_VACIA: FichaNominaBancaria = {
  pais_nacimiento: '',
  calle_avenida: '',
  casa_edificio: '',
  piso_nivel: '',
  apto_local: '',
  referencia: '',
  region: '',
  estado: '',
  ciudad: '',
  municipio: '',
  parroquia: '',
  zona_postal: '',
  telefono_local: '',
  condicion_inmueble: '',
  tipo_vivienda: '',
  tiempo_residencia: null,
  nivel_educacion_cod: '',
  profesion_cod: '',
  tipo_cargo_cod: '',
  fuente_ingreso: '',
  tipo_contrato: '',
  tipo_nomina: '',
  tipo_cuenta_nomina: '',
  oficina_principal: '',
  oficina_secundaria: '',
};

function parsearObjetoDatosPago(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

export function leerFichaNominaPersonal(datosPago: unknown): FichaNominaBancaria {
  const obj = parsearObjetoDatosPago(datosPago);
  const fn = obj.ficha_nomina;
  if (!fn || typeof fn !== 'object' || Array.isArray(fn)) return { ...FICHA_NOMINA_VACIA };
  const d = fn as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' ? d[k].trim() : '');
  const numRes = d.tiempo_residencia != null && d.tiempo_residencia !== '' ? Number(d.tiempo_residencia) : null;
  return {
    pais_nacimiento: str('pais_nacimiento'),
    calle_avenida: str('calle_avenida'),
    casa_edificio: str('casa_edificio'),
    piso_nivel: str('piso_nivel'),
    apto_local: str('apto_local'),
    referencia: str('referencia'),
    region: str('region'),
    estado: str('estado'),
    ciudad: str('ciudad'),
    municipio: str('municipio'),
    parroquia: str('parroquia'),
    zona_postal: str('zona_postal'),
    telefono_local: str('telefono_local'),
    condicion_inmueble: str('condicion_inmueble') as FichaNominaBancaria['condicion_inmueble'],
    tipo_vivienda: str('tipo_vivienda') as FichaNominaBancaria['tipo_vivienda'],
    tiempo_residencia: Number.isFinite(numRes) && (numRes as number) > 0 ? Math.floor(numRes as number) : null,
    nivel_educacion_cod: str('nivel_educacion_cod'),
    profesion_cod: str('profesion_cod'),
    tipo_cargo_cod: str('tipo_cargo_cod'),
    fuente_ingreso: str('fuente_ingreso') as FichaNominaBancaria['fuente_ingreso'],
    tipo_contrato: str('tipo_contrato') as FichaNominaBancaria['tipo_contrato'],
    tipo_nomina: str('tipo_nomina') as FichaNominaBancaria['tipo_nomina'],
    tipo_cuenta_nomina: str('tipo_cuenta_nomina') as FichaNominaBancaria['tipo_cuenta_nomina'],
    oficina_principal: str('oficina_principal'),
    oficina_secundaria: str('oficina_secundaria'),
  };
}

export function mezclarDatosPagoConFichaNomina(
  datosPagoActual: unknown,
  ficha: FichaNominaBancaria | null | undefined,
): Record<string, unknown> {
  const base = parsearObjetoDatosPago(datosPagoActual);
  if (!ficha) return base;
  const limpia: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ficha)) {
    if (v === undefined || v === null || v === '') continue;
    limpia[k] = typeof v === 'string' ? v.trim().toUpperCase() : v;
  }
  return {
    ...base,
    ficha_nomina: limpia,
  };
}

export function mezclarDatosPagoConCuentas(
  datosPagoActual: unknown,
  cuentas: unknown[],
): Record<string, unknown> {
  const base = parsearObjetoDatosPago(datosPagoActual);
  return {
    ...base,
    cuentas,
  };
}

export function componerDireccionDesdeFichaNomina(ficha: FichaNominaBancaria | null | undefined): string {
  if (!ficha) return '';
  const partes = [
    ficha.calle_avenida?.trim(),
    ficha.casa_edificio?.trim(),
    ficha.piso_nivel?.trim() ? `PISO ${ficha.piso_nivel.trim()}` : '',
    ficha.apto_local?.trim() ? `NRO ${ficha.apto_local.trim()}` : '',
    ficha.referencia?.trim() ? `REF. ${ficha.referencia.trim()}` : '',
  ].filter(Boolean);
  return partes.join(', ').toUpperCase();
}

/* ───────────── Definición de las 44 Columnas A..AR ───────────── */

export interface ColumnaCargaMasivaDef {
  indice: number; // 1..44
  colLetra: string; // A..AR
  clave: keyof CamposCargaMasivaFila;
  tituloPlanilla: string;
  etiquetaCorta: string;
  mascara: string;
  anchoFijo: number;
  alineacion: 'left' | 'center' | 'right';
}

export interface CamposCargaMasivaFila {
  numero_banco: string;
  correlativo_cliente: string;
  tipo_documento: string;
  numero_cedula: string;
  primer_apellido: string;
  segundo_apellido: string;
  primer_nombre: string;
  segundo_nombre: string;
  fecha_nacimiento: string;
  pais_nacimiento: string;
  nacionalidad: string;
  sexo: string;
  estado_civil: string;
  dependientes: string;
  calle_avenida: string;
  casa_edificio: string;
  piso_nivel: string;
  apto_local: string;
  referencia: string;
  region: string;
  estado: string;
  ciudad: string;
  municipio: string;
  parroquia: string;
  zona_postal: string;
  telefono_local: string;
  telefono_celular: string;
  condicion_inmueble: string;
  tipo_vivienda: string;
  correo_electronico: string;
  tiempo_residencia: string;
  nivel_educacion: string;
  profesion: string;
  codigo_industria: string;
  fuente_ingreso: string;
  tipo_contrato: string;
  tipo_nomina: string;
  tipo_cuenta: string;
  sueldo_basico: string;
  fecha_ingreso: string;
  tipo_cargo: string;
  oficina_principal: string;
  oficina_secundaria: string;
  tipo_solicitud: string;
}

export const COLUMNAS_CARGA_MASIVA_NOMINA: ColumnaCargaMasivaDef[] = [
  { indice: 1, colLetra: 'A', clave: 'numero_banco', tituloPlanilla: 'NUMERO BANCO (NO MODIFICAR)', etiquetaCorta: 'Banco', mascara: '0000', anchoFijo: 4, alineacion: 'center' },
  { indice: 2, colLetra: 'B', clave: 'correlativo_cliente', tituloPlanilla: 'CORRELATIVO CLIENTE', etiquetaCorta: 'Correlativo', mascara: '0000000', anchoFijo: 7, alineacion: 'center' },
  { indice: 3, colLetra: 'C', clave: 'tipo_documento', tituloPlanilla: 'NACIONALIDAD', etiquetaCorta: 'Doc.', mascara: '@', anchoFijo: 1, alineacion: 'center' },
  { indice: 4, colLetra: 'D', clave: 'numero_cedula', tituloPlanilla: 'NUEMRO DE CEDULA (COMPLETAR CON CEROS A LA IZQ)', etiquetaCorta: 'Cédula (15 díg.)', mascara: '000000000000000', anchoFijo: 15, alineacion: 'center' },
  { indice: 5, colLetra: 'E', clave: 'primer_apellido', tituloPlanilla: 'PRIMER APELLIDO', etiquetaCorta: '1er Apellido', mascara: '@', anchoFijo: 20, alineacion: 'left' },
  { indice: 6, colLetra: 'F', clave: 'segundo_apellido', tituloPlanilla: 'SEGUNDO APELLIDO', etiquetaCorta: '2do Apellido', mascara: '@', anchoFijo: 20, alineacion: 'left' },
  { indice: 7, colLetra: 'G', clave: 'primer_nombre', tituloPlanilla: 'PRIMER NOMBRE', etiquetaCorta: '1er Nombre', mascara: '@', anchoFijo: 20, alineacion: 'left' },
  { indice: 8, colLetra: 'H', clave: 'segundo_nombre', tituloPlanilla: 'SEGUNDO NOMBRE', etiquetaCorta: '2do Nombre', mascara: '@', anchoFijo: 20, alineacion: 'left' },
  { indice: 9, colLetra: 'I', clave: 'fecha_nacimiento', tituloPlanilla: 'FECHA DE NACIMIENTO', etiquetaCorta: 'F. Nacimiento', mascara: 'ddmmyyyy', anchoFijo: 8, alineacion: 'center' },
  { indice: 10, colLetra: 'J', clave: 'pais_nacimiento', tituloPlanilla: 'PAIS DE NACIMIENTO', etiquetaCorta: 'País Nac.', mascara: '@', anchoFijo: 2, alineacion: 'center' },
  { indice: 11, colLetra: 'K', clave: 'nacionalidad', tituloPlanilla: 'NACIONALIDAD', etiquetaCorta: 'Nac. ISO', mascara: '@', anchoFijo: 2, alineacion: 'center' },
  { indice: 12, colLetra: 'L', clave: 'sexo', tituloPlanilla: 'SEXO', etiquetaCorta: 'Sexo', mascara: '@', anchoFijo: 1, alineacion: 'center' },
  { indice: 13, colLetra: 'M', clave: 'estado_civil', tituloPlanilla: 'ESTADO CIVIL', etiquetaCorta: 'Edo. Civil', mascara: '0', anchoFijo: 1, alineacion: 'center' },
  { indice: 14, colLetra: 'N', clave: 'dependientes', tituloPlanilla: 'DEPENDIENTES', etiquetaCorta: 'Dep.', mascara: '00', anchoFijo: 2, alineacion: 'center' },
  { indice: 15, colLetra: 'O', clave: 'calle_avenida', tituloPlanilla: 'CALLE / AVENIDA', etiquetaCorta: 'Calle / Av.', mascara: '@', anchoFijo: 35, alineacion: 'left' },
  { indice: 16, colLetra: 'P', clave: 'casa_edificio', tituloPlanilla: 'CASA / EDIFICIO', etiquetaCorta: 'Casa / Edif.', mascara: '@', anchoFijo: 20, alineacion: 'left' },
  { indice: 17, colLetra: 'Q', clave: 'piso_nivel', tituloPlanilla: 'PISO / NIVEL', etiquetaCorta: 'Piso', mascara: '@', anchoFijo: 6, alineacion: 'center' },
  { indice: 18, colLetra: 'R', clave: 'apto_local', tituloPlanilla: 'APTO / OFIC / LOCAL / DEPTO', etiquetaCorta: 'Apto / Nro', mascara: '@', anchoFijo: 10, alineacion: 'center' },
  { indice: 19, colLetra: 'S', clave: 'referencia', tituloPlanilla: 'REFERENCIA', etiquetaCorta: 'Referencia', mascara: '@', anchoFijo: 25, alineacion: 'left' },
  { indice: 20, colLetra: 'T', clave: 'region', tituloPlanilla: 'REGION', etiquetaCorta: 'Región', mascara: '00', anchoFijo: 2, alineacion: 'center' },
  { indice: 21, colLetra: 'U', clave: 'estado', tituloPlanilla: 'ESTADO', etiquetaCorta: 'Estado', mascara: '00', anchoFijo: 2, alineacion: 'center' },
  { indice: 22, colLetra: 'V', clave: 'ciudad', tituloPlanilla: 'CIUDAD', etiquetaCorta: 'Ciudad', mascara: '0000', anchoFijo: 4, alineacion: 'center' },
  { indice: 23, colLetra: 'W', clave: 'municipio', tituloPlanilla: 'MUNICIPIO', etiquetaCorta: 'Municipio', mascara: '0000', anchoFijo: 4, alineacion: 'center' },
  { indice: 24, colLetra: 'X', clave: 'parroquia', tituloPlanilla: 'PARROQUIA', etiquetaCorta: 'Parroquia', mascara: '000000', anchoFijo: 6, alineacion: 'center' },
  { indice: 25, colLetra: 'Y', clave: 'zona_postal', tituloPlanilla: 'ZONA POSTAL', etiquetaCorta: 'Zona Postal', mascara: '0000000000', anchoFijo: 10, alineacion: 'center' },
  { indice: 26, colLetra: 'Z', clave: 'telefono_local', tituloPlanilla: 'TELEFONO LOCAL', etiquetaCorta: 'Tlf. Local', mascara: '00000000000', anchoFijo: 11, alineacion: 'center' },
  { indice: 27, colLetra: 'AA', clave: 'telefono_celular', tituloPlanilla: 'TELEFONO DE CELULAR', etiquetaCorta: 'Celular', mascara: '00000000000', anchoFijo: 11, alineacion: 'center' },
  { indice: 28, colLetra: 'AB', clave: 'condicion_inmueble', tituloPlanilla: 'CONDICION DEL INMUEBLE', etiquetaCorta: 'Cond. Inm.', mascara: '0', anchoFijo: 1, alineacion: 'center' },
  { indice: 29, colLetra: 'AC', clave: 'tipo_vivienda', tituloPlanilla: 'TIPODE VIVIENDA', etiquetaCorta: 'Vivienda', mascara: '0', anchoFijo: 1, alineacion: 'center' },
  { indice: 30, colLetra: 'AD', clave: 'correo_electronico', tituloPlanilla: 'CORREO ELECTRONICO', etiquetaCorta: 'Correo', mascara: '@', anchoFijo: 40, alineacion: 'left' },
  { indice: 31, colLetra: 'AE', clave: 'tiempo_residencia', tituloPlanilla: 'TIEMPO DE RESIDENCIA', etiquetaCorta: 'Residencia', mascara: '00', anchoFijo: 2, alineacion: 'center' },
  { indice: 32, colLetra: 'AF', clave: 'nivel_educacion', tituloPlanilla: 'NIVEL DE EDUCACION', etiquetaCorta: 'Educación', mascara: '00', anchoFijo: 2, alineacion: 'center' },
  { indice: 33, colLetra: 'AG', clave: 'profesion', tituloPlanilla: 'PROFESION', etiquetaCorta: 'Profesión', mascara: '@', anchoFijo: 4, alineacion: 'center' },
  { indice: 34, colLetra: 'AH', clave: 'codigo_industria', tituloPlanilla: 'CÓDIGO DE LA INDUSTRIA (UNA CONSTANTE)', etiquetaCorta: 'Industria', mascara: '0000', anchoFijo: 4, alineacion: 'center' },
  { indice: 35, colLetra: 'AI', clave: 'fuente_ingreso', tituloPlanilla: 'FUENTE DE INGRESO', etiquetaCorta: 'Fuente Ing.', mascara: '0', anchoFijo: 1, alineacion: 'center' },
  { indice: 36, colLetra: 'AJ', clave: 'tipo_contrato', tituloPlanilla: 'TIPO DE CONTRATO', etiquetaCorta: 'Contrato', mascara: '0', anchoFijo: 1, alineacion: 'center' },
  { indice: 37, colLetra: 'AK', clave: 'tipo_nomina', tituloPlanilla: 'TIPO DE NOMINA', etiquetaCorta: 'Nómina', mascara: '@', anchoFijo: 1, alineacion: 'center' },
  { indice: 38, colLetra: 'AL', clave: 'tipo_cuenta', tituloPlanilla: 'TIPO DE CUENTE (NOMINA O PERSONAL)', etiquetaCorta: 'Tipo Cta.', mascara: '@', anchoFijo: 4, alineacion: 'center' },
  { indice: 39, colLetra: 'AM', clave: 'sueldo_basico', tituloPlanilla: 'SUELDO BASICO (COMPLETAR CON CEROS A LA IZQUIERDA)', etiquetaCorta: 'Sueldo (15 díg.)', mascara: '000000000000000', anchoFijo: 15, alineacion: 'right' },
  { indice: 40, colLetra: 'AN', clave: 'fecha_ingreso', tituloPlanilla: 'FECHA DE INGRESO', etiquetaCorta: 'F. Ingreso', mascara: 'ddmmyyyy', anchoFijo: 8, alineacion: 'center' },
  { indice: 41, colLetra: 'AO', clave: 'tipo_cargo', tituloPlanilla: 'TIPO DE CARGO', etiquetaCorta: 'Cód. Cargo', mascara: '000', anchoFijo: 3, alineacion: 'center' },
  { indice: 42, colLetra: 'AP', clave: 'oficina_principal', tituloPlanilla: 'CÓDIGO DE LA OFICINA BANCARIA', etiquetaCorta: 'Ofic. Ppal.', mascara: '0000', anchoFijo: 4, alineacion: 'center' },
  { indice: 43, colLetra: 'AQ', clave: 'oficina_secundaria', tituloPlanilla: 'CÓDIGO DE LA OFICINA BANCARIA', etiquetaCorta: 'Ofic. Sec.', mascara: '0000', anchoFijo: 4, alineacion: 'center' },
  { indice: 44, colLetra: 'AR', clave: 'tipo_solicitud', tituloPlanilla: 'CONSTANTE (SE MANTIENE IGUAL)', etiquetaCorta: 'Solicitud', mascara: '@', anchoFijo: 1, alineacion: 'center' },
];

/* ───────────── Configuración del Lote ───────────── */

export type PorcionSueldoCargaMasiva = 'bs_100' | 'bs_20' | 'bs_80' | 'monto_fijo_bs';
export type ModoDecimalesSueldo = 'centimos' | 'entero';
export type SeparadorTxtCargaMasiva = ';' | '|' | '\t' | 'ancho_fijo';
export type ModoContenidoTxt = 'resumen_hoja1' | 'sabana_44';

/**
 * Los 4 campos del TXT tipo resumen que están en «Hoja1» del Excel oficial:
 *   1) Referencia 10 dígitos: Banco (0163) + correlativo 6 dígitos (ej. 0163180719)
 *   2) Cédula 10 caracteres: V/E/P + 9 dígitos con ceros a la izq. (ej. V002940602)
 *   3) Cuenta bancaria 20 dígitos (ej. 01630221012211002934)
 *   4) Monto en Bs 15 dígitos con céntimos ×100 (ej. 000000000725000)
 */
export interface ResumenTxtHoja1 {
  referencia10: string;
  cedula10: string;
  cuenta20: string;
  monto15: string;
}

export interface ConfigCargaMasivaNomina {
  numeroBanco: string; // '0163'
  correlativoInicial: number; // 1 -> '0000001' en Modelo y '0163000001' en TXT Hoja1
  porcionSueldo: PorcionSueldoCargaMasiva;
  tasaBs: number;
  montoFijoBs: number;
  modoDecimalesSueldo: ModoDecimalesSueldo;

  oficinaPrincipal: string; // '0405'
  oficinaSecundaria: string; // '0405'
  tipoCuenta: 'CCVI' | 'VI01';
  tipoNomina: 'W' | 'B' | 'M' | 'S' | 'Y';
  tipoContrato: '1' | '2';
  fuenteIngreso: '1' | '2' | '3' | '4';
  tipoSolicitud: 'I' | 'M' | 'D';

  regionDefecto: string; // '09'
  estadoDefecto: string; // '07'
  ciudadDefecto: string; // '7029'
  municipioDefecto: string; // '0701'
  parroquiaDefecto: string; // '070106'
  zonaPostalDefecto: string; // '8050'

  condicionInmuebleDefecto: '1' | '2' | '3';
  tipoViviendaDefecto: '1' | '2' | '3';
  tiempoResidenciaAnios: number;
  calleDefecto: string;
  telefonoLocalDefecto: string;
  correoDefecto: string;

  incluirEncabezadoPlano: boolean;
  modoContenidoTxt: ModoContenidoTxt;
  separadorTxt: SeparadorTxtCargaMasiva;
}

export const CONFIG_CARGA_MASIVA_DEFECTO: ConfigCargaMasivaNomina = {
  numeroBanco: '0163',
  correlativoInicial: 1,
  porcionSueldo: 'bs_100',
  tasaBs: 0,
  montoFijoBs: 0,
  modoDecimalesSueldo: 'centimos',

  oficinaPrincipal: '0405',
  oficinaSecundaria: '0405',
  tipoCuenta: 'CCVI',
  tipoNomina: 'B',
  tipoContrato: '2',
  fuenteIngreso: '1',
  tipoSolicitud: 'I',

  regionDefecto: '09',
  estadoDefecto: '07',
  ciudadDefecto: '7029',
  municipioDefecto: '0701',
  parroquiaDefecto: '070106',
  zonaPostalDefecto: '8050',

  condicionInmuebleDefecto: '1',
  tipoViviendaDefecto: '1',
  tiempoResidenciaAnios: 1,
  calleDefecto: 'SECTOR UNARE PUERTO ORDAZ',
  telefonoLocalDefecto: '00000000000',
  correoDefecto: '',

  incluirEncabezadoPlano: false,
  modoContenidoTxt: 'resumen_hoja1',
  separadorTxt: '\t',
};

export interface FilaCargaMasivaNomina {
  personalId: string;
  empresa: string;
  departamento: string;
  cargoOriginal: string;
  tituloOriginal: string;
  nombreCompleto: string;
  cedulaLegible: string;
  sueldoUsd: number;
  montoBs: number;
  tieneCuenta0163: boolean;
  cuenta0163Numero: string;
  cargoCatalogoDesc: string;
  profesionCatalogoDesc: string;
  campos: CamposCargaMasivaFila;
  celdas: string[]; // 44 valores exactos A..AR
  resumenTxt: ResumenTxtHoja1;
  alertas: string[];
}

/* ───────────── Utilidades Puras de Formateo ───────────── */

/** Normaliza texto para archivos bancarios: mayúsculas, sin tildes ni caracteres de control. */
export function limpiarTextoBancario(valor: string | null | undefined, maxLen?: number): string {
  if (!valor) return '';
  let limpio = String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ñÑ]/g, 'N')
    .toUpperCase()
    .replace(/[;|"\r\n\t]/g, ' ')
    .replace(/[^A-Z0-9 .,#/\-_@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen && maxLen > 0 && limpio.length > maxLen) {
    limpio = limpio.slice(0, maxLen).trim();
  }
  return limpio;
}

const PREPOSICIONES_COMPUESTAS = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'SAN',
  'SANTA',
  'VAN',
  'VON',
  'DA',
  'DAS',
  'DO',
  'DOS',
  'MC',
]);

/**
 * Divide apellidos o nombres en [primero, segundo] respetando conectores hispanos
 * como "DE LA CRUZ PEREZ" -> ["DE LA CRUZ", "PEREZ"] o "MARIA DEL VALLE" -> ["MARIA", "DEL VALLE"].
 */
export function dividirNombreCompuesto(valor: string | null | undefined): [string, string] {
  const limpio = limpiarTextoBancario(valor);
  if (!limpio) return ['', ''];
  const tokens = limpio.split(' ').filter(Boolean);
  if (tokens.length === 1) return [tokens[0], ''];

  // Agrupar preposiciones con el sustantivo que les sigue (p. ej. ["DE", "LA", "CRUZ", "PEREZ"] -> ["DE LA CRUZ", "PEREZ"])
  const bloques: string[] = [];
  let prefijo: string[] = [];
  for (const tk of tokens) {
    if (PREPOSICIONES_COMPUESTAS.has(tk)) {
      prefijo.push(tk);
    } else {
      bloques.push([...prefijo, tk].join(' '));
      prefijo = [];
    }
  }
  if (prefijo.length > 0) {
    if (bloques.length > 0) {
      bloques[bloques.length - 1] = `${bloques[bloques.length - 1]} ${prefijo.join(' ')}`;
    } else {
      bloques.push(prefijo.join(' '));
    }
  }

  if (bloques.length === 1) return [bloques[0].slice(0, 25), ''];
  return [bloques[0].slice(0, 25), bloques.slice(1).join(' ').slice(0, 25)];
}

export function formatearCorrelativo7(n: number): string {
  const entero = Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
  return String(entero).padStart(7, '0').slice(-7);
}

export function extraerTipoDocYCedula15(
  cedulaRaw: string | null | undefined,
  nacionalidadRaw?: string | null,
): { tipoDoc: 'V' | 'E' | 'P'; cedula15: string; digitos: string } {
  const texto = String(cedulaRaw ?? '').trim().toUpperCase();
  const nac = limpiarTextoBancario(nacionalidadRaw);

  let tipoDoc: 'V' | 'E' | 'P' = 'V';
  if (/^E\b|^E[-.\s0-9]/.test(texto)) {
    tipoDoc = 'E';
  } else if (/^P\b|^P[-.\s0-9]/.test(texto)) {
    tipoDoc = 'P';
  } else if (nac && !nac.startsWith('VENEZ') && nac !== 'VE' && nac !== 'V') {
    tipoDoc = 'E';
  }

  const digitos = texto.replace(/\D/g, '').slice(0, 15);
  return {
    tipoDoc,
    cedula15: digitos.padStart(15, '0'),
    digitos,
  };
}

/** Convierte YYYY-MM-DD o DD/MM/YYYY a DDMMYYYY (8 dígitos exactos). */
export function formatearFechaBancaria8(fechaRaw: string | null | undefined): string {
  if (!fechaRaw) return '';
  const s = String(fechaRaw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[1].padStart(2, '0')}${dmy[2].padStart(2, '0')}${dmy[3]}`;
  const soloDigitos = s.replace(/\D/g, '');
  if (soloDigitos.length === 8) return soloDigitos;
  return '';
}

export function mapearPaisYNacionalidadISO2(nacionalidadRaw: string | null | undefined, tipoDoc: 'V' | 'E' | 'P'): {
  pais: string;
  nacionalidad: string;
} {
  const nac = limpiarTextoBancario(nacionalidadRaw);
  if (!nac || nac.startsWith('VENEZ') || nac === 'VE' || nac === 'V') {
    return tipoDoc === 'V' ? { pais: 'VE', nacionalidad: 'VE' } : { pais: 'CO', nacionalidad: 'CO' };
  }
  const mapa: Array<[RegExp, string]> = [
    [/COLOMB/, 'CO'],
    [/PERU/, 'PE'],
    [/ECUAT|ECUAD/, 'EC'],
    [/BRASIL|BRAZIL/, 'BR'],
    [/CUBA/, 'CU'],
    [/ESPAN/, 'ES'],
    [/PORTUG/, 'PT'],
    [/ITALI/, 'IT'],
    [/CHIN/, 'CN'],
    [/CHIL/, 'CL'],
    [/ARGENT/, 'AR'],
    [/DOMINIC/, 'DO'],
    [/MEXIC/, 'MX'],
    [/GUYAN/, 'GY'],
    [/TRINID/, 'TT'],
    [/ESTADOS UNIDOS|ESTADOUNID|USA/, 'US'],
  ];
  for (const [re, iso] of mapa) {
    if (re.test(nac)) return { pais: iso, nacionalidad: iso };
  }
  if (/^[A-Z]{2}$/.test(nac)) return { pais: nac, nacionalidad: nac };
  return { pais: tipoDoc === 'V' ? 'VE' : 'CO', nacionalidad: tipoDoc === 'V' ? 'VE' : 'CO' };
}

export function mapearEstadoCivil1(estadoCivilRaw: string | null | undefined): string {
  const s = limpiarTextoBancario(estadoCivilRaw);
  if (s.startsWith('CASAD')) return '2';
  if (s.startsWith('DIVORC')) return '3';
  if (s.startsWith('VIUD')) return '4';
  if (s.startsWith('CONCUB') || s.includes('UNION')) return '5';
  return '1';
}

export function formatearTelefono11(raw: string | null | undefined, fallback = '00000000000'): string {
  if (!raw) return fallback.replace(/\D/g, '').padStart(11, '0').slice(-11);
  // Tomar el primer número telefónico si hay varios separados por / o -
  const candidatos = String(raw).split(/[;/|,]/);
  for (const c of candidatos) {
    let d = c.replace(/\D/g, '');
    if (!d) continue;
    if (d.startsWith('0058') && d.length >= 14) d = '0' + d.slice(4);
    else if (d.startsWith('58') && d.length >= 12) d = '0' + d.slice(2);
    else if (d.length === 10 && /^[24]/.test(d)) d = '0' + d;

    if (d.length >= 10) {
      return d.slice(0, 11).padStart(11, '0');
    }
  }
  return fallback.replace(/\D/g, '').padStart(11, '0').slice(-11);
}

function obtenerCuentasSeguras(datosPagoRaw: unknown): ReturnType<typeof leerCuentas> {
  if (!datosPagoRaw) return [];
  if (typeof datosPagoRaw === 'string') {
    try {
      return leerCuentas(JSON.parse(datosPagoRaw));
    } catch {
      return [];
    }
  }
  return leerCuentas(datosPagoRaw);
}

export function extraerTelefonosPersonal(
  telefonoRaw: string | null | undefined,
  datosPagoRaw: unknown,
  localDefecto: string,
): { local11: string; celular11: string; tieneCelularReal: boolean } {
  const partes = String(telefonoRaw ?? '')
    .split(/[;/|,]/)
    .map((x) => formatearTelefono11(x, ''))
    .filter((x) => x.length === 11 && x !== '00000000000');

  let celular = partes.find((x) => /^04(12|14|24|16|26|22)/.test(x)) || '';
  let local = partes.find((x) => /^02/.test(x)) || '';

  if (!celular) {
    // Buscar celular en Pago Móvil de datos_pago si existe
    const cuentas = obtenerCuentasSeguras(datosPagoRaw);
    for (const cta of cuentas) {
      if (cta.telefono) {
        const cand = formatearTelefono11(cta.telefono, '');
        if (/^04(12|14|24|16|26|22)/.test(cand)) {
          celular = cand;
          break;
        }
      }
    }
  }

  if (!celular && partes.length > 0) {
    celular = partes[0];
  }

  const tieneCelularReal = Boolean(celular && celular !== '00000000000');
  return {
    local11: local || formatearTelefono11(localDefecto, '00000000000'),
    celular11: celular || '00000000000',
    tieneCelularReal,
  };
}

export function desglosarDireccionBancaria(
  direccionRaw: string | null | undefined,
  calleDefecto: string,
  viviendaDefecto: '1' | '2' | '3',
): {
  calle: string;
  casaEdificio: string;
  piso: string;
  aptoLocal: string;
  referencia: string;
  tipoVivienda: '1' | '2' | '3';
} {
  const dir = limpiarTextoBancario(direccionRaw);
  const defCalle = limpiarTextoBancario(calleDefecto, 35) || 'PUERTO ORDAZ';
  if (!dir) {
    return {
      calle: defCalle,
      casaEdificio: 'CASA',
      piso: 'PB',
      aptoLocal: 'S/N',
      referencia: '',
      tipoVivienda: viviendaDefecto,
    };
  }

  const esApto = /\b(EDIF|EDIFICIO|RESIDENCIA|RESIDENCIAS|RES\.|TORRE|BLOQUE|APTO|APARTAMENTO)\b/.test(dir);
  const esQuinta = /\b(QUINTA|QTA)\b/.test(dir);
  const tipoVivienda: '1' | '2' | '3' = esApto ? '3' : esQuinta ? '2' : viviendaDefecto;

  const matchPiso = /\b(?:PISO|NIVEL)\s*([A-Z0-9-]{1,4})\b/.exec(dir);
  const piso = matchPiso ? matchPiso[1] : 'PB';

  const matchNro = /\b(?:CASA|APTO|APARTAMENTO|LOCAL|NRO|NO|#)\s*([A-Z0-9-]{1,8})\b/.exec(dir);
  const aptoLocal = matchNro ? matchNro[1] : 'S/N';

  let referencia = '';
  const matchRef = /\b((?:CERCA|FRENTE|DETRAS|AL LADO|DIAGONAL)\s+[A-Z0-9 ]{3,30})/.exec(dir);
  if (matchRef) {
    referencia = matchRef[1].trim().slice(0, 25);
  }

  let casaEdificio = esApto ? 'EDIFICIO' : esQuinta ? 'QUINTA' : 'CASA';
  const matchEdif = /\b(?:EDIF(?:ICIO)?|RES(?:IDENCIAS?)?|TORRE|CONJ(?:UNTO)?)\s+([A-Z0-9 ]{2,18})/.exec(dir);
  if (matchEdif) {
    casaEdificio = matchEdif[0].trim().slice(0, 20);
  }

  return {
    calle: dir.slice(0, 35) || defCalle,
    casaEdificio,
    piso,
    aptoLocal,
    referencia,
    tipoVivienda,
  };
}

export function inferirUbicacionBancaria(
  direccionRaw: string | null | undefined,
  config: Pick<
    ConfigCargaMasivaNomina,
    'regionDefecto' | 'estadoDefecto' | 'ciudadDefecto' | 'municipioDefecto' | 'parroquiaDefecto' | 'zonaPostalDefecto'
  >,
): {
  region: string;
  estado: string;
  ciudad: string;
  municipio: string;
  parroquia: string;
  zonaPostal10: string;
} {
  const dir = limpiarTextoBancario(direccionRaw);
  let region = config.regionDefecto || '09';
  let estado = config.estadoDefecto || '07';
  let ciudad = config.ciudadDefecto || '7029';
  let municipio = config.municipioDefecto || '0701';
  let parroquia = config.parroquiaDefecto || '070106';
  let zp = config.zonaPostalDefecto || '8050';

  if (dir) {
    if (/\b(SAN FELIX|CHIRICA|VISTA AL SOL|ONCE DE ABRIL|DALLA COSTA|MANOA|UD\s*145|UD\s*146|FRANCISCO DE MIRANDA)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7031';
      municipio = '0702';
      zp = '8051';
      if (dir.includes('VISTA AL SOL')) parroquia = '070108';
      else if (dir.includes('DALLA COSTA')) parroquia = '070103';
      else if (dir.includes('ONCE DE ABRIL')) parroquia = '070104';
      else if (dir.includes('SIMON BOLIVAR')) parroquia = '070105';
      else parroquia = '070102'; // CHIRICA
    } else if (/\b(PUERTO ORDAZ|PTO ORDAZ|UNARE|ALTA VISTA|LOS OLIVOS|VILLA ASIA|CASTILLITO|CACHAMAY|CORE 8|VILLA BRASIL|VENTUARI|CURAGUA|CAMPO B|MATANZAS)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = dir.includes('MATANZAS') ? '7026' : '7029';
      municipio = '0701';
      zp = dir.includes('MATANZAS') ? '8001' : '8050';
      if (/\b(ALTA VISTA|LOS OLIVOS|VILLA ASIA|UNIVERSIDAD)\b/.test(dir)) parroquia = '070107';
      else if (/\b(CACHAMAY|CASTILLITO|CAMPO B)\b/.test(dir)) parroquia = '070101';
      else parroquia = '070106'; // UNARE
    } else if (/\b(CIUDAD BOLIVAR|CD BOLIVAR|LA SABANITA|MARHUANTA|AGUA SALADA|VISTA HERMOSA)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7003';
      municipio = '0703';
      zp = '8001';
      if (dir.includes('SABANITA')) parroquia = '070204';
      else if (dir.includes('MARHUANTA')) parroquia = '070205';
      else if (dir.includes('VISTA HERMOSA')) parroquia = '070206';
      else parroquia = '070201';
    } else if (/\b(EL CALLAO)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7007';
      municipio = '0701';
      parroquia = '070501';
      zp = '8056';
    } else if (/\b(TUMEREMO|SIFONTES)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7039';
      municipio = '0701';
      parroquia = '071101';
      zp = '8057';
    } else if (/\b(EL DORADO|LAS CLARITAS|SAN ISIDRO)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7008';
      municipio = '0701';
      parroquia = dir.includes('EL DORADO') ? '071102' : '071103';
      zp = '8050';
    } else if (/\b(GUASIPATI|ROSCIO)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7013';
      municipio = '0701';
      parroquia = '071001';
      zp = '8050';
    } else if (/\b(UPATA|PIAR)\b/.test(dir)) {
      region = '09';
      estado = '07';
      ciudad = '7040';
      municipio = '0701';
      parroquia = '070801';
      zp = '8052';
    }
  }

  return {
    region: region.replace(/\D/g, '').padStart(2, '0').slice(-2),
    estado: estado.replace(/\D/g, '').padStart(2, '0').slice(-2),
    ciudad: ciudad.replace(/\D/g, '').padStart(4, '0').slice(-4),
    municipio: municipio.replace(/\D/g, '').padStart(4, '0').slice(-4),
    parroquia: parroquia.replace(/\D/g, '').padStart(6, '0').slice(-6),
    zonaPostal10: zp.replace(/\D/g, '').padStart(10, '0').slice(-10),
  };
}

export function mapearNivelEducacion2(
  gradoRaw: string | null | undefined,
  tituloRaw: string | null | undefined,
): string {
  const g = limpiarTextoBancario(gradoRaw);
  const t = limpiarTextoBancario(tituloRaw);

  if (/\b(DOCTOR|DOCTORADO|PHD)\b/.test(t)) return '07';
  if (/\b(MAGISTER|MAESTRIA|POSTGRADO|POST GRADO|ESPECIALIZACION)\b/.test(t)) return '06';
  if (/\b(TSU|T\.S\.U|TECNICO SUPERIOR)\b/.test(t)) return '04';
  if (/\b(TECNICO MEDIO)\b/.test(t)) return '03';

  if (g === 'PRIMARIA') return '01';
  if (g === 'BACHILLER' || g === 'BACHILLERATO' || g === 'SECUNDARIA') return '02';
  if (g === 'UNIVERSITARIO') return '05';

  if (/\b(INGENIERO|ING\.|LICENCIAD|LIC\.|ABOGAD|CONTADOR|MEDICO|ARQUITECTO|GEOLOGO|ECONOMISTA|PSICOLOGO)\b/.test(t)) {
    return '05';
  }
  return '02';
}

export function mapearCodigoProfesion4(
  tituloRaw: string | null | undefined,
  cargoRaw: string | null | undefined,
): { codigo: string; descripcion: string } {
  const t = limpiarTextoBancario(tituloRaw);
  const c = limpiarTextoBancario(cargoRaw);
  const fuente = `${t} ${c}`.trim();

  const elegir = (codigo: string) => ({
    codigo,
    descripcion: CATALOGO_PROFESIONES_MAP[codigo] || codigo,
  });

  // 1. TSU específicos primero
  if (/\b(TSU|T\.S\.U|TECNICO SUPERIOR)\b/.test(t)) {
    if (/GEOLOG|MINA/.test(t)) return elegir('TSUG');
    if (/MANTENIMIENTO/.test(t)) return elegir('TMIN');
    if (/MECANIC/.test(t)) return elegir('TMEC');
    if (/ELECTRI/.test(t)) return elegir('TMEL');
    if (/AUTOMOT/.test(t)) return elegir('TTAU');
    if (/INFORMAT|SISTEMA|COMPUT/.test(t)) return elegir('TINF');
    if (/CONTAB|FINANZ|TRIBUT/.test(t)) return elegir('TACF');
    if (/RECURSOS HUMANOS|RELACIONES INDUSTRIALES|RRHH/.test(t)) return elegir('TRIN');
    if (/OBRAS CIVILES|CONSTRUCCION|CIVIL/.test(t)) return elegir('TSUO');
    return elegir('TADE');
  }

  // 2. Ingenierías y licenciaturas en título o cargo
  const reglas: Array<[RegExp, string]> = [
    [/\bGEOLOG/, 'GEOL'],
    [/\bTOPOGRAF/, 'TOPO'],
    [/\bABOGAD|JURIDIC|LEGAL/, 'ABOG'],
    [/\bCONTAD|TRIBUTAR|AUDITOR/, 'LCPU'],
    [/\bPSICOLOG/, 'LPSI'],
    [/\bMEDICO|DOCTORA?\b|SALUD OCUPACIONAL/, 'MEDI'],
    [/\bENFERMER|PARAMEDIC/, 'ENFE'],
    [/\bARQUITECT/, 'ARQU'],
    [/\bECONOMIST/, 'ECON'],
    [/\bRELACIONES INDUSTRIALES/, 'LRIN'],
    [/\bRECURSOS HUMANOS|TALENTO HUMANO|\bRRHH\b/, 'LARH'],
    [/\bING[A-Z.]*\s+(?:DE\s+)?SISTEMAS/, 'INSI'],
    [/\bING[A-Z.]*\s+(?:EN\s+)?INFORMATIC/, 'ININ'],
    [/\bING[A-Z.]*\s+(?:EN\s+)?COMPUTAC/, 'INCO'],
    [/\bING[A-Z.]*\s+INDUSTRIAL/, 'INID'],
    [/\bING[A-Z.]*\s+MECANIC/, 'INME'],
    [/\bING[A-Z.]*\s+ELECTRIC/, 'INEL'],
    [/\bING[A-Z.]*\s+ELECTRONIC/, 'INET'],
    [/\bING[A-Z.]*\s+CIVIL/, 'INCI'],
    [/\bING[A-Z.]*\s+QUIMIC|METALURG/, 'INQU'],
    [/\bING[A-Z.]*\s+AMBIENT/, 'INGA'],
    [/\bING[A-Z.]*\s+MATERIAL/, 'INGM'],
    [/\bINGENIER|\bING\b/, 'INGE'],
    [/\bINFORMATIC|\bSISTEMAS\b|\bPROGRAMAD/, 'LINF'],
    [/\bADMINISTRAD|\bADMINISTRACION\b|\bTESORER/, 'LADM'],
    [/\bCOMPRAD|\bPROCURA\b|\bSUMINISTRO/, 'COMP'],
    [/\bCHOFER|\bCONDUCTOR|\bMOTORIZADO|\bDELIVERY/, 'CHOF'],
    [/\bCOCINER|\bCHEF\b|\bAYUDANTE DE COCINA/, 'CHEF'],
    [/\bMECANIC|\bELECTROMECANIC|\bLUBRICAD/, 'MECA'],
    [/\bHERRER|\bSOLDAD|\bTORNER/, 'HERR'],
    [/\bLATONER|\bPINTOR AUTOMOT/, 'LATO'],
    [/\bELECTRICIST|\bELECTRONIC/, 'ELEC'],
    [/\bVIGILANT|\bSEGURIDAD FISICA|\bPCP\b|\bCUSTODIO/, 'VIGI'],
    [/\bCONSERJ|\bASEAD|\bLIMPIEZA|\bCAMARER/, 'CONS'],
    [/\bRECEPCION/, 'RECE'],
    [/\bSECRETAR/, 'SECR'],
    [/\bCAJER/, 'CAJE'],
    [/\bMENSAJER/, 'MENS'],
    [/\bJARDINER/, 'JARD'],
    [/\bSUPERVISOR|\bCAPATAZ/, 'SUPE'],
    [/\bCOORDINAD/, 'COOR'],
    [/\bANALISTA/, 'ANAL'],
    [/\bASISTENT|\bAUXILIAR/, 'ASIS'],
    [/\bMANTENIMIENTO/, 'SERV'],
  ];

  for (const [re, cod] of reglas) {
    if (re.test(fuente)) return elegir(cod);
  }

  return elegir('OBRE');
}

export function mapearCodigoCargo3(cargoRaw: string | null | undefined): {
  codigo: string;
  descripcion: string;
} {
  const c = limpiarTextoBancario(cargoRaw);
  const elegir = (codigo: string) => ({
    codigo,
    descripcion: CATALOGO_TIPOS_CARGO.find((x) => x.codigo === codigo)?.descripcion || 'OTROS',
  });

  if (!c) return elegir('011');

  const reglas: Array<[RegExp, string]> = [
    [/\bVICEPRESIDENTE/, '029'],
    [/\bPRESIDENTE/, '001'],
    [/\bDIRECTOR/, '002'],
    [/\bGERENTE\s+GENERAL/, '075'],
    [/\bSUB\s*GERENTE/, '004'],
    [/\bGERENTE/, '003'],
    [/\bJEFE\b|\bSUPERINTENDENTE/, '015'],
    [/\bCOORDINAD/, '006'],
    [/\bSUPERVISOR|\bCAPATAZ|\bLIDER/, '005'],
    [/\bADJUNTO/, '077'],
    [/\bAUDITOR/, '027'],
    [/\bASESOR/, '026'],
    [/\bCONSULTOR/, '045'],
    [/\bCOMPRADOR|\bPROCURA/, '074'],
    [/\bADMINISTRADOR/, '041'],
    [/\bABOGAD/, '032'],
    [/\bGEOLOG/, '068'],
    [/\bQUIMIC|\bLABORATORIST|\bFUNDIDOR/, '067'],
    [/\bARQUITECT/, '035'],
    [/\bMEDICO|\bDOCTOR|\bENFERMER|\bPARAMEDIC/, '033'],
    [/\bPROGRAMADOR|\bDESARROLLADOR|\bSISTEMAS/, '028'],
    [/\bINGENIER/, '031'],
    [/\bESPECIALISTA|\bSHA\b|\bSIHO|\bSEGURIDAD INDUSTRIAL/, '012'],
    [/\bANALISTA|\bCONTADOR|\bTESORER|\bPLANIFICADOR/, '007'],
    [/\bENCARGAD|\bALMACENISTA|\bDEPOSITARIO/, '009'],
    [/\bASISTENTE/, '013'],
    [/\bAUXILIAR|\bAYUDANTE/, '020'],
    [/\bSECRETARI/, '008'],
    [/\bRECEPCION/, '024'],
    [/\bOFICINISTA|\bARCHIVIST/, '030'],
    [/\bCAJER/, '018'],
    [/\bVENDEDOR/, '010'],
    [/\bTECNICO|\bMECANICO|\bELECTRICISTA|\bSOLDADOR|\bTORNERO|\bLATONERO/, '016'],
    [/\bOPERADOR|\bMAQUINISTA|\bEXCAVADOR|\bRETROEXCAVADOR|\bMONTACARGUISTA|\bMOLINERO/, '017'],
    [/\bCHOFER|\bCONDUCTOR|\bMOTORIZADO|\bDELIVERY/, '021'],
    [/\bCHEF|\bCOCINER/, '046'],
    [/\bMESONER/, '047'],
    [/\bVIGILANT|\bPCP\b|\bCUSTODIO|\bSEGURIDAD/, '023'],
    [/\bCONSERJ|\bASEAD|\bLIMPIEZA|\bMANTENIMIENTO GENERAL/, '022'],
    [/\bOBRERO|\bMINERO|\bCUADRILLA/, '011'],
  ];

  for (const [re, cod] of reglas) {
    if (re.test(c)) return elegir(cod);
  }
  return elegir('011');
}

export function formatearSueldoBancario15(
  montoBs: number,
  modo: ModoDecimalesSueldo = 'centimos',
): string {
  const seguro = Number.isFinite(montoBs) && montoBs > 0 ? montoBs : 0;
  const entero = modo === 'centimos' ? Math.round(seguro * 100) : Math.round(seguro);
  return String(Math.max(0, entero)).padStart(15, '0').slice(-15);
}

export function buscarCuentaBancoTesoro(datosPagoRaw: unknown): string {
  const cuentas = obtenerCuentasSeguras(datosPagoRaw);
  for (const c of cuentas) {
    const num = (c.cuenta ?? '').replace(/\D/g, '');
    if (c.banco === '0163' || num.startsWith('0163')) {
      return num || '0163';
    }
  }
  return '';
}

/** Extrae la cuenta bancaria de 20 dígitos (priorizando 0163 y luego cualquier cuenta transferencia Bs). */
export function extraerCuentaBancaria20(datosPagoRaw: unknown): string {
  const cuentas = obtenerCuentasSeguras(datosPagoRaw);
  for (const c of cuentas) {
    const num = (c.cuenta ?? '').replace(/\D/g, '');
    if (num.length === 20 && (c.banco === '0163' || num.startsWith('0163'))) {
      return num;
    }
  }
  for (const c of cuentas) {
    const num = (c.cuenta ?? '').replace(/\D/g, '');
    if (num.length === 20) return num;
  }
  return '00000000000000000000';
}

/**
 * Formatea la referencia de 10 dígitos de Hoja1:
 *   · Si `n` <= 999999 -> `numeroBanco` (4 díg., ej. '0163') + `n` rellenado a 6 díg. ('0163180719' / '0163000001')
 *   · Si `n` ya trae el prefijo completo (>= 1000000) -> se rellena a 10 dígitos ('0163180719').
 */
export function formatearReferenciaHoja1(numeroBanco: string, n: number): string {
  const banco4 = (numeroBanco || '0163').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const entero = Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
  const txt = String(entero);
  if (txt.length > 6) {
    return txt.padStart(10, '0').slice(-10);
  }
  return `${banco4}${txt.padStart(6, '0')}`;
}

export function formatearCedulaHoja1(tipoDoc: 'V' | 'E' | 'P', digitosCedula: string): string {
  return `${tipoDoc}${(digitosCedula || '').replace(/\D/g, '').padStart(9, '0').slice(-9)}`;
}

export function calcularMontoBsCargaMasiva(sueldoUsd: number, config: ConfigCargaMasivaNomina): number {
  if (config.porcionSueldo === 'monto_fijo_bs') {
    return Math.max(0, Math.round((Number(config.montoFijoBs) || 0) * 100) / 100);
  }
  const usd = Number.isFinite(sueldoUsd) && sueldoUsd > 0 ? sueldoUsd : 0;
  const tasa = Number.isFinite(config.tasaBs) && config.tasaBs > 0 ? config.tasaBs : 0;
  const totalBs = usd * tasa;
  const factor = config.porcionSueldo === 'bs_20' ? 0.2 : config.porcionSueldo === 'bs_80' ? 0.8 : 1;
  return Math.round(totalBs * factor * 100) / 100;
}

/* ───────────── Generador Principal del Lote ───────────── */

export function generarLoteCargaMasivaNomina(
  personas: Personal[],
  familiaresMap: Map<string, PersonalFamiliar[]>,
  configParcial?: Partial<ConfigCargaMasivaNomina>,
): FilaCargaMasivaNomina[] {
  const config: ConfigCargaMasivaNomina = {
    ...CONFIG_CARGA_MASIVA_DEFECTO,
    ...configParcial,
  };

  const numBanco = (config.numeroBanco || '0163').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const oficPpalGlobal = (config.oficinaPrincipal || '0405').replace(/\D/g, '').padStart(4, '0').slice(-4);
  const oficSecGlobal = (config.oficinaSecundaria || oficPpalGlobal).replace(/\D/g, '').padStart(4, '0').slice(-4);
  const tiempoResGlobal = String(Math.max(1, Math.min(99, Math.floor(config.tiempoResidenciaAnios || 1)))).padStart(2, '0');
  const inicioCorrelativo = Math.max(1, Math.floor(config.correlativoInicial || 1));

  return personas.map((p, idx) => {
    const alertas: string[] = [];
    const fichaNomina = leerFichaNominaPersonal(p.datos_pago);
    const numSecuencia = inicioCorrelativo + idx;
    const correlativo = formatearCorrelativo7(numSecuencia);

    const { tipoDoc, cedula15, digitos: digitosCedula } = extraerTipoDocYCedula15(p.cedula, p.nacionalidad);
    if (!digitosCedula) alertas.push('Sin cédula');

    const [primerApellido, segundoApellido] = dividirNombreCompuesto(p.apellido);
    const [primerNombre, segundoNombre] = dividirNombreCompuesto(p.nombre);
    if (!primerApellido) alertas.push('Sin apellido');
    if (!primerNombre) alertas.push('Sin nombre');

    const fechaNac8 = formatearFechaBancaria8(p.fecha_nacimiento);
    if (!fechaNac8) alertas.push('Falta F. Nacimiento');

    const { pais: paisInferido, nacionalidad } = mapearPaisYNacionalidadISO2(p.nacionalidad, tipoDoc);
    const pais = limpiarTextoBancario(fichaNomina.pais_nacimiento, 2) || paisInferido;
    const sexo = p.genero === 'F' ? 'F' : 'M';
    const estadoCivil = mapearEstadoCivil1(p.estado_civil);

    const cantDep = Math.min(99, (familiaresMap.get(p.id) || []).length);
    const dependientes = String(cantDep).padStart(2, '0');

    const dirDesglose = desglosarDireccionBancaria(
      p.direccion,
      config.calleDefecto,
      config.tipoViviendaDefecto,
    );
    const ubicacionInferida = inferirUbicacionBancaria(p.direccion, config);

    const calleFinal = limpiarTextoBancario(fichaNomina.calle_avenida, 35) || dirDesglose.calle;
    const casaFinal = limpiarTextoBancario(fichaNomina.casa_edificio, 20) || dirDesglose.casaEdificio;
    const pisoFinal = limpiarTextoBancario(fichaNomina.piso_nivel, 6) || dirDesglose.piso;
    const aptoFinal = limpiarTextoBancario(fichaNomina.apto_local, 10) || dirDesglose.aptoLocal;
    const refFinal =
      fichaNomina.referencia != null && fichaNomina.referencia !== ''
        ? limpiarTextoBancario(fichaNomina.referencia, 25)
        : dirDesglose.referencia;

    const padCod = (val: string | null | undefined, len: number, fallback: string) => {
      const d = (val ?? '').replace(/\D/g, '');
      return d ? d.padStart(len, '0').slice(-len) : fallback;
    };

    const regionFinal = padCod(fichaNomina.region, 2, ubicacionInferida.region);
    const estadoFinal = padCod(fichaNomina.estado, 2, ubicacionInferida.estado);
    const ciudadFinal = padCod(fichaNomina.ciudad, 4, ubicacionInferida.ciudad);
    const municipioFinal = padCod(fichaNomina.municipio, 4, ubicacionInferida.municipio);
    const parroquiaFinal = padCod(fichaNomina.parroquia, 6, ubicacionInferida.parroquia);
    const zonaPostalFinal = padCod(fichaNomina.zona_postal, 10, ubicacionInferida.zonaPostal10);

    const telefonos = extraerTelefonosPersonal(
      p.telefono,
      p.datos_pago,
      fichaNomina.telefono_local || config.telefonoLocalDefecto,
    );
    const telefonoLocalFinal = fichaNomina.telefono_local
      ? formatearTelefono11(fichaNomina.telefono_local, telefonos.local11)
      : telefonos.local11;
    if (!telefonos.tieneCelularReal) alertas.push('Sin celular');

    const condicionInmuebleFinal =
      fichaNomina.condicion_inmueble && ['1', '2', '3'].includes(fichaNomina.condicion_inmueble)
        ? fichaNomina.condicion_inmueble
        : config.condicionInmuebleDefecto;
    const tipoViviendaFinal =
      fichaNomina.tipo_vivienda && ['1', '2', '3'].includes(fichaNomina.tipo_vivienda)
        ? fichaNomina.tipo_vivienda
        : dirDesglose.tipoVivienda;

    const correoLimpio = limpiarTextoBancario(p.correo || config.correoDefecto, 60);
    if (!correoLimpio) alertas.push('Sin correo');

    const tiempoResFinal =
      fichaNomina.tiempo_residencia && fichaNomina.tiempo_residencia > 0
        ? String(Math.min(99, fichaNomina.tiempo_residencia)).padStart(2, '0')
        : tiempoResGlobal;

    const nivelEducacionInferido = mapearNivelEducacion2(p.grado_instruccion, p.titulo_obtenido);
    const nivelEducacion = padCod(fichaNomina.nivel_educacion_cod, 2, nivelEducacionInferido);

    const profesionInferida = mapearCodigoProfesion4(p.titulo_obtenido, p.cargo);
    const profGuardada = limpiarTextoBancario(fichaNomina.profesion_cod, 4);
    const profesionMatch =
      profGuardada && CATALOGO_PROFESIONES_MAP[profGuardada]
        ? { codigo: profGuardada, descripcion: CATALOGO_PROFESIONES_MAP[profGuardada] }
        : profesionInferida;

    const cargoInferido = mapearCodigoCargo3(p.cargo);
    const cargoGuardado = fichaNomina.tipo_cargo_cod
      ? fichaNomina.tipo_cargo_cod.replace(/\D/g, '').padStart(3, '0').slice(-3)
      : '';
    const cargoCatalogoItem = cargoGuardado
      ? CATALOGO_TIPOS_CARGO.find((c) => c.codigo === cargoGuardado)
      : undefined;
    const cargoMatch = cargoCatalogoItem
      ? { codigo: cargoCatalogoItem.codigo, descripcion: cargoCatalogoItem.descripcion }
      : cargoInferido;

    const fuenteIngresoFinal =
      fichaNomina.fuente_ingreso && ['1', '2', '3', '4'].includes(fichaNomina.fuente_ingreso)
        ? fichaNomina.fuente_ingreso
        : config.fuenteIngreso;
    const tipoContratoFinal =
      fichaNomina.tipo_contrato && ['1', '2'].includes(fichaNomina.tipo_contrato)
        ? fichaNomina.tipo_contrato
        : config.tipoContrato;
    const tipoNominaFinal =
      fichaNomina.tipo_nomina && ['W', 'B', 'M', 'S', 'Y'].includes(fichaNomina.tipo_nomina)
        ? fichaNomina.tipo_nomina
        : config.tipoNomina;
    const tipoCuentaFinal =
      fichaNomina.tipo_cuenta_nomina && ['CCVI', 'VI01'].includes(fichaNomina.tipo_cuenta_nomina)
        ? fichaNomina.tipo_cuenta_nomina
        : config.tipoCuenta;

    const oficPpalFinal = padCod(fichaNomina.oficina_principal, 4, oficPpalGlobal);
    const oficSecFinal = padCod(
      fichaNomina.oficina_secundaria,
      4,
      fichaNomina.oficina_principal ? oficPpalFinal : oficSecGlobal,
    );

    const sueldoUsd = Number(p.sueldo_base ?? 0);
    const montoBs = calcularMontoBsCargaMasiva(sueldoUsd, config);
    if (montoBs <= 0) alertas.push('Sueldo Bs en 0');
    const sueldoBasico15 = formatearSueldoBancario15(montoBs, config.modoDecimalesSueldo);

    const fechaIngreso8 = formatearFechaBancaria8(p.fecha_ingreso);
    if (!fechaIngreso8) alertas.push('Falta F. Ingreso');

    const cuenta0163 = buscarCuentaBancoTesoro(p.datos_pago);
    const cuenta20 = extraerCuentaBancaria20(p.datos_pago);

    const resumenTxt: ResumenTxtHoja1 = {
      referencia10: formatearReferenciaHoja1(numBanco, numSecuencia),
      cedula10: formatearCedulaHoja1(tipoDoc, digitosCedula),
      cuenta20,
      monto15: sueldoBasico15,
    };

    const campos: CamposCargaMasivaFila = {
      numero_banco: numBanco,
      correlativo_cliente: correlativo,
      tipo_documento: tipoDoc,
      numero_cedula: cedula15,
      primer_apellido: primerApellido,
      segundo_apellido: segundoApellido,
      primer_nombre: primerNombre,
      segundo_nombre: segundoNombre,
      fecha_nacimiento: fechaNac8,
      pais_nacimiento: pais,
      nacionalidad,
      sexo,
      estado_civil: estadoCivil,
      dependientes,
      calle_avenida: calleFinal,
      casa_edificio: casaFinal,
      piso_nivel: pisoFinal,
      apto_local: aptoFinal,
      referencia: refFinal,
      region: regionFinal,
      estado: estadoFinal,
      ciudad: ciudadFinal,
      municipio: municipioFinal,
      parroquia: parroquiaFinal,
      zona_postal: zonaPostalFinal,
      telefono_local: telefonoLocalFinal,
      telefono_celular: telefonos.celular11,
      condicion_inmueble: condicionInmuebleFinal,
      tipo_vivienda: tipoViviendaFinal,
      correo_electronico: correoLimpio,
      tiempo_residencia: tiempoResFinal,
      nivel_educacion: nivelEducacion,
      profesion: profesionMatch.codigo,
      codigo_industria: '0902',
      fuente_ingreso: fuenteIngresoFinal,
      tipo_contrato: tipoContratoFinal,
      tipo_nomina: tipoNominaFinal,
      tipo_cuenta: tipoCuentaFinal,
      sueldo_basico: sueldoBasico15,
      fecha_ingreso: fechaIngreso8,
      tipo_cargo: cargoMatch.codigo,
      oficina_principal: oficPpalFinal,
      oficina_secundaria: oficSecFinal,
      tipo_solicitud: config.tipoSolicitud,
    };

    const celdas = COLUMNAS_CARGA_MASIVA_NOMINA.map((col) => campos[col.clave]);

    return {
      personalId: p.id,
      empresa: p.empresa || 'GT',
      departamento: (p.departamento ?? '').trim() || 'Sin departamento',
      cargoOriginal: (p.cargo ?? '').trim() || 'Sin cargo',
      tituloOriginal: (p.titulo_obtenido ?? '').trim(),
      nombreCompleto: [p.apellido, p.nombre].filter(Boolean).join(', ') || p.nombre || '—',
      cedulaLegible: digitosCedula ? `${tipoDoc}-${digitosCedula}` : (p.cedula ?? '—'),
      sueldoUsd,
      montoBs,
      tieneCuenta0163: Boolean(cuenta0163),
      cuenta0163Numero: cuenta0163,
      cargoCatalogoDesc: cargoMatch.descripcion,
      profesionCatalogoDesc: profesionMatch.descripcion,
      campos,
      celdas,
      resumenTxt,
      alertas,
    };
  });
}

/* ───────────── Serializadores Planos (CSV y TXT) ───────────── */

export function serializarCargaMasivaCsv(
  filas: FilaCargaMasivaNomina[],
  incluirEncabezado = true,
): string {
  const escaparCsv = (v: string) => {
    const limpio = String(v ?? '').replace(/"/g, '""');
    return `"${limpio}"`;
  };

  const lineas: string[] = [];
  if (incluirEncabezado) {
    lineas.push(COLUMNAS_CARGA_MASIVA_NOMINA.map((c) => escaparCsv(c.tituloPlanilla)).join(';'));
  }
  for (const f of filas) {
    lineas.push(f.celdas.map((val) => escaparCsv(val)).join(';'));
  }
  return lineas.join('\r\n');
}

export function serializarCargaMasivaTxt(
  filas: FilaCargaMasivaNomina[],
  opciones?: {
    modo?: ModoContenidoTxt;
    separador?: SeparadorTxtCargaMasiva;
    incluirEncabezado?: boolean;
  },
): string {
  const modo = opciones?.modo ?? 'resumen_hoja1';
  const sep = opciones?.separador ?? '\t';
  const incluirEnc = opciones?.incluirEncabezado ?? false;
  const lineas: string[] = [];

  // Formato por defecto: Resumen de Hoja1 del Excel (Ref 10 díg., Cédula V+9 díg., Cuenta 20 díg., Monto 15 díg.)
  if (modo === 'resumen_hoja1') {
    const sepReal = sep === 'ancho_fijo' ? '' : sep;
    if (incluirEnc) {
      if (sep === 'ancho_fijo') {
        lineas.push(
          ['REFERENCIA'.padEnd(10), 'CEDULA'.padEnd(10), 'CUENTA_BANCARIA'.padEnd(20), 'MONTO_BS'.padEnd(15)].join(''),
        );
      } else {
        lineas.push(['REFERENCIA', 'CEDULA', 'CUENTA_BANCARIA', 'MONTO_BS'].join(sepReal));
      }
    }
    for (const f of filas) {
      const r = f.resumenTxt;
      lineas.push([r.referencia10, r.cedula10, r.cuenta20, r.monto15].join(sepReal));
    }
    return lineas.join('\r\n');
  }

  // Modo alternativo: Sábana completa de 44 columnas
  if (sep === 'ancho_fijo') {
    if (incluirEnc) {
      lineas.push(
        COLUMNAS_CARGA_MASIVA_NOMINA.map((c) =>
          c.etiquetaCorta.toUpperCase().slice(0, c.anchoFijo).padEnd(c.anchoFijo, ' '),
        ).join(''),
      );
    }
    for (const f of filas) {
      const trama = COLUMNAS_CARGA_MASIVA_NOMINA.map((col, idx) => {
        const v = String(f.celdas[idx] ?? '');
        if (col.mascara.startsWith('0')) {
          return v.replace(/\D/g, '').padStart(col.anchoFijo, '0').slice(-col.anchoFijo);
        }
        return v.slice(0, col.anchoFijo).padEnd(col.anchoFijo, ' ');
      }).join('');
      lineas.push(trama);
    }
    return lineas.join('\r\n');
  }

  if (incluirEnc) {
    lineas.push(COLUMNAS_CARGA_MASIVA_NOMINA.map((c) => c.tituloPlanilla).join(sep));
  }
  for (const f of filas) {
    lineas.push(f.celdas.join(sep));
  }
  return lineas.join('\r\n');
}
