import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import { money, num } from '@/shared/lib/format';
import type { Existencia, Producto } from '@/shared/lib/types';
import { crearSolicitudSalida } from './salidas.repository';

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
  const almacenes = almacenesList.length ? almacenesList : ['General'];
  const activos = useMemo(() => productos.filter((p) => p.estado === 'activo'), [productos]);
  const exMap = useMemo(() => {
    const m = new Map<string, Existencia>();
    existencias.forEach((e) => m.set(`${e.producto_id}|${e.almacen}`, e));
    return m;
  }, [existencias]);

  const [productoId, setProductoId] = useState(activos[0]?.id ?? '');
  const [origen, setOrigen] = useState(almacenes[0]);
  const [destino, setDestino] = useState(almacenes.find((a) => a !== almacenes[0]) ?? almacenes[0]);
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [notaOn, setNotaOn] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [precio, setPrecio] = useState('0');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const producto = activos.find((p) => p.id === productoId) ?? null;
  const stock = Number(exMap.get(`${productoId}|${origen}`)?.stock) || 0;
  const cantNum = Number(cantidad) || 0;
  const precioNum = Number(precio) || 0;
  const excede = cantNum > stock;

  function onCantidadChange(v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n > stock) { setCantidad(String(stock)); return; }
    setCantidad(v);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productoId) { setError('Elegí el producto.'); return; }
    if (origen === destino) { setError('El almacén origen y destino deben ser distintos.'); return; }
    if (cantNum <= 0) { setError('La cantidad debe ser mayor que 0.'); return; }
    if (cantNum > stock) { setError(`No hay stock suficiente en ${origen}. Disponible: ${num(stock)}.`); return; }
    setSaving(true);
    try {
      await crearSolicitudSalida({
        scope: 'traslado', tipo: 'material',
        productoId, productoNombre: producto?.nombre ?? null, almacenOrigen: origen, almacenDestino: destino,
        cantidad: cantNum, motivo: motivo.trim() || null, precioUnit: precioNum || null,
        notaEntrega: notaOn ? (notaTexto.trim() || null) : null, fechaEntrega: fechaEntrega || null,
        solicitante: actorName || actor, actor, actorName,
      });
      notify(`Solicitud de traslado creada: ${num(cantNum)} ${producto?.unidad ?? ''} de ${producto?.nombre} · ${origen} → ${destino} · queda Por aprobar`, 'success', { link: '#/app/salidas' });
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
      <button type="submit" form="traslado-mat-form" className="btn btn-primary" disabled={saving || excede || cantNum <= 0 || stock <= 0}>
        {saving ? 'Creando…' : 'Crear solicitud'}
      </button>
    </>
  );

  return (
    <Modal title="Nueva solicitud de traslado de material" size="lg" onClose={onClose} footer={footer}>
      <form id="traslado-mat-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-row">
          <label>Producto</label>
          <select className="select" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {!activos.length && <option value="">— sin productos —</option>}
            {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.sku}</option>)}
          </select>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Almacén origen</label>
            <select className="select" value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <small className="muted">Disponible: <strong className="mono">{num(stock)} {producto?.unidad ?? ''}</strong></small>
          </div>
          <div className="form-row">
            <label>Almacén destino</label>
            <select className="select" value={destino} onChange={(e) => setDestino(e.target.value)}>
              {almacenes.filter((a) => a !== origen).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Cantidad{producto?.unidad ? ` (${producto.unidad})` : ''}</label>
            <input className="input mono" type="number" min={1} max={stock || undefined} step="any" value={cantidad} onChange={(e) => onCantidadChange(e.target.value)} required />
            {excede && <small style={{ color: 'var(--danger)' }}>Máximo disponible: {num(stock)} {producto?.unidad ?? ''}.</small>}
          </div>
          <div className="form-row">
            <label>Precio unitario (USD)</label>
            <input className="input mono" type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            <small className="muted">Total: <strong className="mono">{money(precioNum * cantNum)}</strong></small>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Motivo / detalle</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del traslado…" />
          </div>
          <div className="form-row">
            <label>Fecha de entrega</label>
            <input className="input" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            <small className="muted">Fecha en que se entregó al almacén destino.</small>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '.25rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={notaOn} onChange={(e) => setNotaOn(e.target.checked)} />
            Nota de entrega
          </label>
          {notaOn && (
            <textarea className="input" rows={2} value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribí el motivo / detalle de la nota de entrega…" style={{ marginTop: '.4rem' }} />
          )}
          {notaOn && <small className="muted">Este texto se imprime en el PDF del traslado como “Nota de entrega”.</small>}
        </div>

        <div className="card" style={{ padding: '.6rem .85rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-1)', margin: 0 }}>
          <div className="mono" style={{ fontSize: '.85rem' }}>
            {origen} ({num(stock)} → {num(Math.max(0, stock - cantNum))}) → {destino} (+{num(cantNum)}) · lleva el costo (PMP) del origen
          </div>
        </div>
      </form>
    </Modal>
  );
}
