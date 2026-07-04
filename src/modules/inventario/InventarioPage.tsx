import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { money, num } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { useRealtime } from '@/shared/lib/useRealtime';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type { Almacen, Existencia, Orden, Producto } from '@/shared/lib/types';
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
  addUnidad,
  renombrarUnidad,
  eliminarUnidad,
  contarProductosPorUnidad,
  type ProductoInput,
} from './inventario.repository';
import { contarProduccionEnProceso } from '@/modules/produccion/produccion.repository';
import { resumenContratos } from '@/modules/produccion/contratos.repository';
import { listComprasPendientesRecepcion, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { GestionarCategoriasModal } from '@/shared/ui/GestionarCategoriasModal';
import {
  registrarMovimiento,
  transferir,
  type MovimientoInput,
} from './movimientos.repository';
import { DEFAULT_POLICY, decorate, type ProductoDecorado } from './restock';
import { ProductosTable } from './ProductosTable';
import { ProductoForm } from './ProductoForm';
import { ProductoDetail } from './ProductoDetail';
import { MovimientoForm } from './MovimientoForm';
import { AlertasStock } from './AlertasStock';
import { RecepcionesPendientes } from './RecepcionesPendientes';
import { ExportInventarioModal } from './ExportInventarioModal';
import { ImportarExcelModal } from './ImportarExcelModal';
import { ResumenInventarioModal } from './ResumenInventarioModal';
import { analizarExcel, descargarPlantillaExcel, type AnalisisImport } from './inventarioBulk';
import { InventarioFilterbar, type FilterValues } from './InventarioFilterbar';
import { AlmacenesView, SedesView, hijosDe, raices, type AlmacenLayout } from './AlmacenesView';
import { ConsumoChartModal } from '@/shared/ui/ConsumoChartModal';
import { AlmacenKanban } from './AlmacenKanban';
import { descargarAlmacenExcel, descargarAlmacenPdf, descargarReporteAlmacenesPdf } from './almacenExport';
import { AlmacenForm } from './AlmacenForm';
import {
  listAlmacenes,
  listExistencias,
  agruparValores,
  movStatsDeAlmacen,
  consumoDeAlmacen,
  consumoPorProductoEnAlmacen,
  crearAlmacen,
  actualizarAlmacen,
  renombrarAlmacen,
  renombrarSede,
  eliminarAlmacen,
  nombreCortoAlmacen,
  type AlmacenInput,
  type AlmacenValor,
  type ConsumoProducto,
} from './almacenes.repository';

interface UiState extends FilterValues {
  view: 'productos' | 'recepciones' | 'almacenes';
  almacenLayout: AlmacenLayout;
}

const INITIAL_UI: UiState = {
  view: 'productos',
  almacenLayout: 'kanban',
  filterText: '',
  filterCat: '',
  filterClass: '',
  filterStock: '',
  filterEstado: 'activo',
  filterFundicion: '',
  filterAlmacen: '',
};

/** Predicado de filtros compartido por inventario general y el detalle de almacén. */
function coincideFiltros(p: ProductoDecorado, ui: UiState): boolean {
  const q = ui.filterText.trim().toLowerCase();
  if (ui.filterEstado && p.estado !== ui.filterEstado) return false;
  if (ui.filterCat && p.categoria !== ui.filterCat) return false;
  if (ui.filterClass && p._klass !== ui.filterClass) return false;
  if (ui.filterFundicion === 'si' && !p.receta_fundicion) return false;
  if (ui.filterFundicion === 'no' && p.receta_fundicion) return false;
  if (ui.filterFundicion === 'en_proceso' && !p.en_fundicion) return false;
  if (ui.filterStock === 'critico' && !p._critical) return false;
  if (ui.filterStock === 'restock' && !(p._needsRestock && !p._critical)) return false;
  if (ui.filterStock === 'ok' && p._needsRestock) return false;
  if (ui.filterStock === 'sin_mov' && (p.stock ?? 0) > 0) return false;
  if (q) {
    // Todos los datos del producto unidos en un solo texto: nombre + detalle (alias,
    // marca, modelo, serial, código, N°), la MEDIDA/unidad, la categoría, la descripción
    // y la ubicación. Así el detalle queda VINCULADO al producto en la búsqueda.
    const haystack = [
      p.sku, p.nombre, p.nombre_busqueda, p.marca, p.modelo, p.serial, p.codigo, p.numero,
      p.unidad, p.categoria, p.descripcion, p.ubicacion,
    ].map((c) => (c ?? '').toString().toLowerCase()).join(' ');
    // Cada palabra del término debe aparecer en algún dato: "clavo media pulgada"
    // encuentra el clavo cuya medida/detalle es "media pulgada" (aunque el nombre sea solo "CLAVO").
    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.every((t) => haystack.includes(t))) return false;
  }
  return true;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'crear' }
  | { kind: 'editar'; producto: Producto }
  | { kind: 'detalle'; producto: Producto }
  | { kind: 'movimiento'; producto: Producto }
  | { kind: 'confirmToggle'; producto: Producto }
  | { kind: 'export' }
  | { kind: 'resumen' }
  | { kind: 'import'; analisis: AnalisisImport }
  | { kind: 'almacenCrear'; parentId?: string | null; sede?: string | null }
  | { kind: 'almacenEditar'; almacen: Almacen }
  | { kind: 'sedeEditar'; sede: string }
  | { kind: 'almacenEliminar'; almacen: Almacen };

