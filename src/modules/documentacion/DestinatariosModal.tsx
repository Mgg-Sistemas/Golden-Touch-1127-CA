/* ============================================================
   Golden Touch · Documentación · 📇 Catálogo de destinatarios

   Cliente / departamento y detalles de entrega que se repiten de una nota
   de envío a otra: razón social, RIF/C.I., dirección, atención a y
   condición. Se buscan, se agregan, se editan y se borran aquí; en la nota
   se eligen y rellenan los campos. Borrar uno no cambia las notas ya
   hechas (cada nota guarda su propia copia de los datos).
   ============================================================ */
import { useMemo, useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { norm } from '@/shared/lib/texto';
import {
  eliminarDestinatario, guardarDestinatario, type DestinatarioEnvio, type DestinatarioInput,
} from './documentacion.repository';

const VACIO: DestinatarioInput = { razon_social: '', rif: '', direccion: '', atencion_a: '', condicion: '' };

export function DestinatariosModal({ destinatarios, usos, canWrite, actorEmail, onClose, onChanged }: {
  destinatarios: DestinatarioEnvio[];
  /** Razón social (normalizada) → cuántas notas la usan, solo informativo. */
  usos: Map<string, number>;
  canWrite: boolean;
  actorEmail: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<{ id: string | null; d: DestinatarioInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState<DestinatarioEnvio | null>(null);

  const filas = useMemo(() => {
    const t = norm(q);
    if (!t) return destinatarios;
    return destinatarios.filter((d) => {
      const hay = norm([d.razon_social, d.rif, d.direccion, d.atencion_a, d.condicion].join(' '));
      return t.split(/\s+/).every((p) => hay.includes(p));
    });
  }, [destinatarios, q]);

  const set = (k: keyof DestinatarioInput, v: string) => setEditando((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (!editando) return;
    setError(null); setSaving(true);
    try {
      await guardarDestinatario(editando.id, editando.d, actorEmail);
      toast(editando.id ? 'Destinatario actualizado' : 'Destinatario agregado al catálogo', 'success');
      setEditando(null);
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    const d = borrar;
    setBorrar(null); setSaving(true);
    try { await eliminarDestinatario(d.id); toast(`«${d.razon_social}» borrado del catálogo`, 'success'); onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo borrar', 'error'); }
    finally { setSaving(false); }
  }

  if (editando) {
    const d = editando.d;
    return (
      <Modal title={editando.id ? `✎ Editar · ${d.razon_social}` : '📇 Agregar destinatario'} size="lg" onClose={() => !saving && setEditando(null)} footer={
        <>
          <button className="btn btn-ghost" onClick={() => { setEditando(null); setError(null); }} disabled={saving}>Volver</button>
          <button type="submit" form="dest-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      }>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <form id="dest-form" onSubmit={guardar}>
          <div className="card-title" style={{ margin: '0 0 .4rem' }}>Datos del cliente / departamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 1rem' }}>
            <div className="form-row">
              <label htmlFor="dest-razon">Razón social / departamento *</label>
              <input id="dest-razon" className="input" value={d.razon_social} onChange={(e) => set('razon_social', e.target.value)} autoFocus />
            </div>
            <div className="form-row">
              <label htmlFor="dest-rif">RIF / C.I.</label>
              <input id="dest-rif" className="input mono" value={d.rif ?? ''} onChange={(e) => set('rif', e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="dest-dir">Dirección (opcional)</label>
            <input id="dest-dir" className="input" value={d.direccion ?? ''} onChange={(e) => set('direccion', e.target.value)} />
          </div>
          <div className="card-title" style={{ margin: '.4rem 0' }}>Detalles de entrega</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 1rem' }}>
            <div className="form-row">
              <label htmlFor="dest-atencion">Atención a</label>
              <input id="dest-atencion" className="input" value={d.atencion_a ?? ''} onChange={(e) => set('atencion_a', e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="dest-condicion">Condición</label>
              <input id="dest-condicion" className="input" value={d.condicion ?? ''} onChange={(e) => set('condicion', e.target.value)} placeholder="Ej: Facturas originales, copias…" />
            </div>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal title={`📇 Destinatarios (${destinatarios.length})`} size="lg" onClose={onClose} footer={
      <>
        {canWrite && <button className="btn btn-primary" onClick={() => { setError(null); setEditando({ id: null, d: { ...VACIO } }); }}>＋ Agregar destinatario</button>}
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </>
    }>
      <input className="input" style={{ marginBottom: '.7rem' }} placeholder="🔍 Buscar por razón social, RIF, dirección, atención…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!filas.length ? (
        <EmptyState icon="📇" message={destinatarios.length ? 'Ningún destinatario coincide.' : 'Todavía no hay destinatarios. Agrégalos aquí o marca «Guardar en el catálogo» al crear una nota.'} />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead><tr><th>Cliente / departamento</th><th>Dirección</th><th>Atención a</th><th>Condición</th>{canWrite && <th />}</tr></thead>
            <tbody>
              {filas.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.razon_social}</strong>{d.rif && <div className="muted mono" style={{ fontSize: '.74rem' }}>{d.rif}</div>}</td>
                  <td>{d.direccion || '—'}</td>
                  <td>{d.atencion_a || '—'}</td>
                  <td>{d.condicion || '—'}</td>
                  {canWrite && (
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-sm btn-ghost" title="Editar" disabled={saving}
                        onClick={() => { setError(null); setEditando({ id: d.id, d: { razon_social: d.razon_social, rif: d.rif ?? '', direccion: d.direccion ?? '', atencion_a: d.atencion_a ?? '', condicion: d.condicion ?? '' } }); }}>✎</button>
                      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Borrar del catálogo" disabled={saving}
                        onClick={() => setBorrar(d)}>🗑</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {borrar && (
        <ConfirmDialog
          title="Borrar destinatario del catálogo" danger confirmText="Sí, borrar"
          message={<>Deja de ofrecerse al crear notas. <strong>Las notas ya hechas no cambian</strong>: cada una guarda sus propios datos.</>}
          preview={
            <VistaPrevia titulo="Se va a borrar">
              <Dato label="Razón social">{borrar.razon_social}</Dato>
              <Dato label="RIF / C.I.">{borrar.rif}</Dato>
              <Dato label="Dirección">{borrar.direccion}</Dato>
              <Dato label="Atención a">{borrar.atencion_a}</Dato>
              <Dato label="Condición">{borrar.condicion}</Dato>
              <Dato label="Notas que lo usan">{usos.get(norm(borrar.razon_social)) ? String(usos.get(norm(borrar.razon_social))) : null}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void confirmarBorrar(); }}
          onCancel={() => setBorrar(null)}
        />
      )}
    </Modal>
  );
}
