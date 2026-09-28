/* ============================================================
   Golden Touch · Asignaciones · reglas (sin pantalla ni base)

   Una asignación es algo que la empresa le da a un trabajador: dotación
   (uniformes, botas), una línea telefónica, una laptop, material de oficina,
   una herramienta… Puede salir del inventario o no.

   Unas RETORNAN (la laptop, la línea, la herramienta: se devuelven cuando la
   persona se va) y otras NO (el uniforme y el material de oficina se lo queda
   o se gasta). Por eso hay tres estados:
     · asignado  → retorna y todavía lo tiene;
     · devuelto  → retornaba y ya lo devolvió;
     · entregado → no retorna: se le dio y queda en el historial.
   ============================================================ */

export type CategoriaAsignacion = 'dotacion' | 'linea' | 'equipo' | 'oficina' | 'herramienta' | 'vehiculo' | 'otro';
export type EstadoAsignacion = 'asignado' | 'devuelto' | 'entregado';
export type CondicionDevolucion = 'bueno' | 'danado' | 'perdido';

export interface Asignacion {
  id: string;
  codigo: string;
  personal_id: string;
  fecha: string;
  categoria: CategoriaAsignacion;
  descripcion: string;
  producto_id?: string | null;
  cantidad: number;
  unidad?: string | null;
  valor_unitario: number;
  serial?: string | null;
  marca_modelo?: string | null;
  numero_linea?: string | null;
  operador?: string | null;
  retornable: boolean;
  estado: EstadoAsignacion;
  fecha_devolucion?: string | null;
  condicion_devolucion?: CondicionDevolucion | null;
  reingresa_inventario: boolean;
  nota_devolucion?: string | null;
  observacion?: string | null;
  created_at: string;
  created_by?: string | null;
  actor_name?: string | null;
  updated_at?: string | null;
}

export const CATEGORIAS: { valor: CategoriaAsignacion; label: string; icono: string; retorna: boolean }[] = [
  { valor: 'dotacion', label: 'Dotación / uniformes', icono: '🦺', retorna: false },
  { valor: 'linea', label: 'Línea telefónica', icono: '📱', retorna: true },
  { valor: 'equipo', label: 'Equipo electrónico', icono: '💻', retorna: true },
  { valor: 'oficina', label: 'Material de oficina', icono: '📎', retorna: false },
  { valor: 'herramienta', label: 'Herramienta', icono: '🔧', retorna: true },
  { valor: 'vehiculo', label: 'Vehículo', icono: '🚙', retorna: true },
  { valor: 'otro', label: 'Otro', icono: '📦', retorna: true },
];
export const CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c])) as unknown as
  Record<CategoriaAsignacion, { valor: CategoriaAsignacion; label: string; icono: string; retorna: boolean }>;

export const ESTADO_LABEL: Record<EstadoAsignacion, string> = {
  asignado: 'En su poder',
  devuelto: 'Devuelto',
  entregado: 'Entregado (no retorna)',
};
export const CONDICION_LABEL: Record<CondicionDevolucion, string> = {
  bueno: 'En buen estado',
  danado: 'Dañado',
  perdido: 'Perdido / no lo devolvió',
};

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const valorTotal = (a: Pick<Asignacion, 'cantidad' | 'valor_unitario'>) => r2((Number(a.cantidad) || 0) * (Number(a.valor_unitario) || 0));

