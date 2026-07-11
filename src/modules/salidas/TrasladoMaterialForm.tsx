import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { notify } from '@/shared/lib/notify';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import type { Existencia, Producto, ItemSalida } from '@/shared/lib/types';
import { crearSolicitudSalida } from './salidas.repository';
import { updateProducto } from '@/modules/inventario/inventario.repository';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listActivosPedido, addCatalogoPedido } from '@/modules/pedidos/pedidoCatalogos.repository';
import { TransporteFields, transporteVacio, type TransporteSeleccion } from './TransporteFields';

// `precio` = costo unitario EDITABLE (si se deja vacío usa el PMP/costo del inventario).
interface LineaUI { id: number; productoId: string; cantidad: string; precio?: string; }

export function TrasladoMaterialForm({
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
  const almacenes = almacenes_(almacenesList);
  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const exMap = useMemo(() => {
    const m = new Map<string, Existencia>();
    existencias.forEach((e) => m.set(`${e.producto_id}|${e.almacen}`, e));
    return m;
  }, [existencias]);

  const [origen, setOrigen] = useState(almacenes[0]);
  const [destino, setDestino] = useState(almacenes.find((a) => a !== almacenes[0]) ?? almacenes[0]);

  // Productos con stock en el almacén de origen.
  const productosEnOrigen = useMemo(
    () => activos.filter((p) => (Number(exMap.get(`${p.id}|${origen}`)?.stock) || 0) > 0),
    [activos, exMap, origen],
  );

  // Carrito de renglones (varios materiales, mismo origen → destino).
  const [lineas, setLineas] = useState<LineaUI[]>([{ id: 1, productoId: '', cantidad: '1' }]);
  const [seq, setSeq] = useState(2);
  useEffect(() => {
    setLineas([{ id: 1, productoId: '', cantidad: '1' }]);
    setSeq(2);
  }, [origen]);

  function setLinea(id: number, patch: Partial<LineaUI>) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLinea() { setLineas((ls) => [...ls, { id: seq, productoId: '', cantidad: '1' }]); setSeq((s) => s + 1); }
  function quitarLinea(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  const [motivo, setMotivo] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [transporte, setTransporte] = useState<TransporteSeleccion>(transporteVacio);
  const [consumoInterno, setConsumoInterno] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unidad solicitante: mismo catálogo de OP (en vivo).
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
    // Leemos el valor REAL del DOM (ref), no el estado: el input es no-controlado y el
    // estado puede quedar atrás (ej. "COMPRA" tecleado rápido guardaba "COMP").
    const v = (nuevaUnidadRef.current?.value ?? nuevaUnidad).trim().toUpperCase();
    if (!v) { toast('Escribí la unidad nueva', 'error'); return; }
    if (unidadOpciones.some((u) => u.toLowerCase() === v.toLowerCase())) {
      setUnidadSolicitante(v); setNuevaUnidad(''); if (nuevaUnidadRef.current) nuevaUnidadRef.current.value = ''; return;
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

  // Datos por renglón (producto, stock en origen, precio PMP origen, subtotal, exceso).
  const lineasCalc = lineas.map((l) => {
    const producto = activos.find((p) => p.id === l.productoId) ?? null;
    const ex = exMap.get(`${l.productoId}|${origen}`);
    const stock = Number(ex?.stock) || 0;
    const precioDefault = (Number(ex?.costo_promedio) || 0) || (producto?.precio ?? 0) || 0;
    const precio = l.precio !== undefined && l.precio !== '' ? (Number(l.precio) || 0) : precioDefault;
    const precioCambiado = !!producto && l.precio !== undefined && l.precio !== '' && Math.abs(precio - (producto.precio ?? 0)) > 0.0001;
    const cantNum = Number(l.cantidad) || 0;
    const excede = cantNum > stock;
    return { l, producto, stock, precio, precioDefault, precioCambiado, cantNum, subtotal: precio * cantNum, excede };
  });
  const total = lineasCalc.reduce((a, x) => a + x.subtotal, 0);
  const mismoAlmacen = origen === destino;
  const hayInvalida = mismoAlmacen || !productosEnOrigen.length || lineasCalc.some((x) => !x.l.productoId || x.cantNum <= 0 || x.excede);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (origen === destino) { setError('El almacén origen y destino deben ser distintos.'); return; }
    if (!productosEnOrigen.length) { setError('El almacén de origen no tiene materiales con stock.'); return; }
    const items: ItemSalida[] = [];
    for (const x of lineasCalc) {
      if (!x.l.productoId) { setError('Elegí el material en cada renglón.'); return; }
      if (x.cantNum <= 0) { setError('Cada material debe tener cantidad mayor que 0.'); return; }
      if (x.cantNum > x.stock) { setError(`No hay stock suficiente de ${x.producto?.nombre} en ${origen}. Disponible: ${num(x.stock)}.`); return; }
      items.push({
        producto_id: x.l.productoId,
        producto_nombre: x.producto?.nombre ?? '',
        producto_sku: x.producto?.sku ?? null,
        unidad: x.producto?.unidad ?? null,
        cantidad: x.cantNum,
        precio_unit: x.precio,
        observacion: null,
      });
    }
    const ids = items.map((i) => i.producto_id);
    if (new Set(ids).size !== ids.length) { setError('Hay un material repetido en dos renglones. Unilo en uno solo.'); return; }
    setSaving(true);
    try {
      await crearSolicitudSalida({
        scope: 'traslado', tipo: 'material',
        items, almacenOrigen: origen, almacenDestino: destino,
        motivo: motivo.trim() || null,
        unidadSolicitante: unidadSolicitante.trim() || null,
        notaEntrega: null, fechaEntrega: fechaEntrega || null,
        choferId: transporte.choferId, choferNombre: transporte.choferNombre, choferCedula: transporte.choferCedula,
        vehiculoId: transporte.vehiculoId, vehiculoDescripcion: transporte.vehiculoDescripcion, vehiculoPlaca: transporte.vehiculoPlaca,
        direccionDespacho: transporte.direccionDespacho || null,
        direccionDestino: transporte.direccionDestino || null,
        consumoInterno,
        solicitante: actorName || actor, actor, actorName,
      });
      // Vincular con inventario: si se editó el costo de algún material, se actualiza
      // el costo del producto (productos.precio) para alinear el inventario.
      const cambios = lineasCalc.filter((x) => x.precioCambiado && x.l.productoId);
      if (cambios.length) {
        const res = await Promise.allSettled(cambios.map((x) => updateProducto(x.l.productoId, { precio: x.precio })));
        const fallos = res.filter((r) => r.status === 'rejected').length;
        if (fallos) toast(`Traslado creado, pero ${fallos} costo(s) no se pudo sincronizar con inventario.`, 'error');
        else toast(`Costo sincronizado con inventario (${cambios.length}).`, 'success');
      }
      const resumen = items.length === 1 ? `${num(items[0].cantidad)} ${items[0].unidad ?? ''} de ${items[0].producto_nombre}` : `${items.length} materiales`;
      notify(`Solicitud de traslado creada: ${resumen} · ${origen} → ${destino} · queda Por aprobar`, 'success', { link: '#/app/salidas' });
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
      <button type="submit" form="traslado-mat-form" className="btn btn-primary" disabled={saving || hayInvalida}>
        {saving ? 'Creando…' : 'Crear solicitud'}
      </button>
    </>
  );

  return (
    <Modal title="Nueva solicitud de traslado de material" size="lg" onClose={onClose} footer={footer}>
      <form id="traslado-mat-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-row">
          <label>Sede</label>
          <select className="select" value="Peramanal" disabled>
            <option value="Peramanal">Peramanal</option>
          </select>
          <small className="muted">El traslado es entre sub-almacenes de Peramanal.</small>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Almacén origen</label>
            <select className="select" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <small className="muted">Todos los materiales salen de este almacén.</small>
          </div>
          <div className="form-row">
            <label>Almacén destino</label>
            <select className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
              {almacenes.filter((a) => a !== origen).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {mismoAlmacen && <small style={{ color: 'var(--danger)' }}>Elegí un destino distinto al origen.</small>}
          </div>
        </div>

        <div className="form-row">
          <label>Unidad solicitante</label>
          <SearchSelect value={unidadSolicitante} onChange={(v) => setUnidadSolicitante(v.toUpperCase())}
            options={unidadOpciones.map((u) => ({ value: u, label: u }))}
            placeholder="Departamento / unidad que solicita" />
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
            <input className="input" name="tm-nueva-unidad" ref={nuevaUnidadRef} defaultValue={nuevaUnidad} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setNuevaUnidad(e.target.value); }}
              placeholder="¿No está? Escribí la unidad nueva…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarUnidadNueva(); } }} />
            <button type="button" className="btn btn-ghost" onClick={() => void agregarUnidadNueva()} disabled={addingUnidad}>
              {addingUnidad ? '…' : '+ Añadir'}
            </button>
          </div>
          <small className="muted">Mismo catálogo compartido con OP (Pedidos → Categorías).</small>
        </div>

        {/* ── Carrito de materiales ── */}
        <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.4rem 0 .35rem' }}>
          Materiales a trasladar
        </label>
        {lineasCalc.map(({ l, producto, stock, precio, precioDefault, cantNum, subtotal, excede }, idx) => (
          <div key={l.id} className="card" style={{ margin: '0 0 .5rem', padding: '.6rem .7rem', background: 'var(--bg-1)' }}>
            <div className="form-grid">
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Material #{idx + 1}</label>
                <SearchSelect value={l.productoId} onChange={(v) => setLinea(l.id, { productoId: v, precio: undefined })} disabled={!productosEnOrigen.length}
                  placeholder={productosEnOrigen.length ? '🔍 Buscar producto…' : '— el almacén de origen no tiene materiales —'}
                  options={productosEnOrigen.map((p) => ({ value: p.id, label: `${p.nombre} · ${p.sku}` }))} />
                <small className="muted">Disponible: <strong className="mono">{num(stock)} {producto?.unidad ?? ''}</strong> · PMP <strong className="mono">{money(precioDefault)}</strong></small>
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
                  : <small className="muted">Subtotal: <strong className="mono">{money(subtotal)}</strong> {cantNum > 0 && <>· queda {num(Math.max(0, stock - cantNum))} en origen</>}</small>}
              </div>
            </div>
            {/* Costo unitario editable: si se cambia, se actualiza el costo del producto en inventario. */}
            {l.productoId && (
              <div className="form-row" style={{ marginBottom: 0, marginTop: '.5rem', maxWidth: 260 }}>
                <label>Costo unitario $</label>
                <input className="input mono" type="number" min={0} step="any"
                  title="Costo unitario. Si lo cambiás, se actualiza el costo del producto en el inventario."
                  value={l.precio !== undefined ? l.precio : String(precioDefault)}
                  onChange={(e) => setLinea(l.id, { precio: e.target.value })} />
                <small className="muted">
                  Sugerido (inventario): <strong className="mono">{money(precioDefault)}</strong>
                  {Math.abs(precio - precioDefault) > 0.0001 && <> · se actualizará el costo en inventario a <strong className="mono">{money(precio)}</strong></>}
                </small>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={addLinea} disabled={!productosEnOrigen.length} style={{ marginBottom: '.6rem' }}>
          ＋ Agregar material
        </button>

        <div className="form-grid">
          <div className="form-row">
            <label>Motivo / detalle</label>
            <input className="input" name="tm-motivo" defaultValue={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del traslado…" />
          </div>
          <div className="form-row">
            <label>Fecha de entrega</label>
            <input className="input" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            <small className="muted">Fecha en que se entregó al almacén destino.</small>
          </div>
        </div>

        {/* Consumo interno: el material se traslada para uso interno. */}
        <div className="form-row" style={{ marginTop: '.25rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={consumoInterno} onChange={(e) => setConsumoInterno(e.target.checked)} />
            Consumo interno
          </label>
          <small className="muted">Se marca en el detalle y en la trazabilidad.</small>
        </div>

        {/* Transporte y direcciones (formato de salida en tránsito) */}
        <TransporteFields value={transporte} onChange={setTransporte} actor={actor} />

        <div className="card" style={{ padding: '.6rem .85rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-1)', margin: '.6rem 0 0', display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: '.85rem' }}>{lineas.length} material(es) · {origen} → {destino} · lleva el costo (PMP) del origen</span>
          <span className="mono" style={{ fontSize: '.9rem', fontWeight: 700 }}>Total: {money(total)}</span>
        </div>
      </form>
    </Modal>
  );
}

function almacenes_(list: string[]): string[] {
  return list.length ? list : ['General'];
}
