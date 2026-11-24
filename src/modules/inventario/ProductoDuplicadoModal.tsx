/* ============================================================
   Golden Touch · «¿Es este el mismo producto?»

   Se muestra ANTES de crear un producto en Mina, Reutilizables o
   Items Dañados. Si el usuario dice que sí, NO se crea una ficha
   nueva: se le suma el stock al producto que ya existe (movimiento
   de kardex) para no partir el inventario en dos.
   ============================================================ */
import { Modal } from '@/shared/ui/Modal';
import type { ProductoParecido } from './inventario.repository';

interface Props {
  nombreNuevo: string;
  categoriaNueva: string;
  unidadNueva: string;
  cantidad: number;
  almacen: string;
  parecidos: ProductoParecido[];
  /** Sí, es este: sumar la cantidad indicada al producto existente. */
  onSumarStock: (p: ProductoParecido) => void;
  /** No, es otro: crear la ficha nueva con esa cantidad. */
  onCrearIgual: () => void;
  onClose: () => void;
  procesando?: boolean;
}

export function ProductoDuplicadoModal({
  nombreNuevo, categoriaNueva, unidadNueva, cantidad, almacen,
  parecidos, onSumarStock, onCrearIgual, onClose, procesando,
}: Props) {
  return (
    <Modal
      title="Este producto se parece a este, ¿es el mismo?"
      compact={false}
      minimizable={false}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={procesando}>
            Volver y corregir
          </button>
          <button type="button" className="btn btn-primary" onClick={onCrearIgual} disabled={procesando}>
            {procesando ? 'Creando…' : 'No · crear producto nuevo'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Vas a dar de alta <strong>«{nombreNuevo}»</strong>{' '}
        <span className="muted">({categoriaNueva} · {unidadNueva} · {cantidad} {unidadNueva} · {almacen})</span>.
        En <strong>{almacen}</strong> ya hay {parecidos.length === 1 ? 'uno' : `${parecidos.length}`} que se{' '}
        {parecidos.length === 1 ? 'parece' : 'parecen'}:
      </p>

      <div
        style={{
          background: 'rgba(245,177,51,0.12)',
          border: '1px solid rgba(245,177,51,0.35)',
          borderRadius: 8,
          padding: '.6rem .8rem',
          margin: '.8rem 0 1rem',
          fontSize: '.86rem',
        }}
      >
        Si <strong>es el mismo</strong>, toca <strong>«Sí, es este»</strong>: solo se suman{' '}
        <strong>{cantidad} {unidadNueva}</strong> al producto existente y se anota en su kardex.
        Si <strong>no es</strong>, toca <strong>«No · crear producto nuevo»</strong> y se da de alta con ese stock.
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Producto que ya existe</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th className="num">Stock</th>
              <th>Parecido</th>
              <th>¿Es el mismo?</th>
            </tr>
          </thead>
          <tbody>
            {parecidos.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                  <div className="muted" style={{ fontSize: '.75rem' }}>
                    {p.sku}{p.almacen ? ` · ${p.almacen}` : ''}
                  </div>
                </td>
                <td>{p.categoria}</td>
                <td>{p.unidad}</td>
                <td className="num mono">{p.stock}</td>
                <td>{Math.round((Number(p.parecido) || 0) * 100)}%</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => onSumarStock(p)}
                    disabled={procesando}
                  >
                    Sí, es este · sumar stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
