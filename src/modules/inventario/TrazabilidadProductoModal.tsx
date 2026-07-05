/* ============================================================
   Golden Touch · Inventario · Modal TRAZABILIDAD DE PRODUCTO
   Se abre desde el Resumen de inventario al tocar una fila.
   Muestra: ficha del producto, existencias por almacén y la
   historia completa de movimientos (con actor, destino,
   referencia y stock antes/después). Exporta a PDF.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money, num, dateTime } from '@/shared/lib/format';
import {
  cargarTrazabilidadProducto,
  descargarTrazabilidadPdf,
  TIPO_MOV_LABEL,
  TIPO_MOV_COLOR,
  type TrazabilidadProducto,
} from './trazabilidadProducto';
import type { TipoMovimiento } from '@/shared/lib/types';

export function TrazabilidadProductoModal({ productoId, onClose }: { productoId: string; onClose: () => void }) {
  const [data, setData] = useState<TrazabilidadProducto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    cargarTrazabilidadProducto(productoId)
      .then((d) => { if (!cancel) setData(d); })
      .catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar la trazabilidad', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [productoId]);

  async function exportar() {
    if (!data) return;
    setBusy(true);
    try { await descargarTrazabilidadPdf(data); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
    finally { setBusy(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-primary" disabled={busy || !data} onClick={() => void exportar()}>↓ PDF trazabilidad</button>
    </>
  );

  return (
    <Modal
      title={`🔎 Trazabilidad${data ? ` · ${data.producto.sku}` : ''}`}
      size="xl"
      onClose={onClose}
      footer={footer}
    >
      {loading || !data ? (
        <div className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>Cargando trazabilidad…</div>
      ) : (
        <>
          {/* Ficha del producto */}
          <div className="card" style={{ padding: '.7rem .85rem', marginBottom: '.75rem', borderLeft: '3px solid var(--brand, #ff8a00)' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{data.producto.nombre}</div>
            <div className="muted" style={{ fontSize: '.8rem', marginTop: '.15rem' }}>
              <span className="mono">{data.producto.sku}</span> · {data.producto.categoria || 'Sin categoría'} · Unidad: {data.producto.unidad || '—'} · Precio ref: {money(data.producto.precio)}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem', marginBottom: '1rem' }}>
            <MiniKpi titulo="Stock actual" valor={`${num(data.stockTotal)} ${data.producto.unidad || ''}`} color="var(--brand, #ff8a00)" />
            <MiniKpi titulo="Valor actual" valor={money(data.valorActual)} color="#10b981" />
            <MiniKpi titulo="Total entró" valor={num(data.totalEntradas)} color="#10b981" />
            <MiniKpi titulo="Total salió" valor={num(data.totalSalidas)} color="#ef4444" />
            <MiniKpi titulo="Movimientos" valor={num(data.movimientos.length)} color="#3b82f6" />
          </div>

          {/* Existencias por almacén */}
          <div className="card" style={{ padding: '.6rem', marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Existencia actual por almacén</span></div>
            <div className="table-wrap" style={{ maxHeight: 180, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead>
                  <tr><th>Almacén</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Costo prom.</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
                </thead>
                <tbody>
                  {data.existencias.map((e) => (
                    <tr key={e.almacen}>
                      <td>{e.almacen}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{num(e.stock)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(e.costoPromedio)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{money(e.valor)}</td>
                    </tr>
                  ))}
                  {!data.existencias.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '.85rem' }}>Sin existencia actual (stock 0).</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historia de movimientos */}
          <div className="card" style={{ padding: '.6rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Historia de movimientos · {data.movimientos.length}</span></div>
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '.76rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Movimiento</th>
                    <th>Almacén</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>Stock → </th>
                    <th>Responsable</th>
                    <th>Destino / solicitante</th>
                    <th>Referencia</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movimientos.map((m) => (
                    <tr key={m.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dateTime(m.at)}</td>
                      <td>
                        <span className="badge" style={{ background: TIPO_MOV_COLOR[m.tipo as TipoMovimiento] ?? '#64748b', color: '#fff', whiteSpace: 'nowrap' }}>
                          {TIPO_MOV_LABEL[m.tipo as TipoMovimiento] ?? m.tipo}
                        </span>
                      </td>
                      <td>{m.almacen}</td>
                      <td className="mono" style={{ textAlign: 'right', color: m.delta > 0 ? '#10b981' : m.delta < 0 ? '#ef4444' : undefined, fontWeight: 700 }}>
                        {m.delta > 0 ? '+' : ''}{num(m.delta)}
                      </td>
                      <td className="mono muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{num(m.stockAntes)} → {num(m.stockDespues)}</td>
                      <td>{m.actor || '—'}</td>
                      <td className="muted">{m.destino || m.solicitante || '—'}</td>
                      <td className="mono muted">{m.ref || '—'}</td>
                      <td className="muted">{m.detalle || '—'}</td>
                    </tr>
                  ))}
                  {!data.movimientos.length && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Este producto todavía no tiene movimientos registrados.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function MiniKpi({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div className="card" style={{ padding: '.6rem .75rem', borderLeft: `3px solid ${color}` }}>
      <div className="muted" style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{valor}</div>
    </div>
  );
}
