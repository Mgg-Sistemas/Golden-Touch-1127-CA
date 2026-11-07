/* ============================================================
   Golden Touch · Administración (Gastos fijos) · repositorio
   Formas de persistencia (Empresa, GastoFijo) + CRUD. Los tipos de VALOR
   (Periodicidad, Moneda) son de administracionCalculo.ts (fuente única).
   Multi-empresa: la lista de empresas es PROPIA del módulo (admin_empresas),
   separada de RRHH; el gasto enlaza su empresa por `empresa_clave` (text).
   El acceso va detrás de una interfaz `AdminRepo`: la impl Supabase para la
   app, y una impl demo en memoria (demo/) para local sin base (D27).
   camelCase en el dominio; mapeo snake_case en el límite del repo.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { listCategoriasGasto, soloCategorias } from '@/modules/tesoreria/categoriasGasto.repository';
import { listProveedoresActivos } from '@/modules/pedidos/pedidos.repository';
import { crearServicioDirecto, enviarServicioAPagar } from '@/modules/pedidos/serviciosDirectos.repository';
import type { Moneda, Periodicidad } from './administracionCalculo';
import { generarPendientes as calcularPendientes, notaPendiente } from './administracionGenerar';
import { esErrorTablaAusente } from './adminErrores';

export type EstadoGastoFijo = 'activo' | 'suspendido';

/** Empresa propia de Administración (tabla `admin_empresas`). */
export interface Empresa {
  id: string;
  /** Código corto estable y único ('GT', 'MTO'…): el enlace del gasto. */
  clave: string;
  /** Razón social. */
  nombre: string;
  rif: string | null;
  moneda: Moneda | null;
  logoPath: string | null;
  activa: boolean;
  orden: number;
}
export type EmpresaInput = Omit<Empresa, 'id'>;

/** Centro de acopio de una empresa (tabla `admin_centros_acopio`). */
export interface CentroAcopio {
  id: string;
  empresaClave: string;
  nombre: string;
  orden: number;
  activo: boolean;
}
export type CentroAcopioInput = Omit<CentroAcopio, 'id'>;

/** Profesional de Administración (abogada, contador…). Lista PROPIA; NO son proveedores. */
export interface Profesional {
  id: string;
  nombre: string;
  profesion: string | null;
  contacto: string | null;
  activo: boolean;
}
export type ProfesionalInput = Omit<Profesional, 'id'>;

/** Carpeta de documentos (tabla `admin_carpetas`); anidable por `parentId`. */
export interface Carpeta {
  id: string;
  empresaClave: string | null;
  nombre: string;
  parentId: string | null;
  orden: number;
}
export type CarpetaInput = Omit<Carpeta, 'id'>;

/** Estado de una gestión. `abierta`/`anulada` se persisten; `parcial`/`saldada` se
 *  DERIVAN de los envíos pagados (ver administracionHonorarios.estadoGestion). */
export type EstadoGestion = 'abierta' | 'parcial' | 'saldada' | 'anulada';
/** Gestión / honorario (tabla `admin_gestiones`): renglón de nombre libre con costo,
 *  colgado de un profesional. El estado de cuenta por profesional se arma sobre esto. */
export interface Gestion {
  id: string;
  empresaClave: string;
  profesionalId: string | null;
  categoriaId: string | null;
  centroAcopioId: string | null;
  documentoId: string | null;
  concepto: string;
  costoTotal: number;
  moneda: Moneda;
  tasaRef: number | null;
  fecha: string;
  fechaPactada: string | null;
  estado: EstadoGestion;
  notaAcuerdo: string | null;
}
export type GestionInput = Omit<Gestion, 'id'>;

/** Plantilla recurrente de gasto fijo (tabla `admin_gastos_fijos`). */
export interface GastoFijo {
  id: string;
  empresaClave: string;
  concepto: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  categoriaGastoId: string | null;
  monto: number;
  moneda: Moneda;
  tasaRef: number | null;
  periodicidad: Periodicidad;
  /** Día del período en que vence (1–31); null = día 1. */
  diaVencimiento: number | null;
  /** Ancla para calcular los períodos ('AAAA-MM-DD'). */
  vigenteDesde: string;
  estado: EstadoGastoFijo;
  centroAcopioId?: string | null;
  responsable?: string | null;
  createdAt?: string | null;
}
export type GastoFijoInput = Omit<GastoFijo, 'id' | 'createdAt'>;

export type EstadoPago = 'pendiente' | 'pagado' | 'anulado';
export type OrigenMovimiento = 'generado' | 'importado' | 'manual';

/** Un egreso por período: el pendiente generado, el movimiento importado o el
 *  alta manual (tabla `admin_gasto_fijo_movimientos`). Sobre esto va el reporte. */
export interface Movimiento {
  id: string;
  empresaClave: string;
  /** Plantilla que lo originó; null para filas sueltas del histórico. */
  gastoFijoId: string | null;
  concepto: string;
  proveedorNombre: string | null;
  categoriaGastoId: string | null;
  /** Token de período (2026-11, 2026-T4…). */
  periodo: string;
  /** Vencimiento / fecha efectiva ('AAAA-MM-DD'). */
  fecha: string;
  monto: number;
  moneda: Moneda;
  tasaRef: number | null;
  estadoPago: EstadoPago;
  origen: OrigenMovimiento;
  /** El pendiente materializado en Tesorería (Opción A); null si aún no. */
  servicioDirectoId: string | null;
  createdAt?: string | null;
}
export type MovimientoInput = Omit<Movimiento, 'id' | 'createdAt'>;

/** Opción {id, nombre} para los selectores (categorías, proveedores). */
export interface OpcionRef { id: string; nombre: string; }

/** Categoría contable de gasto PROPIA del módulo (tabla `admin_categorias`).
 *  Un plan de cuentas curado para gastos fijos, separado del catálogo compartido
 *  `categorias_gasto`. Se gestiona desde la pestaña Configuración. */
export interface AdminCategoria { id: string; nombre: string; orden: number; activa: boolean; }

/** Status de vigencia y vencimiento (Documentos y Gastos). */
export type StatusVencimiento = 'vigente' | 'por_vencer' | 'vencido' | 'vencido_en_tramite' | 'no_vence';

export const STATUS_VENCIMIENTO_LABEL: Record<StatusVencimiento, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  vencido_en_tramite: 'Vencido en trámite',
  no_vence: 'No vence',
};

export const STATUS_VENCIMIENTO_COLOR: Record<StatusVencimiento, { color: string; bg: string; border: string }> = {
  vigente: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981' },
  por_vencer: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b' },
  vencido: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444' },
  vencido_en_tramite: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7' },
  no_vence: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8' },
};

