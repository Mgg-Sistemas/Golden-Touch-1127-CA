/* ============================================================
   Golden Touch · RRHH · Historial de sueldo

   El sueldo de una persona era un solo número que se pisaba: cambiarlo
   borraba el anterior y no quedaba ni cuándo ni por qué. Aquí se ve la línea
   completa —de cuánto a cuánto, desde cuándo y con qué motivo— y es el ÚNICO
   lugar donde se cambia, justamente para que no haya cambio sin motivo.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { money, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal, PersonalSueldo } from '@/shared/lib/types';
import {
  MOTIVOS_SUELDO, MOTIVO_SIN_REGISTRAR, errorCambioSueldo, etiquetaVariacion, motivoFinal, variacionSueldo,
} from './sueldos';
import { borrarRenglonSueldo, cambiarSueldo, listHistorialSueldo, registrarSueldoHistorico } from './sueldos.repository';
import { MOTIVO_HISTORICO, errorSueldoHistorico, topeHistorico } from './sueldosHistoricos';
import { descargarHistorialSueldoPdf } from './historialSueldoPdf';

const hoy = () => new Date().toISOString().slice(0, 10);

export function HistorialSueldoModal({
  persona, canWrite, isAdmin, onClose, onCambio,
}: {
  persona: Personal;
  canWrite: boolean;
  isAdmin: boolean;
  onClose: () => void;
  /** Para que la lista de atrás muestre el sueldo nuevo sin recargar la página. */
  onCambio: () => void;
}) {
  const [filas, setFilas] = useState<PersonalSueldo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  /** 'cambio' = el sueldo de hoy en adelante; 'historico' = un sueldo viejo (no toca la ficha). */
  const [modo, setModo] = useState<'cambio' | 'historico'>('cambio');
  const [guardando, setGuardando] = useState(false);
  const [porBorrar, setPorBorrar] = useState<PersonalSueldo | null>(null);

  // Campos del cambio
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState<string>(MOTIVOS_SUELDO[0]);
  const [otro, setOtro] = useState('');
  const [desde, setDesde] = useState(hoy());
  const [nota, setNota] = useState('');

  const actual = Number(persona.sueldo_base) || 0;

  const recargar = useCallback(async () => {
    try {
      setFilas(await listHistorialSueldo(persona.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial');
    } finally { setCargando(false); }
  }, [persona.id]);

  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['personal_sueldos'], () => { void recargar(); });

  // El monto escrito, o null cuando el campo está vacío: vacío NO es cero.
  const montoNum = useMemo(() => {
    const t = monto.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }, [monto]);

  const motivoElegido = motivoFinal(motivo, otro);
  const tope = topeHistorico(filas);
  const errorActual = () => modo === 'historico'
    ? errorSueldoHistorico(montoNum, desde, motivoElegido, tope, hoy(), filas.map((r) => r.fecha))
    : errorCambioSueldo(actual, montoNum, motivoElegido);
  const problema = abierto ? errorActual() : null;
  const previa = modo === 'cambio' && montoNum != null && Number.isFinite(montoNum) ? variacionSueldo(actual, montoNum) : null;
  const motivos: readonly string[] = modo === 'historico' ? [MOTIVO_HISTORICO, ...MOTIVOS_SUELDO] : MOTIVOS_SUELDO;
  // Máximo del calendario en modo histórico: el día antes del sueldo vigente (o hoy).
  const maxHistorico = (() => {
    if (!tope) return hoy();
    const d = new Date(`${tope}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  function abrir(m: 'cambio' | 'historico') {
    limpiar(); setModo(m); setAbierto(true); setError(null);
    if (m === 'historico') { setMotivo(MOTIVO_HISTORICO); setDesde(''); }
  }

  function limpiar() {
    setMonto(''); setMotivo(MOTIVOS_SUELDO[0]); setOtro(''); setDesde(hoy()); setNota('');
  }

  async function guardar() {
    const err = errorActual();
    if (err) { setError(err); return; }
    setGuardando(true); setError(null);
    try {
      if (modo === 'historico') {
        await registrarSueldoHistorico({
          personalId: persona.id, fecha: desde, sueldo: Number(montoNum),
          motivo: motivoElegido, nota: nota.trim() || null,
        });
        toast('Sueldo histórico agregado. El sueldo de hoy no cambió.', 'success');
        limpiar(); setAbierto(false);
        await recargar();
        return;
      }
      await cambiarSueldo({
        personalId: persona.id,
        sueldoNuevo: Number(montoNum),
        motivo: motivoElegido,
        fecha: desde || null,
        nota: nota.trim() || null,
      });
      toast('Sueldo cambiado y registrado en el historial', 'success');
      limpiar(); setAbierto(false);
      await recargar();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el sueldo');
    } finally { setGuardando(false); }
  }

  async function borrar(r: PersonalSueldo) {
    setPorBorrar(null);
    try {
      await borrarRenglonSueldo(r.id);
      await recargar();
      toast('Renglón borrado', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo borrar', 'error');
    }
  }

  const nombre = `${persona.nombre} ${persona.apellido ?? ''}`.trim();
  const variacionPorBorrar = porBorrar ? variacionSueldo(porBorrar.sueldo_anterior, porBorrar.sueldo_nuevo) : null;

  return (
    <Modal
      title={`Historial de sueldo · ${nombre}`}
      size="lg"
      onClose={() => { if (!guardando) onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cerrar</button>
          <button className="btn btn-ghost" disabled={!filas.length}
            onClick={() => { void descargarHistorialSueldoPdf(persona, filas).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error')); }}
            title="El papel que respalda el aumento, para el expediente">↓ PDF</button>
          <button className="btn btn-ghost" disabled={!filas.length}
            onClick={() => { void import('./historialSalarialReportes').then((m) => m.descargarHistorialSueldoExcel(persona, filas)).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error')); }}
            title="El mismo historial en Excel">↓ Excel</button>
          {canWrite && !abierto && (
            <button className="btn btn-ghost" onClick={() => abrir('historico')}
              title="Cargar un sueldo viejo (de años anteriores) sin cambiar el sueldo de hoy">
              📜 Agregar sueldo anterior
            </button>
          )}
          {canWrite && !abierto && (
            <button className="btn btn-primary" onClick={() => abrir('cambio')}>
              💵 Cambiar sueldo
            </button>
          )}
          {canWrite && abierto && (
            <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando || !!problema}>
              {guardando ? 'Guardando…' : modo === 'historico' ? 'Guardar sueldo anterior' : 'Guardar el cambio'}
            </button>
          )}
        </>
      }
    >
      {error && (
        <div className="aviso danger" style={{ marginBottom: '.6rem' }}>
          <span className="aviso-icono">⛔</span><div><strong>Error:</strong> {error}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <div className="tira" style={{ flex: '1 1 160px' }}>
          <div className="tira-titulo">Sueldo base mensual hoy</div>
          <div className="tira-valor mono">{actual > 0 ? money(actual) : '—'}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 160px' }}>
          <div className="tira-titulo">Cambios registrados</div>
          <div className="tira-valor mono">{filas.length}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 160px' }}>
          <div className="tira-titulo">Último cambio</div>
          <div className="tira-valor mono" style={{ fontSize: '.95rem' }}>
            {filas.length ? date(filas[0].fecha) : '—'}
          </div>
        </div>
      </div>

      {abierto && (
        <div className="card" style={{ marginBottom: '.8rem', padding: '.8rem' }}>
          {modo === 'historico' && (
            <div className="aviso info sm" style={{ marginBottom: '.6rem' }}>
              <span className="aviso-icono">📜</span>
              <div>Sueldo <strong>anterior</strong>: queda en el historial con su fecha, pero <strong>no cambia el sueldo de hoy</strong>.
                {tope ? <> Tiene que ser antes del {date(tope)} (sueldo vigente).</> : null}</div>
            </div>
          )}
          <div className="form-grid">
            <div className="form-row">
              <label>{modo === 'historico' ? 'Sueldo que ganaba (USD, mensual) *' : 'Sueldo nuevo (USD, mensual) *'}</label>
              <input className="input mono" type="number" min={0} step="any" autoFocus
                value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
              {previa && previa.sentido !== 'igual' && (
                <small style={{ color: previa.sentido === 'sube' ? 'var(--success)' : 'var(--warning)' }}>
                  {etiquetaVariacion(previa)} respecto de {money(actual)}
                </small>
              )}
            </div>
            <div className="form-row">
              <label>{modo === 'historico' ? 'Desde cuándo regía *' : 'Desde cuándo rige *'}</label>
              <input className="input" type="date" value={desde} max={modo === 'historico' ? maxHistorico : undefined}
                onChange={(e) => setDesde(e.target.value)} />
              <small className="muted">{modo === 'historico'
                ? 'Si solo sabes el año, pon el 1 de enero de ese año.'
                : 'Puede ser anterior a hoy: queda guardado también el día en que se cargó.'}</small>
            </div>
            <div className="form-row">
              <label>Motivo del cambio *</label>
              <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {motivo === 'Otro' && (
                <input className="input" style={{ marginTop: '.35rem' }} value={otro}
                  onChange={(e) => setOtro(e.target.value)} placeholder="Escribe el motivo" />
              )}
            </div>
            <div className="form-row">
              <label>Nota (opcional)</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. acordado en reunión del 20/09" />
            </div>
          </div>
          {problema && (
            <div className="aviso warning sm" style={{ marginTop: '.5rem' }}>
              <span className="aviso-icono">⚠</span><div>{problema}</div>
            </div>
          )}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }}
            onClick={() => { setAbierto(false); setError(null); }} disabled={guardando}>Cancelar</button>
        </div>
      )}

      {cargando && <p className="muted">Cargando…</p>}
      {!cargando && !filas.length && (
        <EmptyState icon="💵" message="Todavía no hay cambios de sueldo registrados para esta persona." />
      )}

      {!cargando && !!filas.length && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th>Desde</th>
                <th style={{ textAlign: 'right' }}>Antes</th>
                <th style={{ textAlign: 'right' }}>Después</th>
                <th style={{ textAlign: 'right' }}>Variación</th>
                <th>Motivo</th>
                <th>Cargado</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => {
                const v = variacionSueldo(r.sueldo_anterior, r.sueldo_nuevo);
                const primero = r.sueldo_anterior == null;
                const sinMotivo = r.motivo === MOTIVO_SIN_REGISTRAR;
                return (
                  <tr key={r.id}>
                    <td className="mono">
                      {date(r.fecha)}
                      {r.historico && <div className="muted" style={{ fontSize: '.72rem' }} title="Sueldo viejo cargado después: no movió el sueldo de la ficha">📜 histórico</div>}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{primero ? '—' : money(r.sueldo_anterior)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(r.sueldo_nuevo)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: primero ? undefined : v.sentido === 'sube' ? 'var(--success)' : 'var(--warning)' }}>
                      {primero ? '—' : etiquetaVariacion(v)}
                    </td>
                    <td style={sinMotivo ? { color: 'var(--warning)' } : undefined}>
                      {sinMotivo ? '⚠ Sin motivo registrado' : r.motivo}
                      {r.nota && <div className="muted" style={{ fontSize: '.76rem' }}>{r.nota}</div>}
                    </td>
                    <td className="muted" style={{ fontSize: '.76rem' }}>
                      {dateTime(r.created_at)}
                      {r.created_by && <div>{r.created_by}</div>}
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                          title="Borrar este renglón (no cambia el sueldo de hoy)"
                          onClick={() => setPorBorrar(r)}>🗑</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <small className="muted" style={{ display: 'block', marginTop: '.6rem' }}>
        Los renglones <strong>no se editan</strong>: si uno quedó mal, un administrador lo borra y se vuelve a cargar.
        Un renglón <strong>⚠ sin motivo registrado</strong> significa que el sueldo se movió por fuera de esta pantalla;
        la base lo anota igual para que el cambio no desaparezca del historial.
      </small>

      {porBorrar && (
        <ConfirmDialog
          title="Borrar renglón del historial"
          danger
          confirmText="Sí, borrar"
          message={<><strong>No cambia el sueldo que la persona tiene hoy</strong> ({actual > 0 ? money(actual) : 'sin sueldo cargado'}):
            solo saca este renglón del historial. Los renglones no se editan ni se recuperan; si hacía falta, hay que volver a cargarlo.</>}
          preview={
            <VistaPrevia titulo="Se va a borrar">
              <Dato label="Desde"><span className="mono">{date(porBorrar.fecha)}</span></Dato>
              <Dato label="Sueldo">
                {porBorrar.sueldo_anterior != null
                  ? <span className="mono">{money(porBorrar.sueldo_anterior)} → <strong>{money(porBorrar.sueldo_nuevo)}</strong></span>
                  : <span className="mono"><strong>{money(porBorrar.sueldo_nuevo)}</strong> · primer sueldo registrado</span>}
              </Dato>
              <Dato label="Variación">
                {porBorrar.sueldo_anterior != null && variacionPorBorrar
                  ? <span className="mono" style={{ color: variacionPorBorrar.sentido === 'sube' ? 'var(--success)' : 'var(--warning)' }}>
                    {etiquetaVariacion(variacionPorBorrar)}
                  </span>
                  : undefined}
              </Dato>
              <Dato label="Motivo">
                {porBorrar.motivo === MOTIVO_SIN_REGISTRAR ? '⚠ Sin motivo registrado' : porBorrar.motivo}
              </Dato>
              <Dato label="Nota">{porBorrar.nota || undefined}</Dato>
              <Dato label="Cargado">{dateTime(porBorrar.created_at)}</Dato>
              <Dato label="Lo registró">{porBorrar.created_by || undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void borrar(porBorrar); }}
          onCancel={() => setPorBorrar(null)}
        />
      )}
    </Modal>
  );
}
