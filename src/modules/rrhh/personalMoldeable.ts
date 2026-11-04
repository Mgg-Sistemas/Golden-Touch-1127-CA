/* ============================================================
   Golden Touch · Recursos Humanos · Motor del Reporte Moldeable
   (04/11/2026)

   Motor de datos PURO y SÍNCRONO para el reporte de RRHH y Nómina GT,
   calcado de la arquitectura de Combustible (reporteMoldeable.ts) y
   Tesorería (reporteTesoreriaMoldeable.ts).

   Características clave:
     · Multi-empresa nativo con selección por casillas (checks): GT, MTO y nóminas creadas.
     · Filtros y agrupación por Carga Familiar (Con hijos / Sin hijos / Dependientes).
     · Preparado con ámbitos (scopes) y campos para Histórico Salarial e Histórico de Cargos.
     · Doble formato de presentación: Fichas Ejecutivas con métricas adaptables vs Tabla Tabular.
     · Cálculo de KPIs de cabecera: Personal total, Masa salarial ($ USD), Sueldo promedio,
       antigüedad y edad promedio, distribución por género y cargas familiares.
     · 100% determinista, libre de llamadas de red y testeable con Vitest.
   ============================================================ */

import type { EmpresaRrhh, Personal, PersonalFamiliar } from '@/shared/lib/types';
import {
  antiguedad,
  edad,
  hijosDe,
  labelEmpresa,
  labelEstadoCivil,
  labelGenero,
} from './fichaPersonal';
import { GRADOS } from './instruccionYTrabajo';

/* ───────────── Tipos de configuración ───────────── */

/** Ámbitos del reporte de personal (Directorio actual o futuros históricos). */
export type AmbitoReportePersonal =
  | 'directorio'
  | 'historico_salarial'
  | 'historico_cargos';

/** Dimensión principal de agrupación de las filas. */
export type ModoAgrupacionPersonal =
  | 'departamento'
  | 'cargo'
  | 'empresa'
  | 'estado'
  | 'genero'
  | 'hijos'
  | 'antiguedad'
  | 'grado_instruccion'
  | 'detallado';

/** Criterio de ordenación de las filas en el reporte. */
export type CriterioOrdenPersonal =
  | 'sueldo_desc'
  | 'sueldo_asc'
  | 'alfabetico'
  | 'antiguedad_desc'
  | 'cedula';

/** Formato de presentación del reporte. */
export type FormatoPresentacionPersonal = 'fichas' | 'tabla';

/** Orientación de la hoja en PDF. */
export type OrientacionReportePersonal = 'vertical' | 'horizontal';

/** Filtro triestado: todos, sí, no. */
export type FiltroTriestado = 'todos' | 'si' | 'no';

export interface OpcionesReportePersonal {
  ambito: AmbitoReportePersonal;
  agrupacion: ModoAgrupacionPersonal;
  formato: FormatoPresentacionPersonal;
  orientacion: OrientacionReportePersonal;
  orden: CriterioOrdenPersonal;
  columnas: string[];

  // Filtros secundarios
  empresasSel?: string[];
  departamentosSel?: string[];
  cargosSel?: string[];
  estadosSel?: string[]; // 'activos' | 'inactivos'
  generosSel?: string[];
  hijosFiltro?: FiltroTriestado;
  incluirResumen: boolean;
}

/* ───────────── Fila normalizada ───────────── */

export interface FilaReportePersonal {
  id: string;
  ambito: AmbitoReportePersonal;

  // Identificación
  ficha_nro: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  cedula: string;
  rif: string;
  nacionalidad: string;
  foto_url?: string | null;

  // Laboral y contractual
  empresa: EmpresaRrhh;
  empresa_nombre: string;
  cargo: string;
  departamento: string;
  activo: boolean;
  estado_texto: string;
  fecha_ingreso: string; // YYYY-MM-DD
  antiguedad_anos: number;
  antiguedad_meses: number;
  antiguedad_texto: string;
  carnet_vence: string;

  // Remuneración
  sueldo_base: number;
  sueldo_base_formato: string;

  // Carga familiar e hijos
  tiene_hijos: boolean;
  hijos_texto: string;
  cantidad_hijos: number;
  carga_familiar_total: number;
  nombres_hijos: string;

  // Datos sociodemográficos y salud
  fecha_nacimiento: string;
  edad: number | null;
  genero: string;
  genero_texto: string;
  estado_civil: string;
  estado_civil_texto: string;
  grado_instruccion: string;
  grado_instruccion_texto: string;
  titulo_obtenido: string;
  grupo_sanguineo: string;
  condicion_salud: string;

