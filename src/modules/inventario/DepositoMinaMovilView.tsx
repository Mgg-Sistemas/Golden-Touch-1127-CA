/* ============================================================
   Golden Touch · Inventario · Vista de teléfono (06/10/2026 · General 29/10/2026)

   La MISMA pantalla sirve para los dos depósitos: `deposito="mina"` (Depósito
   Mina, ruta /app/inventario/deposito-mina/telefono) y `deposito="general"`
   (Inventario General, /app/inventario/telefono). Botones grandes:
   · «Producto nuevo»: nombre, categoría, unidad y cuánto llegó. El SKU lo
     pone el sistema y el producto nace en ese depósito.
   · «Entrada»: busca un producto que ya está y le suma lo que llegó.
   · «Salida» y «Por retornar» (13/10/2026 en la Mina; 30/10/2026 también en el
     General, pedido de la administradora): cantidad, motivo, quién autorizó,
     ¿retorna? y fotos, con su aviso de WhatsApp. Cada depósito ve solo sus
     pendientes. En la PC el General sigue teniendo Órdenes de Salida.
   · «Traslado entre almacenes» (29/10/2026): pasa material directo al otro
     depósito; si allá no existe el producto, la base lo crea
     (inventario_trasladar_deposito, todo o nada).
   · «Reporte de stock» (29/10/2026): lo que hay al cierre de un período.
   Cada botón deja su aviso listo para WhatsApp al guardar (inventarioMovil.ts).
   Escribe en las MISMAS tablas que el módulo de PC, así que aparece al instante
   en Inventario (realtime). Editar o desactivar productos es tarea de la PC.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import { num } from '@/shared/lib/format';
import type { Producto } from '@/shared/lib/types';
import { createProducto, findBySku, getCategorias, getUnidades, listProductos, nextSku } from './inventario.repository';
import { registrarMovimiento } from './movimientos.repository';
import { esCategoriaReal, MENSAJE_CATEGORIA_OBLIGATORIA } from './categoriaReal';
import { DEPOSITOS, type Deposito } from './depositos';
import { FormSalidaMina, Listo, PorRetornarMina } from './SalidaMinaMovil';
import { listPorRetornarMina } from './salidasMina.repository';
import type { SalidaMina } from './salidasMina';
import { mensajeStockMina, stockPorPeriodo, type MovimientoStock } from './stockMinaWhatsapp';
import { listMovimientosDepositoDesde } from './stockMina.repository';
import { mensajeEntrada, mensajeProductoNuevo, mensajeTraslado } from './inventarioMovil';
import { trasladarEntreAlmacenes } from './trasladoAlmacen.repository';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { hoyVenezuela, rangoRapido } from '@/shared/lib/rangosFecha';

type Dep = (typeof DEPOSITOS)[Deposito];
/** Cuántos productos se listan sin buscar: en el teléfono no se recorre el inventario entero. */
const SIN_BUSCAR = 15;

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

type Paso = 'inicio' | 'nuevo' | 'entrada' | 'salida' | 'retornos' | 'reporte' | 'traslado';

/** Vista de teléfono del Inventario General. */
export function InventarioMovilView() {
  return <DepositoMinaMovilView deposito="general" key="general" />;
}

/** Vista de teléfono del Depósito Reutilizables (dentro de Depósito Mina). */
export function DepositoReutilizablesMovilView() {
  return <DepositoMinaMovilView deposito="reutilizables" key="reutilizables" />;
}

