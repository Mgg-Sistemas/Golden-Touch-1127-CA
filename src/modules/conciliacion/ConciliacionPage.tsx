/* ============================================================
   Conciliación (12/11/2026) · módulo de SOLO LECTURA.

   Una fila por OC de Compras con: ítem, código OC, proveedor, monto en $ y
   en Bs (a la tasa del pago), referencia del pago (la que anota Tesorería),
   retención (tipo y número de comprobante), factura (vista previa de lo que
   cargó el delivery o el almacenista) y estatus de Compras.

   Arriba, tres tarjetas (Total de OC, Total pagado, OC con retenciones): al
   tocar una se abre su detalle, y al tocar una OC del detalle se va a Compras
   con esa OC abierta. «Reporte» arma el PDF / Excel / WhatsApp con vista previa.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { Modal } from '@/shared/ui/Modal';
import type { Orden } from '@/shared/lib/types';
import { FacturasOcModal } from '@/modules/pedidos/FacturasOcModal';
import { diaVE } from '@/modules/tesoreria/tasas.repository';
import { cargarConciliacion } from './conciliacion.repository';
import {
  FILTROS_VACIOS, filtrarFilas, indicadores, renumerar, textoFuenteTasa, textoReferencia,
  type FilaConciliacion, type FiltrosConciliacion,
} from './conciliacion';
import { bs, describirFiltros, fechaCorta, usd } from './reporteConciliacion';
import { ReporteConciliacionModal } from './ReporteConciliacionModal';

type Tarjeta = 'total' | 'pagado' | 'retencion';

const TITULO_TARJETA: Record<Tarjeta, string> = {
  total: 'Total de OC',
  pagado: 'Total pagado',
  retencion: 'OC con retenciones',
};

const POR_PAGINA = 100;
/** Estatus en los que ya puede haber factura cargada por delivery o almacén. */
const CON_FACTURA = new Set(['pagada', 'por_recibir', 'recibida', 'finalizada', 'cuenta_abierta']);

