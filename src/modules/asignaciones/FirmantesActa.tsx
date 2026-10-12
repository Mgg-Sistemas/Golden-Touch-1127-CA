/* ============================================================
   Golden Touch · Asignaciones · Quien suscribe el acta (12/10/2026)

   · FirmanteCampos: nombre, cédula y cargo de quien entrega por la empresa.
     Empieza en blanco; al escribir sugiere los del catálogo y, al elegir
     uno, completa su cédula y su cargo. Uno nuevo entra al catálogo al
     guardar la entrega.
   · FirmantesCatalogoModal: el catálogo editable (agregar, corregir,
     desactivar o eliminar).
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import { eliminarFirmante, guardarFirmante, listFirmantes, type DatosFirmante, type Firmante } from './actas.repository';

export const FIRMANTE_VACIO: DatosFirmante = { nombre: '', cedula: '', cargo: '' };

export function FirmanteCampos({ id, valor, onChange, catalogo, onCatalogo, disabled }: {
  id: string;
  valor: DatosFirmante;
  onChange: (v: DatosFirmante) => void;
  catalogo: readonly Firmante[];
  onCatalogo?: () => void;
  disabled?: boolean;
}) {
  const activos = catalogo.filter((f) => f.activo);
  const enCatalogo = !!valor.nombre.trim() && catalogo.some((f) => f.nombre.trim().toLowerCase() === valor.nombre.trim().toLowerCase());

  function cambiarNombre(nombre: string) {
    const f = catalogo.find((x) => x.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
    onChange(f ? { nombre: f.nombre, cedula: f.cedula ?? '', cargo: f.cargo ?? '' } : { ...valor, nombre });
  }

  return (
    <div style={{ display: 'grid', gap: '.45rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.45rem' }}>
        <input id={`${id}-nombre`} className="input" list={`${id}-lista`} value={valor.nombre} disabled={disabled}
          onChange={(e) => cambiarNombre(e.target.value)} placeholder="Nombre de quien suscribe" autoComplete="off" />
        <datalist id={`${id}-lista`}>
          {activos.map((f) => <option key={f.id} value={f.nombre}>{[f.cedula, f.cargo].filter(Boolean).join(' · ')}</option>)}
        </datalist>
        <input id={`${id}-cedula`} className="input mono" value={valor.cedula} disabled={disabled}
          onChange={(e) => onChange({ ...valor, cedula: e.target.value })} placeholder="Cédula (V-12345678)" />
        <input id={`${id}-cargo`} className="input" value={valor.cargo} disabled={disabled}
          onChange={(e) => onChange({ ...valor, cargo: e.target.value })} placeholder="Cargo (ej.: Gerente General)" />
      </div>
      <small className="muted" style={{ fontSize: '.74rem' }}>
        {!valor.nombre.trim()
          ? 'En blanco, el acta sale con la línea para escribirlo a mano.'
          : enCatalogo ? 'Del catálogo.' : 'Nuevo: queda en el catálogo al guardar.'}
        {onCatalogo && <> · <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .3rem' }} onClick={onCatalogo}>📚 Editar catálogo</button></>}
      </small>
    </div>
  );
}

export function FirmantesCatalogoModal({ canWrite, actor, onClose }: { canWrite: boolean; actor: string; onClose: () => void }) {
  const [lista, setLista] = useState<Firmante[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; d: DatosFirmante; activo: boolean } | null>(null);
  const [borrar, setBorrar] = useState<Firmante | null>(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(() => listFirmantes().then(setLista)
    .catch((e) => { toast(e instanceof Error ? e.message : 'No se pudo leer el catálogo', 'error'); setLista([]); }), []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['asignaciones_firmantes'], () => { void recargar(); });

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    try {
      await guardarFirmante(editando.id, { ...editando.d, activo: editando.activo }, actor);
      toast(editando.id ? 'Firmante actualizado' : 'Firmante agregado', 'success');
      setEditando(null);
      await recargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setGuardando(false); }
  }

  async function confirmarBorrar() {
    const f = borrar; setBorrar(null);
    if (!f) return;
    try { await eliminarFirmante(f.id); toast('Firmante eliminado', 'success'); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <Modal title="📚 Catálogo · quien suscribe el acta" size="md" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        {canWrite && !editando && <button className="btn btn-primary" onClick={() => setEditando({ id: null, d: { ...FIRMANTE_VACIO }, activo: true })}>＋ Agregar</button>}
      </>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
        Quien entrega por la empresa y firma el acta. Corregir uno no cambia las actas ya hechas: cada acta guarda su copia.
      </p>
      {editando && (
        <div className="card" style={{ padding: '.6rem .7rem', marginBottom: '.6rem', display: 'grid', gap: '.45rem' }}>
          <strong style={{ fontSize: '.86rem' }}>{editando.id ? 'Editar firmante' : 'Nuevo firmante'}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.45rem' }}>
            <input className="input" value={editando.d.nombre} placeholder="Nombre *" autoFocus
              onChange={(e) => setEditando({ ...editando, d: { ...editando.d, nombre: e.target.value } })} />
            <input className="input mono" value={editando.d.cedula} placeholder="Cédula"
              onChange={(e) => setEditando({ ...editando, d: { ...editando.d, cedula: e.target.value } })} />
            <input className="input" value={editando.d.cargo} placeholder="Cargo"
              onChange={(e) => setEditando({ ...editando, d: { ...editando.d, cargo: e.target.value } })} />
          </div>
          <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: '.84rem' }}>
            <input type="checkbox" checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Activo (aparece al elegir en el acta)
          </label>
          <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={() => void guardar()} disabled={guardando || !editando.d.nombre.trim()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
      {lista === null ? <p className="muted">Cargando…</p> : !lista.length ? (
        <p className="muted">Todavía no hay nadie. Se agrega aquí o escribiendo el nombre en «Quien suscribe» al registrar una entrega.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Nombre</th><th>Cédula</th><th>Cargo</th><th /></tr></thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.id} style={f.activo ? undefined : { opacity: .55 }}>
                <td>{f.nombre}{!f.activo && <span className="muted"> · inactivo</span>}</td>
                <td className="mono">{f.cedula || '—'}</td>
                <td>{f.cargo || '—'}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {canWrite && <>
                    <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setEditando({ id: f.id, d: { nombre: f.nombre, cedula: f.cedula ?? '', cargo: f.cargo ?? '' }, activo: f.activo })}>✏</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Eliminar" onClick={() => setBorrar(f)}>🗑</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {borrar && (
        <ConfirmDialog title="Eliminar firmante" danger confirmText="Eliminar"
          message={`Se quita «${borrar.nombre}» del catálogo. Las actas que ya firmó no cambian.`}
          onConfirm={() => void confirmarBorrar()} onCancel={() => setBorrar(null)} />
      )}
    </Modal>
  );
}
