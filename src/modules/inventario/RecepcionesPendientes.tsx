import { useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { Modal } from '@/shared/ui/Modal';
import { date, dateTime, money, num } from '@/shared/lib/format';
import type { ItemOrden, Orden } from '@/shared/lib/types';

interface RecepcionesPendientesProps {
  ordenes: Orden[];
}

/** Marca/modelo ofertado de un ítem (para mostrarlo en el detalle). */
function ficha(it: ItemOrden): string {
  return [it.marca, it.modelo].map((v) => (v ?? '').toString().trim()).filter(Boolean).join(' · ');
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
 * Tarjetas con las órdenes finalizadas (cerradas). Al hacer click en una se abre
 * el detalle con sus ítems (cantidad y precio).
 */
export function RecepcionesPendientes({ ordenes }: RecepcionesPendientesProps) {
  const [detalle, setDetalle] = useState<Orden | null>(null);

  return (
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

      {detalle && <DetalleRecepcionModal orden={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
}
