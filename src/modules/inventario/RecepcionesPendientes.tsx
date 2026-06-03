import { EmptyState } from '@/shared/ui/EmptyState';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { date, money, num } from '@/shared/lib/format';
import type { Orden } from '@/shared/lib/types';

interface RecepcionesPendientesProps {
  ordenes: Orden[];
}

/**
 * Tarjetas con las órdenes finalizadas (cerradas). Solo visualización.
 */
export function RecepcionesPendientes({ ordenes }: RecepcionesPendientesProps) {
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
              <div
                key={o.id}
                className="card"
                style={{ margin: 0, padding: '.85rem' }}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
