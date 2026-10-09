/* ============================================================
   Golden Touch · RRHH · Tabulador de sueldos por cargo

   Se abre desde la pestaña Nómina. Por nómina (GT o MTO):
     · la tabla de cuánto se gana por cargo (agregar, cambiar, borrar), y
       cada cambio queda en el historial del tabulador;
     · «Aplicar tabulador»: iguala el sueldo de los ACTIVOS al de su cargo,
       con vista previa de quién cambia y de cuánto a cuánto; cada cambio
       entra al histórico salarial de la persona;
     · los históricos salariales imprimibles (PDF y Excel, general o de una
       persona, con filtro de nómina y fechas).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { money, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { EmpresaRrhh, Personal } from '@/shared/lib/types';
import { listPersonal } from './personal.repository';
import { CargarSueldosHistoricosModal } from './CargarSueldosHistoricosModal';
import {
  ETIQUETA_ACCION, cargosFaltantes, claveCargo, conteoPorCargo, errorTabulador, filtrarHistorialSalarial,
  nombreCompleto, normalizarCargo, planAplicarTabulador, type TabuladorCargo, type TabuladorHistorial,
  type FilaHistorialSalarial,
} from './tabulador';
import {
  aplicarTabulador, borrarTabulador, guardarTabulador, listHistorialSalarial, listHistorialTabulador, listTabulador,
} from './tabulador.repository';
import { etiquetaVariacion, variacionSueldo } from './sueldos';

const hoy = () => new Date().toISOString().slice(0, 10);
const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

/** El botón que va en la pestaña Nómina; maneja su propio modal. */
export function TabuladorBoton({ empresa, canWrite }: { empresa: EmpresaRrhh; canWrite: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setAbierto(true)}
        title="Sueldo mensual por cargo, aplicarlo al personal activo e históricos salariales">📊 Tabulador por cargo</button>
      {abierto && <TabuladorModal empresa={empresa} canWrite={canWrite} onClose={() => setAbierto(false)} />}
    </>
  );
}

type Vista = 'tabulador' | 'historial';

