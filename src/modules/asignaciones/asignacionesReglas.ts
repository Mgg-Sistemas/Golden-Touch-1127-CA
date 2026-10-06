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

   Desde el 06/10/2026 el módulo se divide en TRES APARTADOS, que la base
   deriva de la categoría (columna generada `tipo`):
     · 📦 Bienes y equipo  → línea, equipo electrónico, oficina, herramienta, otro;
     · 🦺 Dotación al personal → dotación / uniformes / EPP (con talla);
     · 🚙 Vehículos → vehículo de la flota (ficha de Maquinaria), placa y km.
   ============================================================ */

export type CategoriaAsignacion = 'dotacion' | 'linea' | 'equipo' | 'oficina' | 'herramienta' | 'vehiculo' | 'otro';
export type EstadoAsignacion = 'asignado' | 'devuelto' | 'entregado';
export type CondicionDevolucion = 'bueno' | 'danado' | 'perdido';
export type TipoAsignacion = 'bienes' | 'dotacion' | 'vehiculo';

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
  /** Apartado (lo calcula la base a partir de la categoría). */
  tipo?: TipoAsignacion | null;
  /** Vehículo de la flota (ficha de Control de Maquinaria). */
  equipo_id?: string | null;
  placa?: string | null;
  km_entrega?: number | null;
  km_devolucion?: number | null;
  /** Talla de la dotación (camisa, pantalón, botas…). */
  talla?: string | null;
  created_at: string;
  created_by?: string | null;
  actor_name?: string | null;
  updated_at?: string | null;
}

export const CATEGORIAS: { valor: CategoriaAsignacion; label: string; icono: string; retorna: boolean }[] = [
  { valor: 'dotacion', label: 'Dotación / uniformes / EPP', icono: '🦺', retorna: false },
  { valor: 'linea', label: 'Línea telefónica', icono: '📱', retorna: true },
  { valor: 'equipo', label: 'Equipo electrónico', icono: '💻', retorna: true },
  { valor: 'oficina', label: 'Material de oficina', icono: '📎', retorna: false },
  { valor: 'herramienta', label: 'Herramienta', icono: '🔧', retorna: true },
  { valor: 'vehiculo', label: 'Vehículo', icono: '🚙', retorna: true },
  { valor: 'otro', label: 'Otro', icono: '📦', retorna: true },
];
export const CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c])) as unknown as
  Record<CategoriaAsignacion, { valor: CategoriaAsignacion; label: string; icono: string; retorna: boolean }>;

/** Los tres apartados del módulo y qué categorías caben en cada uno. */
export const TIPOS: { valor: TipoAsignacion; label: string; corto: string; icono: string; categorias: CategoriaAsignacion[] }[] = [
  { valor: 'bienes', label: 'Asignación de bienes y equipo', corto: 'Bienes y equipo', icono: '📦', categorias: ['equipo', 'linea', 'herramienta', 'oficina', 'otro'] },
  { valor: 'dotacion', label: 'Dotación al personal', corto: 'Dotación', icono: '🦺', categorias: ['dotacion'] },
  { valor: 'vehiculo', label: 'Asignación de vehículos', corto: 'Vehículos', icono: '🚙', categorias: ['vehiculo'] },
];
export const TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t])) as unknown as Record<TipoAsignacion, (typeof TIPOS)[number]>;

/** Apartado de una categoría (igual que la columna generada `tipo` de la base). */
export function tipoDeCategoria(c: CategoriaAsignacion): TipoAsignacion {
  return c === 'dotacion' ? 'dotacion' : c === 'vehiculo' ? 'vehiculo' : 'bienes';
}

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
  tipo: '' | TipoAsignacion;
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
  tipo: '', texto: '', personalId: '', categoria: '', estado: '', desde: '', hasta: '', empresa: '', origen: '', retorna: '',
};

export function filtrosActivos(f: FiltrosAsignacion): number {
  // El apartado (pestaña) no cuenta como filtro: «Limpiar» no saca de la pestaña.
  return (Object.keys(FILTROS_VACIOS) as (keyof FiltrosAsignacion)[]).filter((k) => k !== 'tipo' && f[k] !== FILTROS_VACIOS[k]).length;
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
    if (f.tipo && tipoDeCategoria(a.categoria) !== f.tipo) return false;
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
        a.codigo, a.descripcion, a.serial, a.marca_modelo, a.numero_linea, a.operador, a.observacion, a.placa, a.talla,
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
  equipo_id: string;
  placa: string;
  km_entrega: string;
  talla: string;
}

/** Formulario en blanco; la categoría inicial es la primera del apartado elegido. */
export function formVacio(hoy: string, tipo: TipoAsignacion | '' = ''): FormAsignacion {
  const categoria: CategoriaAsignacion = tipo ? TIPO[tipo].categorias[0] : 'dotacion';
  return {
    personal_id: '', fecha: hoy, categoria, descripcion: '', desdeInventario: false, producto_id: '',
    cantidad: '1', unidad: '', valor_unitario: '', serial: '', marca_modelo: '', numero_linea: '', operador: '',
    retornable: CATEGORIA[categoria].retorna, observacion: '', equipo_id: '', placa: '', km_entrega: '', talla: '',
  };
}

