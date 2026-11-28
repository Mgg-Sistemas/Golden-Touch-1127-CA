import { useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { supabase } from '@/shared/lib/supabase';
import { mensajeError } from '@/shared/lib/errores';
import { Modal } from '@/shared/ui/Modal';
import type { Orden } from '@/shared/lib/types';
import { cancelarOrden } from './pedidos.repository';

export function CancelarPendienteCotizar({ id, onCancelled }: { id: string; onCancelled: () => Promise<void> }) {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!can('compras', 'escritura')) return null;
  async function confirmar() {
    if (!motivo.trim()) { setError('Indica el motivo de cancelación'); return; }
    setSaving(true); setError('');
    try {
      const { data, error: e } = await supabase.from('ordenes').select('*').eq('id', id).single();
      if (e) throw e;
      if (data.oc_codigo || data.estado !== 'aprobada') throw new Error('La solicitud ya cambió de estado. Actualiza la lista.');
      const { data: sesion, error: errorUsuario } = await supabase.auth.getUser();
      if (errorUsuario || !sesion.user?.email) throw errorUsuario || new Error('Sesión no disponible');
      await cancelarOrden(data as Orden, sesion.user.email, motivo.trim());
      setOpen(false); await onCancelled();
    } catch (e) { setError(mensajeError(e, 'No se pudo cancelar la solicitud')); }
    finally { setSaving(false); }
  }
  return <>
    <button className="btn btn-danger" onClick={() => setOpen(true)}>Cancelar pendiente</button>
    {open && <Modal title="Cancelar solicitud pendiente de cotizar" onClose={() => { if (!saving) setOpen(false); }}>
      <p>Se cancelará esta solicitud pendiente. Las OC ya emitidas conservan su estado.</p>
      <label>Motivo<textarea className="input" value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="compras-acciones"><button className="btn btn-danger" disabled={saving} onClick={() => void confirmar()}>{saving ? 'Cancelando…' : 'Confirmar cancelación'}</button><button className="btn btn-ghost" disabled={saving} onClick={() => setOpen(false)}>Volver</button></div>
    </Modal>}
  </>;
}
