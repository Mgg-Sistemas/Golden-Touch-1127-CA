import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, date as fmtDate, dosDecimales } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { GestionarCajasModal } from '@/modules/salidas/GestionarCajasModal';
import { listDirectorioUsuarios, type PersonaDirectorio } from '@/modules/salidas/salidas.repository';
import type { Caja, MovimientoCaja } from '@/shared/lib/types';
import { HistorialTasasModal } from './HistorialTasasModal';
import { TasasView } from './TasasView';
import { getTasaHoy, aBs, aExtranjero, round2, getTasasMercado, refrescarBinanceP2P, getBinance3, refrescarTasasSiVencido, type TasasMercado, type Binance3 } from './tasas.repository';
import { saldosDeCaja, ingresarDivisa, listLotes, listSaldos, trasladoEntreCajasMulti } from './cajaSaldos.repository';
import {
  crearTransferenciaSaliente, confirmarTransferenciaEntrante, reintentarTransferencia,
  listTransferenciasInter,
} from './transferenciasInter.repository';
import type { TransferenciaInter, TransferLeg } from '@/shared/lib/types';
import { listMonedas, addMoneda } from './monedas';
import type { MonedaCaja, CuentaCaja, CajaSaldo, CajaLote } from '@/shared/lib/types';
import { BarChart, type ChartPoint } from '@/shared/ui/Chart';
import {
  listCajasActivas, listCentrosAcopio,
  registrarGasto, pagarPersonal, disponibilidadFinanciera, listLibroMayor,
  type Disponibilidad,
} from './tesoreria.repository';
import {
  listOrdenesPorPagar, pagarOrdenCompra, pagarOrdenCompraMulti, labelMetodoPago, pagoSinComprobante, type OrdenPorPagar,
  listOrdenesEnCredito, registrarAbonoMulti, listAbonos, type AbonoLeg,
} from '@/modules/pedidos/pedidos.repository';
import { labelCondicionPago } from '@/modules/pedidos/ofertas.repository';
import { resumenDatosPago } from '@/shared/ui/DatosPagoFields';
import { comprobantesDeOrden, urlRetencion, labelRetencionModo } from '@/modules/retenciones/retenciones.repository';
import { descargarReportePdf, type ReporteMeta } from './reportePdf';
import { enviarReportePorCorreo } from './enviarReporte';
import type { AbonoCredito } from '@/shared/lib/types';
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
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [libro, setLibro] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'gasto' | 'traslado' | 'pago' | 'cajas' | 'tasas' | 'porpagar' | 'creditos' | 'conversor' | 'grafico'>('none');
  const [cajaSel, setCajaSel] = useState<Caja | null>(null);
  const [porPagarCount, setPorPagarCount] = useState(0);
  const [creditosCount, setCreditosCount] = useState(0);
  const [vista, setVista] = useState<'tesoreria' | 'tasas' | 'movimientos'>('tesoreria');
  const [correoMovOpen, setCorreoMovOpen] = useState(false);

  // Filtros del registro de movimientos
  const [fMoneda, setFMoneda] = useState<string>('');
  const [monedasReg, setMonedasReg] = useState<string[]>(['Bs', 'USD', 'USDT', 'COP']);
  useEffect(() => { listMonedas().then(setMonedasReg).catch(() => { /* base */ }); }, []);
  const [fTipo, setFTipo] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');

  const [transfers, setTransfers] = useState<TransferenciaInter[]>([]);

  const reload = useCallback(async () => {
    const [d, cs, sal, mov, pp, cr, tr] = await Promise.all([
      disponibilidadFinanciera(),
      listCajasActivas(),
      listSaldos().catch(() => [] as CajaSaldo[]),
      listLibroMayor({ moneda: fMoneda || undefined, tipo: fTipo || undefined, desde: fDesde || undefined, hasta: fHasta || undefined }),
      listOrdenesPorPagar().catch(() => [] as OrdenPorPagar[]),
      listOrdenesEnCredito().catch(() => [] as OrdenPorPagar[]),
      listTransferenciasInter().catch(() => [] as TransferenciaInter[]),
    ]);
    const crPendientes = cr.filter((x) => (Number(x.orden.total) - (Number(x.orden.abonado_total) || 0)) > 0.01);
    setDisp(d); setCajas(cs); setSaldos(sal); setLibro(mov); setPorPagarCount(pp.length); setCreditosCount(crPendientes.length); setTransfers(tr);
  }, [fMoneda, fTipo, fDesde, fHasta]);

  // Realtime: multiusuario · lo que registra otro usuario (o el otro sistema) se refleja acá.
  useRealtime(['movimientos_caja', 'caja_saldos', 'cajas', 'transferencias_inter', 'ordenes'], () => { void reload(); });

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

  // Metadatos del reporte PDF/correo del registro de movimientos (según filtros).
  const reporteMeta = () => ({
    titulo: 'REPORTE DE MOVIMIENTOS',
    subtitulo: [
      fDesde && `Desde ${fDesde}`, fHasta && `Hasta ${fHasta}`,
      fMoneda && `Moneda ${fMoneda}`, fTipo && `Tipo ${fTipo}`,
    ].filter(Boolean).join(' · ') || 'Todos los movimientos',
  });

  // Respaldo del cron: si las tasas están vencidas (>11h), las refresca al abrir.
  useEffect(() => { void refrescarTasasSiVencido().catch(() => { /* sin conexión */ }); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>🏦 Tesorería</h1>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>Flujo de dinero, registro de movimientos y pagos.</p>
        </div>
        <div className="view-toggle" role="tablist" aria-label="Vista de tesorería">
          <button className={vista === 'tesoreria' ? 'active' : ''} onClick={() => setVista('tesoreria')}>🏦 Tesorería</button>
          <button className={vista === 'tasas' ? 'active' : ''} onClick={() => setVista('tasas')}>📈 Tasas del Día</button>
          <button className={vista === 'movimientos' ? 'active' : ''} onClick={() => setVista('movimientos')}>📒 Registro de Movimientos</button>
        </div>
      </div>

      {vista === 'tasas' && <TasasView />}

      {vista === 'tesoreria' && (
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
                <button className="btn btn-primary" onClick={() => setModal('creditos')}>
                  💳 CUENTAS POR PAGAR (CRÉDITOS){creditosCount ? ` (${creditosCount})` : ''}
                </button>
                <button className="btn btn-ghost" onClick={() => setModal('gasto')}>− Gasto</button>
                <button className="btn btn-ghost" onClick={() => setModal('traslado')}>↔ Traspaso de dinero</button>
                <button className="btn btn-ghost" onClick={() => setModal('pago')}>👥 Pago a personal</button>
                <button className="btn btn-ghost" onClick={() => setModal('cajas')}>🏦 Cajas</button>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => setModal('conversor')}>💱 Conversor</button>
            <button className="btn btn-ghost" onClick={() => setModal('grafico')}>📊 Tasas Binance</button>
            <button className="btn btn-ghost" onClick={() => setModal('tasas')}>📈 Historial Tasas</button>
          </div>

          {/* Saldos por caja (multimoneda; clic = detalle, ingreso, trazabilidad) */}
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {cajas.map((c) => {
              const sc = saldos.filter((s) => s.caja_id === c.id && (Number(s.saldo) || 0) !== 0);
              const totalBs = saldos.filter((s) => s.caja_id === c.id).reduce((a, s) => a + equivBs(s), 0);
              return (
                <button key={c.id} className="card" onClick={() => setCajaSel(c)}
                  style={{ padding: '.6rem .9rem', minWidth: 170, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card, transparent)' }}
                  title="Ver detalle, ingresar dinero y trazabilidad">
                  <div className="muted" style={{ fontSize: '.72rem' }}>{c.nombre} <span style={{ float: 'right' }}>⚙</span></div>
                  {sc.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem .5rem', margin: '.2rem 0' }}>
                      {sc.map((s) => (
                        <span key={s.id} className="mono" style={{ fontSize: '.82rem' }}>
                          {monto(s.saldo, s.moneda)}
                        </span>
                      ))}
                    </div>
                  ) : <strong className="mono">{monto(0, c.moneda)}</strong>}
                  <div className="muted" style={{ fontSize: '.66rem' }}>≈ {monto(totalBs, 'Bs')}</div>
                </button>
              );
            })}
          </div>

          {/* Transferencias inter-sistema (centros de acopio externos / otra Supabase) */}
          <TransferenciasInterPanel transfers={transfers} cajas={cajas} canWrite={canWrite} actor={actor} actorName={actorName} onChanged={reload} />
      </>
      )}

      {vista === 'movimientos' && (
      <>
          {/* Registro de movimientos (vista propia) */}
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
                <select className="select" value={fMoneda} onChange={(e) => setFMoneda(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Toda moneda</option>
                  {monedasReg.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="select" value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">Todo movimiento</option>
                  <option value="ingreso">Ingresos</option><option value="salida">Egresos</option>
                  <option value="traslado_salida">Traslados</option><option value="ajuste">Ajustes</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
              <button className="btn btn-sm btn-ghost" disabled={!libro.length} onClick={async () => {
                try { await descargarReportePdf(libro, reporteMeta()); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
              }}>↓ PDF</button>
              <button className="btn btn-sm btn-ghost" disabled={!libro.length} onClick={() => setCorreoMovOpen(true)}>✉ Enviar por correo</button>
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
      )}

      {correoMovOpen && <EnviarReporteModal movs={libro} meta={reporteMeta()} defaultEmail={actor} onClose={() => setCorreoMovOpen(false)} />}
      {modal === 'gasto' && <GastoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'traslado' && <TrasladoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'pago' && <PagoPersonalModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onSaved={cerrarYRecargar} />}
      {modal === 'cajas' && <GestionarCajasModal actor={actor} actorName={actorName} onClose={() => setModal('none')} onCambioAplicado={reload} />}
      {modal === 'tasas' && <TasasGate onClose={() => setModal('none')} />}
      {modal === 'conversor' && <ConversorModal onClose={() => setModal('none')} />}
      {modal === 'grafico' && <GraficoTasasModal onClose={() => setModal('none')} />}
      {modal === 'porpagar' && <OrdenesPorPagarModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onPaid={reload} />}
      {modal === 'creditos' && <CuentasCreditoModal cajas={cajas} actor={actor} actorName={actorName} onClose={() => setModal('none')} onChanged={reload} />}
      {cajaSel && <CajaDetalleModal caja={cajaSel} canWrite={canWrite} actor={actor} actorName={actorName} onClose={() => setCajaSel(null)} onChanged={async () => { await reload(); }} />}
    </div>
  );
}

/* ───────────── Detalle de caja (multimoneda: cuentas + divisas) ───────────── */

function CajaDetalleModal({ caja, canWrite, actor, actorName, onClose, onChanged }: {
  caja: Caja; canWrite: boolean; actor: string; actorName: string | null; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [movs, setMovs] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [lotesDe, setLotesDe] = useState<{ moneda: string; cuenta: CuentaCaja } | null>(null);
  const [lotes, setLotes] = useState<CajaLote[]>([]);
  const [monedas, setMonedas] = useState<string[]>([...MONEDAS_CAJA]);
  const [nuevaMonedaOpen, setNuevaMonedaOpen] = useState(false);
  const [nuevaMoneda, setNuevaMoneda] = useState('');

  // Form de ingreso
  const [moneda, setMoneda] = useState<string>('Bs');
  const [cuenta, setCuenta] = useState<CuentaCaja>('juridica');
  const [montoStr, setMontoStr] = useState('');
  const [tasaStr, setTasaStr] = useState('');
  const [origen, setOrigen] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  const [correoOpen, setCorreoOpen] = useState(false);

  // Sugerencia de tasa del día para la moneda elegida (Bs por 1 unidad).
  const tasaSugerida = moneda === 'Bs' || !mercado ? null : tasaCruzada(moneda as MonedaCaja, 'Bs', mercado);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([saldosDeCaja(caja.id), listLibroMayor({ cajaId: caja.id })]);
      setSaldos(s); setMovs(m);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la caja', 'error'); }
    finally { setLoading(false); }
  }, [caja.id]);
  useEffect(() => { void reload(); setLotesDe(null); }, [reload]);
  useEffect(() => { listMonedas().then(setMonedas).catch(() => setMonedas([...MONEDAS_CAJA])); }, []);
  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);

  // Al elegir una divisa con tasa de mercado (COP/USD/USDT), precarga la tasa del día (editable).
  useEffect(() => {
    if (tasaSugerida != null && tasaSugerida > 0) setTasaStr(String(tasaSugerida));
    else if (moneda === 'Bs') setTasaStr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneda, mercado]);

  // La cuenta jurídica/personal solo aplica a Bs.
  useEffect(() => { setCuenta(moneda === 'Bs' ? 'juridica' : 'general'); }, [moneda]);

  const totalBs = saldos.reduce((a, s) => a + equivBs(s), 0);

  async function agregarMoneda() {
    const code = nuevaMoneda.trim().toUpperCase();
    if (!code) { setNuevaMonedaOpen(false); return; }
    try {
      await addMoneda(code, actor);
      const lista = await listMonedas();
      setMonedas(lista); setMoneda(code);
      setNuevaMoneda(''); setNuevaMonedaOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar la moneda', 'error'); }
  }

  async function verLotes(s: CajaSaldo) {
    setLotesDe({ moneda: s.moneda, cuenta: s.cuenta });
    try { setLotes(await listLotes({ cajaId: caja.id, moneda: s.moneda, cuenta: s.cuenta })); }
    catch { setLotes([]); }
  }

  async function ingresar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if ((Number(montoStr) || 0) <= 0) { setError('El monto debe ser mayor que 0.'); return; }
    if (moneda !== 'Bs' && (Number(tasaStr) || 0) <= 0) { setError('Indicá la tasa de compra (Bs por unidad).'); return; }
    setSaving(true);
    try {
      await ingresarDivisa({
        cajaId: caja.id, cuenta, moneda, monto: Number(montoStr) || 0,
        tasaBs: moneda === 'Bs' ? 1 : Number(tasaStr) || 0,
        origen: origen.trim() || null, actor, actorName,
      });
      const etiqueta = moneda === 'Bs' ? `Bs · ${cuenta}` : moneda;
      notify(`Ingreso ${etiqueta} · ${monto(Number(montoStr) || 0, moneda)}`, 'success', { link: '#/app/tesoreria' });
      setMontoStr(''); setTasaStr(''); setOrigen('');
      await reload(); await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo ingresar.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Caja · ${caja.nombre}`} size="xl" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {/* Saldos por cuenta/moneda */}
      <div className="card" style={{ marginBottom: '.6rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.4rem' }}>
          <span>Saldos por cuenta / moneda</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <span className="muted" style={{ fontSize: '.8rem' }}>Total: <strong className="mono">{monto(totalBs, 'Bs')}</strong></span>
            <button className="btn btn-sm btn-ghost" disabled={!movs.length} onClick={async () => {
              try { await descargarReportePdf(movs, { titulo: 'REPORTE DE CAJA', subtitulo: caja.nombre }); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
            }}>↓ PDF</button>
            <button className="btn btn-sm btn-ghost" disabled={!movs.length} onClick={() => setCorreoOpen(true)}>✉ Correo</button>
          </span>
        </div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.84rem' }}>
            <thead><tr><th>Cuenta</th><th>Moneda</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'right' }}>Tasa prom. (Bs)</th><th style={{ textAlign: 'right' }}>Equiv. Bs</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !saldos.length && <tr><td colSpan={6}><EmptyState message="Sin saldos · ingresá dinero abajo" /></td></tr>}
              {!loading && saldos.map((s) => (
                <tr key={s.id}>
                  <td>{s.cuenta === 'general' ? '—' : s.cuenta === 'juridica' ? 'Jurídica' : 'Personal'}</td>
                  <td><span className="badge">{s.moneda}</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{monto(s.saldo, s.moneda)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{s.moneda === 'Bs' ? (mercado?.bcvUsd ? `BCV ${Number(mercado.bcvUsd).toLocaleString('es-VE', { maximumFractionDigits: 4 })}` : '—') : (s.tasa_prom != null ? Number(s.tasa_prom).toLocaleString('es-VE', { maximumFractionDigits: 4 }) : '—')}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {monto(equivBs(s), 'Bs')}
                    {s.moneda === 'Bs' && mercado?.bcvUsd ? <div className="muted" style={{ fontSize: '.7rem' }}>≈ {monto(Number(s.saldo) / mercado.bcvUsd, 'USD')} a BCV</div> : null}
                  </td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-ghost" onClick={() => verLotes(s)}>Trazabilidad</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparativo de tasas: Binance (USDT/VES) vs BCV + margen de ahorro */}
      {(() => {
        const bin = mercado?.usdtVes ?? null;
        const bcv = mercado?.bcvUsd ?? null;
        const margen = bin && bcv && bin > 0 ? ((bin - bcv) / bin) * 100 : null;
        return (
          <div className="card" style={{ marginBottom: '.6rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Tasas de referencia (Bs por USD)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem' }}>
              <div>
                <div className="muted" style={{ fontSize: '.68rem' }}>BINANCE (USDT/VES)</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{bin != null ? monto(bin, 'Bs') : '—'}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.68rem' }}>BCV</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{bcv != null ? monto(bcv, 'Bs') : '—'}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: '.68rem' }}>MARGEN DE AHORRO (vs Binance)</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: margen != null && margen > 0 ? 'var(--success)' : 'var(--muted)' }}>
                  {margen != null ? `${margen.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : '—'}
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: '.7rem', marginTop: '.4rem' }}>
              El margen es cuánto se ahorra pagando a tasa BCV respecto a la de Binance: (Binance − BCV) ÷ Binance.
            </div>
          </div>
        );
      })()}

      {lotesDe && (
        <div className="card" style={{ marginBottom: '.6rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Trazabilidad · {lotesDe.moneda}{lotesDe.cuenta !== 'general' ? ` · ${lotesDe.cuenta}` : ''} (lotes de ingreso)</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setLotesDe(null)}>✕</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
            <table className="table" style={{ fontSize: '.82rem' }}>
              <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>Tasa (Bs)</th><th>Origen</th><th>Registró</th></tr></thead>
              <tbody>
                {!lotes.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin lotes</td></tr>}
                {lotes.map((l) => (
                  <tr key={l.id}>
                    <td>{dateTime(l.created_at)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{monto(l.monto, lotesDe.moneda)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{l.tasa_bs != null ? Number(l.tasa_bs).toLocaleString('es-VE', { maximumFractionDigits: 4 }) : '—'}</td>
                    <td>{l.origen || '—'}</td>
                    <td className="muted">{l.actor_name || l.actor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {correoOpen && <EnviarReporteModal movs={movs} meta={{ titulo: 'REPORTE DE CAJA', subtitulo: caja.nombre }} defaultEmail={actor} onClose={() => setCorreoOpen(false)} />}

      {/* Ingresar dinero (cuenta jurídica/personal en Bs, o divisa con tasa) */}
      {canWrite && (
        <form onSubmit={ingresar} className="card" style={{ marginBottom: '.6rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Ingresar dinero (suma al saldo y recalcula el promedio)</div>
          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.5rem' }}><strong>Error:</strong> {error}</div>}
          <div className="form-grid">
            <div className="form-row">
              <label>Moneda</label>
              {nuevaMonedaOpen ? (
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <input className="input mono" value={nuevaMoneda} autoFocus placeholder="Ej. EUR, PEN…"
                    onChange={(e) => setNuevaMoneda(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarMoneda(); } if (e.key === 'Escape') setNuevaMonedaOpen(false); }} />
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void agregarMoneda()}>✓</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNuevaMonedaOpen(false)}>✕</button>
                </div>
              ) : (
                <select className="select" value={moneda}
                  onChange={(e) => { if (e.target.value === '__nueva__') setNuevaMonedaOpen(true); else setMoneda(e.target.value); }}>
                  {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value="__nueva__">+ Nueva moneda…</option>
                </select>
              )}
            </div>
            {moneda === 'Bs' && (
              <div className="form-row">
                <label>Cuenta</label>
                <select className="select" value={cuenta} onChange={(e) => setCuenta(e.target.value as CuentaCaja)}>
                  <option value="juridica">Jurídica</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
            )}
            <div className="form-row">
              <label>Monto ({moneda})</label>
              <input className="input mono" type="number" min={0} step="any" value={montoStr} onChange={(e) => setMontoStr(dosDecimales(e.target.value))} placeholder="0,00" required />
            </div>
            {moneda !== 'Bs' && (
              <div className="form-row">
                <label>Tasa de compra (Bs por 1 {moneda})</label>
                <input className="input mono" type="number" min={0} step="any" value={tasaStr} onChange={(e) => setTasaStr(e.target.value)} required />
                {tasaSugerida != null && tasaSugerida > 0 && (
                  <small className="muted" style={{ display: 'flex', alignItems: 'center', gap: '.35rem', marginTop: '.2rem' }}>
                    Tasa del día: <strong className="mono">{tasaSugerida.toLocaleString('es-VE', { maximumFractionDigits: 4 })}</strong>
                    <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .4rem' }}
                      onClick={() => setTasaStr(String(tasaSugerida))}>Usar</button>
                  </small>
                )}
              </div>
            )}
            <div className="form-row">
              <label>Origen (opcional)</label>
              <input className="input" value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="Binance, efectivo, transferencia…" />
            </div>
          </div>
          <div style={{ textAlign: 'right', marginTop: '.5rem' }}>
            <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Ingresando…' : '+ Ingresar'}</button>
          </div>
          <small className="muted">El Bs se maneja en dos cuentas: <strong>jurídica</strong> y <strong>personal</strong>. Las divisas guardan su tasa de compra para el promedio ponderado.</small>
        </form>
      )}

      {/* Movimientos (libro de la caja) */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: '.5rem' }}>Movimientos de esta caja</div>
        <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
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
            <input className="input mono" type="number" min={0} step="any" value={montoStr} onChange={(e) => setMontoStr(dosDecimales(e.target.value))} required />
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
  const [centros, setCentros] = useState<Caja[]>([]);
  const [saldos, setSaldos] = useState<CajaSaldo[]>([]);
  const [montos, setMontos] = useState<Record<string, string>>({}); // key = saldo.id
  const [motivo, setMotivo] = useState('');
  const [loadingSaldos, setLoadingSaldos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origen = cajas.find((c) => c.id === origenId) ?? null;
  const destino = centros.find((c) => c.id === destinoId) ?? null;

  useEffect(() => { listCentrosAcopio().then(setCentros).catch(() => setCentros([])); }, []);
  useEffect(() => {
    if (!origenId) { setSaldos([]); return; }
    setLoadingSaldos(true);
    saldosDeCaja(origenId)
      .then((s) => setSaldos(s.filter((x) => (Number(x.saldo) || 0) > 0)))
      .catch(() => setSaldos([]))
      .finally(() => setLoadingSaldos(false));
    setMontos({});
  }, [origenId]);

  const cuentaLabel = (c: string) => c === 'general' ? '' : c === 'juridica' ? ' · Jurídica' : ' · Personal';

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!origenId || !destinoId) { setError('Elegí la caja origen y el centro de acopio.'); return; }
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return; }
    const legs = saldos
      .map((s) => ({ cuenta: s.cuenta, moneda: s.moneda, monto: Number(montos[s.id]) || 0 }))
      .filter((l) => l.monto > 0);
    if (!legs.length) { setError('Indicá al menos un monto a trasladar.'); return; }
    setSaving(true);
    try {
      await trasladoEntreCajasMulti({
        origenId, destinoId, legs, motivo: motivo.trim(),
        origenNombre: origen?.nombre, destinoNombre: destino?.nombre, actor, actorName,
      });
      // Centro de acopio EXTERNO (otro sistema/Supabase): además del traslado local,
      // replicar la transferencia al otro sistema vía el puente inter-sistema.
      if (destino?.externo && destino.empresa_codigo) {
        const transferLegs: TransferLeg[] = saldos
          .map((s) => ({ cuenta: s.cuenta, moneda: s.moneda, monto: Number(montos[s.id]) || 0, tasa_bs: s.tasa_prom ?? null }))
          .filter((l) => l.monto > 0);
        await crearTransferenciaSaliente({
          empresaDestino: destino.empresa_codigo, cajaId: destinoId, cajaNombre: destino.nombre,
          legs: transferLegs, motivo: motivo.trim(), actor, actorName,
        });
        notify(`Traslado a ${destino.nombre} registrado y enviado al otro sistema`, 'success', { link: '#/app/tesoreria' });
      } else {
        notify('Traslado a centro de acopio registrado', 'success', { link: '#/app/tesoreria' });
      }
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
            <select className="select" value={origenId} onChange={(e) => { setOrigenId(e.target.value); setDestinoId(destinoId); }}>
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {monto(c.saldo, c.moneda)}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Hacia (Centro de Acopio)</label>
            <select className="select" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
              <option value="">— elegir —</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.externo ? ' · sistema externo' : ''}</option>)}
            </select>
            {destino?.externo && (
              <small className="muted">🔗 Centro de acopio en otro sistema: el traslado se replica automáticamente y queda “por confirmar” del otro lado.</small>
            )}
          </div>
        </div>

        {/* Montos a sacar de cada moneda registrada en la caja origen */}
        <div className="card" style={{ margin: '.4rem 0', padding: '.5rem .7rem' }}>
          <div className="muted" style={{ fontSize: '.74rem', marginBottom: '.35rem' }}>¿Cuánto trasladar de cada moneda registrada en la caja?</div>
          {loadingSaldos ? <div className="muted" style={{ fontSize: '.85rem' }}>Cargando saldos…</div>
            : !saldos.length ? <div className="muted" style={{ fontSize: '.85rem' }}>Esta caja no tiene saldos.</div>
            : (
              <div style={{ display: 'grid', gap: '.4rem' }}>
                {saldos.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <span style={{ flex: '1 1 auto', fontSize: '.85rem' }}>
                      <span className="badge">{s.moneda}</span>{cuentaLabel(s.cuenta)} <span className="muted">· disp. {monto(s.saldo, s.moneda)}</span>
                    </span>
                    <input className="input mono" type="number" min={0} max={Number(s.saldo) || 0} step="any" placeholder="0,00"
                      value={montos[s.id] ?? ''} onChange={(e) => setMontos((m) => ({ ...m, [s.id]: dosDecimales(e.target.value) }))}
                      style={{ width: 140 }} />
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="form-row"><label>Motivo *</label><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Obligatorio" required /></div>
      </form>
    </Modal>
  );
}

/* ───────────── Transferencias inter-sistema (centros de acopio externos) ───────────── */

const ESTADO_TRANSFER: Record<string, { label: string; color: string }> = {
  enviada: { label: 'En tránsito · esperando confirmación', color: 'var(--warning)' },
  por_confirmar: { label: 'Por confirmar', color: 'var(--warning)' },
  recibida: { label: 'Recibida ✓', color: 'var(--success)' },
  rechazada: { label: 'Rechazada', color: 'var(--danger)' },
  error: { label: 'Pendiente de entrega ⟳', color: 'var(--danger)' },
};

function TransferenciasInterPanel({ transfers, cajas, canWrite, actor, actorName, onChanged }: {
  transfers: TransferenciaInter[]; cajas: Caja[]; canWrite: boolean; actor: string; actorName: string | null; onChanged: () => void | Promise<void>;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const entrantes = transfers.filter((t) => t.direccion === 'entrante' && t.estado === 'por_confirmar');
  const salientes = transfers.filter((t) => t.direccion === 'saliente');
  const salientesVivas = salientes.filter((t) => t.estado !== 'recibida');
  const recibidas = salientes.length - salientesVivas.length;
  if (!entrantes.length && !salientes.length) return null;

  async function confirmar(t: TransferenciaInter) {
    const cajaId = t.caja_id || sel[t.id];
    if (!cajaId) { toast('Elegí la caja que recibe el dinero.', 'error'); return; }
    setBusy(t.id);
    try {
      await confirmarTransferenciaEntrante({ row: t, cajaId, actor, actorName });
      toast(`Transferencia de ${t.empresa_origen} acreditada`, 'success');
      await onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo confirmar', 'error'); }
    finally { setBusy(null); }
  }

  async function reintentar(t: TransferenciaInter) {
    setBusy(t.id);
    try {
      await reintentarTransferencia(t);
      toast('Reintento enviado al otro sistema', 'success');
      await onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Sigue sin poder entregarse', 'error'); }
    finally { setBusy(null); }
  }

  return (
    <div className="card" style={{ marginBottom: '1rem', borderColor: entrantes.length ? 'var(--brand, #ff8a00)' : undefined }}>
      <div className="card-title" style={{ marginBottom: '.5rem' }}>
        🔗 Transferencias inter-sistema (centros de acopio externos)
      </div>

      {/* ENTRANTES por confirmar */}
      {entrantes.length > 0 && (
        <div style={{ marginBottom: salientesVivas.length ? '.8rem' : 0 }}>
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.35rem' }}>Entrantes por confirmar · acreditá a la caja que recibe</div>
          <div style={{ display: 'grid', gap: '.45rem' }}>
            {entrantes.map((t) => (
              <div key={t.id} className="card" style={{ margin: 0, padding: '.55rem .7rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ flex: '1 1 240px', fontSize: '.85rem' }}>
                  <strong>De {t.empresa_origen}</strong> · <span className="mono">{t.resumen}</span>
                  {t.motivo ? <span className="muted"> · {t.motivo}</span> : null}
                  <div className="muted" style={{ fontSize: '.72rem' }}>{dateTime(t.created_at)}</div>
                </div>
                {!t.caja_id && (
                  <select className="select" value={sel[t.id] ?? ''} onChange={(e) => setSel((m) => ({ ...m, [t.id]: e.target.value }))} style={{ maxWidth: 200 }}>
                    <option value="">— caja que recibe —</option>
                    {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
                {canWrite && (
                  <button className="btn btn-sm btn-primary" disabled={busy === t.id} onClick={() => confirmar(t)}>
                    {busy === t.id ? 'Confirmando…' : '✓ Confirmar recepción'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SALIENTES en tránsito / con error */}
      {salientesVivas.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.35rem' }}>Salientes (enviadas a otro sistema)</div>
          <div style={{ display: 'grid', gap: '.4rem' }}>
            {salientesVivas.map((t) => {
              const est = ESTADO_TRANSFER[t.estado] ?? { label: t.estado, color: 'var(--muted)' };
              return (
                <div key={t.id} className="card" style={{ margin: 0, padding: '.5rem .7rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>
                  <div style={{ flex: '1 1 240px', fontSize: '.84rem' }}>
                    <strong>→ {t.empresa_destino}</strong> · <span className="mono">{t.resumen}</span>
                    <div style={{ fontSize: '.72rem', color: est.color }}>{est.label}{t.mensaje_error ? ` · ${t.mensaje_error}` : ''}</div>
                  </div>
                  {canWrite && t.estado === 'error' && (
                    <button className="btn btn-sm btn-ghost" disabled={busy === t.id} onClick={() => reintentar(t)}>
                      {busy === t.id ? 'Reintentando…' : '⟳ Reintentar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recibidas > 0 && (
        <div className="muted" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
          {recibidas} saliente(s) ya confirmada(s) por el otro sistema.
        </div>
      )}
    </div>
  );
}

/* ───────── Enviar reporte por correo (mismo patrón que las OC) ───────── */
function EnviarReporteModal({ movs, meta, defaultEmail, onClose }: {
  movs: MovimientoCaja[]; meta: ReporteMeta; defaultEmail: string; onClose: () => void;
}) {
  const [incluirPropio, setIncluirPropio] = useState(true);
  const [extra, setExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const propio = defaultEmail.trim().toLowerCase();
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleEnviar() {
    const lista: string[] = [];
    if (incluirPropio && propio) lista.push(propio);
    const extraClean = extra.trim().toLowerCase();
    if (extraClean) {
      if (!emailRx.test(extraClean)) { toast('El correo adicional no es válido', 'error'); return; }
      lista.push(extraClean);
    }
    setEnviando(true);
    try {
      const r = await enviarReportePorCorreo(movs, meta, lista);
      notify(`Reporte enviado a ${r.destinatarios.join(', ')}`, 'success', { link: '#/app/tesoreria' });
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setEnviando(false); }
  }

  return (
    <Modal title={`Enviar reporte · ${meta.titulo}`} size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>{enviando ? 'Enviando…' : '📧 Enviar'}</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Se enviará el PDF del reporte ({meta.subtitulo || 'todos los movimientos'}) a los destinatarios seleccionados.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.7rem .85rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: incluirPropio ? 'rgba(255,138,0,0.06)' : 'transparent', cursor: propio ? 'pointer' : 'not-allowed', marginBottom: '.6rem' }}>
        <input type="checkbox" checked={incluirPropio} disabled={!propio} onChange={(e) => setIncluirPropio(e.target.checked)} />
        <div>
          <div style={{ fontWeight: 600 }}>Tu correo</div>
          <div className="mono" style={{ fontSize: '.82rem' }}>{propio || '—'}</div>
        </div>
      </label>
      <div className="form-row" style={{ marginTop: '.4rem' }}>
        <label>Correo adicional (opcional)</label>
        <input className="input" type="email" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="otro@correo.com" maxLength={120} />
        <small className="muted">Si no marcás ninguno, se envía a los admin/jefe.</small>
      </div>
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
                  <td><input className="input mono" type="number" min={0} step="any" value={montos[p.id] ?? ''} onChange={(e) => setMontos((m) => ({ ...m, [p.id]: dosDecimales(e.target.value) }))} placeholder="0,00" /></td>
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

/* ───────────── Conversor multimoneda (tasa personalizada) ───────────── */

const MONEDAS_CONV: MonedaCaja[] = ['Bs', 'USD', 'USDT', 'COP'];

/** Valor de 1 unidad de la moneda expresado en USD, con las tasas de mercado.
 *  Bs usa la tasa Binance (USDT/VES) como referencia del dólar; COP usa COP/USD.
 *  USD y USDT se toman en paridad (~1). */
function valorEnUsd(m: MonedaCaja, t: TasasMercado): number | null {
  switch (m) {
    case 'USD': return 1;
    case 'USDT': return 1;
    case 'Bs': return t.usdtVes && t.usdtVes > 0 ? 1 / t.usdtVes : null;
    case 'COP': return t.copUsd && t.copUsd > 0 ? 1 / t.copUsd : null;
  }
}

/** Tasa cruzada sugerida: cuántas unidades de `a` por 1 de `de`. */
function tasaCruzada(de: MonedaCaja, a: MonedaCaja, t: TasasMercado): number | null {
  const vd = valorEnUsd(de, t), va = valorEnUsd(a, t);
  if (vd == null || va == null || va === 0) return null;
  return round2(vd / va);
}

function ConversorModal({ onClose }: { onClose: () => void }) {
  const [de, setDe] = useState<MonedaCaja>('USDT');
  const [a, setA] = useState<MonedaCaja>('Bs');
  const [montoStr, setMontoStr] = useState('');
  const [tasaStr, setTasaStr] = useState('');
  const [mercado, setMercado] = useState<TasasMercado | null>(null);

  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);

  // Sugerencia de tasa al cambiar las monedas o cargar el mercado (editable).
  useEffect(() => {
    if (!mercado || de === a) { if (de === a) setTasaStr('1'); return; }
    const sug = tasaCruzada(de, a, mercado);
    if (sug != null) setTasaStr(String(sug));
  }, [de, a, mercado]);

  const montoNum = Number(montoStr) || 0;
  const tasaNum = Number(tasaStr) || 0;
  const resultado = round2(montoNum * tasaNum);

  function swap() { setDe(a); setA(de); }
  function usarMercado() {
    if (!mercado) return;
    const sug = de === a ? 1 : tasaCruzada(de, a, mercado);
    if (sug != null) setTasaStr(String(sug));
  }

  return (
    <Modal title="Conversor multimoneda" size="md" onClose={onClose} footer={
      <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Conversión con <strong>tasa personalizada</strong> (editable). La sugerencia toma el dólar
        de <strong>Binance (USDT/VES)</strong> y la TRM del COP; la tasa <strong>BCV no se usa acá</strong> (queda en la barra superior). Se redondea a 2 decimales.
      </p>

      <div className="form-grid">
        <div className="form-row">
          <label>De</label>
          <select className="select" value={de} onChange={(e) => setDe(e.target.value as MonedaCaja)}>
            {MONEDAS_CONV.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ alignSelf: 'end' }}>
          <button type="button" className="btn btn-ghost" onClick={swap} title="Invertir">⇄ Invertir</button>
        </div>
        <div className="form-row">
          <label>A</label>
          <select className="select" value={a} onChange={(e) => setA(e.target.value as MonedaCaja)}>
            {MONEDAS_CONV.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Monto en {de}</label>
          <input className="input mono" type="number" min={0} step="any" value={montoStr}
            onChange={(e) => setMontoStr(dosDecimales(e.target.value))} placeholder="0,00" autoFocus />
        </div>
        <div className="form-row">
          <label>Tasa · 1 {de} = ? {a}</label>
          <input className="input mono" type="number" min={0} step="any" value={tasaStr}
            onChange={(e) => setTasaStr(e.target.value)} placeholder={mercado ? '0,00' : 'cargando…'} />
          <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.3rem' }} onClick={usarMercado}>↺ Tasa de mercado</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '.5rem', textAlign: 'center', borderColor: 'var(--brand, #ff8a00)' }}>
        <div className="muted" style={{ fontSize: '.74rem' }}>Equivalente en {a}</div>
        <strong className="mono" style={{ fontSize: '1.6rem' }}>{monto(resultado, a)}</strong>
        {tasaNum > 0 && montoNum > 0 && (
          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
            {monto(montoNum, de)} × {tasaNum.toLocaleString('es-VE')} = {monto(resultado, a)}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────────── Cajas multimoneda (saldos + lotes + promedio) ───────────── */

const MONEDAS_CAJA: MonedaCaja[] = ['Bs', 'USD', 'USDT', 'COP'];
/** Equivalente en Bs de un saldo según su tasa promedio (Bs por unidad). */
function equivBs(s: CajaSaldo): number {
  if (s.moneda === 'Bs') return Number(s.saldo) || 0;
  return round2((Number(s.saldo) || 0) * (Number(s.tasa_prom) || 0));
}


/* ───────────── Tasas Binance (3 tasas del P2P, en barras) ───────────── */

function GraficoTasasModal({ onClose }: { onClose: () => void }) {
  const [tasas, setTasas] = useState<Binance3 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setTasas(await getBinance3()); }
    catch { setTasas(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function actualizarAhora() {
    setRefrescando(true);
    try {
      setTasas(await refrescarBinanceP2P());
      notify('Tasas Binance actualizadas', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo actualizar (¿Edge Function desplegada?)', 'error'); }
    finally { setRefrescando(false); }
  }

  const fmtTasa = (v: number | null | undefined) => v != null ? Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const bars: ChartPoint[] = tasas ? [
    { label: 'Compra', value: Number(tasas.buy) || 0, tooltip: `Compra: ${fmtTasa(tasas.buy)} Bs` },
    { label: 'Promedio', value: Number(tasas.promedio) || 0, tooltip: `Promedio: ${fmtTasa(tasas.promedio)} Bs` },
    { label: 'Venta', value: Number(tasas.sell) || 0, tooltip: `Venta: ${fmtTasa(tasas.sell)} Bs` },
  ] : [];

  return (
    <Modal title="Tasas Binance" size="xl" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <strong>USDT / VES · P2P Binance</strong>
        <button className="btn btn-sm btn-primary" onClick={actualizarAhora} disabled={refrescando}>{refrescando ? 'Actualizando…' : '↻ Actualizar ahora'}</button>
        <span className="muted" style={{ fontSize: '.78rem' }}>3 tasas de referencia del mercado P2P (Bs por 1 USDT).</span>
      </div>

      {/* Tarjetas de las 3 tasas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.6rem', marginBottom: '.8rem' }}>
        {[
          { t: 'Compra', v: tasas?.buy, c: '#22c55e', n: 'Lo que cobran al venderte USDT' },
          { t: 'Promedio', v: tasas?.promedio, c: '#f3ba2f', n: 'Punto medio (referencia)' },
          { t: 'Venta', v: tasas?.sell, c: '#ef4444', n: 'Lo que pagan por tu USDT' },
        ].map((x) => (
          <div key={x.t} className="card" style={{ borderColor: x.c, textAlign: 'center' }}>
            <div className="muted" style={{ fontSize: '.74rem' }}>{x.t}</div>
            <strong className="mono" style={{ fontSize: '1.4rem', color: x.c }}>{fmtTasa(x.v)}</strong>
            <div className="muted" style={{ fontSize: '.66rem', marginTop: '.15rem' }}>{x.n}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="muted" style={{ padding: '1rem' }}>Cargando…</div>
      ) : (
        <BarChart data={bars} color="#f3ba2f" height={240}
          yFormatter={(v) => v.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
          emptyMessage="Aún no hay tasas capturadas. Usá ↻ Actualizar ahora." />
      )}
      {tasas?.at && <div className="muted" style={{ fontSize: '.72rem', marginTop: '.4rem', textAlign: 'right' }}>Última captura: {dateTime(tasas.at)}</div>}
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
            <th>N°ODC</th><th>OP</th><th>Proveedor</th><th>Condición</th>
            <th style={{ textAlign: 'right' }}>A pagar $</th><th>OC creada</th><th>Confirmada</th><th></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={8}><EmptyState message="No hay órdenes confirmadas por pagar" icon="✅" /></td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.orden.id} className="row-selectable" style={{ cursor: 'pointer' }} onClick={() => setSel(r)}>
                <td className="mono">{r.orden.oc_codigo ?? '—'}</td>
                <td className="mono">{r.orden.codigo}</td>
                <td>{r.proveedorNombre}</td>
                <td style={{ fontSize: '.78rem' }}>{labelCondicionPago(r.orden.condiciones_pago)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>
                  {monto(r.montoAPagar, 'USD')}
                  {r.esContraEntrega && r.montoAPagar < Number(r.orden.total) && (
                    <div className="muted" style={{ fontSize: '.68rem' }}>de {monto(r.orden.total, 'USD')}</div>
                  )}
                </td>
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

/* ───────────── Cuentas por pagar (créditos) · abonos multipago ───────────── */
function CuentasCreditoModal({ cajas, actor, actorName, onClose, onChanged }: {
  cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onChanged: () => void | Promise<void>;
}) {
  const [ordenes, setOrdenes] = useState<OrdenPorPagar[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [abonos, setAbonos] = useState<AbonoCredito[]>([]);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  const [legMontos, setLegMontos] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const [factura, setFactura] = useState<File | null>(null);
  const [tasa, setTasa] = useState(0);
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listOrdenesEnCredito();
      // Solo las que aún tienen saldo por pagar (las saldadas se gestionan en Compras).
      const os = all.filter((x) => (Number(x.orden.total) - (Number(x.orden.abonado_total) || 0)) > 0.01);
      setOrdenes(os);
      setSelId((p) => (p && os.some((x) => x.orden.id === p)) ? p : (os[0]?.orden.id ?? ''));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* manual */ });
    getTasasMercado().then(setMercado).catch(() => setMercado(null));
  }, []);
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); return; }
    saldosDeCaja(cajaId).then((rows) => setSaldosCaja(rows.filter((r) => Number(r.saldo) > 0))).catch(() => setSaldosCaja([]));
    setLegMontos({});
  }, [cajaId]);
  useEffect(() => {
    if (!selId) { setAbonos([]); return; }
    listAbonos(selId).then(setAbonos).catch(() => setAbonos([]));
  }, [selId]);

  const sel = ordenes.find((x) => x.orden.id === selId) ?? null;
  const o = sel?.orden ?? null;
  const total = Number(o?.total) || 0;
  const abonado = o ? (Number(o.abonado_total) || abonos.reduce((a, b) => a + Number(b.monto), 0)) : 0;
  const saldo = Math.round((total - abonado) * 100) / 100;

  function legUsd(m: string, n: number): number {
    if (!n || n <= 0) return 0;
    if (m === 'USD' || m === 'USDT') return round2(n);
    if (m === 'Bs') return tasa > 0 ? round2(n / tasa) : 0;
    if (m === 'COP') return mercado?.copUsd ? round2(n / mercado.copUsd) : 0;
    return round2(n);
  }
  const sumUsd = round2(saldosCaja.reduce((a, s) => a + legUsd(s.moneda, Number(legMontos[s.id]) || 0), 0));

  async function handleAbonar() {
    setError(null);
    if (!o) return;
    const legs: AbonoLeg[] = saldosCaja
      .map((s) => ({ cajaId, cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: Number(legMontos[s.id]) || 0, montoUsd: legUsd(s.moneda, Number(legMontos[s.id]) || 0) }))
      .filter((l) => l.monto > 0);
    if (!legs.length) { setError('Indicá cuánto abonar en al menos una moneda.'); return; }
    if (sumUsd > saldo + 0.01) { setError(`El abono (${monto(sumUsd, 'USD')}) supera el saldo pendiente (${monto(saldo, 'USD')}).`); return; }
    setSaving(true);
    try {
      const r = await registrarAbonoMulti({ orden: o, legs, nota: nota.trim() || null, factura, actorEmail: actor, actorName });
      const saldadoNow = r.orden.estado !== 'cuenta_abierta';
      notify(saldadoNow
        ? `Crédito saldado · ${o.oc_codigo ?? o.codigo} · pasa a recepción/finalización`
        : `Abono ${monto(sumUsd, 'USD')} · ${o.oc_codigo ?? o.codigo}`, 'success');
      setLegMontos({}); setNota(''); setFactura(null);
      await onChanged();
      await cargar();
      if (!saldadoNow) await listAbonos(o.id).then(setAbonos);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el abono'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Cuentas por pagar (créditos)" size="xl" onClose={() => !saving && onClose()}
      footer={<button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>}>
      {loading && <p className="muted">Cargando…</p>}
      {!loading && !ordenes.length && <p className="muted" style={{ textAlign: 'center' }}>No hay compras a crédito con cuenta abierta. 🎉</p>}
      {!loading && ordenes.length > 0 && (
        <>
          <div className="form-row" style={{ marginBottom: '.6rem' }}>
            <label>Cuenta a crédito ({ordenes.length})</label>
            <select className="select" value={selId} onChange={(e) => setSelId(e.target.value)}>
              {ordenes.map((x) => (
                <option key={x.orden.id} value={x.orden.id}>
                  {x.orden.oc_codigo ?? x.orden.codigo} · {x.proveedorNombre} · saldo {monto(round2(Number(x.orden.total) - (Number(x.orden.abonado_total) || 0)), 'USD')}
                </option>
              ))}
            </select>
          </div>

          {o && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.6rem', marginBottom: '.75rem' }}>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>TOTAL</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{monto(total, 'USD')}</div>
                </div>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>ABONADO</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-3)' }}>{monto(abonado, 'USD')}</div>
                </div>
                <div className="card" style={{ margin: 0, padding: '.6rem .85rem' }}>
                  <div className="muted" style={{ fontSize: '.7rem' }}>SALDO</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: saldo > 0 ? 'var(--warning)' : 'var(--success)' }}>{monto(saldo, 'USD')}</div>
                </div>
              </div>
              {o.recibida_en && <div className="badge warning" style={{ marginBottom: '.6rem' }}>📦 Mercancía ya recibida · crédito pendiente</div>}

              {/* Conversión del saldo a Bs con tasa personalizable (por defecto BCV). */}
              <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
                <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>Saldo en USD</div>
                    <strong className="mono" style={{ fontSize: '1.1rem' }}>{monto(saldo, 'USD')}</strong>
                  </div>
                  <div style={{ fontSize: '1.1rem' }} className="muted">⇄</div>
                  <div>
                    <div className="muted" style={{ fontSize: '.72rem' }}>Equivale en Bs</div>
                    <strong className="mono" style={{ fontSize: '1.1rem' }}>{tasa > 0 ? monto(aBs(saldo, tasa), 'Bs') : '—'}</strong>
                  </div>
                  <div className="form-row" style={{ marginLeft: 'auto', minWidth: 160 }}>
                    <label style={{ fontSize: '.72rem' }}>Tasa (Bs por $) · editable, por defecto BCV</label>
                    <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
                      onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" />
                  </div>
                </div>
              </div>

              {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

              <div className="card" style={{ padding: '.75rem', marginBottom: '.75rem' }}>
                <div className="card-title" style={{ marginBottom: '.5rem' }}>Registrar abono (multipago)</div>
                <div className="form-row" style={{ marginBottom: '.5rem' }}>
                  <label>Caja (de dónde sale el dinero)</label>
                  <select className="select" value={cajaId} onChange={(e) => setCajaId(e.target.value)}>
                    {!cajas.length && <option value="">— sin cajas —</option>}
                    {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="table-wrap">
                  <table className="table" style={{ fontSize: '.84rem' }}>
                    <thead><tr><th>Moneda</th><th style={{ textAlign: 'right' }}>Disponible</th><th style={{ textAlign: 'right' }}>A abonar (en su moneda)</th><th style={{ textAlign: 'right' }}>Equiv. USD</th></tr></thead>
                    <tbody>
                      {!saldosCaja.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Esta caja no tiene saldos.</td></tr>}
                      {saldosCaja.map((s) => {
                        const n = Number(legMontos[s.id]) || 0;
                        const excede = n > Number(s.saldo);
                        const etq = s.cuenta === 'general' ? '' : s.cuenta === 'juridica' ? ' · Jurídica' : ' · Personal';
                        return (
                          <tr key={s.id}>
                            <td><span className="badge">{s.moneda}</span>{etq}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(s.saldo), s.moneda)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <input className="input mono" type="number" min={0} max={Number(s.saldo)} step="any"
                                value={legMontos[s.id] ?? ''} placeholder="0,00"
                                onChange={(e) => setLegMontos((m) => ({ ...m, [s.id]: dosDecimales(e.target.value) }))}
                                style={{ width: 130, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                            </td>
                            <td className="mono" style={{ textAlign: 'right' }}>{n > 0 ? monto(legUsd(s.moneda, n), 'USD') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Abono (USD)</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: sumUsd > saldo + 0.01 ? 'var(--danger)' : 'var(--success)' }}>{monto(sumUsd, 'USD')}</td></tr>
                    </tfoot>
                  </table>
                </div>
                <div className="form-grid" style={{ marginTop: '.5rem' }}>
                  <div className="form-row">
                    <label>Comprobante (PDF o imagen) (opcional)</label>
                    <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} />
                    {factura && <small className="muted">{factura.name}</small>}
                  </div>
                  <div className="form-row">
                    <label>Nota (opcional)</label>
                    <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia del abono…" />
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginTop: '.5rem' }}>
                  <button className="btn btn-success" disabled={saving || sumUsd <= 0} onClick={() => void handleAbonar()}>{saving ? 'Registrando…' : `💵 Registrar abono · ${monto(sumUsd, 'USD')}`}</button>
                </div>
              </div>

              <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Fecha</th><th style={{ textAlign: 'right' }}>Abono (USD)</th><th>Nota</th></tr></thead>
                  <tbody>
                    {!abonos.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin abonos todavía.</td></tr>}
                    {abonos.map((ab) => (
                      <tr key={ab.id}>
                        <td>{dateTime(ab.at)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(ab.monto), 'USD')}</td>
                        <td className="muted">{ab.nota || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function PagarOrdenModal({ row, cajas, actor, actorName, onClose, onPaid }: {
  row: OrdenPorPagar; cajas: Caja[]; actor: string; actorName: string | null; onClose: () => void; onPaid: () => void;
}) {
  const o = row.orden;
  // Contra entrega: se paga SOLO lo recibido (montoAPagar = recibido_total).
  const baseUsd = Number(row.montoAPagar ?? o.total) || 0;
  const pagoParcial = row.esContraEntrega && o.recibido_total != null && Number(o.recibido_total) < Number(o.total);
  const [cajaId, setCajaId] = useState(cajas[0]?.id ?? '');
  const [montoStr, setMontoStr] = useState(String(baseUsd));
  const [factura, setFactura] = useState<File | null>(null);
  const [motivoPago, setMotivoPago] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = cajas.find((c) => c.id === cajaId) ?? null;
  const moneda = caja?.moneda ?? 'USD';

  // Saldos multimoneda de la caja elegida (para el multipago por cuenta).
  const [saldosCaja, setSaldosCaja] = useState<CajaSaldo[]>([]);
  const [legMontos, setLegMontos] = useState<Record<string, string>>({});
  const [mercado, setMercado] = useState<TasasMercado | null>(null);
  useEffect(() => {
    if (!cajaId) { setSaldosCaja([]); return; }
    saldosDeCaja(cajaId).then((rows) => setSaldosCaja(rows.filter((r) => Number(r.saldo) > 0))).catch(() => setSaldosCaja([]));
    setLegMontos({});
  }, [cajaId]);
  useEffect(() => { getTasasMercado().then(setMercado).catch(() => setMercado(null)); }, []);
  // Caja con varias monedas (Multimoneda) → se paga repartiendo por cuenta.
  const esMultimoneda = saldosCaja.length >= 2;
  // Si el método de pago es en efectivo (divisas/Bs), no se exige comprobante.
  const comprobanteOpcional = pagoSinComprobante(o.metodo_pago);

  // El monto a pagar está en USD. Si se paga con una caja en Bs, se convierte
  // con la tasa BCV del día (editable). Se autocompleta el monto según la moneda.
  const totalUsd = baseUsd;
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

  // Multipago: equivalente en USD de un monto en su propia moneda (tasa del día).
  function legUsd(monedaLeg: string, n: number): number {
    if (!n || n <= 0) return 0;
    if (monedaLeg === 'USD' || monedaLeg === 'USDT') return round2(n);
    if (monedaLeg === 'Bs') return tasa > 0 ? round2(n / tasa) : 0;
    if (monedaLeg === 'COP') return mercado?.copUsd ? round2(n / mercado.copUsd) : 0;
    return round2(n); // moneda desconocida: se asume paridad con el dólar
  }
  const sumUsdMulti = round2(saldosCaja.reduce((a, s) => a + legUsd(s.moneda, Number(legMontos[s.id]) || 0), 0));
  const cubreTotalMulti = sumUsdMulti >= totalUsd - 0.01;
  // No se puede pagar más que el total de la OC (ni en multipago ni en pago simple).
  const excedeTotalMulti = sumUsdMulti > totalUsd + 0.01;
  const montoUsdSimple = moneda === 'Bs' ? (tasa > 0 ? round2(montoNum / tasa) : 0) : round2(montoNum);
  const excedeTotalSimple = !esMultimoneda && montoUsdSimple > totalUsd + 0.01;
  const excedeTotal = esMultimoneda ? excedeTotalMulti : excedeTotalSimple;

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
    if (!comprobanteOpcional && !factura) { setError('Adjuntá el comprobante (PDF o imagen).'); return; }
    if (factura && factura.type && factura.type !== 'application/pdf' && !factura.type.startsWith('image/')) {
      setError('El comprobante debe ser un PDF o una imagen.'); return;
    }
    setSaving(true);
    try {
      if (esMultimoneda) {
        const legs = saldosCaja
          .map((s) => ({ cuenta: s.cuenta as CuentaCaja, moneda: s.moneda, monto: Number(legMontos[s.id]) || 0, montoUsd: legUsd(s.moneda, Number(legMontos[s.id]) || 0) }))
          .filter((l) => l.monto > 0);
        if (!legs.length) { setError('Indicá cuánto pagar en al menos una moneda.'); setSaving(false); return; }
        if (excedeTotalMulti) { setError(`No podés pagar más que el total de la OC. Cargado ${monto(sumUsdMulti, 'USD')}, total ${monto(totalUsd, 'USD')} (te pasaste por ${monto(round2(sumUsdMulti - totalUsd), 'USD')}).`); setSaving(false); return; }
        if (!cubreTotalMulti) { setError(`Lo cargado (${monto(sumUsdMulti, 'USD')}) no cubre el total (${monto(totalUsd, 'USD')}).`); setSaving(false); return; }
        await pagarOrdenCompraMulti({ orden: o, cajaId, legs, factura, motivoPago: motivoPago || null, actorEmail: actor, actorName });
        notify(`OC ${o.oc_codigo ?? o.codigo} pagada · multipago ${monto(sumUsdMulti, 'USD')}`, 'success', { link: '#/app/tesoreria' });
        onPaid();
        return;
      }
      if (excedeTotalSimple) { setError(`No podés pagar más que el total de la OC (${monto(totalUsd, 'USD')}). El monto ingresado equivale a ${monto(montoUsdSimple, 'USD')}.`); setSaving(false); return; }
      await pagarOrdenCompra({
        orden: o, cajaId, monto: Number(montoStr) || 0,
        factura, motivoPago: motivoPago || null, actorEmail: actor, actorName,
      });
      notify(`OC ${o.oc_codigo ?? o.codigo} pagada · ${monto(Number(montoStr) || 0, moneda)}`, 'success', { link: '#/app/tesoreria' });
      onPaid();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo pagar.'); setSaving(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={() => descargarOrdenCompraPdf(o.id).catch(() => toast('No se pudo generar el PDF', 'error'))}>↓ OC PDF</button>
      <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="pagar-oc" className="btn btn-primary" disabled={saving || excedeTotal}>{saving ? 'Pagando…' : excedeTotal ? 'Excede el total de la OC' : `PAGAR ORDEN · ${esMultimoneda ? monto(sumUsdMulti, 'USD') : monto(Number(montoStr) || 0, moneda)}`}</button>
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
            <div><span className="muted">Condición de pago:</span>{' '}
              <span className="badge" style={{ background: 'var(--primary-2)', color: '#fff', fontWeight: 600 }}>
                {o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : 'Contado / anticipado'}
              </span>
            </div>
          </div>
        </div>

        {pagoParcial && (
          <div className="card" style={{ marginBottom: '.75rem', borderLeft: '3px solid var(--warning)', background: 'var(--bg-1)' }}>
            <div style={{ fontSize: '.84rem' }}>
              <strong>Pago por monto recibido (recepción parcial).</strong> De {monto(o.total, 'USD')} pedidos
              se recibieron {monto(Number(o.recibido_total), 'USD')}; se paga solo lo recibido.
              {o.nota_recepcion && <div className="muted" style={{ marginTop: '.2rem' }}>Nota: {o.nota_recepcion}</div>}
            </div>
          </div>
        )}

        {/* Método de pago indicado en Compras (multipago) */}
        {o.metodo_pago && o.metodo_pago.length > 0 && (
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Método de pago indicado{comprobanteOpcional ? ' · efectivo (sin comprobante)' : ''}</div>
            {o.metodo_pago.map((m, i) => (
              <div key={i} style={{ padding: '.15rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem' }}>
                  <span>{labelMetodoPago(m.metodo)}</span>
                  <strong className="mono">{m.monto > 0 ? monto(m.monto, m.moneda) : m.moneda}</strong>
                </div>
                {m.datos && Object.keys(m.datos).length > 0 && (
                  <div className="muted" style={{ fontSize: '.74rem', paddingLeft: '.3rem' }}>↳ {resumenDatosPago(m.metodo, m.datos)}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Soporte / Retención: tipo y comprobantes (descarga) — reflejo del módulo Retenciones */}
        {o.comprobante_tipo && (
          <div className="card" style={{ marginBottom: '.75rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Soporte / Retención</div>
            <div style={{ fontSize: '.85rem' }}>
              Soporte: <strong>{o.comprobante_tipo === 'factura' ? 'Factura' : 'Nota de entrega'}</strong>
              {o.comprobante_tipo === 'factura' && <> · Retención: <strong>{labelRetencionModo(o.retencion_modo)}</strong>{o.retencion_pagada ? <span className="badge" style={{ marginLeft: '.4rem', color: 'var(--success)' }}>✓ pagada</span> : null}</>}
            </div>
            {comprobantesDeOrden(o).length > 0 ? (
              <div style={{ display: 'grid', gap: '.3rem', marginTop: '.4rem' }}>
                {comprobantesDeOrden(o).map((c) => (
                  <div key={c.tipo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
                    <span><span className="badge">{c.label}</span> <span className="muted">{c.nombre}</span></span>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => urlRetencion(c.path).then((u) => window.open(u, '_blank', 'noopener')).catch(() => toast('No se pudo abrir el comprobante', 'error'))}>📎 Descargar</button>
                  </div>
                ))}
              </div>
            ) : o.comprobante_tipo === 'factura' ? (
              <div className="muted" style={{ fontSize: '.78rem', marginTop: '.3rem' }}>Retención aún no cargada en el módulo Retenciones.</div>
            ) : null}
          </div>
        )}

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
              <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
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
          {!esMultimoneda && (
            <div className="form-row">
              <label>Monto a pagar ({moneda})</label>
              <input className="input mono" type="number" min={0} step="any" value={montoStr} onChange={(e) => setMontoStr(dosDecimales(e.target.value))} required={!esMultimoneda}
                style={{ borderColor: excedeTotalSimple ? 'var(--danger)' : undefined }} />
              {excedeTotalSimple && (
                <small style={{ color: 'var(--danger)' }}>⚠ No podés pagar más que el total de la OC ({monto(totalUsd, 'USD')}{moneda === 'Bs' && tasa > 0 ? ` ≈ ${monto(aBs(totalUsd, tasa), 'Bs')}` : ''}).</small>
              )}
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
          )}
        </div>

        {/* Multipago por cuenta: repartí el total entre las monedas de la caja Multimoneda. */}
        {esMultimoneda && (
          <div className="card" style={{ marginBottom: '.75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Multipago por cuenta · ¿cuánto sale de cada moneda?</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.84rem' }}>
                <thead><tr><th>Moneda</th><th style={{ textAlign: 'right' }}>Disponible</th><th style={{ textAlign: 'right' }}>A pagar (en su moneda)</th><th style={{ textAlign: 'right' }}>Equiv. USD</th></tr></thead>
                <tbody>
                  {saldosCaja.map((s) => {
                    const n = Number(legMontos[s.id]) || 0;
                    const excede = n > Number(s.saldo);
                    const etiquetaCuenta = s.cuenta === 'general' ? '' : s.cuenta === 'juridica' ? ' · Jurídica' : ' · Personal';
                    return (
                      <tr key={s.id}>
                        <td><span className="badge">{s.moneda}</span>{etiquetaCuenta}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto(Number(s.saldo), s.moneda)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input className="input mono" type="number" min={0} max={Number(s.saldo)} step="any"
                            value={legMontos[s.id] ?? ''} placeholder="0,00"
                            onChange={(e) => setLegMontos((m) => ({ ...m, [s.id]: dosDecimales(e.target.value) }))}
                            style={{ width: 130, textAlign: 'right', borderColor: excede ? 'var(--danger)' : undefined }} />
                        </td>
                        <td className="mono" style={{ textAlign: 'right' }}>{n > 0 ? monto(legUsd(s.moneda, n), 'USD') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Cubierto / Total</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: excedeTotalMulti ? 'var(--danger)' : cubreTotalMulti ? 'var(--success)' : 'var(--warning)' }}>
                      {monto(sumUsdMulti, 'USD')} / {monto(totalUsd, 'USD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
              {excedeTotalMulti
                ? <span style={{ color: 'var(--danger)' }}>⚠ Te pasaste por <strong>{monto(round2(sumUsdMulti - totalUsd), 'USD')}</strong>. No podés pagar más que el total de la OC ({monto(totalUsd, 'USD')}).</span>
                : cubreTotalMulti
                ? <>✓ Cubre exactamente el total. Cada moneda se descuenta de su saldo real con la tasa del día.</>
                : <>Faltan <strong>{monto(round2(totalUsd - sumUsdMulti), 'USD')}</strong>. Bs↔$ usa la tasa BCV de arriba.</>}
            </small>
          </div>
        )}
        <div className="form-grid">
          <div className="form-row">
            <label>Comprobante (PDF o imagen) {comprobanteOpcional ? '(opcional)' : '*'}</label>
            <input className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} required={!comprobanteOpcional} />
            {factura && <small className="muted">{factura.name}</small>}
            {comprobanteOpcional && <small className="muted">Pago en efectivo: el comprobante no es obligatorio.</small>}
          </div>
          <div className="form-row">
            <label>Motivo del pago</label>
            <input className="input" value={motivoPago} onChange={(e) => setMotivoPago(e.target.value)} placeholder="Nota del pago (opcional)" />
            <small className="muted">Se suma al motivo de la OP en el registro de movimientos.</small>
          </div>
        </div>
      </form>
    </Modal>
  );
}