export const aNumero = (s: string) => Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));

/**
 * Qué falta para poder guardar. `stock` es lo disponible del producto elegido
 * (más lo que esta misma asignación ya tenía, si se está editando).
 */
export function erroresForm(f: FormAsignacion, stock?: number | null): string[] {
  const e: string[] = [];
  if (!f.personal_id) e.push('Elige el trabajador.');
  if (!f.fecha) e.push('Indica la fecha.');
  if (!f.descripcion.trim()) e.push('Escribe qué se asigna.');
  const cant = aNumero(f.cantidad);
  if (!(cant > 0)) e.push('La cantidad tiene que ser mayor a 0.');
  const val = f.valor_unitario.trim() ? aNumero(f.valor_unitario) : 0;
  if (!(val >= 0) || Number.isNaN(val)) e.push('El valor no es un número válido.');
  if (f.desdeInventario) {
    if (!f.producto_id) e.push('Elige el producto del inventario.');
    else if (stock != null && cant > stock) e.push(`No alcanza el stock: hay ${stock} y se quieren asignar ${cant}.`);
  }
  if (f.categoria === 'linea' && !f.numero_linea.trim()) e.push('Indica el número de la línea.');
  if (f.categoria === 'vehiculo') {
    if (!f.equipo_id && !f.placa.trim()) e.push('Elige el vehículo de la flota o escribe su placa.');
    if (f.km_entrega.trim() && !(aNumero(f.km_entrega) >= 0)) e.push('El kilometraje de entrega no es un número válido.');
  }
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
    equipo_id: f.categoria === 'vehiculo' ? f.equipo_id || null : null,
    placa: f.categoria === 'vehiculo' ? f.placa.trim().toUpperCase() || null : null,
    km_entrega: f.categoria === 'vehiculo' && f.km_entrega.trim() ? aNumero(f.km_entrega) : null,
    talla: f.categoria === 'dotacion' ? f.talla.trim() || null : null,
  };
}

export function formDesde(a: Asignacion): FormAsignacion {
  return {
    personal_id: a.personal_id, fecha: a.fecha, categoria: a.categoria, descripcion: a.descripcion,
    desdeInventario: !!a.producto_id, producto_id: a.producto_id ?? '', cantidad: String(a.cantidad),
    unidad: a.unidad ?? '', valor_unitario: a.valor_unitario ? String(a.valor_unitario) : '',
    serial: a.serial ?? '', marca_modelo: a.marca_modelo ?? '', numero_linea: a.numero_linea ?? '', operador: a.operador ?? '',
    retornable: a.retornable, observacion: a.observacion ?? '',
    equipo_id: a.equipo_id ?? '', placa: a.placa ?? '', km_entrega: a.km_entrega != null ? String(a.km_entrega) : '', talla: a.talla ?? '',
  };
}

/** Detalle corto de lo asignado: serial, marca/modelo o línea. */
export function detalleCorto(a: Asignacion): string {
  return [
    a.placa ? `Placa ${a.placa}` : null,
    a.km_entrega != null ? `${a.km_entrega} km al entregar${a.km_devolucion != null ? ` · ${a.km_devolucion} km al devolver` : ''}` : null,
    a.talla ? `Talla ${a.talla}` : null,
    a.marca_modelo, a.serial ? `S/N ${a.serial}` : null,
    a.numero_linea ? `Línea ${a.numero_linea}${a.operador ? ` (${a.operador})` : ''}` : null,
  ].filter(Boolean).join(' · ');
}

/* ───────── Varios artículos de una vez ─────────
   En una misma entrega se le pueden dar varias cosas al trabajador (el
   uniforme completo, la laptop y el cargador). Se cargan como renglones y
   cada uno queda como su propia asignación, con su código: así uno se puede
   devolver y el otro no. */

/** ¿El renglón todavía está vacío? (permite guardar solo lo ya agregado) */
export function itemVacio(f: FormAsignacion): boolean {
  return !f.descripcion.trim() && !f.producto_id;
}

/** Cuánto de ese producto ya comprometen los renglones cargados. */
export function comprometido(renglones: FormAsignacion[], productoId: string): number {
  return renglones
    .filter((r) => r.desdeInventario && r.producto_id === productoId)
    .reduce((s, r) => s + (aNumero(r.cantidad) || 0), 0);
}

/** Deja el trabajador, la fecha y la categoría; limpia lo del artículo. */
export function limpiarItem(f: FormAsignacion): FormAsignacion {
  return { ...formVacio(f.fecha), personal_id: f.personal_id, categoria: f.categoria, retornable: f.retornable, talla: f.categoria === 'dotacion' ? f.talla : '' };
}

/** Total en dólares de los renglones cargados. */
export function totalRenglones(rs: FormAsignacion[]): number {
  return r2(rs.reduce((s, r) => s + (aNumero(r.cantidad) || 0) * (r.valor_unitario.trim() ? aNumero(r.valor_unitario) || 0 : 0), 0));
}
