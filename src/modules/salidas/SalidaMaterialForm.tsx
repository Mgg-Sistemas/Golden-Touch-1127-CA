import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import type { Existencia, Producto } from '@/shared/lib/types';
import { crearSolicitudSalida } from './salidas.repository';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listActivosPedido, addCatalogoPedido } from '@/modules/pedidos/pedidoCatalogos.repository';

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
  const [productoId, setProductoId] = useState(productosEnAlmacen[0]?.id ?? '');
  // Al cambiar de almacén, si el producto elegido no está en ese almacén, reseteamos.
  useEffect(() => {
    if (!productosEnAlmacen.some((p) => p.id === productoId)) {
      setProductoId(productosEnAlmacen[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacen, productosEnAlmacen]);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [precio, setPrecio] = useState('0');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unidad solicitante: MISMO catálogo de OP (Pedidos). En vivo: si se agrega en
  // OP o acá, se refleja al instante en ambos lados.
  const [unidadSolicitante, setUnidadSolicitante] = useState('');
  const [unidadOpciones, setUnidadOpciones] = useState<string[]>([]);
  const [nuevaUnidad, setNuevaUnidad] = useState('');
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
      setUnidadSolicitante(v); setNuevaUnidad(''); return;
    }
    try {
      setAddingUnidad(true);
      await addCatalogoPedido('unidad_solicitante', v).catch(() => { /* ya existe / sin permiso */ });
      await cargarUnidades();
      setUnidadSolicitante(v);
      setNuevaUnidad('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error');
    } finally {
      setAddingUnidad(false);
    }
  }

  const producto = activos.find((p) => p.id === productoId) ?? null;
  const exSel = exMap.get(`${productoId}|${almacen}`);
  const stock = Number(exSel?.stock) || 0;
  const cantNum = Number(cantidad) || 0;
  const precioNum = Number(precio) || 0;
  const total = precioNum * cantNum;
  const excede = cantNum > stock;

  // No permite escribir una cantidad mayor a la disponible en el almacén:
  // la recortamos al stock al momento de cambiarla.
  function onCantidadChange(v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n > stock) { setCantidad(String(stock)); return; }
    setCantidad(v);
  }

  // Anclado al VALOR del material: el precio unitario es el COSTO (PMP) de ese
  // almacén. Ej.: caja de 10 lápices que costó 100 → 10 c/u; al sacar 1, el stock
  // restante (9) representa 90. Si el almacén no tiene PMP, cae al costo global.
  useEffect(() => {
    const costoAlmacen = Number(exSel?.costo_promedio) || 0;
    const precioInv = costoAlmacen || producto?.precio || 0;
    setPrecio(String(precioInv ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId, almacen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productoId) { setError('Elegí el producto.'); return; }
    if (cantNum <= 0) { setError('La cantidad debe ser mayor que 0.'); return; }
    if (cantNum > stock) { setError(`No hay stock suficiente en ${almacen}. Disponible: ${num(stock)}.`); return; }
    setSaving(true);
    try {
      await crearSolicitudSalida({
        scope: 'salida', tipo: 'material',
        productoId, productoNombre: producto?.nombre ?? null, almacenOrigen: almacen,
        cantidad: cantNum, destino: null, motivo: motivo.trim() || null,
        unidadSolicitante: unidadSolicitante.trim() || null,
        precioUnit: precioNum || null, fechaEntrega: fechaEntrega || null,
        solicitante: actorName || actor, actor, actorName,
      });
      notify(`Solicitud de salida creada: ${num(cantNum)} ${producto?.unidad ?? ''} de ${producto?.nombre} · queda Por aprobar`, 'success', { link: '#/app/salidas' });
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
      <button type="submit" form="salida-mat-form" className="btn btn-primary" disabled={saving || excede || cantNum <= 0 || stock <= 0}>
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
            <small className="muted">Sub-almacén de Peramanal.</small>
          </div>
        </div>

        <div className="form-row">
          <label>Unidad solicitante</label>
          {/* Mismo catálogo de OP (en vivo). */}
          <SearchSelect value={unidadSolicitante} onChange={(v) => setUnidadSolicitante(v.toUpperCase())}
            options={unidadOpciones.map((u) => ({ value: u, label: u }))}
            placeholder="Departamento / unidad que solicita" />
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
            <input className="input" value={nuevaUnidad} onChange={(e) => setNuevaUnidad(e.target.value.toUpperCase())}
              placeholder="¿No está? Escribí la unidad nueva…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarUnidadNueva(); } }} />
            <button type="button" className="btn btn-ghost" onClick={() => void agregarUnidadNueva()} disabled={addingUnidad}>
              {addingUnidad ? '…' : '+ Añadir'}
            </button>
          </div>
          <small className="muted">La unidad nueva queda guardada en el catálogo compartido con OP (Pedidos → Categorías).</small>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Producto del almacén</label>
            <SearchSelect value={productoId} onChange={setProductoId} disabled={!productosEnAlmacen.length}
              placeholder={productosEnAlmacen.length ? '🔍 Buscar producto…' : '— el almacén no tiene materiales —'}
              options={productosEnAlmacen.map((p) => ({ value: p.id, label: `${p.nombre} · ${p.sku}` }))} />
            <small className="muted">Disponible: <strong className="mono">{num(stock)} {producto?.unidad ?? ''}</strong></small>
          </div>
          <div className="form-row">
            <label>Cantidad{producto?.unidad ? ` (${producto.unidad})` : ''}</label>
            <input className="input mono" type="number" min={1} max={stock || undefined} step="any" value={cantidad} onChange={(e) => onCantidadChange(e.target.value)} required />
            {excede && <small style={{ color: 'var(--danger)' }}>Máximo disponible: {num(stock)} {producto?.unidad ?? ''}.</small>}
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Precio unitario (USD)</label>
            <input className="input mono" value={money(precioNum)} readOnly tabIndex={-1} title="Traído del inventario · no editable" />
            <small className="muted">Traído del inventario. No se modifica en la salida.</small>
          </div>
          <div className="form-row">
            <label>Precio total</label>
            <input className="input mono" value={money(total)} readOnly tabIndex={-1} />
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Motivo / detalle</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del despacho, referencia…" />
          </div>
          <div className="form-row">
            <label>Fecha de entrega</label>
            <input className="input" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            <small className="muted">Fecha en que se entregó al destino.</small>
          </div>
        </div>

        <div className="card" style={{ padding: '.6rem .85rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-1)', margin: 0 }}>
          <div className="mono" style={{ fontSize: '.85rem' }}>
            {num(stock)} → <strong>{num(Math.max(0, stock - cantNum))}</strong> {producto?.unidad ?? ''} en {almacen}
          </div>
        </div>
      </form>
    </Modal>
  );
}
