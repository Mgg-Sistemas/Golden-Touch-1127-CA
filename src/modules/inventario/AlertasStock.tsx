import { num } from '@/shared/lib/format';
import type { ProductoDecorado } from './restock';

interface AlertasStockProps {
  productos: ProductoDecorado[];
  onVerProducto: (id: string) => void;
}

/**
 * Cabecera con resumen de stock crítico/bajo. Visible solo si hay
 * algún producto que requiere atención.
 */
export function AlertasStock({ productos, onVerProducto }: AlertasStockProps) {
  const criticos = productos.filter((p) => p._critical && p.estado === 'activo');
  const reabastecer = productos.filter((p) => p._needsRestock && !p._critical && p.estado === 'activo');

  if (!criticos.length && !reabastecer.length) return null;

  return (
    <div
      className="card"
      style={{
        borderColor: criticos.length ? 'var(--danger)' : 'var(--warning)',
        marginBottom: '1rem',
      }}
    >
      <div className="card-title">
        <span>
          {criticos.length > 0 ? '⚠ Stock crítico' : 'Productos a reabastecer'}
        </span>
        <span className="muted mono">
          {criticos.length > 0 && <>{num(criticos.length)} crítico{criticos.length !== 1 ? 's' : ''}</>}
          {criticos.length > 0 && reabastecer.length > 0 && ' · '}
          {reabastecer.length > 0 && <>{num(reabastecer.length)} a reponer</>}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        {criticos.slice(0, 8).map((p) => (
          <button
            key={p.id}
            className="btn btn-sm btn-danger"
            onClick={() => onVerProducto(p.id)}
            title={`Stock ${num(p.stock)} < mínimo ${num(p.stock_min)}`}
          >
            {p.sku} · {num(p.stock)}/{num(p.stock_min)} {p.unidad}
          </button>
        ))}
        {reabastecer.slice(0, 8).map((p) => (
          <button
            key={p.id}
            className="btn btn-sm btn-ghost"
            onClick={() => onVerProducto(p.id)}
            title={`Stock ${num(p.stock)} ≤ umbral ${num(p._threshold)} (clase ${p._klass})`}
          >
            <span className={`badge abc-${p._klass}`} style={{ marginRight: '.35rem' }}>{p._klass}</span>
            {p.sku} · {num(p.stock)} {p.unidad}
          </button>
        ))}
        {criticos.length + reabastecer.length > 16 && (
          <span className="muted" style={{ alignSelf: 'center' }}>
            …y {num(criticos.length + reabastecer.length - 16)} más
          </span>
        )}
      </div>
    </div>
  );
}