/** Carpetas organizativas de archivos de Administración y Permisología Minera. */
export type CarpetaDocumento =
  | 'permisos_mineros'
  | 'laboral_parafiscal'
  | 'legal_constitutivo'
  | 'socios_representantes'
  | 'tributario_fiscal'
  | 'contratos_servicios'
  | 'otros';

export interface InfoCarpetaDoc {
  id: string;
  esPersonalizada?: boolean;
  icon: string;
  label: string;
  descripcion: string;
  centroAcopioId?: string | null;
  responsable?: string | null;
}

export const CARPETAS_DOCUMENTOS: InfoCarpetaDoc[] = [
  { id: 'permisos_mineros', icon: '⛏️', label: 'Permisos Mineros y Ambientales', descripcion: 'Rupdae, Ragda, Minería, MinEc y providencias', centroAcopioId: null, responsable: null },
  { id: 'laboral_parafiscal', icon: '⚖️', label: 'Laboral y Parafiscales', descripcion: 'Mintras, Inces, IVSS, FAOV y solvencias laborales', centroAcopioId: null, responsable: null },
  { id: 'legal_constitutivo', icon: '📜', label: 'Legal y Estatutario', descripcion: 'Carta / Acta Constitutiva, Asambleas y RIF', centroAcopioId: null, responsable: null },
  { id: 'socios_representantes', icon: '👥', label: 'Socios y Representantes', descripcion: 'Cédulas, RIFs y fichas de N socios', centroAcopioId: null, responsable: null },
  { id: 'tributario_fiscal', icon: '🏛️', label: 'Tributario y Municipal', descripcion: 'Patentes de Industria y Comercio, SENIAT y solvencias', centroAcopioId: null, responsable: null },
  { id: 'contratos_servicios', icon: '📑', label: 'Contratos y Acuerdos', descripcion: 'Convenios, arrendamientos y acuerdos operativos', centroAcopioId: null, responsable: null },
  { id: 'otros', icon: '📁', label: 'Otros Archivos', descripcion: 'Documentación general y respaldos', centroAcopioId: null, responsable: null },
];

export const ETIQUETA_CARPETA: Record<string, string> = {
  permisos_mineros: 'Permisos Mineros y Ambientales',
  laboral_parafiscal: 'Laboral y Parafiscales',
  legal_constitutivo: 'Legal y Estatutario',
  socios_representantes: 'Socios y Representantes',
  tributario_fiscal: 'Tributario y Municipal',
  contratos_servicios: 'Contratos y Acuerdos',
  otros: 'Otros Archivos',
};

/** Tipo de papel legal, permiso minero o solvencia. */
export type TipoDocumento =
  | 'rupdae'
  | 'ragda'
  | 'mintras'
  | 'inces'
  | 'ivss'
  | 'faov'
  | 'acta_constitutiva'
  | 'acta_modificacion'
  | 'rif'
  | 'cedula'
  | 'cedula_socio'
  | 'rif_socio'
  | 'patente_municipal'
  | 'solvencia_municipal'
  | 'permiso_ambiental'
  | 'permiso_minero'
  | 'otro';

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  rupdae: 'RUPDAE (Actividades Económicas)',
  ragda: 'RAGDA (Degradación Ambiental)',
  mintras: 'MINTRAS (Ministerio del Trabajo)',
  inces: 'INCES (Solvencia / Certificado)',
  ivss: 'IVSS (Seguro Social)',
  faov: 'FAOV / BANAVIH (Vivienda)',
  acta_constitutiva: 'Acta / Carta Constitutiva',
  acta_modificacion: 'Acta de Asamblea / Modificación',
  rif: 'RIF Jurídico',
  cedula: 'Cédula del Representante',
  cedula_socio: 'Cédula de Identidad (Socio)',
  rif_socio: 'RIF Personal (Socio)',
  patente_municipal: 'Patente de Industria y Comercio',
  solvencia_municipal: 'Solvencia Municipal',
  permiso_ambiental: 'Permiso Ambiental / MINEC',
  permiso_minero: 'Permiso / Concesión Minera',
  otro: 'Otro Documento',
};

/** Registro individual de historial ligero de cambios / auditoría por documento. */
export interface HistorialCambioDoc {
  id: string;
  fecha: string;
  actor: string;
  accion: 'creacion' | 'modificacion' | 'cambio_status' | 'renovacion' | 'archivo_reemplazado';
  detalle: string;
}

/** Documento (PDF/imagen) adjunto a una empresa (tabla `admin_empresa_documentos`
 *  + Storage bucket `admin-documentos`). Incluye vigencia, carpeta, metadatos mineros y auditoría. */