export function normalizar(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export interface PersonaMin {
  id: string;
  nombre: string;
  apellido: string;
  cedula?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  ficha_nro?: string | null;
  empresa?: string | null;
  activo?: boolean;
}
export const nombreDe = (p?: PersonaMin | null) => (p ? `${p.nombre} ${p.apellido}`.trim() : '—');

export interface FiltrosAsignacion {
  texto: string;
  personalId: string;
  categoria: '' | CategoriaAsignacion;
  estado: '' | EstadoAsignacion | 'pendientes';
  desde: string;
  hasta: string;
  empresa: '' | 'GT' | 'MTO';
  origen: '' | 'inventario' | 'externo';
  retorna: '' | 'si' | 'no';
}

export const FILTROS_VACIOS: FiltrosAsignacion = {
  texto: '', personalId: '', categoria: '', estado: '', desde: '', hasta: '', empresa: '', origen: '', retorna: '',
};

export function filtrosActivos(f: FiltrosAsignacion): number {
  return (Object.keys(FILTROS_VACIOS) as (keyof FiltrosAsignacion)[]).filter((k) => f[k] !== FILTROS_VACIOS[k]).length;
}

/**
 * Aplica los filtros. «pendientes» = retorna y todavía lo tiene (lo que hay que
 * recuperar cuando la persona se va). El texto busca en el trabajador (nombre,
 * cédula, cargo, ficha) y en lo asignado (código, descripción, serial, línea).
 */
export function filtrarAsignaciones(lista: Asignacion[], f: FiltrosAsignacion, personas: Map<string, PersonaMin>): Asignacion[] {
  const t = normalizar(f.texto);
  return lista.filter((a) => {
    const p = personas.get(a.personal_id);
    if (f.personalId && a.personal_id !== f.personalId) return false;
    if (f.categoria && a.categoria !== f.categoria) return false;
    if (f.estado === 'pendientes') { if (a.estado !== 'asignado') return false; }
    else if (f.estado && a.estado !== f.estado) return false;
    if (f.desde && a.fecha < f.desde) return false;
    if (f.hasta && a.fecha > f.hasta) return false;
    if (f.empresa && p?.empresa !== f.empresa) return false;
    if (f.origen === 'inventario' && !a.producto_id) return false;
    if (f.origen === 'externo' && a.producto_id) return false;
    if (f.retorna === 'si' && !a.retornable) return false;
    if (f.retorna === 'no' && a.retornable) return false;
    if (t) {
      const heno = normalizar([
        a.codigo, a.descripcion, a.serial, a.marca_modelo, a.numero_linea, a.operador, a.observacion,
        CATEGORIA[a.categoria]?.label, p ? nombreDe(p) : '', p?.cedula, p?.cargo, p?.ficha_nro, p?.departamento,
      ].filter(Boolean).join(' '));
      if (!heno.includes(t)) return false;
    }
    return true;
  });
}

export interface ResumenAsignaciones {
  total: number;
  valor: number;
  pendientes: number;
  valorPendiente: number;
  trabajadoresConPendientes: number;
  devueltas: number;
  entregadas: number;
  /** Pendientes de gente que ya no está activa: lo urgente de recuperar. */
  pendientesInactivos: number;
}

export function resumenAsignaciones(lista: Asignacion[], personas: Map<string, PersonaMin>): ResumenAsignaciones {
  const pend = lista.filter((a) => a.estado === 'asignado');
  return {
    total: lista.length,
    valor: r2(lista.reduce((s, a) => s + valorTotal(a), 0)),
    pendientes: pend.length,
    valorPendiente: r2(pend.reduce((s, a) => s + valorTotal(a), 0)),
    trabajadoresConPendientes: new Set(pend.map((a) => a.personal_id)).size,
    devueltas: lista.filter((a) => a.estado === 'devuelto').length,
    entregadas: lista.filter((a) => a.estado === 'entregado').length,
    pendientesInactivos: pend.filter((a) => personas.get(a.personal_id)?.activo === false).length,
  };
}

/** Totales por categoría (para el resumen del PDF), en el orden de CATEGORIAS. */
export function porCategoria(lista: Asignacion[]): { categoria: CategoriaAsignacion; cantidad: number; valor: number; pendientes: number }[] {
  return CATEGORIAS.map((c) => {
    const l = lista.filter((a) => a.categoria === c.valor);
    return { categoria: c.valor, cantidad: l.length, valor: r2(l.reduce((s, a) => s + valorTotal(a), 0)), pendientes: l.filter((a) => a.estado === 'asignado').length };
  }).filter((x) => x.cantidad > 0);
}

export function ordenarAsignaciones(lista: Asignacion[]): Asignacion[] {
  return [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
}

export interface FormAsignacion {
  personal_id: string;
  fecha: string;
  categoria: CategoriaAsignacion;
  descripcion: string;
  desdeInventario: boolean;
  producto_id: string;
  cantidad: string;
  unidad: string;
  valor_unitario: string;
  serial: string;
  marca_modelo: string;
  numero_linea: string;
  operador: string;
  retornable: boolean;
  observacion: string;
}

export function formVacio(hoy: string): FormAsignacion {
  return {
    personal_id: '', fecha: hoy, categoria: 'dotacion', descripcion: '', desdeInventario: false, producto_id: '',
    cantidad: '1', unidad: '', valor_unitario: '', serial: '', marca_modelo: '', numero_linea: '', operador: '',
    retornable: CATEGORIA.dotacion.retorna, observacion: '',
  };
}

export const aNumero = (s: string) => Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));

