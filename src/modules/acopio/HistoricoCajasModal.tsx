import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { date, money, num } from '@/shared/lib/format';
import { toast } from '@/shared/ui/Toast';
import { quienSync } from '@/shared/lib/directorioUsuarios';
import {
  listCajas, listCajaMovimientos, listClasificaciones, listCostoClases, recalcularCajaCerrada, MOTIVO_EDICION_MIN,
} from './caja.repository';
import { MovimientoCajaModal } from './MovimientoCajaModal';
import type { CajaCierre, CajaMovimiento, ClasificacionAcopio, CostoClase } from '@/shared/lib/types';

/**
 * Histórico de CIERRES de caja del Centro de Acopio. Lista las cajas cerradas
 * («Cierre de caja del [fecha]») y, al elegir una, muestra la foto congelada del
 * cierre: los saldos de las tarjetas y la tabla de movimientos tal como quedaron.
 */
export function HistoricoCajasModal({ onClose, canWrite = false, actor = 'sistema', actorName = null, onEditada }: {
  onClose: () => void;
  /** 11/11/2026: con escritura en el Centro de Costo se puede editar una caja cerrada (con motivo). */
  canWrite?: boolean;
  actor?: string;
  actorName?: string | null;
  onEditada?: () => void;
}) {
  const [cajas, setCajas] = useState<CajaCierre[]>([]);
  const [sel, setSel] = useState<CajaCierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Edición de la caja cerrada: primero el motivo, después los movimientos.
  const [pideMotivo, setPideMotivo] = useState(false);
  const [motivoStr, setMotivoStr] = useState('');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [movs, setMovs] = useState<CajaMovimiento[]>([]);
  const [clasif, setClasif] = useState<ClasificacionAcopio[]>([]);
  const [costos, setCostos] = useState<CostoClase[]>([]);
  const [editMov, setEditMov] = useState<CajaMovimiento | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  const cargarCajas = useCallback(async (mantenerId?: string) => {
    const cs = (await listCajas()).filter((c) => c.estado === 'cerrada');
    setCajas(cs);
    if (mantenerId) setSel(cs.find((c) => c.id === mantenerId) ?? null);
  }, []);
  useEffect(() => {
    cargarCajas().catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el histórico'));
  }, [cargarCajas]);

  // Al salir de una caja se termina la edición.
  useEffect(() => { setMotivo(null); setPideMotivo(false); setMotivoStr(''); setMovs([]); }, [sel?.id]);

  async function empezarEdicion() {
    const m = motivoStr.trim();
    if (m.length < MOTIVO_EDICION_MIN) { toast(`Escribe el motivo (al menos ${MOTIVO_EDICION_MIN} letras).`, 'warning'); return; }
    if (!sel) return;
    try {
      const [ms, cls, ccs] = await Promise.all([listCajaMovimientos(sel.id), listClasificaciones(), listCostoClases()]);
      setMovs(ms); setClasif(cls); setCostos(ccs);
      setMotivo(m); setPideMotivo(false);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron leer los movimientos', 'error'); }
  }

  async function trasGuardar(mov: CajaMovimiento) {
    if (!sel || !motivo) return;
    setEditMov(null);
    setRecalculando(true);
    try {
      const sigue = (await listCajaMovimientos(sel.id)).some((m) => m.id === mov.id);
      const r = await recalcularCajaCerrada({
        cajaId: sel.id, motivo, actor, actorName,
        cambio: `${sigue ? 'Editó' : 'Borró'} el movimiento «${mov.descripcion ?? 'sin descripción'}» del ${date(mov.fecha)}`,
      });
      toast(`${sel.numero} actualizada · saldo ${money(r.saldoAntes ?? 0)} → ${money(r.saldoDespues)}${r.arrastradas.length ? ` · también se corrigió ${r.arrastradas.join(', ')}` : ''}`, 'success');
      setMovs(await listCajaMovimientos(sel.id));
      await cargarCajas(sel.id);
      onEditada?.();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo rehacer el cierre', 'error'); }
    finally { setRecalculando(false); }
  }

  const snap = sel?.resumen_json ?? null;
  const filas = useMemo(() => snap?.filas ?? [], [snap]);

  return (
    <Modal title="🗂 Histórico de cierres de caja · PERAMANAL GT" size="xl" onClose={onClose} footer={
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
    }>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {!sel ? (
        !cajas.length ? (
          <p className="muted" style={{ margin: 0 }}>Aún no hay cierres de caja. Cuando cierres una caja, su resumen quedará aquí.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead><tr>
                <th>Cierre</th><th>Inicio</th><th>Cierre</th>
                <th style={{ textAlign: 'right' }}>Saldo final $</th>
                <th style={{ textAlign: 'right' }}>Saldo Kg</th>
                <th style={{ textAlign: 'right' }}>Tasa</th>
                <th></th>
              </tr></thead>
              <tbody>
                {cajas.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSel(c)} title="Ver el cierre">
                    <td style={{ fontWeight: 700 }}>{c.numero}{c.nombre ? ` · ${c.nombre}` : ''}</td>
                    <td className="mono">{c.fecha_inicio ? date(c.fecha_inicio) : '—'}</td>
                    <td className="mono">{c.fecha_fin ? date(c.fecha_fin) : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(c.saldo_final)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{c.resumen_json ? num(c.resumen_json.resumen.saldoKg) : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{c.resumen_json ? money(c.resumen_json.resumen.tasa) : '—'}</td>
                    <td className="muted" style={{ textAlign: 'right' }}>ver ↗</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
            <h3 style={{ margin: 0 }}>
              Cierre de caja del {snap?.fechaInicio ? date(snap.fechaInicio) : (sel.fecha_inicio ? date(sel.fecha_inicio) : '—')} al {sel.fecha_fin ? date(sel.fecha_fin) : (snap ? date(snap.fechaCierre) : '—')} · {sel.numero}
            </h3>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              {canWrite && !motivo && <button className="btn btn-sm btn-primary" onClick={() => setPideMotivo(true)}>✏️ Editar caja cerrada</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => setSel(null)}>← Volver al histórico</button>
            </div>
          </div>

          {pideMotivo && (
            <div className="card" style={{ marginBottom: '.8rem', borderLeft: '3px solid var(--warning, #f59e0b)' }}>
              <div className="card-title" style={{ marginBottom: '.4rem' }}>✏️ Editar {sel.numero} · caja cerrada</div>
              <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
                Escribe por qué se edita. Cada cambio queda registrado con tu nombre, el motivo y el saldo antes y después; si cambia el saldo final, también se corrige el «Saldo anterior» de la caja siguiente.
              </p>
              <textarea className="input" rows={2} value={motivoStr} onChange={(e) => setMotivoStr(e.target.value)} placeholder="Motivo de la edición (obligatorio)" autoFocus />
              <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setPideMotivo(false)}>Cancelar</button>
                <button className="btn btn-sm btn-primary" disabled={motivoStr.trim().length < MOTIVO_EDICION_MIN} onClick={() => void empezarEdicion()}>Continuar</button>
              </div>
            </div>
          )}

          {motivo && (
            <div className="card" style={{ marginBottom: '.8rem', borderLeft: '3px solid var(--warning, #f59e0b)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="card-title" style={{ margin: 0 }}>✏️ Editando {sel.numero} · motivo: <span style={{ fontWeight: 400 }}>{motivo}</span></div>
                <button className="btn btn-sm btn-ghost" onClick={() => setMotivo(null)} disabled={recalculando}>Terminar edición</button>
              </div>
              {recalculando && <p className="muted" style={{ fontSize: '.8rem' }}>Rehaciendo el cierre…</p>}
              {!movs.length ? <p className="muted" style={{ fontSize: '.82rem' }}>Esta caja no tiene movimientos propios para editar (los contratos se corrigen en Contratos).</p> : (
                <div className="table-wrap" style={{ marginTop: '.4rem' }}>
                  <table className="table" style={{ fontSize: '.8rem' }}>
                    <thead><tr><th>Fecha</th><th>Descripción</th><th>$ entregado</th><th>Kg</th><th>Gastos</th><th>Facturados</th><th></th></tr></thead>
                    <tbody>
                      {movs.map((m) => (
                        <tr key={m.id}>
                          <td className="mono" style={{ whiteSpace: 'nowrap' }}>{date(m.fecha)}</td>
                          <td>{m.descripcion ?? '—'}</td>
                          <td className="mono">{money(Number(m.usd_entregado) || 0)}</td>
                          <td className="mono">{num(Number(m.kg_cerrados) || 0)}</td>
                          <td className="mono">{money((Number(m.gastos) || 0) + (Number(m.nominas) || 0))}</td>
                          <td className="mono">{money(Number(m.facturados) || 0)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-sm btn-ghost" disabled={recalculando} onClick={() => setEditMov(m)}>✏️ Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!!sel.ediciones?.length && (
            <div className="card" style={{ marginBottom: '.8rem' }}>
              <div className="card-title" style={{ marginBottom: '.3rem' }}>📝 Ediciones con la caja cerrada ({sel.ediciones.length})</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.8rem' }}>
                {sel.ediciones.slice().reverse().map((ed, i) => (
                  <li key={i} style={{ marginBottom: '.25rem' }}>
                    <span className="mono">{new Date(ed.at).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}</span> · <strong>{ed.actor_name || quienSync(ed.actor)}</strong> · {ed.cambio}
                    <div className="muted">Motivo: {ed.motivo} · saldo {money(ed.saldo_antes ?? 0)} → <strong>{money(ed.saldo_despues)}</strong></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editMov && (
            <MovimientoCajaModal
              mov={editMov}
              cajaId={editMov.caja_id ?? null}
              clasificaciones={clasif}
              costoClases={costos}
              actor={actor}
              actorName={actorName}
              onClose={() => setEditMov(null)}
              onSaved={() => { void trasGuardar(editMov); }}
            />
          )}

          {!snap ? (
            <p className="muted" style={{ margin: 0 }}>Este cierre no guardó foto de resumen (cierre anterior a esta función).</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
                Período <strong>{snap.fechaInicio ? date(snap.fechaInicio) : '—'}</strong> → <strong>{date(snap.fechaCierre)}</strong> · {snap.filas.length} movimiento(s).
              </p>

              {/* Tarjetas congeladas del cierre */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
                <div className="card"><div className="card-title"><span>💲 Tasa</span></div><div className="mono" style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-3)' }}>{money(snap.resumen.tasa)} /Kg</div></div>
                <div className="card"><div className="card-title"><span>💵 USD entregados</span></div><div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>{money(snap.resumen.usdEntregado)}</div></div>
                <div className="card"><div className="card-title"><span>Saldo de caja</span></div><div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: snap.resumen.saldoUsd < 0 ? 'var(--danger)' : undefined }}>{money(snap.resumen.saldoUsd)}</div></div>
                <div className="card"><div className="card-title"><span>Saldo en Kg</span></div><div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: snap.resumen.saldoKg < 0 ? 'var(--danger)' : undefined }}>{num(snap.resumen.saldoKg)} Kg</div></div>
                <div className="card"><div className="card-title"><span>Gastos GT</span></div><div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--danger)' }}>{money(snap.resumen.gastos + snap.resumen.nominas)}</div></div>
                {!!snap.resumen.inversion && <div className="card"><div className="card-title"><span>Inversión</span></div><div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>{money(snap.resumen.inversion)}</div></div>}
              </div>

              {/* Tabla de movimientos congelada: todos los del período */}
              <div className="card-title" style={{ marginTop: '.4rem' }}><span>📋 Movimientos del período ({filas.length})</span></div>
              {!filas.length ? <p className="muted">Sin movimientos en este cierre.</p> : (
                <div className="table-wrap">
                  <table className="table" style={{ fontSize: '.8rem' }}>
                    <thead><tr>
                      <th>Fecha</th><th>Descripción</th><th>$Usd entregado</th><th>Kg Cerrados</th>
                      <th>Gastos</th><th>Saldo $ Usd</th><th>Saldo Kg</th>
                    </tr></thead>
                    <tbody>
                      {filas.map((f, i) => (
                        <tr key={i}>
                          <td className="mono" style={{ whiteSpace: 'nowrap' }}>{date(f.fecha)}</td>
                          <td style={{ fontWeight: 600 }}>{f.descripcion}</td>
                          <td className="mono">{f.usdEntregado == null ? '—' : money(f.usdEntregado)}</td>
                          <td className="mono" style={{ fontWeight: 700, color: 'var(--primary-3)' }}>{num(f.kgCerrados)}</td>
                          <td className="mono">{(() => { const g = (f.gastosGt ?? 0) + (f.nominasGt ?? 0); return g === 0 && f.gastosGt == null && f.nominasGt == null ? '—' : money(g); })()}</td>
                          <td className="mono"><strong>{money(f.saldoUsd)}</strong></td>
                          <td className="mono" style={{ fontWeight: 700, color: f.saldoKgCasiterita < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{num(f.saldoKgCasiterita)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Contratos de producción que estaban ACTIVOS al momento del cierre (referencia) */}
              {!!(snap.contratosActivos && snap.contratosActivos.length) && (
                <>
                  <div className="card-title" style={{ marginTop: '1rem' }}><span>📑 Contratos activos al cierre ({snap.contratosActivos.length})</span></div>
                  <div className="table-wrap">
                    <table className="table" style={{ fontSize: '.8rem' }}>
                      <thead><tr>
                        <th>Contrato</th><th>Fecha</th><th>Supervisor</th><th>Lugar extracción</th><th>Kg seco limpio</th>
                      </tr></thead>
                      <tbody>
                        {snap.contratosActivos.map((c, i) => (
                          <tr key={i}>
                            <td className="mono" style={{ fontWeight: 700 }}>{c.numero}</td>
                            <td className="mono" style={{ whiteSpace: 'nowrap' }}>{date(c.fecha)}</td>
                            <td>{c.supervisor || '—'}</td>
                            <td>{c.lugarExtraccion || '—'}</td>
                            <td className="mono" style={{ fontWeight: 700, color: 'var(--primary-3)' }}>{num(c.kgSecoLimpio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
