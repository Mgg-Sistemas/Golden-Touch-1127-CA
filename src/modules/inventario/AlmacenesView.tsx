import { EmptyState } from '@/shared/ui/EmptyState';
import { money, num } from '@/shared/lib/format';
import type { Almacen } from '@/shared/lib/types';
import type { AlmacenValor } from './almacenes.repository';

export type AlmacenLayout = 'kanban' | 'lista';

interface AlmacenesViewProps {
  almacenes: Almacen[];
  valores: Record<string, AlmacenValor>;
  layout: AlmacenLayout;
  canWrite?: boolean;
  onSelect: (nombre: string) => void;
  onConsumo: (nombre: string) => void;
  onEditar: (a: Almacen) => void;
  onEliminar: (a: Almacen) => void;
}

const EMPTY_VALOR: AlmacenValor = { valor: 0, items: 0, unidades: 0 };

export function AlmacenesView({ almacenes, valores, layout, canWrite = true, onSelect, onConsumo, onEditar, onEliminar }: AlmacenesViewProps) {
  if (!almacenes.length) {
    return (
      <div className="card">
        <EmptyState message="No hay almacenes. Creá el primero con “+ Agregar almacén”." icon="▣" />
      </div>
    );
  }

  if (layout === 'lista') {
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Almacén</th>
              <th>Ubicación</th>
              <th style={{ textAlign: 'right' }}>Productos</th>
              <th style={{ textAlign: 'right' }}>Unidades</th>
              <th style={{ textAlign: 'right' }}>Valor total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {almacenes.map((a) => {
              const v = valores[a.nombre] ?? EMPTY_VALOR;
              return (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(a.nombre)}>
                  <td><strong>{a.nombre}</strong></td>
                  <td className="muted">{a.ubicacion || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(v.items)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{num(v.unidades)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--primary-3)', fontWeight: 600 }}>{money(v.valor)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" onClick={() => onSelect(a.nombre)} title="Ver detalle">Ver</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => onConsumo(a.nombre)} title="Gráfica de consumo por producto">📊 Consumo</button>
                    {canWrite && (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => onEditar(a)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => onEliminar(a)} title="Eliminar almacén">✕</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Kanban: tarjetas
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '.85rem',
      }}
    >
      {almacenes.map((a) => {
        const v = valores[a.nombre] ?? EMPTY_VALOR;
        return (
          <div
            key={a.id}
            className="card"
            style={{ margin: 0, padding: '1rem', cursor: 'pointer', borderTop: '3px solid var(--primary)' }}
            onClick={() => onSelect(a.nombre)}
            title="Ver detalle del almacén"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>▣ {a.nombre}</div>
                <div className="muted" style={{ fontSize: '.75rem' }}>{a.ubicacion || 'Sin ubicación'}</div>
              </div>
              <div className="actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-sm btn-ghost" onClick={() => onConsumo(a.nombre)} title="Gráfica de consumo por producto">📊</button>
                {canWrite && (
                  <>
                    <button className="btn btn-sm btn-ghost" onClick={() => onEditar(a)} title="Editar">✎</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onEliminar(a)} title="Eliminar">✕</button>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: '.75rem' }}>
              <div className="muted" style={{ fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>Valor total</div>
              <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-3)' }}>{money(v.valor)}</div>
            </div>

            <div className="muted" style={{ fontSize: '.78rem', marginTop: '.4rem' }}>
              {num(v.items)} producto{v.items !== 1 ? 's' : ''} · {num(v.unidades)} und.
            </div>
          </div>
        );
      })}
    </div>
  );
}
