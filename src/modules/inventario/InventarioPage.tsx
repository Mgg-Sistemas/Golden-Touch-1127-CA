import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { money, num } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { useRealtime } from '@/shared/lib/useRealtime';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type { Almacen, Existencia, Orden, Producto, TransferenciaCasiteritaInter } from '@/shared/lib/types';
import { TransferenciasInterModal } from '@/shared/ui/TransferenciasInterModal';
import {
  listTransferenciasCasiterita,
  reintentarTrasladoCasiterita,
  revertirTrasladoCasiterita,
} from './casiteritaInter.repository';
import {
  addCategoria,
  contarProductosPorCategoria,
  createProducto,
  eliminarCategoria,
  findBySku,
  getCategorias,
  listProductos,
  listRecepcionesFinalizadas,
  listRecepcionesPorMarcar,
  contarRecepcionesPorMarcar,
  renombrarCategoria,
  setEstadoProducto,
  updateProducto,
  getUnidades,
  listProductosTodosLosDepositos,
  addUnidad,
  renombrarUnidad,
  eliminarUnidad,
  contarProductosPorUnidad,
  buscarProductosParecidos,
  type ProductoInput,
  type ProductoParecido,
} from './inventario.repository';
import { contarProduccionEnProceso } from '@/modules/produccion/produccion.repository';
import { resumenContratos } from '@/modules/produccion/contratos.repository';
import { listComprasPendientesRecepcion, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { GestionarCategoriasModal } from '@/shared/ui/GestionarCategoriasModal';
import {
  registrarMovimiento,
  type MovimientoInput,
} from './movimientos.repository';
import { DEFAULT_POLICY, decorate, type ProductoDecorado } from './restock';
import { ProductosTable } from './ProductosTable';
import { ProductoForm } from './ProductoForm';
import { ProductoDuplicadoModal } from './ProductoDuplicadoModal';
import { movimientoSumarStockDuplicado, requiereValidacionDuplicados } from './duplicadosDeposito';
import { ProductoDetail } from './ProductoDetail';
import { PapeleraInventarioModal } from './PapeleraInventarioModal';
import { MovimientoForm } from './MovimientoForm';
import { AlertasStock } from './AlertasStock';
import { RecepcionesPendientes } from './RecepcionesPendientes';
import { ExportInventarioModal } from './ExportInventarioModal';
import { ImportarExcelModal } from './ImportarExcelModal';
import { ResumenInventarioModal } from './ResumenInventarioModal';
import { ProductosInactivosModal } from './ProductosInactivosModal';
import { CostosYMedidasModal, contarSinCosto } from './CostosYMedidasModal';
import { RecepcionesHistorialModal } from './RecepcionesHistorial';
import { analizarExcel, descargarPlantillaExcel, type AnalisisImport } from './inventarioBulk';
import { InventarioFilterbar, type FilterValues } from './InventarioFilterbar';
import { coincideBusquedaProducto, rutaDetalleProducto } from './busquedaProductos';
import {
  ALMACEN_GENERAL,
  ALMACEN_MINA,
  ALMACEN_REUTILIZABLES,
  ALMACEN_DANADOS,
  resolverDeposito,
  esDelDeposito,
  DEPOSITOS,
  type Deposito,
} from './depositos';
import {
  listAlmacenes,
  listExistencias,
} from './almacenes.repository';
import { CrearDepositoModal } from './CrearDepositoModal';
import { EnviarMaterialMggModal } from './EnviarMaterialMggModal';

interface UiState extends FilterValues {
  view: 'productos' | 'recepciones';
}

const INITIAL_UI: UiState = {
  view: 'productos',
  filterText: '',
  filterCat: [],
  filterClass: '',
  filterStock: '',
  filterFundicion: '',
};

/** Predicado de filtros del inventario general. */
function coincideFiltros(p: ProductoDecorado, ui: UiState): boolean {
  // SOLO ACTIVOS, sin opción de ver los otros. Un producto inactivo se dio de
  // baja o se unificó en otro: mostrarlo hacía parecer que había dos productos
  // donde queda uno. Los dados de baja viven en «Productos inactivos».
  if (p.estado !== 'activo') return false;
  // Varias categorías a la vez (casillas, 12/10/2026): ninguna marcada = todas.
  if (ui.filterCat.length && !ui.filterCat.includes(p.categoria)) return false;
  if (ui.filterClass && p._klass !== ui.filterClass) return false;
  if (ui.filterFundicion === 'si' && !p.receta_fundicion) return false;
  if (ui.filterFundicion === 'no' && p.receta_fundicion) return false;
  if (ui.filterFundicion === 'en_proceso' && !p.en_fundicion) return false;
  if (ui.filterStock === 'critico' && !p._critical) return false;
  if (ui.filterStock === 'restock' && !(p._needsRestock && !p._critical)) return false;
  if (ui.filterStock === 'ok' && p._needsRestock) return false;
  if (ui.filterStock === 'sin_mov' && (p.stock ?? 0) > 0) return false;
  // Nombre + SKU + detalle, por palabras y sin que «de/para» esconda una ficha.
  if (!coincideBusquedaProducto(p, ui.filterText)) return false;
  return true;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'crear' }
  | { kind: 'duplicado'; data: ProductoInput; parecidos: ProductoParecido[] }
  | { kind: 'editar'; producto: Producto }
  | { kind: 'detalle'; producto: Producto }
  | { kind: 'movimiento'; producto: Producto }
  | { kind: 'confirmToggle'; producto: Producto }
  | { kind: 'export' }
  | { kind: 'inactivos' }
  | { kind: 'resumen' }
  | { kind: 'recepciones' }
  | { kind: 'costos' }
  | { kind: 'transferencias' }
  | { kind: 'material-mgg' }
  | { kind: 'nuevo-deposito' }
  | { kind: 'import'; analisis: AnalisisImport };

/**
 * Inventario General y Depósito Mina (05/10/2026) son la MISMA pantalla sobre dos
 * catálogos independientes: `deposito` decide qué productos se ven y a cuál entra lo
 * que se agrega (botón «+ Nuevo producto», importación de Excel). Lo que es propio del
 * General (recepciones de compras, casiterita a MGG) no aparece en la Mina.
 */
export function InventarioPage({ deposito: propDeposito }: { deposito?: Deposito } = {}) {
  const params = useParams<{ slug?: string }>();
  const depKey = propDeposito ?? params.slug ?? 'general';
  const dep = resolverDeposito(depKey);
  const deposito = dep.almacen;
  const esGeneral = dep.almacen === ALMACEN_GENERAL;
  const esMina = dep.almacen === ALMACEN_MINA;
  const esReutilizables = dep.almacen === ALMACEN_REUTILIZABLES;
  const esDanados = dep.almacen === ALMACEN_DANADOS;
  const { user } = useSession();
  const { can, appUser, puedeVista, isAdmin, vistasDelRol, puedeVerAlmacen, puedeEscribirAlmacen } = usePermissions();
  // Cada depósito con su permiso (30/10/2026); en el General es el del módulo Inventario.
  const canWrite = puedeEscribirAlmacen(dep.almacen);
  // Lo que es de todo el inventario (categorías, crear depósitos, casiterita) sigue con el módulo.
  const canWriteModulo = can('inventario', 'escritura');
  const telDeposito = esMina
    ? puedeVista('deposito_mina')
    : isAdmin || vistasDelRol.some((k) => k === 'deposito_mina' || k === 'inventario');
  const [productos, setProductos] = useState<Producto[]>([]);
  // Si la búsqueda no encuentra nada AQUÍ, fichas que sí existen en OTRO depósito.
  const [enOtrosDepositos, setEnOtrosDepositos] = useState<Producto[]>([]);
  const [recepciones, setRecepciones] = useState<Orden[]>([]);
  const [recepcionesPendientes, setRecepcionesPendientes] = useState<Orden[]>([]);
  // Cuántas órdenes están pendientes por marcar la recepción (lo que cuenta el botón).
  const [recepcionesPorMarcar, setRecepcionesPorMarcar] = useState(0);
  // Compras directas PAGADAS que esperan que el almacenista les dé entrada al inventario.
  const [comprasRecep, setComprasRecep] = useState<CompraDirecta[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [enProduccion, setEnProduccion] = useState(0);
  // Casiterita que YA entró al inventario por contratos FINALIZADOS (cerrados) + su conteo.
  const [kgCasiterita, setKgCasiterita] = useState(0);
  const [contratosCerrados, setContratosCerrados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [procesandoDuplicado, setProcesandoDuplicado] = useState(false);
  // GT-INT-11 · Casiterita enviada a MGG. Se carga siempre (no solo al abrir el modal)
  // para poder avisar en la barra cuando alguna quedó sin llegar: el material ya salió
  // del inventario, así que enterarse tarde es justamente el problema.
  const [transfCasiterita, setTransfCasiterita] = useState<TransferenciaCasiteritaInter[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [gestionCatsOpen, setGestionCatsOpen] = useState(false);
  const [papeleraOpen, setPapeleraOpen] = useState(false);
  const [conteoCats, setConteoCats] = useState<Record<string, number>>({});
  const [unidades, setUnidades] = useState<string[]>([]);
  const [conteoUnid, setConteoUnid] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!gestionCatsOpen) return;
    contarProductosPorCategoria().then(setConteoCats).catch(() => setConteoCats({}));
    contarProductosPorUnidad().then(setConteoUnid).catch(() => setConteoUnid({}));
    getUnidades(productos).then(setUnidades).catch(() => setUnidades([]));
  }, [gestionCatsOpen, productos]);

  // Realtime multiusuario: el stock y las recepciones se reflejan al instante.
  // GT-INT-11 · `transferencias_casiterita_inter` entra a la suscripción: si a otro
  // usuario le falla un envío a MGG, el aviso aparece aquí sin recargar la página.
  useRealtime(['productos', 'movimientos', 'almacenes', 'ordenes', 'compras_directas', 'transferencias_casiterita_inter'], () => { void reload(); });

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const analisis = await analizarExcel(file, deposito);
      setModal({ kind: 'import', analisis });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo leer el archivo', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [prods, ords, pendientes, porMarcar, alms, exs, nEnProduccion, cRecep, resContratos, transfCas] = await Promise.all([
        listProductos(deposito),
        listRecepcionesFinalizadas().catch(() => [] as Orden[]),
        listRecepcionesPorMarcar().catch(() => [] as Orden[]),
        contarRecepcionesPorMarcar().catch(() => 0),
        listAlmacenes().catch(() => [] as Almacen[]),
        listExistencias().catch(() => [] as Existencia[]),
        contarProduccionEnProceso().catch(() => 0),
        listComprasPendientesRecepcion().catch(() => [] as CompraDirecta[]),
        resumenContratos().catch(() => null),
        // Que el puente esté caído no debe dejar el inventario en blanco.
        listTransferenciasCasiterita().catch(() => [] as TransferenciaCasiteritaInter[]),
      ]);
      setProductos(prods);
      setRecepciones(ords);
      setRecepcionesPendientes(pendientes);
      setRecepcionesPorMarcar(porMarcar);
      setComprasRecep(cRecep);
      setAlmacenes(alms);
      setExistencias(exs);
      setEnProduccion(nEnProduccion);
      setKgCasiterita(resContratos?.kgCasiteritaCerrados ?? 0);
      setContratosCerrados(resContratos?.cerrados ?? 0);
      setTransfCasiterita(transfCas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // Carga al montar y al cambiar de depósito (General ↔ Mina comparten la página).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposito]);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('detalle');
    if (!id || !productos.length) return;
    const p = productos.find((x) => x.id === id);
    if (p) {
      setModal({ kind: 'detalle', producto: p });
      const next = new URLSearchParams(searchParams);
      next.delete('detalle');
      setSearchParams(next, { replace: true });
    }
  }, [productos, searchParams, setSearchParams]);

  const decorated = useMemo<ProductoDecorado[]>(
    () => decorate(productos, DEFAULT_POLICY),
    [productos],
  );

  const filtered = useMemo<ProductoDecorado[]>(
    () => decorated.filter((p) => coincideFiltros(p, ui)),
    [decorated, ui],
  );

  // «No lo veo en el inventario»: si la ficha pertenece a otro depósito, no la
  // mezclamos en la tabla ni sumamos su stock, pero decimos DÓNDE está y damos
  // el enlace directo. Caso real: INS-180 cargado en Mina y buscado en Los Pinos.
  useEffect(() => {
    let cancelado = false;
    const q = ui.filterText.trim();
    if (!q || loading || filtered.length > 0) {
      setEnOtrosDepositos([]);
      return;
    }
    const timer = window.setTimeout(() => {
      listProductosTodosLosDepositos()
        .then((todos) => {
          if (cancelado) return;
          setEnOtrosDepositos(todos
            .filter((p) => p.estado === 'activo' && !esDelDeposito(p, deposito) && coincideBusquedaProducto(p, q))
            .slice(0, 6));
        })
        .catch(() => { if (!cancelado) setEnOtrosDepositos([]); });
    }, 180);
    return () => { cancelado = true; window.clearTimeout(timer); };
  }, [ui.filterText, filtered.length, loading, deposito]);

  // Existencias agrupadas por producto (para pasarlas al formulario de movimiento).
  const existMap = useMemo(() => {
    const m = new Map<string, Existencia[]>();
    existencias.forEach((e) => {
      const arr = m.get(e.producto_id) ?? [];
      arr.push(e);
      m.set(e.producto_id, arr);
    });
    return m;
  }, [existencias]);

  const [categorias, setCategorias] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getCategorias(productos)
      .then((cs) => { if (!cancelled) setCategorias(cs); })
      .catch(() => { /* defaults via repo */ });
    return () => { cancelled = true; };
  }, [productos]);

  const kpis = useMemo(() => {
    const activos = decorated.filter((p) => p.estado === 'activo');
    const valorTotal = activos.reduce((a, p) => a + p._valor, 0);
    const stockTotal = activos.reduce((a, p) => a + (p.stock ?? 0), 0);
    const promedio = activos.length ? stockTotal / activos.length : 0;
    const criticos = activos.filter((p) => p._critical).length;
    const enFundicion = activos.filter((p) => p.en_fundicion).length;
    return {
      total: activos.length,
      valor: valorTotal,
      promedio,
      criticos,
      enFundicion,
    };
  }, [decorated]);

  // Productos activos que valen $0: existen y se mueven, pero no tienen costo.
  const sinCosto = useMemo(() => contarSinCosto(productos), [productos]);

  const productoActor = appUser?.email ?? user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;
  const casiteritaEnError = useMemo(
    () => transfCasiterita.filter((t) => t.estado === 'error').length,
    [transfCasiterita],
  );

  // ─── handlers ───
  const openVer = useCallback((id: string) => {
    setProductos((curr) => {
      const p = curr.find((x) => x.id === id);
      if (p) setModal({ kind: 'detalle', producto: p });
      return curr;
    });
  }, []);

  const openEditar = useCallback((id: string) => {
    setProductos((curr) => {
      const p = curr.find((x) => x.id === id);
      if (p) setModal({ kind: 'editar', producto: p });
      return curr;
    });
  }, []);

  const openMovimiento = useCallback((id: string) => {
    setProductos((curr) => {
      const p = curr.find((x) => x.id === id);
      if (p) setModal({ kind: 'movimiento', producto: p });
      return curr;
    });
  }, []);

  const askToggleEstado = useCallback((id: string) => {
    setProductos((curr) => {
      const p = curr.find((x) => x.id === id);
      if (p) setModal({ kind: 'confirmToggle', producto: p });
      return curr;
    });
  }, []);

  async function crearProductoConfirmado(data: ProductoInput) {
    const dup = await findBySku(data.sku);
    if (dup) throw new Error('Ya existe un producto con ese SKU.');
    const stockInicial = data.stock;
    // El botón es dinámico: el producto entra al depósito que se está viendo.
    data = { ...data, almacen: dep.almacen };
    const created = await createProducto({ ...data, stock: 0 });
    if (stockInicial > 0) {
      await registrarMovimiento({
        producto_id: created.id,
        tipo: 'creacion',
        delta: stockInicial,
        almacen: data.almacen,
        actor: productoActor,
        actor_name: actorName,
        detalle: `Stock inicial al dar de alta el producto · ${dep.nombre}`,
        // Costo inicial: fija la línea base del PMP del inventario y queda en la traza.
        precio_unitario: data.precio,
      });
    }
    notify(`Producto creado en ${dep.nombre}: ${data.sku} · ${data.nombre}`, 'success', { link: dep.hash });
    await reload();
  }

  async function handleCreateOrUpdate(data: ProductoInput) {
    if (modal.kind === 'crear') {
      // El botón es dinámico: el producto entra al depósito que se está viendo.
      data = { ...data, almacen: dep.almacen };
      // En los depósitos propios, antes de crear se pregunta si ya existe.
      // Si el usuario dice que sí, solo entra el stock al producto parecido.
      if (requiereValidacionDuplicados(dep.almacen)) {
        const parecidos = await buscarProductosParecidos(data.nombre, data.categoria, { almacen: dep.almacen });
        if (parecidos.length) {
          setModal({ kind: 'duplicado', data, parecidos });
          return;
        }
      }
      await crearProductoConfirmado(data);
      return;
    }
    if (modal.kind === 'editar') {
      const previo = modal.producto;
      const dup = await findBySku(data.sku);
      if (dup && dup.id !== previo.id) throw new Error('Ya existe otro producto con ese SKU.');
      // El stock se ajusta vía "Movimiento" (entrada/salida/ajuste); no se edita desde aquí.
      const rest: Partial<ProductoInput> = { ...data };
      delete (rest as Partial<ProductoInput>).stock;
      await updateProducto(previo.id, rest);
      notify(`Producto actualizado: ${data.sku} · ${data.nombre}`, 'success', { link: dep.hash });
      await reload();
    }
  }

  async function handleDuplicadoSumar(p: ProductoParecido) {
    if (modal.kind !== 'duplicado') return;
    const { data } = modal;
    setProcesandoDuplicado(true);
    try {
      if (data.stock > 0) {
        await registrarMovimiento(movimientoSumarStockDuplicado({
          productoId: p.id,
          almacen: dep.almacen,
          cantidad: data.stock,
          actor: productoActor,
          actorName,
          detalle: `«${data.nombre}» confirmado como ${p.sku} · ${dep.nombre}. No se creó un duplicado.`,
        }));
      }
      notify(`Stock sumado a ${p.sku} · ${p.nombre} en ${dep.nombre} (${data.stock} ${data.unidad}).`, 'success', { link: dep.hash });
      setModal({ kind: 'none' });
      await reload();
    } finally {
      setProcesandoDuplicado(false);
    }
  }

  async function handleDuplicadoCrearIgual() {
    if (modal.kind !== 'duplicado') return;
    const data = modal.data;
    setProcesandoDuplicado(true);
    try {
      // El usuario confirmó que NO es el mismo: alta normal con su stock.
      await crearProductoConfirmado(data);
      setModal({ kind: 'none' });
    } finally {
      setProcesandoDuplicado(false);
    }
  }

  async function handleRegistrarMovimiento(input: MovimientoInput) {
    await registrarMovimiento(input);
    notify(`Movimiento registrado en ${dep.nombre} (${input.tipo})`, 'success', { link: dep.hash });
    await reload();
  }

  async function handleToggleEstado(p: Producto) {
    const nuevo = p.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await setEstadoProducto(p.id, nuevo);
      notify(`Producto ${nuevo === 'activo' ? 'activado' : 'desactivado'}: ${p.sku}`, 'success', { link: dep.hash });
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cambiar el estado', 'error');
    } finally {
      setModal({ kind: 'none' });
    }
  }

  // Activar desde la pantalla de «Productos inactivos». A diferencia del toggle
  // del inventario, esta NO cierra la ventana: se suelen reactivar varios de una
  // sentada y cerrar después de cada uno obligaría a rehacer los filtros.
  async function handleActivarDesdeBaja(p: Producto) {
    try {
      await setEstadoProducto(p.id, 'activo');
      notify(`Producto activado: ${p.sku} · ${p.nombre}`, 'success', { link: dep.hash });
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo activar el producto', 'error');
    }
  }

  const inactivosCount = useMemo(() => productos.filter((p) => p.estado === 'inactivo').length, [productos]);

  function setFilter2(key: keyof FilterValues, value: string | string[]) {
    setUi((prev) => ({ ...prev, [key]: value }) as UiState);
  }

  // ─── render ───
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{dep.icono} {dep.nombre}</h1>
          <p className="hint">
            {esGeneral ? (
              <>Catálogo de productos del <strong>Inventario Los Pinos (General)</strong>.</>
            ) : (
              <>Catálogo del <strong>{dep.nombre}</strong>: independiente del Inventario General, con su propio stock, kardex y reportes.</>
            )}
            {' '}<span className="muted">Política ABC · A 120% · B 100% · C 80% del stock mínimo</span>
          </p>
        </div>
        <div className="actions">
          {esGeneral ? (
            <>
              {puedeVista('inventario') && <Link className="btn btn-ghost" to="/app/inventario/telefono" title="La pantalla del inventario con botones grandes para el teléfono: producto nuevo, entrada, traslado y reporte de stock">📱 Vista teléfono</Link>}
              <button
                className={`btn ${ui.view === 'productos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setUi((prev) => ({ ...prev, view: 'productos' }))}
              >
                Inventario general
              </button>
              <button
                className={`btn ${ui.view === 'recepciones' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setUi((prev) => ({ ...prev, view: 'recepciones' }))}
              >
                Recepciones {(recepcionesPorMarcar + comprasRecep.length) > 0 && <span className="badge warning" style={{ marginLeft: '.35rem' }}>{recepcionesPorMarcar + comprasRecep.length}</span>}
              </button>
              {/* Solo los depósitos que el rol tiene (Usuarios → Roles → Depósitos). */}
              {puedeVerAlmacen(ALMACEN_MINA) && <Link className="btn btn-ghost" to={DEPOSITOS.mina.ruta} title="Depósito independiente de la mina">⛏ Depósito Mina</Link>}
              {puedeVerAlmacen(ALMACEN_REUTILIZABLES) && <Link className="btn btn-ghost" to={DEPOSITOS.reutilizables.ruta} style={{ borderColor: '#10b981', color: '#10b981' }} title="Depósito de materiales reutilizables">♻️ Depósito Reutilizables</Link>}
              {puedeVerAlmacen(ALMACEN_DANADOS) && <Link className="btn btn-ghost" to={DEPOSITOS.danados.ruta} style={{ borderColor: '#f59e0b', color: '#f59e0b' }} title="Depósito de items y materiales dañados">⚠️ Depósito Items Dañados</Link>}
              {almacenes
                .filter((a) => a.nombre !== 'General' && a.nombre !== ALMACEN_MINA && a.nombre !== ALMACEN_REUTILIZABLES && a.nombre !== ALMACEN_DANADOS)
                .filter((a) => puedeVerAlmacen(a.nombre))
                .map((a) => {
                  const d = resolverDeposito(a.nombre);
                  return (
                    <Link key={a.id} className="btn btn-ghost" to={d.ruta} title={`Depósito: ${a.nombre}`}>
                      {d.icono} {a.nombre}
                    </Link>
                  );
                })}
              {canWriteModulo && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setModal({ kind: 'nuevo-deposito' })}
                  title="Crear un nuevo depósito independiente con catálogo propio y vista móvil"
                  style={{ fontWeight: 700 }}
                >
                  ➕ Crear depósito
                </button>
              )}
            </>
          ) : (
            <>
              {puedeVerAlmacen(ALMACEN_GENERAL) && (
                <Link className="btn btn-ghost" to="/app/inventario" title="Volver al Inventario Los Pinos">← Inventario Los Pinos</Link>
              )}
              {puedeVerAlmacen(ALMACEN_MINA) && (
                <Link className={`btn ${esMina ? 'btn-primary' : 'btn-ghost'}`} to={DEPOSITOS.mina.ruta} title="Depósito independiente de la mina">⛏ Depósito Mina</Link>
              )}
              {puedeVerAlmacen(ALMACEN_REUTILIZABLES) && (
                <Link className={`btn ${esReutilizables ? 'btn-primary' : 'btn-ghost'}`} to={DEPOSITOS.reutilizables.ruta} style={{ borderColor: '#10b981', color: esReutilizables ? undefined : '#10b981' }} title="Depósito de materiales reutilizables">♻️ Depósito Reutilizables</Link>
              )}
              {puedeVerAlmacen(ALMACEN_DANADOS) && (
                <Link className={`btn ${esDanados ? 'btn-primary' : 'btn-ghost'}`} to={DEPOSITOS.danados.ruta} style={{ borderColor: '#f59e0b', color: esDanados ? undefined : '#f59e0b' }} title="Depósito de items y materiales dañados">⚠️ Depósito Items Dañados</Link>
              )}
              {almacenes
                .filter((a) => a.nombre !== 'General' && a.nombre !== ALMACEN_MINA && a.nombre !== ALMACEN_REUTILIZABLES && a.nombre !== ALMACEN_DANADOS)
                .filter((a) => puedeVerAlmacen(a.nombre))
                .map((a) => {
                  const d = resolverDeposito(a.nombre);
                  const activo = dep.almacen === a.nombre;
                  return (
                    <Link key={a.id} className={`btn ${activo ? 'btn-primary' : 'btn-ghost'}`} to={d.ruta} title={`Depósito: ${a.nombre}`}>
                      {d.icono} {a.nombre}
                    </Link>
                  );
                })}
              {telDeposito && (
                <Link className="btn btn-ghost" to={dep.rutaTelefono} title={`La pantalla de ${dep.nombre} con botones grandes para el teléfono`}>
                  📱 Vista teléfono
                </Link>
              )}
            </>
          )}
          {puedeVerAlmacen(ALMACEN_GENERAL) && <button className="btn btn-ghost" onClick={() => setPapeleraOpen(true)}>🗑 Papelera</button>}
          {canWriteModulo && (
            <button
              className="btn btn-ghost"
              onClick={() => setGestionCatsOpen(true)}
              title="Renombrar / depurar categorías de inventario"
            >
              ⚙ Categorías
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => setModal({ kind: 'costos' })}
            title="Cargar el costo unitario y corregir la medida de los productos que valen $0"
          >
            ⚠ Costos y medidas
            {sinCosto > 0 && <span className="badge warning" style={{ marginLeft: '.35rem' }}>{sinCosto}</span>}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { void descargarPlantillaExcel(); }}
            title="Descargar plantilla de carga masiva"
          >
            ↓ Plantilla
          </button>
          {canWrite && (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                title="Importar productos desde un Excel"
              >
                {importing ? 'Importando…' : '↑ Importar Excel'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFileImport}
              />
            </>
          )}
          <button className="btn btn-ghost" onClick={() => setModal({ kind: 'resumen' })} title="Resumen: valor del inventario, productos nuevos, entradas y salidas">
            📊 Resumen
          </button>
          <button className="btn btn-ghost" onClick={() => setModal({ kind: 'export' })} title="Exportar inventario filtrado">
            ↓ Exportar
          </button>
          {/* Qué entró, quién lo recibió y a qué almacén. El kardex del producto muestra
              la entrada pero no lleva a la orden, y el histórico de pedidos lista órdenes,
              no recepciones. */}
          {!esMina && !esReutilizables && <button
            className="btn btn-ghost"
            onClick={() => setModal({ kind: 'recepciones' })}
            title="Histórico de recepciones: qué se recibió, cuándo, quién lo recibió y a qué almacén entró"
          >
            📦 Histórico de recepciones
          </button>}
          {/* Única puerta a los productos dados de baja: el inventario ya no los
              muestra. Desde ahí se consultan, se filtran y se pueden reactivar. */}
          <button
            className="btn btn-ghost"
            onClick={() => setModal({ kind: 'inactivos' })}
            title="Productos dados de baja: para el sistema no existen mientras sigan inactivos. Aquí se consultan y se pueden activar."
          >
            🗄 Productos inactivos{inactivosCount ? ` · ${inactivosCount}` : ''}
          </button>
          {!esMina && !esReutilizables && <button
            className={`btn ${casiteritaEnError ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setModal({ kind: 'transferencias' })}
            title={casiteritaEnError
              ? `${casiteritaEnError} envío(s) de casiterita a MGG no llegaron: el material ya salió del inventario`
              : 'Casiterita enviada a MGG y su estado'}
          >
            🌐 Casiterita a MGG{casiteritaEnError ? ` · ${casiteritaEnError}` : ''}
          </button>}
          {/* 10/11/2026: puente de material Los Pinos GT → Los Pinos MGG. */}
          {!esMina && !esReutilizables && (
            <button className="btn btn-ghost" onClick={() => setModal({ kind: 'material-mgg' })}
              title="Enviar productos del Almacén Los Pinos al Almacén Los Pinos de MGG (se confirman allá)">
              📦 Enviar a MGG Los Pinos
            </button>
          )}
          {canWrite && (
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ kind: 'crear' })}
              title={`El producto se agrega al ${dep.nombre}`}>
              + Nuevo producto{esReutilizables ? ' (Reutilizables)' : esMina ? ' (Mina)' : ''}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="icon">⬢</div>
          <div className="label">Productos activos</div>
          <div className="value">{num(kpis.total)}</div>
          <div className="delta">SKUs en catálogo</div>
        </div>
        <div className="kpi">
          <div className="icon">$</div>
          <div className="label">Valor del inventario</div>
          <div className="value">{money(kpis.valor)}</div>
          <div className="delta">stock × precio</div>
        </div>
        <div className="kpi">
          <div className="icon">⚠</div>
          <div className="label">En estado crítico</div>
          <div className="value">{num(kpis.criticos)}</div>
          <div className={kpis.criticos > 0 ? 'delta down' : 'delta'}>
            {kpis.criticos > 0 ? 'requieren atención' : 'todo en orden'}
          </div>
        </div>
        {!esMina && !esReutilizables && <a
          className="kpi"
          href="#/app/produccion"
          style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
          title="Casiterita ingresada al inventario por contratos finalizados (cerrados). Clic para ver Producción."
        >
          <div className="icon">🔥</div>
          <div className="label">Casiterita producida</div>
          <div className="value">{num(kgCasiterita)} <span style={{ fontSize: '.6em', fontWeight: 600 }}>Kg</span></div>
          <div className="delta">
            {contratosCerrados > 0
              ? `ingresada · ${num(contratosCerrados)} contrato${contratosCerrados !== 1 ? 's' : ''} finalizado${contratosCerrados !== 1 ? 's' : ''}${enProduccion > 0 ? ` · ${num(enProduccion)} en producción` : ''}`
              : (enProduccion > 0 ? `${num(enProduccion)} en producción` : 'sin contratos finalizados')}
          </div>
        </a>}
      </div>

      <AlertasStock productos={decorated} onVerProducto={openVer} />

      {ui.view === 'recepciones' && !esMina && !esReutilizables ? (
        <RecepcionesPendientes
          ordenes={recepciones}
          pendientes={recepcionesPendientes}
          comprasPendientes={comprasRecep}
          almacenes={almacenes}
          actor={productoActor}
          actorName={actorName}
          canWrite={canWrite}
          onRecibida={reload}
        />
      ) : (
        <>
          <InventarioFilterbar values={ui} categorias={categorias} onChange={setFilter2} />
          {!loading && filtered.length === 0 && enOtrosDepositos.length > 0 && (
            <div className="card" style={{ marginBottom: '.8rem', borderColor: 'var(--brand, #ff8a00)' }}>
              <strong>No está en {dep.nombre}, pero sí en otro depósito:</strong>
              <div style={{ display: 'grid', gap: '.45rem', marginTop: '.6rem' }}>
                {enOtrosDepositos.map((p) => {
                  const nombreDep = !p.almacen || p.almacen === ALMACEN_GENERAL ? 'Inventario Los Pinos' : p.almacen;
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '.65rem', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: 220 }}>
                        <strong>{p.nombre}</strong>
                        <div className="muted mono" style={{ fontSize: '.76rem' }}>
                          {p.sku} · {nombreDep} · {num(Number(p.stock) || 0)} {p.unidad}
                        </div>
                      </span>
                      <Link className="btn btn-sm btn-primary" to={rutaDetalleProducto(p)}>
                        Abrir en {nombreDep}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {loading ? (
            <EmptyState message="Cargando productos…" icon="◔" />
          ) : (
            <ProductosTable
              rows={filtered}
              onView={openVer}
              onEdit={openEditar}
              onMovimiento={openMovimiento}
              onToggleEstado={askToggleEstado}
              canWrite={canWrite}
            />
          )}
        </>
      )}

      {/* Modales */}
      {modal.kind === 'crear' && (
        <ProductoForm
          producto={null}
          productos={productos}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={handleCreateOrUpdate}
        />
      )}
      {modal.kind === 'duplicado' && (
        <ProductoDuplicadoModal
          nombreNuevo={modal.data.nombre}
          categoriaNueva={modal.data.categoria}
          unidadNueva={modal.data.unidad}
          cantidad={modal.data.stock}
          almacen={dep.almacen}
          parecidos={modal.parecidos}
          onSumarStock={(p) => void handleDuplicadoSumar(p)}
          onCrearIgual={() => void handleDuplicadoCrearIgual()}
          onClose={() => setModal({ kind: 'none' })}
          procesando={procesandoDuplicado}
        />
      )}
      {modal.kind === 'editar' && (
        <ProductoForm
          producto={modal.producto}
          productos={productos}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={handleCreateOrUpdate}
        />
      )}
      {modal.kind === 'detalle' && (
        <ProductoDetail
          producto={productos.find((p) => p.id === modal.producto.id) ?? modal.producto}
          puedeRevertir={canWrite}
          onChanged={reload}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'movimiento' && (
        <MovimientoForm
          producto={modal.producto}
          existencias={existMap.get(modal.producto.id) ?? []}
          actorEmail={productoActor}
          actorName={actorName}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={handleRegistrarMovimiento}
        />
      )}
      {modal.kind === 'confirmToggle' && (
        <ConfirmDialog
          title={modal.producto.estado === 'activo' ? 'Desactivar producto' : 'Activar producto'}
          // Desactivar saca al producto de la lista y ya no hay filtro para
          // volver a verlo, así que el aviso lo dice antes, no después.
          message={modal.producto.estado === 'activo'
            ? `¿Confirmas desactivar "${modal.producto.nombre}" (${modal.producto.sku})? Sale del inventario, de los almacenes, del buscador y de las listas de Cocina. Para volver a verlo o reactivarlo está el botón «Productos inactivos».`
            : `¿Confirmas activar "${modal.producto.nombre}" (${modal.producto.sku})?`}
          confirmText={modal.producto.estado === 'activo' ? 'Desactivar' : 'Activar'}
          danger={modal.producto.estado === 'activo'}
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={() => handleToggleEstado(modal.producto)}
        />
      )}
      {modal.kind === 'inactivos' && (
        <ProductosInactivosModal
          productos={productos}
          canWrite={canWrite}
          onActivar={handleActivarDesdeBaja}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'costos' && (
        <CostosYMedidasModal
          productos={productos}
          actor={productoActor}
          actorName={actorName}
          canWrite={canWrite}
          onClose={() => setModal({ kind: 'none' })}
          onGuardado={() => { void reload(); }}
        />
      )}
      {modal.kind === 'export' && (
        <ExportInventarioModal
          productos={productos}
          titulo={dep.nombre}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'resumen' && (
        <ResumenInventarioModal
          defaultEmail={appUser?.email ?? user?.email ?? ''}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'recepciones' && (
        <RecepcionesHistorialModal
          productos={productos}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'transferencias' && (
        <TransferenciasInterModal
          recurso="Casiterita"
          unidad="kilos"
          filas={transfCasiterita.map((t) => ({
            id: t.id, estado: t.estado, resumen: t.resumen, motivo: t.motivo,
            mensaje_error: t.mensaje_error, created_at: t.created_at,
            actor: t.actor, actor_name: t.actor_name,
            revertida_at: t.revertida_at, revertida_por: t.revertida_por,
            origen: t.almacen_origen,
          }))}
          puedeOperar={canWriteModulo}
          onReintentar={async (id) => {
            await reintentarTrasladoCasiterita({ id, actor: productoActor, actorName });
            await reload();
          }}
          onRevertir={async (id) => {
            await revertirTrasladoCasiterita({ id, actor: productoActor, actorName });
            await reload();
          }}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'material-mgg' && (
        <EnviarMaterialMggModal actor={productoActor} actorName={actorName ?? null} puedeOperar={canWriteModulo}
          onClose={() => setModal({ kind: 'none' })} onCambio={() => { void reload(); }} />
      )}
      {modal.kind === 'import' && (
        <ImportarExcelModal
          analisis={modal.analisis}
          actor={productoActor}
          actorName={actorName}
          onClose={() => setModal({ kind: 'none' })}
          onImportado={() => { void reload(); }}
        />
      )}
      {modal.kind === 'nuevo-deposito' && (
        <CrearDepositoModal
          open
          onClose={() => setModal({ kind: 'none' })}
          existentes={almacenes}
          actorEmail={user?.email}
          onCreated={() => {
            void reload();
          }}
        />
      )}

      {papeleraOpen && <PapeleraInventarioModal almacenes={almacenes} onChanged={reload} onClose={() => setPapeleraOpen(false)} />}
      {gestionCatsOpen && (
        <GestionarCategoriasModal
          titulo="Categorías y medidas de inventario"
          tabs={[
            {
              label: '🏷 Categorías',
              categorias,
              conteoUso: conteoCats,
              entidadLabel: 'producto',
              terminoSingular: 'categoría',
              onRenombrar: (o, n) => renombrarCategoria(o, n, productoActor),
              onEliminar: (n) => eliminarCategoria(n),
              onAgregar: (n) => addCategoria(n, productoActor),
            },
            {
              label: '📏 Medidas',
              categorias: unidades,
              conteoUso: conteoUnid,
              entidadLabel: 'producto',
              terminoSingular: 'medida',
              onRenombrar: (o, n) => renombrarUnidad(o, n, productoActor),
              onEliminar: (n) => eliminarUnidad(n),
              onAgregar: (n) => addUnidad(n, productoActor),
            },
          ]}
          onCambioAplicado={async () => {
            await reload();
            const [cs, c, us, cu] = await Promise.all([
              getCategorias(productos), contarProductosPorCategoria(),
              getUnidades(productos), contarProductosPorUnidad(),
            ]);
            setCategorias(cs); setConteoCats(c); setUnidades(us); setConteoUnid(cu);
          }}
          onClose={() => setGestionCatsOpen(false)}
        />
      )}
    </div>
  );
}
