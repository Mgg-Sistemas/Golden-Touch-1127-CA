import { useCallback, useEffect, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { Almacen } from '@/shared/lib/types';
import { ALMACEN_DANADOS, ALMACEN_MINA, ALMACEN_REUTILIZABLES } from './depositos';
import { eliminarAlmacen } from './almacenes.repository';
import { cambiarPapeleraInventario, listPapeleraInventario, type RegistroPapeleraInventario } from './papeleraInventario';

const fijos = new Set(['General', ALMACEN_MINA, ALMACEN_REUTILIZABLES, ALMACEN_DANADOS]);

export function PapeleraInventarioModal({ almacenes, onChanged, onClose }: {
  almacenes: Almacen[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const { can, isAdmin, permisos, puedeEscribirAlmacen } = usePermissions();
  const escritura = can('inventario', 'escritura');
  const vaciado = escritura && (permisos?.inventario?.vaciarPapelera ?? isAdmin);
  const [filas, setFilas] = useState<RegistroPapeleraInventario[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [deposito, setDeposito] = useState('');
  const [confirmar, setConfirmar] = useState<'enviar' | 'vaciar' | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setFilas(await listPapeleraInventario()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la papelera', 'error'); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function ejecutar(accion: () => Promise<string>) {
    setConfirmar(null);
    setOcupado(true);
    try {
      const mensaje = await accion();
      toast(mensaje, 'success');
      await Promise.all([cargar(), onChanged()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar la operación', 'error');
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function vaciar(): Promise<string> {
    const resultados = await Promise.allSettled((['almacen', 'presentacion'] as const).map((tipo) =>
      cambiarPapeleraInventario(tipo, filas.filter((f) => f.tipo === tipo).map((f) => f.id), 'vaciar')));
    const total = resultados.reduce((suma, r) => suma + (r.status === 'fulfilled' ? r.value : 0), 0);
    const error = resultados.find((r) => r.status === 'rejected');
    if (error) throw new Error(`${total} registro(s) retirado(s). ${error.reason instanceof Error ? error.reason.message : 'No se pudo completar el vaciado.'}`);
    return total ? `${total} registro(s) retirado(s) con resguardo.` : 'La lista cambió. Revisa lo que sigue en la papelera.';
  }

  const disponibles = almacenes.filter((a) => a.estado === 'activo' && !fijos.has(a.nombre) && puedeEscribirAlmacen(a.nombre));
  return (
    <Modal title="Papelera de Inventario" size="lg" onClose={() => { if (!ocupado) onClose(); }} footer={<>
      {vaciado && <button className="btn btn-danger" disabled={ocupado || cargando || !filas.length}
        onClick={() => setConfirmar('vaciar')}>Vaciar papelera</button>}
      <button className="btn btn-ghost" disabled={ocupado} onClick={onClose}>Cerrar</button>
    </>}>
      {escritura && disponibles.length > 0 && (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'end', marginBottom: '.75rem' }}>
          <label className="form-row" style={{ margin: 0, flex: '1 1 14rem' }}>Depósito vacío
            <select className="select" value={deposito} disabled={ocupado} onChange={(e) => setDeposito(e.target.value)}>
              <option value="">Selecciona un depósito</option>
              {disponibles.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <button className="btn btn-ghost" disabled={!deposito || ocupado} onClick={() => setConfirmar('enviar')}>Enviar a papelera</button>
        </div>
      )}
      {cargando ? <p>Cargando…</p> : !filas.length ? <p>La papelera está vacía.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Registro</th><th>Tipo</th>{escritura && <th>Acción</th>}</tr></thead>
            <tbody>{filas.map((f) => (
              <tr key={`${f.tipo}-${f.id}`}>
                <td>{f.nombre}</td><td>{f.tipo === 'almacen' ? 'Depósito' : 'Presentación de compra'}</td>
                {escritura && <td><button className="btn btn-sm btn-ghost" disabled={ocupado} onClick={() => void ejecutar(async () => {
                  await cambiarPapeleraInventario(f.tipo, [f.id], 'restaurar');
                  return 'Registro restaurado';
                })}>Restaurar</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {confirmar === 'enviar' && <ConfirmDialog title="Enviar depósito a la papelera"
        message="Puedes recuperar el depósito desde la papelera. Debe estar vacío y sin subdepósitos ni traslados pendientes."
        confirmText="Enviar" onCancel={() => setConfirmar(null)} onConfirm={() => void ejecutar(async () => {
          await eliminarAlmacen(deposito);
          setDeposito('');
          return 'Depósito enviado a la papelera';
        })} />}
      {confirmar === 'vaciar' && <ConfirmDialog title="Vaciar papelera de Inventario" danger requireText="BORRAR"
        message="Se retirarán los registros seleccionados de la papelera y se guardará un respaldo. Los movimientos permanecen en el kardex."
        confirmText="Vaciar papelera" onCancel={() => setConfirmar(null)} onConfirm={() => { void ejecutar(vaciar); }} />}
    </Modal>
  );
}
