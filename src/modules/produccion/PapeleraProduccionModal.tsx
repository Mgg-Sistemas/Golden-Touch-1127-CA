import { useCallback, useEffect, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { date } from '@/shared/lib/format';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { cambiarPapeleraProduccion, listPapeleraProduccion, type RegistroPapeleraProduccion } from './contratos.repository';

export function PapeleraProduccionModal({ canWrite, onChanged, onClose }: {
  canWrite: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { permisos } = usePermissions();
  const puedeVaciar = canWrite && permisos?.produccion?.vaciarPapelera === true;
  const [filas, setFilas] = useState<RegistroPapeleraProduccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setFilas(await listPapeleraProduccion()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la papelera.', 'error'); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function restaurar(fila: RegistroPapeleraProduccion) {
    setOcupado(true);
    try {
      await cambiarPapeleraProduccion(fila.tipo, [fila.id], 'restaurar');
      await Promise.all([cargar(), onChanged()]);
      toast('Registro restaurado', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo restaurar el registro.', 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function vaciar() {
    setConfirmar(false);
    setOcupado(true);
    try {
      const contratos = filas.filter((f) => f.tipo === 'contrato').map((f) => f.id);
      const catalogo = filas.filter((f) => f.tipo === 'catalogo').map((f) => f.id);
      const resultados = await Promise.allSettled([
        cambiarPapeleraProduccion('contrato', contratos, 'vaciar'),
        cambiarPapeleraProduccion('catalogo', catalogo, 'vaciar'),
      ]);
      const retirados = resultados.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0);
      const error = resultados.find((r) => r.status === 'rejected');
      if (error) toast(error.reason instanceof Error ? error.reason.message : 'No se pudo completar el vaciado.', 'error');
      if (retirados > 0) toast(`${retirados} registro(s) retirado(s) con resguardo.`, 'success');
      if (!error && retirados < filas.length) toast('Algunos registros están protegidos o la lista cambió. Revisa lo que sigue en la papelera.', 'warning');
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal title="Papelera de Producción" size="lg" onClose={() => { if (!ocupado) onClose(); }}
      footer={<>
        {puedeVaciar && <button className="btn btn-danger" disabled={cargando || ocupado || !filas.length}
          onClick={() => setConfirmar(true)}>Vaciar papelera</button>}
        <button className="btn btn-ghost" disabled={ocupado} onClick={onClose}>Cerrar</button>
      </>}>
      {cargando ? <p className="muted">Cargando…</p> : !filas.length ? <p className="muted">La papelera está vacía.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Registro</th><th>Tipo</th><th>Enviado</th>{canWrite && <th>Acción</th>}</tr></thead>
            <tbody>{filas.map((fila) => (
              <tr key={`${fila.tipo}-${fila.id}`}>
                <td>{fila.nombre}</td><td>{fila.tipo === 'contrato' ? 'Contrato' : 'Catálogo'}</td>
                <td>{date(fila.eliminado_en)}</td>
                {canWrite && <td><button className="btn btn-sm btn-ghost" disabled={ocupado}
                  onClick={() => void restaurar(fila)}>Restaurar</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {confirmar && <ConfirmDialog title="Vaciar papelera de Producción" danger
        message="Los registros aptos se retiran de la papelera y quedan resguardados en la base. Los contratos con movimientos de inventario se conservan en la papelera."
        confirmText="Vaciar papelera" onCancel={() => setConfirmar(false)} onConfirm={() => { void vaciar(); }} />}
    </Modal>
  );
}
