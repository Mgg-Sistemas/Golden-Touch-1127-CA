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
import { listCategoriasGasto } from '@/modules/tesoreria/categoriasGasto.repository';
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
  listCategorias(): Promise<OpcionRef[]>;
  listProveedores(): Promise<OpcionRef[]>;
  listMovimientos(empresaClave?: string): Promise<Movimiento[]>;
  crearMovimiento(m: MovimientoInput): Promise<Movimiento>;
  editarMovimiento(id: string, cambios: Partial<MovimientoInput>): Promise<void>;
  /** Anula un movimiento (estado_pago = 'anulado'); queda fuera de los totales del reporte. */
  anularMovimiento(id: string): Promise<void>;
  /** Genera los pendientes que faltan hasta `hasta` (default hoy), idempotente. Devuelve cuántos creó. */
  generarPendientes(empresaClave?: string, hasta?: Date): Promise<{ creados: number }>;
  marcarPagado(id: string): Promise<void>;
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
      const rows = await listCategoriasGasto(true);
      return rows.map((c) => ({ id: c.id, nombre: c.nombre }));
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
  };
}
