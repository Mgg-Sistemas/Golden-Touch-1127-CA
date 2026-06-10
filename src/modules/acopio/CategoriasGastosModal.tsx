import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { ClasificacionAcopio } from '@/shared/lib/types';
import { listClasificacionesAll, addClasificacion, updateClasificacion, setClasificacionActivo } from './caja.repository';

/**
 * Categorías de GASTOS del Centro de Acopio (grupo `gastos_caja` de las
 * clasificaciones). Permite agregar, editar (renombrar) y activar/desactivar.
 */
export function CategoriasGastosModal({ canWrite, onClose }: { canWrite: boolean; onClose: () => void }) {
  const [items, setItems] = useState<ClasificacionAcopio[]>([]);
  const [loading, setLoading] = useState(true);
  const [valor, setValor] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [filtro, setFiltro] = useState('');

  const recargar = useCallback(async () => {
    setLoading(true);
    try { setItems(await listClasificacionesAll('gastos_caja')); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['acopio_clasificaciones'], () => { void recargar(); });

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return items.filter((i) => !q || i.valor.toLowerCase().includes(q));
  }, [items, filtro]);

  async function agregar() {
    if (!valor.trim()) { toast('Indicá la categoría', 'error'); return; }
    setBusy(true);
    try { await addClasificacion('gastos_caja', valor); setValor(''); await recargar(); toast('Categoría agregada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function guardarEdicion(id: string) {
    try { await updateClasificacion(id, editValor); setEditId(null); await recargar(); toast('Categoría actualizada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo editar', 'error'); }
  }
  async function toggle(id: string, activo: boolean) {
    try { await setClasificacionActivo(id, !activo); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  return (
    <Modal title="GASTOS" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Categorías de gastos del Centro de Acopio. Agregá, editá o activá/desactivá según necesites.</p>

      {canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
          <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Nueva categoría de gasto…"
            onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => void agregar()} disabled={busy}>+ Agregar</button>
        </div>
      )}

      <input className="input" placeholder="🔍 Filtrar categorías…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ marginBottom: '.5rem' }} />

      {loading ? <EmptyState message="Cargando…" icon="◔" /> : !items.length ? (
        <EmptyState message="Sin categorías de gasto." icon="🏷" />
      ) : (
        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead><tr><th style={{ width: 50 }}>#</th><th>Categoría</th><th style={{ width: 110 }}>Estado</th>{canWrite && <th style={{ width: 220 }}></th>}</tr></thead>
            <tbody>
              {!lista.length && <tr><td colSpan={canWrite ? 4 : 3} className="muted" style={{ textAlign: 'center' }}>Ninguna coincide con el filtro.</td></tr>}
              {lista.map((c) => (
                <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                  <td className="mono muted">{c.orden}</td>
                  <td>
                    {editId === c.id ? (
                      <input className="input" value={editValor} autoFocus onChange={(e) => setEditValor(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(c.id); if (e.key === 'Escape') setEditId(null); }} />
                    ) : (<strong>{c.valor}</strong>)}
                  </td>
                  <td>{c.activo ? <span style={{ color: 'var(--success, #45c08a)' }}>● Activa</span> : <span className="muted">○ Inactiva</span>}</td>
                  {canWrite && (
                    <td className="actions">
                      {editId === c.id ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(c.id)}>Guardar</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-ghost" onClick={() => { setEditId(c.id); setEditValor(c.valor); }}>✎ Editar</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => void toggle(c.id, c.activo)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
