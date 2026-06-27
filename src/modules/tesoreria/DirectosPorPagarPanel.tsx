/* ============================================================
   Golden Touch · Tesorería · Directos por pagar
   Lista las COMPRAS y SERVICIOS DIRECTOS en estado "por pagar"
   (el analista ya montó la factura y los montos) para que Tesorería
   los PAGUE desde acá. Al pagar, sale de la caja correspondiente,
   (en compras) entra al inventario, y queda FINALIZADA. Reusa los
   modales de pago de Compra/Servicio Directo.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { money, dateTime } from '@/shared/lib/format';
import type { Caja } from '@/shared/lib/types';
import { listComprasDirectas, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { listServiciosDirectos, type ServicioDirecto } from '@/modules/pedidos/serviciosDirectos.repository';
import { FinalizarCompraModal } from '@/modules/pedidos/CompraDirectaView';
import { FinalizarServicioModal } from '@/modules/pedidos/ServicioDirectoView';

export function DirectosPorPagarPanel({ cajas, actor, actorName, onPaid }: {
  cajas: Caja[]; actor: string; actorName: string | null; onPaid: () => void;
}) {
  const [compras, setCompras] = useState<CompraDirecta[]>([]);
  const [servicios, setServicios] = useState<ServicioDirecto[]>([]);
  const [pagarC, setPagarC] = useState<CompraDirecta | null>(null);
  const [pagarS, setPagarS] = useState<ServicioDirecto | null>(null);

  const reload = useCallback(async () => {
    const [cs, ss] = await Promise.all([
      listComprasDirectas().catch(() => [] as CompraDirecta[]),
      listServiciosDirectos().catch(() => [] as ServicioDirecto[]),
    ]);
    setCompras(cs.filter((c) => c.estado === 'por_pagar'));
    setServicios(ss.filter((s) => s.estado === 'por_pagar'));
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['compras_directas', 'servicios_directos'], () => { void reload(); });

  const total = useMemo(
    () => compras.reduce((a, c) => a + (c.gasto ?? 0), 0) + servicios.reduce((a, s) => a + (s.gasto ?? 0), 0),
    [compras, servicios],
  );

  if (!compras.length && !servicios.length) return null;

  return (
    <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>🧾 Directos por pagar{' '}
          <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#1a1a1a' }}>DIRECTO</span>
        </strong>
        <span className="muted mono">{compras.length + servicios.length} · {money(total)}</span>
      </div>
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
        El analista cargó la factura y los montos. Al pagar, el gasto sale de la caja elegida (en compras, entra al inventario) y queda <strong>Finalizada</strong>.
      </div>

      {compras.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table">
            <thead><tr><th colSpan={6}>🛒 Compras</th></tr><tr><th>Código</th><th>Material(es)</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.codigo ?? '—'}</td>
                  <td>{c.producto_nombre}{c.items.length > 1 ? <span className="muted"> · {c.items.length} ítems</span> : null}</td>
                  <td>{c.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{c.actor_name || c.actor || '—'}<br />{dateTime(c.updated_at)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.gasto != null ? money(c.gasto) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => setPagarC(c)} title="Pagar y finalizar la compra">💳 Pagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {servicios.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table">
            <thead><tr><th colSpan={6}>🔧 Servicios</th></tr><tr><th>Código</th><th>Servicio(s)</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.codigo ?? '—'}</td>
                  <td>{s.descripcion}{s.items.length > 1 ? <span className="muted"> · {s.items.length} ítems</span> : null}</td>
                  <td>{s.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{s.actor_name || s.actor || '—'}<br />{dateTime(s.updated_at)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{s.gasto != null ? money(s.gasto) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => setPagarS(s)} title="Pagar y finalizar el servicio">💳 Pagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagarC && (
        <FinalizarCompraModal
          modo="pagar" compra={pagarC} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagarC(null)}
          onSaved={async () => { setPagarC(null); await reload(); onPaid(); }}
        />
      )}
      {pagarS && (
        <FinalizarServicioModal
          modo="pagar" servicio={pagarS} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagarS(null)}
          onSaved={async () => { setPagarS(null); await reload(); onPaid(); }}
        />
      )}
    </div>
  );
}
