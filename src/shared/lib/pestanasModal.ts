/* ============================================================
   Golden Touch · Pestañas minimizadas de los modales

   Un modal (los de pantalla completa) se puede MINIMIZAR a una pestaña en la
   barra inferior y volver a abrir después, para ver otra orden o consultar algo
   de la misma pantalla sin perder lo que se tenía abierto o escrito.

   Reglas:
     · Hasta MAX_MINIMIZADAS (3) pestañas minimizadas a la vez.
     · SOLO DENTRO DE UN MÓDULO: la pestaña sigue viva porque su modal sigue
       montado en la página. Al cambiar de módulo la página se desmonta y las
       pestañas se pierden; por eso el menú pregunta antes (ver
       `necesitaAvisoSalida` y `solicitarSalida`).
     · Los diálogos pequeños de confirmación (compact) no se minimizan.

   El almacén vive fuera de React (se lee con `useSyncExternalStore`) para que el
   modal, la barra y el menú lateral compartan el mismo estado sin un contexto.
   ============================================================ */
import { useSyncExternalStore } from 'react';

export const MAX_MINIMIZADAS = 3;

export interface Pestana {
  id: string;
  titulo: string;
  minimizada: boolean;
}

export interface EstadoPestanas {
  /** Todas las ventanas minimizables abiertas, en el orden en que se abrieron. */
  ventanas: Pestana[];
  /** Solo las minimizadas (lo que muestra la barra). */
  minimizadas: Pestana[];
  /** Hay una barra montada: sin ella no se ofrece minimizar (nadie podría restaurar). */
  hayBarra: boolean;
  /** Ruta a la que el usuario quiere ir y está esperando que confirme la salida. */
  salidaPendiente: string | null;
}

let ventanas: Pestana[] = [];
let alCerrar = new Map<string, () => void>();
let barras = 0;
let salidaPendiente: string | null = null;
const oyentes = new Set<() => void>();

const calcular = (): EstadoPestanas => ({
  ventanas,
  minimizadas: ventanas.filter((v) => v.minimizada),
  hayBarra: barras > 0,
  salidaPendiente,
});
let instantanea: EstadoPestanas = calcular();

function emitir() {
  instantanea = calcular();
  oyentes.forEach((fn) => fn());
}

export function suscribirPestanas(fn: () => void): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

export function leerPestanas(): EstadoPestanas {
  return instantanea;
}

export function usePestanas(): EstadoPestanas {
  return useSyncExternalStore(suscribirPestanas, leerPestanas, leerPestanas);
}

/** Un modal se abrió. */
export function registrarVentana(id: string, titulo: string, onClose: () => void): void {
  alCerrar.set(id, onClose);
  if (ventanas.some((v) => v.id === id)) return;
  ventanas = [...ventanas, { id, titulo, minimizada: false }];
  emitir();
}

/** El modal se re-dibujó: su título puede haber cambiado y su `onClose` es otra función. */
export function actualizarVentana(id: string, titulo: string, onClose: () => void): void {
  alCerrar.set(id, onClose);
  const v = ventanas.find((x) => x.id === id);
  if (!v || v.titulo === titulo) return;
  ventanas = ventanas.map((x) => (x.id === id ? { ...x, titulo } : x));
  emitir();
}

/** El modal se cerró (o su página se desmontó): su pestaña desaparece. */
export function quitarVentana(id: string): void {
  alCerrar.delete(id);
  if (!ventanas.some((v) => v.id === id)) return;
  ventanas = ventanas.filter((v) => v.id !== id);
  emitir();
}

export function puedeMinimizar(): boolean {
  return ventanas.filter((v) => v.minimizada).length < MAX_MINIMIZADAS;
}

/** Minimiza una ventana. `false` si ya hay 3 minimizadas (o la ventana no existe). */
export function minimizarVentana(id: string): boolean {
  const v = ventanas.find((x) => x.id === id);
  if (!v) return false;
  if (v.minimizada) return true;
  if (!puedeMinimizar()) return false;
  ventanas = ventanas.map((x) => (x.id === id ? { ...x, minimizada: true } : x));
  emitir();
  return true;
}