  // Contacto y ubicación
  telefono: string;
  correo: string;
  direccion: string;
  contacto_emergencia: string;
  parentesco_emergencia: string;
  telefono_emergencia: string;

  // Reservado para Histórico Salarial (futuras actualizaciones)
  sueldo_anterior?: number | null;
  fecha_ultimo_aumento?: string | null;
  variacion_sueldo_usd?: number | null;
  variacion_sueldo_pct?: number | null;
  motivo_ultimo_aumento?: string | null;
  total_aumentos?: number;

  // Reservado para Histórico de Cargos (futuras actualizaciones)
  cargo_anterior?: string | null;
  fecha_cambio_cargo?: string | null;
  motivo_cambio_cargo?: string | null;
  tiempo_en_cargo_actual?: string | null;

  // Métricas de grupo (cuando la fila representa un grupo o consolidado)
  total_personas?: number;
  total_activos?: number;
  total_inactivos?: number;
  masa_salarial_usd?: number;
  sueldo_promedio_usd?: number;
  pct_personal_total?: number;
  pct_masa_salarial?: number;
}

/* ───────────── Métricas de tarjeta para Fichas Ejecutivas ───────────── */

export interface MetricaFichaPersonal {
  clave: string;
  etiqueta: string;
  valor: string;
  sub?: string;
  colorHex: string;
  colorRgb: [number, number, number];
}

/* ───────────── Resumen y KPIs de cabecera ───────────── */

export interface ItemTopDepartamento {
  nombre: string;
  personal: number;
  masaSalarialUsd: number;
  porcentajePersonal: number;
}

export interface ResumenReportePersonal {
  totalPersonal: number;
  totalActivos: number;
  totalInactivos: number;
  masaSalarialTotalUsd: number;
  sueldoPromedioUsd: number;
  antiguedadPromedioAnos: number;
  edadPromedio: number | null;

  // Carga familiar
  conHijos: number;
  sinHijos: number;
  totalHijosRegistrados: number;

  // Sociodemográficos
  totalHombres: number;
  totalMujeres: number;
  totalOtroGenero: number;
  totalSinGenero: number;

  // Top Departamentos
  topDepartamentos: ItemTopDepartamento[];
  totalDepartamentos: number;
  totalEmpresas: number;
}

/* ───────────── Catálogo de Campos y Columnas ───────────── */

export interface CampoColumnaPersonal {
  clave: string;
  etiqueta: string;
  descripcion?: string;
  categoria: 'identificacion' | 'laboral' | 'remuneracion' | 'familia' | 'demografia' | 'contacto' | 'historico';
  anchoPdf: number;
  anchoExcel: number;
  alineacion: 'left' | 'right' | 'center';
  formato?: 'texto' | 'numero' | 'moneda' | 'fecha';
}

