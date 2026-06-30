import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { date, money, num } from '@/shared/lib/format';
import { listCajas } from './caja.repository';
import type { CajaCierre } from '@/shared/lib/types';

/**
 * Histórico de CIERRES de caja del Centro de Acopio. Lista las cajas cerradas
 * («Cierre de caja del [fecha]») y, al elegir una, muestra la foto congelada del
 * cierre: los saldos de las tarjetas y la tabla de movimientos tal como quedaron.
 */
export function HistoricoCajasModal({ onClose }: { onClose: () => void }) {
  const [cajas, setCajas] = useState<CajaCierre[]>([]);
  const [sel, setSel] = useState<CajaCierre | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCajas()
      .then((cs) => setCajas(cs.filter((c) => c.estado === 'cerrada')))
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el histórico'));
  }, []);

  const snap = sel?.resumen_json ?? null;
  const filas = useMemo(() => snap?.filas ?? [], [snap]);

  return (
    <Modal title="🗂 Histórico de cierres de caja · PERAMANAL GT" size="xl" onClose={onClose} footer={
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
    }>
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

      {!sel ? (
        !cajas.length ? (
          <p className="muted" style={{ margin: 0 }}>Aún no hay cierres de caja. Cuando cierres una caja, su resumen quedará acá.</p>
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
            <button className="btn btn-sm btn-ghost" onClick={() => setSel(null)}>← Volver al histórico</button>
          </div>

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