/**
 * Qué falta para poder guardar. `stock` es lo disponible del producto elegido
 * (más lo que esta misma asignación ya tenía, si se está editando).
 */
export function erroresForm(f: FormAsignacion, stock?: number | null): string[] {
  const e: string[] = [];
  if (!f.personal_id) e.push('Elegí el trabajador.');
  if (!f.fecha) e.push('Indicá la fecha.');
  if (!f.descripcion.trim()) e.push('Escribí qué se asigna.');
  const cant = aNumero(f.cantidad);
  if (!(cant > 0)) e.push('La cantidad tiene que ser mayor a 0.');
  const val = f.valor_unitario.trim() ? aNumero(f.valor_unitario) : 0;
  if (!(val >= 0) || Number.isNaN(val)) e.push('El valor no es un número válido.');
  if (f.desdeInventario) {
    if (!f.producto_id) e.push('Elegí el producto del inventario.');
    else if (stock != null && cant > stock) e.push(`No alcanza el stock: hay ${stock} y se quieren asignar ${cant}.`);
  }
  if (f.categoria === 'linea' && !f.numero_linea.trim()) e.push('Indicá el número de la línea.');
  return e;
}

/** Lo que va a la base desde el formulario. */
export function payloadDe(f: FormAsignacion): Record<string, unknown> {
  return {
    personal_id: f.personal_id,
    fecha: f.fecha,
    categoria: f.categoria,
    descripcion: f.descripcion.trim(),
    producto_id: f.desdeInventario ? f.producto_id || null : null,
    cantidad: aNumero(f.cantidad),
    unidad: f.unidad.trim() || null,
    valor_unitario: f.valor_unitario.trim() ? r2(aNumero(f.valor_unitario)) : 0,
    serial: f.serial.trim() || null,
    marca_modelo: f.marca_modelo.trim() || null,
    numero_linea: f.numero_linea.trim() || null,
    operador: f.operador.trim() || null,
    retornable: f.retornable,
    observacion: f.observacion.trim() || null,
  };
}

export function formDesde(a: Asignacion): FormAsignacion {
  return {
    personal_id: a.personal_id, fecha: a.fecha, categoria: a.categoria, descripcion: a.descripcion,
    desdeInventario: !!a.producto_id, producto_id: a.producto_id ?? '', cantidad: String(a.cantidad),
    unidad: a.unidad ?? '', valor_unitario: a.valor_unitario ? String(a.valor_unitario) : '',
    serial: a.serial ?? '', marca_modelo: a.marca_modelo ?? '', numero_linea: a.numero_linea ?? '', operador: a.operador ?? '',
    retornable: a.retornable, observacion: a.observacion ?? '',
  };
}

/** Detalle corto de lo asignado: serial, marca/modelo o línea. */
export function detalleCorto(a: Asignacion): string {
  return [
    a.marca_modelo, a.serial ? `S/N ${a.serial}` : null,
    a.numero_linea ? `Línea ${a.numero_linea}${a.operador ? ` (${a.operador})` : ''}` : null,
  ].filter(Boolean).join(' · ');
}