export const CAMPOS_REPORTE_PERSONAL: CampoColumnaPersonal[] = [
  // Identificación
  { clave: 'ficha_nro', etiqueta: 'Ficha N°', categoria: 'identificacion', anchoPdf: 16, anchoExcel: 10, alineacion: 'center', formato: 'texto' },
  { clave: 'nombre_completo', etiqueta: 'Nombres y Apellidos', categoria: 'identificacion', anchoPdf: 48, anchoExcel: 28, alineacion: 'left', formato: 'texto' },
  { clave: 'cedula', etiqueta: 'Cédula', categoria: 'identificacion', anchoPdf: 24, anchoExcel: 14, alineacion: 'center', formato: 'texto' },
  { clave: 'rif', etiqueta: 'RIF', categoria: 'identificacion', anchoPdf: 24, anchoExcel: 15, alineacion: 'center', formato: 'texto' },
  { clave: 'nacionalidad', etiqueta: 'Nacionalidad', categoria: 'identificacion', anchoPdf: 22, anchoExcel: 14, alineacion: 'left', formato: 'texto' },

  // Laboral
  { clave: 'empresa', etiqueta: 'Empresa / Nómina', categoria: 'laboral', anchoPdf: 28, anchoExcel: 18, alineacion: 'left', formato: 'texto' },
  { clave: 'cargo', etiqueta: 'Cargo', categoria: 'laboral', anchoPdf: 38, anchoExcel: 24, alineacion: 'left', formato: 'texto' },
  { clave: 'departamento', etiqueta: 'Departamento', categoria: 'laboral', anchoPdf: 34, anchoExcel: 22, alineacion: 'left', formato: 'texto' },
  { clave: 'estado_texto', etiqueta: 'Estado', categoria: 'laboral', anchoPdf: 18, anchoExcel: 12, alineacion: 'center', formato: 'texto' },
  { clave: 'fecha_ingreso', etiqueta: 'Fecha Ingreso', categoria: 'laboral', anchoPdf: 22, anchoExcel: 14, alineacion: 'center', formato: 'fecha' },
  { clave: 'antiguedad_texto', etiqueta: 'Antigüedad', categoria: 'laboral', anchoPdf: 24, anchoExcel: 15, alineacion: 'left', formato: 'texto' },
  { clave: 'carnet_vence', etiqueta: 'Venc. Carnet', categoria: 'laboral', anchoPdf: 22, anchoExcel: 14, alineacion: 'center', formato: 'fecha' },

  // Remuneración
  { clave: 'sueldo_base', etiqueta: 'Sueldo Base ($ USD)', categoria: 'remuneracion', anchoPdf: 26, anchoExcel: 16, alineacion: 'right', formato: 'moneda' },

  // Carga familiar e hijos
  { clave: 'hijos_texto', etiqueta: 'Hijos / Carga', categoria: 'familia', anchoPdf: 24, anchoExcel: 15, alineacion: 'center', formato: 'texto' },
  { clave: 'cantidad_hijos', etiqueta: 'Cant. Hijos', categoria: 'familia', anchoPdf: 18, anchoExcel: 12, alineacion: 'right', formato: 'numero' },
  { clave: 'nombres_hijos', etiqueta: 'Detalle Hijos', categoria: 'familia', anchoPdf: 40, anchoExcel: 30, alineacion: 'left', formato: 'texto' },

  // Demografía y Salud
  { clave: 'edad', etiqueta: 'Edad', categoria: 'demografia', anchoPdf: 14, anchoExcel: 8, alineacion: 'right', formato: 'numero' },
  { clave: 'genero_texto', etiqueta: 'Género', categoria: 'demografia', anchoPdf: 18, anchoExcel: 12, alineacion: 'center', formato: 'texto' },
  { clave: 'estado_civil_texto', etiqueta: 'Estado Civil', categoria: 'demografia', anchoPdf: 22, anchoExcel: 14, alineacion: 'center', formato: 'texto' },
  { clave: 'grado_instruccion_texto', etiqueta: 'Grado Instrucción', categoria: 'demografia', anchoPdf: 26, anchoExcel: 18, alineacion: 'left', formato: 'texto' },
  { clave: 'titulo_obtenido', etiqueta: 'Título / Especialidad', categoria: 'demografia', anchoPdf: 32, anchoExcel: 22, alineacion: 'left', formato: 'texto' },
  { clave: 'grupo_sanguineo', etiqueta: 'Grupo Sangre', categoria: 'demografia', anchoPdf: 16, anchoExcel: 10, alineacion: 'center', formato: 'texto' },
  { clave: 'condicion_salud', etiqueta: 'Condición Médica', categoria: 'demografia', anchoPdf: 30, anchoExcel: 20, alineacion: 'left', formato: 'texto' },

  // Contacto y Ubicación
  { clave: 'telefono', etiqueta: 'Teléfono', categoria: 'contacto', anchoPdf: 24, anchoExcel: 15, alineacion: 'center', formato: 'texto' },
  { clave: 'correo', etiqueta: 'Correo', categoria: 'contacto', anchoPdf: 36, anchoExcel: 25, alineacion: 'left', formato: 'texto' },
  { clave: 'direccion', etiqueta: 'Dirección', categoria: 'contacto', anchoPdf: 44, anchoExcel: 30, alineacion: 'left', formato: 'texto' },
  { clave: 'contacto_emergencia', etiqueta: 'Contacto Emergencia', categoria: 'contacto', anchoPdf: 32, anchoExcel: 22, alineacion: 'left', formato: 'texto' },
  { clave: 'telefono_emergencia', etiqueta: 'Tlf. Emergencia', categoria: 'contacto', anchoPdf: 24, anchoExcel: 15, alineacion: 'center', formato: 'texto' },

  // Histórico Salarial / Cargos (preparados para futuras actualizaciones)
  { clave: 'sueldo_anterior', etiqueta: 'Sueldo Anterior ($)', categoria: 'historico', anchoPdf: 24, anchoExcel: 16, alineacion: 'right', formato: 'moneda' },
  { clave: 'fecha_ultimo_aumento', etiqueta: 'Fecha Últ. Aumento', categoria: 'historico', anchoPdf: 22, anchoExcel: 14, alineacion: 'center', formato: 'fecha' },
  { clave: 'variacion_sueldo_pct', etiqueta: 'Var. Sueldo (%)', categoria: 'historico', anchoPdf: 20, anchoExcel: 12, alineacion: 'right', formato: 'numero' },
  { clave: 'cargo_anterior', etiqueta: 'Cargo Anterior', categoria: 'historico', anchoPdf: 32, anchoExcel: 22, alineacion: 'left', formato: 'texto' },
];

