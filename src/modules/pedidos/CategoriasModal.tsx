import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  listCatalogosPedido, addCatalogoPedido, updateCatalogoPedido,
  setCatalogoPedidoActivo, eliminarCatalogoPedido,
  type CatalogoPedido, type TipoCatalogoPedido,
} from './pedidoCatalogos.repository';

const TABS: { key: TipoCatalogoPedido; label: string; singular: string }[] = [
  { key: 'unidad_solicitante', label: 'Unidades solicitantes', singular: 'unidad solicitante' },
];

/**
 * Catálogo gestionable de la OP (clasificaciones del pedido + unidades solicitantes).
 * Mismo patrón que el Catálogo de Producción: pestañas, agregar, filtrar, editar y
 * activar/desactivar (las inactivas dejan de aparecer en el formulario de la OP).
 * Las UNIDADES SOLICITANTES llevan además una CATEGORÍA (la clasificación de la OP),
 * que se muestra y se puede editar acá.
 */
export function CategoriasModal({ canWrite, onClose }: { canWrite: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TipoCatalogoPedido>('unidad_solicitante');
  const [items, setItems] = useState<CatalogoPedido[]>([]);
  const [valor, setValor] = useState('');
  const [filtro, setFiltro] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [borrarId, setBorrarId] = useState<string | null>(null);

  const tabActual = TABS.find((t) => t.key === tab)!;
  const esUnidad = tab === 'unidad_solicitante';
  const recargar = useCallback(async () => { setItems(await listCatalogosPedido()); }, []);
  useEffect(() => { recargar().catch(() => {}); }, [recargar]);
  useRealtime(['pedido_catalogos'], () => { void recargar(); });

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return items.filter((i) => i.tipo === tab && (!q || i.valor.toLowerCase().includes(q) || (i.categoria ?? '').toLowerCase().includes(q)));
  }, [items, tab, filtro]);

  // Clasificaciones ACTIVAS → opciones de categoría para las unidades solicitantes.
  const clasifActivas = useMemo(
    () => items.filter((i) => i.tipo === 'clasificacion' && i.activo).map((i) => i.valor),
    [items],
  );

  async function agregar() {
    if (!valor.trim()) { toast(`Indicá la ${tabActual.singular}`, 'error'); return; }
    setBusy(true);
    try {
      // La categoría de la unidad solicitante se toma de la OP, no se elige al agregar acá.
      await addCatalogoPedido(tab, valor.trim().toUpperCase());
      setValor(''); await recargar(); toast('Agregado', 'success');
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function guardarEdicion(id: string) {
    try {
      await updateCatalogoPedido(id, editValor.trim().toUpperCase(), esUnidad ? editCategoria.trim() || null : undefined);
      setEditId(null); await recargar(); toast('Actualizado', 'success');
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo editar', 'error'); }
  }
  async function toggle(id: string, activo: boolean) {
    try { await setCatalogoPedidoActivo(id, !activo); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function borrar(id: string) {
    try { await eliminarCatalogoPedido(id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const colSpan = (canWrite ? 1 : 0) + (esUnidad ? 3 : 2);

  return (
    <Modal title="Categorías" size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {TABS.length > 1 && (
        <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => { setTab(t.key); setEditId(null); setValor(''); setFiltro(''); }}>{t.label}</button>
          ))}
        </div>
      )}

      {canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 160px' }} value={valor} onChange={(e) => setValor(e.target.value.toUpperCase())} placeholder={`Nueva ${tabActual.singular}…`}
            onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} />
          <button className="btn btn-primary" onClick={() => void agregar()} disabled={busy}>+ Agregar</button>
        </div>
      )}
      <input className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="🔍 Filtrar…" style={{ marginBottom: '.5rem' }} />

      <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>{tabActual.label}</th>{esUnidad && <th>Categoría</th>}<th>Estado</th>{canWrite && <th></th>}</tr></thead>
          <tbody>
            {!lista.length && <tr><td colSpan={colSpan} className="muted" style={{ textAlign: 'center' }}>Sin elementos.</td></tr>}
            {lista.map((l) => (
              <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.5 }}>
                <td>
                  {editId === l.id ? (
                    <input className="input" value={editValor} autoFocus onChange={(e) => setEditValor(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(l.id); if (e.key === 'Escape') setEditId(null); }} />
                  ) : l.valor}
                </td>
                {esUnidad && (
                  <td>
                    {editId === l.id ? (
                      <select className="select" value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)}>
                        <option value="">— categoría —</option>
                        {clasifActivas.map((c) => <option key={c} value={c}>{c}</option>)}
                        {/* Si la categoría guardada ya no está activa, la conservamos como opción. */}
                        {editCategoria && !clasifActivas.includes(editCategoria) && <option value={editCategoria}>{editCategoria}</option>}
                      </select>
                    ) : (l.categoria || <span className="muted">—</span>)}
                  </td>
                )}
                <td>{l.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                {canWrite && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editId === l.id ? (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(l.id)}>Guardar</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => { setEditId(l.id); setEditValor(l.valor); setEditCategoria(l.categoria ?? ''); }}>✎</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => void toggle(l.id, l.activo)}>{l.activo ? 'Desactivar' : 'Activar'}</button>
                        <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => setBorrarId(l.id)}>🗑</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {borrarId && (
        <ConfirmDialog
          title="Eliminar del catálogo"
          message={`¿Eliminar esta ${tabActual.singular} del catálogo?`}
          confirmText="Eliminar"
          danger
          onCancel={() => setBorrarId(null)}
          onConfirm={() => { const id = borrarId; setBorrarId(null); void borrar(id); }}
        />
      )}
    </Modal>
  );
}
