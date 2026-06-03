import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, date as fmtDate } from '@/shared/lib/format';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { GestionarCajasModal } from '@/modules/salidas/GestionarCajasModal';
import { listDirectorioUsuarios, type PersonaDirectorio } from '@/modules/salidas/salidas.repository';
import type { Caja, Moneda, MovimientoCaja } from '@/shared/lib/types';
import { HistorialTasasModal } from './HistorialTasasModal';
import { getTasaHoy, aBs, aExtranjero, round2 } from './tasas.repository';
import {
  listCajasActivas, trasladoDinero, ajustarSaldo, ingresarDinero,
  registrarGasto, pagarPersonal, disponibilidadFinanciera, listLibroMayor,
  type Disponibilidad,
} from './tesoreria.repository';
import {
  listOrdenesPorPagar, pagarOrdenCompra, type OrdenPorPagar,
} from '@/modules/pedidos/pedidos.repository';
import { descargarOrdenCompraPdf } from '@/modules/pedidos/ordenCompraPdf';
import { listOfertasByOrden, getPdfOfertaSignedUrl } from '@/modules/pedidos/ofertas.repository';
import type { OfertaProveedor } from '@/shared/lib/types';

const TIPO_MOV_LABEL: Record<string, string> = {
  ingreso: '⬇ Ingreso', salida: '⬆ Egreso', traslado_salida: '↔ Traslado (sale)',
  traslado_entrada: '↔ Traslado (entra)', ajuste: '⚙ Ajuste',
};
const CAT_LABEL: Record<string, string> = {
  gasto: 'Gasto', pago_personal: 'Pago a personal', pago_oc: 'Pago de compra',
};

/** Formatea un monto con el símbolo de su moneda (2 decimales). */
function monto(n: number | null | undefined, moneda: string): string {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'USD' ? `$ ${v}` : `${moneda} ${v}`;
}

