/* ============================================================
   Golden Touch · «¿No será este que ya está?»

   Se muestra JUSTO ANTES de crear un producto nuevo, cuando el inventario ya
   tiene algo parecido. No bloquea: propone.

   Por qué existe: la unicidad por nombre solo frena el nombre idéntico, y los
   duplicados reales nunca son idénticos. «FILTRO HIDRAULICO RETORNO» y
   «FILTRO HIDRÁULICO DE RETORNO 14509379» son el mismo repuesto escrito por
   dos personas distintas, y hasta ahora el sistema dejaba crear los dos.

   Las dos salidas son deliberadas y están al mismo nivel:
     · «Usar este» — el camino correcto en la mayoría de los casos: se agrega a
       la solicitud el producto que YA existe, con su stock y su historial.
     · «Crear igual» — porque a veces es de verdad otro producto, y el sistema
       no puede saberlo mejor que quien lo está pidiendo.
   ============================================================ */
import { Modal } from '@/shared/ui/Modal';
import type { ProductoParecido } from './inventario.repository';

interface Props {
  /** Lo que el usuario escribió y está por crear. */
  nombreNuevo: string;
  categoriaNueva: string;
  unidadNueva: string;
  parecidos: ProductoParecido[];
  /** Usar uno que ya existe en vez de crear. */
  onUsarExistente: (p: ProductoParecido) => void;
  /** Crear igual: no era el mismo. */
  onCrearIgual: () => void;
  onClose: () => void;
  creando?: boolean;
}

/** Etiqueta legible del parecido. Se evita el porcentaje crudo: «87%» no le
 *  dice nada a nadie, «casi idéntico» sí. */
function etiquetaParecido(p: number): { texto: string; clase: string } {
  if (p >= 0.85) return { texto: 'Casi idéntico', clase: 'danger' };
  if (p >= 0.60) return { texto: 'Muy parecido', clase: 'warning' };
  return { texto: 'Parecido', clase: 'info' };
}

export function ProductoParecidoModal({
  nombreNuevo, categoriaNueva, unidadNueva, parecidos,
  onUsarExistente, onCrearIgual, onClose, creando,
}: Props) {
  return (
    <Modal
      title="Puede que este producto ya exista"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={creando}>
            Volver y corregir
          </button>
          <button type="button" className="btn btn-primary" onClick={onCrearIgual} disabled={creando}>
            {creando ? 'Creando…' : 'No es ninguno · crear igual'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Vas a crear <strong>«{nombreNuevo}»</strong>{' '}
        <span className="muted">({categoriaNueva} · {unidadNueva})</span>.
        En el inventario ya hay {parecidos.length === 1 ? 'uno' : `${parecidos.length}`} que se{' '}
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
        Si es el mismo, usá el que ya está: conserva su <strong>stock, su costo y su historial</strong>.
        Crear uno nuevo parte el inventario en dos y después hay que unirlos a mano.
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th className="num">Stock</th>
              <th>Parecido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {parecidos.map((p) => {
              const et = etiquetaParecido(p.parecido);
              const detalle = [p.marca, p.modelo].filter(Boolean).join(' · ');
              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                    <div className="muted" style={{ fontSize: '.75rem' }}>
                      {p.sku}{detalle ? ` · ${detalle}` : ''}
                      {p.almacen ? ` · ${p.almacen}` : ''}
                    </div>
                  </td>
                  <td>
                    {p.categoria}
                    {p.misma_categoria && (
                      <div><span className="badge info" style={{ fontSize: '.65rem' }}>misma categoría</span></div>
                    )}
                  </td>
                  <td>{p.unidad}</td>
                  <td className="num mono">{p.stock}</td>
                  <td><span className={`badge ${et.clase}`}>{et.texto}</span></td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => onUsarExistente(p)}
                      disabled={creando}
                    >
                      Usar este
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
