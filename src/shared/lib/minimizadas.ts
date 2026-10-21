/* ============================================================
   MGG · Pestañas minimizadas (pedido de la administradora, 20-10-2026).
   Un detalle (p. ej. «Orden SP-2026-0187-1») se puede MINIMIZAR para abrir otro sin
   perderlo; quedan en una barra inferior, hasta MAX_MINIMIZADAS, y SOLO viven dentro
   del módulo donde se minimizaron: al salir del módulo se avisa y se pierden.
   Aquí vive el estado compartido (la página, la barra y el aviso de salida lo leen).
   ============================================================ */
import { useSyncExternalStore } from 'react';

export const MAX_MINIMIZADAS = 3;

export interface Minimizada {
  id: string;
  titulo: string;
  /** Cómo se vuelve a mostrar. Sin esto, lo hace el restaurador del módulo (Pedidos: reabre la orden por su id). */
  restaurar?: () => void;
  /** Qué hacer al descartarla con su ✕ (una ventana oculta se cierra). */
  descartar?: () => void;
}

export interface EstadoMinimizadas {
  /** Nombre del módulo, para el aviso de salida («Pedidos / Compras»). */
  modulo: string;
  /** Ruta base del módulo («/app/pedidos»): lo que cuelga de ahí es «el mismo módulo». */
  ruta: string;
  items: readonly Minimizada[];
  /** Destino al que el usuario quiso ir y está esperando su confirmación (null = ninguno). */
  salida: string | null;
}

const VACIO: EstadoMinimizadas = { modulo: '', ruta: '', items: [], salida: null };
let estado: EstadoMinimizadas = VACIO;
const oyentes = new Set<() => void>();

function fijar(nuevo: EstadoMinimizadas) {
  estado = nuevo;
  oyentes.forEach((f) => f());
}

export function leerMinimizadas(): EstadoMinimizadas {
  return estado;
}

