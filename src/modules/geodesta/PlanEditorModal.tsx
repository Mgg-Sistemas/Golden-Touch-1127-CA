/* ============================================================
   Golden Touch · Geodesta · editor de la actividad planificada

   Aquí el geólogo crea o ajusta una actividad ("muestreo del bloque 3,
   del 7 al 9, Mina La Esperanza") y, cuando pasa, la marca como cumplida o no.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { FechaInput } from '@/shared/ui/FechaInput';
import { toast } from '@/shared/ui/Toast';
import type { PlanificacionGeodesta } from '@/shared/lib/types';
import { ESTADOS_PLAN, borradorDesdePlan, errorPlan, type BorradorPlan } from './planModelo';
import { actualizarPlan, borrarPlan, crearPlan, lugaresUsados } from './planificacion.repository';

interface PlanEditorModalProps {
  /** `null` = alta. */
  plan: PlanificacionGeodesta | null;
  /** Al planificar desde un día del calendario. */
  diaInicial?: string;
  actor: string;
  onClose: () => void;
  /** El padre recarga y cierra. */
  onGuardado: () => void;
  onBorrado: () => void;
}

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

/**
 * El `key` hace que pasar de una actividad a otra remonte el formulario: sin él,
 * el estado inicial (que se toma una sola vez) arrastraría los datos de la anterior.
 */
export function PlanEditorModal(props: PlanEditorModalProps) {
  return <PlanEditorForm key={props.plan?.id ?? 'nuevo'} {...props} />;
}

function PlanEditorForm({ plan, diaInicial, actor, onClose, onGuardado, onBorrado }: PlanEditorModalProps) {
  const [est, setEst] = useState(() => {
    const inicial = borradorDesdePlan(plan, diaInicial);
    return { b: inicial, base: inicial };
  });
  const { b, base } = est;
  const cambiar = (parche: Partial<BorradorPlan>) => setEst((s) => ({ ...s, b: { ...s.b, ...parche } }));

  const [ocupado, setOcupado] = useState(false);
  // El estado tarda un render en reflejarse: la referencia frena el doble clic.
  const enCurso = useRef(false);
  const [confirmaSalir, setConfirmaSalir] = useState(false);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [lugares, setLugares] = useState<string[]>([]);

  // Las sugerencias son una comodidad: si fallan, el campo sigue libre.
  useEffect(() => {
    let vivo = true;
    lugaresUsados().then((l) => { if (vivo) setLugares(l); }).catch(() => { /* sin sugerencias */ });
    return () => { vivo = false; };
  }, []);

  const hayCambios = JSON.stringify(b) !== JSON.stringify(base);

  /** Cancelar y la ✕: con cambios sin guardar se pregunta primero. Mientras guarda, se ignora. */
  function intentarCerrar() {
    if (ocupado) return;
    if (hayCambios) setConfirmaSalir(true); else onClose();
  }

  /** Si "hasta" queda antes del nuevo "desde", se arrastra al mismo día. */
  function cambiarDesde(iso: string) {
    setEst((s) => ({
      ...s,
      b: { ...s.b, desde: iso, hasta: iso && s.b.hasta && s.b.hasta < iso ? iso : s.b.hasta },
    }));
  }

  async function guardar() {
    if (enCurso.current) return;
    const error = errorPlan(b);
    if (error) { toast(error, 'error'); return; }
    enCurso.current = true;
    setOcupado(true);
    try {
      if (plan) await actualizarPlan(plan.id, b, actor);
      else await crearPlan(b, actor);
      toast(plan ? 'Actividad actualizada.' : 'Actividad planificada.', 'success');
      setEst((s) => ({ ...s, base: b }));
      onGuardado();
    } catch (e) {
      toast(mensaje(e, 'No se pudo guardar la actividad.'), 'error');
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  async function borrar() {
    if (!plan || enCurso.current) return;
    enCurso.current = true;
    setOcupado(true);
    setConfirmaBorrar(false);
    try {
      await borrarPlan(plan.id);
      toast('Actividad borrada.', 'success');
      onBorrado();
    } catch (e) {
      toast(mensaje(e, 'No se pudo borrar la actividad.'), 'error');
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  return (
    <>
      <Modal
        title={plan ? 'Editar actividad' : 'Planificar actividad'} onClose={intentarCerrar}
        footer={
          <>
            {plan && (
              <button type="button" className="btn btn-ghost" disabled={ocupado}
                style={{ color: 'var(--danger)', marginRight: 'auto' }}
                onClick={() => setConfirmaBorrar(true)}>Borrar</button>
            )}
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={intentarCerrar}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void guardar()}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <label htmlFor="plan-titulo">¿Qué vas a hacer? *</label>
          <input id="plan-titulo" className="input" autoFocus value={b.titulo}
            placeholder="Ej.: Muestreo del bloque 3"
            onChange={(e) => cambiar({ titulo: e.target.value })} />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="plan-desde">Desde *</label>
            <FechaInput id="plan-desde" value={b.desde} onChange={cambiarDesde} />
          </div>
          <div className="form-row">
            <label htmlFor="plan-hasta">Hasta *</label>
            <FechaInput id="plan-hasta" value={b.hasta} min={b.desde || undefined}
              onChange={(iso) => cambiar({ hasta: iso })} />
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="plan-lugar">Lugar</label>
          <input id="plan-lugar" className="input" list="plan-lugares" value={b.lugar}
            placeholder="Ej.: Mina La Esperanza"
            onChange={(e) => cambiar({ lugar: e.target.value })} />
          <datalist id="plan-lugares">
            {lugares.map((l) => <option key={l} value={l} />)}
          </datalist>
        </div>
        <div className="form-row">
          <label htmlFor="plan-nota">Nota</label>
          <textarea id="plan-nota" className="input" rows={3} value={b.nota}
            placeholder="Lo que quieras recordar de esta actividad"
            onChange={(e) => cambiar({ nota: e.target.value })} />
        </div>
        <div className="form-row">
          <label htmlFor="plan-estado">Estado</label>
          <select id="plan-estado" className="input" value={b.estado}
            onChange={(e) => cambiar({ estado: e.target.value as BorradorPlan['estado'] })}>
            {ESTADOS_PLAN.map((x) => <option key={x.valor} value={x.valor}>{x.label}</option>)}
          </select>
        </div>
        {b.estado === 'no_se_hizo' && (
          <div className="form-row">
            <label htmlFor="plan-estado-nota">¿Por qué no se hizo?</label>
            <textarea id="plan-estado-nota" className="input" rows={2} value={b.estado_nota}
              placeholder="Ej.: Llovió y el acceso quedó cerrado"
              onChange={(e) => cambiar({ estado_nota: e.target.value })} />
          </div>
        )}
      </Modal>
      {confirmaSalir && (
        <ConfirmDialog
          title="Descartar cambios" danger confirmText="Sí, descartar"
          message="Hay datos escritos que no se han guardado. Si cerrás ahora, se pierden. ¿Seguro que querés descartarlos?"
          onConfirm={() => { setConfirmaSalir(false); onClose(); }}
          onCancel={() => setConfirmaSalir(false)}
        />
      )}
      {confirmaBorrar && (
        <ConfirmDialog
          title="Borrar actividad" danger confirmText="Sí, borrar"
          message="Si la borrás, desaparece del calendario y no se puede recuperar. ¿Seguro que querés borrarla?"
          onConfirm={() => void borrar()}
          onCancel={() => setConfirmaBorrar(false)}
        />
      )}
    </>
  );
}
