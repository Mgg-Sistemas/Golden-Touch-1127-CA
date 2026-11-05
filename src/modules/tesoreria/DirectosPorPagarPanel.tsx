/* ============================================================
   Golden Touch · Tesorería · Directos por pagar
   Lista las COMPRAS y SERVICIOS DIRECTOS en estado "por pagar"
   (el analista ya montó la factura y los montos) para que Tesorería
   los PAGUE desde aquí. Al pagar, sale de la caja correspondiente,
   (en compras) entra al inventario, y queda FINALIZADA. Reusa los
   modales de pago de Compra/Servicio Directo.
   ============================================================ */
import { Quien } from '@/shared/ui/Quien';
import { supabase } from '@/shared/lib/supabase';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { money, dateTime } from '@/shared/lib/format';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { notify } from '@/shared/lib/notify';
import type { Caja, CajaSaldo } from '@/shared/lib/types';
import { listSaldos } from '@/modules/tesoreria/cajaSaldos.repository';
import { getTasaHoy } from '@/modules/tesoreria/tasas.repository';
import { convertirConTasa, errorTasaPago, requiereTasa } from '@/modules/pedidos/tasaPago';
import { listComprasDirectas, type CompraDirecta } from '@/modules/pedidos/compras.repository';
import {
  listServiciosDirectos, registrarAbonoServicio, listAbonosServicio,
  type ServicioDirecto, type AbonoServicio,
} from '@/modules/pedidos/serviciosDirectos.repository';
import { FinalizarCompraModal, AdjuntoLink as AdjuntoCompraLink } from '@/modules/pedidos/CompraDirectaView';
import { FinalizarServicioModal, AdjuntoLink as AdjuntoServicioLink } from '@/modules/pedidos/ServicioDirectoView';
import { FacturasDirectas } from '@/modules/pedidos/FacturasDirectas';

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

export interface DirectosPorPagarPanelProps {
  cajas: Caja[];
  actor: string;
  actorName: string | null;
  onPaid: () => void;
  onCountsChange?: (counts: { total: number; operacion: number; gastosFijos: number }) => void;
  sinBorde?: boolean;
}