export function TesoreriaPage() {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('tesoreria', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre ?? null;

  const [disp, setDisp] = useState<Disponibilidad | null>(null);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [libro, setLibro] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'ingreso' | 'gasto' | 'traslado' | 'pago' | 'cajas' | 'tasas' | 'porpagar' | 'conversor'>('none');
  const [cajaSel, setCajaSel] = useState<Caja | null>(null);
  const [porPagarCount, setPorPagarCount] = useState(0);

  // Filtros del registro de movimientos
  const [fMoneda, setFMoneda] = useState<'' | Moneda>('');
  const [fTipo, setFTipo] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');

  const reload = useCallback(async () => {
    const [d, cs, mov, pp] = await Promise.all([
      disponibilidadFinanciera(),
      listCajasActivas(),
      listLibroMayor({ moneda: fMoneda || undefined, tipo: fTipo || undefined, desde: fDesde || undefined, hasta: fHasta || undefined }),
      listOrdenesPorPagar().catch(() => [] as OrdenPorPagar[]),
    ]);
    setDisp(d); setCajas(cs); setLibro(mov); setPorPagarCount(pp.length);
  }, [fMoneda, fTipo, fDesde, fHasta]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => {
        const msg = e instanceof Error ? e.message
          : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message)
          : 'Error al cargar';
        toast(msg, 'error');
      })
      .finally(() => setLoading(false));
  }, [reload]);

  const cerrarYRecargar = async () => { setModal('none'); await reload(); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>🏦 Tesorería</h1>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>Flujo de dinero, registro de movimientos y pagos.</p>
        </div>
      </div>

      <>
          {/* Disponibilidad financiera */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <DispCard titulo="Disponible en USD" valor={monto(disp?.usd ?? 0, 'USD')} />
            <DispCard titulo="Equivalente en Bs" valor={monto(disp?.usdEnBs ?? 0, 'Bs')} nota={disp?.tasaUsd != null ? `× tasa ${monto(disp.tasaUsd, 'Bs')}` : 'sin tasa del día'} />
            <DispCard titulo="Disponible en Bs" valor={monto(disp?.bs ?? 0, 'Bs')} />
            <DispCard titulo="Total general (Bs)" valor={monto(disp?.totalBs ?? 0, 'Bs')} destacado />
          </div>

          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {canWrite && (
              <>
                <button className="btn btn-primary" onClick={() => setModal('porpagar')}>
                  🧾 ÓRDENES PENDIENTES POR PAGAR{porPagarCount ? ` (${porPagarCount})` : ''}
                </button>
                <button className="btn btn-ghost" onClick={() => setModal('ingreso')}>+ Ingreso</button>
                <button className="btn btn-ghost" onClick={() => setModal('gasto')}>− Gasto</button>
                <button className="btn btn-ghost" onClick={() => setModal('traslado')}>↔ Traspaso de dinero</button>
                <button className="btn btn-ghost" onClick={() => setModal('pago')}>👥 Pago a personal</button>
                <button className="btn btn-ghost" onClick={() => setModal('cajas')}>🏦 Cajas</button>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => setModal('conversor')}>💱 Conversor $ ⇄ Bs</button>
            <button className="btn btn-ghost" onClick={() => setModal('tasas')}>📈 Historial Tasas</button>
          </div>

          {/* Saldos por caja (clic = ver detalle, ajustar y movimientos) */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {cajas.map((c) => (
              <button key={c.id} className="card" onClick={() => setCajaSel(c)}
                style={{ padding: '.6rem .9rem', minWidth: 150, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card, transparent)' }}
                title="Ver detalle, ajustar saldo y movimientos">
                <div className="muted" style={{ fontSize: '.72rem' }}>{c.nombre} <span style={{ float: 'right' }}>⚙</span></div>
                <strong className="mono">{monto(c.saldo, c.moneda)}</strong>
              </button>
            ))}
          </div>

          {/* Registro de movimientos */}
          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
              <span>Registro de movimientos</span>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                  Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
                </label>
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
                  Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
                </label>
                {(fDesde || fHasta) && <button className="btn btn-sm btn-ghost" onClick={() => { setFDesde(''); setFHasta(''); }}>✕ Fechas</button>}
                <select className="select" value={fMoneda} onChange={(e) => setFMoneda(e.target.value as '' | Moneda)} style={{ width: 'auto' }}>
                  <option value="">Toda moneda</option><option value="USD">USD</option><option value="Bs">Bs</option>
                </select>
                <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Todo movimiento</option>
                  <option value="ingreso">Ingresos</option><option value="salida">Egresos</option>
                  <option value="traslado_salida">Traslados</option><option value="ajuste">Ajustes</option>
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.85rem' }}>
                <thead><tr><th>Fecha</th><th>Caja</th><th>Movimiento</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
                  {!loading && !libro.length && <tr><td colSpan={6}><EmptyState message="Sin movimientos" /></td></tr>}
                  {!loading && libro.map((m) => {
                    const egreso = m.tipo === 'salida' || m.tipo === 'traslado_salida'
                  || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
                    const concepto = [CAT_LABEL[m.categoria ?? ''] , m.beneficiario, m.motivo].filter(Boolean).join(' · ') || '—';
                    return (
                      <tr key={m.id}>
                        <td>{dateTime(m.at)}</td>
                        <td>{m.caja?.nombre ?? '—'}</td>
                        <td>{TIPO_MOV_LABEL[m.tipo] ?? m.tipo}</td>
                        <td>{concepto}</td>
                        <td className="mono" style={{ textAlign: 'right', color: egreso ? 'var(--danger)' : 'var(--success)' }}>{egreso ? '−' : '+'}{monto(m.monto, m.moneda)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto(m.saldo_despues, m.moneda)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
      </>

      {modal === 'ingreso' && <IngresoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'gasto' && <GastoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'traslado' && <TrasladoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'pago' && <PagoPersonalModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'cajas' && <GestionarCajasModal actor={actor} actorName={actorName} onClose={() => setModal('none')} onCambioAplicado={reload} />}
      {modal === 'tasas' && <TasasGate onClose={() => setModal('none')} />}
      {modal === 'conversor' && <ConversorModal onClose={() => setModal('none')} />}
      {modal === 'porpagar' && <OrdenesPorPagarModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onPaid={reload} />}
      {cajaSel && <CajaDetalleModal caja={cajaSel} canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setCajaSel(null)} onChanged={async () => { await reload(); }} />}
    </div>
  );
}

/* ───────────── Detalle de caja (ajustar saldo + movimientos) ───────────── */

function CajaDetalleModal({ caja, canWrite, actor, actorName, onClose, onChanged }: {
  caja: Caja; canWrite: boolean; actor: string; actorName: string | null; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const [movs, setMovs] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoSaldo, setNuevoSaldo] = useState(String(caja.saldo ?? 0));
  const [motivo, setMotivo] = useState('');
  const [ingMonto, setIngMonto] = useState('');
  const [ingMotivo, setIngMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saldoTrasIngreso = round2((Number(caja.saldo) || 0) + (Number(ingMonto) || 0));

  const reload = useCallback(async () => {
    setLoading(true);
    try { setMovs(await listLibroMayor({ cajaId: caja.id })); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos', 'error'); }
    finally { setLoading(false); }
  }, [caja.id]);
  useEffect(() => { void reload(); }, [reload]);

  async function ajustar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!motivo.trim()) { setError('Indicá el motivo del ajuste.'); return; }
    setSaving(true);
    try {
      await ajustarSaldo(caja.id, Number(nuevoSaldo) || 0, motivo.trim(), actor, actorName);
      notify(`Saldo ajustado · ${caja.nombre}: ${monto(Number(nuevoSaldo) || 0, caja.moneda)}`, 'success', { link: '#/app/tesoreria' });
      setMotivo('');
      await reload();
      await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo ajustar.'); }
    finally { setSaving(false); }
  }

  async function ingresar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if ((Number(ingMonto) || 0) <= 0) { setError('El monto a ingresar debe ser mayor que 0.'); return; }
    setSaving(true);
    try {
      await ingresarDinero(caja.id, Number(ingMonto) || 0, ingMotivo.trim(), actor, actorName);
      notify(`Ingreso · ${caja.nombre}: +${monto(Number(ingMonto) || 0, caja.moneda)} → ${monto(saldoTrasIngreso, caja.moneda)}`, 'success', { link: '#/app/tesoreria' });
      setIngMonto(''); setIngMotivo('');
      await reload();
      await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo ingresar.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Caja · ${caja.nombre}`} size="lg" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ marginBottom: '.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <div className="muted" style={{ fontSize: '.74rem' }}>Saldo actual ({caja.moneda})</div>
          <strong className="mono" style={{ fontSize: '1.3rem' }}>{monto(caja.saldo, caja.moneda)}</strong>
        </div>
      </div>

      {canWrite && (
        <form onSubmit={ingresar} className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Ingresar dinero (suma al saldo)</div>
          <div className="form-grid">
            <div className="form-row"><label>Monto a ingresar ({caja.moneda})</label>
              <input className="input mono" type="number" min={0} step="0.01" value={ingMonto} onChange={(e) => setIngMonto(e.target.value)} placeholder="0,00" /></div>
            <div className="form-row"><label>Concepto (opcional)</label>
              <input className="input" value={ingMotivo} onChange={(e) => setIngMotivo(e.target.value)} placeholder="De dónde entra el dinero" /></div>
          </div>
          {(Number(ingMonto) || 0) > 0 && (
            <div className="muted" style={{ marginTop: '.4rem', fontSize: '.82rem' }}>
              <span className="mono">{monto(caja.saldo, caja.moneda)}</span> + <span className="mono">{monto(Number(ingMonto) || 0, caja.moneda)}</span> = <strong className="mono">{monto(saldoTrasIngreso, caja.moneda)}</strong>
            </div>
          )}
          <div style={{ textAlign: 'right', marginTop: '.5rem' }}>
            <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Ingresando…' : '+ Ingresar'}</button>
          </div>
        </form>
      )}

      {canWrite && (
        <form onSubmit={ajustar} className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Ajustar saldo (corrige al valor indicado)</div>
          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {error}</div>}
          <div className="form-grid">
            <div className="form-row"><label>Nuevo saldo ({caja.moneda})</label>
              <input className="input mono" type="number" step="0.01" value={nuevoSaldo} onChange={(e) => setNuevoSaldo(e.target.value)} required /></div>
            <div className="form-row"><label>Motivo</label>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se ajusta" required /></div>
          </div>
          <div style={{ textAlign: 'right', marginTop: '.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Ajustando…' : 'Aplicar ajuste'}</button>
          </div>
          <small className="muted">El ajuste <strong>fija</strong> el saldo al valor indicado (conciliación), no lo suma. Queda como movimiento “Ajuste”.</small>
        </form>
      )}

      <div className="card">
        <div className="card-title" style={{ marginBottom: '.5rem' }}>Movimientos de esta caja</div>
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !movs.length && <tr><td colSpan={5}><EmptyState message="Sin movimientos en esta caja" /></td></tr>}
              {!loading && movs.map((m) => {
                const egreso = m.tipo === 'salida' || m.tipo === 'traslado_salida'
                  || (m.tipo === 'ajuste' && Number(m.saldo_despues) < Number(m.saldo_antes));
                const concepto = [CAT_LABEL[m.categoria ?? ''], m.beneficiario, m.motivo, m.destino].filter(Boolean).join(' · ') || '—';
                return (
                  <tr key={m.id}>
                    <td>{dateTime(m.at)}</td>
                    <td>{TIPO_MOV_LABEL[m.tipo] ?? m.tipo}</td>
                    <td>{concepto}</td>
                    <td className="mono" style={{ textAlign: 'right', color: egreso ? 'var(--danger)' : 'var(--success)' }}>{egreso ? '−' : '+'}{monto(m.monto, m.moneda)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(m.saldo_despues, m.moneda)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function DispCard({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="card" style={destacado ? { borderColor: 'var(--brand, #ff8a00)' } : undefined}>
      <div className="muted" style={{ fontSize: '.74rem' }}>{titulo}</div>
      <strong className="mono" style={{ fontSize: '1.25rem' }}>{valor}</strong>
      {nota && <div className="muted" style={{ fontSize: '.68rem', marginTop: '.2rem' }}>{nota}</div>}
    </div>
  );
}

/* ───────────── Modales ───────────── */

function IngresoModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [concepto, setConcepto] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const saldoFinal = round2((Number(caja?.saldo) || 0) + (Number(montoStr) || 0));

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja.'); return; }
    if ((Number(montoStr) || 0) <= 0) { setError('El monto a ingresar debe ser mayor que 0.'); return; }
    setSaving(true);
    try {
      await ingresarDinero(cajaId, Number(montoStr) || 0, concepto, actor, actorName);
      notify(`Ingreso registrado: ${monto(Number(montoStr) || 0, caja?.moneda ?? 'Bs')} · saldo ${monto(saldoFinal, caja?.moneda ?? 'Bs')}`, 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); setSaving(false); }
  }

  return (
    <Modal title="Ingresar dinero" size="md" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="teso-ingreso" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar ingreso'}</button></>
    }>
      <form id="teso-ingreso" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Caja (moneda)</label>
            <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
              {!cajas.length && <option value="">— sin cajas —</option>}
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Monto a ingresar</label>
            <input className="input mono" type="number" min={0} step="0.01" value={montoStr} onChange={(e) => setMontoStr(e.target.value)} required />
          </div>
        </div>
        <div className="form-row">
          <label>Concepto</label>
          <input className="input" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="De dónde entra el dinero" required />
        </div>
        {caja && (Number(montoStr) || 0) > 0 && (
          <div className="card" style={{ marginTop: '.4rem' }}>
            <span className="muted">Saldo:</span>{' '}
            <strong className="mono">{monto(caja.saldo, caja.moneda)}</strong>
            {' + '}<strong className="mono">{monto(Number(montoStr) || 0, caja.moneda)}</strong>
            {' = '}<strong className="mono">{monto(saldoFinal, caja.moneda)}</strong>
          </div>
        )}
      </form>
    </Modal>
  );
}

function GastoModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [concepto, setConcepto] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja.'); return; }
    setSaving(true);
    try {
      await registrarGasto({ cajaId, monto: Number(montoStr) || 0, concepto, actor, actorName });
      notify(`Gasto registrado: ${monto(Number(montoStr) || 0, caja?.moneda ?? 'Bs')}`, 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); setSaving(false); }
  }

  return (
    <Modal title="Registrar gasto" size="md" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="teso-gasto" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar gasto'}</button></>
    }>
      <form id="teso-gasto" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Caja (moneda)</label>
            <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
              {!cajas.length && <option value="">— sin cajas —</option>}
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Monto</label>
            <input className="input mono" type="number" min={0} step="0.01" value={montoStr} onChange={(e) => setMontoStr(e.target.value)} required />
          </div>
        </div>
        <div className="form-row">
          <label>Concepto</label>
          <input className="input" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="A qué corresponde el gasto" required />
          <small className="muted">El gasto queda etiquetado por la moneda de la caja y aparece en el registro de movimientos.</small>
        </div>
      </form>
    </Modal>
  );
}

function TrasladoModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [origenId, setOrigenId] = useState(cajas[0]?.id ?? '');
  const [destinoId, setDestinoId] = useState('');
  const [montoStr, setMontoStr] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origen = cajas.find((c) => c.id === origenId) ?? null;
  // Solo cajas de la misma moneda como destino.
  const destinos = cajas.filter((c) => c.id !== origenId && origen && c.moneda === origen.moneda);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!origenId || !destinoId) { setError('Elegí caja origen y destino.'); return; }
    setSaving(true);
    try {
      await trasladoDinero({ origenId, destinoId, monto: Number(montoStr) || 0, motivo: motivo || null, actor, actorName });
      notify('Traspaso de dinero registrado', 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo trasladar.'); setSaving(false); }
  }

  return (
    <Modal title="Traspaso de dinero" size="md" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="teso-tras" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Trasladar'}</button></>
    }>
      <form id="teso-tras" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Desde</label>
            <select className="select" value={origenId} onChange={(e) => { setOrigenId(e.target.value); setDestinoId(''); }}>
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Hacia (misma moneda)</label>
            <select className="select" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
              <option value="">— elegir —</option>
              {destinos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row"><label>Monto</label><input className="input mono" type="number" min={0} step="0.01" value={montoStr} onChange={(e) => setMontoStr(e.target.value)} required /></div>
          <div className="form-row"><label>Motivo (opcional)</label><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        </div>
      </form>
    </Modal>
  );
}

function PagoPersonalModal({ cajas, actor, actorName, onClose, onSaved }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [concepto, setConcepto] = useState('');
  const [personas, setPersonas] = useState<PersonaDirectorio[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;

  useEffect(() => { listDirectorioUsuarios().then(setPersonas).catch(() => setPersonas([])); }, []);

  const seleccion = personas
    .map((p) => ({ p, monto: Number(montos[p.id]) || 0 }))
    .filter((x) => x.monto > 0);
  const total = useMemo(() => Math.round(seleccion.reduce((a, x) => a + x.monto, 0) * 100) / 100, [seleccion]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja.'); return; }
    if (!seleccion.length) { setError('Indicá el monto de al menos una persona.'); return; }
    setSaving(true);
    try {
      await pagarPersonal({
        cajaId, concepto,
        pagos: seleccion.map((x) => ({ usuarioId: x.p.id, nombre: `${x.p.nombre} ${x.p.apellido}`.trim(), monto: x.monto })),
        actor, actorName,
      });
      notify(`Pago a personal: ${monto(total, caja?.moneda ?? 'Bs')} · ${seleccion.length} persona(s)`, 'success', { link: '#/app/tesoreria' });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar.'); setSaving(false); }
  }

  return (
    <Modal title="Pago a personal (multipagos)" size="lg" onClose={onClose} footer={
      <><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="teso-pago" className="btn btn-primary" disabled={saving}>{saving ? 'Pagando…' : `Pagar ${monto(total, caja?.moneda ?? 'Bs')}`}</button></>
    }>
      <form id="teso-pago" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Caja (moneda)</label>
            <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
          </div>
          <div className="form-row"><label>Concepto</label><input className="input" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Quincena, bono, etc." /></div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead><tr><th>Persona</th><th>Cargo</th><th style={{ width: 160 }}>Monto a pagar</th></tr></thead>
            <tbody>
              {!personas.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin personal registrado.</td></tr>}
              {personas.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre} {p.apellido}</td>
                  <td className="muted">{p.cargo}</td>
                  <td><input className="input mono" type="number" min={0} step="0.01" value={montos[p.id] ?? ''} onChange={(e) => setMontos((m) => ({ ...m, [p.id]: e.target.value }))} placeholder="0,00" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </Modal>
  );
}


/** Carga la tasa del día y abre el modal de historial. */
function TasasGate({ onClose }: { onClose: () => void }) {
  const [tasa, setTasa] = useState<Awaited<ReturnType<typeof getTasaHoy>> | null>(null);
  useEffect(() => { getTasaHoy().then(setTasa).catch(() => setTasa({ usd: null, eur: null, fecha: null })); }, []);
  return <HistorialTasasModal tasaHoy={tasa} onClose={onClose} />;
}

/* ───────────── Conversor $ ⇄ Bs (tasa BCV del día) ───────────── */

function ConversorModal({ onClose }: { onClose: () => void }) {
  const [dir, setDir] = useState<'usd_bs' | 'bs_usd'>('usd_bs');
  const [montoStr, setMontoStr] = useState('');
  const [tasaStr, setTasaStr] = useState('');
  const [fecha, setFecha] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // Trae la tasa USD del BCV del día como valor por defecto (editable: corrección manual).
  useEffect(() => {
    getTasaHoy()
      .then((t) => { if (t.usd != null) setTasaStr(String(t.usd)); setFecha(t.fecha); })
      .catch(() => { /* sin tasa: el usuario la ingresa manualmente */ })
      .finally(() => setCargando(false));
  }, []);

  const montoNum = Number(montoStr) || 0;
  const tasaNum = Number(tasaStr) || 0;
  const resultado = dir === 'usd_bs' ? aBs(montoNum, tasaNum) : aExtranjero(montoNum, tasaNum);
  const monedaEntrada = dir === 'usd_bs' ? 'USD' : 'Bs';
  const monedaSalida = dir === 'usd_bs' ? 'Bs' : 'USD';

  return (
    <Modal title="Conversor $ ⇄ Bs" size="md" onClose={onClose} footer={
      <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Conversión con la tasa oficial del BCV{fecha ? ` (${fmtDate(fecha)})` : ''}. Podés corregir la tasa manualmente.
        Se redondea a 2 decimales.
      </p>

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.85rem' }}>
        <button className={`btn ${dir === 'usd_bs' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDir('usd_bs')}>$ → Bs</button>
        <button className={`btn ${dir === 'bs_usd' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDir('bs_usd')}>Bs → $</button>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Monto en {monedaEntrada}</label>
          <input className="input mono" type="number" min={0} step="0.01" value={montoStr}
            onChange={(e) => setMontoStr(e.target.value)} placeholder="0,00" autoFocus />
        </div>
        <div className="form-row">
          <label>Tasa BCV (Bs por $)</label>
          <input className="input mono" type="number" min={0} step="0.0001" value={tasaStr}
            onChange={(e) => setTasaStr(e.target.value)} placeholder={cargando ? 'cargando…' : '0,00'} />
        </div>
      </div>

      <div className="card" style={{ marginTop: '.5rem', textAlign: 'center', borderColor: 'var(--brand, #ff8a00)' }}>
        <div className="muted" style={{ fontSize: '.74rem' }}>Equivalente en {monedaSalida}</div>
        <strong className="mono" style={{ fontSize: '1.6rem' }}>{monto(resultado, monedaSalida)}</strong>
        {tasaNum > 0 && montoNum > 0 && (
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
            {dir === 'usd_bs'
              ? `${monto(montoNum, 'USD')} × ${tasaNum.toLocaleString('es-VE')} = ${monto(resultado, 'Bs')}`
              : `${monto(montoNum, 'Bs')} ÷ ${tasaNum.toLocaleString('es-VE')} = ${monto(resultado, 'USD')}`}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────────── Órdenes pendientes por pagar (OC confirmadas) ───────────── */

function OrdenesPorPagarModal({ cajas, actor, actorName, onClose, onPaid }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const [rows, setRows] = useState<OrdenPorPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<OrdenPorPagar | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRows(await listOrdenesPorPagar()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <Modal title="Órdenes pendientes por pagar" size="xl" onClose={onClose} footer={
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Órdenes de compra confirmadas (aprobadas en lote). Hacé clic en una para ver el detalle completo y registrar el pago.
      </p>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr>
            <th>N°ODC</th><th>OP</th><th>Proveedor</th><th>Solicitante</th>
            <th style={{ textAlign: 'right' }}>Monto $</th><th>OC creada</th><th>Confirmada</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={8}><EmptyState message="No hay órdenes confirmadas por pagar" icon="✅" /></td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.orden.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setSel(r)}>
                <td className="mono">{r.orden.oc_codigo ?? '—'}</td>
                <td className="mono">{r.orden.codigo}</td>
                <td>{r.proveedorNombre}</td>
                <td>{r.orden.solicitante || r.orden.solicitante_email}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{monto(r.orden.total, 'USD')}</td>
                <td className="muted">{r.orden.oc_creada_en ? fmtDate(r.orden.oc_creada_en) : '—'}</td>
                <td className="muted">{r.orden.oc_aprobada_en ? fmtDate(r.orden.oc_aprobada_en) : '—'}</td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSel(r); }}>Ver / Pagar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <PagarOrdenModal
          row={sel} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setSel(null)}
          onPaid={async () => { setSel(null); await reload(); onPaid(); }}
        />
      )}
    </Modal>
  );
}

function PagarOrdenModal({ row, cajas, actor, actorName, onClose, onPaid }: {
  row: OrdenPorPagar; cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const o = row.orden;
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [montoStr, setMontoStr] = useState(String(o.total ?? 0));
  const [factura, setFactura] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';

  // El total de la OC está en USD. Si se paga con una caja en Bs, se convierte
  // con la tasa BCV del día (editable). Se autocompleta el monto según la moneda.
  const totalUsd = Number(o.total) || 0;
  const [tasa, setTasa] = useState<number>(0);
  const [tasaFecha, setTasaFecha] = useState<string | null>(null);
  const [tasaLista, setTasaLista] = useState(false);
  useEffect(() => {
    getTasaHoy()
      .then((t) => { if (t.usd != null) setTasa(t.usd); setTasaFecha(t.fecha); })
      .catch(() => { /* sin tasa: el usuario la ingresa manualmente */ })
      .finally(() => setTasaLista(true));
  }, []);

  // Autocompletar el monto cuando cambia la moneda de la caja o la tasa.
  useEffect(() => {
    if (moneda === 'USD') setMontoStr(String(totalUsd));
    else if (tasa > 0) setMontoStr(String(aBs(totalUsd, tasa)));
  }, [moneda, tasa, totalUsd]);

  const montoNum = Number(montoStr) || 0;
  const totalBs = tasa > 0 ? aBs(totalUsd, tasa) : 0;
  // Equivalente del monto tecleado en la otra moneda.
  const equivOtra = moneda === 'Bs'
    ? (tasa > 0 ? aExtranjero(montoNum, tasa) : 0)   // Bs → $
    : (tasa > 0 ? aBs(montoNum, tasa) : 0);          // $ → Bs

  // Archivos cargados durante la OC: cotizaciones (PDF) de las ofertas.
  const [adjuntos, setAdjuntos] = useState<OfertaProveedor[]>([]);
  const [descargando, setDescargando] = useState<string | null>(null);
  useEffect(() => {
    listOfertasByOrden(o.id)
      .then((rows) => setAdjuntos(rows.filter((r) => r.pdf_path)))
      .catch(() => setAdjuntos([]));
  }, [o.id]);

  async function descargarAdjunto(path: string, id: string) {
    setDescargando(id);
    try {
      const url = await getPdfOfertaSignedUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { toast('No se pudo abrir el archivo', 'error'); }
    finally { setDescargando(null); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elegí la caja con la que se paga.'); return; }
    if (!factura) { setError('Adjuntá el comprobante (PDF o imagen).'); return; }
    if (factura.type && factura.type !== 'application/pdf' && !factura.type.startsWith('image/')) {
      setError('El comprobante debe ser un PDF o una imagen.'); return;
    }
    setSaving(true);
    try {
      await pagarOrdenCompra({
        orden: o, cajaId, monto: Number(montoStr) || 0,
        factura, actorEmail: actor, actorName,
      });
      notify(`OC ${o.oc_codigo ?? o.codigo} pagada · ${monto(Number(montoStr) || 0, moneda)}`, 'success', { link: '#/app/tesoreria' });
      onPaid();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar.'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={() => descargarOrdenCompraPdf(o.id).catch(() => toast('No se pudo generar el PDF', 'error'))}>↓ OC PDF</button>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="pagar-oc" className="btn btn-primary" disabled={saving}>{saving ? 'Pagando…' : `PAGAR ORDEN · ${monto(Number(montoStr) || 0, moneda)}`}</button>
    </>
  );

  return (
    <Modal title={`Pagar OC ${o.oc_codigo ?? o.codigo}`} size="lg" onClose={() => !saving && onClose()} footer={footer}>
      <form id="pagar-oc" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        {/* Trazabilidad: de la OP a la confirmación, con fechas */}
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Detalle de la orden</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '.35rem .9rem', fontSize: '.84rem' }}>
            <div><span className="muted">OP:</span> <strong className="mono">{o.codigo}</strong></div>
            <div><span className="muted">N°ODC:</span> <strong className="mono">{o.oc_codigo ?? '—'}</strong></div>
            <div><span className="muted">Proveedor:</span> {row.proveedorNombre}</div>
            <div><span className="muted">Solicitante:</span> {o.solicitante || o.solicitante_email}</div>
            <div><span className="muted">Creada (OP):</span> {dateTime(o.created_at)}</div>
            <div><span className="muted">Aprobada (OP):</span> {o.aprobada_en ? dateTime(o.aprobada_en) : '—'}</div>
            <div><span className="muted">OC creada:</span> {o.oc_creada_en ? dateTime(o.oc_creada_en) : '—'}</div>
            <div><span className="muted">OC confirmada:</span> {o.oc_aprobada_en ? dateTime(o.oc_aprobada_en) : '—'}</div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginBottom: '.75rem' }}>
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr><th>SKU</th><th>Producto</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
            <tbody>
              {(o.items ?? []).map((it, i) => (
                <tr key={`${it.sku}-${i}`}>
                  <td className="mono">{it.sku}</td><td>{it.nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{it.cantidad}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(it.precio, 'USD')}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(it.cantidad * it.precio, 'USD')}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4} style={{ textAlign: 'right' }}><strong>TOTAL</strong></td><td className="mono" style={{ textAlign: 'right' }}><strong>{monto(o.total, 'USD')}</strong></td></tr></tfoot>
          </table>
        </div>

        {/* Conversión $ ⇄ Bs con la tasa BCV del día (editable). */}
        <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Conversión del total</div>
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>Total en USD</div>
              <strong className="mono" style={{ fontSize: '1.15rem' }}>{monto(totalUsd, 'USD')}</strong>
            </div>
            <div style={{ fontSize: '1.2rem' }} className="muted">⇄</div>
            <div>
              <div className="muted" style={{ fontSize: '.72rem' }}>Equivale en Bs</div>
              <strong className="mono" style={{ fontSize: '1.15rem' }}>{tasa > 0 ? monto(totalBs, 'Bs') : '—'}</strong>
            </div>
            <div className="form-row" style={{ marginLeft: 'auto', minWidth: 160 }}>
              <label style={{ fontSize: '.72rem' }}>Tasa BCV (Bs por $){tasaFecha ? ` · ${fmtDate(tasaFecha)}` : ''}</label>
              <input className="input mono" type="number" min={0} step="0.0001" value={tasa || ''}
                onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder={tasaLista ? '0,00' : 'cargando…'} />
            </div>
          </div>
        </div>

        {/* Archivos cargados durante la OC (cotizaciones de los proveedores). */}
        {adjuntos.length > 0 && (
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Archivos de la OC (cotizaciones)</div>
            {adjuntos.map((of) => (
              <div key={of.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', padding: '.25rem 0' }}>
                <span style={{ fontSize: '.84rem' }}>
                  {of.estado === 'aceptada' ? '✅ ' : '📄 '}
                  {of.pdf_filename ?? 'Cotización.pdf'}
                  <span className="muted"> · {monto(of.precio_total, 'USD')}{of.estado === 'aceptada' ? ' · elegida' : ''}</span>
                </span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={descargando === of.id}
                  onClick={() => descargarAdjunto(of.pdf_path!, of.id)}>
                  {descargando === of.id ? 'Abriendo…' : '↓ Descargar'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="form-grid">
          <div className="form-row">
            <label>Caja (de dónde sale el dinero)</label>
            <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)} required>
              {!cajas.length && <option value="">— sin cajas —</option>}
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
            <small className="muted">Se descuenta de esta caja y queda registrado en el registro de movimientos (pago de compra).</small>
          </div>
          <div className="form-row">
            <label>Monto a pagar ({moneda})</label>
            <input className="input mono" type="number" min={0} step="0.01" value={montoStr} onChange={(e) => setMontoStr(e.target.value)} required />
            {tasa > 0 && montoNum > 0 && (
              <small className="muted">
                Equivale a <strong className="mono">{monto(equivOtra, moneda === 'Bs' ? 'USD' : 'Bs')}</strong>
                {moneda === 'Bs'
                  ? ` · ${monto(montoNum, 'Bs')} ÷ ${tasa.toLocaleString('es-VE')}`
                  : ` · ${monto(montoNum, 'USD')} × ${tasa.toLocaleString('es-VE')}`}
              </small>
            )}
            {moneda === 'Bs' && <small className="muted">Se autocompletó con la tasa BCV; podés ajustarlo.</small>}
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Comprobante (PDF o imagen) *</label>
            <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} required />
            {factura && <small className="muted">{factura.name}</small>}
          </div>
        </div>
      </form>
    </Modal>
  );
}
