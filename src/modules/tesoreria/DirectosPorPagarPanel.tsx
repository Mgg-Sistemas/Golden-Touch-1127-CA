/* ============================================================
   Golden Touch · Tesorería · Directos por pagar
   Lista las COMPRAS y SERVICIOS DIRECTOS en estado "por pagar"
   (el analista ya montó la factura y los montos) para que Tesorería
   los PAGUE desde acá. Al pagar, sale de la caja correspondiente,
   (en compras) entra al inventario, y queda FINALIZADA. Reusa los
   modales de pago de Compra/Servicio Directo.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { money, dateTime } from '@/shared/lib/format';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { notify } from '@/shared/lib/notify';
import type { Caja, CajaSaldo } from '@/shared/lib/types';
import { listSaldos } from '@/modules/tesoreria/cajaSaldos.repository';
import { listComprasDirectas, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import {
  listServiciosDirectos, registrarAbonoServicio, listAbonosServicio,
  type ServicioDirecto, type AbonoServicio,
} from '@/modules/pedidos/serviciosDirectos.repository';
import { FinalizarCompraModal } from '@/modules/pedidos/CompraDirectaView';
import { FinalizarServicioModal } from '@/modules/pedidos/ServicioDirectoView';

/** Monto en su moneda (Bs → "Bs …"; el resto "$ …"). */
function montoMoneda(n: number | null | undefined, moneda: string | null | undefined): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
}

/** Equivalente a la otra moneda con la tasa de conversión del documento (si el analista convirtió). */
function equivConversion(gasto: number | null | undefined, moneda: string | null | undefined, tasa: number | null | undefined): string | null {
  const g = Number(gasto) || 0;
  const t = Number(tasa) || 0;
  if (g <= 0 || t <= 0) return null;
  const otra = moneda === 'Bs' ? 'USD' : 'Bs';
  const val = moneda === 'Bs' ? g / t : g * t;
  return `≈ ${montoMoneda(Math.round(val * 100) / 100, otra)} · tasa ${t.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`;
}

