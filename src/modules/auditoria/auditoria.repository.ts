/* ============================================================
   Golden Touch · Auditoría de usuarios (solo admin)
   Registro central de acciones (auditoria_eventos, poblado por triggers en la BD):
   quién hizo qué, cuándo, en qué módulo y con qué cambio (old→new). Se combina con
   las sesiones (tiempo de conexión, de sesiones_usuario) para un panel muy visual.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

export interface AuditoriaEvento {
  id: number;
  at: string;
  user_id: string | null;
  email: string | null;
  nombre: string | null;
  tabla: string;
  accion: 'insert' | 'update' | 'delete';
  entidad_id: string | null;
  etiqueta: string | null;
  cambios: Record<string, [unknown, unknown]> | null;   // update: col → [viejo, nuevo]
  datos: Record<string, unknown> | null;                // insert/delete: fila
}

/** tabla → módulo legible + ícono, para agrupar y mostrar. */
export const MODULO_TABLA: Record<string, { modulo: string; icono: string }> = {
  solicitudes_salida:           { modulo: 'Salidas / Traslados', icono: '📦' },
  ordenes:                      { modulo: 'Pedidos / Compras',   icono: '🛒' },
  compras_directas:             { modulo: 'Compra directa',      icono: '🧾' },
  servicios_directos:           { modulo: 'Servicio directo',    icono: '🔧' },
  movimientos_caja:             { modulo: 'Tesorería',           icono: '💵' },
  cuentas_por_pagar:            { modulo: 'Tesorería · CxP',     icono: '💳' },
  cuentas_por_cobrar:           { modulo: 'Tesorería · CxC',     icono: '💰' },
  acopio_caja_movimientos:      { modulo: 'Caja Peramanal',      icono: '🏭' },
  acopio_martillos_movimientos: { modulo: 'Martillos (Acopio)',  icono: '🔨' },
  cocina_movimientos:           { modulo: 'Cocina',              icono: '🍽' },
  productos:                    { modulo: 'Inventario',          icono: '📦' },
  recepciones_cierres:          { modulo: 'Recepciones',         icono: '⚖' },
  nomina_renglones:             { modulo: 'RRHH / Nómina',       icono: '👛' },
  combustible_tanque_movimientos:{ modulo: 'Combustible',        icono: '⛽' },
  maquinaria_equipos:           { modulo: 'Maquinaria',          icono: '🚜' },
  maquinaria_mantenimientos:    { modulo: 'Maquinaria · Bitácora', icono: '🔧' },
  usuarios:                     { modulo: 'Usuarios',            icono: '👥' },
  roles_permisos:               { modulo: 'Roles y permisos',    icono: '🔐' },
  cajas:                        { modulo: 'Cajas',               icono: '🏦' },
};

export function moduloDe(tabla: string): { modulo: string; icono: string } {
  return MODULO_TABLA[tabla] ?? { modulo: tabla, icono: '•' };
}

const ACCION_LABEL: Record<AuditoriaEvento['accion'], string> = {
  insert: 'Creó', update: 'Editó', delete: 'Eliminó',
};

/** Nombre de campo legible (los más comunes). */
const CAMPO_LABEL: Record<string, string> = {
  estado: 'estado', monto: 'monto', saldo: 'saldo', stock: 'stock', precio: 'precio',
  cantidad: 'cantidad', platos: 'platos', kg: 'Kg', litros: 'litros', gastos: 'gasto',
  nominas: 'nómina', tipo: 'tipo', nombre: 'nombre', role: 'rol', motivo: 'motivo',
  pagada_at: 'fecha de pago', costo_promedio: 'costo (PMP)', tasa_usd_litro: 'tasa $/L',
};
const campoLabel = (k: string) => CAMPO_LABEL[k] ?? k.replace(/_/g, ' ');

/** Valor legible corto para mostrar en un cambio. */
function valLegible(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v === 'number') return v.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  const s = String(v);
  if (s.length > 40) return s.slice(0, 40) + '…';
  return s;
}

export interface EventoDescrito { icono: string; modulo: string; titulo: string; detalle: string[] }