export function TabuladorModal({ empresa, canWrite, onClose }: { empresa: EmpresaRrhh; canWrite: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<TabuladorCargo[]>([]);
  const [hist, setHist] = useState<TabuladorHistorial[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('tabulador');
  const [editando, setEditando] = useState<TabuladorCargo | 'nuevo' | null>(null);
  const [porBorrar, setPorBorrar] = useState<TabuladorCargo | null>(null);
  const [motivoBorrar, setMotivoBorrar] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [historicos, setHistoricos] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const [t, h, p] = await Promise.all([listTabulador(empresa), listHistorialTabulador(empresa), listPersonal(false, empresa)]);
      setTab(t); setHist(h); setPersonal(p); setError(null);
    } catch (e) {
      setError(errMsg(e, 'No se pudo cargar el tabulador'));
    } finally { setCargando(false); }
  }, [empresa]);

  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['rrhh_tabulador', 'rrhh_tabulador_historial', 'personal'], () => { void recargar(); });

  const conteo = useMemo(() => conteoPorCargo(personal, empresa), [personal, empresa]);
  const plan = useMemo(() => planAplicarTabulador(personal, tab, empresa), [personal, tab, empresa]);
  const faltantes = useMemo(() => cargosFaltantes(personal, tab, empresa), [personal, tab, empresa]);

  async function borrar(t: TabuladorCargo) {
    try {
      await borrarTabulador(t.id, motivoBorrar);
      toast('Cargo sacado del tabulador', 'success');
      setPorBorrar(null); setMotivoBorrar('');
      await recargar();
    } catch (e) { toast(errMsg(e, 'No se pudo borrar'), 'error'); }
  }

  const porBorrarConteo = porBorrar ? conteo.get(claveCargo(porBorrar.cargo)) : undefined;

  return (
    <Modal
      title={`Tabulador de sueldos por cargo · Nómina ${empresa}`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-ghost" onClick={() => setHistoricos(true)}
            title="Históricos salariales en PDF o Excel: general o de una persona">📄 Históricos salariales</button>
          {canWrite && <button className="btn btn-ghost" onClick={() => setEditando('nuevo')}>+ Agregar cargo</button>}
          {canWrite && (
            <button className="btn btn-primary" onClick={() => setAplicando(true)} disabled={!plan.cambios.length}
              title={plan.cambios.length ? 'Igualar el sueldo de los activos al de su cargo' : 'Todos los activos con cargo en el tabulador ya ganan lo que dice'}>
              ⚖ Aplicar tabulador{plan.cambios.length ? ` (${plan.cambios.length})` : ''}
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
        <div className="tira" style={{ flex: '1 1 150px' }}>
          <div className="tira-titulo">Cargos en el tabulador</div>
          <div className="tira-valor mono">{tab.length}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 150px' }}>
          <div className="tira-titulo">Activos que cambiarían</div>
          <div className="tira-valor mono" style={{ color: plan.cambios.length ? 'var(--warning)' : undefined }}>{plan.cambios.length}</div>
        </div>
        <div className="tira" style={{ flex: '1 1 150px' }}>
          <div className="tira-titulo">Activos con cargo sin tabulador</div>
          <div className="tira-valor mono">{plan.sinTabulador.length}</div>
        </div>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: '.3rem', marginBottom: '.6rem' }}>
        <button className={`btn btn-sm ${vista === 'tabulador' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVista('tabulador')}>Tabulador</button>
        <button className={`btn btn-sm ${vista === 'historial' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVista('historial')}>
          Historial del tabulador ({hist.length})
        </button>
      </div>

      {cargando && <p className="muted">Cargando…</p>}

      {!cargando && vista === 'tabulador' && (
        <>
          {!tab.length && <EmptyState icon="📊" message="Todavía no hay cargos en el tabulador de esta nómina." />}
          {!!tab.length && (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.85rem' }}>
                <thead>
                  <tr>
                    <th>Cargo</th>
                    <th style={{ textAlign: 'right' }}>Sueldo mensual (USD)</th>
                    <th style={{ textAlign: 'center' }}>Activos</th>
                    <th>Sueldos actuales</th>
                    <th>Último cambio</th>
                    {canWrite && <th style={{ textAlign: 'center' }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {tab.map((t) => {
                    const c = conteo.get(claveCargo(t.cargo));
                    const distintos = c ? c.sueldos.filter((s) => s !== Number(t.monto)).length : 0;
                    const rango = c && c.sueldos.length
                      ? (Math.min(...c.sueldos) === Math.max(...c.sueldos) ? money(c.sueldos[0]) : `${money(Math.min(...c.sueldos))} – ${money(Math.max(...c.sueldos))}`)
                      : '—';
                    return (
                      <tr key={t.id}>
                        <td><strong>{t.cargo}</strong>{t.nota && <div className="muted" style={{ fontSize: '.76rem' }}>{t.nota}</div>}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{money(t.monto)}</td>
                        <td className="mono" style={{ textAlign: 'center' }}>{c?.activos ?? 0}</td>
                        <td className="mono">
                          {rango}
                          {distintos > 0 && <span className="badge" style={{ marginLeft: '.4rem', color: 'var(--warning)' }}>{distintos} distinto(s)</span>}
                        </td>
                        <td className="muted" style={{ fontSize: '.76rem' }}>{dateTime(t.updated_at)}{t.updated_by && <div>{t.updated_by}</div>}</td>
                        {canWrite && (
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-sm btn-ghost" title="Cambiar monto o cargo" onClick={() => setEditando(t)}>✏️</button>
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Sacar del tabulador"
                              onClick={() => { setMotivoBorrar(''); setPorBorrar(t); }}>🗑</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!!faltantes.length && (
            <small className="muted" style={{ display: 'block', marginTop: '.6rem' }}>
              Cargos de personal activo que <strong>no</strong> están en el tabulador (no se tocan al aplicar): {faltantes.join(', ')}.
            </small>
          )}
        </>
      )}

      {!cargando && vista === 'historial' && (
        hist.length ? (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead>
                <tr><th>Cuándo</th><th>Qué</th><th>Cargo</th><th style={{ textAlign: 'right' }}>Antes</th><th style={{ textAlign: 'right' }}>Después</th><th>Motivo</th><th>Quién</th></tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.id}>
                    <td className="mono" style={{ fontSize: '.78rem' }}>{dateTime(h.created_at)}</td>
                    <td>{ETIQUETA_ACCION[h.accion]}</td>
                    <td>{h.cargo}{h.cargo_anterior && <div className="muted" style={{ fontSize: '.76rem' }}>antes: {h.cargo_anterior}</div>}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{h.monto_anterior == null ? '—' : money(h.monto_anterior)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{h.monto_nuevo == null ? '—' : money(h.monto_nuevo)}</td>
                    <td>{h.motivo || <span className="muted">—</span>}</td>
                    <td className="muted" style={{ fontSize: '.78rem' }}>{h.created_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon="🕘" message="Sin cambios registrados en el tabulador." />
      )}

      <small className="muted" style={{ display: 'block', marginTop: '.6rem' }}>
        El monto es el <strong>sueldo mensual total acordado</strong> en dólares (el mismo número que el «sueldo base» de la ficha;
        la nómina lo reparte después en sueldo y bono). Cambiar el tabulador <strong>no</strong> cambia el sueldo de nadie
        hasta que se usa <strong>Aplicar tabulador</strong>.
      </small>

      {editando && (
        <EditorCargo
          empresa={empresa}
          cargo={editando === 'nuevo' ? null : editando}
          existentes={tab}
          sugerencias={faltantes}
          activos={(c) => conteo.get(claveCargo(c))?.activos ?? 0}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); void recargar(); }}
        />
      )}

      {porBorrar && (
        <ConfirmDialog
          title="Sacar cargo del tabulador"
          danger
          confirmText="Sí, sacar"
          message={<>El cargo deja de estar en el tabulador. <strong>No cambia el sueldo de nadie</strong>: solo que al aplicar
            el tabulador, las personas con este cargo ya no se tocan. Queda anotado en el historial del tabulador.</>}
          preview={
            <VistaPrevia titulo="Se va a sacar">
              <Dato label="Cargo"><strong>{porBorrar.cargo}</strong></Dato>
              <Dato label="Sueldo mensual"><span className="mono">{money(porBorrar.monto)}</span></Dato>
              <Dato label="Activos con este cargo"><span className="mono">{porBorrarConteo?.activos ?? 0}</span></Dato>
              <Dato label="Nota">{porBorrar.nota || undefined}</Dato>
              <Dato label="Motivo">
                <input className="input" value={motivoBorrar} onChange={(e) => setMotivoBorrar(e.target.value)}
                  placeholder="Opcional: por qué se saca" />
              </Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void borrar(porBorrar); }}
          onCancel={() => setPorBorrar(null)}
        />
      )}

      {aplicando && (
        <AplicarTabuladorModal
          empresa={empresa}
          personal={personal}
          tabulador={tab}
          onClose={() => setAplicando(false)}
          onAplicado={() => { setAplicando(false); void recargar(); }}
        />
      )}

      {historicos && <HistoricosSalarialesModal empresaInicial={empresa} canWrite={canWrite} onClose={() => setHistoricos(false)} />}
    </Modal>
  );
}

/* ---------------- Agregar / cambiar un cargo ---------------- */

function EditorCargo({
  empresa, cargo, existentes, sugerencias, activos, onClose, onGuardado,
}: {
  empresa: EmpresaRrhh;
  cargo: TabuladorCargo | null;
  existentes: TabuladorCargo[];
  sugerencias: string[];
  activos: (cargo: string) => number;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(cargo?.cargo ?? '');
  const [monto, setMonto] = useState(cargo ? String(cargo.monto) : '');
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState(cargo?.nota ?? '');
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = useMemo(() => {
    const t = monto.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }, [monto]);
  const problema = errorTabulador(nombre, montoNum, existentes, cargo?.id ?? null);
  const sinCambios = !!cargo && normalizarCargo(nombre) === cargo.cargo && Number(montoNum) === Number(cargo.monto)
    && (nota.trim() || null) === (cargo.nota ?? null);
  const v = cargo && montoNum != null && Number.isFinite(montoNum) ? variacionSueldo(cargo.monto, montoNum) : null;

  async function guardar() {
    setConfirmar(false);
    if (problema) { setError(problema); return; }
    setGuardando(true); setError(null);
    try {
      await guardarTabulador({ id: cargo?.id ?? null, empresa, cargo: nombre, monto: Number(montoNum), motivo, nota });
      toast(cargo ? 'Tabulador actualizado' : 'Cargo agregado al tabulador', 'success');
      onGuardado();
    } catch (e) {
      setError(errMsg(e, 'No se pudo guardar'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal
      title={cargo ? `Cambiar cargo del tabulador · ${cargo.cargo}` : `Agregar cargo al tabulador · Nómina ${empresa}`}
      compact
      onClose={() => { if (!guardando) onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardando || !!problema || sinCambios}
            onClick={() => setConfirmar(true)}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      {error && <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      <div className="form-grid">
        <div className="form-row">
          <label>Cargo *</label>
          <input className="input" list="tabulador-cargos-sugeridos" value={nombre} autoFocus
            onChange={(e) => setNombre(e.target.value)} placeholder="Ej. MOLINERO" />
          <datalist id="tabulador-cargos-sugeridos">
            {sugerencias.map((s) => <option key={s} value={s} />)}
          </datalist>
          <small className="muted">Se compara sin tildes ni mayúsculas con el cargo de la ficha del personal.</small>
        </div>
        <div className="form-row">
          <label>Sueldo mensual total (USD) *</label>
          <input className="input mono" type="number" min={0} step="any" value={monto}
            onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
          {v && v.sentido !== 'igual' && (
            <small style={{ color: v.sentido === 'sube' ? 'var(--success)' : 'var(--warning)' }}>
              {etiquetaVariacion(v)} respecto de {money(cargo?.monto)}
            </small>
          )}
        </div>
        <div className="form-row">
          <label>Motivo del cambio</label>
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional · queda en el historial" />
        </div>
        <div className="form-row">
          <label>Nota</label>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {problema && nombre.trim() && monto.trim() && (
        <div className="aviso warning sm" style={{ marginTop: '.5rem' }}><span className="aviso-icono">⚠</span><div>{problema}</div></div>
      )}

      {confirmar && (
        <ConfirmDialog
          title={cargo ? 'Guardar cambio del tabulador' : 'Agregar cargo al tabulador'}
          confirmText="Sí, guardar"
          message={<>Queda en el historial del tabulador. <strong>No cambia el sueldo de nadie</strong> hasta usar «Aplicar tabulador».</>}
          preview={
            <VistaPrevia titulo={cargo ? 'Se va a cambiar' : 'Se va a agregar'}>
              <Dato label="Cargo">
                {cargo && cargo.cargo !== normalizarCargo(nombre)
                  ? <>{cargo.cargo} → <strong>{normalizarCargo(nombre)}</strong></>
                  : <strong>{normalizarCargo(nombre)}</strong>}
              </Dato>
              <Dato label="Sueldo mensual">
                <span className="mono">
                  {cargo && Number(cargo.monto) !== Number(montoNum) ? <>{money(cargo.monto)} → </> : null}
                  <strong>{money(Number(montoNum))}</strong>
                </span>
              </Dato>
              <Dato label="Activos con este cargo"><span className="mono">{activos(nombre)}</span></Dato>
              <Dato label="Motivo">{motivo.trim() || undefined}</Dato>
              <Dato label="Nota">{nota.trim() || undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void guardar(); }}
          onCancel={() => setConfirmar(false)}
        />
      )}
    </Modal>
  );
}

/* ---------------- Aplicar tabulador ---------------- */

function AplicarTabuladorModal({
  empresa, personal, tabulador, onClose, onAplicado,
}: {
  empresa: EmpresaRrhh;
  personal: Personal[];
  tabulador: TabuladorCargo[];
  onClose: () => void;
  onAplicado: () => void;
}) {
  const plan = useMemo(() => planAplicarTabulador(personal, tabulador, empresa), [personal, tabulador, empresa]);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [desde, setDesde] = useState(hoy());
  const [motivo, setMotivo] = useState('Tabulador por cargo');
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegidos = plan.cambios.filter((c) => !excluidos.has(c.persona.id));
  const totalAntes = elegidos.reduce((a, c) => a + c.antes, 0);
  const totalDespues = elegidos.reduce((a, c) => a + c.despues, 0);
  const suben = elegidos.filter((c) => c.despues > c.antes).length;

  function alternar(id: string) {
    setExcluidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function aplicar() {
    setConfirmar(false); setGuardando(true); setError(null);
    try {
      const r = await aplicarTabulador(empresa, elegidos.map((c) => c.persona.id), desde || null, motivo);
      const saltados = elegidos.length - r.length;
      toast(`Tabulador aplicado: ${r.length} sueldo(s) cambiado(s) y registrado(s) en el histórico`
        + (saltados > 0 ? ` · ${saltados} ya no hacía(n) falta` : ''), 'success');
      onAplicado();
    } catch (e) {
      setError(errMsg(e, 'No se pudo aplicar el tabulador'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal
      title={`Aplicar tabulador · Nómina ${empresa}`}
      size="lg"
      onClose={() => { if (!guardando) onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => setConfirmar(true)} disabled={guardando || !elegidos.length || !motivo.trim()}>
            {guardando ? 'Aplicando…' : `Aplicar a ${elegidos.length} persona(s)`}
          </button>
        </>
      }
    >
      {error && <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      <p className="muted" style={{ marginTop: 0, fontSize: '.86rem' }}>
        Solo personal <strong>activo</strong> cuyo cargo está en el tabulador y cuyo sueldo es distinto. Desmarca a quien no deba cambiar.
        Cada cambio entra al <strong>histórico salarial</strong> de la persona.
      </p>
      <div className="form-grid" style={{ marginBottom: '.6rem' }}>
        <div className="form-row">
          <label>Desde cuándo rige *</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Motivo (va al histórico) *</label>
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      </div>

      {!plan.cambios.length ? (
        <EmptyState icon="✅" message="Todos los activos con cargo en el tabulador ya ganan lo que dice." />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" checked={!excluidos.size}
                    onChange={() => setExcluidos(excluidos.size ? new Set() : new Set(plan.cambios.map((c) => c.persona.id)))} />
                </th>
                <th>Trabajador</th><th>Cargo</th>
                <th style={{ textAlign: 'right' }}>Sueldo actual</th>
                <th style={{ textAlign: 'right' }}>Tabulador</th>
                <th style={{ textAlign: 'right' }}>Variación</th>
              </tr>
            </thead>
            <tbody>
              {plan.cambios.map((c) => {
                const v = variacionSueldo(c.antes, c.despues);
                const fuera = excluidos.has(c.persona.id);
                return (
                  <tr key={c.persona.id} style={fuera ? { opacity: .5 } : undefined}>
                    <td><input type="checkbox" checked={!fuera} onChange={() => alternar(c.persona.id)} /></td>
                    <td>{nombreCompleto(c.persona)}{c.persona.cedula && <div className="muted" style={{ fontSize: '.76rem' }}>C.I. {c.persona.cedula}</div>}</td>
                    <td>{c.cargo}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(c.antes)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}><strong>{money(c.despues)}</strong></td>
                    <td className="mono" style={{ textAlign: 'right', color: v.sentido === 'sube' ? 'var(--success)' : 'var(--warning)' }}>
                      {etiquetaVariacion(v)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!!plan.sinTabulador.length && (
        <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
          {plan.sinTabulador.length} activo(s) con un cargo que no está en el tabulador no se tocan.
        </small>
      )}

      {confirmar && (
        <ConfirmDialog
          title="Aplicar tabulador"
          confirmText={`Sí, cambiar ${elegidos.length} sueldo(s)`}
          message={<>Se cambia el <strong>sueldo base</strong> de estas personas y cada cambio queda en su histórico salarial.
            Las nóminas ya cargadas no se tocan; la próxima que se cargue usa el sueldo nuevo.</>}
          preview={
            <VistaPrevia titulo="Se va a aplicar">
              <Dato label="Personas"><span className="mono">{elegidos.length}</span> ({suben} suben · {elegidos.length - suben} bajan)</Dato>
              <Dato label="Total mensual">
                <span className="mono">{money(totalAntes)} → <strong>{money(totalDespues)}</strong></span>
              </Dato>
              <Dato label="Rige desde"><span className="mono">{date(desde || hoy())}</span></Dato>
              <Dato label="Motivo">{motivo.trim()}</Dato>
              <Dato label="Quiénes">
                <div style={{ maxHeight: 140, overflow: 'auto', fontSize: '.8rem' }}>
                  {elegidos.map((c) => (
                    <div key={c.persona.id}>{nombreCompleto(c.persona)}: <span className="mono">{money(c.antes)} → {money(c.despues)}</span></div>
                  ))}
                </div>
              </Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void aplicar(); }}
          onCancel={() => setConfirmar(false)}
        />
      )}
    </Modal>
  );
}

/* ---------------- Históricos salariales (PDF / Excel) ---------------- */

export function HistoricosSalarialesModal({ empresaInicial, canWrite = false, onClose }: { empresaInicial: EmpresaRrhh; canWrite?: boolean; onClose: () => void }) {
  const [cargarExcel, setCargarExcel] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaRrhh | 'todas'>(empresaInicial);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [filas, setFilas] = useState<FilaHistorialSalarial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<'pdf' | 'xlsx' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const emp = empresa === 'todas' ? undefined : empresa;
      const [p, f] = await Promise.all([listPersonal(false, emp), listHistorialSalarial({ empresa, desde, hasta })]);
      setPersonal(p); setFilas(f); setError(null);
    } catch (e) {
      setError(errMsg(e, 'No se pudo cargar el histórico'));
    } finally { setCargando(false); }
  }, [empresa, desde, hasta]);

  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['personal_sueldos', 'personal'], () => { void recargar(); });

  const persona = personal.find((p) => p.id === personaId) ?? null;
  const visibles = useMemo(
    () => filtrarHistorialSalarial(filas, { empresa, desde, hasta, personalId: personaId || null }),
    [filas, empresa, desde, hasta, personaId],
  );
  const personas = new Set(visibles.map((r) => r.personal_id)).size;

  async function bajar(formato: 'pdf' | 'xlsx') {
    setOcupado(formato);
    try {
      const rep = await import('./historialSalarialReportes');
      if (persona) {
        if (!visibles.length) throw new Error('Esta persona no tiene cambios de sueldo en ese rango.');
        if (formato === 'pdf') {
          const { descargarHistorialSueldoPdf } = await import('./historialSueldoPdf');
          await descargarHistorialSueldoPdf(persona, visibles);
        } else {
          await rep.descargarHistorialSueldoExcel(persona, visibles);
        }
      } else if (formato === 'pdf') {
        await rep.descargarHistorialSalarialGeneralPdf(visibles, { empresa, desde, hasta });
      } else {
        await rep.descargarHistorialSalarialGeneralExcel(visibles, { empresa, desde, hasta });
      }
    } catch (e) {
      toast(errMsg(e, 'No se pudo generar el archivo'), 'error');
    } finally { setOcupado(null); }
  }

  return (
    <Modal
      title="Históricos salariales"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {canWrite && (
            <button className="btn btn-ghost" onClick={() => setCargarExcel(true)}
              title="Pasar al sistema los sueldos viejos que se llevaban en Excel (no cambia el sueldo de hoy)">📥 Cargar históricos (Excel)</button>
          )}
          <button className="btn btn-ghost" disabled={!visibles.length || !!ocupado} onClick={() => void bajar('xlsx')}>
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button className="btn btn-primary" disabled={!visibles.length || !!ocupado} onClick={() => void bajar('pdf')}>
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF'}
          </button>
        </>
      }
    >
      {error && <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}><span className="aviso-icono">⛔</span><div>{error}</div></div>}
      <div className="form-grid">
        <div className="form-row">
          <label>Nómina</label>
          <select className="input" value={empresa} onChange={(e) => { setEmpresa(e.target.value as EmpresaRrhh | 'todas'); setPersonaId(''); }}>
            <option value="GT">Nómina GT</option>
            <option value="MTO">Nómina MTO</option>
            <option value="todas">Las dos (GT y MTO)</option>
          </select>
        </div>
        <div className="form-row">
          <label>Trabajador</label>
          <SearchSelect value={personaId} onChange={setPersonaId} placeholder="Todos (histórico general)"
            options={[{ value: '', label: 'Todos (histórico general)' },
              ...personal.map((p) => ({ value: p.id, label: `${nombreCompleto(p)}${p.cedula ? ` · ${p.cedula}` : ''}${p.activo ? '' : ' (inactivo)'}` }))]} />
        </div>
        <div className="form-row">
          <label>Desde (rige)</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Hasta (rige)</label>
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      <div className="muted" style={{ margin: '.6rem 0', fontSize: '.86rem' }}>
        {cargando ? 'Cargando…' : <>{persona ? <>Histórico <strong>individual</strong> de {nombreCompleto(persona)}</> : <>Histórico <strong>general</strong></>}: {visibles.length} cambio(s) de {personas} persona(s).</>}
      </div>

      {!cargando && !visibles.length && <EmptyState icon="💵" message="No hay cambios de sueldo con esos filtros." />}
      {!cargando && !!visibles.length && (
        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead>
              <tr><th>Trabajador</th>{empresa === 'todas' && <th>Nómina</th>}<th>Desde</th><th style={{ textAlign: 'right' }}>Antes</th><th style={{ textAlign: 'right' }}>Después</th><th>Motivo</th><th>Nota</th></tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id}>
                  <td>{nombreCompleto(r.persona)}</td>
                  {empresa === 'todas' && <td>{r.persona.empresa}</td>}
                  <td className="mono">{date(r.fecha)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.sueldo_anterior == null ? '—' : money(r.sueldo_anterior)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{money(r.sueldo_nuevo)}</td>
                  <td>
                    {r.motivo}
                    {r.nota && <div className="muted" style={{ fontSize: '.76rem' }}>Nota: {r.nota}</div>}
                  </td>
                  <td>{r.nota || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cargarExcel && <CargarSueldosHistoricosModal onClose={() => setCargarExcel(false)} onCargado={() => void recargar()} />}
    </Modal>
  );
}
