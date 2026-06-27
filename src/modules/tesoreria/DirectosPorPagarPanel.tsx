/* ============================================================
   Golden Touch · Tesorería · Directos por pagar
   Lista las COMPRAS DIRECTAS en estado "por pagar" (el analista
   ya montó la factura y los montos) para que Tesorería las PAGUE
   desde acá. Al pagar, sale de la caja, entra al inventario y la
   compra queda FINALIZADA. Reusa el modal de pago de Compra Directa.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { money, dateTime } from '@/shared/lib/format';
import type { Caja } from '@/shared/lib/types';
import { listComprasDirectas, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import { FinalizarCompraModal } from '@/modules/pedidos/CompraDirectaView';

export function DirectosPorPagarPanel({ cajas, actor, actorName, onPaid }: {
  cajas: Caja[]; actor: string; actorName: string | null; onPaid: () => void;
}) {
  const [compras, setCompras] = useState<CompraDirecta[]>([]);
  const [pagar, setPagar] = useState<CompraDirecta | null>(null);

  const reload = useCallback(async () => {
    const cs = await listComprasDirectas().catch(() => [] as CompraDirecta[]);
    setCompras(cs.filter((c) => c.estado === 'por_pagar'));
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['compras_directas'], () => { void reload(); });

  const total = useMemo(() => compras.reduce((a, c) => a + (c.gasto ?? 0), 0), [compras]);

  if (!compras.length) return null;

  return (
    <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>🧾 Compras directas por pagar{' '}
          <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#1a1a1a' }}>DIRECTO</span>
        </strong>
        <span className="muted mono">{compras.length} · {money(total)}</span>
      </div>
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
        El analista cargó la factura y los montos. Al pagar, el gasto sale de la caja, entra al inventario y la compra queda <strong>Finalizada</strong>.
      </div>
      <div className="table-wrap" style={{ marginTop: '.5rem' }}>
        <table className="table">
          <thead>
            <tr><th>Código</th><th>Material(es)</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.codigo ?? '—'}</td>
                <td>{c.producto_nombre}{c.items.length > 1 ? <span className="muted"> · {c.items.length} ítems</span> : null}</td>
                <td>{c.proveedor_nombre || <span className="muted">—</span>}</td>
                <td className="muted" style={{ fontSize: '.78rem' }}>{c.actor_name || c.actor || '—'}<br />{dateTime(c.updated_at)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{c.gasto != null ? money(c.gasto) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => setPagar(c)} title="Pagar y finalizar la compra">💳 Pagar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagar && (
        <FinalizarCompraModal
          modo="pagar" compra={pagar} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagar(null)}
          onSaved={async () => { setPagar(null); await reload(); onPaid(); }}
        />
      )}
    </div>
  );
}
