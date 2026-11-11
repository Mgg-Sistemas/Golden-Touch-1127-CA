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
  datos?: Record<string, unknown> | null;               // insert/delete: fila (no la trae `listEventos`)
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
  nomina_periodos:              { modulo: 'RRHH / Nómina',       icono: '📋' },
  combustible_tanque_movimientos:{ modulo: 'Combustible',        icono: '⛽' },
  maquinaria_equipos:           { modulo: 'Maquinaria',          icono: '🚜' },
  maquinaria_mantenimientos:    { modulo: 'Maquinaria · Bitácora', icono: '🔧' },
  usuarios:                     { modulo: 'Usuarios',            icono: '👥' },
  roles_permisos:               { modulo: 'Roles y permisos',    icono: '🔐' },
  cajas:                        { modulo: 'Cajas',               icono: '🏦' },
  // 10/11/2026: el gráfico «Acciones por módulo» mostraba el nombre crudo de la tabla.
  maquinaria_documentos:        { modulo: 'Maquinaria', icono: '🚜' },
  maquinaria_estado_eventos:    { modulo: 'Maquinaria', icono: '🚜' },
  maquinaria_lavados:           { modulo: 'Maquinaria', icono: '🚜' },
  maquinaria_lecturas:          { modulo: 'Maquinaria', icono: '🚜' },
  maquinaria_ordenes_servicio:  { modulo: 'Maquinaria · Bitácora', icono: '🔧' },
  maquinaria_os_fotos:          { modulo: 'Maquinaria · Bitácora', icono: '🔧' },
  maquinaria_repuestos_equipo:  { modulo: 'Maquinaria', icono: '🚜' },
  deposito_mina_salidas:        { modulo: 'Depósito Mina', icono: '⛏' },
  solicitudes_revision_almacen: { modulo: 'Revisión de Almacén', icono: '🔎' },
  producto_presentaciones:      { modulo: 'Inventario', icono: '📦' },
  delivery_pedidos:             { modulo: 'Delivery', icono: '🛵' },
  delivery_pedidos_v1:          { modulo: 'Delivery', icono: '🛵' },
  delivery_rechazos:            { modulo: 'Delivery', icono: '🛵' },
  cocina_categorias:            { modulo: 'Cocina', icono: '🍽' },
  choferes_clasificaciones_viaje:{ modulo: 'Choferes', icono: '🚛' },
  choferes_conductores:         { modulo: 'Choferes', icono: '🚛' },
  choferes_descansos_config:    { modulo: 'Choferes', icono: '🚛' },
  choferes_documentos:          { modulo: 'Choferes', icono: '🚛' },
  choferes_guias:               { modulo: 'Choferes', icono: '🚛' },
  choferes_pagos:               { modulo: 'Choferes', icono: '🚛' },
  choferes_viajes:              { modulo: 'Choferes', icono: '🚛' },
  choferes_viaticos:            { modulo: 'Choferes', icono: '🚛' },
  rrhh_empresas:                { modulo: 'RRHH', icono: '👥' },
  rrhh_tabulador:               { modulo: 'RRHH', icono: '👥' },
  rrhh_transferencias_empresa:  { modulo: 'RRHH', icono: '👥' },
  ventas:                       { modulo: 'Ventas', icono: '🧾' },
  ventas_recibidos:             { modulo: 'Ventas', icono: '🧾' },
  ventas_renglones:             { modulo: 'Ventas', icono: '🧾' },
  geodesta_informes:            { modulo: 'Geodesta', icono: '🗺' },
  geodesta_planificacion:       { modulo: 'Geodesta', icono: '🗺' },
  documentos_empresa:           { modulo: 'Administración', icono: '🗂' },
  envios_documentacion:         { modulo: 'Administración', icono: '🗂' },
  destinatarios_envio:          { modulo: 'Administración', icono: '🗂' },
  actividades_economicas:       { modulo: 'Administración', icono: '🗂' },
  asignaciones_actas:           { modulo: 'Asignaciones', icono: '📝' },
  asignaciones_firmantes:       { modulo: 'Asignaciones', icono: '📝' },
  minutas:                      { modulo: 'Minutas', icono: '🗒' },
  sistema_interruptores:        { modulo: 'Configuración', icono: '⚙' },
  usuarios_nombres_historial:   { modulo: 'Usuarios', icono: '👥' },
  vehiculos_catalogo:           { modulo: 'Vehículos', icono: '🚗' },
  transferencias_material_inter:{ modulo: 'Inventario · MGG', icono: '🌐' },
};