/** Restaura una ventana. La que estaba a la vista pasa a minimizada (intercambio),
 *  para que la restaurada quede arriba sin apilarse debajo de otra. */
export function restaurarVentana(id: string): void {
  if (!ventanas.some((v) => v.id === id)) return;
  ventanas = ventanas.map((x) => {
    if (x.id === id) return { ...x, minimizada: false };
    return x.minimizada ? x : { ...x, minimizada: true };
  });
  emitir();
}

/** Cierra una pestaña desde la barra: es el mismo cierre que la ✕ del modal. */
export function cerrarVentana(id: string): void {
  alCerrar.get(id)?.();
}

/** La barra de pestañas se montó (el AppShell). Devuelve cómo desmontarla. */
export function montarBarraPestanas(): () => void {
  barras += 1;
  emitir();
  return () => { barras = Math.max(0, barras - 1); emitir(); };
}

/* ───────── Salir de un módulo con pestañas minimizadas ───────── */

/** Módulo de una ruta (`/app/pedidos/historico` → `pedidos`). El Depósito Mina vive
 *  bajo Inventario pero es otro módulo para el usuario. */
export function claveModulo(pathname: string): string {
  const seg = pathname.replace(/^\/app\/?/, '').split('/').filter(Boolean);
  if (seg[0] === 'inventario' && seg[1] === 'deposito-mina') return 'deposito-mina';
  return seg[0] ?? '';
}

const ETIQUETAS_MODULO: Record<string, string> = {
  dashboard: 'Dashboard',
  pedidos: 'Pedidos / Compras',
  proveedores: 'Proveedores',
  inventario: 'Inventario',
  'deposito-mina': 'Depósito Mina',
  produccion: 'Producción',
  salidas: 'Salidas / Traslados',
  combustible: 'Combustible',
  acopio: 'Centro de Costo PERAMANAL',
  recepciones: 'Recepciones',
  cocina: 'Control de Alimentación (Cocina)',
  tesoreria: 'Tesorería',
  ventas: 'Ventas',
  retenciones: 'Retenciones',
  documentacion: 'Documentación',
  rrhh: 'RRHH / Nómina',
  geodesta: 'Geodesta',
  asignaciones: 'Asignaciones',
  choferes: 'Choferes / Conductores',
  maquinaria: 'Control de Maquinaria y Vehículos',
  usuarios: 'Usuarios',
  auditoria: 'Auditoría',
  ajustes: 'Ajustes',
  telefono: 'Teléfono',
};

/** Nombre del módulo para mostrarlo al usuario; `null` si la ruta no es de un módulo. */
export function etiquetaModulo(pathname: string): string | null {
  return ETIQUETAS_MODULO[claveModulo(pathname)] ?? null;
}

/** ¿Ir de `desde` a `hacia` hace perder pestañas minimizadas? Solo si hay alguna y
 *  el destino es OTRO módulo (dentro del mismo módulo la página no se desmonta). */
export function necesitaAvisoSalida(desde: string, hacia: string): boolean {
  if (!ventanas.some((v) => v.minimizada)) return false;
  return claveModulo(desde) !== claveModulo(hacia);
}

/** Pide confirmar la salida: el AppShell muestra el aviso con esta ruta pendiente. */
export function solicitarSalida(hacia: string): void {
  salidaPendiente = hacia;
  emitir();
}

export function descartarSalida(): void {
  if (salidaPendiente === null) return;
  salidaPendiente = null;
  emitir();
}

/** Solo para pruebas: deja el almacén como recién arrancado. */
export function reiniciarPestanas(): void {
  ventanas = [];
  alCerrar = new Map();
  barras = 0;
  salidaPendiente = null;
  emitir();
}