export function ConciliacionPage() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [filas, setFilas] = useState<FilaConciliacion[]>([]);
  const [ordenes, setOrdenes] = useState<Map<string, Orden>>(new Map());
  const [avisos, setAvisos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<FiltrosConciliacion>(FILTROS_VACIOS);
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [tarjeta, setTarjeta] = useState<Tarjeta | null>(null);
  const [factura, setFactura] = useState<Orden | null>(null);
  const [reporte, setReporte] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const d = await cargarConciliacion();
      setFilas(d.filas); setOrdenes(d.ordenes); setAvisos(d.avisos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la conciliación.');
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const filtradas = useMemo(() => renumerar(filtrarFilas(filas, f, diaVE)), [filas, f]);
  const k = useMemo(() => indicadores(filtradas), [filtradas]);
  const estados = useMemo(() => [...new Set(filas.map((r) => r.estadoLabel))].sort((a, b) => a.localeCompare(b, 'es')), [filas]);
  const hayFiltros = JSON.stringify(f) !== JSON.stringify(FILTROS_VACIOS);
  useEffect(() => { setVisibles(POR_PAGINA); }, [f]);

  const filasTarjeta = useMemo(() => {
    if (tarjeta === 'pagado') return filtradas.filter((r) => r.pagada);
    if (tarjeta === 'retencion') return filtradas.filter((r) => r.llevaRetencion);
    return filtradas;
  }, [tarjeta, filtradas]);

  const abrirEnCompras = (ordenId: string) => navigate(`/app/pedidos?detalle=${encodeURIComponent(ordenId)}`);
  const set = <K extends keyof FiltrosConciliacion>(clave: K, valor: FiltrosConciliacion[K]) => setF((x) => ({ ...x, [clave]: valor }));

  if (!can('conciliacion')) {
    return <div className="page"><div className="card">No tienes acceso a Conciliación.</div></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>📒 Conciliación</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0', maxWidth: '78ch' }}>
            Solo lectura. Cada OC de Compras con su monto en $ y en Bs a la tasa del pago, la referencia que anotó
            Tesorería, sus retenciones y su factura. Toca una tarjeta para ver el detalle y una OC para abrirla en Compras.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>↻ Actualizar</button>
          <button className="btn btn-primary" onClick={() => setReporte(true)} disabled={cargando || !filtradas.length}>📊 Reporte</button>
        </div>
      </div>

      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}><strong>Error:</strong> {error}</div>}
      {avisos.map((a) => (
        <div key={a} className="card" style={{ borderLeft: '3px solid var(--warning)', marginBottom: '.75rem', fontSize: '.88rem' }}>⚠ {a}</div>
      ))}

      {/* ── Tarjetas ── */}
      <div className="kpi-grid">
        <TarjetaKpi icono="🧾" titulo={TITULO_TARJETA.total} valor={String(k.totalOc.cantidad)}
          nota={`${usd(k.totalOc.usd)} · ${bs(k.totalOc.bs)}`} onClick={() => setTarjeta('total')} cargando={cargando} />
        <TarjetaKpi icono="💵" titulo={TITULO_TARJETA.pagado} valor={usd(k.pagado.usd)}
          nota={`${bs(k.pagado.bs)} · ${k.pagado.cantidad} OC pagadas`} onClick={() => setTarjeta('pagado')} cargando={cargando} />
        <TarjetaKpi icono="🧮" titulo={TITULO_TARJETA.retencion} valor={String(k.conRetencion.cantidad)}
          nota={`${usd(k.conRetencion.usd)} · ${bs(k.conRetencion.bs)}`} onClick={() => setTarjeta('retencion')} cargando={cargando} />
      </div>

      {/* ── Filtros ── */}
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
        <div className="form-row" style={{ flex: '2 1 220px', margin: 0 }}>
          <label>Buscar</label>
          <input className="input" value={f.texto} onChange={(e) => set('texto', e.target.value)} placeholder="🔍 OC, proveedor, referencia o comprobante…" />
        </div>
        <div className="form-row" style={{ flex: '1 1 170px', margin: 0 }}>
          <label>Estatus</label>
          <select className="select" value={f.estado} onChange={(e) => set('estado', e.target.value)}>
            <option value="">Todos</option>
            {estados.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ flex: '1 1 140px', margin: 0 }}>
          <label>Pago</label>
          <select className="select" value={f.pago} onChange={(e) => set('pago', e.target.value as FiltrosConciliacion['pago'])}>
            <option value="todas">Todas</option>
            <option value="pagadas">Pagadas</option>
            <option value="sin_pagar">Sin pagar</option>
          </select>
        </div>
        <div className="form-row" style={{ flex: '1 1 140px', margin: 0 }}>
          <label>Retención</label>
          <select className="select" value={f.retencion} onChange={(e) => set('retencion', e.target.value as FiltrosConciliacion['retencion'])}>
            <option value="todas">Todas</option>
            <option value="con">Con retención</option>
            <option value="sin">Sin retención</option>
          </select>
        </div>
        <div className="form-row" style={{ flex: '1 1 130px', margin: 0 }}>
          <label>Desde</label>
          <input className="input" type="date" value={f.desde} onChange={(e) => set('desde', e.target.value)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 130px', margin: 0 }}>
          <label>Hasta</label>
          <input className="input" type="date" value={f.hasta} onChange={(e) => set('hasta', e.target.value)} />
        </div>
        <label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: '.85rem', paddingBottom: '.55rem' }}>
          <input type="checkbox" checked={f.incluirAnuladas} onChange={(e) => set('incluirAnuladas', e.target.checked)} />
          Incluir canceladas
        </label>
        {hayFiltros && <button className="btn btn-ghost btn-sm" onClick={() => setF(FILTROS_VACIOS)}>Limpiar</button>}
      </div>

      {/* ── Tabla ── */}
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Ítem</th>
              <th>Código OC</th>
              <th>Proveedor</th>
              <th style={{ textAlign: 'right' }}>Monto de la OC</th>
              <th>Referencia de pago</th>
              <th>Retención</th>
              <th>Factura</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>Cargando…</td></tr>}
            {!cargando && !filtradas.length && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                {filas.length ? 'Ninguna OC coincide con los filtros.' : 'Todavía no hay OC.'}
              </td></tr>
            )}
            {!cargando && filtradas.slice(0, visibles).map((r) => (
              <tr key={r.ordenId}>
                <td className="mono" style={{ textAlign: 'right' }}>{r.item}</td>
                <td>
                  <button type="button" className="btn btn-link" style={{ padding: 0, fontWeight: 700 }}
                    onClick={() => abrirEnCompras(r.ordenId)} title="Abrir esta OC en Compras">{r.codigo}</button>
                  <div className="muted" style={{ fontSize: '.72rem' }}>{fechaCorta(r.fecha)}</div>
                </td>
                <td>{r.proveedor}</td>
                <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div>{usd(r.totalUsd)}</div>
                  <div>{bs(r.totalBs)}</div>
                  {r.tasa != null && (
                    <div className="muted" style={{ fontSize: '.7rem' }} title={textoFuenteTasa(r.fuenteTasa)}>
                      tasa {r.tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {r.fuenteTasa === 'bcv_hoy' ? ' · hoy' : ''}
                    </div>
                  )}
                </td>
                <td>
                  {r.referencias.length
                    ? r.referencias.map((x) => <span key={x} className="badge mono" style={{ marginRight: '.25rem' }}>{x}</span>)
                    : <span className="muted">{textoReferencia(r)}</span>}
                  {r.fechaPago && <div className="muted" style={{ fontSize: '.72rem' }}>Pagada {fechaCorta(r.fechaPago)}</div>}
                </td>
                <td>
                  {!r.llevaRetencion ? <span className="muted">No</span> : r.retenciones.map((x, i) => (
                    <div key={`${x.tipo}-${i}`} style={{ fontSize: '.85rem' }}>
                      <span className="badge warning">{x.tipo}</span>{' '}
                      {x.comprobante ? <span className="mono">N° {x.comprobante}</span> : <span className="muted">sin comprobante</span>}
                    </div>
                  ))}
                </td>
                <td>
                  {CON_FACTURA.has(r.estado) && ordenes.get(r.ordenId)
                    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFactura(ordenes.get(r.ordenId) ?? null)}>👁 Ver</button>
                    : <span className="muted">—</span>}
                </td>
                <td><span className={`badge ${r.estadoClase}`}>{r.estadoLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!cargando && filtradas.length > visibles && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn btn-ghost" onClick={() => setVisibles((v) => v + POR_PAGINA)}>
            Ver {Math.min(POR_PAGINA, filtradas.length - visibles)} más ({filtradas.length - visibles} restantes)
          </button>
        </div>
      )}

      {/* ── Detalle de una tarjeta ── */}
      {tarjeta && (
        <Modal title={`${TITULO_TARJETA[tarjeta]} · ${filasTarjeta.length} OC`} size="lg" onClose={() => setTarjeta(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {hayFiltros ? `Con los filtros de la pantalla (${describirFiltros(f)}). ` : ''}Toca una OC para abrirla en Compras.
          </p>
          {!filasTarjeta.length ? <p className="muted">No hay OC en esta tarjeta.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }}>Ítem</th><th>Código OC</th><th>Proveedor</th>
                    <th style={{ textAlign: 'right' }}>{tarjeta === 'pagado' ? 'Pagado' : 'Monto'}</th>
                    <th>{tarjeta === 'retencion' ? 'Retención' : tarjeta === 'pagado' ? 'Referencia' : 'Estatus'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filasTarjeta.map((r, i) => (
                    <tr key={r.ordenId} style={{ cursor: 'pointer' }} onClick={() => abrirEnCompras(r.ordenId)}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') abrirEnCompras(r.ordenId); }}>
                      <td className="mono" style={{ textAlign: 'right' }}>{i + 1}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary-2)' }}>{r.codigo}</td>
                      <td>{r.proveedor}</td>
                      <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {tarjeta === 'pagado'
                          ? <><div>{usd(r.pagadoUsd)}</div><div>{bs(r.pagadoBs)}</div></>
                          : <><div>{usd(r.totalUsd)}</div><div>{bs(r.totalBs)}</div></>}
                      </td>
                      <td>
                        {tarjeta === 'retencion'
                          ? r.retenciones.map((x) => `${x.tipo}${x.comprobante ? ` N° ${x.comprobante}` : ''}`).join(' · ')
                          : tarjeta === 'pagado'
                            ? textoReferencia(r)
                            : <span className={`badge ${r.estadoClase}`}>{r.estadoLabel}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {factura && <FacturasOcModal orden={factura} onClose={() => setFactura(null)} />}
      {reporte && <ReporteConciliacionModal filas={filtradas} filtros={f} onClose={() => setReporte(false)} />}
    </div>
  );
}

function TarjetaKpi({ icono, titulo, valor, nota, onClick, cargando }: {
  icono: string; titulo: string; valor: string; nota: string; onClick: () => void; cargando: boolean;
}) {
  return (
    <div className="kpi" role="button" tabIndex={0} title="Ver el detalle"
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
      <div className="label">{titulo}</div>
      <div className="value">{cargando ? '…' : valor}</div>
      <div className="delta" style={{ color: 'var(--text-muted)' }}>{cargando ? 'Cargando…' : nota}</div>
      <div className="icon" aria-hidden="true">{icono}</div>
    </div>
  );
}
