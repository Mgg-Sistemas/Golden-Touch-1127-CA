import { useCallback, useEffect, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { cambiarPapeleraTesoreria, listPapeleraTesoreria, type RegistroPapeleraTesoreria } from './papeleraTesoreria';

export function PapeleraTesoreriaModal({ onClose }: { onClose: () => void }) {
  const { can, permisos, isAdmin } = usePermissions();
  const escritura = can('tesoreria', 'escritura');
  const vaciado = escritura && (permisos?.tesoreria?.vaciarPapelera ?? isAdmin);
  const [filas, setFilas] = useState<RegistroPapeleraTesoreria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setFilas(await listPapeleraTesoreria()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la papelera', 'error'); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function restaurar(f: RegistroPapeleraTesoreria) {
    setOcupado(true);
    try {
      await cambiarPapeleraTesoreria(f.tipo, [f.id], 'restaurar');
      toast('Registro restaurado', 'success');
      await cargar();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo restaurar', 'error'); }
    finally { setOcupado(false); }
  }

  async function vaciar() {
    setConfirmar(false);
    setOcupado(true);
    try {
      const results = await Promise.allSettled((['categoria', 'contraparte'] as const).map((tipo) =>
        cambiarPapeleraTesoreria(tipo, filas.filter((f) => f.tipo === tipo).map((f) => f.id), 'vaciar')));
      const n = results.reduce((total, r) => total + (r.status === 'fulfilled' ? r.value : 0), 0);
      const fallo = results.find((r) => r.status === 'rejected');
      if (fallo) toast(fallo.reason instanceof Error ? fallo.reason.message : 'No se pudo completar el vaciado', 'error');
      if (n) toast(`${n} registro(s) retirado(s) con respaldo`, 'success');
      if (!fallo && n < filas.length) toast('Algunos registros están protegidos o la lista cambió.', 'warning');
      await cargar();
    } finally { setOcupado(false); }
  }

  return (
    <Modal title="Papelera de Tesorería" size="lg" onClose={() => { if (!ocupado) onClose(); }}
      footer={<>
        {vaciado && <button className="btn btn-danger" disabled={cargando || ocupado || !filas.length}
          onClick={() => setConfirmar(true)}>Vaciar papelera</button>}
        <button className="btn btn-ghost" disabled={ocupado} onClick={onClose}>Cerrar</button>
      </>}>
      <p className="muted">Aquí se recuperan categorías y contrapartes. Los movimientos con reverso se conservan en el libro de caja.</p>
      {cargando ? <p>Cargando…</p> : !filas.length ? <p>La papelera está vacía.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Tipo</th>{escritura && <th>Acción</th>}</tr></thead>
            <tbody>{filas.map((f) => (
              <tr key={`${f.tipo}-${f.id}`}>
                <td>{f.nombre}</td><td>{f.tipo === 'categoria' ? 'Categoría de gasto' : 'Contraparte'}</td>
                {escritura && <td><button className="btn btn-sm btn-ghost" disabled={ocupado}
                  onClick={() => void restaurar(f)}>Restaurar</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {confirmar && <ConfirmDialog title="Vaciar papelera de Tesorería" danger requireText="BORRAR"
        message="Se guardará un respaldo antes de retirar los registros. Las categorías que aún tengan subcategorías quedarán en la papelera."
        confirmText="Vaciar papelera" onCancel={() => setConfirmar(false)} onConfirm={() => { void vaciar(); }} />}
    </Modal>
  );
}