/** Presets de columnas por defecto según el modo de agrupación. */
export const CAMPOS_POR_DEFECTO_POR_MODO: Record<ModoAgrupacionPersonal, string[]> = {
  departamento: ['nombre_completo', 'cedula', 'cargo', 'sueldo_base', 'antiguedad_texto', 'hijos_texto', 'estado_texto'],
  cargo: ['nombre_completo', 'cedula', 'departamento', 'sueldo_base', 'antiguedad_texto', 'hijos_texto', 'estado_texto'],
  empresa: ['nombre_completo', 'cedula', 'departamento', 'cargo', 'sueldo_base', 'antiguedad_texto', 'estado_texto'],
  estado: ['nombre_completo', 'cedula', 'departamento', 'cargo', 'empresa', 'sueldo_base', 'fecha_ingreso'],
  genero: ['nombre_completo', 'cedula', 'departamento', 'cargo', 'edad', 'hijos_texto', 'sueldo_base'],
  hijos: ['nombre_completo', 'cedula', 'departamento', 'cargo', 'cantidad_hijos', 'nombres_hijos', 'sueldo_base'],
  antiguedad: ['nombre_completo', 'cedula', 'departamento', 'cargo', 'fecha_ingreso', 'antiguedad_texto', 'sueldo_base'],
  grado_instruccion: ['nombre_completo', 'cedula', 'departamento', 'cargo', 'titulo_obtenido', 'sueldo_base'],
  detallado: ['ficha_nro', 'nombre_completo', 'cedula', 'departamento', 'cargo', 'empresa', 'sueldo_base', 'antiguedad_texto', 'hijos_texto', 'telefono', 'estado_texto'],
};

export const CAMPOS_PRINCIPALES_PERSONAL: string[] = [
  'nombre_completo',
  'cedula',
  'cargo',
  'departamento',
  'empresa',
  'sueldo_base',
  'antiguedad_texto',
  'hijos_texto',
  'estado_texto',
];

/* ───────────── Helpers de Normalización y Formato ───────────── */

const txt = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim();

const fmtFecha = (f: string | null | undefined): string => {
  const d = String(f ?? '').slice(0, 10);
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '';
};