export interface DocumentoEmpresa {
  id: string;
  empresaClave: string;
  carpeta: string;
  centroAcopioId?: string | null;
  responsable?: string | null;
  tipo: TipoDocumento;
  nombre: string;
  /** Ruta en el bucket; con ella se pide la URL firmada. */
  path: string;
  contentType: string | null;
  tamano: number | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  statusVencimiento: StatusVencimiento;
  socioNombre: string | null;
  entidadEmisora: string | null;
  numeroRegistro: string | null;
  notaTramite: string | null;
  historial: HistorialCambioDoc[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentoEmpresaInput {
  empresaClave: string;
  carpeta?: string;
  centroAcopioId?: string | null;
  responsable?: string | null;
  tipo: TipoDocumento;
  nombre: string;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  statusVencimiento?: StatusVencimiento;
  socioNombre?: string | null;
  entidadEmisora?: string | null;
  numeroRegistro?: string | null;
  notaTramite?: string | null;
}

export function diasRestantes(fechaVencimiento: string | null | undefined, hoyRef?: string): number | null {
  if (!fechaVencimiento) return null;
  const hoyStr = hoyRef || new Date().toISOString().slice(0, 10);
  const [y1, m1, d1] = fechaVencimiento.split('-').map(Number);
  const [y2, m2, d2] = hoyStr.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;
  const f1 = Date.UTC(y1, m1 - 1, d1);
  const f2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((f1 - f2) / (1000 * 60 * 60 * 24));
}

export function calcularStatusVencimiento(
  fechaVencimiento: string | null | undefined,
  statusManual?: StatusVencimiento,
  diasUmbralAlerta = 30,
  hoyRef?: string,
): StatusVencimiento {
  if (statusManual === 'vencido_en_tramite') return 'vencido_en_tramite';
  if (statusManual === 'no_vence' || !fechaVencimiento) return 'no_vence';
  const dias = diasRestantes(fechaVencimiento, hoyRef);
  if (dias === null) return 'no_vence';
  if (dias < 0) return 'vencido';
  if (dias <= diasUmbralAlerta) return 'por_vencer';
  return 'vigente';
}

/** Infiere automáticamente carpeta y tipo de documento a partir del nombre del archivo. */
export function inferirCarpetaYTipo(nombreArchivo: string): { carpeta: CarpetaDocumento; tipo: TipoDocumento } {
  const s = nombreArchivo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/rupdae/i.test(s)) return { carpeta: 'permisos_mineros', tipo: 'rupdae' };
  if (/ragda/i.test(s)) return { carpeta: 'permisos_mineros', tipo: 'ragda' };
  if (/miner|concesion|minec|ambient/i.test(s)) return { carpeta: 'permisos_mineros', tipo: 'permiso_minero' };
  if (/mintra/i.test(s)) return { carpeta: 'laboral_parafiscal', tipo: 'mintras' };
  if (/inces/i.test(s)) return { carpeta: 'laboral_parafiscal', tipo: 'inces' };
  if (/ivss|seguro/i.test(s)) return { carpeta: 'laboral_parafiscal', tipo: 'ivss' };
  if (/faov|banavih|habitat/i.test(s)) return { carpeta: 'laboral_parafiscal', tipo: 'faov' };
  if (/carta.*const|acta.*const/i.test(s)) return { carpeta: 'legal_constitutivo', tipo: 'acta_constitutiva' };
  if (/asamble|modific/i.test(s)) return { carpeta: 'legal_constitutivo', tipo: 'acta_modificacion' };
  if (/rif.*socio|rif.*personal/i.test(s)) return { carpeta: 'socios_representantes', tipo: 'rif_socio' };
  if (/rif/i.test(s)) return { carpeta: 'legal_constitutivo', tipo: 'rif' };
  if (/socio|accionista|cedula/i.test(s)) return { carpeta: 'socios_representantes', tipo: 'cedula_socio' };
  if (/patente|alcald|municip/i.test(s)) return { carpeta: 'tributario_fiscal', tipo: 'patente_municipal' };
  if (/contrat|arrendam/i.test(s)) return { carpeta: 'contratos_servicios', tipo: 'otro' };
  return { carpeta: 'otros', tipo: 'otro' };
}

/** Puerto de datos del módulo. La página lo recibe inyectado: Supabase en la
 *  app; una impl en memoria en la página de prueba (DEV). */
export interface AdminRepo {
  listEmpresas(): Promise<Empresa[]>;
  crearEmpresa(e: EmpresaInput): Promise<Empresa>;
  editarEmpresa(id: string, cambios: Partial<EmpresaInput>): Promise<void>;
  /** Cuántos gastos fijos cuelgan de una empresa (para decidir borrar vs desactivar). */
  contarGastosDeEmpresa(clave: string): Promise<number>;
  desactivarEmpresa(id: string): Promise<void>;
  borrarEmpresa(id: string): Promise<void>;
  // Centros de acopio
  listCentros(empresaClave?: string): Promise<CentroAcopio[]>;
  crearCentro(c: CentroAcopioInput): Promise<CentroAcopio>;
  editarCentro(id: string, cambios: Partial<CentroAcopioInput>): Promise<void>;
  setActivoCentro(id: string, activo: boolean): Promise<void>;
  // Profesionales (abogada, contador…)
  listProfesionales(): Promise<Profesional[]>;
  crearProfesional(p: ProfesionalInput): Promise<Profesional>;
  editarProfesional(id: string, cambios: Partial<ProfesionalInput>): Promise<void>;
  setActivoProfesional(id: string, activo: boolean): Promise<void>;
  // Carpetas de documentos (anidables)
  listCarpetas(empresaClave?: string): Promise<Carpeta[]>;
  crearCarpeta(c: CarpetaInput): Promise<Carpeta>;
  editarCarpeta(id: string, cambios: Partial<CarpetaInput>): Promise<void>;
  borrarCarpeta(id: string): Promise<void>;
  // Gestiones (honorarios)
  listGestiones(empresaClave?: string, profesionalId?: string): Promise<Gestion[]>;
  crearGestion(g: GestionInput): Promise<Gestion>;
  editarGestion(id: string, cambios: Partial<GestionInput>): Promise<void>;
  anularGestion(id: string): Promise<void>;
  listGastosFijos(empresaClave?: string): Promise<GastoFijo[]>;
  crearGastoFijo(g: GastoFijoInput): Promise<GastoFijo>;
  editarGastoFijo(id: string, cambios: Partial<GastoFijoInput>): Promise<void>;
  setEstadoGastoFijo(id: string, estado: EstadoGastoFijo): Promise<void>;
  /** Categorías activas del módulo, para los selectores (id, nombre). */
  listCategorias(): Promise<OpcionRef[]>;
  /** Todas las categorías del módulo (incluye inactivas), para gestionarlas en Configuración. */
  listAdminCategorias(): Promise<AdminCategoria[]>;
  crearAdminCategoria(nombre: string): Promise<AdminCategoria>;
  renombrarAdminCategoria(id: string, nombre: string): Promise<void>;
  setActivaAdminCategoria(id: string, activa: boolean): Promise<void>;
  listProveedores(): Promise<OpcionRef[]>;
  listMovimientos(empresaClave?: string): Promise<Movimiento[]>;
  crearMovimiento(m: MovimientoInput): Promise<Movimiento>;
  editarMovimiento(id: string, cambios: Partial<MovimientoInput>): Promise<void>;
  /** Anula un movimiento (estado_pago = 'anulado'); queda fuera de los totales del reporte. */
  anularMovimiento(id: string): Promise<void>;
  /** Genera los pendientes que faltan hasta `hasta` (default hoy), idempotente. Devuelve cuántos creó. */
  generarPendientes(empresaClave?: string, hasta?: Date): Promise<{ creados: number }>;
  marcarPagado(id: string): Promise<void>;
  /** Papeles legales y permisos (RIF, actas, Rupdae, Mintras…), más recientes primero. */
  listDocumentos(empresaClave?: string): Promise<DocumentoEmpresa[]>;
  /** Sube un PDF/imagen al bucket y lo registra con metadatos y auditoría inicial. */
  subirDocumento(empresaClave: string, tipo: TipoDocumento, file: File, meta?: Partial<DocumentoEmpresaInput>, actor?: string): Promise<DocumentoEmpresa>;
  /** Actualiza metadatos de un documento y registra un cambio en su historial ligero de auditoría. */
  editarDocumento(id: string, cambios: Partial<DocumentoEmpresaInput>, actor?: string, detalle?: string): Promise<DocumentoEmpresa>;
  /** URL firmada (10 min) para previsualizar/descargar. */
  urlDocumento(path: string): Promise<string>;
  /** Borra el registro y luego el archivo del bucket. */
  borrarDocumento(doc: DocumentoEmpresa): Promise<void>;
}

/* ───────── Mapeo snake_case (fila de base) ↔ camelCase (dominio) ───────── */

interface RowEmpresa {
  id: string; clave: string; nombre: string; rif: string | null; moneda: string | null;
  logo_path: string | null; activa: boolean | null; orden: number | null;
}
interface RowGasto {
  id: string; empresa_clave: string; concepto: string; proveedor_id: string | null; proveedor_nombre: string | null;
  categoria_gasto_id: string | null; monto: number | string; moneda: string; tasa_ref: number | string | null;
  periodicidad: string; dia_vencimiento: number | null; vigente_desde: string; estado: string;
  centro_acopio_id?: string | null; responsable?: string | null; created_at?: string | null;
}
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function aEmpresa(r: RowEmpresa): Empresa {
  return {
    id: r.id, clave: r.clave, nombre: r.nombre, rif: r.rif ?? null,
    moneda: (r.moneda as Moneda) ?? null, logoPath: r.logo_path ?? null,
    activa: r.activa !== false, orden: r.orden ?? 0,
  };
}
function deEmpresa(e: Partial<EmpresaInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (e.clave !== undefined) o.clave = e.clave;
  if (e.nombre !== undefined) o.nombre = e.nombre;
  if (e.rif !== undefined) o.rif = e.rif;
  if (e.moneda !== undefined) o.moneda = e.moneda;
  if (e.logoPath !== undefined) o.logo_path = e.logoPath;
  if (e.activa !== undefined) o.activa = e.activa;
  if (e.orden !== undefined) o.orden = e.orden;
  return o;
}
function aGasto(r: RowGasto): GastoFijo {
  return {
    id: r.id, empresaClave: r.empresa_clave, concepto: r.concepto,
    proveedorId: r.proveedor_id ?? null, proveedorNombre: r.proveedor_nombre ?? null,
    categoriaGastoId: r.categoria_gasto_id ?? null, monto: num(r.monto), moneda: r.moneda as Moneda,
    tasaRef: r.tasa_ref == null ? null : num(r.tasa_ref), periodicidad: r.periodicidad as Periodicidad,
    diaVencimiento: r.dia_vencimiento ?? null, vigenteDesde: (r.vigente_desde ?? '').slice(0, 10),
    estado: (r.estado as EstadoGastoFijo) ?? 'activo',
    centroAcopioId: r.centro_acopio_id ?? null,
    responsable: r.responsable ?? null,
    createdAt: r.created_at ?? null,
  };
}
function deGasto(g: Partial<GastoFijoInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (g.empresaClave !== undefined) o.empresa_clave = g.empresaClave;
  if (g.concepto !== undefined) o.concepto = g.concepto;
  if (g.proveedorId !== undefined) o.proveedor_id = g.proveedorId;
  if (g.proveedorNombre !== undefined) o.proveedor_nombre = g.proveedorNombre;
  if (g.categoriaGastoId !== undefined) o.categoria_gasto_id = g.categoriaGastoId;
  if (g.monto !== undefined) o.monto = g.monto;
  if (g.moneda !== undefined) o.moneda = g.moneda;
  if (g.tasaRef !== undefined) o.tasa_ref = g.tasaRef;
  if (g.periodicidad !== undefined) o.periodicidad = g.periodicidad;
  if (g.diaVencimiento !== undefined) o.dia_vencimiento = g.diaVencimiento;
  if (g.vigenteDesde !== undefined) o.vigente_desde = g.vigenteDesde;
  if (g.estado !== undefined) o.estado = g.estado;
  if (g.centroAcopioId !== undefined) o.centro_acopio_id = g.centroAcopioId;
  if (g.responsable !== undefined) o.responsable = g.responsable;
  return o;
}

interface RowMov {
  id: string; empresa_clave: string; gasto_fijo_id: string | null; concepto: string; proveedor_nombre: string | null;
  categoria_gasto_id: string | null; periodo: string; fecha: string; monto: number | string; moneda: string;
  tasa_ref: number | string | null; estado_pago: string; origen: string; servicio_directo_id: string | null; created_at?: string | null;
}
function aMov(r: RowMov): Movimiento {
  return {
    id: r.id, empresaClave: r.empresa_clave, gastoFijoId: r.gasto_fijo_id ?? null, concepto: r.concepto,
    proveedorNombre: r.proveedor_nombre ?? null, categoriaGastoId: r.categoria_gasto_id ?? null,
    periodo: r.periodo, fecha: (r.fecha ?? '').slice(0, 10), monto: num(r.monto), moneda: r.moneda as Moneda,
    tasaRef: r.tasa_ref == null ? null : num(r.tasa_ref), estadoPago: (r.estado_pago as EstadoPago) ?? 'pendiente',
    origen: (r.origen as OrigenMovimiento) ?? 'manual', servicioDirectoId: r.servicio_directo_id ?? null, createdAt: r.created_at ?? null,
  };
}
function deMov(m: Partial<MovimientoInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (m.empresaClave !== undefined) o.empresa_clave = m.empresaClave;
  if (m.gastoFijoId !== undefined) o.gasto_fijo_id = m.gastoFijoId;
  if (m.concepto !== undefined) o.concepto = m.concepto;
  if (m.proveedorNombre !== undefined) o.proveedor_nombre = m.proveedorNombre;
  if (m.categoriaGastoId !== undefined) o.categoria_gasto_id = m.categoriaGastoId;
  if (m.periodo !== undefined) o.periodo = m.periodo;
  if (m.fecha !== undefined) o.fecha = m.fecha;
  if (m.monto !== undefined) o.monto = m.monto;
  if (m.moneda !== undefined) o.moneda = m.moneda;
  if (m.tasaRef !== undefined) o.tasa_ref = m.tasaRef;
  if (m.estadoPago !== undefined) o.estado_pago = m.estadoPago;
  if (m.origen !== undefined) o.origen = m.origen;
  if (m.servicioDirectoId !== undefined) o.servicio_directo_id = m.servicioDirectoId;
  return o;
}

interface RowCentro { id: string; empresa_clave: string; nombre: string; orden: number | null; activo: boolean | null }
function aCentro(r: RowCentro): CentroAcopio {
  return { id: r.id, empresaClave: r.empresa_clave, nombre: r.nombre, orden: r.orden ?? 0, activo: r.activo !== false };
}
function deCentro(c: Partial<CentroAcopioInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (c.empresaClave !== undefined) o.empresa_clave = c.empresaClave;
  if (c.nombre !== undefined) o.nombre = c.nombre;
  if (c.orden !== undefined) o.orden = c.orden;
  if (c.activo !== undefined) o.activo = c.activo;
  return o;
}
interface RowProfesional { id: string; nombre: string; profesion: string | null; contacto: string | null; activo: boolean | null }
function aProfesional(r: RowProfesional): Profesional {
  return { id: r.id, nombre: r.nombre, profesion: r.profesion ?? null, contacto: r.contacto ?? null, activo: r.activo !== false };
}
function deProfesional(p: Partial<ProfesionalInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (p.nombre !== undefined) o.nombre = p.nombre;
  if (p.profesion !== undefined) o.profesion = p.profesion;
  if (p.contacto !== undefined) o.contacto = p.contacto;
  if (p.activo !== undefined) o.activo = p.activo;
  return o;
}
interface RowCarpeta { id: string; empresa_clave: string | null; nombre: string; parent_id: string | null; orden: number | null }
function aCarpeta(r: RowCarpeta): Carpeta {
  return { id: r.id, empresaClave: r.empresa_clave ?? null, nombre: r.nombre, parentId: r.parent_id ?? null, orden: r.orden ?? 0 };
}
function deCarpeta(c: Partial<CarpetaInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (c.empresaClave !== undefined) o.empresa_clave = c.empresaClave;
  if (c.nombre !== undefined) o.nombre = c.nombre;
  if (c.parentId !== undefined) o.parent_id = c.parentId;
  if (c.orden !== undefined) o.orden = c.orden;
  return o;
}
interface RowGestion {
  id: string; empresa_clave: string; profesional_id: string | null; categoria_id: string | null;
  centro_acopio_id: string | null; documento_id: string | null; concepto: string;
  costo_total: number | string | null; moneda: string | null; tasa_ref: number | string | null;
  fecha: string; fecha_pactada: string | null; estado: string | null; nota_acuerdo: string | null;
}
function aGestion(r: RowGestion): Gestion {
  return {
    id: r.id, empresaClave: r.empresa_clave, profesionalId: r.profesional_id ?? null,
    categoriaId: r.categoria_id ?? null, centroAcopioId: r.centro_acopio_id ?? null,
    documentoId: r.documento_id ?? null, concepto: r.concepto,
    costoTotal: r.costo_total == null ? 0 : num(r.costo_total),
    moneda: r.moneda === 'Bs' ? 'Bs' : 'USD',
    tasaRef: r.tasa_ref == null ? null : num(r.tasa_ref),
    fecha: r.fecha ? r.fecha.slice(0, 10) : r.fecha,
    fechaPactada: r.fecha_pactada ? r.fecha_pactada.slice(0, 10) : null,
    estado: (r.estado as EstadoGestion) || 'abierta',
    notaAcuerdo: r.nota_acuerdo ?? null,
  };
}
function deGestion(g: Partial<GestionInput>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (g.empresaClave !== undefined) o.empresa_clave = g.empresaClave;
  if (g.profesionalId !== undefined) o.profesional_id = g.profesionalId;
  if (g.categoriaId !== undefined) o.categoria_id = g.categoriaId;
  if (g.centroAcopioId !== undefined) o.centro_acopio_id = g.centroAcopioId;
  if (g.documentoId !== undefined) o.documento_id = g.documentoId;
  if (g.concepto !== undefined) o.concepto = g.concepto;
  if (g.costoTotal !== undefined) o.costo_total = g.costoTotal;
  if (g.moneda !== undefined) o.moneda = g.moneda;
  if (g.tasaRef !== undefined) o.tasa_ref = g.tasaRef;
  if (g.fecha !== undefined) o.fecha = g.fecha;
  if (g.fechaPactada !== undefined) o.fecha_pactada = g.fechaPactada;
  if (g.estado !== undefined) o.estado = g.estado;
  if (g.notaAcuerdo !== undefined) o.nota_acuerdo = g.notaAcuerdo;
  return o;
}
const T_CEN = 'admin_centros_acopio';
const T_PROF = 'admin_profesionales';
const T_CARP = 'admin_carpetas';
const T_GES = 'admin_gestiones';
const T_EMP = 'admin_empresas';
const T_GF = 'admin_gastos_fijos';
const T_MOV = 'admin_gasto_fijo_movimientos';
const T_DOC = 'admin_empresa_documentos';
const T_CAT = 'admin_categorias';
const BUCKET_DOCS = 'admin-documentos';

interface RowDoc {
  id: string;
  empresa_clave: string;
  tipo: string;
  nombre: string;
  path: string;
  content_type: string | null;
  tamano: number | string | null;
  carpeta?: string | null;
  centro_acopio_id?: string | null;
  responsable?: string | null;
  fecha_vencimiento?: string | null;
  fecha_emision?: string | null;
  status_vencimiento?: string | null;
  socio_nombre?: string | null;
  entidad_emisora?: string | null;
  numero_registro?: string | null;
  nota_tramite?: string | null;
  historial?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
}

function aDoc(r: RowDoc): DocumentoEmpresa {
  const fVenc = r.fecha_vencimiento ? r.fecha_vencimiento.slice(0, 10) : null;
  const statusRaw = (r.status_vencimiento as StatusVencimiento) || undefined;
  const status = calcularStatusVencimiento(fVenc, statusRaw);

  let hist: HistorialCambioDoc[] = [];
  if (Array.isArray(r.historial)) {
    hist = r.historial as HistorialCambioDoc[];
  } else if (typeof r.historial === 'string') {
    try { hist = JSON.parse(r.historial); } catch { hist = []; }
  }

  return {
    id: r.id,
    empresaClave: r.empresa_clave,
    carpeta: r.carpeta || 'otros',
    centroAcopioId: r.centro_acopio_id ?? null,
    responsable: r.responsable ?? null,
    tipo: (r.tipo as TipoDocumento) || 'otro',
    nombre: r.nombre,
    path: r.path,
    contentType: r.content_type ?? null,
    tamano: r.tamano == null ? null : num(r.tamano),
    fechaEmision: r.fecha_emision ? r.fecha_emision.slice(0, 10) : null,
    fechaVencimiento: fVenc,
    statusVencimiento: status,
    socioNombre: r.socio_nombre ?? null,
    entidadEmisora: r.entidad_emisora ?? null,
    numeroRegistro: r.numero_registro ?? null,
    notaTramite: r.nota_tramite ?? null,
    historial: hist,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}
interface RowCat { id: string; nombre: string; orden: number | string | null; activa: boolean | null; }
function aCategoria(r: RowCat): AdminCategoria {
  return { id: r.id, nombre: r.nombre, orden: r.orden == null ? 0 : num(r.orden), activa: r.activa !== false };
}
/** Ruta única del archivo en el bucket: <empresa>/<stamp>-<nombre saneado>. */
function rutaDoc(empresaClave: string, nombre: string): string {
  const stamp = `${Math.floor(performance.now()).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const safe = nombre.replace(/[^\w.-]+/g, '_').slice(-80);
  return `${empresaClave}/${stamp}-${safe}`;
}

/** Impl contra Supabase (la app real). Las tablas las crea BD (SQL en borrador). */
export function crearRepoSupabase(): AdminRepo {
  return {
    async listEmpresas() {
      const { data, error } = await supabase.from(T_EMP).select('*').order('orden').order('clave');
      if (error) throw error;
      return (data ?? []).map((r) => aEmpresa(r as RowEmpresa));
    },
    async crearEmpresa(e) {
      const { data, error } = await supabase.from(T_EMP).insert(deEmpresa(e)).select('*').single();
      if (error) throw error;
      return aEmpresa(data as RowEmpresa);
    },
    async editarEmpresa(id, cambios) {
      const { error } = await supabase.from(T_EMP).update(deEmpresa(cambios)).eq('id', id);
      if (error) throw error;
    },
    async contarGastosDeEmpresa(clave) {
      const { count, error } = await supabase.from(T_GF).select('id', { count: 'exact', head: true }).eq('empresa_clave', clave);
      if (error) throw error;
      return count ?? 0;
    },
    async desactivarEmpresa(id) {
      const { error } = await supabase.from(T_EMP).update({ activa: false }).eq('id', id);
      if (error) throw error;
    },
    async borrarEmpresa(id) {
      const { error } = await supabase.from(T_EMP).delete().eq('id', id);
      if (error) throw error;
    },
    async listCentros(empresaClave) {
      let q = supabase.from(T_CEN).select('*').order('orden').order('nombre');
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      const { data, error } = await q;
      if (error) {
        if (esErrorTablaAusente(error)) return [];
        throw error;
      }
      return (data ?? []).map((r) => aCentro(r as RowCentro));
    },
    async crearCentro(c) {
      const { data, error } = await supabase.from(T_CEN).insert(deCentro(c)).select('*').single();
      if (error) throw error;
      return aCentro(data as RowCentro);
    },
    async editarCentro(id, cambios) {
      const { error } = await supabase.from(T_CEN).update(deCentro(cambios)).eq('id', id);
      if (error) throw error;
    },
    async setActivoCentro(id, activo) {
      const { error } = await supabase.from(T_CEN).update({ activo }).eq('id', id);
      if (error) throw error;
    },
    async listProfesionales() {
      const { data, error } = await supabase.from(T_PROF).select('*').order('nombre');
      if (error) {
        if (esErrorTablaAusente(error)) return [];
        throw error;
      }
      return (data ?? []).map((r) => aProfesional(r as RowProfesional));
    },
    async crearProfesional(p) {
      const { data, error } = await supabase.from(T_PROF).insert(deProfesional(p)).select('*').single();
      if (error) throw error;
      return aProfesional(data as RowProfesional);
    },
    async editarProfesional(id, cambios) {
      const { error } = await supabase.from(T_PROF).update(deProfesional(cambios)).eq('id', id);
      if (error) throw error;
    },
    async setActivoProfesional(id, activo) {
      const { error } = await supabase.from(T_PROF).update({ activo }).eq('id', id);
      if (error) throw error;
    },
    async listCarpetas(empresaClave) {
      let q = supabase.from(T_CARP).select('*').order('orden').order('nombre');
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      const { data, error } = await q;
      if (error) {
        if (esErrorTablaAusente(error)) return [];
        throw error;
      }
      return (data ?? []).map((r) => aCarpeta(r as RowCarpeta));
    },
    async crearCarpeta(c) {
      const { data, error } = await supabase.from(T_CARP).insert(deCarpeta(c)).select('*').single();
      if (error) throw error;
      return aCarpeta(data as RowCarpeta);
    },
    async editarCarpeta(id, cambios) {
      const { error } = await supabase.from(T_CARP).update(deCarpeta(cambios)).eq('id', id);
      if (error) throw error;
    },
    async borrarCarpeta(id) {
      const { error } = await supabase.from(T_CARP).delete().eq('id', id);
      if (error) throw error;
    },
    async listGestiones(empresaClave, profesionalId) {
      let q = supabase.from(T_GES).select('*').order('fecha', { ascending: false });
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      if (profesionalId) q = q.eq('profesional_id', profesionalId);
      const { data, error } = await q;
      if (error) {
        if (esErrorTablaAusente(error)) return [];
        throw error;
      }
      return (data ?? []).map((r) => aGestion(r as RowGestion));
    },
    async crearGestion(g) {
      const { data, error } = await supabase.from(T_GES).insert(deGestion(g)).select('*').single();
      if (error) throw error;
      return aGestion(data as RowGestion);
    },
    async editarGestion(id, cambios) {
      const { error } = await supabase.from(T_GES).update(deGestion(cambios)).eq('id', id);
      if (error) throw error;
    },
    async anularGestion(id) {
      const { error } = await supabase.from(T_GES).update({ estado: 'anulada' }).eq('id', id);
      if (error) throw error;
    },
    async listGastosFijos(empresaClave) {
      let q = supabase.from(T_GF).select('*').order('concepto');
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => aGasto(r as RowGasto));
    },
    async crearGastoFijo(g) {
      const payload = deGasto(g);
      let { data, error } = await supabase.from(T_GF).insert(payload).select('*').single();
      if (error && (error.code === 'PGRST204' || /column.*does not exist/i.test(error.message))) {
        const { centro_acopio_id, responsable, ...basePayload } = payload;
        const resBase = await supabase.from(T_GF).insert(basePayload).select('*').single();
        data = resBase.data;
        error = resBase.error;
      }
      if (error) throw error;
      return aGasto(data as RowGasto);
    },
    async editarGastoFijo(id, cambios) {
      const payload = deGasto(cambios);
      let { error } = await supabase.from(T_GF).update(payload).eq('id', id);
      if (error && (error.code === 'PGRST204' || /column.*does not exist/i.test(error.message))) {
        const { centro_acopio_id, responsable, ...basePayload } = payload;
        const resBase = await supabase.from(T_GF).update(basePayload).eq('id', id);
        error = resBase.error;
      }
      if (error) throw error;
    },
    async setEstadoGastoFijo(id, estado) {
      const { error } = await supabase.from(T_GF).update({ estado }).eq('id', id);
      if (error) throw error;
    },
    async listCategorias() {
      // Lista PROPIA del módulo. Si la base aún no tiene admin_categorias (04 sin aplicar),
      // cae al catálogo compartido pero solo categorías padre, para no romper mientras tanto.
      const { data, error } = await supabase.from(T_CAT).select('id,nombre').eq('activa', true).order('orden').order('nombre');
      if (!error) return (data ?? []).map((r) => ({ id: String((r as { id: string }).id), nombre: String((r as { nombre: string }).nombre) }));
      if (esErrorTablaAusente(error)) {
        const rows = await listCategoriasGasto(true);
        return soloCategorias(rows).map((c) => ({ id: c.id, nombre: c.nombre }));
      }
      throw error;
    },
    async listAdminCategorias() {
      const { data, error } = await supabase.from(T_CAT).select('*').order('orden').order('nombre');
      if (error) {
        if (esErrorTablaAusente(error)) return [];
        throw error;
      }
      return (data ?? []).map((r) => aCategoria(r as RowCat));
    },
    async crearAdminCategoria(nombre) {
      const n = nombre.trim();
      if (!n) throw new Error('El nombre de la categoría es obligatorio.');
      const { data, error } = await supabase.from(T_CAT).insert({ nombre: n }).select('*').single();
      if (error) throw error;
      return aCategoria(data as RowCat);
    },
    async renombrarAdminCategoria(id, nombre) {
      const n = nombre.trim();
      if (!n) throw new Error('El nombre de la categoría es obligatorio.');
      const { error } = await supabase.from(T_CAT).update({ nombre: n }).eq('id', id);
      if (error) throw error;
    },
    async setActivaAdminCategoria(id, activa) {
      const { error } = await supabase.from(T_CAT).update({ activa }).eq('id', id);
      if (error) throw error;
    },
    async listProveedores() {
      const ps = await listProveedoresActivos();
      return ps.map((p) => ({ id: p.id, nombre: p.razon_social }));
    },
    async listMovimientos(empresaClave) {
      let q = supabase.from(T_MOV).select('*').order('fecha', { ascending: false });
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => aMov(r as RowMov));
    },
    async crearMovimiento(m) {
      const { data, error } = await supabase.from(T_MOV).insert(deMov(m)).select('*').single();
      if (error) throw error;
      return aMov(data as RowMov);
    },
    async editarMovimiento(id, cambios) {
      const { error } = await supabase.from(T_MOV).update(deMov(cambios)).eq('id', id);
      if (error) throw error;
    },
    async anularMovimiento(id) {
      // 1. Obtener datos del movimiento para desvincular Tesorería si aplica
      const { data: movPre } = await supabase.from(T_MOV).select('*').eq('id', id).maybeSingle();

      const { error } = await supabase.from(T_MOV).update({ estado_pago: 'anulado' }).eq('id', id);
      if (error) throw error;

      // 2. Si tenía servicio directo asociado en Tesorería, eliminarlo para que no siga en pendientes por pagar
      if (movPre?.servicio_directo_id) {
        try {
          await supabase.from('servicios_directos').delete().eq('id', movPre.servicio_directo_id);
        } catch { /* ignorar si ya no existe */ }
      } else if (movPre?.empresa_clave && movPre?.periodo) {
        const notaClave = `Gasto fijo · ${movPre.empresa_clave} · ${movPre.periodo}`;
        try {
          await supabase.from('servicios_directos').delete()
            .eq('empresa_clave', movPre.empresa_clave)
            .eq('estado', 'por_pagar')
            .ilike('nota', `%${notaClave}%`);
        } catch { /* ignorar */ }
      }
    },
    async generarPendientes(empresaClave, hasta = new Date()) {
      let qg = supabase.from(T_GF).select('*');
      if (empresaClave) qg = qg.eq('empresa_clave', empresaClave);
      const { data: gRows, error: ge } = await qg;
      if (ge) throw ge;
      const gastos = (gRows ?? []).map((r) => aGasto(r as RowGasto));
      let qm = supabase.from(T_MOV).select('gasto_fijo_id, periodo').not('gasto_fijo_id', 'is', null);
      if (empresaClave) qm = qm.eq('empresa_clave', empresaClave);
      const { data: mRows, error: me } = await qm;
      if (me) throw me;
      const existentes = (mRows ?? []).map((r) => ({ gastoFijoId: (r as { gasto_fijo_id: string }).gasto_fijo_id, periodo: (r as { periodo: string }).periodo }));
      const nuevos = calcularPendientes(gastos, existentes, hasta);
      if (!nuevos.length) return { creados: 0 };
      const filas = nuevos.map((n) => deMov({
        empresaClave: n.empresaClave, gastoFijoId: n.gastoFijoId, concepto: n.concepto, proveedorNombre: null,
        categoriaGastoId: n.categoriaGastoId, periodo: n.periodo, fecha: n.fecha, monto: n.monto, moneda: n.moneda,
        tasaRef: null, estadoPago: 'pendiente', origen: 'generado', servicioDirectoId: null,
      }));
      const { data: insertadas, error } = await supabase.from(T_MOV).insert(filas).select('*');
      if (error) throw error;

      // ── Fase 3 (BORRADOR · requiere sql/administracion/03_servicios_directos_gasto_fijo.sql
      //    aplicado — D27 — y revisión de Principal) ──
      // Materializa cada pendiente como servicio directo «por pagar» en Tesorería, con la
      // marca empresa_clave/gasto_fijo_id, y lo enlaza de vuelta (servicio_directo_id). Así
      // Tesorería lo ve/paga con SU permiso, sin tocar las tablas admin_*. Reusa el flujo
      // estándar del sistema (crearServicioDirecto → enviarServicioAPagar).
      // Pendiente de afinar antes de activar: rendimiento (hoy ~3-4 llamadas por pendiente),
      // reintento de los que fallen la materialización, y que la nota use el nombre de la
      // empresa (no la clave). Mientras la columna no exista, el `update` del marcador es un
      // no-op silencioso y los pendientes quedan igualmente creados.
      try {
        const { data: auth } = await supabase.auth.getUser();
        const actor = auth.user?.email ?? 'sistema';
        const gastoPorId = new Map(gastos.map((g) => [g.id, g]));
        for (const mov of (insertadas ?? []).map((r) => aMov(r as RowMov))) {
          try {
            const g = mov.gastoFijoId ? gastoPorId.get(mov.gastoFijoId) : undefined;
            const sd = await crearServicioDirecto({
              lineas: [{ descripcion: mov.concepto, cantidad: 1 }],
              proveedorNombre: g?.proveedorNombre ?? mov.proveedorNombre ?? null,
              nota: notaPendiente(mov.empresaClave, mov.periodo),
              moneda: mov.moneda, actor,
            });
            await enviarServicioAPagar({ servicio: sd, items: [{ descripcion: mov.concepto, cantidad: 1, gasto: mov.monto }], moneda: mov.moneda, actor });
            // Marca la empresa en el pendiente de Tesorería (columna aditiva de BD `02`). El
            // enlace a la plantilla va en el movimiento (gasto_fijo_id + servicio_directo_id), no aquí.
            await supabase.from('servicios_directos').update({ empresa_clave: mov.empresaClave }).eq('id', sd.id);
            await supabase.from(T_MOV).update({ servicio_directo_id: sd.id }).eq('id', mov.id);
          } catch { /* un pendiente que no se pudo materializar queda creado sin SD (se reintentará) */ }
        }
      } catch { /* sin sesión / columnas aún sin aplicar: los pendientes quedan creados igual */ }
      return { creados: nuevos.length };
    },
    async marcarPagado(id) {
      const { error } = await supabase.from(T_MOV).update({ estado_pago: 'pagado' }).eq('id', id);
      if (error) throw error;
    },
    async listDocumentos(empresaClave) {
      let q = supabase.from(T_DOC).select('*').order('created_at', { ascending: false });
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => aDoc(r as RowDoc));
    },
    async subirDocumento(empresaClave, tipo, file, meta, actor) {
      if (file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/'))
        throw new Error('El documento debe ser un PDF o una imagen.');
      const path = rutaDoc(empresaClave, file.name);
      const { error: upErr } = await supabase.storage.from(BUCKET_DOCS).upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;

      const nowIso = new Date().toISOString();
      const histItem: HistorialCambioDoc = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fecha: nowIso,
        actor: actor || 'usuario',
        accion: 'creacion',
        detalle: 'Documento subido y registrado en el sistema',
      };

      const status = calcularStatusVencimiento(meta?.fechaVencimiento, meta?.statusVencimiento);

      const filaCompleta: Record<string, unknown> = {
        empresa_clave: empresaClave,
        tipo,
        nombre: meta?.nombre || file.name,
        path,
        content_type: file.type || 'application/pdf',
        tamano: file.size,
        carpeta: meta?.carpeta || 'otros',
        centro_acopio_id: meta?.centroAcopioId || null,
        responsable: meta?.responsable || null,
        fecha_vencimiento: meta?.fechaVencimiento || null,
        fecha_emision: meta?.fechaEmision || null,
        status_vencimiento: status,
        socio_nombre: meta?.socioNombre || null,
        entidad_emisora: meta?.entidadEmisora || null,
        numero_registro: meta?.numeroRegistro || null,
        nota_tramite: meta?.notaTramite || null,
        historial: [histItem],
        updated_at: nowIso,
      };

      let { data, error } = await supabase.from(T_DOC).insert(filaCompleta).select('*').single();

      // Si la BD aún no tiene columnas extendidas, reintentar con las base
      if (error && (error.code === 'PGRST204' || /column.*does not exist/i.test(error.message))) {
        const filaBase = {
          empresa_clave: empresaClave,
          tipo,
          nombre: meta?.nombre || file.name,
          path,
          content_type: file.type || null,
          tamano: file.size,
        };
        const resBase = await supabase.from(T_DOC).insert(filaBase).select('*').single();
        data = resBase.data;
        error = resBase.error;
      }

      if (error || !data) {
        await supabase.storage.from(BUCKET_DOCS).remove([path]).catch(() => { /* queda suelto; se limpia después */ });
        throw new Error(error?.message ?? `No se guardó «${file.name}»: sin permiso.`);
      }
      return aDoc(data as RowDoc);
    },
    async editarDocumento(id, cambios, actor, detalle) {
      const { data: actualRow, error: errGet } = await supabase.from(T_DOC).select('*').eq('id', id).single();
      if (errGet || !actualRow) throw new Error('No se encontró el documento a editar.');

      const doc = aDoc(actualRow as RowDoc);
      const nowIso = new Date().toISOString();
      const histItem: HistorialCambioDoc = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fecha: nowIso,
        actor: actor || 'usuario',
        accion: cambios.statusVencimiento ? 'cambio_status' : cambios.fechaVencimiento ? 'renovacion' : 'modificacion',
        detalle: detalle || 'Metadatos del documento actualizados',
      };

      const nuevoHist = [...doc.historial, histItem];
      const nuevoStatus = calcularStatusVencimiento(
        cambios.fechaVencimiento !== undefined ? cambios.fechaVencimiento : doc.fechaVencimiento,
        cambios.statusVencimiento !== undefined ? cambios.statusVencimiento : doc.statusVencimiento,
      );

      const payloadCompleto: Record<string, unknown> = {
        updated_at: nowIso,
        historial: nuevoHist,
      };
      if (cambios.nombre !== undefined) payloadCompleto.nombre = cambios.nombre;
      if (cambios.tipo !== undefined) payloadCompleto.tipo = cambios.tipo;
      if (cambios.carpeta !== undefined) payloadCompleto.carpeta = cambios.carpeta;
      if (cambios.centroAcopioId !== undefined) payloadCompleto.centro_acopio_id = cambios.centroAcopioId;
      if (cambios.responsable !== undefined) payloadCompleto.responsable = cambios.responsable;
      if (cambios.fechaVencimiento !== undefined) payloadCompleto.fecha_vencimiento = cambios.fechaVencimiento;
      if (cambios.fechaEmision !== undefined) payloadCompleto.fecha_emision = cambios.fechaEmision;
      if (cambios.statusVencimiento !== undefined || cambios.fechaVencimiento !== undefined) payloadCompleto.status_vencimiento = nuevoStatus;
      if (cambios.socioNombre !== undefined) payloadCompleto.socio_nombre = cambios.socioNombre;
      if (cambios.entidadEmisora !== undefined) payloadCompleto.entidad_emisora = cambios.entidadEmisora;
      if (cambios.numeroRegistro !== undefined) payloadCompleto.numero_registro = cambios.numeroRegistro;
      if (cambios.notaTramite !== undefined) payloadCompleto.nota_tramite = cambios.notaTramite;

      let { data, error } = await supabase.from(T_DOC).update(payloadCompleto).eq('id', id).select('*').single();

      if (error && (error.code === 'PGRST204' || /column.*does not exist/i.test(error.message))) {
        const payloadBase: Record<string, unknown> = {};
        if (cambios.nombre !== undefined) payloadBase.nombre = cambios.nombre;
        if (cambios.tipo !== undefined) payloadBase.tipo = cambios.tipo;
        const resBase = await supabase.from(T_DOC).update(payloadBase).eq('id', id).select('*').single();
        data = resBase.data;
        error = resBase.error;
      }

      if (error || !data) throw error || new Error('No se pudo actualizar el documento.');
      return aDoc(data as RowDoc);
    },
    async urlDocumento(path) {
      const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(path, 60 * 10);
      if (error) throw error;
      return data.signedUrl;
    },
    async borrarDocumento(doc) {
      const { data, error } = await supabase.from(T_DOC).delete().eq('id', doc.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('No se eliminó el documento: sin permiso, o ya no existe.');
      await supabase.storage.from(BUCKET_DOCS).remove([doc.path]).catch(() => { /* el registro ya no está; el archivo suelto se limpia después */ });
    },
  };
}
