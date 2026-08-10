import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { notify } from '@/shared/lib/notify';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import type { Existencia, Producto } from '@/shared/lib/types';
import { crearTrasladoCasiteritaExterno } from './salidas.repository';
import {
  esCasiterita, DESTINO_EXTERNO_CASITERITA_LABEL,
} from '@/modules/inventario/casiteritaInter.repository';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listActivosPedido, addCatalogoPedido } from '@/modules/pedidos/pedidoCatalogos.repository';
import { TransporteFields, transporteVacio, type TransporteSeleccion } from './TransporteFields';

// Con un único inventario ("General"), el traslado interno almacén→almacén ya no
// existe. Este formulario queda SOLO para el envío de CASITERITA al otro sistema
// (MGG): barre TODA la casiterita del inventario y la empuja por el puente.
const INVENTARIO = 'General';

// `precio` = costo unitario EDITABLE (si se deja vacío usa el PMP/costo del inventario).
interface LineaUI { id: number; productoId: string; cantidad: string; precio?: string; }

export function TrasladoMaterialForm({
  productos, existencias, actor, actorName, onClose, onSaved,
}: {
  productos: Producto[];
  existencias: Existencia[];
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
  // Stock TOTAL por producto (todo el inventario). Para el envío al otro sistema se
  // vacía TODA la casiterita del inventario.
  const totalStockMap = useMemo(() => {
    const m = new Map<string, number>();
    existencias.forEach((e) => m.set(e.producto_id, (m.get(e.producto_id) || 0) + (Number(e.stock) || 0)));
    return m;
  }, [existencias]);

  // Solo se puede enviar CASITERITA (con stock) al otro sistema.
  const productosCasiterita = useMemo(
    () => activos.filter((p) => esCasiterita(p) && (Number(totalStockMap.get(p.id)) || 0) > 0),
    [activos, totalStockMap],
  );

  // Carrito de renglones (uno o varios SKU de casiterita).
  const [lineas, setLineas] = useState<LineaUI[]>([{ id: 1, productoId: '', cantidad: '1' }]);
  const [seq, setSeq] = useState(2);

  function setLinea(id: number, patch: Partial<LineaUI>) {
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLinea() { setLineas((ls) => [...ls, { id: seq, productoId: '', cantidad: '1' }]); setSeq((s) => s + 1); }
  function quitarLinea(id: number) { setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls)); }

  const [motivo, setMotivo] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [transporte, setTransporte] = useState<TransporteSeleccion>(transporteVacio);
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

  // Datos por renglón (producto, stock total, precio PMP, subtotal). Se envía TODA la
  // casiterita del inventario, así que la cantidad es el stock total (no editable).
  const lineasCalc = lineas.map((l) => {
    const producto = activos.find((p) => p.id === l.productoId) ?? null;
    const ex = exMap.get(`${l.productoId}|${INVENTARIO}`);
    const stock = Number(totalStockMap.get(l.productoId)) || 0;
    const precioDefault = (Number(ex?.costo_promedio) || 0) || (producto?.precio ?? 0) || 0;
    const precio = l.precio !== undefined && l.precio !== '' ? (Number(l.precio) || 0) : precioDefault;
    const cantNum = Number(l.cantidad) || 0;
    return { l, producto, stock, precio, precioDefault, cantNum, subtotal: precio * cantNum };
  });
  const total = lineasCalc.reduce((a, x) => a + x.subtotal, 0);
  const hayInvalida = !productosCasiterita.length || lineasCalc.some((x) => !x.l.productoId || x.cantNum <= 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!productosCasiterita.length) { setError('No hay casiterita con stock en el inventario.'); return; }
    for (const x of lineasCalc) {
      if (!x.l.productoId) { setError('Elegí la casiterita en cada renglón.'); return; }
      if (x.cantNum <= 0) { setError('Cada renglón debe tener cantidad mayor que 0.'); return; }
    }
    const ids = lineasCalc.map((x) => x.l.productoId);
    if (new Set(ids).size !== ids.length) { setError('Hay un material repetido en dos renglones. Unilo en uno solo.'); return; }
    setSaving(true);
    try {
      const resumen = lineasCalc.length === 1
        ? `${num(lineasCalc[0].cantNum)} ${lineasCalc[0].producto?.unidad ?? ''} de ${lineasCalc[0].producto?.nombre ?? ''}`
        : `${lineasCalc.length} materiales`;
      // CASITERITA → otro sistema: pasa DIRECTO (sin aprobación), deja el registro acá.
      await crearTrasladoCasiteritaExterno({
        lineas: lineasCalc
          .filter((x) => x.producto && x.cantNum > 0)
          .map((x) => ({ producto: x.producto!, cantidad: x.cantNum, precioUnit: x.precio })),
        almacenOrigen: INVENTARIO,
        motivo: motivo.trim() || null,
        fechaEntrega: fechaEntrega || null,
        unidadSolicitante: unidadSolicitante.trim() || null,
        choferId: transporte.choferId, choferNombre: transporte.choferNombre, choferCedula: transporte.choferCedula,
        vehiculoId: transporte.vehiculoId, vehiculoDescripcion: transporte.vehiculoDescripcion, vehiculoPlaca: transporte.vehiculoPlaca,
        direccionDespacho: transporte.direccionDespacho || null,
        direccionDestino: transporte.direccionDestino || null,
        solicitante: actorName || actor, actor, actorName,
      });
      notify(`Casiterita enviada al otro sistema: ${resumen} · directo · registro creado`, 'success', { link: '#/app/salidas' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la casiterita.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="traslado-mat-form" className="btn btn-primary" disabled={saving || hayInvalida}>
        {saving ? 'Enviando…' : '🌉 Enviar al otro sistema'}
      </button>
    </>
  );

  return (
    <Modal title="Enviar casiterita al otro sistema" size="lg" onClose={onClose} footer={footer}>
      <form id="traslado-mat-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="card" style={{ padding: '.6rem .85rem', marginBottom: '.75rem', background: 'var(--bg-1)', borderLeft: '3px solid var(--brand, #ff8a00)' }}>
          <div className="muted" style={{ fontSize: '.82rem' }}>
            Solo <strong>CASITERITA</strong>. Se envía <strong>TODA la del Inventario General → el stock queda en 0</strong>.
            Va directo al otro sistema ({DESTINO_EXTERNO_CASITERITA_LABEL}), sin aprobación, y queda el registro acá.
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

        {/* ── Carrito de casiterita ── */}
        <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.4rem 0 .35rem' }}>
          Casiterita a enviar
        </label>
        {lineasCalc.map(({ l, producto, stock, precioDefault, cantNum, subtotal }, idx) => (
          <div key={l.id} className="card" style={{ margin: '0 0 .5rem', padding: '.6rem .7rem', background: 'var(--bg-1)' }}>
            <div className="form-grid">
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Material #{idx + 1}</label>
                <SearchSelect value={l.productoId} onChange={(v) => {
                    // Se trae de una vez toda la casiterita existente en el inventario.
                    const stockV = Number(totalStockMap.get(v)) || 0;
                    setLinea(l.id, { productoId: v, precio: undefined, ...(stockV > 0 ? { cantidad: String(stockV) } : {}) });
                  }} disabled={!productosCasiterita.length}
                  placeholder={productosCasiterita.length ? '🔍 Buscar casiterita…' : '— no hay casiterita con stock —'}
                  options={productosCasiterita.map((p) => ({ value: p.id, label: `${p.nombre} · ${p.sku}` }))} />
                <small className="muted">Disponible (Inventario General): <strong className="mono">{num(stock)} {producto?.unidad ?? ''}</strong> · PMP <strong className="mono">{money(precioDefault)}</strong></small>
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label>Cantidad{producto?.unidad ? ` (${producto.unidad})` : ''}</label>
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start' }}>
                  <input className="input mono" type="number" min={0} max={stock || undefined} step="any" style={{ flex: 1, minWidth: 0 }}
                    value={l.cantidad}
                    disabled
                    title="Se envía TODA la casiterita del Inventario General."
                    onChange={(e) => setLinea(l.id, { cantidad: e.target.value })} required />
                  {lineas.length > 1 && (
                    <button type="button" className="btn btn-ghost" title="Quitar material" onClick={() => quitarLinea(l.id)}>✕</button>
                  )}
                </div>
                <small className="muted">Subtotal: <strong className="mono">{money(subtotal)}</strong> {cantNum > 0 && <>· el inventario de casiterita queda en <strong>0</strong></>}</small>
              </div>
            </div>
            {/* Costo unitario editable (se usa para valorar el registro de la salida). */}
            {l.productoId && (
              <div className="form-row" style={{ marginBottom: 0, marginTop: '.5rem', maxWidth: 260 }}>
                <label>Costo unitario $</label>
                <input className="input mono" type="number" min={0} step="any"
                  title="Costo unitario del envío."
                  value={l.precio !== undefined ? l.precio : String(precioDefault)}
                  onChange={(e) => setLinea(l.id, { precio: e.target.value })} />
                <small className="muted">Sugerido (inventario): <strong className="mono">{money(precioDefault)}</strong></small>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={addLinea} disabled={!productosCasiterita.length} style={{ marginBottom: '.6rem' }}>
          ＋ Agregar material
        </button>

        <div className="form-grid">
          <div className="form-row">
            <label>Motivo / detalle</label>
            <input className="input" name="tm-motivo" defaultValue={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del envío…" />
          </div>
          <div className="form-row">
            <label>Fecha de entrega</label>
            <input className="input" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            <small className="muted">Fecha del envío al otro sistema.</small>
          </div>
        </div>

        {/* Transporte y direcciones (formato de salida en tránsito) */}
        <TransporteFields value={transporte} onChange={setTransporte} actor={actor} />

        <div className="card" style={{ padding: '.6rem .85rem', borderLeft: '3px solid var(--primary)', background: 'var(--bg-1)', margin: '.6rem 0 0', display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: '.85rem' }}>{lineas.length} material(es) · Inventario General → {DESTINO_EXTERNO_CASITERITA_LABEL}</span>
          <span className="mono" style={{ fontSize: '.9rem', fontWeight: 700 }}>Total: {money(total)}</span>
        </div>
      </form>
    </Modal>
  );
}
