import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { money, num } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { useRealtime } from '@/shared/lib/useRealtime';
import { ConfirmDialog } from '@/shared/ui/Modal';
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
import {
  listAlmacenes,
  listExistencias,
} from './almacenes.repository';

interface UiState extends FilterValues {
  view: 'productos' | 'recepciones';
}

const INITIAL_UI: UiState = {
  view: 'productos',
  filterText: '',
  filterCat: '',
  filterClass: '',
  filterStock: '',
  filterEstado: 'activo',
  filterFundicion: '',
};

/** Predicado de filtros del inventario general. */
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
  | { kind: 'import'; analisis: AnalisisImport };

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

  const filtered = useMemo<ProductoDecorado[]>(
    () => decorated.filter((p) => coincideFiltros(p, ui)),
    [decorated, ui],
  );

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
          detalle: 'Stock inicial al dar de alta el producto · Inventario General',
          // Costo inicial: fija la línea base del PMP del inventario y queda en la traza.
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
      // El stock se ajusta vía "Movimiento" (entrada/salida/ajuste); no se edita desde aquí.
      const rest: Partial<ProductoInput> = { ...data };
      delete (rest as Partial<ProductoInput>).stock;
      await updateProducto(previo.id, rest);
      notify(`Producto actualizado: ${data.sku} · ${data.nombre}`, 'success', { link: '#/app/inventario' });
      await reload();
    }
  }

  async function handleRegistrarMovimiento(input: MovimientoInput) {
    await registrarMovimiento(input);
    notify(`Movimiento de inventario registrado (${input.tipo})`, 'success', { link: '#/app/inventario' });
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

  function setFilter2(key: keyof FilterValues, value: string) {
    setUi((prev) => ({ ...prev, [key]: value }) as UiState);
  }

  // ─── render ───
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Inventario</h1>
          <p className="hint">
            Catálogo de productos del <strong>Inventario General</strong>. <span className="muted">Política ABC · A 120% · B 100% · C 80% del stock mínimo</span>
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
          <button className="btn btn-ghost" onClick={() => setModal({ kind: 'resumen' })} title="Resumen: valor del inventario, productos nuevos, entradas y salidas">
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
      ) : (
        <>
          <InventarioFilterbar values={ui} categorias={categorias} onChange={setFilter2} />
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