export function DirectosPorPagarPanel({
  cajas,
  actor,
  actorName,
  onPaid,
  onCountsChange,
  sinBorde = false,
}: DirectosPorPagarPanelProps) {
  const [compras, setCompras] = useState<CompraDirecta[]>([]);
  const [servicios, setServicios] = useState<ServicioDirecto[]>([]);
  const [pagarC, setPagarC] = useState<CompraDirecta | null>(null);
  const [pagarS, setPagarS] = useState<ServicioDirecto | null>(null);
  const [abonarS, setAbonarS] = useState<ServicioDirecto | null>(null);
  // Ver la factura del proveedor antes de pagar (12/10/2026: no se veía en Tesorería).
  const [verFactura, setVerFactura] = useState<{ tipo: 'compra'; c: CompraDirecta } | { tipo: 'servicio'; s: ServicioDirecto } | null>(null);
  // Switch de vista: operación (compras/servicios normales) vs los GASTOS FIJOS de
  // Administración materializados aquí como servicios directos. Un usuario de Tesorería
  // los ve por su permiso de Tesorería, sin necesitar acceso al módulo Administración.
  const [vista, setVista] = useState<'operacion' | 'gastos_fijos'>('operacion');

  const reload = useCallback(async () => {
    const [cs, ss, anuladosRes] = await Promise.all([
      listComprasDirectas().catch(() => [] as CompraDirecta[]),
      listServiciosDirectos().catch(() => [] as ServicioDirecto[]),
      supabase
        .from('admin_gasto_fijo_movimientos')
        .select('id, servicio_directo_id, empresa_clave, periodo, concepto, estado_pago')
        .eq('estado_pago', 'anulado')
        .then(
          (r) => r,
          () => ({ data: null }),
        ),
    ]);

    const movsAnulados = (anuladosRes?.data ?? []) as Array<{
      id: string;
      servicio_directo_id: string | null;
      empresa_clave: string;
      periodo: string;
      concepto: string;
    }>;

    const idsAnuladosDirectos = new Set(movsAnulados.map((m) => m.servicio_directo_id).filter(Boolean));

    // Identificar y purgar servicios directos cuyos gastos fueron anulados en Administración
    const ssPorPagar = ss.filter((s: ServicioDirecto) => s.estado === 'por_pagar');
    const huerfanosPurgar: string[] = [];

    const ssFiltrados = ssPorPagar.filter((s: ServicioDirecto) => {
      if (idsAnuladosDirectos.has(s.id)) {
        huerfanosPurgar.push(s.id);
        return false;
      }
      if (s.empresa_clave) {
        const coincideAnulado = movsAnulados.some((m) => {
          if (m.empresa_clave !== s.empresa_clave) return false;
          const nota = (s.nota || '').toLowerCase();
          const desc = (s.descripcion || '').toLowerCase();
          const periodo = (m.periodo || '').toLowerCase();
          const conc = (m.concepto || '').toLowerCase();
          return (periodo && (nota.includes(periodo) || desc.includes(periodo)))
            || (conc && (nota.includes(conc) || desc.includes(conc)));
        });
        if (coincideAnulado) {
          huerfanosPurgar.push(s.id);
          return false;
        }
      }
      return true;
    });

    if (huerfanosPurgar.length > 0) {
      void supabase.from('servicios_directos').delete().in('id', huerfanosPurgar).then(() => {}, () => {});
    }

    setCompras(cs.filter((c: CompraDirecta) => c.estado === 'por_pagar'));
    setServicios(ssFiltrados);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['compras_directas', 'servicios_directos'], () => { void reload(); });

  // Operación vs. gastos fijos: los gastos fijos de Administración se materializan aquí como
  // servicios directos con `empresa_clave` (los normales la tienen null). El switch los separa.
  const serviciosOp = useMemo(() => servicios.filter((s) => !s.empresa_clave), [servicios]);
  const serviciosGF = useMemo(() => servicios.filter((s) => s.empresa_clave), [servicios]);
  const comprasVista = vista === 'operacion' ? compras : [];
  const serviciosVista = vista === 'operacion' ? serviciosOp : serviciosGF;
  const total = comprasVista.reduce((a, c) => a + (c.gasto ?? 0), 0) + serviciosVista.reduce((a, s) => a + (s.gasto ?? 0), 0);

  useEffect(() => {
    onCountsChange?.({
      total: compras.length + servicios.length,
      operacion: compras.length + serviciosOp.length,
      gastosFijos: serviciosGF.length,
    });
  }, [compras.length, servicios.length, serviciosOp.length, serviciosGF.length, onCountsChange]);

  if (!compras.length && !servicios.length) {
    if (sinBorde) {
      return (
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '.4rem' }}>✅</div>
          <strong style={{ fontSize: '1.05rem', color: '#10b981' }}>No hay compras directas ni gastos fijos por pagar</strong>
          <p className="muted" style={{ fontSize: '.84rem', marginTop: '.35rem', maxWidth: 460, marginInline: 'auto' }}>
            Todos los servicios directos y gastos fijos de las empresas están pagados y al día en Tesorería.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={sinBorde ? '' : 'card'} style={sinBorde ? { display: 'flex', flexDirection: 'column', gap: '.4rem' } : { marginTop: '1rem', borderColor: 'var(--brand, #ff8a00)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>🧾 Directos por pagar{' '}
          <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#1a1a1a' }}>DIRECTO</span>
        </strong>
        <span className="muted mono">{comprasVista.length + serviciosVista.length} · {money(total)}</span>
      </div>
      <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
        El analista cargó la factura y los montos. Al pagar, el gasto sale de la caja elegida (en compras, entra al inventario) y queda <strong>Finalizada</strong>.
      </div>

      {/* Switch de vista: Operación vs. Gastos fijos (de Administración). Siempre visible para
          que Tesorería vea «su lado» de gastos fijos; se gobierna con el permiso de Tesorería. */}
      <div className="view-toggle" role="tablist" aria-label="Vista de pendientes" style={{ marginTop: '.6rem' }}>
        <button type="button" role="tab" aria-selected={vista === 'operacion'} className={vista === 'operacion' ? 'active' : ''} onClick={() => setVista('operacion')}>🧾 Operación</button>
        <button type="button" role="tab" aria-selected={vista === 'gastos_fijos'} className={vista === 'gastos_fijos' ? 'active' : ''} onClick={() => setVista('gastos_fijos')}>📌 Gastos fijos{serviciosGF.length ? ` (${serviciosGF.length})` : ''}</button>
      </div>

      {comprasVista.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table">
            <thead><tr><th colSpan={6}>🛒 Compras</th></tr><tr><th>Código</th><th>Material(es)</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
            <tbody>
              {comprasVista.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.codigo ?? '—'}</td>
                  <td>{c.producto_nombre}{c.items.length > 1 ? <span className="muted"> · {c.items.length} ítems</span> : null}
                    {c.nota?.trim() && <div className="muted" style={{ fontSize: '.74rem', marginTop: '.15rem', whiteSpace: 'pre-wrap' }}>📝 {c.nota}</div>}</td>
                  <td>{c.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{<Quien nombre={c.actor_name} correo={c.actor} vacio="—" />}<br />{dateTime(c.updated_at)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{c.gasto != null ? montoMoneda(c.gasto, c.moneda) : '—'}
                    {equivConversion(c.gasto, c.moneda, c.tasa_conversion) && <div className="muted" style={{ fontSize: '.7rem', fontWeight: 400 }}>{equivConversion(c.gasto, c.moneda, c.tasa_conversion)}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setVerFactura({ tipo: 'compra', c })} title="Ver la factura del proveedor">🧾 Factura</button>{' '}
                    <button className="btn btn-sm btn-primary" onClick={() => setPagarC(c)} title="Pagar y finalizar la compra">💳 Pagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {serviciosVista.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table className="table">
            <thead><tr><th colSpan={6}>{vista === 'gastos_fijos' ? '📌 Gastos fijos' : '🔧 Servicios'}</th></tr><tr><th>Código</th><th>{vista === 'gastos_fijos' ? 'Concepto' : 'Servicio(s)'}</th><th>Proveedor</th><th>Montó</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
            <tbody>
              {serviciosVista.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.codigo ?? '—'}</td>
                  <td>{s.descripcion}{s.items.length > 1 ? <span className="muted"> · {s.items.length} ítems</span> : null}
                    {s.nota?.trim() && <div className="muted" style={{ fontSize: '.74rem', marginTop: '.15rem', whiteSpace: 'pre-wrap' }}>📝 {s.nota}</div>}</td>
                  <td>{s.proveedor_nombre || <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>{<Quien nombre={s.actor_name} correo={s.actor} vacio="—" />}<br />{dateTime(s.updated_at)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{s.gasto != null ? montoMoneda(s.gasto, s.moneda) : '—'}
                    {equivConversion(s.gasto, s.moneda, s.tasa_conversion) && <div className="muted" style={{ fontSize: '.7rem', fontWeight: 400 }}>{equivConversion(s.gasto, s.moneda, s.tasa_conversion)}</div>}
                    {s.con_abonos && (
                      <div className="muted" style={{ fontSize: '.7rem', fontWeight: 400 }}>
                        <span className="badge" style={{ background: 'var(--brand, #ff8a00)', color: '#111' }}>ABONOS</span>{' '}
                        abonado {montoMoneda(Number(s.abonado_total) || 0, s.moneda)} · saldo {montoMoneda(Math.max(0, (Number(s.gasto) || 0) - (Number(s.abonado_total) || 0)), s.moneda)}
                      </div>
                    )}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setVerFactura({ tipo: 'servicio', s })} title="Ver la factura del proveedor">🧾 Factura</button>{' '}
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

      {vista === 'gastos_fijos' && serviciosVista.length === 0 && (
        <div className="muted" style={{ marginTop: '.6rem', fontSize: '.85rem' }}>
          No hay gastos fijos por pagar en este momento. Los pendientes de Administración aparecen aquí
          automáticamente cuando se generan (se reflejan como servicios directos por pagar).
        </div>
      )}

      {verFactura && (
        <Modal title={`🧾 Factura · ${(verFactura.tipo === 'compra' ? verFactura.c.codigo : verFactura.s.codigo) ?? ''}`} size="md" onClose={() => setVerFactura(null)}
          footer={<button className="btn btn-primary" onClick={() => setVerFactura(null)}>Cerrar</button>}>
          {verFactura.tipo === 'compra' ? (
            <>
              {verFactura.c.adjunto_path && <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}><strong>Factura:</strong> <AdjuntoCompraLink compra={verFactura.c} /></div>}
              <FacturasDirectas modulo="compra" refId={verFactura.c.id} actor={actor} soloLectura titulo="🧾 Facturas del proveedor" />
            </>
          ) : (
            <>
              {verFactura.s.adjunto_path && <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}><strong>Factura:</strong> <AdjuntoServicioLink servicio={verFactura.s} /></div>}
              <FacturasDirectas modulo="servicio" refId={verFactura.s.id} actor={actor} soloLectura titulo="🧾 Facturas del proveedor" />
            </>
          )}
        </Modal>
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
  // De qué billetera sale el dinero y a qué tasa. El abono se ACUMULA en la moneda del
  // servicio; si la billetera está en otra, Tesorería ajusta la tasa y sale el equivalente.
  const [monedaPago, setMonedaPago] = useState<string>(moneda);
  const [tasa, setTasa] = useState<number>(0);
  const [monto, setMonto] = useState(String(saldo > 0 ? saldo : ''));
  const [nota, setNota] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listAbonosServicio(servicio.id).then(setAbonos).catch(() => setAbonos([])); }, [servicio.id]);
  useEffect(() => { listSaldos().then(setSaldos).catch(() => setSaldos([])); }, []);
  useEffect(() => { getTasaHoy().then((t) => { if (t.usd != null) setTasa(t.usd); }).catch(() => { /* sin tasa */ }); }, []);

  // Saldo REAL de una caja en una moneda (suma sus billeteras de caja_saldos). Si la caja
  // aún no tiene saldos multimoneda, usa el saldo legado para la moneda del servicio.
  const saldoCajaEnMoneda = (cId: string, m: string): number => {
    const rows = saldos.filter((s) => s.caja_id === cId && s.moneda === m);
    if (rows.length) return Math.round(rows.reduce((a, r) => a + (Number(r.saldo) || 0), 0) * 100) / 100;
    const c = cajas.find((x) => x.id === cId);
    return m === moneda ? Number(c?.saldo) || 0 : 0;
  };
  // Cajas con saldo en CUALQUIER moneda: el abono puede salir de una billetera en otra
  // moneda, convertido a la tasa que fije Tesorería.
  const monedasDeCaja = (cId: string): string[] => {
    const ms = [...new Set(saldos.filter((s) => s.caja_id === cId && Number(s.saldo) > 0).map((s) => s.moneda))];
    if (ms.length) return ms;
    return (Number(cajas.find((x) => x.id === cId)?.saldo) || 0) > 0 ? [moneda] : [];
  };
  const cajasConSaldo = cajas.filter((c) => monedasDeCaja(c.id).length > 0);
  // Al cargar los saldos, elige por defecto la primera caja con fondos.
  useEffect(() => {
    if (!cajaId && cajasConSaldo.length) setCajaId(cajasConSaldo[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldos]);
  // Monedas disponibles en la caja elegida; si la del servicio está, se prefiere.
  const monedasCaja = cajaId ? monedasDeCaja(cajaId) : [];
  useEffect(() => {
    if (!monedasCaja.length || monedasCaja.includes(monedaPago)) return;
    setMonedaPago(monedasCaja.includes(moneda) ? moneda : monedasCaja[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaId, saldos]);
  const dispCaja = cajaId ? saldoCajaEnMoneda(cajaId, monedaPago) : 0;

  const montoNum = Math.round((Number(monto) || 0) * 100) / 100;
  // Lo que realmente sale de la billetera (en su moneda).
  const cruzaMoneda = requiereTasa(moneda, monedaPago);
  const montoPagado = convertirConTasa(montoNum, moneda, monedaPago, tasa);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!cajaId) { setError('Elige la caja de la que sale el dinero.'); return; }
    if (montoNum <= 0) { setError('Indica el monto del abono.'); return; }
    if (montoNum > saldo + 0.01) { setError(`El abono supera el saldo pendiente (${montoMoneda(saldo, moneda)}).`); return; }
    const errT = errorTasaPago(moneda, monedaPago, tasa);
    if (errT) { setError(errT); return; }
    if (montoPagado <= 0) { setError('No se pudo convertir el abono a la moneda de la billetera.'); return; }
    if (montoPagado > dispCaja + 0.01) { setError(`La caja no tiene suficiente ${monedaPago}. Disponible: ${montoMoneda(dispCaja, monedaPago)}. Requiere ${montoMoneda(montoPagado, monedaPago)}.`); return; }
    if (file && file.type && file.type !== 'application/pdf' && !file.type.startsWith('image/')) { setError('El comprobante debe ser PDF o imagen.'); return; }
    setSaving(true);
    try {
      await registrarAbonoServicio({
        servicio, cajaId, monto: montoNum,
        monedaPago, tasaPago: cruzaMoneda ? tasa : 0,
        nota: nota || null, file, actor, actorName,
      });
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
        {saving ? 'Registrando…' : `Registrar abono · ${montoMoneda(montoNum, moneda)}${cruzaMoneda && montoPagado > 0 ? ` · sale ${montoMoneda(montoPagado, monedaPago)}` : ''}`}
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
                  <td className="muted" style={{ fontSize: '.75rem' }}>{<Quien nombre={a.actor_name} correo={a.actor} vacio="—" />}{a.nota ? ` · ${a.nota}` : ''}</td>
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
              placeholder={cajasConSaldo.length ? '🔍 Buscar caja…' : '— sin cajas con saldo —'}
              options={cajasConSaldo.map((c) => ({
                value: c.id,
                label: `${c.nombre} · ${monedasDeCaja(c.id).map((m) => montoMoneda(saldoCajaEnMoneda(c.id, m), m)).join(' · ')}`,
              }))} />
            {cajaId && <small className="muted">Disponible en la billetera: <strong className="mono">{montoMoneda(dispCaja, monedaPago)}</strong> ({monedaPago})</small>}
          </div>

          {cajaId && monedasCaja.length > 0 && (
            <div className="form-row" style={{ maxWidth: 420 }}>
              <label>Se paga con</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="select" style={{ maxWidth: 140 }} value={monedaPago} onChange={(e) => setMonedaPago(e.target.value)}>
                  {monedasCaja.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {cruzaMoneda && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
                    <span className="muted" style={{ fontSize: '.78rem' }}>Tasa de pago (Bs/$)</span>
                    <input className="input mono" type="number" min={0} step="any" value={tasa || ''}
                      onChange={(e) => setTasa(Number(e.target.value) || 0)} placeholder="0,00" style={{ width: 120, textAlign: 'right' }} />
                  </label>
                )}
              </div>
              <small className="muted">
                {cruzaMoneda
                  ? <>El abono se anota en <strong>{moneda}</strong> y de la caja salen{' '}
                      <strong className="mono">{montoPagado > 0 ? montoMoneda(montoPagado, monedaPago) : '—'}</strong>.{' '}
                      La tasa arranca en la BCV de hoy y se puede <strong>ajustar</strong>.</>
                  : <>La billetera está en la misma moneda del servicio: sale el monto tal cual.</>}
              </small>
            </div>
          )}
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
