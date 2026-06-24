import { useCallback, useEffect, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import {
  isWebAuthnSupported, enrolarHuella, listarDispositivos, eliminarDispositivo,
  etiquetaDispositivo, type DispositivoHuella,
} from './webauthn.repository';

/** Gestión del login con huella del propio usuario: activar en este equipo y
 *  ver/quitar los dispositivos enrolados. La contraseña sigue como respaldo. */
export function HuellaModal({ onClose }: { onClose: () => void }) {
  const soporta = isWebAuthnSupported();
  const [dispositivos, setDispositivos] = useState<DispositivoHuella[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enrolando, setEnrolando] = useState(false);
  const [borrarId, setBorrarId] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try { setDispositivos(await listarDispositivos()); }
    catch { setDispositivos([]); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);

  async function activar() {
    setEnrolando(true);
    try {
      await enrolarHuella(etiquetaDispositivo());
      toast('Huella activada en este equipo', 'success');
      await recargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo activar la huella', 'error');
    } finally {
      setEnrolando(false);
    }
  }
  async function borrar(id: string) {
    try { await eliminarDispositivo(id); toast('Dispositivo eliminado', 'success'); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const fecha = (s: string | null) => (s ? new Date(s).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  return (
    <Modal title="🔒 Entrar con huella" size="md" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {!soporta ? (
        <p className="muted">Este equipo o navegador no soporta el inicio de sesión con huella (WebAuthn).</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Activá la huella (o Face ID / Windows Hello) <strong>en este equipo</strong> para entrar más rápido.
            La huella nunca sale del dispositivo; tu <strong>contraseña sigue funcionando</strong> como respaldo y
            queda <strong>atada a este equipo</strong> (en otro tendrás que activarla de nuevo).
          </p>
          <button className="btn btn-primary" onClick={() => void activar()} disabled={enrolando} style={{ margin: '.5rem 0' }}>
            {enrolando ? 'Activando…' : '➕ Activar huella en este equipo'}
          </button>

          <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto', marginTop: '.5rem' }}>
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead><tr><th>Dispositivo</th><th>Registrado</th><th>Último uso</th><th></th></tr></thead>
              <tbody>
                {cargando && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
                {!cargando && !dispositivos.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin dispositivos con huella.</td></tr>}
                {dispositivos.map((d) => (
                  <tr key={d.id}>
                    <td>{d.device_label || 'Equipo'}</td>
                    <td className="muted">{fecha(d.created_at)}</td>
                    <td className="muted">{fecha(d.last_used_at)}</td>
                    <td><button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Quitar" onClick={() => setBorrarId(d.id)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {borrarId && (
        <ConfirmDialog
          title="Quitar dispositivo"
          message="¿Quitar la huella de este dispositivo? Ya no podrás entrar con huella desde él (la contraseña sigue funcionando)."
          confirmText="Quitar"
          danger
          onCancel={() => setBorrarId(null)}
          onConfirm={() => { const id = borrarId; setBorrarId(null); void borrar(id); }}
        />
      )}
    </Modal>
  );
}
