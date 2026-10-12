/* ============================================================
   Golden Touch · RRHH · reactivar / desactivar a una persona (12/10/2026)

   Reactivar: vuelve a la empresa (reingreso), la baja fue por error u otro
   motivo. Desactivar: renuncia, despido, fin de contrato u otro. En los dos
   casos queda una nota en el historial laboral con la fecha y el motivo.
   Nada se borra: pagos, préstamos y anticipos siguen en su histórico.
   ============================================================ */
import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { FechaInput } from '@/shared/ui/FechaInput';
import { toast } from '@/shared/ui/Toast';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import type { Personal } from '@/shared/lib/types';
import { cambiarEstadoPersonal } from './personal.repository';

const MOTIVOS_REACTIVAR = ['Reingreso a la empresa', 'La baja fue por error', 'Otro'];
const MOTIVOS_DESACTIVAR = ['Renuncia', 'Despido', 'Fin de contrato', 'Otro'];

export function EstadoPersonalModal({ persona, actor, actorName, onClose, onHecho }: {
  persona: Personal; actor: string; actorName?: string | null; onClose: () => void; onHecho: () => void;
}) {
  const reactivar = !persona.activo;
  const motivos = reactivar ? MOTIVOS_REACTIVAR : MOTIVOS_DESACTIVAR;
  const [motivo, setMotivo] = useState(motivos[0]);
  const [detalle, setDetalle] = useState('');
  const [fecha, setFecha] = useState(hoyVenezuela());
  // Por reingreso, lo normal es que la antigüedad cuente desde que volvió.
  const [actualizarIngreso, setActualizarIngreso] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const nombre = [persona.nombre, persona.apellido].filter(Boolean).join(' ');
  const esReingreso = reactivar && motivo === 'Reingreso a la empresa';
  const faltaDetalle = motivo === 'Otro' && !detalle.trim();

  async function guardar() {
    setGuardando(true);
    try {
      await cambiarEstadoPersonal(persona, {
        activo: reactivar, fecha, motivo, detalle, actualizarIngreso: esReingreso && actualizarIngreso,
      }, actor, actorName);
      toast(reactivar ? `${nombre} está activo de nuevo` : `${nombre} quedó inactivo`, 'success');
      onHecho();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cambiar el estado', 'error');
      onHecho();
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={reactivar ? `↩ Reactivar a ${nombre}` : `⏸ Desactivar a ${nombre}`} size="md" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
        <button className={`btn ${reactivar ? 'btn-success' : 'btn-danger'}`} onClick={() => void guardar()} disabled={guardando || !fecha || faltaDetalle}>
          {guardando ? 'Guardando…' : reactivar ? '↩ Reactivar' : '⏸ Desactivar'}
        </button>
      </>}>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
          {reactivar
            ? 'Vuelve a aparecer en la nómina, en las listas y en los carnets. Su histórico de pagos, préstamos y anticipos sigue igual.'
            : 'Deja de aparecer en la nómina y en las listas de activos. No se borra nada: se puede reactivar cuando haga falta.'}
        </p>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Motivo</label>
          <div className="flo-opt" role="group" aria-label="Motivo" style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
            {motivos.map((m) => (
              <button key={m} type="button" className={`btn btn-sm ${motivo === m ? 'btn-primary' : ''}`} aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>
            ))}
          </div>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label htmlFor="estado-pers-fecha">{reactivar ? (esReingreso ? 'Fecha de reingreso' : 'Fecha') : 'Fecha de egreso'}</label>
          <FechaInput id="estado-pers-fecha" value={fecha} onChange={setFecha} />
        </div>
        {esReingreso && (
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.86rem' }}>
            <input type="checkbox" checked={actualizarIngreso} onChange={(e) => setActualizarIngreso(e.target.checked)} style={{ marginTop: '.2rem' }} />
            <span>Usar esta fecha como <strong>fecha de ingreso</strong> (la antigüedad cuenta desde el reingreso).
              {persona.fecha_ingreso && <span className="muted"> Hoy tiene {persona.fecha_ingreso.split('-').reverse().join('-')}.</span>}</span>
          </label>
        )}
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label htmlFor="estado-pers-detalle">Detalle {motivo === 'Otro' ? '*' : <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span>}</label>
          <textarea id="estado-pers-detalle" className="textarea" rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)}
            placeholder={reactivar ? 'Ej.: vuelve al mismo cargo en la mina' : 'Ej.: renuncia presentada el lunes'} />
        </div>
        <small className="muted">Queda anotado en su historial laboral (RRHH → Administrativo → Nota / Historial).</small>
      </div>
    </Modal>
  );
}