export function DirectosPorPagarPanel({ cajas, actor, actorName, onPaid }: {
  cajas: Caja[]; actor: string; actorName: string | null; onPaid: () => void;
}) {
  const [compras, setCompras] = useState<CompraDirecta[]>([]);
  const [servicios, setServicios] = useState<ServicioDirecto[]>([]);
  const [pagarC, setPagarC] = useState<CompraDirecta | null>(null);
  const [pagarS, setPagarS] = useState<ServicioDirecto | null>(null);
  const [abonarS, setAbonarS] = useState<ServicioDirecto | null>(null);

  const reload = useCallback(async () => {
    const [cs, ss] = await Promise.all([
      listComprasDirectas().catch(() => [] as CompraDirecta[]),
      listServiciosDirectos().catch(() => [] as ServicioDirecto[]),
    ]);
    setCompras(cs.filter((c) => c.estado === 'por_pagar'));
    setServicios(ss.filter((s) => s.estado === 'por_pagar'));
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['compras_directas', 'servicios_directos'], () => { void reload(); });

  const total = useMemo(
    () => compras.reduce((a, c) => a + (c.gasto ?? 0), 0) + servicios.reduce((a, s) => a + (s.gasto ?? 0), 0),
    [compras, servicios],
  );

  if (!compras.length && !servicios.length) return null;

  return (
    <div className="card" style={{ marginTop: '1rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>🧾 Directos por pagar{' '}
          <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#1a1a1a' }}>DIRECTO</span>
        </strong>
        <span className="muted mono">{compras.length + servicios.length} · {money(total)}</span>
      </div>
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
        El analista cargó la factura y los montos. Al pagar, el gasto sale de la caja elegida (en compras, entra al inventario) y queda <strong>Finalizada</strong>.
      </div>

      {compras.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table">
            <thead><tr><th colSpan={6}>🛒 Compras</th></tr><tr><th>Código</th><th>Material(es)</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.codigo ?? '—'}</td>
                  <td>{c.producto_nombre}{c.items.length > 1 ? <span className="muted"> · {c.items.length} ítems</span> : null}
                    {c.nota?.trim() && <div className="muted" style={{ fontSize: '.74rem', marginTop: '.15rem', whiteSpace: 'pre-wrap' }}>📝 {c.nota}</div>}</td>
                  <td>{c.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{c.actor_name || c.actor || '—'}<br />{dateTime(c.updated_at)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.gasto != null ? montoMoneda(c.gasto, c.moneda) : '—'}
                    {equivConversion(c.gasto, c.moneda, c.tasa_conversion) && <div className="muted" style={{ fontSize: '.7rem', fontWeight: 400 }}>{equivConversion(c.gasto, c.moneda, c.tasa_conversion)}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => setPagarC(c)} title="Pagar y finalizar la compra">💳 Pagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {servicios.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table">
            <thead><tr><th colSpan={6}>🔧 Servicios</th></tr><tr><th>Código</th><th>Servicio(s)</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.codigo ?? '—'}</td>
                  <td>{s.descripcion}{s.items.length > 1 ? <span className="muted"> · {s.items.length} ítems</span> : null}</td>
                  <td>{s.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{s.actor_name || s.actor || '—'}<br />{dateTime(s.updated_at)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{s.gasto != null ? montoMoneda(s.gasto, s.moneda) : '—'}
                    {equivConversion(s.gasto, s.moneda, s.tasa_conversion) && <div className="muted" style={{ fontSize: '.7rem', fontWeight: 400 }}>{equivConversion(s.gasto, s.moneda, s.tasa_conversion)}</div>}
                    {s.con_abonos && (
                      <div className="muted" style={{ fontSize: '.7rem', fontWeight: 400 }}>
                        <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#111' }}>ABONOS</span>{' '}
                        abonado {montoMoneda(Number(s.abonado_total) || 0, s.moneda)} · saldo {montoMoneda(Math.max(0, (Number(s.gasto) || 0) - (Number(s.abonado_total) || 0)), s.moneda)}
                      </div>
                    )}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {s.con_abonos
                      ? <button className="btn btn-sm btn-primary" onClick={() => setAbonarS(s)} title="Registrar un abono (pago parcial) del servicio">📆 Abonar</button>
                      : <button className="btn btn-sm btn-primary" onClick={() => setPagarS(s)} title="Pagar y finalizar el servicio">💳 Pagar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagarC && (
        <FinalizarCompraModal
          modo="pagar" compra={pagarC} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagarC(null)}
          onSaved={async () => { setPagarC(null); await reload(); onPaid(); }}
        />
      )}
      {pagarS && (
        <FinalizarServicioModal
          modo="pagar" servicio={pagarS} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setPagarS(null)}
          onSaved={async () => { setPagarS(null); await reload(); onPaid(); }}
        />
      )}
      {abonarS && (
        <AbonosServicioModal
          servicio={abonarS} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setAbonarS(null)}
          onSaved={async () => { setAbonarS(null); await reload(); onPaid(); }}
        />
      )}
    </div>
  );
}

/* ───────── Abonos (cuotas) de un servicio directo · Tesorería ───────── */

function AbonosServicioModal({ servicio, cajas, actor, actorName, onClose, onSaved }: {
  servicio: ServicioDirecto; cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const moneda = servicio.moneda ?? 'USD';
  const total = Math.round((Number(servicio.gasto) || 0) * 100) / 100;
  const abonado = Math.round((Number(servicio.abonado_total) || 0) * 100) / 100;
  const saldo = Math.round((total - abonado) * 100) / 100;

  const [abonos, setAbonos] = useState<AbonoServicio[]>([]);
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [cajaId, setCajaId] = useState('');
  const [monto, setMonto] = useState(String(saldo > 0 ? saldo : ''));
  const [nota, setNota] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listAbonosServicio(servicio.id).then(setAbonos).catch(() => setAbonos([])); }, [servicio.id]);
  useEffect(() => { listSaldos().then(setSaldos).catch(() => setSaldos([])); }, []);

  // Saldo REAL de una caja en la moneda del servicio (suma sus billeteras en esa moneda,
  // de caja_saldos). Si la caja aún no tiene saldos multimoneda, usa el saldo legado.
  const saldoCajaEnMoneda = (cId: string): number => {
    const rows = saldos.filter((s) => s.caja_id === cId && s.moneda === moneda);
    if (rows.length) return Math.round(rows.reduce((a, r) => a + (Number(r.saldo) || 0), 0) * 100) / 100;
    const c = cajas.find((x) => x.id === cId);
    return Number(c?.saldo) || 0;
  };
  // Solo cajas con saldo en la moneda del servicio (de ahí puede salir el abono).
  const cajasConSaldo = cajas.filter((c) => saldoCajaEnMoneda(c.id) > 0);
  // Al cargar los saldos, elegí por defecto la primera caja con fondos en la moneda.
  useEffect(() => {
    if (!cajaId && cajasConSaldo.length) setCajaId(cajasConSaldo[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldos]);
  const dispCaja = cajaId ? saldoCajaEnMoneda(cajaId) : 0;

  const montoNum = Math.round((Number(monto) || 0) * 100) / 100;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja de la que sale el dinero.'); return; }
    if (montoNum <= 0) { setError('Indicá el monto del abono.'); return; }
    if (montoNum > saldo + 0.01) { setError(`El abono supera el saldo pendiente (${montoMoneda(saldo, moneda)}).`); return; }
    if (montoNum > dispCaja + 0.01) { setError(`La caja no tiene suficiente ${moneda}. Disponible: ${montoMoneda(dispCaja, moneda)}.`); return; }
    if (file && file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/')) { setError('El comprobante debe ser PDF o imagen.'); return; }
    setSaving(true);
    try {
      await registrarAbonoServicio({ servicio, cajaId, monto: montoNum, nota: nota || null, file, actor, actorName });
      const saldado = montoNum >= saldo - 0.01;
      notify(
        saldado
          ? `Servicio ${servicio.codigo ?? ''} saldado con el último abono · ${montoMoneda(montoNum, moneda)}`
          : `Abono registrado · ${montoMoneda(montoNum, moneda)} · saldo ${montoMoneda(saldo - montoNum, moneda)}`,
        'success', { link: '#/app/tesoreria' },
      );
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar el abono.'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
      <button type="submit" form="sd-abono-form" className="btn btn-primary" disabled={saving}>
        {saving ? 'Registrando…' : `Registrar abono · ${montoMoneda(montoNum, moneda)}`}
      </button>
    </>
  );

  return (
    <Modal title={`📆 Abonos · ${servicio.codigo ?? servicio.descripcion}`} size="md" onClose={onClose} footer={footer}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
        <div><span className="muted">Total:</span> <strong className="mono">{montoMoneda(total, moneda)}</strong></div>
        <div><span className="muted">Abonado:</span> <strong className="mono">{montoMoneda(abonado, moneda)}</strong></div>
        <div><span className="muted">Saldo:</span> <strong className="mono" style={{ color: saldo > 0 ? 'var(--warning)' : 'var(--success)' }}>{montoMoneda(saldo, moneda)}</strong></div>
      </div>

      {abonos.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: '.6rem' }}>
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead><tr><th>Fecha</th><th className="num">Abono</th><th className="num">Saldo</th><th>Por</th></tr></thead>
            <tbody>
              {abonos.map((a) => (
                <tr key={a.id}>
                  <td className="muted">{dateTime(a.at)}</td>
                  <td className="num mono">{montoMoneda(Number(a.monto), a.moneda ?? moneda)}</td>
                  <td className="num mono">{a.saldo_restante != null ? montoMoneda(Number(a.saldo_restante), a.moneda ?? moneda) : '—'}</td>
                  <td className="muted" style={{ fontSize: '.75rem' }}>{a.actor_name || a.actor || '—'}{a.nota ? ` · ${a.nota}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saldo <= 0 ? (
        <div className="card" style={{ borderColor: 'var(--success)' }}>Servicio <strong>saldado</strong>. No queda saldo por abonar.</div>
      ) : (
        <form id="sd-abono-form" onSubmit={submit}>
          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}
          <div className="form-row">
            <label>Caja (de dónde sale el dinero)</label>
            <SearchSelect value={cajaId} onChange={setCajaId} disabled={!cajasConSaldo.length} style={{ maxWidth: 340 }}
              placeholder={cajasConSaldo.length ? '🔍 Buscar caja…' : `— sin cajas con saldo en ${moneda} —`}
              options={cajasConSaldo.map((c) => ({ value: c.id, label: `${c.nombre} · ${montoMoneda(saldoCajaEnMoneda(c.id), moneda)}` }))} />
            {cajaId && <small className="muted">Disponible en la caja: <strong className="mono">{montoMoneda(dispCaja, moneda)}</strong> ({moneda})</small>}
          </div>
          <div className="form-row" style={{ maxWidth: 220 }}>
            <label>Monto del abono ({moneda})</label>
            <input className="input mono" type="number" min={0} step="any" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" />
            <small className="muted">Máximo el saldo: {montoMoneda(saldo, moneda)}.{' '}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMonto(String(saldo))}>Pagar saldo</button>
            </small>
          </div>
          <div className="form-row">
            <label>Comprobante <span className="muted">(PDF o imagen · opcional)</span></label>
            <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="form-row">
            <label>Nota <span className="muted">(opcional)</span></label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: primer abono, transferencia…" />
          </div>
        </form>
      )}
    </Modal>
  );
}
