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
import type { Moneda, Periodicidad } from './administracionCalculo';

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

const T_EMP = 'admin_empresas';
const T_GF = 'admin_gastos_fijos';

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
  };
}
