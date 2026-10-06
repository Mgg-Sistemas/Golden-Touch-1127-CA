/* ============================================================
   Golden Touch · Depósito Mina · Vista de teléfono (06/10/2026)

   Para el que está en la mina con el celular: dos botones grandes.
   · «Producto nuevo»: nombre, categoría, unidad y cuánto llegó. El SKU lo
     pone el sistema y el producto nace en el Depósito Mina.
   · «Entrada»: busca un producto que ya está y le suma lo que llegó.
   Escribe en las MISMAS tablas que el módulo de PC (createProducto +
   registrarMovimiento), así que aparece al instante en Inventario → Depósito
   Mina (realtime). Editar, desactivar o hacer salidas es tarea de la PC.
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
import { DEPOSITOS } from './depositos';

const DEP = DEPOSITOS.mina;
/** Cuántos productos se listan sin buscar: en el teléfono no se recorre el inventario entero. */
const SIN_BUSCAR = 15;

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Paso = 'inicio' | 'nuevo' | 'entrada';

export function DepositoMinaMovilView() {
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

  const reload = useCallback(async () => {
    const ps = await listProductos('mina');
    setProductos(ps.filter((p) => p.estado === 'activo'));
    const [cats, uds] = await Promise.all([getCategorias(ps), getUnidades(ps)]);
    setCategorias(cats);
    setUnidades(uds);
  }, []);

  useEffect(() => {
    let cancel = false;
    reload().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);
  useRealtime(['productos', 'movimientos', 'taxonomias'], () => { void reload().catch(() => {}); });

  const lista = useMemo(() => {
    const q = sinAcentos(busca.trim());
    if (!q) return productos.slice(0, SIN_BUSCAR);
    return productos.filter((p) => sinAcentos(`${p.nombre} ${p.sku} ${p.categoria}`).includes(q));
  }, [productos, busca]);

  function volver() { setPaso('inicio'); setElegido(null); }

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>⛏ Depósito Mina</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{actorName ?? actor}</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
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
          <button type="button" className="surt-btn primario" onClick={() => setPaso('nuevo')}>
            <span className="icono" aria-hidden>＋</span>
            <span>Producto nuevo</span>
            <small>Algo que todavía no está en el depósito</small>
          </button>
          <button type="button" className="surt-btn entrada" style={{ gridColumn: '1 / -1' }}
            onClick={() => { setElegido(null); setPaso('entrada'); }}>
            <span className="icono" aria-hidden>⬇</span>
            <span>Entrada</span>
            <small>Llegó más de un producto que ya está</small>
          </button>
        </div>
      )}

      {paso === 'nuevo' && (
        <FormNuevo categorias={categorias} unidades={unidades} actor={actor} actorName={actorName}
          onCancel={volver}
          onSaved={async () => { volver(); await reload().catch(() => {}); }} />
      )}

      {paso === 'entrada' && elegido && (
        <FormEntrada producto={elegido} actor={actor} actorName={actorName}
          onCancel={() => setElegido(null)}
          onSaved={async () => { volver(); await reload().catch(() => {}); }} />
      )}

      {(paso === 'inicio' || (paso === 'entrada' && !elegido)) && (
        <section className="surt-lista">
          {paso === 'entrada' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
              <strong style={{ fontSize: '1.1rem' }}>⬇ ¿A qué producto le llegó?</strong>
              <button type="button" className="btn btn-ghost" onClick={volver}>Cancelar</button>
            </div>
          )}
          <input className="input surt-input" type="search" name="mina-buscar" placeholder="🔍 Buscar producto…"
            value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
          <h2>
            {busca.trim()
              ? `${lista.length} encontrado(s)`
              : `Productos del depósito (${productos.length})${productos.length > SIN_BUSCAR ? ` · se ven ${SIN_BUSCAR}, busca para ver el resto` : ''}`}
          </h2>
          {!loading && !productos.length && <p className="muted">El Depósito Mina no tiene productos todavía. Carga el primero con «Producto nuevo».</p>}
          {lista.map((p) => (
            <button key={p.id} type="button" className="surt-mov"
              onClick={() => { if (canWrite) { setElegido(p); setPaso('entrada'); } }}
              disabled={!canWrite}>
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

function FormNuevo({ categorias, unidades, actor, actorName, onCancel, onSaved }: {
  categorias: string[]; unidades: string[]; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidad, setUnidad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [guardando, setGuardando] = useState(false);

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
      const creado = await createProducto({
        sku, nombre: n, categoria, unidad, stock: 0, stock_min: 0, precio,
        almacen: DEP.almacen, estado: 'activo', ubicacion: ubicacion.trim().toUpperCase() || null,
      });
      if (cant > 0) {
        await registrarMovimiento({
          producto_id: creado.id, tipo: 'creacion', delta: cant, almacen: DEP.almacen,
          actor, actor_name: actorName,
          detalle: `Stock inicial al dar de alta el producto · ${DEP.nombre} (teléfono)`,
          precio_unitario: precio,
        });
      }
      toast(`Cargado en ${DEP.nombre}: ${sku} · ${n}`, 'success');
      await onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>＋</span><strong>Producto nuevo · {DEP.nombre}</strong></div>
      <div className="surt-campo">
        <label htmlFor="mina-nombre">Nombre</label>
        <input id="mina-nombre" className="input surt-input" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej.: MANGUERA 2 PULGADAS" autoComplete="off" autoFocus />
      </div>
      <div className="surt-grid2">
        <div className="surt-campo">
          <label htmlFor="mina-categoria">Categoría</label>
          <select id="mina-categoria" className="input surt-input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Elegir…</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="surt-campo">
          <label htmlFor="mina-unidad">Unidad</label>
          <select id="mina-unidad" className="input surt-input" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            <option value="">Elegir…</option>
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="surt-campo">
        <label htmlFor="mina-cantidad">¿Cuánto hay?</label>
        <input id="mina-cantidad" className="input surt-litros" inputMode="decimal" value={cantidad}
          onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
        <small className="muted">Lo que entra hoy al depósito. Si no llegó nada todavía, déjalo en 0.</small>
      </div>
      <div className="surt-grid2">
        <div className="surt-campo">
          <label htmlFor="mina-costo">Costo c/u (USD)</label>
          <input id="mina-costo" className="input surt-input" inputMode="decimal" value={costo}
            onChange={(e) => setCosto(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="surt-campo">
          <label htmlFor="mina-ubicacion">Ubicación</label>
          <input id="mina-ubicacion" className="input surt-input" value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)} placeholder="Opcional" autoComplete="off" />
        </div>
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>{guardando ? 'Guardando…' : '✓ Guardar producto'}</button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>Cancelar</button>
    </form>
  );
}

function FormEntrada({ producto, actor, actorName, onCancel, onSaved }: {
  producto: Producto; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cant = Number(cantidad.replace(',', '.')) || 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (cant <= 0) return toast('Escribe cuánto llegó.', 'error');
    setGuardando(true);
    try {
      await registrarMovimiento({
        producto_id: producto.id, tipo: 'entrada', delta: cant, almacen: DEP.almacen,
        actor, actor_name: actorName,
        detalle: nota.trim() ? `${nota.trim()} · ${DEP.nombre} (teléfono)` : `Entrada en ${DEP.nombre} (teléfono)`,
      });
      toast(`Entrada: +${num(cant)} ${producto.unidad} de ${producto.nombre}`, 'success');
      await onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  const despues = (Number(producto.stock) || 0) + cant;
  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>⬇</span><strong>Entrada · {producto.nombre}</strong></div>
      <div className="muted">{producto.sku} · hay {num(Number(producto.stock) || 0)} {producto.unidad}</div>
      <div className="surt-campo">
        <label htmlFor="mina-entrada-cant">¿Cuánto llegó? ({producto.unidad})</label>
        <input id="mina-entrada-cant" className="input surt-litros" inputMode="decimal" value={cantidad}
          onChange={(e) => setCantidad(e.target.value)} placeholder="0" autoFocus />
        {cant > 0 && <small className="muted">Queda en {num(despues)} {producto.unidad}.</small>}
      </div>
      <div className="surt-campo">
        <label htmlFor="mina-entrada-nota">Nota</label>
        <input id="mina-entrada-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: de dónde vino, quién lo trajo…" autoComplete="off" />
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || cant <= 0}>{guardando ? 'Guardando…' : '✓ Guardar entrada'}</button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Otro producto</button>
    </form>
  );
}
