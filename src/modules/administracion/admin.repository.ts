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

/** Tipo de papel legal de una empresa. */
export type TipoDocumento = 'rif' | 'acta_constitutiva' | 'acta_modificacion' | 'cedula' | 'otro';
export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  rif: 'RIF',
  acta_constitutiva: 'Acta constitutiva',
  acta_modificacion: 'Acta de modificación',
  cedula: 'Cédula del representante',
  otro: 'Otro documento',
};

/** Documento (PDF/imagen) adjunto a una empresa (tabla `admin_empresa_documentos`
 *  + Storage bucket `admin-documentos`). El RIF, las actas, la cédula del
 *  representante: los papeles que la empresa necesita tener a mano. */
export interface DocumentoEmpresa {
  id: string;
  empresaClave: string;
  tipo: TipoDocumento;
  nombre: string;
  /** Ruta en el bucket; con ella se pide la URL firmada. */
  path: string;
  contentType: string | null;
  tamano: number | null;
  createdAt: string | null;
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
  /** Papeles legales de una empresa (RIF, actas, cédula…), más recientes primero. */
  listDocumentos(empresaClave: string): Promise<DocumentoEmpresa[]>;
  /** Sube un PDF/imagen al bucket y lo registra. Si el registro falla, borra el archivo. */
  subirDocumento(empresaClave: string, tipo: TipoDocumento, file: File): Promise<DocumentoEmpresa>;
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
  periodicidad: string; dia_vencimiento: number | null; vigente_desde: string; estado: string; created_at?: string | null;
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
    estado: (r.estado as EstadoGastoFijo) ?? 'activo', createdAt: r.created_at ?? null,
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

const T_EMP = 'admin_empresas';
const T_GF = 'admin_gastos_fijos';
const T_MOV = 'admin_gasto_fijo_movimientos';
const T_DOC = 'admin_empresa_documentos';
const T_CAT = 'admin_categorias';
const BUCKET_DOCS = 'admin-documentos';

interface RowDoc {
  id: string; empresa_clave: string; tipo: string; nombre: string; path: string;
  content_type: string | null; tamano: number | string | null; created_at?: string | null;
}
function aDoc(r: RowDoc): DocumentoEmpresa {
  return {
    id: r.id, empresaClave: r.empresa_clave, tipo: (r.tipo as TipoDocumento) ?? 'otro', nombre: r.nombre,
    path: r.path, contentType: r.content_type ?? null,
    tamano: r.tamano == null ? null : num(r.tamano), createdAt: r.created_at ?? null,
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
    async listGastosFijos(empresaClave) {
      let q = supabase.from(T_GF).select('*').order('concepto');
      if (empresaClave) q = q.eq('empresa_clave', empresaClave);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => aGasto(r as RowGasto));
    },
    async crearGastoFijo(g) {
      const { data, error } = await supabase.from(T_GF).insert(deGasto(g)).select('*').single();
      if (error) throw error;
      return aGasto(data as RowGasto);
    },
    async editarGastoFijo(id, cambios) {
      const { error } = await supabase.from(T_GF).update(deGasto(cambios)).eq('id', id);
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
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        const rows = await listCategoriasGasto(true);
        return soloCategorias(rows).map((c) => ({ id: c.id, nombre: c.nombre }));
      }
      throw error;
    },
    async listAdminCategorias() {
      const { data, error } = await supabase.from(T_CAT).select('*').order('orden').order('nombre');
      if (error) {
        if (/relation|does not exist|schema cache/i.test(error.message)) return [];
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
      const { error } = await supabase.from(T_MOV).update({ estado_pago: 'anulado' }).eq('id', id);
      if (error) throw error;
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
      if (!empresaClave) return [];
      const { data, error } = await supabase.from(T_DOC).select('*').eq('empresa_clave', empresaClave).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => aDoc(r as RowDoc));
    },
    async subirDocumento(empresaClave, tipo, file) {
      if (file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/'))
        throw new Error('El documento debe ser un PDF o una imagen.');
      const path = rutaDoc(empresaClave, file.name);
      const { error: upErr } = await supabase.storage.from(BUCKET_DOCS).upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;
      const fila = { empresa_clave: empresaClave, tipo, nombre: file.name, path, content_type: file.type || null, tamano: file.size };
      const { data, error } = await supabase.from(T_DOC).insert(fila).select('*').single();
      if (error || !data) {
        await supabase.storage.from(BUCKET_DOCS).remove([path]).catch(() => { /* queda suelto; se limpia después */ });
        throw new Error(error?.message ?? `No se guardó «${file.name}»: sin permiso.`);
      }
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
