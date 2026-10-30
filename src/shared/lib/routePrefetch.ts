/* ============================================================
   Golden Touch · Prefetch de rutas
   Las páginas se cargan en chunks separados (lazy en App.tsx). Sin prefetch,
   el chunk del módulo se descarga RECIÉN al hacer clic → la navegación "tarda".
   Aquí bajamos ese JS ANTES: al pasar el mouse/foco por el ítem del menú y, en
   segundo plano (idle), los módulos a los que el usuario tiene acceso. Así el
   clic navega al instante.

   Los import() usan los MISMOS módulos que App.tsx (Vite deduplica por id), así
   que se comparte el chunk: precargar aquí deja el módulo en caché para el lazy().
   ============================================================ */

type Loader = () => Promise<unknown>;

/** Ruta → import del módulo (mismos specifiers que App.tsx, chunk compartido). */
const LOADERS: Record<string, Loader> = {
  '/app/dashboard': () => import('@/modules/dashboard/DashboardPage'),
  '/app/pedidos': () => import('@/modules/pedidos/PedidosPage'),
  '/app/pedidos/historico': () => import('@/modules/pedidos/HistoricoPage'),
  '/app/delivery': () => import('@/modules/delivery/DeliveryPage'),
  '/app/proveedores': () => import('@/modules/proveedores/ProveedoresPage'),
  '/app/inventario': () => import('@/modules/inventario/InventarioPage'),
  '/app/inventario/deposito-mina': () => import('@/modules/inventario/InventarioPage'),
  '/app/produccion': () => import('@/modules/produccion/ProduccionPage'),
  '/app/salidas': () => import('@/modules/salidas/SalidasPage'),
  '/app/combustible': () => import('@/modules/combustible/CombustiblePage'),
  '/app/acopio': () => import('@/modules/acopio/AcopioPage'),
  '/app/cocina': () => import('@/modules/cocina/CocinaPage'),
  '/app/tesoreria': () => import('@/modules/tesoreria/TesoreriaPage'),
  '/app/ventas': () => import('@/modules/ventas/VentasPage'),
  '/app/asignaciones': () => import('@/modules/asignaciones/AsignacionesPage'),
  '/app/retenciones': () => import('@/modules/retenciones/RetencionesPage'),
  '/app/recepciones': () => import('@/modules/recepciones/RecepcionesPage'),
  '/app/rrhh': () => import('@/modules/rrhh/RrhhPage'),
  '/app/maquinaria': () => import('@/modules/maquinaria/MaquinariaPage'),
  '/app/maquinaria/servicio-mantenimiento': () => import('@/modules/maquinaria/ServicioMantenimientoPage'),
  '/app/maquinaria/ordenes': () => import('@/modules/maquinaria/OrdenesServicioPage'),
  '/app/maquinaria/averias': () => import('@/modules/maquinaria/AveriasEstadosPage'),
  '/app/maquinaria/lavados': () => import('@/modules/maquinaria/LavadosPage'),
  '/app/maquinaria/repuestos': () => import('@/modules/maquinaria/RepuestosComprasPage'),
  '/app/maquinaria/repuestos-equipo': () => import('@/modules/maquinaria/RepuestosPorEquipoPage'),
  // Faltaban (14/10/2026): sin loader, el primer clic esperaba la descarga.
  '/app/choferes': () => import('@/modules/choferes/ChoferesPage'),
  '/app/geodesta': () => import('@/modules/geodesta/GeodestaPage'),
  '/app/documentacion': () => import('@/modules/documentacion/DocumentacionPage'),
  '/app/usuarios': () => import('@/modules/usuarios/UsuariosPage'),
  '/app/ajustes': () => import('@/modules/ajustes/AjustesPage'),
};

const hechos = new Set<string>();

/** Precarga el chunk de una ruta (una sola vez). Silencioso: si falla, se reintenta luego.
 *  Devuelve la promesa de la descarga (la cola de fondo la espera antes de seguir). */
export function prefetchRuta(path: string): Promise<void> {
  const load = LOADERS[path];
  if (!load || hechos.has(path)) return Promise.resolve();
  hechos.add(path);
  return load().then(() => undefined, () => { hechos.delete(path); });
}

type IdleWin = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/** Precarga en segundo plano (idle, DE A UNA: espera que termine cada descarga antes
 *  de pedir la siguiente, tras un respiro) una lista de rutas.
 *  Deja cargar primero la página actual; no compite con el hilo principal.
 *  Devuelve una función para cancelar. */
export function prefetchRutasEnIdle(paths: string[], demoraInicialMs = 2500): () => void {
  let cancelado = false;
  const cola = paths.filter((p) => LOADERS[p] && !hechos.has(p));
  const win = window as IdleWin;
  const agendar = (fn: () => void): number =>
    win.requestIdleCallback ? win.requestIdleCallback(fn, { timeout: 2000 }) : window.setTimeout(fn, 300);
  // Antes se pedía la siguiente sin esperar a la anterior: en la práctica bajaban
  // todos los módulos a la vez y le quitaban la conexión a los datos de la pantalla.
  const paso = () => {
    if (cancelado) return;
    const siguiente = cola.shift();
    if (!siguiente) return;
    void prefetchRuta(siguiente).finally(() => { if (!cancelado) agendar(paso); });
  };
  const inicio = window.setTimeout(() => agendar(paso), demoraInicialMs);
  return () => { cancelado = true; window.clearTimeout(inicio); };
}
