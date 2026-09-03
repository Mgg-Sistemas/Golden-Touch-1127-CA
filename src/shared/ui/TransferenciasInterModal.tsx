/* ============================================================
   GT-INT-11 · Transferencias con MGG: ver, reintentar, revertir

   El material sale de Golden Touch ANTES de que MGG lo acepte. Cuando el
   puente falla, esos litros o esos kilos quedan en el limbo: ya no están acá
   y nunca llegaron allá. Hasta ahora no había ninguna pantalla que lo
   mostrara — las funciones que listaban estas transferencias existían en el
   código pero no las llamaba nadie.

   Esta es esa pantalla. Sirve igual para el puente de combustible y para el
   de casiterita: solo cambian las etiquetas y las dos funciones que se le
   pasan.

   REINTENTAR vs. REVERTIR — no son simétricos y la pantalla lo dice:
     · Reintentar es seguro de repetir. Viaja el mismo identificador y MGG
       deduplica por él, así que nunca acredita dos veces.
     · Revertir NO es seguro a ciegas. Que el puente haya fallado no prueba
       que MGG no lo haya recibido: pudo haber entrado y haberse perdido solo
       el acuse. Por eso revertir pide escribir la palabra completa.
   ============================================================ */
import { useState } from 'react';
import { Modal, ConfirmDialog } from './Modal';
import { EmptyState } from './EmptyState';
import { toast } from './Toast';

export interface FilaTransferenciaInter {
  id: string;
  estado: string;
  /** Lo que se movió, ya formateado por quien llama («2.000 L de DIESEL»). */
  resumen?: string | null;
  motivo?: string | null;
  mensaje_error?: string | null;
  created_at: string;
  actor?: string | null;
  actor_name?: string | null;
  revertida_at?: string | null;
  revertida_por?: string | null;
  /** De dónde salió: el tanque o el almacén. */
  origen?: string | null;
}

interface Props {
  /** «Combustible» o «Casiterita» — encabeza el modal y arma los textos. */
  recurso: string;
  /** Cómo se llama lo que se mueve, en plural y en minúscula: «litros», «kilos». */
  unidad: string;
  filas: FilaTransferenciaInter[];
  cargando?: boolean;
  /** true cuando el usuario tiene permiso de escritura en el módulo. */
  puedeOperar: boolean;
  onReintentar: (id: string) => Promise<void>;
  onRevertir: (id: string) => Promise<void>;
  onClose: () => void;
}

const ETIQUETA: Record<string, { texto: string; clase: string }> = {
  enviada:      { texto: 'Enviada',       clase: 'info' },
  por_confirmar:{ texto: 'Por confirmar', clase: 'warning' },
  recibida:     { texto: 'Recibida',      clase: 'success' },
  rechazada:    { texto: 'Rechazada',     clase: 'danger' },
  error:        { texto: 'No llegó',      clase: 'danger' },
  revertida:    { texto: 'Devuelta',      clase: '' },
};

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
}

export function TransferenciasInterModal({
  recurso, unidad, filas, cargando, puedeOperar, onReintentar, onRevertir, onClose,
}: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [porRevertir, setPorRevertir] = useState<FilaTransferenciaInter | null>(null);

  const enError = filas.filter((f) => f.estado === 'error');

  async function correr(id: string, accion: () => Promise<void>, exito: string) {
    setOcupado(id);
    try {
      await accion();
      toast(exito, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo completar la operación.', 'error');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <Modal title={`${recurso} enviado a MGG`} size="xl" onClose={onClose}>
        {enError.length > 0 && (
          <div
            role="alert"
            style={{
              marginBottom: 14, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(245,177,51,0.12)', border: '1px solid rgba(245,177,51,0.4)',
            }}
          >
            <strong style={{ color: 'var(--warning)' }}>
              {enError.length === 1
                ? 'Hay 1 envío que no llegó a MGG.'
                : `Hay ${enError.length} envíos que no llegaron a MGG.`}
            </strong>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
              Esos {unidad} ya salieron de Golden Touch. <b>Probá primero «Reintentar»</b>: se puede
              apretar las veces que haga falta sin riesgo de mandar de más, y si MGG ya lo tenía, la
              transferencia se resuelve sola. Usá «Devolver» únicamente cuando hayas confirmado con
              MGG que nunca les llegó.
            </p>
          </div>
        )}

        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : filas.length === 0 ? (
          <EmptyState
            icon="↔"
            message={`Todavía no se envió ${recurso.toLowerCase()} a MGG. Acá van a aparecer los envíos, con su estado y qué hacer si alguno falla.`}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Envío</th>
                  <th>Salió de</th>
                  <th>Quién</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const et = ETIQUETA[f.estado] ?? { texto: f.estado, clase: 'badge-neutral' };
                  const trabajando = ocupado === f.id;
                  return (
                    <tr key={f.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fecha(f.created_at)}</td>
                      <td>
                        <div>{f.resumen ?? '—'}</div>
                        {f.motivo && <div className="muted" style={{ fontSize: '.85em' }}>{f.motivo}</div>}
                        {f.estado === 'error' && f.mensaje_error && (
                          <div style={{ fontSize: '.85em', color: 'var(--danger)' }}>{f.mensaje_error}</div>
                        )}
                        {f.estado === 'revertida' && (
                          <div className="muted" style={{ fontSize: '.85em' }}>
                            Devuelto{f.revertida_por ? ` por ${f.revertida_por}` : ''}
                            {f.revertida_at ? ` · ${fecha(f.revertida_at)}` : ''}
                          </div>
                        )}
                      </td>
                      <td>{f.origen ?? '—'}</td>
                      <td>{f.actor_name || f.actor || '—'}</td>
                      <td><span className={`badge ${et.clase}`}>{et.texto}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {f.estado === 'error' && puedeOperar ? (
                          <div style={{ display: 'flex', gap: '.35rem', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={trabajando}
                              onClick={() => correr(f.id, () => onReintentar(f.id), 'Entregado a MGG.')}
                              title="Volver a intentar la entrega. Es seguro repetirlo."
                            >
                              {trabajando ? '…' : 'Reintentar'}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              disabled={trabajando}
                              onClick={() => setPorRevertir(f)}
                              title={`Devolver los ${unidad} a Golden Touch`}
                            >
                              Devolver
                            </button>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {porRevertir && (
        <ConfirmDialog
          title={`Devolver ${unidad} a Golden Touch`}
          danger
          requireText="DEVOLVER"
          requireLabel="Escribí DEVOLVER para confirmar"
          message={
            `Vas a reponer «${porRevertir.resumen ?? 'este envío'}» en Golden Touch y a marcar el envío como devuelto.\n\n` +
            `Hacelo SOLO si confirmaste con MGG que nunca les llegó. Si allá sí entró y lo que falló fue el aviso de vuelta, ` +
            `devolverlo acá deja los mismos ${unidad} contados en las dos empresas.\n\n` +
            `Si no lo confirmaste todavía, cerrá esto y apretá «Reintentar»: es seguro y te dice la verdad.`
          }
          confirmText="Devolver"
          onCancel={() => setPorRevertir(null)}
          onConfirm={() => {
            const f = porRevertir;
            setPorRevertir(null);
            void correr(f.id, () => onRevertir(f.id), `Los ${unidad} volvieron a Golden Touch.`);
          }}
        />
      )}
    </>
  );
}
