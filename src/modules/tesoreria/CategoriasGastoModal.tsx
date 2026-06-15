/* ============================================================
   Golden Touch · Tesorería · Catálogo de Categorías de gasto
   Administra el catálogo jerárquico (categoría → subcategoría):
   agregar, renombrar, activar/desactivar. Buscable. Lo que se
   agrega queda disponible para el registro de gasto.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  listCategoriasGasto, soloCategorias, subcategoriasDe, ensureCategoriaGasto,
  renombrarCategoriaGasto, setActivoCategoriaGasto, type CategoriaGasto,
} from './categoriasGasto.repository';

export function CategoriasGastoModal({ canWrite, actor, onClose }: {
  canWrite: boolean; actor: string; onClose: () => void;
}) {
  const [rows, setRows] = useState<CategoriaGasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaSub, setNuevaSub] = useState('');
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setRows(await listCategoriasGasto(false)); } // false: incluye inactivas para gestionarlas
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['categorias_gasto'], () => { void cargar(); });

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cats = useMemo(() => {
    const q = norm(filtro.trim());
    return soloCategorias(rows).filter((c) => !q || norm(c.nombre).includes(q));
  }, [rows, filtro]);
  const subs = useMemo(() => (selCat ? subcategoriasDe(rows, selCat) : []), [rows, selCat]);

  async function agregarCat() {
    const n = nuevaCat.trim();
    if (!n) return;
    try { const c = await ensureCategoriaGasto(n, null, actor); setNuevaCat(''); setSelCat(c.id); await cargar(); toast('Categoría guardada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
  }
  async function agregarSub() {
    const n = nuevaSub.trim();
    if (!n || !selCat) return;
    try { await ensureCategoriaGasto(n, selCat, actor); setNuevaSub(''); await cargar(); toast('Subcategoría guardada', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
  }
  async function renombrar(c: CategoriaGasto) {
    const n = window.prompt('Nuevo nombre:', c.nombre)?.trim();
    if (!n || n === c.nombre) return;
    try { await renombrarCategoriaGasto(c.id, n); await cargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo renombrar', 'error'); }
  }
  async function toggle(c: CategoriaGasto) {
    try { await setActivoCategoriaGasto(c.id, !c.activo); await cargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  const Lista = ({ items, onAddPlaceholder, nuevo, setNuevo, onAdd, titulo }: {
    items: CategoriaGasto[]; onAddPlaceholder: string; nuevo: string; setNuevo: (v: string) => void; onAdd: () => void; titulo: string;
  }) => (
    <div className="card" style={{ margin: 0, padding: '.6rem', flex: 1, minWidth: 240 }}>
      <div className="card-title" style={{ marginBottom: '.4rem' }}><span>{titulo}</span></div>
      {canWrite && (
        <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.5rem' }}>
          <input className="input" value={nuevo} placeholder={onAddPlaceholder}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={onAdd}>+ Añadir</button>
        </div>
      )}
      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        {items.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', padding: '.3rem .45rem', borderRadius: 6,
            background: selCat === c.id && c.padre_id == null ? 'rgba(255,138,0,.12)' : 'transparent', opacity: c.activo ? 1 : 0.5, cursor: c.padre_id == null ? 'pointer' : 'default' }}
            onClick={c.padre_id == null ? () => setSelCat(c.id) : undefined}>
            <span style={{ flex: 1, fontSize: '.88rem' }}>{c.nombre}{!c.activo ? <span className="muted"> (inactiva)</span> : null}</span>
            {canWrite && <>
              <button type="button" className="btn btn-sm btn-ghost" title="Renombrar" onClick={(e) => { e.stopPropagation(); void renombrar(c); }}>✎</button>
              <button type="button" className="btn btn-sm btn-ghost" title={c.activo ? 'Desactivar' : 'Activar'} onClick={(e) => { e.stopPropagation(); void toggle(c); }}>{c.activo ? '⏸' : '▶'}</button>
            </>}
          </div>
        ))}
        {!items.length && <div className="muted" style={{ fontSize: '.82rem', padding: '.3rem' }}>{loading ? 'Cargando…' : 'Sin elementos.'}</div>}
      </div>
    </div>
  );

  return (
    <Modal title="🏷 Categorías de gasto" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <input className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="🔍 Buscar categoría…" style={{ marginBottom: '.6rem' }} />
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <Lista items={cats} titulo="Categorías" nuevo={nuevaCat} setNuevo={setNuevaCat} onAdd={() => void agregarCat()} onAddPlaceholder="Nueva categoría…" />
        <Lista
          items={subs}
          titulo={selCat ? `Subcategorías de «${soloCategorias(rows).find((c) => c.id === selCat)?.nombre ?? ''}»` : 'Subcategorías (elegí una categoría)'}
          nuevo={nuevaSub} setNuevo={setNuevaSub}
          onAdd={() => { if (!selCat) { toast('Elegí primero una categoría', 'info'); return; } void agregarSub(); }}
          onAddPlaceholder={selCat ? 'Nueva subcategoría…' : 'Elegí una categoría primero'}
        />
      </div>
      <p className="muted" style={{ fontSize: '.78rem', margin: '.6rem 0 0' }}>Click en una categoría para ver/editar sus subcategorías. Lo que agregás queda disponible al registrar un gasto.</p>
    </Modal>
  );
}