/** Tablas nuevas sin nombre propio: se agrupan por su prefijo (si no, la tabla legible). */
const MODULO_PREFIJO: Array<[string, { modulo: string; icono: string }]> = [
  ['maquinaria_', { modulo: 'Maquinaria', icono: '🚜' }],
  ['choferes_', { modulo: 'Choferes', icono: '🚛' }],
  ['delivery_', { modulo: 'Delivery', icono: '🛵' }],
  ['rrhh_', { modulo: 'RRHH', icono: '👥' }],
  ['nomina_', { modulo: 'RRHH / Nómina', icono: '👛' }],
  ['ventas', { modulo: 'Ventas', icono: '🧾' }],
  ['cocina_', { modulo: 'Cocina', icono: '🍽' }],
  ['combustible_', { modulo: 'Combustible', icono: '⛽' }],
  ['acopio_', { modulo: 'Caja Peramanal', icono: '🏭' }],
  ['geodesta_', { modulo: 'Geodesta', icono: '🗺' }],
];

export function moduloDe(tabla: string): { modulo: string; icono: string } {
  const fijo = MODULO_TABLA[tabla];
  if (fijo) return fijo;
  const pref = MODULO_PREFIJO.find(([p]) => tabla.startsWith(p));
  if (pref) return pref[1];
  const legible = tabla.replace(/_/g, ' ').trim();
  return { modulo: legible ? legible[0].toUpperCase() + legible.slice(1) : tabla, icono: '•' };
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

/** Campos internos/ruidosos que NO aportan a un detalle legible (arreglos, JSON, marcas
 *  de tiempo técnicas): se omiten del cambio para que la auditoría no vuelque basura. */
const CAMPOS_OMITIR = new Set([
  'items', 'historial', 'datos', 'meta', 'pago_legs', 'seriales_billetes', 'renglones',
  'created_at', 'updated_at', 'oc_creada', 'oc_creada_en', 'aprobada_en', 'ejecutada_en',
  'pagada_en', 'pagada_at', 'recepcionada_en', 'confirmada_en', 'finalizada_en',
]);

/** Valor legible corto para un cambio. Objetos/arreglos NO se muestran como "[object
 *  Object]": se resumen (cantidad de elementos o "datos"). */
function valLegible(v: unknown): string {
  if (v === null || v === undefined) return '(vacío)';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (typeof v === 'number') return v.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  if (Array.isArray(v)) return v.length ? `(${v.length} ${v.length === 1 ? 'elemento' : 'elementos'})` : '(vacío)';
  if (typeof v === 'object') return '(datos)';
  const s = String(v);
  if (s.length > 40) return s.slice(0, 40) + '…';
  return s;
}

/** ¿El par de valores es puramente estructural (objeto/arreglo en ambos lados)? No
 *  aporta como texto, así que se omite del detalle. */
function cambioEstructural(par: [unknown, unknown]): boolean {
  const esObj = (x: unknown) => x !== null && typeof x === 'object';
  return esObj(par[0]) && esObj(par[1]);
}

export interface EventoDescrito {
  icono: string;
  modulo: string;
  titulo: string;
  detalle: string[];
  /** Identificador interno, solo cuando la cosa no tiene un número propio. */
  referencia: string | null;
}

/** Describe un evento en lenguaje llano: título + líneas de detalle (para el timeline). */
export function describirEvento(e: AuditoriaEvento): EventoDescrito {
  const { modulo, icono } = moduloDe(e.tabla);
  /* `etiqueta` es el número con el que la gente conoce la cosa («SP-2026-0538»):
     ese sí va en el título. El `entidad_id` NO: «Creó en Inventario #bc3333be»
     no le dice nada a nadie. Cuando no hay etiqueta, el título dice qué pasó y
     el identificador queda aparte, como referencia para rastrear. */
  const ref = e.etiqueta ? ` ${e.etiqueta}` : '';
  const referencia = !e.etiqueta && e.entidad_id ? `#${e.entidad_id.slice(0, 8)}` : null;
  let titulo = ref
    ? `${ACCION_LABEL[e.accion]}${ref}`
    : `${ACCION_LABEL[e.accion]} un registro`;
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
      if (CAMPOS_OMITIR.has(k)) continue;          // ruido interno (items, historial, timestamps…)
      if (cambioEstructural(par)) continue;        // objeto→objeto: no aporta como texto
      detalle.push(`${campoLabel(k)}: ${valLegible(par[0])} → ${valLegible(par[1])}`);
    }
  }
  return { icono, modulo, titulo, detalle, referencia };
}

export interface AuditoriaFiltro { desde?: string | null; hasta?: string | null; userId?: string | null; tabla?: string | null; limit?: number }

/** Lista eventos de auditoría (más recientes primero) con filtros. */
export async function listEventos(f: AuditoriaFiltro = {}): Promise<AuditoriaEvento[]> {
  // Sin `datos` (la fila entera en altas y bajas): la pantalla nunca la muestra y era la
  // mitad del peso de cada carga (hasta 2000 eventos, con cada recarga en vivo).
  let q = supabase.from('auditoria_eventos')
    .select('id, at, user_id, email, nombre, tabla, accion, entidad_id, etiqueta, cambios')
    .order('at', { ascending: false });
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