export function InventarioPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('inventario', 'escritura');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [recepciones, setRecepciones] = useState<Orden[]>([]);
  const [recepcionesPendientes, setRecepcionesPendientes] = useState<Orden[]>([]);
  // Cuántas órdenes están pendientes por marcar la recepción (lo que cuenta el botón).
  const [recepcionesPorMarcar, setRecepcionesPorMarcar] = useState(0);
  // Compras directas PAGADAS que esperan que el almacenista les dé entrada al inventario.
  const [comprasRecep, setComprasRecep] = useState<CompraDirecta[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [almacenSel, setAlmacenSel] = useState<string | null>(null);
  const [sedeSel, setSedeSel] = useState<string | null>(null);
  // Almacén padre cuyo nivel de subalmacenes estamos viendo (drill-down dentro de la sede).
  const [almacenNavId, setAlmacenNavId] = useState<string | null>(null);
  const [consumoAlmacen, setConsumoAlmacen] = useState<string | null>(null);
  const [movStats, setMovStats] = useState<Map<string, { entradas: number; salidas: number }>>(new Map());
  const [consumo, setConsumo] = useState<Map<string, ConsumoProducto>>(new Map());
  const [detalleLayout, setDetalleLayout] = useState<'kanban' | 'lista'>('lista');
  const [enProduccion, setEnProduccion] = useState(0);
  // Casiterita que YA entró al inventario por contratos FINALIZADOS (cerrados) + su conteo.
  const [kgCasiterita, setKgCasiterita] = useState(0);
  const [contratosCerrados, setContratosCerrados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [gestionCatsOpen, setGestionCatsOpen] = useState(false);
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
  useRealtime(['productos', 'movimientos', 'almacenes', 'ordenes', 'compras_directas'], () => { void reload(); });

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const analisis = await analizarExcel(file);
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
      const [prods, ords, pendientes, porMarcar, alms, exs, nEnProduccion, cRecep, resContratos] = await Promise.all([
        listProductos(),
        listRecepcionesFinalizadas().catch(() => [] as Orden[]),
        listRecepcionesPorMarcar().catch(() => [] as Orden[]),
        contarRecepcionesPorMarcar().catch(() => 0),
        listAlmacenes().catch(() => [] as Almacen[]),
        listExistencias().catch(() => [] as Existencia[]),
        contarProduccionEnProceso().catch(() => 0),
        listComprasPendientesRecepcion().catch(() => [] as CompraDirecta[]),
        resumenContratos().catch(() => null),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // Carga única al montar. La recarga se dispara tras cada mutación exitosa.
  }, []);

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

  const filtered = useMemo<ProductoDecorado[]>(() => {
    // Filtro por almacén: muestra solo los productos con existencia en ese almacén,
    // con el stock y el costo (PMP) propios del almacén elegido.
    if (ui.filterAlmacen) {
      const prodMap = new Map(productos.map((p) => [p.id, p]));
      const virtuales = existencias
        .filter((e) => e.almacen === ui.filterAlmacen)
        .map((e) => {
          const p = prodMap.get(e.producto_id);
          return p ? ({ ...p, stock: e.stock, precio: e.costo_promedio, almacen: ui.filterAlmacen } as Producto) : null;
        })
        .filter((p): p is Producto => p !== null);
      return decorate(virtuales, DEFAULT_POLICY).filter((p) => coincideFiltros(p, ui));
    }
    return decorated.filter((p) => coincideFiltros(p, ui));
  }, [decorated, ui, existencias, productos]);

  // Nombres de almacenes (con existencias) para el filtro por almacén del inventario general.
  const almacenNombres = useMemo<string[]>(() => {
    const set = new Set<string>();
    existencias.forEach((e) => { if (e.almacen) set.add(e.almacen); });
    almacenes.forEach((a) => { if (a.nombre) set.add(a.nombre); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [existencias, almacenes]);

  // Valor por almacén (desde existencias: stock × costo propio del almacén).
  const valoresAlm = useMemo<Record<string, AlmacenValor>>(() => agruparValores(existencias), [existencias]);

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

  // Detalle de almacén: "productos virtuales" = producto con el stock y costo
  // (PMP) propios del almacén seleccionado, decorados y filtrados como inventario.
  const almacenRows = useMemo<ProductoDecorado[]>(() => {
    if (!almacenSel) return [];
    const prodMap = new Map(productos.map((p) => [p.id, p]));
    const virtuales = existencias
      .filter((e) => e.almacen === almacenSel)
      .map((e) => {
        const p = prodMap.get(e.producto_id);
        return p ? ({ ...p, stock: e.stock, precio: e.costo_promedio, almacen: almacenSel } as Producto) : null;
      })
      .filter((p): p is Producto => p !== null);
    return decorate(virtuales, DEFAULT_POLICY).filter((p) => coincideFiltros(p, ui));
  }, [almacenSel, existencias, productos, ui]);

  // Al entrar al detalle de un almacén, cargamos entradas/salidas y consumo de ESE almacén.
  useEffect(() => {
    if (!almacenSel) { setMovStats(new Map()); setConsumo(new Map()); return; }
    let cancelled = false;
    // Ambas consultas son independientes: en paralelo para abrir el detalle más rápido.
    Promise.all([
      movStatsDeAlmacen(almacenSel).catch(() => new Map()),
      consumoDeAlmacen(almacenSel).catch(() => new Map()),
    ]).then(([m, c]) => {
      if (cancelled) return;
      setMovStats(m);
      setConsumo(c);
    });
    return () => { cancelled = true; };
  }, [almacenSel, existencias]);

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

  const productoActor = appUser?.email ?? user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

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

  async function handleCreateOrUpdate(data: ProductoInput) {
    if (modal.kind === 'crear') {
      const dup = await findBySku(data.sku);
      if (dup) throw new Error('Ya existe un producto con ese SKU.');
      const stockInicial = data.stock;
      const created = await createProducto({ ...data, stock: 0 });
      if (stockInicial > 0) {
        await registrarMovimiento({
          producto_id: created.id,
          tipo: 'creacion',
          delta: stockInicial,
          almacen: data.almacen,
          actor: productoActor,
          actor_name: actorName,
          detalle: `Stock inicial al dar de alta el producto · almacén ${data.almacen}`,
          // Costo inicial: fija la línea base del PMP del almacén y queda en la traza.
          precio_unitario: data.precio,
        });
      }
      notify(`Producto creado: ${data.sku} · ${data.nombre}`, 'success', { link: '#/app/inventario' });
      await reload();
      return;
    }
    if (modal.kind === 'editar') {
      const previo = modal.producto;
      const dup = await findBySku(data.sku);
      if (dup && dup.id !== previo.id) throw new Error('Ya existe otro producto con ese SKU.');
      // El stock es por almacén (existencias); no se edita desde aquí.
      // Se ajusta vía "Movimiento" (entrada/salida/ajuste) en cada almacén.
      const rest: Partial<ProductoInput> = { ...data };
      delete (rest as Partial<ProductoInput>).stock;
      await updateProducto(previo.id, rest);
      notify(`Producto actualizado: ${data.sku} · ${data.nombre}`, 'success', { link: '#/app/inventario' });
      await reload();
    }
  }

  async function handleRegistrarMovimiento(input: MovimientoInput, transfer?: { almacenDestino: string }) {
    if (transfer) {
      await transferir({
        producto_id: input.producto_id,
        almacenOrigen: input.almacen || 'General',
        almacenDestino: transfer.almacenDestino,
        cantidad: Math.abs(input.delta),
        actor: input.actor,
        actor_name: input.actor_name,
        detalle: input.detalle,
      });
      notify(`Transferencia: ${input.almacen} → ${transfer.almacenDestino}`, 'success', { link: '#/app/inventario' });
    } else {
      await registrarMovimiento(input);
      notify(`Movimiento de inventario registrado (${input.tipo})`, 'success', { link: '#/app/inventario' });
    }
    await reload();
  }

  async function handleToggleEstado(p: Producto) {
    const nuevo = p.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await setEstadoProducto(p.id, nuevo);
      notify(`Producto ${nuevo === 'activo' ? 'activado' : 'desactivado'}: ${p.sku}`, 'success', { link: '#/app/inventario' });
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cambiar el estado', 'error');
    } finally {
      setModal({ kind: 'none' });
    }
  }

  // ─── almacenes ───
  function setFilter2(key: keyof FilterValues, value: string) {
    setUi((prev) => ({ ...prev, [key]: value }) as UiState);
  }

  async function handleCrearAlmacen(data: AlmacenInput) {
    await crearAlmacen(data, productoActor);
    notify(`Almacén creado: ${data.nombre}`, 'success', { link: '#/app/inventario' });
    await reload();
  }

  async function handleEditarAlmacen(id: string, data: AlmacenInput) {
    const actual = almacenes.find((a) => a.id === id) ?? null;
    // Campos que no son el nombre se actualizan directo (no afectan al stock).
    await actualizarAlmacen(id, { ubicacion: data.ubicacion, sede: data.sede, parent_id: data.parent_id });
    // El nombre se cambia por la cascada (propaga a existencias/productos/etc.),
    // así el stock del almacén no queda huérfano al renombrarlo. Se compara contra
    // el nombre CORTO (lo que ve el usuario) para no renombrar de gusto.
    if (actual && data.nombre.trim() && data.nombre.trim() !== nombreCortoAlmacen(actual, almacenes)) {
      const nombreFinal = await renombrarAlmacen(actual, data.nombre.trim());
      // Si el almacén renombrado estaba seleccionado, mover la selección al nuevo nombre.
      if (almacenSel === actual.nombre) setAlmacenSel(nombreFinal);
    }
    notify(`Almacén actualizado: ${data.nombre}`, 'success', { link: '#/app/inventario' });
    await reload();
  }

  async function handleRenombrarSede(sedeActual: string, nuevoNombre: string) {
    const n = await renombrarSede(sedeActual, nuevoNombre);
    if (sedeSel === sedeActual) setSedeSel(nuevoNombre.trim());
    notify(`Sede renombrada: ${sedeActual} → ${nuevoNombre.trim()} (${n} almacén/es)`, 'success', { link: '#/app/inventario' });
    await reload();
  }

  async function handleEliminarAlmacen(a: Almacen) {
    try {
      await eliminarAlmacen(a.id, a.nombre);
      notify(`Almacén eliminado: ${a.nombre}`, 'success', { link: '#/app/inventario' });
      if (almacenSel === a.nombre) setAlmacenSel(null);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo eliminar el almacén', 'error');
    } finally {
      setModal({ kind: 'none' });
    }
  }

  // ─── render ───
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Inventario</h1>
          <p className="hint">
            Catálogo de productos. <span className="muted">Política ABC · A 120% · B 100% · C 80% del stock mínimo</span>
          </p>
        </div>
        <div className="actions">
          <button
            className={`btn ${ui.view === 'productos' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setUi((prev) => ({ ...prev, view: 'productos' }))}
          >
            Inventario general
          </button>
          <button
            className={`btn ${ui.view === 'almacenes' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setAlmacenSel(null); setUi((prev) => ({ ...prev, view: 'almacenes' })); }}
          >
            ▣ Almacenes
          </button>
          <button
            className={`btn ${ui.view === 'recepciones' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setUi((prev) => ({ ...prev, view: 'recepciones' }))}
          >
            Recepciones {(recepcionesPorMarcar + comprasRecep.length) > 0 && <span className="badge warning" style={{ marginLeft: '.35rem' }}>{recepcionesPorMarcar + comprasRecep.length}</span>}
          </button>
          {canWrite && (
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
          <button className="btn btn-ghost" onClick={() => setModal({ kind: 'resumen' })} title="Resumen: valor por almacén, productos nuevos, entradas, salidas y traslados">
            📊 Resumen
          </button>
          <button className="btn btn-ghost" onClick={() => setModal({ kind: 'export' })} title="Exportar inventario filtrado">
            ↓ Exportar
          </button>
          {canWrite && (
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ kind: 'crear' })}>
              + Nuevo producto
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* KPIs y alertas: solo en inventario general / recepciones, no en almacenes */}
      {ui.view !== 'almacenes' && (
      <>
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
        <a
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
        </a>
      </div>

      <AlertasStock productos={decorated} onVerProducto={openVer} />
      </>
      )}

      {ui.view === 'recepciones' ? (
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
      ) : ui.view === 'almacenes' ? (
        almacenSel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setAlmacenSel(null)}>← Volver a almacenes</button>
              <h2 style={{ margin: 0 }}>▣ {almacenSel}</h2>
              <span className="muted mono">{money(valoresAlm[almacenSel]?.valor ?? 0)} · {num(almacenRows.length)} producto(s)</span>
              <div style={{ display: 'flex', gap: '.4rem', marginLeft: 'auto' }}>
                <button className="btn btn-primary btn-sm" onClick={() => setConsumoAlmacen(almacenSel)} title="Gráfica de consumo por producto de este almacén">📊 Consumo</button>
                <button className="btn btn-ghost btn-sm" disabled={!almacenRows.length}
                  onClick={() => descargarAlmacenExcel(almacenSel, almacenRows).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>↓ Excel</button>
                <button className="btn btn-ghost btn-sm" disabled={!almacenRows.length}
                  onClick={() => descargarAlmacenPdf(almacenSel, almacenRows).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
              </div>
            </div>
            <div className="view-toggle" role="tablist" aria-label="Vista del almacén" style={{ marginBottom: '.75rem', marginLeft: 0 }}>
              <button className={detalleLayout === 'kanban' ? 'active' : ''} onClick={() => setDetalleLayout('kanban')}>▦ Kanban</button>
              <button className={detalleLayout === 'lista' ? 'active' : ''} onClick={() => setDetalleLayout('lista')}>☰ Lista</button>
            </div>
            <InventarioFilterbar values={ui} categorias={categorias} onChange={setFilter2} />
            {loading ? (
              <EmptyState message="Cargando productos…" icon="◔" />
            ) : detalleLayout === 'kanban' ? (
              <AlmacenKanban rows={almacenRows} consumo={consumo} onView={openVer} />
            ) : (
              <ProductosTable
                rows={almacenRows}
                onView={openVer}
                onEdit={openEditar}
                onMovimiento={openMovimiento}
                onToggleEstado={askToggleEstado}
                canWrite={canWrite}
                movStats={movStats}
              />
            )}
          </>
        ) : !sedeSel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.85rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>📍 Sedes</h2>
              <span className="muted" style={{ fontSize: '.85rem' }}>Elegí una sede para ver sus almacenes.</span>
              <div style={{ display: 'flex', gap: '.5rem', marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  title="Reporte PDF de todo el inventario por almacenes y subalmacenes"
                  onClick={() => descargarReporteAlmacenesPdf().catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el reporte', 'error'))}
                >
                  ↓ Reporte PDF (almacenes y subalmacenes)
                </button>
                {canWrite && (
                  <button className="btn btn-primary" style={{ padding: '.7rem 1.3rem', fontSize: '1.02rem', fontWeight: 700 }} onClick={() => setModal({ kind: 'almacenCrear' })}>
                    + Agregar almacén
                  </button>
                )}
              </div>
            </div>
            {loading ? (
              <EmptyState message="Cargando almacenes…" icon="◔" />
            ) : (
              <SedesView almacenes={almacenes} valores={valoresAlm}
                onSelectSede={(s) => { setSedeSel(s); setAlmacenNavId(null); }}
                onEditarSede={(s) => setModal({ kind: 'sedeEditar', sede: s })} />
            )}
          </>
        ) : (() => {
          const sedeAlmacenes = almacenes.filter((a) => (a.sede?.trim() || 'Sin sede') === sedeSel);
          // Si la sede tiene un único almacén padre (ej. "Los Pinos"), se salta ese
          // nivel redundante y se muestran directo sus subalmacenes.
          const roots = raices(sedeAlmacenes);
          const autoPadre = !almacenNavId && roots.length === 1 && hijosDe(roots[0].id, sedeAlmacenes).length > 0 ? roots[0] : null;
          const nivelParentId = almacenNavId ?? (autoPadre ? autoPadre.id : null);
          const padre = almacenNavId ? almacenes.find((a) => a.id === almacenNavId) ?? null : null;
          // Contenedor donde se agregaría: el padre que estamos viendo (manual o auto).
          const contenedor = padre ?? autoPadre;
          return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.85rem', flexWrap: 'wrap' }}>
              {padre ? (
                <>
                  <button className="btn btn-ghost" onClick={() => setAlmacenNavId(null)}>← Volver a {sedeSel}</button>
                  <h2 style={{ margin: 0 }}>▣ {nombreCortoAlmacen(padre, almacenes)}</h2>
                </>
              ) : (
                <>
                  <button className="btn btn-ghost" onClick={() => setSedeSel(null)}>← Volver a sedes</button>
                  <h2 style={{ margin: 0 }}>📍 {sedeSel}</h2>
                </>
              )}
              <div className="view-toggle" role="tablist" aria-label="Vista de almacenes" style={{ marginLeft: '.5rem' }}>
                <button
                  className={ui.almacenLayout === 'kanban' ? 'active' : ''}
                  onClick={() => setUi((prev) => ({ ...prev, almacenLayout: 'kanban' }))}
                >
                  ▦ Kanban
                </button>
                <button
                  className={ui.almacenLayout === 'lista' ? 'active' : ''}
                  onClick={() => setUi((prev) => ({ ...prev, almacenLayout: 'lista' }))}
                >
                  ☰ Lista
                </button>
              </div>
              {canWrite && (
                <button className="btn btn-primary" style={{ marginLeft: 'auto', padding: '.7rem 1.3rem', fontSize: '1.02rem', fontWeight: 700 }}
                  onClick={() => setModal(contenedor ? { kind: 'almacenCrear', parentId: contenedor.id } : { kind: 'almacenCrear', sede: sedeSel })}>
                  {contenedor ? '+ Agregar subalmacén' : '+ Agregar almacén'}
                </button>
              )}
            </div>
            {loading ? (
              <EmptyState message="Cargando almacenes…" icon="◔" />
            ) : (
              <AlmacenesView
                almacenes={sedeAlmacenes}
                valores={valoresAlm}
                layout={ui.almacenLayout}
                canWrite={canWrite}
                parentId={nivelParentId}
                onSelect={setAlmacenSel}
                onDrill={(a) => setAlmacenNavId(a.id)}
                onConsumo={setConsumoAlmacen}
                onEditar={(a) => setModal({ kind: 'almacenEditar', almacen: a })}
                onEliminar={(a) => setModal({ kind: 'almacenEliminar', almacen: a })}
                onAgregarSub={(a) => setModal({ kind: 'almacenCrear', parentId: a.id })}
              />
            )}
            {consumoAlmacen && (
              <ConsumoChartModal
                title={`Consumo · ${consumoAlmacen}`}
                subtitle="Consumo de productos de este almacén (salidas y consumo de producción). La gráfica muestra cada producto; el valor en $ usa el costo del movimiento."
                cargar={async (desde, hasta) => {
                  const items = await consumoPorProductoEnAlmacen(consumoAlmacen!, desde, hasta);
                  return items.map((x) => ({ id: x.producto_id, label: x.nombre, sub: x.sku, unidad: x.unidad, cantidad: x.cantidad, valor: x.valor }));
                }}
                onClose={() => setConsumoAlmacen(null)}
              />
            )}
          </>
          );
        })()
      ) : (
        <>
          <InventarioFilterbar values={ui} categorias={categorias} onChange={setFilter2} almacenes={almacenNombres} />
          {ui.filterAlmacen && (
            <div className="muted" style={{ fontSize: '.82rem', margin: '-.35rem 0 .6rem' }}>
              Mostrando stock y costo del almacén <strong style={{ color: 'var(--text)' }}>{ui.filterAlmacen}</strong>.
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
          producto={modal.producto}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'movimiento' && (
        <MovimientoForm
          producto={modal.producto}
          existencias={existMap.get(modal.producto.id) ?? []}
          almacenesList={almacenes.map((a) => a.nombre)}
          fixedAlmacen={ui.view === 'almacenes' ? almacenSel : null}
          actorEmail={productoActor}
          actorName={actorName}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={handleRegistrarMovimiento}
        />
      )}
      {modal.kind === 'confirmToggle' && (
        <ConfirmDialog
          title={modal.producto.estado === 'activo' ? 'Desactivar producto' : 'Activar producto'}
          message={`¿Confirmas ${modal.producto.estado === 'activo' ? 'desactivar' : 'activar'} "${modal.producto.nombre}" (${modal.producto.sku})?`}
          confirmText={modal.producto.estado === 'activo' ? 'Desactivar' : 'Activar'}
          danger={modal.producto.estado === 'activo'}
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={() => handleToggleEstado(modal.producto)}
        />
      )}
      {modal.kind === 'export' && (
        <ExportInventarioModal
          productos={productos}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'resumen' && (
        <ResumenInventarioModal
          defaultEmail={appUser?.email ?? user?.email ?? ''}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'import' && (
        <ImportarExcelModal
          analisis={modal.analisis}
          onClose={() => setModal({ kind: 'none' })}
          onImportado={() => { void reload(); }}
        />
      )}
      {modal.kind === 'almacenCrear' && (
        <AlmacenForm
          almacenes={almacenes}
          parentPreset={modal.parentId ?? null}
          sedePreset={modal.sede ?? null}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={handleCrearAlmacen}
        />
      )}
      {modal.kind === 'almacenEditar' && (
        <AlmacenForm
          almacen={modal.almacen}
          almacenes={almacenes}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={(data) => handleEditarAlmacen(modal.almacen.id, data)}
        />
      )}
      {modal.kind === 'sedeEditar' && (
        <RenombrarSedeModal
          sede={modal.sede}
          onClose={() => setModal({ kind: 'none' })}
          onSubmit={async (nuevo) => { await handleRenombrarSede(modal.sede, nuevo); setModal({ kind: 'none' }); }}
        />
      )}
      {modal.kind === 'almacenEliminar' && (
        <EliminarAlmacenDialog
          almacen={modal.almacen}
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={() => handleEliminarAlmacen(modal.almacen)}
        />
      )}

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

/* ───────── Eliminar almacén: confirmación escribiendo el nombre ───────── */
const DIACRITICOS = /[̀-ͯ]/g; // marcas diacríticas combinantes
function normalizarTexto(s: string): string {
  return (s || '').normalize('NFD').replace(DIACRITICOS, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
/** Palabra a escribir para confirmar: el nombre sin el prefijo genérico
 *  (ej. "Almacén de Víveres" → "Víveres"; si no hay prefijo, el nombre completo). */
function palabraClaveAlmacen(nombre: string): string {
  const m = (nombre || '').trim().match(/^(?:almac[eé]n|dep[oó]sito|bodega)\s+(?:de\s+)?(.+)$/i);
  return (m ? m[1] : nombre || '').trim();
}

function EliminarAlmacenDialog({ almacen, onCancel, onConfirm }: {
  almacen: Almacen; onCancel: () => void; onConfirm: () => void;
}) {
  const clave = palabraClaveAlmacen(almacen.nombre);
  const [texto, setTexto] = useState('');
  const ok = texto.trim() !== '' && normalizarTexto(texto) === normalizarTexto(clave);
  return (
    <Modal title="Eliminar almacén" size="md" onClose={onCancel} footer={
      <>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-danger" disabled={!ok} onClick={() => { if (ok) onConfirm(); }}>
          Eliminar definitivamente
        </button>
      </>
    }>
      <p style={{ marginTop: 0 }}>
        ¿Seguro que deseas borrar el almacén <strong>«{almacen.nombre}»</strong>? Solo se puede si no tiene
        productos asignados. <strong>Esta acción no se puede deshacer.</strong>
      </p>
      <div className="form-row">
        <label>Para confirmar, escribí <strong>{clave}</strong></label>
        <input
          className="input"
          autoFocus
          value={texto}
          placeholder={clave}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok) onConfirm(); }}
        />
        {texto.trim() !== '' && !ok && (
          <small className="muted" style={{ color: 'var(--danger)' }}>El nombre no coincide.</small>
        )}
      </div>
    </Modal>
  );
}

/* ───────── Renombrar sede (agrupación de almacenes) ───────── */
function RenombrarSedeModal({ sede, onClose, onSubmit }: {
  sede: string; onClose: () => void; onSubmit: (nuevo: string) => Promise<void> | void;
}) {
  const [nombre, setNombre] = useState(sede);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limpio = nombre.trim();
  const ok = limpio !== '' && limpio !== sede;
  async function guardar() {
    if (!ok || saving) return;
    setSaving(true); setError(null);
    try { await onSubmit(limpio); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo renombrar la sede.'); setSaving(false); }
  }
  return (
    <Modal title="Renombrar sede" size="md" onClose={() => !saving && onClose()} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={!ok || saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <p style={{ marginTop: 0 }}>
        Cambiá el nombre de la sede <strong>«{sede}»</strong>. Se actualiza en <strong>todos sus almacenes y subalmacenes</strong>;
        no afecta el stock (que se guarda por almacén).
      </p>
      <div className="form-row">
        <label>Nombre de la sede</label>
        <input className="input" autoFocus value={nombre}
          onChange={(e) => setNombre(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok) guardar(); }}
          placeholder="Ej: PERAMANAL" />
      </div>
    </Modal>
  );
}
