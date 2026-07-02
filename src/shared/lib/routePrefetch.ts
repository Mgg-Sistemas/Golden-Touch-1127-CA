/* ============================================================
   Golden Touch · Prefetch de rutas
   Las páginas se cargan en chunks separados (lazy en App.tsx). Sin prefetch,
   el chunk del módulo se descarga RECIÉN al hacer clic → la navegación "tarda".
   Acá bajamos ese JS ANTES: al pasar el mouse/foco por el ítem del menú y, en
   segundo plano (idle), los módulos a los que el usuario tiene acceso. Así el
   clic navega al instante.

   Los import() usan los MISMOS módulos que App.tsx (Vite deduplica por id), así
   que se comparte el chunk: precargar acá deja el módulo en caché para el lazy().
   ============================================================ */

type Loader = () => Promise<unknown>;

/** Ruta → import del módulo (mismos specifiers que App.tsx, chunk compartido). */
const LOADERS: Record<string, Loader> = {
  '/app/dashboard': () => import('@/modules/dashboard/DashboardPage'),
  '/app/pedidos': () => import('@/modules/pedidos/PedidosPage'),
  '/app/pedidos/historico': () => import('@/modules/pedidos/HistoricoPage'),
  '/app/proveedores': () => import('@/modules/proveedores/ProveedoresPage'),
  '/app/inventario': () => import('@/modules/inventario/InventarioPage'),
  '/app/produccion': () => import('@/modules/produccion/ProduccionPage'),
  '/app/salidas': () => import('@/modules/salidas/SalidasPage'),
  '/app/combustible': () => import('@/modules/combustible/CombustiblePage'),
  '/app/acopio': () => import('@/modules/acopio/AcopioPage'),
  '/app/cocina': () => import('@/modules/cocina/CocinaPage'),
  '/app/tesoreria': () => import('@/modules/tesoreria/TesoreriaPage'),
  '/app/retenciones': () => import('@/modules/retenciones/RetencionesPage'),
  '/app/recepciones': () => import('@/modules/recepciones/RecepcionesPage'),
  '/app/rrhh': () => import('@/modules/rrhh/RrhhPage'),
  '/app/maquinaria': () => import('@/modules/maquinaria/MaquinariaPage'),
  '/app/maquinaria/servicio-mantenimiento': () => import('@/modules/maquinaria/ServicioMantenimientoPage'),
  '/app/usuarios': () => import('@/modules/usuarios/UsuariosPage'),
  '/app/ajustes': () => import('@/modules/ajustes/AjustesPage'),
};

const hechos = new Set<string>();

/** Precarga el chunk de una ruta (una sola vez). Silencioso: si falla, se reintenta luego. */
export function prefetchRuta(path: string): void {
  const load = LOADERS[path];
  if (!load || hechos.has(path)) return;
  hechos.add(path);
  load().catch(() => { hechos.delete(path); });
}

type IdleWin = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/** Precarga en segundo plano (idle, de a una y tras un respiro) una lista de rutas.
 *  Deja cargar primero la página actual; no compite con el hilo principal.
 *  Devuelve una función para cancelar. */
export function prefetchRutasEnIdle(paths: string[], demoraInicialMs = 2500): () => void {
  let cancelado = false;
  const cola = paths.filter((p) => LOADERS[p] && !hechos.has(p));
  const win = window as IdleWin;
  const agendar = (fn: () => void): number =>
    win.requestIdleCallback ? win.requestIdleCallback(fn, { timeout: 2000 }) : window.setTimeout(fn, 300);
  const paso = () => {
    if (cancelado) return;
    const siguiente = cola.shift();
    if (!siguiente) return;
    prefetchRuta(siguiente);
    agendar(paso);
  };
  const inicio = window.setTimeout(() => agendar(paso), demoraInicialMs);
  return () => { cancelado = true; window.clearTimeout(inicio); };
}
