import { useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date, dateTime, money, num } from '@/shared/lib/format';
import type { Almacen, ItemOrden, Orden } from '@/shared/lib/types';
import { recibirOrdenParcial } from '@/modules/pedidos/pedidos.repository';
import { recepcionarCompraDirecta, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { nombreCortoAlmacen } from './almacenes.repository';

interface RecepcionesPendientesProps {
  /** Órdenes ya finalizadas (historial). */
  ordenes: Orden[];
  /** Órdenes pendientes por recepción (el almacenista debe recibirlas). */
  pendientes: Orden[];
  /** Compras directas PAGADAS pendientes de que el almacenista les dé entrada. */
  comprasPendientes: CompraDirecta[];
  /** Almacenes (con sub-almacenes) para elegir el destino de la mercancía. */
  almacenes: Almacen[];
  /** Email del usuario que recibe. */
  actor: string;
  /** Nombre del usuario que recibe (para la trazabilidad del movimiento). */
  actorName: string | null;
  /** Si el usuario puede registrar la recepción. */
  canWrite: boolean;
  /** Se llama tras recibir una orden para recargar el inventario. */
  onRecibida: () => void | Promise<void>;
}

/** Marca/modelo ofertado de un ítem (para mostrarlo en el detalle). */
function ficha(it: ItemOrden): string {
  return [it.marca, it.modelo].map((v) => (v ?? '').toString().trim()).filter(Boolean).join(' · ');
}

/** Almacenes ordenados: cada principal seguido de sus sub-almacenes. */
function almacenesOrdenados(almacenes: Almacen[]): Almacen[] {
  const principales = almacenes.filter((a) => !a.parent_id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const hijosDe = (id: string) => almacenes.filter((a) => a.parent_id === id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const out: Almacen[] = [];
  for (const p of principales) { out.push(p); out.push(...hijosDe(p.id)); }
  out.push(...almacenes.filter((a) => a.parent_id && !almacenes.some((x) => x.id === a.parent_id)));
  return out;
}

/**
 * Modal de recepción: el almacenista confirma cuánto entró por ítem y elige el
 * almacén destino. Solo lo recibido entra al inventario (vía `recibirOrdenParcial`).
 */
function RecibirOrdenModal({ orden, almacenes, actor, actorName, onClose, onSaved }: {
  orden: Orden;
  almacenes: Almacen[];
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [recs, setRecs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    orden.items.forEach((it) => { m[it.sku] = String(it.cantidad); });
    return m;
  });
  const [nota, setNota] = useState('');
  const [almacen, setAlmacen] = useState<string>(orden.almacen_destino ?? almacenesOrdenados(almacenes)[0]?.nombre ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setRec(sku: string, cantPedida: number, v: string) {
    const n = Number(v);
    if (Number.isFinite(n) && n > cantPedida) { setRecs((r) => ({ ...r, [sku]: String(cantPedida) })); return; }
    setRecs((r) => ({ ...r, [sku]: v }));
  }

  const recibidoTotal = orden.items.reduce((a, it) => a + (Number(recs[it.sku]) || 0) * Number(it.precio), 0);
  const hayDiferencia = orden.items.some((it) => (Number(recs[it.sku]) || 0) < Number(it.cantidad));

  async function handleConfirm() {
    setError(null);
    const recepciones = orden.items.map((it) => ({ sku: it.sku, cantidad_recibida: Number(recs[it.sku]) || 0 }));
    if (recepciones.every((r) => r.cantidad_recibida <= 0)) { setError('Indicá al menos una cantidad recibida.'); return; }
    if (!almacen.trim()) { setError('Elegí el almacén destino al que entra la mercancía.'); return; }
    if (hayDiferencia && !nota.trim()) { setError('Recibiste menos de lo pedido: indicá una nota explicando la diferencia.'); return; }
    setSaving(true);
    try {
      await recibirOrdenParcial(orden, recepciones, nota.trim() || null, actor, actorName, almacen.trim());
      const esContra = orden.condiciones_pago === 'contra_entrega';
      toast(
        esContra
          ? `Recepción confirmada · ${orden.codigo} · indicá el método para pagar lo recibido en Tesorería`
          : `Mercancía recibida · ${orden.codigo} · stock actualizado en ${almacen.trim()}`,
        'success',
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar la recepción');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Recibir · ${orden.oc_codigo ?? orden.codigo}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Confirmando…' : '📦 Confirmar recepción'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Confirmá cuánto entró realmente por ítem y elegí el <strong>almacén destino</strong>. Solo lo recibido se suma al inventario.
        Si llegó menos de lo pedido, dejá una <strong>nota</strong>; la orden cierra sin saldo pendiente.
      </p>
      {orden.afecta_inventario === false && (
        <div className="card" style={{ borderColor: 'var(--warning, #f59e0b)', marginBottom: '.75rem' }}>
          <small>⚠ Esta orden está marcada <strong>«no ingresa al inventario»</strong> (la mercancía ya se cargó a mano). Al confirmar, la recepción <strong>se registra pero NO aumenta el stock</strong>.</small>
        </div>
      )}
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      <div className="form-row" style={{ marginBottom: '.6rem' }}>
        <label>Almacén / sub-almacén destino *</label>
        <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} required>
          <option value="">— elegí el almacén —</option>
          {almacenesOrdenados(almacenes).map((a) => {
            const padre = a.parent_id ? almacenes.find((x) => x.id === a.parent_id) : null;
            const corto = nombreCortoAlmacen(a, almacenes);
            return (
              <option key={a.id} value={a.nombre}>
                {padre ? `   ↳ ${padre.nombre} › ${corto}` : a.nombre}
              </option>
            );
          })}
        </select>
        <small className="muted">La mercancía entra a este almacén y queda en la trazabilidad final.</small>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>SKU</th><th>Producto</th><th style={{ textAlign: 'right' }}>Pedido</th><th style={{ textAlign: 'right' }}>Recibido</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
          <tbody>
            {orden.items.map((it) => {
              const rec = Number(recs[it.sku]) || 0;
              const falta = rec < Number(it.cantidad);
              return (
                <tr key={it.sku}>
                  <td className="mono">{it.sku}</td>
                  <td>{it.nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(it.cantidad)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input className="input mono" type="number" min={0} max={it.cantidad} step="any"
                      value={recs[it.sku]} onChange={(e) => setRec(it.sku, Number(it.cantidad), e.target.value)}
                      style={{ width: 90, textAlign: 'right', borderColor: falta ? 'var(--warning)' : undefined }} />
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(rec * Number(it.precio))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total recibido</td><td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{money(recibidoTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="form-row" style={{ marginTop: '.5rem' }}>
        <label>Nota de recepción {hayDiferencia && <span style={{ color: 'var(--warning)' }}>(obligatoria · llegó menos de lo pedido)</span>}</label>
        <textarea className="input" rows={2} name="recep-nota" defaultValue={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Diferencias, faltantes, observaciones de la recepción…" />
      </div>
      {orden.condiciones_pago === 'contra_entrega' && (
        <small className="muted" style={{ display: 'block' }}>
          Contra entrega: luego se indicará el método para pagar <strong>{money(recibidoTotal)}</strong> (lo recibido) en Tesorería.
        </small>
      )}
    </Modal>
  );
}

/**
 * Modal de recepción de una COMPRA DIRECTA pagada: el almacenista ve el detalle
 * (materiales + cantidades + costo), elige el almacén/sub-almacén destino y le da
 * ENTRADA al inventario (vía `recepcionarCompraDirecta`). Las cantidades vienen fijas
 * de la compra (ya se pagaron); solo se elige el destino.
 */
export function RecibirCompraModal({ compra, almacenes, actor, actorName, onClose, onSaved }: {
  compra: CompraDirecta;
  almacenes: Almacen[];
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [almacen, setAlmacen] = useState<string>(almacenesOrdenados(almacenes)[0]?.nombre ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = Array.isArray(compra.items) ? compra.items : [];
  const totalUnidades = items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);

  async function handleConfirm() {
    setError(null);
    if (!almacen.trim()) { setError('Elegí el almacén/sub-almacén destino.'); return; }
    setSaving(true);
    try {
      await recepcionarCompraDirecta({ compra, almacen: almacen.trim(), actor, actorName });
      toast(`Materiales recibidos · ${compra.codigo ?? 'compra directa'} · stock actualizado en ${almacen.trim()}`, 'success');
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recibir la compra');
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Recibir · ${compra.codigo ?? 'Compra directa'}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Recibiendo…' : '📦 Dar entrada al inventario'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Compra directa ya <strong>pagada</strong>. Elegí el <strong>almacén / sub-almacén destino</strong> y confirmá para dar
        entrada al inventario de todos los materiales (con su costo).
      </p>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {compra.proveedor_nombre && (
        <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.5rem' }}>Proveedor: <strong>{compra.proveedor_nombre}</strong></div>
      )}

      <div className="form-row" style={{ marginBottom: '.6rem' }}>
        <label>Almacén / sub-almacén destino *</label>
        <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} required>
          <option value="">— elegí el almacén —</option>
          {almacenesOrdenados(almacenes).map((a) => {
            const padre = a.parent_id ? almacenes.find((x) => x.id === a.parent_id) : null;
            const corto = nombreCortoAlmacen(a, almacenes);
            return (
              <option key={a.id} value={a.nombre}>
                {padre ? `   ↳ ${padre.nombre} › ${corto}` : a.nombre}
              </option>
            );
          })}
        </select>
        <small className="muted">La mercancía entra a este almacén y queda en la trazabilidad final.</small>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>Material</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Costo</th></tr></thead>
          <tbody>
            {items.map((it, i) => {
              const cant = Number(it.cantidad) || 0;
              const gasto = Number(it.gasto) || 0;
              return (
                <tr key={`${it.producto_id || it.producto_nombre}-${i}`}>
                  <td>{it.producto_nombre}{it.producto_sku && <div className="muted mono" style={{ fontSize: '.72rem' }}>{it.producto_sku}</div>}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(cant)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(gasto)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>TOTAL</td>
              <td className="mono" style={{ textAlign: 'right' }}>{num(totalUnidades)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{money(Number(compra.gasto) || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

/** Modal con el detalle de una orden finalizada: ítems con cantidad y precio. */
function DetalleRecepcionModal({ orden, onClose }: { orden: Orden; onClose: () => void }) {
  const items = Array.isArray(orden.items) ? orden.items : [];
  const totalUnidades = items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);
  return (
    <Modal title={`Detalle · ${orden.codigo}`} size="lg" onClose={onClose}>
      {/* Cabecera */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem 1.5rem', alignItems: 'center', marginBottom: '.75rem' }}>
        <div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Orden</div>
          <div className="mono" style={{ fontWeight: 700 }}>{orden.codigo}{orden.oc_codigo ? ` · ${orden.oc_codigo}` : ''}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '.72rem' }}>Fecha</div>
          <div>{date(orden.created_at)}</div>
        </div>
        {orden.solicitante && (
          <div>
            <div className="muted" style={{ fontSize: '.72rem' }}>Solicita</div>
            <div>{orden.solicitante}</div>
          </div>
        )}
        {orden.recibida_en && (
          <div>
            <div className="muted" style={{ fontSize: '.72rem' }}>Recibida</div>
            <div>{dateTime(orden.recibida_en)}</div>
          </div>
        )}
        <div style={{ marginLeft: 'auto' }}><StatusBadge estado={orden.estado} /></div>
      </div>

      {/* Ítems */}
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead>
            <tr>
              <th>Producto / servicio</th>
              <th className="num">Cant.</th>
              <th className="num">Precio unit.</th>
              <th className="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={4} className="muted">Esta orden no tiene ítems detallados.</td></tr>
            ) : items.map((it, i) => {
              const cant = Number(it.cantidad) || 0;
              const precio = Number(it.precio) || 0;
              const f = ficha(it);
              return (
                <tr key={`${it.sku || it.nombre}-${i}`}>
                  <td>
                    {it.nombre}
                    {it.sku && <div className="muted mono" style={{ fontSize: '.72rem' }}>{it.sku}</div>}
                    {f && <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--brand, #ff8a00)' }}>🏷 {f}</div>}
                  </td>
                  <td className="num mono">{num(cant)}{it.unidad ? ` ${it.unidad}` : ''}</td>
                  <td className="num mono">{money(precio)}</td>
                  <td className="num mono">{money(cant * precio)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td className="num">TOTAL</td>
              <td className="num mono">{num(totalUnidades)}</td>
              <td></td>
              <td className="num mono">{money(orden.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

/**
 * Módulo de Recepciones del inventario:
 *  · Arriba, las órdenes PENDIENTES por recepción — el almacenista las recibe
 *    eligiendo el almacén destino (botón «Recibir»).
 *  · Abajo, el historial de órdenes ya finalizadas (click → detalle).
 */
export function RecepcionesPendientes({
  ordenes, pendientes, comprasPendientes, almacenes, actor, actorName, canWrite, onRecibida,
}: RecepcionesPendientesProps) {
  const [detalle, setDetalle] = useState<Orden | null>(null);
  const [recibir, setRecibir] = useState<Orden | null>(null);
  const [recibirCompra, setRecibirCompra] = useState<CompraDirecta | null>(null);

  return (
    <>
      {/* ─── Compras directas pagadas por recibir ─── */}
      {comprasPendientes.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>Compras directas por recibir</span>
            <span className="muted mono">{num(comprasPendientes.length)} compra{comprasPendientes.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '.75rem' }}>
            {comprasPendientes.map((c) => {
              const items = Array.isArray(c.items) ? c.items : [];
              const totalUnidades = items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0);
              return (
                <div key={c.id} className="card" style={{ margin: 0, padding: '.85rem', borderColor: 'var(--warning, #f59e0b)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
                    <div>
                      <div className="mono" style={{ fontWeight: 700 }}>{c.codigo ?? 'Compra directa'}</div>
                      <div className="muted" style={{ fontSize: '.75rem' }}>{date(c.pagada_at ?? c.created_at)}</div>
                    </div>
                    <span className="badge success">Pagada</span>
                  </div>
                  <div style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
                    <div>{num(items.length)} material{items.length !== 1 ? 'es' : ''} · {num(totalUnidades)} und.</div>
                    <div className="mono" style={{ color: 'var(--primary-3)', fontWeight: 600 }}>{money(Number(c.gasto) || 0)}</div>
                  </div>
                  {c.proveedor_nombre && (
                    <div className="muted" style={{ fontSize: '.72rem', marginTop: '.35rem' }}>Proveedor: {c.proveedor_nombre}</div>
                  )}
                  <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem' }}>
                    {canWrite && (
                      <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setRecibirCompra(c)} title="Ver el detalle y dar entrada al inventario eligiendo el almacén">
                        📦 Recibir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Pendientes por recepción ─── */}
      <div className="card">
        <div className="card-title">
          <span>Pendientes por recepción</span>
          <span className="muted mono">{num(pendientes.length)} órden{pendientes.length !== 1 ? 'es' : ''}</span>
        </div>

        {!pendientes.length ? (
          <EmptyState message="No hay órdenes pendientes por recibir." icon="📦" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '.75rem' }}>
            {pendientes.map((o) => {
              const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
              const totalUnidades = Array.isArray(o.items)
                ? o.items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0)
                : 0;
              return (
                <div key={o.id} className="card" style={{ margin: 0, padding: '.85rem', borderColor: 'var(--primary-3, #2563eb)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
                    <div>
                      <div className="mono" style={{ fontWeight: 700 }}>{o.oc_codigo ?? o.codigo}</div>
                      <div className="muted" style={{ fontSize: '.75rem' }}>{date(o.created_at)}</div>
                    </div>
                    <StatusBadge estado={o.estado} />
                  </div>

                  <div style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
                    <div>{num(itemsCount)} ítem{itemsCount !== 1 ? 's' : ''} · {num(totalUnidades)} und.</div>
                    <div className="mono" style={{ color: 'var(--primary-3)', fontWeight: 600 }}>{money(o.total)}</div>
                  </div>

                  {o.solicitante && (
                    <div className="muted" style={{ fontSize: '.72rem', marginTop: '.35rem' }}>Solicita: {o.solicitante}</div>
                  )}
                  {o.almacen_destino && (
                    <div className="muted" style={{ fontSize: '.72rem', marginTop: '.2rem' }}>Destino sugerido: {o.almacen_destino}</div>
                  )}

                  <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetalle(o)} title="Ver el detalle de la orden">
                      👁 Detalle
                    </button>
                    {canWrite && (
                      <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setRecibir(o)} title="Recibir esta orden y elegir el almacén destino">
                        📦 Recibir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Historial (finalizadas) ─── */}
      <div className="card">
        <div className="card-title">
          <span>Recepciones (finalizadas)</span>
          <span className="muted mono">{num(ordenes.length)} órdenes</span>
        </div>

        {!ordenes.length ? (
          <EmptyState message="No hay órdenes finalizadas todavía." icon="✓" />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '.75rem',
            }}
          >
            {ordenes.map((o) => {
              const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
              const totalUnidades = Array.isArray(o.items)
                ? o.items.reduce((a, it) => a + (Number(it.cantidad) || 0), 0)
                : 0;

              return (
                <button
                  key={o.id}
                  type="button"
                  className="card"
                  onClick={() => setDetalle(o)}
                  title="Ver el detalle de la orden"
                  style={{ margin: 0, padding: '.85rem', textAlign: 'left', cursor: 'pointer', width: '100%', background: 'var(--surface, transparent)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
                    <div>
                      <div className="mono" style={{ fontWeight: 700 }}>{o.codigo}</div>
                      <div className="muted" style={{ fontSize: '.75rem' }}>
                        {date(o.created_at)}
                      </div>
                    </div>
                    <StatusBadge estado={o.estado} />
                  </div>

                  <div style={{ marginTop: '.5rem', fontSize: '.82rem' }}>
                    <div>{num(itemsCount)} ítem{itemsCount !== 1 ? 's' : ''} · {num(totalUnidades)} und.</div>
                    <div className="mono" style={{ color: 'var(--primary-3)', fontWeight: 600 }}>
                      {money(o.total)}
                    </div>
                  </div>

                  {o.solicitante && (
                    <div className="muted" style={{ fontSize: '.72rem', marginTop: '.35rem' }}>
                      Solicita: {o.solicitante}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: '.7rem', marginTop: '.4rem', color: 'var(--brand, #ff8a00)' }}>
                    👁 Ver detalle
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {detalle && <DetalleRecepcionModal orden={detalle} onClose={() => setDetalle(null)} />}
      {recibir && (
        <RecibirOrdenModal
          orden={recibir}
          almacenes={almacenes}
          actor={actor}
          actorName={actorName}
          onClose={() => setRecibir(null)}
          onSaved={onRecibida}
        />
      )}
      {recibirCompra && (
        <RecibirCompraModal
          compra={recibirCompra}
          almacenes={almacenes}
          actor={actor}
          actorName={actorName}
          onClose={() => setRecibirCompra(null)}
          onSaved={onRecibida}
        />
      )}
    </>
  );
}