/** Redondeo a 2 decimales. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Formatea montos en moneda estadounidense: $ 1.250,00 */
export function formatearUsd(monto: number): string {
  return `$ ${Number(monto || 0).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Normaliza una entidad de Personal y su carga familiar en una fila plana.
 */
export function normalizarPersonal(
  p: Personal,
  familiaresMap?: Map<string, PersonalFamiliar[]>,
  ambito: AmbitoReportePersonal = 'directorio',
): FilaReportePersonal {
  const fam = familiaresMap?.get(p.id) ?? [];
  const hijos = hijosDe(fam);
  const tieneHijos = hijos.length > 0;
  const antig = antiguedad(p.fecha_ingreso);
  const antigAnios = antig?.anios ?? 0;
  const antigMeses = antig?.meses ?? 0;
  const antigTexto = antig?.texto ?? 'Recién ingresado';
  const edadCalculada = edad(p.fecha_nacimiento);
  const sueldo = round2(Number(p.sueldo_base) || 0);

  const nombres = txt(p.nombre);
  const apellidos = txt(p.apellido);
  const nombreCompleto = [apellidos, nombres].filter(Boolean).join(', ') || txt(p.cedula) || 'Sin nombre';

  const nombresHijos = hijos
    .map((h) => {
      const e = edad(h.fecha_nacimiento);
      return e !== null ? `${txt(h.nombre)} (${e}a)` : txt(h.nombre);
    })
    .filter(Boolean)
    .join(' · ');

  const gInst = GRADOS.find((g) => g.value === p.grado_instruccion)?.label ?? txt(p.grado_instruccion);
  const salud = [
    p.tiene_alergias ? `Alergia: ${txt(p.alergias_detalle) || 'Sí'}` : null,
    p.tiene_enfermedad ? `Condición: ${txt(p.enfermedad_detalle) || 'Sí'}` : null,
  ].filter(Boolean).join(' · ');

  return {
    id: p.id,
    ambito,

    // Identificación
    ficha_nro: txt(p.ficha_nro),
    nombre: nombres,
    apellido: apellidos,
    nombre_completo: nombreCompleto,
    cedula: txt(p.cedula),
    rif: txt(p.rif),
    nacionalidad: txt(p.nacionalidad),
    foto_url: p.foto_path || null,

    // Laboral
    empresa: p.empresa || 'GT',
    empresa_nombre: labelEmpresa(p.empresa),
    cargo: txt(p.cargo) || 'Sin cargo asignado',
    departamento: txt(p.departamento) || 'Sin departamento',
    activo: !!p.activo,
    estado_texto: p.activo ? 'Activo' : 'Inactivo',
    fecha_ingreso: fmtFecha(p.fecha_ingreso),
    antiguedad_anos: antigAnios,
    antiguedad_meses: antigMeses,
    antiguedad_texto: antigTexto,
    carnet_vence: fmtFecha(p.carnet_vence),

    // Remuneración
    sueldo_base: sueldo,
    sueldo_base_formato: formatearUsd(sueldo),

    // Carga familiar e hijos
    tiene_hijos: tieneHijos,
    hijos_texto: tieneHijos ? `${hijos.length} hijo(s)` : 'Sin hijos',
    cantidad_hijos: hijos.length,
    carga_familiar_total: fam.length,
    nombres_hijos: nombresHijos,

    // Sociodemográficos
    fecha_nacimiento: fmtFecha(p.fecha_nacimiento),
    edad: edadCalculada,
    genero: p.genero || '',
    genero_texto: labelGenero(p.genero) || 'No especificado',
    estado_civil: p.estado_civil || '',
    estado_civil_texto: labelEstadoCivil(p.estado_civil) || 'No especificado',
    grado_instruccion: p.grado_instruccion || '',
    grado_instruccion_texto: gInst || 'No especificado',
    titulo_obtenido: txt(p.titulo_obtenido),
    grupo_sanguineo: txt(p.grupo_sanguineo),
    condicion_salud: salud,

    // Contacto
    telefono: txt(p.telefono),
    correo: txt(p.correo),
    direccion: txt(p.direccion),
    contacto_emergencia: txt(p.contacto_emergencia),
    parentesco_emergencia: txt(p.contacto_emergencia_parentesco),
    telefono_emergencia: txt(p.telefono_emergencia),

    // Campos históricos preparados
    sueldo_anterior: null,
    fecha_ultimo_aumento: null,
    variacion_sueldo_usd: null,
    variacion_sueldo_pct: null,
    motivo_ultimo_aumento: null,
    total_aumentos: 0,
    cargo_anterior: null,
    fecha_cambio_cargo: null,
    motivo_cambio_cargo: null,
    tiempo_en_cargo_actual: null,
  };
}

/* ───────────── Filtrado en Memoria ───────────── */

export function filtrarFilasPersonal(
  filas: FilaReportePersonal[],
  opciones: Pick<
    OpcionesReportePersonal,
    'empresasSel' | 'departamentosSel' | 'cargosSel' | 'estadosSel' | 'generosSel' | 'hijosFiltro'
  >,
): FilaReportePersonal[] {
  const empSet = opciones.empresasSel && opciones.empresasSel.length > 0 ? new Set(opciones.empresasSel) : null;
  const depSet = opciones.departamentosSel && opciones.departamentosSel.length > 0 ? new Set(opciones.departamentosSel) : null;
  const carSet = opciones.cargosSel && opciones.cargosSel.length > 0 ? new Set(opciones.cargosSel) : null;
  const genSet = opciones.generosSel && opciones.generosSel.length > 0 ? new Set(opciones.generosSel) : null;
  const estSet = opciones.estadosSel && opciones.estadosSel.length > 0 ? new Set(opciones.estadosSel) : null;
  const hijosFiltro = opciones.hijosFiltro ?? 'todos';

  return filas.filter((f) => {
    // Si '__ninguno__' está marcado, no entra ninguna fila
    if (empSet?.has('__ninguno__') || depSet?.has('__ninguno__') || carSet?.has('__ninguno__')) {
      return false;
    }

    if (empSet && !empSet.has(f.empresa)) return false;
    if (depSet && !depSet.has(f.departamento)) return false;
    if (carSet && !carSet.has(f.cargo)) return false;
    if (genSet && !genSet.has(f.genero || 'sin_genero')) return false;

    if (estSet) {
      const estadoClave = f.activo ? 'activos' : 'inactivos';
      if (!estSet.has(estadoClave)) return false;
    }

    if (hijosFiltro === 'si' && !f.tiene_hijos) return false;
    if (hijosFiltro === 'no' && f.tiene_hijos) return false;

    return true;
  });
}

/* ───────────── Agrupación y Procesamiento de Reporte ───────────── */

export interface GrupoFilasPersonal {
  clave: string;
  titulo: string;
  subtitulo?: string;
  filas: FilaReportePersonal[];
  totalPersonas: number;
  totalActivos: number;
  totalInactivos: number;
  masaSalarialUsd: number;
  sueldoPromedioUsd: number;
  pctPersonalTotal: number;
  pctMasaSalarial: number;
}

export interface ResultadoProcesamientoPersonal {
  filasPlanasyOrdenadas: FilaReportePersonal[];
  grupos: GrupoFilasPersonal[];
  resumen: ResumenReportePersonal;
}

/**
 * Ordena un conjunto de filas según el criterio elegido.
 */
export function ordenarFilasPersonal(filas: FilaReportePersonal[], orden: CriterioOrdenPersonal): FilaReportePersonal[] {
  const copia = [...filas];
  switch (orden) {
    case 'sueldo_desc':
      return copia.sort((a, b) => b.sueldo_base - a.sueldo_base || a.nombre_completo.localeCompare(b.nombre_completo, 'es'));
    case 'sueldo_asc':
      return copia.sort((a, b) => a.sueldo_base - b.sueldo_base || a.nombre_completo.localeCompare(b.nombre_completo, 'es'));
    case 'antiguedad_desc':
      return copia.sort((a, b) => {
        const delta = (b.antiguedad_anos * 12 + b.antiguedad_meses) - (a.antiguedad_anos * 12 + a.antiguedad_meses);
        return delta !== 0 ? delta : a.nombre_completo.localeCompare(b.nombre_completo, 'es');
      });
    case 'cedula':
      return copia.sort((a, b) => a.cedula.localeCompare(b.cedula, 'es', { numeric: true }));
    case 'alfabetico':
    default:
      return copia.sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, 'es', { sensitivity: 'base' }));
  }
}

/**
 * Procesa y agrupa las filas de personal calculando subtotales, promedios y KPIs.
 */
export function procesarFilasReportePersonal(
  filasFiltradas: FilaReportePersonal[],
  agrupacion: ModoAgrupacionPersonal,
  orden: CriterioOrdenPersonal = 'alfabetico',
): ResultadoProcesamientoPersonal {
  const totalPersonal = filasFiltradas.length;
  let totalActivos = 0;
  let totalInactivos = 0;
  let masaSalarialTotalUsd = 0;
  let sumaEdades = 0;
  let cantConEdad = 0;
  let sumaMesesAntig = 0;
  let conHijos = 0;
  let sinHijos = 0;
  let totalHijosRegistrados = 0;
  let totalHombres = 0;
  let totalMujeres = 0;
  let totalOtroGenero = 0;
  let totalSinGenero = 0;

  const deptoMap = new Map<string, { personal: number; masa: number }>();
  const empresasSet = new Set<string>();

  for (const f of filasFiltradas) {
    if (f.activo) totalActivos++; else totalInactivos++;
    masaSalarialTotalUsd += f.sueldo_base;
    sumaMesesAntig += f.antiguedad_anos * 12 + f.antiguedad_meses;

    if (f.edad !== null) {
      sumaEdades += f.edad;
      cantConEdad++;
    }

    if (f.tiene_hijos) {
      conHijos++;
      totalHijosRegistrados += f.cantidad_hijos;
    } else {
      sinHijos++;
    }

    if (f.genero === 'M') totalHombres++;
    else if (f.genero === 'F') totalMujeres++;
    else if (f.genero) totalOtroGenero++;
    else totalSinGenero++;

    empresasSet.add(f.empresa);

    const d = f.departamento || 'Sin departamento';
    const regDepto = deptoMap.get(d) ?? { personal: 0, masa: 0 };
    regDepto.personal++;
    regDepto.masa += f.sueldo_base;
    deptoMap.set(d, regDepto);
  }

  const sueldoPromedioUsd = totalActivos > 0
    ? round2(masaSalarialTotalUsd / totalActivos)
    : (totalPersonal > 0 ? round2(masaSalarialTotalUsd / totalPersonal) : 0);

  const antiguedadPromedioAnos = totalPersonal > 0
    ? round2(sumaMesesAntig / totalPersonal / 12)
    : 0;

  const edadPromedio = cantConEdad > 0
    ? Math.round(sumaEdades / cantConEdad)
    : null;

  const topDepartamentos: ItemTopDepartamento[] = Array.from(deptoMap.entries())
    .map(([nombre, stat]) => ({
      nombre,
      personal: stat.personal,
      masaSalarialUsd: round2(stat.masa),
      porcentajePersonal: totalPersonal > 0 ? round2((stat.personal / totalPersonal) * 100) : 0,
    }))
    .sort((a, b) => b.personal - a.personal || b.masaSalarialUsd - a.masaSalarialUsd);

  const resumen: ResumenReportePersonal = {
    totalPersonal,
    totalActivos,
    totalInactivos,
    masaSalarialTotalUsd: round2(masaSalarialTotalUsd),
    sueldoPromedioUsd,
    antiguedadPromedioAnos,
    edadPromedio,
    conHijos,
    sinHijos,
    totalHijosRegistrados,
    totalHombres,
    totalMujeres,
    totalOtroGenero,
    totalSinGenero,
    topDepartamentos,
    totalDepartamentos: deptoMap.size,
    totalEmpresas: empresasSet.size,
  };

  // Agrupamiento
  const mapaGrupos = new Map<string, { titulo: string; subtitulo?: string; filas: FilaReportePersonal[] }>();

  const resolverClaveYEtiqueta = (f: FilaReportePersonal): { clave: string; titulo: string; subtitulo?: string } => {
    switch (agrupacion) {
      case 'departamento':
        return { clave: f.departamento, titulo: f.departamento.toUpperCase() };
      case 'cargo':
        return { clave: f.cargo, titulo: f.cargo.toUpperCase() };
      case 'empresa':
        return { clave: f.empresa, titulo: f.empresa_nombre.toUpperCase(), subtitulo: `Nómina ${f.empresa}` };
      case 'estado':
        return { clave: f.estado_texto, titulo: f.activo ? 'PERSONAL ACTIVO' : 'PERSONAL INACTIVO' };
      case 'genero':
        return { clave: f.genero || 'sin_genero', titulo: f.genero_texto.toUpperCase() };
      case 'hijos':
        return { clave: f.tiene_hijos ? 'con_hijos' : 'sin_hijos', titulo: f.tiene_hijos ? 'CON HIJOS A CARGO' : 'SIN HIJOS A CARGO' };
      case 'antiguedad': {
        const anos = f.antiguedad_anos;
        if (anos < 1) return { clave: 'menos_1', titulo: 'MENOS DE 1 AÑO DE ANTIGÜEDAD' };
        if (anos <= 3) return { clave: '1_a_3', titulo: 'DE 1 A 3 AÑOS DE ANTIGÜEDAD' };
        if (anos <= 5) return { clave: '3_a_5', titulo: 'DE 3 A 5 AÑOS DE ANTIGÜEDAD' };
        return { clave: 'mas_5', titulo: 'MÁS DE 5 AÑOS DE ANTIGÜEDAD' };
      }
      case 'grado_instruccion':
        return { clave: f.grado_instruccion || 'sin_grado', titulo: f.grado_instruccion_texto.toUpperCase() };
      case 'detallado':
      default:
        return { clave: 'general', titulo: 'DIRECTORIO DE PERSONAL' };
    }
  };

  for (const f of filasFiltradas) {
    const { clave, titulo, subtitulo } = resolverClaveYEtiqueta(f);
    const g = mapaGrupos.get(clave) ?? { titulo, subtitulo, filas: [] };
    g.filas.push(f);
    mapaGrupos.set(clave, g);
  }

  const grupos: GrupoFilasPersonal[] = Array.from(mapaGrupos.entries()).map(([clave, g]) => {
    const filasOrdenadas = ordenarFilasPersonal(g.filas, orden);
    let grupoMasa = 0;
    let grupoActivos = 0;
    let grupoInactivos = 0;

    for (const f of filasOrdenadas) {
      grupoMasa += f.sueldo_base;
      if (f.activo) grupoActivos++; else grupoInactivos++;
    }

    const pctPersonal = totalPersonal > 0 ? round2((filasOrdenadas.length / totalPersonal) * 100) : 0;
    const pctMasa = masaSalarialTotalUsd > 0 ? round2((grupoMasa / masaSalarialTotalUsd) * 100) : 0;

    // Asignar métricas de grupo a cada fila para los badges y fichas
    for (const f of filasOrdenadas) {
      f.total_personas = filasOrdenadas.length;
      f.pct_personal_total = pctPersonal;
      f.pct_masa_salarial = pctMasa;
    }

    return {
      clave,
      titulo: g.titulo,
      subtitulo: g.subtitulo,
      filas: filasOrdenadas,
      totalPersonas: filasOrdenadas.length,
      totalActivos: grupoActivos,
      totalInactivos: grupoInactivos,
      masaSalarialUsd: round2(grupoMasa),
      sueldoPromedioUsd: grupoActivos > 0 ? round2(grupoMasa / grupoActivos) : (filasOrdenadas.length > 0 ? round2(grupoMasa / filasOrdenadas.length) : 0),
      pctPersonalTotal: pctPersonal,
      pctMasaSalarial: pctMasa,
    };
  });

  // Ordenar grupos alfabéticamente por título o por masa salarial si aplica
  grupos.sort((a, b) => b.totalPersonas - a.totalPersonas || a.titulo.localeCompare(b.titulo, 'es'));

  const filasPlanasyOrdenadas = grupos.flatMap((g) => g.filas);

  return {
    filasPlanasyOrdenadas,
    grupos,
    resumen,
  };
}

/* ───────────── Generación Dinámica de Métricas para Fichas Ejecutivas ───────────── */

/**
 * Devuelve hasta 4 métricas visuales para la tarjeta ejecutiva, basándose
 * estrictamente en las columnas seleccionadas por el usuario.
 */
export function obtenerMetricasFichaPersonal(
  f: FilaReportePersonal,
  columnasSeleccionadas: string[],
): MetricaFichaPersonal[] {
  const metricas: MetricaFichaPersonal[] = [];
  const cols = new Set(columnasSeleccionadas);

  // 1. Sueldo Base (USD) - Verde institucional
  if (cols.has('sueldo_base')) {
    metricas.push({
      clave: 'sueldo_base',
      etiqueta: 'SUELDO BASE ($)',
      valor: f.sueldo_base_formato,
      sub: f.activo ? 'Vigente mensual' : 'Inactivo',
      colorHex: '#22c55e',
      colorRgb: [34, 197, 94],
    });
  }

  // 2. Antigüedad / Fecha Ingreso - Naranja institucional
  if (cols.has('antiguedad_texto') || cols.has('fecha_ingreso')) {
    metricas.push({
      clave: 'antiguedad',
      etiqueta: 'ANTIGÜEDAD',
      valor: f.antiguedad_texto,
      sub: f.fecha_ingreso ? `Ingreso: ${f.fecha_ingreso}` : 'Sin fecha',
      colorHex: '#f59e0b',
      colorRgb: [245, 158, 11],
    });
  }

  // 3. Carga Familiar / Hijos - Púrpura dinámico
  if (cols.has('hijos_texto') || cols.has('cantidad_hijos') || cols.has('nombres_hijos')) {
    metricas.push({
      clave: 'hijos',
      etiqueta: 'CARGA FAMILIAR',
      valor: f.tiene_hijos ? `${f.cantidad_hijos} hijo(s)` : 'Sin hijos',
      sub: f.carga_familiar_total > f.cantidad_hijos ? `${f.carga_familiar_total} dependientes` : (f.tiene_hijos ? 'Padre / Madre' : 'Sin dependientes'),
      colorHex: '#a855f7',
      colorRgb: [168, 85, 247],
    });
  }

  // 4. Edad / Sociodemográfico (si hay espacio y está marcado)
  if ((cols.has('edad') || cols.has('fecha_nacimiento') || cols.has('genero_texto')) && metricas.length < 4) {
    metricas.push({
      clave: 'edad',
      etiqueta: 'EDAD / GÉNERO',
      valor: f.edad !== null ? `${f.edad} años` : '—',
      sub: `${f.genero_texto} · ${f.estado_civil_texto}`,
      colorHex: '#06b6d4',
      colorRgb: [6, 182, 212],
    });
  }

  // 5. Teléfono / Contacto (si hay espacio y está marcado)
  if ((cols.has('telefono') || cols.has('correo')) && metricas.length < 4) {
    metricas.push({
      clave: 'contacto',
      etiqueta: 'CONTACTO',
      valor: f.telefono || 'Sin teléfono',
      sub: f.correo || 'Sin correo',
      colorHex: '#3b82f6',
      colorRgb: [59, 130, 246],
    });
  }

  // 6. Grado de Instrucción (si hay espacio y está marcado)
  if ((cols.has('grado_instruccion_texto') || cols.has('titulo_obtenido')) && metricas.length < 4) {
    metricas.push({
      clave: 'instruccion',
      etiqueta: 'INSTRUCCIÓN',
      valor: f.grado_instruccion_texto,
      sub: f.titulo_obtenido || 'Sin especialidad',
      colorHex: '#8b5cf6',
      colorRgb: [139, 92, 246],
    });
  }

  // Fallback si no seleccionó ninguna de las anteriores: Estado laboral
  if (metricas.length === 0) {
    metricas.push({
      clave: 'estado',
      etiqueta: 'ESTATUS',
      valor: f.estado_texto,
      sub: f.empresa_nombre,
      colorHex: f.activo ? '#10b981' : '#ef4444',
      colorRgb: f.activo ? [16, 185, 129] : [239, 68, 68],
    });
  }

  return metricas;
}
