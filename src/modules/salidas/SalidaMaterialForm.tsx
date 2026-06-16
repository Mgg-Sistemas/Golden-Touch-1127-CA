import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import type { Existencia, Producto, ItemSalida } from '@/shared/lib/types';
import { crearSolicitudSalida } from './salidas.repository';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listActivosPedido, addCatalogoPedido } from '@/modules/pedidos/pedidoCatalogos.repository';

interface LineaUI { id: number; productoId: string; cantidad: string; }

export function SalidaMaterialForm({
  productos, existencias, almacenesList, actor, actorName, onClose, onSaved,
}: {
  productos: Producto[];
  existencias: Existencia[];
  almacenesList: string[];
  actor: string;
  actorName?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const almacenes = almacenesList.length ? almacenesList : ['General'];
  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const exMap = useMemo(() => {
    const m = new Map<string, Existencia>();
    existencias.forEach((e) => m.set(`${e.producto_id}|${e.almacen}`, e));
    return m;
  }, [existencias]);

  const [almacen, setAlmacen] = useState(almacenes[0]);
  // Productos que ESE almacén contiene (con existencia > 0).
  const productosEnAlmacen = useMemo(
    () => activos.filter((p) => (Number(exMap.get(`${p.id}|${almacen}`)?.stock) || 0) > 0),
    [activos, exMap, almacen],
  );

  // Carrito de renglones (varios materiales del mismo almacén, como una OC).
  const [lineas, setLineas] = useState<LineaUI[]>([{ id: 1, productoId: '', cantidad: '1' }]);
  const [seq, setSeq] = useState(2);
  // Al cambiar de almacén, reiniciamos el carrito (el stock/precio dependen del almacén).
  useEffect(() => {
    setLineas([{ id: 1, productoId: '', cantidad: '1' }]);
    setSeq(2);
  }, [almacen]);

  function setLinea(id: number, patch: Partial<LineaUI>) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLinea() { setLineas((ls) => [...ls, { id: seq, productoId: '', cantidad: '1' }]); setSeq((s) => s + 1); }
  function quitarLinea(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  const [motivo, setMotivo] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unidad solicitante: MISMO catálogo de OP (Pedidos). En vivo: si se agrega en
  // OP o acá, se refleja al instante en ambos lados.
  const [unidadSolicitante, setUnidadSolicitante] = useState('');
  const [unidadOpciones, setUnidadOpciones] = useState<string[]>([]);
  const [nuevaUnidad, setNuevaUnidad] = useState('');
  const nuevaUnidadRef = useRef<HTMLInputElement>(null);
  const [addingUnidad, setAddingUnidad] = useState(false);
  const cargarUnidades = useCallback(async () => {
    const uns = await listActivosPedido('unidad_solicitante').catch(() => [] as string[]);
    setUnidadOpciones(uns);
  }, []);
  useEffect(() => { void cargarUnidades(); }, [cargarUnidades]);
  useRealtime(['pedido_catalogos'], () => { void cargarUnidades(); });

  async function agregarUnidadNueva() {
    const v = nuevaUnidad.trim().toUpperCase();
    if (!v) { toast('Escribí la unidad nueva', 'error'); return; }
    if (unidadOpciones.some((u) => u.toLowerCase() === v.toLowerCase())) {
      setUnidadSolicitante(v);
      setNuevaUnidad('');
      if (nuevaUnidadRef.current) nuevaUnidadRef.current.value = '';
      return;
    }
    try {
      setAddingUnidad(true);
      await addCatalogoPedido('unidad_solicitante', v).catch(() => { /* ya existe / sin permiso */ });
      await cargarUnidades();
      setUnidadSolicitante(v);
      setNuevaUnidad('');
      if (nuevaUnidadRef.current) nuevaUnidadRef.current.value = '';
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error');
    } finally {
      setAddingUnidad(false);
    }
  }

  // Datos por renglón (producto, stock, precio PMP, subtotal, exceso).
  const lineasCalc = lineas.map((l) => {
    const producto = activos.find((p) => p.id === l.productoId) ?? null;
    const ex = exMap.get(`${l.productoId}|${almacen}`);
    const stock = Number(ex?.stock) || 0;
    const precio = (Number(ex?.costo_promedio) || 0) || (producto?.precio ?? 0) || 0;
    const cantNum = Number(l.cantidad) || 0;
    const excede = cantNum > stock;
    return { l, producto, stock, precio, cantNum, subtotal: precio * cantNum, excede };
  });
  const total = lineasCalc.reduce((a, x) => a + x.subtotal, 0);
  const hayInvalida = lineasCalc.some((x) => !x.l.productoId || x.cantNum <= 0 || x.excede);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productosEnAlmacen.length) { setError('El almacén seleccionado no tiene materiales con stock.'); return; }
    const items: ItemSalida[] = [];
    for (const x of lineasCalc) {
      if (!x.l.productoId) { setError('Elegí el material en cada renglón.'); return; }
      if (x.cantNum <= 0) { setError('Cada material debe tener cantidad mayor que 0.'); return; }
      if (x.cantNum > x.stock) { setError(`No hay stock suficiente de ${x.producto?.nombre} en ${almacen}. Disponible: ${num(x.stock)}.`); return; }
      items.push({
        producto_id: x.l.productoId,
        producto_nombre: x.producto?.nombre ?? '',
        producto_sku: x.producto?.sku ?? null,
        unidad: x.producto?.unidad ?? null,
        cantidad: x.cantNum,
        precio_unit: x.precio,
      });
    }
    // Aviso si un mismo material está repetido en dos renglones (la suma podría exceder el stock).
    const ids = items.map((i) => i.producto_id);
    if (new Set(ids).size !== ids.length) { setError('Hay un material repetido en dos renglones. Unilo en uno solo.'); return; }
    setSaving(true);
    try {
      await crearSolicitudSalida({
        scope: 'salida', tipo: 'material',
        items, almacenOrigen: almacen, destino: null, motivo: motivo.trim() || null,
        unidadSolicitante: unidadSolicitante.trim() || null,
        fechaEntrega: fechaEntrega || null,
        solicitante: actorName || actor, actor, actorName,
      });
      const resumen = items.length === 1 ? `${num(items[0].cantidad)} ${items[0].unidad ?? ''} de ${items[0].producto_nombre}` : `${items.length} materiales`;
      notify(`Solicitud de salida creada: ${resumen} · queda Por aprobar`, 'success', { link: '#/app/salidas' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="salida-mat-form" className="btn btn-primary" disabled={saving || hayInvalida || !productosEnAlmacen.length}>
        {saving ? 'Creando…' : 'Crear solicitud'}
      </button>
    </>
  );

  return (
    <Modal title="Nueva solicitud de salida de material" size="lg" onClose={onClose} footer={footer}>
      <form id="salida-mat-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-grid">
          <div className="form-row">
            <label>Sede origen</label>
            <select className="select" value="Peramanal" disabled>
              <option value="Peramanal">Peramanal</option>
            </select>
            <small className="muted">Centro de acopio principal.</small>
          </div>
          <div className="form-row">
            <label>Almacén origen</label>
            <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <small className="muted">Todos los materiales salen de este sub-almacén.</small>
          </div>
        </div>

        <div className="form-row">
          <label>Unidad solicitante</label>
          {/* Mismo catálogo de OP (en vivo). */}
          <SearchSelect value={unidadSolicitante} onChange={(v) => setUnidadSolicitante(v.toUpperCase())}
            options={unidadOpciones.map((u) => ({ value: u, label: u }))}
            placeholder="Departamento / unidad que solicita" />
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
            <input className="input" name="f-nueva-unidad" ref={nuevaUnidadRef} defaultValue={nuevaUnidad}
              onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevaUnidad(e.target.value); }}
              placeholder="¿No está? Escribí la unidad nueva…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarUnidadNueva(); } }} />
            <button type="button" className="btn btn-ghost" onClick={() => void agregarUnidadNueva()} disabled={addingUnidad}>
              {addingUnidad ? '…' : '+ Añadir'}
            </button>
          </div>
          <small className="muted">La unidad nueva queda guardada en el catálogo compartido con OP (Pedidos → Categorías).</small>
        </div>

        {/* ── Carrito de materiales ── */}
        <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.4rem 0 .35rem' }}>
          Materiales del almacén
        </label>
        {lineasCalc.map(({ l, producto, stock, precio, cantNum, subtotal, excede }, idx) => (
          <div key={l.id} className="card" style={{ margin: '0 0 .5rem', padding: '.6rem .7rem', background: 'var(--bg-1)' }}>
            <div className="form-grid">
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Material #{idx + 1}</label>
                <SearchSelect value={l.productoId} onChange={(v) => setLinea(l.id, { productoId: v })} disabled={!productosEnAlmacen.length}
                  placeholder={productosEnAlmacen.length ? '🔍 Buscar producto…' : '— el almacén no tiene materiales —'}
                  options={productosEnAlmacen.map((p) => ({ value: p.id, label: `${p.nombre} · ${p.sku}` }))} />
                <small className="muted">Disponible: <strong className="mono">{num(stock)} {producto?.unidad ?? ''}</strong> · PMP <strong className="mono">{money(precio)}</strong></small>
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Cantidad{producto?.unidad ? ` (${producto.unidad})` : ''}</label>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start' }}>
                  <input className="input mono" type="number" min={0} max={stock || undefined} step="any" style={{ flex: 1, minWidth: 0 }}
                    value={l.cantidad}
                    onChange={(e) => {
                      const v = e.target.value; const n = Number(v);
                      if (Number.isFinite(n) && n > stock) { setLinea(l.id, { cantidad: String(stock) }); return; }
                      setLinea(l.id, { cantidad: v });
                    }} required />
                  {lineas.length > 1 && (
                    <button type="button" className="btn btn-ghost" title="Quitar material" onClick={() => quitarLinea(l.id)}>✕</button>
                  )}
                </div>
                {excede
                  ? <small style={{ color: 'var(--danger)' }}>Máximo disponible: {num(stock)} {producto?.unidad ?? ''}.</small>
                  : <small className="muted">Subtotal: <strong className="mono">{money(subtotal)}</strong> {cantNum > 0 && <>· queda {num(Math.max(0, stock - cantNum))}</>}</small>}
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={addLinea} disabled={!productosEnAlmacen.length} style={{ marginBottom: '.6rem' }}>
          ＋ Agregar material
        </button>

        <div className="form-grid">
          <div className="form-row">
            <label>Motivo / detalle</label>
            <input className="input" name="f-motivo" defaultValue={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del despacho, referencia…" />
          </div>
          <div className="form-row">
            <label>Fecha de entrega</label>
            <input className="input" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            <small className="muted">Fecha en que se entregó al destino.</small>
          </div>
        </div>

        <div className="card" style={{ padding: '.6rem .85rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-1)', margin: 0, display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: '.85rem' }}>{lineas.length} material(es) · {almacen}</span>
          <span className="mono" style={{ fontSize: '.9rem', fontWeight: 700 }}>Total: {money(total)}</span>
        </div>
      </form>
    </Modal>
  );
}