export function suscribirMinimizadas(f: () => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

/** Estado en vivo para componentes React. */
export function useMinimizadas(): EstadoMinimizadas {
  return useSyncExternalStore(suscribirMinimizadas, leerMinimizadas, leerMinimizadas);
}

/** «/app/pedidos?x=1», «#/app/pedidos/ver» → «/app/pedidos». */
function limpiarRuta(destino: string): string {
  return destino.replace(/^#/, '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

/** ¿El destino cae dentro del mismo módulo (la ruta base o una subruta suya)? */
export function mismoModulo(rutaModulo: string, destino: string): boolean {
  if (!rutaModulo) return false;
  const base = limpiarRuta(rutaModulo);
  const d = limpiarRuta(destino);
  return d === base || d.startsWith(`${base}/`);
}

/**
 * Minimiza. «ok» también si ya estaba minimizada (solo refresca el título);
 * «lleno» si ya hay MAX_MINIMIZADAS otras.
 */
export function minimizar(modulo: string, ruta: string, item: Minimizada): 'ok' | 'lleno' {
  // Lo minimizado de otro módulo no puede convivir con esto (la barra es de un solo módulo).
  const base = estado.ruta === ruta ? estado.items : [];
  const i = base.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    const items = base.map((x) => (x.id === item.id ? item : x));
    fijar({ ...estado, modulo, ruta, items });
    return 'ok';
  }
  if (base.length >= MAX_MINIMIZADAS) return 'lleno';
  fijar({ modulo, ruta, items: [...base, item], salida: null });
  return 'ok';
}

/** Saca una pestaña de la barra (restaurada o cerrada con su ✕). */
export function quitarMinimizada(id: string) {
  if (!estado.items.some((x) => x.id === id)) return;
  const items = estado.items.filter((x) => x.id !== id);
  fijar(items.length ? { ...estado, items } : VACIO);
}

/**
 * Restaura `id` estando otra ventana abierta: la abierta ocupa su lugar en la barra
 * (así nunca se pasa del máximo ni se pierde la que estaba mirando).
 */
export function intercambiarMinimizada(id: string, abierta: Minimizada) {
  if (!estado.items.some((x) => x.id === id)) return;
  const items = estado.items.filter((x) => x.id !== abierta.id).map((x) => (x.id === id ? abierta : x));
  fijar({ ...estado, items });
}

/** Vacía todo (al salir del módulo o cerrar sesión). */
export function vaciarMinimizadas() {
  if (estado !== VACIO) fijar(VACIO);
}

/**
 * Antes de navegar: true = puede ir; false = hay pestañas minimizadas, el destino queda
 * pendiente y el aviso de salida pregunta (ver AvisoSalidaModulo).
 */
export function intentarSalir(destino: string): boolean {
  if (!estado.items.length || mismoModulo(estado.ruta, destino)) return true;
  fijar({ ...estado, salida: destino });
  return false;
}

/** El usuario confirmó: devuelve el destino, vacía las pestañas y cierra el aviso. */
export function confirmarSalida(): string | null {
  const destino = estado.salida;
  fijar(VACIO);
  return destino;
}

/** El usuario se quedó en el módulo. */
export function cancelarSalida() {
  if (estado.salida !== null) fijar({ ...estado, salida: null });
}

/* ───────── Ventanas que se minimizan solas (Modal) ───────── */

const NOMBRES_MODULO: Record<string, string> = {
  dashboard: 'Dashboard', pedidos: 'Pedidos / Compras', proveedores: 'Proveedores', inventario: 'Inventario',
  produccion: 'Producción', salidas: 'Salidas / Traslados', combustible: 'Combustible',
  acopio: 'Centro de Costo PERAMANAL', recepciones: 'Recepciones', cocina: 'Control de Alimentación (Cocina)',
  tesoreria: 'Tesorería', ventas: 'Ventas', retenciones: 'Retenciones', documentacion: 'Documentación',
  rrhh: 'RRHH / Nómina', geodesta: 'Geodesta', asignaciones: 'Asignaciones', choferes: 'Choferes / Conductores',
  maquinaria: 'Control de Maquinaria y Vehículos', usuarios: 'Usuarios', auditoria: 'Auditoría', ajustes: 'Ajustes',
  telefono: 'Mis pantallas',
};

/** El módulo donde está el usuario, a partir de la ruta («#/app/tesoreria/x» → Tesorería). */
export function moduloActual(destino?: string): { nombre: string; ruta: string } {
  const hash = destino ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const clave = limpiarRuta(hash).split('/').filter(Boolean)[1] ?? '';
  return { ruta: clave ? `/app/${clave}` : '/app', nombre: NOMBRES_MODULO[clave] ?? (clave || 'Inicio') };
}

let restauradorModulo: ((id: string) => void) | null = null;

/** Pedidos registra aquí cómo reabrir una orden minimizada (sus pestañas no traen `restaurar`). */
export function fijarRestauradorModulo(f: ((id: string) => void) | null) {
  restauradorModulo = f;
}

/** La barra pide mostrar una pestaña. */
export function restaurarPestana(id: string) {
  const it = estado.items.find((x) => x.id === id);
  if (!it) return;
  if (it.restaurar) it.restaurar();
  else restauradorModulo?.(id);
}

/** La barra pide descartar una pestaña (✕): una ventana oculta se cierra. */
export function descartarPestana(id: string) {
  const it = estado.items.find((x) => x.id === id);
  quitarMinimizada(id);
  it?.descartar?.();
}

/** Ventanas a la vista que se pueden minimizar, en el orden en que se abrieron. */
const ventanasAbiertas = new Map<string, () => void>();

export function registrarVentana(id: string, minimizarla: () => void): () => void {
  ventanasAbiertas.set(id, minimizarla);
  return () => { ventanasAbiertas.delete(id); };
}

/** Al restaurar una pestaña, la ventana que está arriba (la última abierta) pasa a la barra en su lugar. */
export function minimizarUltimaAbierta(excepto: string) {
  const ids = [...ventanasAbiertas.keys()].filter((k) => k !== excepto);
  const ultima = ids[ids.length - 1];
  if (ultima) ventanasAbiertas.get(ultima)?.();
}