export function DepositoMinaMovilView({ deposito = 'mina' }: { deposito?: Deposito }) {
  const DEP = DEPOSITOS[deposito];
  const OTRO = DEPOSITOS[deposito === 'reutilizables' ? 'mina' : deposito === 'mina' ? 'general' : 'mina'];
  const esMina = deposito === 'mina';
  const esReutilizables = deposito === 'reutilizables';
  const { user } = useSession();
  const { can, appUser, soloTelefono, vistasTelefono } = usePermissions();
  const canWrite = can('inventario', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [paso, setPaso] = useState<Paso>('inicio');
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [busca, setBusca] = useState('');
  const [porRetornar, setPorRetornar] = useState<SalidaMina[]>([]);

  const reload = useCallback(async () => {
    const ps = await listProductos(deposito);
    setProductos(ps.filter((p) => p.estado === 'activo'));
    const [cats, uds] = await Promise.all([getCategorias(ps), getUnidades(ps)]);
    setCategorias(cats);
    setUnidades(uds);
    setPorRetornar(await listPorRetornarMina(DEPOSITOS[deposito].almacen).catch(() => [] as SalidaMina[]));
  }, [deposito]);

  useEffect(() => {
    let cancel = false;
    reload().catch((e) => { if (!cancel) toast(errMsg(e, 'No se pudo cargar'), 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);
  useRealtime(['productos', 'movimientos', 'taxonomias', 'deposito_mina_salidas'], () => { void reload().catch(() => {}); });

  const lista = useMemo(() => {
    const q = sinAcentos(busca.trim());
    if (!q) return productos.slice(0, SIN_BUSCAR);
    return productos.filter((p) => sinAcentos(`${p.nombre} ${p.sku} ${p.categoria}`).includes(q));
  }, [productos, busca]);

  function volver() { setPaso('inicio'); setElegido(null); }
  const guardado = async () => { volver(); await reload().catch(() => {}); };
  const eligiendo = (paso === 'entrada' || paso === 'salida' || paso === 'traslado') && !elegido;
  const pideStock = paso === 'salida' || paso === 'traslado';

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>{esReutilizables ? '♻️ Depósito Reutilizables' : esMina ? '⛏ Depósito Mina' : '📦 Inventario General'}</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{actorName ?? actor}</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {esReutilizables && (
            <Link to="/app/inventario/deposito-mina/telefono" className="btn btn-ghost" style={{ fontWeight: 600 }}>
              ← Volver
            </Link>
          )}
          {esMina && (
            <Link to="/app/inventario/deposito-reutilizables/telefono" className="btn btn-ghost" style={{ borderColor: '#10b981', color: '#10b981', fontWeight: 600 }}>
              ♻️ Depósito Reutilizables
            </Link>
          )}
          {!soloTelefono && <Link to={DEP.ruta} className="btn btn-ghost">🖥 Módulo completo</Link>}
          {soloTelefono && vistasTelefono.length > 1 && <Link to="/app/telefono" className="btn btn-ghost">📱 Mis pantallas</Link>}
        </div>
      </header>

      {loading && <p className="muted">Cargando…</p>}
      {!loading && !canWrite && (
        <div className="aviso warning sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">👁</span>
          <div>Tu rol solo puede ver. Para cargar productos hace falta escritura en Inventario.</div>
        </div>
      )}

      {!loading && paso === 'inicio' && canWrite && (
        <div className="surt-acciones">
          {esMina && (
            <Link
              to="/app/inventario/deposito-reutilizables/telefono"
              className="surt-btn"
              style={{ gridColumn: '1 / -1', minHeight: 70, borderColor: '#10b981', textDecoration: 'none' }}
            >
              <span className="icono" aria-hidden>♻️</span>
              <span style={{ color: '#10b981' }}>Depósito Reutilizables</span>
              <small>Ver inventario, salidas y retornos de materiales reutilizables</small>
            </Link>
          )}
          {esReutilizables && (
            <Link
              to="/app/inventario/deposito-mina/telefono"
              className="surt-btn"
              style={{ gridColumn: '1 / -1', minHeight: 70, textDecoration: 'none' }}
            >
              <span className="icono" aria-hidden>←</span>
              <span>Volver a Depósito Mina</span>
              <small>Regresar a la pantalla principal de la mina</small>
            </Link>
          )}
          <button type="button" className="surt-btn primario" onClick={() => setPaso('nuevo')}>
            <span className="icono" aria-hidden>＋</span>
            <span>Producto nuevo</span>
            <small>Algo que todavía no está en {esReutilizables ? 'reutilizables' : esMina ? 'el depósito' : 'el inventario'}</small>
          </button>
          <button type="button" className="surt-btn entrada"
            onClick={() => { setElegido(null); setPaso('entrada'); }}>
            <span className="icono" aria-hidden>⬇</span>
            <span>Entrada</span>
            <small>Llegó más de un producto que ya está</small>
          </button>
          <button type="button" className="surt-btn salida"
            onClick={() => { setElegido(null); setPaso('salida'); }}>
            <span className="icono" aria-hidden>⬆</span>
            <span>Salida</span>
            <small>Sale material {esReutilizables ? 'de reutilizables' : esMina ? 'del depósito' : 'del inventario'}</small>
          </button>
          <button type="button" className="surt-btn" style={{ borderColor: '#a855f7', gridColumn: '1 / -1', minHeight: 84 }}
            onClick={() => { setElegido(null); setPaso('traslado'); }}>
            <span className="icono" aria-hidden>🔁</span>
            <span>Traslado entre almacenes</span>
            <small>Pasar material directo a otro depósito</small>
          </button>
          <button type="button" className="surt-btn retorno" style={{ gridColumn: '1 / -1', minHeight: 84 }}
            onClick={() => setPaso('retornos')}>
            <span>🔄 Por retornar ({porRetornar.length})</span>
            <small>{porRetornar.length ? 'Dar retorno al inventario de lo que salió y vuelve' : 'No hay nada pendiente por retornar'}</small>
          </button>
        </div>
      )}

      {!loading && paso === 'inicio' && (
        <button type="button" className="surt-btn" style={{ width: '100%', minHeight: 84, marginTop: '.75rem', borderColor: '#25d366' }}
          onClick={() => setPaso('reporte')}>
          <span>📲 Reporte de stock (WhatsApp)</span>
          <small>Lo que hay en {esReutilizables ? 'reutilizables' : esMina ? 'el depósito' : 'el inventario'}, filtrado por fechas</small>
        </button>
      )}

      {paso === 'reporte' && (
        <ReporteStock dep={DEP} productos={productos} quien={actorName ?? actor} onVolver={volver} />
      )}

      {paso === 'nuevo' && (
        <FormNuevo dep={DEP} categorias={categorias} unidades={unidades} actor={actor} actorName={actorName}
          onCancel={volver} onSaved={guardado} />
      )}

      {paso === 'entrada' && elegido && (
        <FormEntrada dep={DEP} producto={elegido} actor={actor} actorName={actorName}
          onCancel={() => setElegido(null)} onSaved={guardado} />
      )}

      {paso === 'salida' && elegido && (
        <FormSalidaMina producto={elegido} almacen={DEP.almacen} actor={actor} actorName={actorName}
          onCancel={() => setElegido(null)}
          onSaved={() => { volver(); void reload().catch(() => {}); }} />
      )}

      {paso === 'traslado' && elegido && (
        <FormTraslado dep={DEP} depositoActual={deposito} producto={elegido} actor={actor} actorName={actorName}
          onCancel={() => setElegido(null)} onSaved={guardado} />
      )}

      {paso === 'retornos' && (
        <PorRetornarMina salidas={porRetornar} actor={actor} actorName={actorName} canWrite={canWrite}
          onVolver={volver} onSaved={() => { void reload().catch(() => {}); }} />
      )}

      {(paso === 'inicio' || eligiendo) && (
        <section className="surt-lista">
          {eligiendo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
              <strong style={{ fontSize: '1.1rem' }}>
                {paso === 'salida' ? '⬆ ¿Qué material sale?'
                  : paso === 'traslado' ? `🔁 ¿Qué se traslada a ${OTRO.nombre}?`
                  : '⬇ ¿A qué producto le llegó?'}
              </strong>
              <button type="button" className="btn btn-ghost" onClick={volver}>Cancelar</button>
            </div>
          )}
          <input className="input surt-input" type="search" name="inv-movil-buscar" placeholder="🔍 Buscar producto…"
            value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
          <h2>
            {busca.trim()
              ? `${lista.length} encontrado(s)`
              : `Productos ${esMina ? 'del depósito' : 'del inventario'} (${productos.length})${productos.length > SIN_BUSCAR ? ` · se ven ${SIN_BUSCAR}, busca para ver el resto` : ''}`}
          </h2>
          {!loading && !productos.length && <p className="muted">{DEP.nombre} no tiene productos todavía. Carga el primero con «Producto nuevo».</p>}
          {lista.map((p) => (
            <button key={p.id} type="button" className="surt-mov"
              onClick={() => { if (canWrite) { setElegido(p); if (paso === 'inicio') setPaso('entrada'); } }}
              disabled={!canWrite || (pideStock && !(Number(p.stock) > 0))}>
              <span className="icono" aria-hidden>📦</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{p.nombre}</div>
                <div className="sub">{p.sku} · {p.categoria}</div>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', textAlign: 'right' }}>
                {num(Number(p.stock) || 0)} <small style={{ fontWeight: 600 }}>{p.unidad}</small>
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function ReporteStock({ dep, productos, quien, onVolver }: {
  dep: Dep; productos: Producto[]; quien: string; onVolver: () => void;
}) {
  const hoy = hoyVenezuela();
  const [desde, setDesde] = useState(() => rangoRapido('mes', hoy).desde);
  const [hasta, setHasta] = useState(hoy);
  const [movs, setMovs] = useState<MovimientoStock[] | null>(null);

  const rangoMalo = !desde || !hasta || desde > hasta || hasta > hoy;
  const cargar = useCallback(async () => {
    if (!desde || desde > hoy) return;
    try { setMovs(await listMovimientosDepositoDesde(dep.almacen, desde)); }
    catch (e) { setMovs([]); toast(errMsg(e, 'No se pudieron cargar los movimientos'), 'error'); }
  }, [desde, hoy, dep.almacen]);
  useEffect(() => { setMovs(null); void cargar(); }, [cargar]);
  useRealtime(['movimientos'], () => { void cargar(); });

  const filas = useMemo(
    () => (movs && !rangoMalo ? stockPorPeriodo(productos, movs, desde, hasta) : []),
    [movs, productos, desde, hasta, rangoMalo],
  );
  const texto = useMemo(
    () => mensajeStockMina(filas, desde, hasta, { quien, deposito: dep.nombre }),
    [filas, desde, hasta, quien, dep.nombre],
  );

  function atajo(r: 'hoy' | 'mes' | 'mesPasado') {
    const x = r === 'hoy' ? { desde: hoy, hasta: hoy } : rangoRapido(r, hoy);
    setDesde(x.desde); setHasta(x.hasta);
  }

  return (
    <div className="surt-form">
      <div className="surt-form-titulo"><span className="icono" aria-hidden>📲</span><strong>Reporte de stock · {dep.nombre}</strong></div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={() => atajo('hoy')}>Hoy</button>
        <button type="button" className="btn btn-ghost" onClick={() => atajo('mes')}>Este mes</button>
        <button type="button" className="btn btn-ghost" onClick={() => atajo('mesPasado')}>Mes pasado</button>
      </div>
      <div className="surt-grid2">
        <div className="surt-campo">
          <label htmlFor="inv-rep-desde">Desde</label>
          <input id="inv-rep-desde" type="date" className="input surt-input" value={desde} max={hoy}
            onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="surt-campo">
          <label htmlFor="inv-rep-hasta">Hasta</label>
          <input id="inv-rep-hasta" type="date" className="input surt-input" value={hasta} max={hoy}
            onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>
      <small className="muted">
        Muestra lo que había al cierre del «hasta» y lo que entró (📥) y salió (📤) en esas fechas.
      </small>
      {rangoMalo ? (
        <div className="aviso warning sm"><span className="aviso-icono">⚠</span><div>Revisa las fechas: «desde» no puede ir después de «hasta» ni pasar de hoy.</div></div>
      ) : movs === null ? (
        <p className="muted">Armando el reporte…</p>
      ) : (
        <CompartirWhatsapp texto={texto} />
      )}
      <button type="button" className="btn btn-ghost btn-grande" onClick={onVolver}>← Volver</button>
    </div>
  );
}

function FormNuevo({ dep, categorias, unidades, actor, actorName, onCancel, onSaved }: {
  dep: Dep; categorias: string[]; unidades: string[]; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidad, setUnidad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim().toUpperCase();
    const cant = Number(cantidad.replace(',', '.')) || 0;
    const precio = Math.max(0, Number(costo.replace(',', '.')) || 0);
    if (!n) return toast('Escribe el nombre del producto.', 'error');
    if (!esCategoriaReal(categoria)) return toast(MENSAJE_CATEGORIA_OBLIGATORIA, 'error');
    if (!unidad) return toast('Elige la unidad (kg, und, saco…).', 'error');
    if (cant < 0) return toast('La cantidad no puede ser negativa.', 'error');
    setGuardando(true);
    try {
      const sku = await nextSku(categoria);
      if (await findBySku(sku)) throw new Error('El código del producto chocó con otro. Toca «Guardar» de nuevo.');
      const ubic = ubicacion.trim().toUpperCase() || null;
      const creado = await createProducto({
        sku, nombre: n, categoria, unidad, stock: 0, stock_min: 0, precio,
        almacen: dep.almacen, estado: 'activo', ubicacion: ubic,
      });
      if (cant > 0) {
        await registrarMovimiento({
          producto_id: creado.id, tipo: 'creacion', delta: cant, almacen: dep.almacen,
          actor, actor_name: actorName,
          detalle: `Stock inicial al dar de alta el producto · ${dep.nombre} (teléfono)`,
          precio_unitario: precio,
        });
      }
      setAviso({
        titulo: `Cargado en ${dep.nombre}: ${sku}`,
        texto: mensajeProductoNuevo({ deposito: dep.nombre, sku, nombre: n, categoria, unidad, cantidad: cant, costo: precio, ubicacion: ubic }, actorName ?? actor),
      });
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (aviso) return <Listo titulo={aviso.titulo} texto={aviso.texto} onListo={() => { void onSaved(); }} />;

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>＋</span><strong>Producto nuevo · {dep.nombre}</strong></div>
      <div className="surt-campo">
        <label htmlFor="inv-nombre">Nombre</label>
        <input id="inv-nombre" className="input surt-input" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej.: MANGUERA 2 PULGADAS" autoComplete="off" autoFocus />
      </div>
      <div className="surt-grid2">
        <div className="surt-campo">
          <label htmlFor="inv-categoria">Categoría</label>
          <select id="inv-categoria" className="input surt-input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Elegir…</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="surt-campo">
          <label htmlFor="inv-unidad">Unidad</label>
          <select id="inv-unidad" className="input surt-input" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            <option value="">Elegir…</option>
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="surt-campo">
        <label htmlFor="inv-cantidad">¿Cuánto hay?</label>
        <input id="inv-cantidad" className="input surt-litros" inputMode="decimal" value={cantidad}
          onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
        <small className="muted">Lo que entra hoy. Si no llegó nada todavía, déjalo en 0.</small>
      </div>
      <div className="surt-grid2">
        <div className="surt-campo">
          <label htmlFor="inv-costo">Costo c/u (USD)</label>
          <input id="inv-costo" className="input surt-input" inputMode="decimal" value={costo}
            onChange={(e) => setCosto(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="surt-campo">
          <label htmlFor="inv-ubicacion">Ubicación</label>
          <input id="inv-ubicacion" className="input surt-input" value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)} placeholder="Opcional" autoComplete="off" />
        </div>
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>{guardando ? 'Guardando…' : '✓ Guardar producto'}</button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>Cancelar</button>
    </form>
  );
}

function FormEntrada({ dep, producto, actor, actorName, onCancel, onSaved }: {
  dep: Dep; producto: Producto; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const cant = Number(cantidad.replace(',', '.')) || 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (cant <= 0) return toast('Escribe cuánto llegó.', 'error');
    setGuardando(true);
    try {
      const mov = await registrarMovimiento({
        producto_id: producto.id, tipo: 'entrada', delta: cant, almacen: dep.almacen,
        actor, actor_name: actorName,
        detalle: nota.trim() ? `${nota.trim()} · ${dep.nombre} (teléfono)` : `Entrada en ${dep.nombre} (teléfono)`,
      });
      setAviso(mensajeEntrada({
        deposito: dep.nombre, sku: producto.sku, nombre: producto.nombre, unidad: producto.unidad,
        cantidad: cant, queda: Number(mov.stock_despues) || despues, nota,
      }, actorName ?? actor, mov.at));
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  const despues = (Number(producto.stock) || 0) + cant;
  if (aviso) return <Listo titulo={`Entrada: +${num(cant)} ${producto.unidad} de ${producto.nombre}`} texto={aviso} onListo={() => { void onSaved(); }} />;

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>⬇</span><strong>Entrada · {producto.nombre}</strong></div>
      <div className="muted">{producto.sku} · hay {num(Number(producto.stock) || 0)} {producto.unidad}</div>
      <div className="surt-campo">
        <label htmlFor="inv-entrada-cant">¿Cuánto llegó? ({producto.unidad})</label>
        <input id="inv-entrada-cant" className="input surt-litros" inputMode="decimal" value={cantidad}
          onChange={(e) => setCantidad(e.target.value)} placeholder="0" autoFocus />
        {cant > 0 && <small className="muted">Queda en {num(despues)} {producto.unidad}.</small>}
      </div>
      <div className="surt-campo">
        <label htmlFor="inv-entrada-nota">Nota</label>
        <input id="inv-entrada-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: de dónde vino, quién lo trajo…" autoComplete="off" />
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || cant <= 0}>{guardando ? 'Guardando…' : '✓ Guardar entrada'}</button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Otro producto</button>
    </form>
  );
}

function FormTraslado({ dep, depositoActual, producto, actor, actorName, onCancel, onSaved }: {
  dep: Dep; depositoActual: Deposito; producto: Producto; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const otros = useMemo(
    () => (Object.keys(DEPOSITOS) as Deposito[]).filter((d) => d !== depositoActual),
    [depositoActual],
  );
  const [destinoKey, setDestinoKey] = useState<Deposito>(otros[0] ?? 'general');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);
  const cant = Number(cantidad.replace(',', '.')) || 0;
  const hay = Number(producto.stock) || 0;
  const destinoDep = DEPOSITOS[destinoKey] ?? DEPOSITOS.general;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (cant <= 0) return toast('Escribe cuánto se traslada.', 'error');
    if (cant > hay) return toast(`No alcanza: hay ${num(hay)} ${producto.unidad}.`, 'error');
    setGuardando(true);
    try {
      const t = await trasladarEntreAlmacenes({
        producto_id: producto.id,
        cantidad: cant,
        destino: destinoDep.almacen,
        nota: nota.trim() || null,
        actor,
        actor_name: actorName,
      });
      setAviso({ titulo: `Traslado ${t.codigo} registrado`, texto: mensajeTraslado(t, actorName ?? actor) });
    } catch (err) {
      toast(errMsg(err, 'No se pudo trasladar'), 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (aviso) return <Listo titulo={aviso.titulo} texto={aviso.texto} onListo={() => { void onSaved(); }} />;

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>🔁</span><strong>Traslado · {producto.nombre}</strong></div>
      <div className="muted">{producto.sku} · hay {num(hay)} {producto.unidad} en {dep.nombre}</div>

      <div className="surt-campo">
        <label style={{ fontWeight: 600, marginBottom: '.35rem', display: 'block' }}>¿A cuál depósito se traslada?</label>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${otros.length}, 1fr)`, gap: '.5rem' }}>
          {otros.map((dKey) => {
            const d = DEPOSITOS[dKey];
            const activo = destinoKey === dKey;
            const icono = dKey === 'reutilizables' ? '♻️ ' : dKey === 'mina' ? '⛏ ' : '📦 ';
            const label = dKey === 'reutilizables' ? 'Reutilizables' : dKey === 'mina' ? 'Depósito Mina' : 'General';
            return (
              <button
                key={dKey}
                type="button"
                className={`btn ${activo ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontWeight: 600, minHeight: 46, padding: '.4rem .5rem', textAlign: 'center', fontSize: '.88rem' }}
                onClick={() => setDestinoKey(dKey)}
              >
                {icono}{label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="aviso info sm">
        <span className="aviso-icono">🔁</span>
        <div>De <strong>{dep.nombre}</strong> a <strong>{destinoDep.nombre}</strong>. Si allá no existe este producto, se crea con el mismo nombre, categoría y unidad.</div>
      </div>
      <div className="surt-campo">
        <label htmlFor="inv-traslado-cant">¿Cuánto se traslada? ({producto.unidad})</label>
        <input id="inv-traslado-cant" className="input surt-litros" inputMode="decimal" value={cantidad}
          onChange={(e) => setCantidad(e.target.value)} placeholder="0" autoFocus />
        {cant > 0 && cant <= hay && <small className="muted">En {dep.nombre} quedan {num(hay - cant)} {producto.unidad}.</small>}
        {cant > hay && <small style={{ color: 'var(--danger)' }}>No alcanza: hay {num(hay)} {producto.unidad}.</small>}
      </div>
      <div className="surt-campo">
        <label htmlFor="inv-traslado-nota">Nota</label>
        <input id="inv-traslado-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: para qué, quién lo lleva…" autoComplete="off" />
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || cant <= 0 || cant > hay}>
        {guardando ? 'Trasladando…' : `🔁 Trasladar a ${destinoDep.nombre}`}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Otro producto</button>
    </form>
  );
}
