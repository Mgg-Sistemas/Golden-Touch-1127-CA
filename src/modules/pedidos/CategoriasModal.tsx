import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  listCatalogosPedido, addCatalogoPedido, updateCatalogoPedido,
  setCatalogoPedidoActivo, eliminarCatalogoPedido,
  type CatalogoPedido, type TipoCatalogoPedido,
} from './pedidoCatalogos.repository';
import {
  listServiciosCatalogo, addServicioCatalogo, updateServicioCatalogo,
  setServicioActivo, eliminarServicioCatalogo,
  CATEGORIAS_SERVICIO, type ServicioCatalogo,
} from './servicios.repository';

type Tab = TipoCatalogoPedido | 'servicio';

const TABS: { key: Tab; label: string; singular: string }[] = [
  { key: 'unidad_solicitante', label: 'Unidades solicitantes', singular: 'unidad solicitante' },
  { key: 'servicio', label: 'Servicios', singular: 'servicio' },
];

/**
 * Catálogo gestionable de la OP: unidades solicitantes + catálogo de SERVICIOS
 * (recargas, mantenimientos…) usados en la Solicitud de Servicio (SS → CS).
 * Mismo patrón: pestañas, agregar, filtrar, editar y activar/desactivar.
 */
export function CategoriasModal({ canWrite, onClose }: { canWrite: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('unidad_solicitante');
  const [items, setItems] = useState<CatalogoPedido[]>([]);
  const [servicios, setServicios] = useState<ServicioCatalogo[]>([]);
  const [valor, setValor] = useState('');
  const [filtro, setFiltro] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [borrarId, setBorrarId] = useState<string | null>(null);
  // Servicios: categoría al agregar.
  const [servCat, setServCat] = useState<string>(CATEGORIAS_SERVICIO[0]);
  const valorRef = useRef<HTMLInputElement>(null);

  const tabActual = TABS.find((t) => t.key === tab)!;
  const esUnidad = tab === 'unidad_solicitante';
  const esServicio = tab === 'servicio';
  const recargar = useCallback(async () => {
    setItems(await listCatalogosPedido());
    setServicios(await listServiciosCatalogo());
  }, []);
  useEffect(() => { recargar().catch(() => {}); }, [recargar]);
  useRealtime(['pedido_catalogos', 'servicios_catalogo'], () => { void recargar(); });

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return items.filter((i) => i.tipo === tab && (!q || i.valor.toLowerCase().includes(q) || (i.categoria ?? '').toLowerCase().includes(q)));
  }, [items, tab, filtro]);

  const listaServicios = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return servicios.filter((s) => !q || s.nombre.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q));
  }, [servicios, filtro]);

  // Clasificaciones ACTIVAS → opciones de categoría para las unidades solicitantes.
  const clasifActivas = useMemo(
    () => items.filter((i) => i.tipo === 'clasificacion' && i.activo).map((i) => i.valor),
    [items],
  );
  // Categorías de servicio: las base + cualquiera ya guardada en el catálogo.
  const categoriasServicio = useMemo(
    () => Array.from(new Set([...CATEGORIAS_SERVICIO, ...servicios.map((s) => s.categoria)])),
    [servicios],
  );

  async function agregar() {
    if (!valor.trim()) { toast(`Indicá la ${tabActual.singular}`, 'error'); return; }
    setBusy(true);
    try {
      if (esServicio) await addServicioCatalogo(servCat, valor.trim());
      else await addCatalogoPedido(tab as TipoCatalogoPedido, valor.trim().toUpperCase());
      setValor(''); if (valorRef.current) valorRef.current.value = '';
      await recargar(); toast('Agregado', 'success');
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function guardarEdicion(id: string) {
    try {
      if (esServicio) await updateServicioCatalogo(id, editValor.trim(), editCategoria.trim() || undefined);
      else await updateCatalogoPedido(id, editValor.trim().toUpperCase(), esUnidad ? editCategoria.trim() || null : undefined);
      setEditId(null); await recargar(); toast('Actualizado', 'success');
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo editar', 'error'); }
  }
  async function toggle(id: string, activo: boolean) {
    try {
      if (esServicio) await setServicioActivo(id, !activo);
      else await setCatalogoPedidoActivo(id, !activo);
      await recargar();
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function borrar(id: string) {
    try {
      if (esServicio) await eliminarServicioCatalogo(id);
      else await eliminarCatalogoPedido(id);
      await recargar(); toast('Eliminado', 'success');
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const tieneCategoria = esUnidad || esServicio;
  const colSpan = (canWrite ? 1 : 0) + (tieneCategoria ? 3 : 2);

  return (
    <Modal title="Categorías" size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => { setTab(t.key); setEditId(null); setValor(''); setFiltro(''); }}>{t.label}</button>
        ))}
      </div>

      {canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', flexWrap: 'wrap' }}>
          {esServicio && (
            <select className="select" style={{ flex: '0 0 150px' }} value={servCat} onChange={(e) => setServCat(e.target.value)}>
              {categoriasServicio.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input ref={valorRef} className="input" name="cat-nuevo-valor" style={{ flex: '1 1 160px' }} defaultValue={valor}
            onChange={(e) => { if (!esServicio) e.target.value = e.target.value.toUpperCase(); setValor(e.target.value); }}
            placeholder={`Nuevo ${tabActual.singular}…`}
            onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} />
          <button className="btn btn-primary" onClick={() => void agregar()} disabled={busy}>+ Agregar</button>
        </div>
      )}
      <input className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="🔍 Filtrar…" style={{ marginBottom: '.5rem' }} />

      <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>{esServicio ? 'Servicio' : tabActual.label}</th>{tieneCategoria && <th>Categoría</th>}<th>Estado</th>{canWrite && <th></th>}</tr></thead>
          <tbody>
            {esServicio ? (
              <>
                {!listaServicios.length && <tr><td colSpan={colSpan} className="muted" style={{ textAlign: 'center' }}>Sin servicios.</td></tr>}
                {listaServicios.map((l) => (
                  <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.5 }}>
                    <td>
                      {editId === l.id ? (
                        <input className="input" defaultValue={editValor} autoFocus onChange={(e) => setEditValor(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(l.id); if (e.key === 'Escape') setEditId(null); }} />
                      ) : l.nombre}
                    </td>
                    <td>
                      {editId === l.id ? (
                        <select className="select" value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)}>
                          {categoriasServicio.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : l.categoria}
                    </td>
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
                            <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => { setEditId(l.id); setEditValor(l.nombre); setEditCategoria(l.categoria); }}>✎</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => void toggle(l.id, l.activo)}>{l.activo ? 'Desactivar' : 'Activar'}</button>
                            <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => setBorrarId(l.id)}>🗑</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </>
            ) : (
              <>
                {!lista.length && <tr><td colSpan={colSpan} className="muted" style={{ textAlign: 'center' }}>Sin elementos.</td></tr>}
                {lista.map((l) => (
                  <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.5 }}>
                    <td>
                      {editId === l.id ? (
                        <input className="input" name="cat-edit-valor" defaultValue={editValor} autoFocus onChange={(e) => { e.target.value = e.target.value.toUpperCase(); setEditValor(e.target.value); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(l.id); if (e.key === 'Escape') setEditId(null); }} />
                      ) : l.valor}
                    </td>
                    {esUnidad && (
                      <td>
                        {editId === l.id ? (
                          <select className="select" value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)}>
                            <option value="">— categoría —</option>
                            {clasifActivas.map((c) => <option key={c} value={c}>{c}</option>)}
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
              </>
            )}
          </tbody>
        </table>
      </div>

      {borrarId && (
        <ConfirmDialog
          title="Eliminar del catálogo"
          message={`¿Eliminar este ${tabActual.singular} del catálogo?`}
          confirmText="Eliminar"
          danger
          onCancel={() => setBorrarId(null)}
          onConfirm={() => { const id = borrarId; setBorrarId(null); void borrar(id); }}
        />
      )}
    </Modal>
  );
}
