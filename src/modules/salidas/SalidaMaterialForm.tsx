import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import type { Existencia, Producto, ItemSalida } from '@/shared/lib/types';
import { crearSolicitudSalida } from './salidas.repository';
import { updateProducto } from '@/modules/inventario/inventario.repository';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listActivosPedido, addCatalogoPedido } from '@/modules/pedidos/pedidoCatalogos.repository';
import { TransporteFields, transporteVacio, type TransporteSeleccion } from './TransporteFields';

// `key` = `${producto_id}|${almacen}` (identifica una existencia concreta).
// `precio` = costo unitario EDITABLE (si se deja vacío usa el PMP/costo del inventario).
interface LineaUI { id: number; key: string; cantidad: string; precio?: string; }

export function SalidaMaterialForm({
  productos, existencias, actor, actorName, onClose, onSaved,
}: {
  productos: Producto[];
  existencias: Existencia[];
  almacenesList?: string[];
  actor: string;
  actorName?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const exMap = useMemo(() => {
    const m = new Map<string, Existencia>();
    existencias.forEach((e) => m.set(`${e.producto_id}|${e.almacen}`, e));
    return m;
  }, [existencias]);

  // Buscador con TODOS los productos que tienen stock (en cualquier almacén). El
  // almacén va en cada opción para saber de dónde se descuenta.
  const opciones = useMemo(() => {
    const prodById = new Map(activos.map((p) => [p.id, p]));
    return existencias
      .filter((e) => (Number(e.stock) || 0) > 0 && prodById.has(e.producto_id))
      .map((e) => {
        const p = prodById.get(e.producto_id)!;
        return { value: `${e.producto_id}|${e.almacen}`, label: `${p.nombre} · ${p.sku} — ${e.almacen}`, nombre: p.nombre };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [existencias, activos]);

  // Carrito de renglones (varios materiales, cada uno de su almacén).
  const [lineas, setLineas] = useState<LineaUI[]>([{ id: 1, key: '', cantidad: '1' }]);
  const [seq, setSeq] = useState(2);

  function setLinea(id: number, patch: Partial<LineaUI>) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLinea() { setLineas((ls) => [...ls, { id: seq, key: '', cantidad: '1' }]); setSeq((s) => s + 1); }
  function quitarLinea(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  const [motivo, setMotivo] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [transporte, setTransporte] = useState<TransporteSeleccion>(transporteVacio);
  const [consumoInterno, setConsumoInterno] = useState(false);
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

  // Datos por renglón (producto, almacén, stock, precio PMP, subtotal, exceso).
  const lineasCalc = lineas.map((l) => {
    const [pid, alm] = l.key ? l.key.split('|') : ['', ''];
    const producto = activos.find((p) => p.id === pid) ?? null;
    const ex = l.key ? exMap.get(l.key) : undefined;
    const stock = Number(ex?.stock) || 0;
    // Costo sugerido del inventario (PMP o precio del producto) y el costo EFECTIVO:
    // el editado por el usuario si lo cargó, si no el sugerido.
    const precioDefault = (Number(ex?.costo_promedio) || 0) || (producto?.precio ?? 0) || 0;
    const precio = l.precio !== undefined && l.precio !== '' ? (Number(l.precio) || 0) : precioDefault;
    const precioCambiado = !!producto && l.precio !== undefined && l.precio !== '' && Math.abs(precio - (producto.precio ?? 0)) > 0.0001;
    const cantNum = Number(l.cantidad) || 0;
    const excede = cantNum > stock;
    return { l, pid, alm, producto, stock, precio, precioDefault, precioCambiado, cantNum, subtotal: precio * cantNum, excede };
  });
  const total = lineasCalc.reduce((a, x) => a + x.subtotal, 0);
  const hayInvalida = !opciones.length || lineasCalc.some((x) => !x.l.key || x.cantNum <= 0 || x.excede);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!opciones.length) { setError('No hay materiales con stock en ningún almacén.'); return; }
    const items: ItemSalida[] = [];
    for (const x of lineasCalc) {
      if (!x.l.key) { setError('Elegí el material en cada renglón.'); return; }
      if (x.cantNum <= 0) { setError('Cada material debe tener cantidad mayor que 0.'); return; }
      if (x.cantNum > x.stock) { setError(`No hay stock suficiente de ${x.producto?.nombre} en ${x.alm}. Disponible: ${num(x.stock)}.`); return; }
      items.push({
        producto_id: x.pid,
        producto_nombre: x.producto?.nombre ?? '',
        producto_sku: x.producto?.sku ?? null,
        unidad: x.producto?.unidad ?? null,
        cantidad: x.cantNum,
        precio_unit: x.precio,
        almacen: x.alm,
        observacion: null,
      });
    }
    // Mismo material+almacén repetido en dos renglones → uniría a sumas inválidas.
    const keys = lineas.map((l) => l.key);
    if (new Set(keys).size !== keys.length) { setError('Hay un material repetido (mismo almacén) en dos renglones. Unilo en uno solo.'); return; }
    setSaving(true);
    try {
      await crearSolicitudSalida({
        scope: 'salida', tipo: 'material',
        items, destino: consumoInterno ? 'CONSUMO INTERNO' : (transporte.direccionDestino.trim() || null),
        motivo: motivo.trim() || null,
        unidadSolicitante: unidadSolicitante.trim() || null,
        fechaEntrega: fechaEntrega || null,
        choferId: transporte.choferId, choferNombre: transporte.choferNombre, choferCedula: transporte.choferCedula,
        vehiculoId: transporte.vehiculoId, vehiculoDescripcion: transporte.vehiculoDescripcion, vehiculoPlaca: transporte.vehiculoPlaca,
        direccionDespacho: transporte.direccionDespacho || null,
        direccionDestino: consumoInterno ? null : (transporte.direccionDestino || null),
        consumoInterno,
        solicitante: actorName || actor, actor, actorName,
      });
      // Vincular con inventario: si se editó el costo de algún material, se actualiza
      // el costo del producto (productos.precio) para que el inventario quede alineado.
      const cambios = lineasCalc.filter((x) => x.precioCambiado && x.pid);
      if (cambios.length) {
        const res = await Promise.allSettled(cambios.map((x) => updateProducto(x.pid, { precio: x.precio })));
        const fallos = res.filter((r) => r.status === 'rejected').length;
        if (fallos) toast(`Salida creada, pero ${fallos} costo(s) no se pudo sincronizar con inventario.`, 'error');
        else toast(`Costo sincronizado con inventario (${cambios.length}).`, 'success');
      }
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
      <button type="submit" form="salida-mat-form" className="btn btn-primary" disabled={saving || hayInvalida}>
        {saving ? 'Creando…' : 'Crear solicitud'}
      </button>
    </>
  );

  return (
    <Modal title="Nueva solicitud de salida de material" size="lg" onClose={onClose} footer={footer}>
      <form id="salida-mat-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-row">
          <label>Sede origen</label>
          <select className="select" value="Peramanal" disabled>
            <option value="Peramanal">Peramanal</option>
          </select>
          <small className="muted">Cada material se descuenta automáticamente del almacén donde está.</small>
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
          Materiales
        </label>
        {lineasCalc.map(({ l, producto, alm, stock, precio, precioDefault, cantNum, subtotal, excede }, idx) => (
          <div key={l.id} className="card" style={{ margin: '0 0 .5rem', padding: '.6rem .7rem', background: 'var(--bg-1)' }}>
            <div className="form-grid">
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Material #{idx + 1}</label>
                <SearchSelect value={l.key} onChange={(v) => setLinea(l.id, { key: v, precio: undefined })} disabled={!opciones.length}
                  placeholder={opciones.length ? '🔍 Buscar producto (todos los almacenes)…' : '— no hay materiales con stock —'}
                  options={opciones.map((o) => ({ value: o.value, label: o.label }))} />
                <small className="muted">
                  {l.key
                    ? <>Almacén: <strong>{alm}</strong> · Disponible: <strong className="mono">{num(stock)} {producto?.unidad ?? ''}</strong> · PMP <strong className="mono">{money(precioDefault)}</strong></>
                    : 'Elegí el producto; se descuenta del almacén donde está.'}
                </small>
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
                  : <small className="muted">Subtotal: <strong className="mono">{money(subtotal)}</strong> {cantNum > 0 && l.key && <>· queda {num(Math.max(0, stock - cantNum))}</>}</small>}
              </div>
            </div>
            {/* Costo unitario editable: si se cambia, se usa en la salida y se
                actualiza el costo del producto en el inventario. */}
            {l.key && (
              <div className="form-row" style={{ marginBottom: 0, marginTop: '.5rem', maxWidth: 260 }}>
                <label>Costo unitario $</label>
                <input className="input mono" type="number" min={0} step="any"
                  title="Costo unitario. Si lo cambiás, se usa en esta salida y se actualiza el costo del producto en el inventario."
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
        <button type="button" className="btn btn-sm btn-ghost" onClick={addLinea} disabled={!opciones.length} style={{ marginBottom: '.6rem' }}>
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

        {/* Consumo interno: el material se queda en la empresa (no sale a un tercero). */}
        <div className="form-row" style={{ marginTop: '.25rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={consumoInterno} onChange={(e) => setConsumoInterno(e.target.checked)} />
            Consumo interno
          </label>
          <small className="muted">Se marca en el detalle y en la trazabilidad. El destino queda como “CONSUMO INTERNO”.</small>
        </div>

        {/* Transporte y direcciones (formato de salida en tránsito) */}
        {!consumoInterno && <TransporteFields value={transporte} onChange={setTransporte} actor={actor} />}

        <div className="card" style={{ padding: '.6rem .85rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-1)', margin: '.6rem 0 0', display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: '.85rem' }}>{lineas.length} material(es)</span>
          <span className="mono" style={{ fontSize: '.9rem', fontWeight: 700 }}>Total: {money(total)}</span>
        </div>
      </form>
    </Modal>
  );
}