/** Describe un evento en lenguaje llano: título + líneas de detalle (para el timeline). */
export function describirEvento(e: AuditoriaEvento): EventoDescrito {
  const { modulo, icono } = moduloDe(e.tabla);
  const ref = e.etiqueta ? ` ${e.etiqueta}` : (e.entidad_id ? ` #${e.entidad_id.slice(0, 8)}` : '');
  let titulo = `${ACCION_LABEL[e.accion]} en ${modulo}${ref}`;
  const detalle: string[] = [];

  // Acciones semánticas frecuentes.
  if (e.tabla === 'solicitudes_salida' && e.accion === 'update' && e.cambios?.estado) {
    const nuevo = String(e.cambios.estado[1] ?? '');
    if (nuevo === 'aprobada') titulo = `Aprobó la solicitud${ref}`;
    else if (nuevo === 'ejecutada') titulo = `Ejecutó (descontó stock) la solicitud${ref}`;
    else if (nuevo === 'cancelada') titulo = `Canceló la solicitud${ref}`;
  }

  if (e.accion === 'update' && e.cambios) {
    for (const [k, par] of Object.entries(e.cambios)) {
      if (k === 'estado' && e.tabla === 'solicitudes_salida') continue; // ya en el título
      detalle.push(`${campoLabel(k)}: ${valLegible(par[0])} → ${valLegible(par[1])}`);
    }
  }
  return { icono, modulo, titulo, detalle };
}

export interface AuditoriaFiltro { desde?: string | null; hasta?: string | null; userId?: string | null; tabla?: string | null; limit?: number }

/** Lista eventos de auditoría (más recientes primero) con filtros. */
export async function listEventos(f: AuditoriaFiltro = {}): Promise<AuditoriaEvento[]> {
  let q = supabase.from('auditoria_eventos').select('*').order('at', { ascending: false });
  if (f.desde) q = q.gte('at', `${f.desde}T00:00:00`);
  if (f.hasta) q = q.lte('at', `${f.hasta}T23:59:59.999`);
  if (f.userId) q = q.eq('user_id', f.userId);
  if (f.tabla) q = q.eq('tabla', f.tabla);
  q = q.limit(f.limit ?? 2000);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditoriaEvento[];
}

/* ─────────── Agregados (para los gráficos) ─────────── */

export interface ConteoUsuario { user_id: string; nombre: string; email: string; eventos: number }
export function eventosPorUsuario(evs: AuditoriaEvento[]): ConteoUsuario[] {
  const m = new Map<string, ConteoUsuario>();
  for (const e of evs) {
    const key = e.user_id ?? '—sistema—';
    const cur = m.get(key) ?? { user_id: key, nombre: e.nombre || e.email || 'Sistema', email: e.email || '', eventos: 0 };
    cur.eventos += 1;
    m.set(key, cur);
  }
  return Array.from(m.values()).sort((a, b) => b.eventos - a.eventos);
}

export interface ConteoDia { dia: string; eventos: number }
/** Eventos por día (YYYY-MM-DD, zona Venezuela), orden cronológico. */
export function eventosPorDia(evs: AuditoriaEvento[]): ConteoDia[] {
  const m = new Map<string, number>();
  for (const e of evs) {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.at));
    m.set(dia, (m.get(dia) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([dia, eventos]) => ({ dia, eventos })).sort((a, b) => a.dia.localeCompare(b.dia));
}

export interface ConteoModulo { modulo: string; icono: string; eventos: number }
export function eventosPorModulo(evs: AuditoriaEvento[]): ConteoModulo[] {
  const m = new Map<string, ConteoModulo>();
  for (const e of evs) {
    const { modulo, icono } = moduloDe(e.tabla);
    const cur = m.get(modulo) ?? { modulo, icono, eventos: 0 };
    cur.eventos += 1;
    m.set(modulo, cur);
  }
  return Array.from(m.values()).sort((a, b) => b.eventos - a.eventos);
}

/** Agrupa los eventos por día (YYYY-MM-DD) para el timeline del detalle. */
export function agruparPorDia(evs: AuditoriaEvento[]): { dia: string; eventos: AuditoriaEvento[] }[] {
  const m = new Map<string, AuditoriaEvento[]>();
  for (const e of evs) {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(e.at));
    (m.get(dia) ?? m.set(dia, []).get(dia)!).push(e);
  }
  return Array.from(m.entries()).map(([dia, eventos]) => ({ dia, eventos })).sort((a, b) => b.dia.localeCompare(a.dia));
}
