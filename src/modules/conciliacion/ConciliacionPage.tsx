/* ============================================================
   Conciliación (12/11/2026) · módulo de SOLO LECTURA.

   Una fila por orden de Compras (OC de compra y CS de servicio) y, desde el
   12/11/2026, por cada compra directa y servicio directo, con: ítem, código, proveedor, monto en $ y
   en Bs (a la tasa del pago), referencia del pago (la que anota Tesorería),
   retención (tipo y número de comprobante), factura (lo que cargó el delivery,
   el almacenista o Compras al finalizar), comprobante del pago (el de Tesorería
   o uno cargado aquí) y estatus. La referencia se anota con el lapicito ✎.

   Arriba, tres tarjetas (Total de OC, Total pagado, OC con retenciones): al
   tocar una se abre su detalle, y al tocar una OC del detalle se va a Compras
   con esa OC abierta. «Reporte» arma el PDF / Excel / WhatsApp con vista previa.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useSession } from '@/modules/auth/authStore';
import { Modal } from '@/shared/ui/Modal';
import type { Orden } from '@/shared/lib/types';
import { FacturasOcModal } from '@/modules/pedidos/FacturasOcModal';
import { diaVE } from '@/modules/tesoreria/tasas.repository';
import { Paginador } from '@/modules/libroFiscal/ListaControles';
import { paginar } from '@/modules/libroFiscal/listas';
import '@/modules/libroFiscal/libroFiscal.css';
import { cargarConciliacion } from './conciliacion.repository';
import {
  FILTROS_VACIOS, filtrarFilas, indicadores, renumerar, textoFuenteTasa, textoReferencia,
  etiquetaTipo, type ArchivoNota, type FilaConciliacion, type FiltrosConciliacion,
} from './conciliacion';
import { bs, describirFiltros, fechaCorta, usd } from './reporteConciliacion';
import { FiltroChecks } from '@/shared/ui/FiltroChecks';
import { ReporteConciliacionModal } from './ReporteConciliacionModal';
import { ComprobantesPagoModal, FacturasDirectaModal, ReferenciaModal } from './DocumentosConciliacion';

type Tarjeta = 'total' | 'pagado' | 'retencion';

const TITULO_TARJETA: Record<Tarjeta, string> = {
  total: 'Total de OC',
  pagado: 'Total pagado',
  retencion: 'OC con retenciones',
};

/** Paginación (12/11/2026): arranca mostrando 10 OC; el selector deja ver 25, 50 o 100. */
const TAMANOS = [10, 25, 50, 100] as const;
/** Estatus de una OC en los que el delivery ya pudo cargar fotos de la factura. */
type TipoFiltro = NonNullable<FiltrosConciliacion['tipos']>[number];
const OPCIONES_TIPO: { value: TipoFiltro; label: string }[] = [
  { value: 'compra', label: 'Órdenes de compra' },
  { value: 'servicio', label: 'Órdenes de servicio' },
  { value: 'compra_directa', label: 'Compras directas' },
  { value: 'servicio_directo', label: 'Servicios directos' },
];
const OPCIONES_PAGO = [{ value: 'pagadas', label: 'Pagadas' }, { value: 'sin_pagar', label: 'Sin pagar' }];
const OPCIONES_RETENCION = [{ value: 'con', label: 'Con retención' }, { value: 'sin', label: 'Sin retención' }];

const CON_FACTURA = new Set(['pagada', 'por_recibir', 'recibida', 'finalizada', 'cuenta_abierta']);

export function ConciliacionPage() {
  const { can, appUser } = usePermissions();
  const { user } = useSession();
  const actor = { email: user?.email ?? 'sistema', nombre: appUser?.nombre ?? null };
  // Anotar la referencia y cargar comprobantes: escritura en Conciliación o en Tesorería.
  const puedeAnotar = can('conciliacion', 'escritura') || can('tesoreria', 'escritura');
  const navigate = useNavigate();
  const [filas, setFilas] = useState<FilaConciliacion[]>([]);
  const [ordenes, setOrdenes] = useState<Map<string, Orden>>(new Map());
  const [avisos, setAvisos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<FiltrosConciliacion>(FILTROS_VACIOS);
  const [pag, setPag] = useState(1);
  const [tam, setTam] = useState<number>(TAMANOS[0]);
  const [tarjeta, setTarjeta] = useState<Tarjeta | null>(null);
  const [factura, setFactura] = useState<Orden | null>(null);
  const [facturaDirecta, setFacturaDirecta] = useState<FilaConciliacion | null>(null);
  const [comprobante, setComprobante] = useState<FilaConciliacion | null>(null);
  const [referencia, setReferencia] = useState<FilaConciliacion | null>(null);
  const [notasDisponibles, setNotasDisponibles] = useState(true);
  const [reporte, setReporte] = useState(false);
  // Cambios hechos en esta pantalla (referencia o comprobantes): se reflejan sin recargar todo.
  const actualizarFila = (r: FilaConciliacion, cambio: Partial<FilaConciliacion>) =>
    setFilas((xs) => xs.map((x) => (x.origen === r.origen && x.ordenId === r.ordenId ? { ...x, ...cambio } : x)));
  const conReferencia = (r: FilaConciliacion, ref: string | null): Partial<FilaConciliacion> => {
    const deTesoreria = r.referencias.filter((x) => x !== r.referenciaManual);
    return { referenciaManual: ref, referencias: ref && !deTesoreria.includes(ref) ? [...deTesoreria, ref] : deTesoreria };
  };

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const d = await cargarConciliacion();
      setFilas(d.filas); setOrdenes(d.ordenes); setAvisos(d.avisos); setNotasDisponibles(d.notasDisponibles);
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
  useEffect(() => { setPag(1); }, [f]);
  const pagina = useMemo(() => paginar(filtradas, pag, tam), [filtradas, pag, tam]);

  const filasTarjeta = useMemo(() => {
    if (tarjeta === 'pagado') return filtradas.filter((r) => r.pagada);
    if (tarjeta === 'retencion') return filtradas.filter((r) => r.llevaRetencion);
    return filtradas;
  }, [tarjeta, filtradas]);

  const abrirEnCompras = (ordenId: string) => navigate(`/app/pedidos?detalle=${encodeURIComponent(ordenId)}`);
  // Las compras y servicios directos no tienen detalle por enlace: se abre Compras.
  const abrirFila = (r: FilaConciliacion) => (r.origen === 'oc' ? abrirEnCompras(r.ordenId) : navigate('/app/pedidos'));
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
            Cada orden de Compras (de compra y de servicio), compra directa y servicio directo con su monto en $ y en Bs a la tasa
            del pago, la referencia (la de Tesorería o la que anotes con ✎), el comprobante del pago, sus retenciones y su factura.
            Toca una tarjeta para ver el detalle y una OC para abrirla en Compras.
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
          <FiltroChecks ariaLabel="Estatus" opciones={estados.map((e) => ({ value: e, label: e }))}
            seleccion={f.estados ?? []} onChange={(v) => set('estados', v.length ? v : undefined)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 140px', margin: 0 }}>
          <label>Tipo</label>
          <FiltroChecks ariaLabel="Tipo" opciones={OPCIONES_TIPO}
            seleccion={f.tipos ?? []} onChange={(v) => set('tipos', v.length ? (v as TipoFiltro[]) : undefined)} />
        </div>
        <div className="form-row" style={{ flex: '1 1 140px', margin: 0 }}>
          <label>Pago</label>
          <FiltroChecks ariaLabel="Pago" todos="Todas" opciones={OPCIONES_PAGO}
            seleccion={f.pago === 'todas' ? [] : [f.pago]}
            onChange={(v) => set('pago', v.length === 1 ? (v[0] as FiltrosConciliacion['pago']) : 'todas')} />
        </div>
        <div className="form-row" style={{ flex: '1 1 140px', margin: 0 }}>
          <label>Retención</label>
          <FiltroChecks ariaLabel="Retención" todos="Todas" opciones={OPCIONES_RETENCION}
            seleccion={f.retencion === 'todas' ? [] : [f.retencion]}
            onChange={(v) => set('retencion', v.length === 1 ? (v[0] as FiltrosConciliacion['retencion']) : 'todas')} />
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
              <th>Código</th>
              <th>Proveedor</th>
              <th style={{ textAlign: 'right' }}>Monto de la OC</th>
              <th>Referencia de pago</th>
              <th>Comprobante</th>
              <th>Retención</th>
              <th>Factura</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>Cargando…</td></tr>}
            {!cargando && !filtradas.length && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                {filas.length ? 'Ninguna OC coincide con los filtros.' : 'Todavía no hay OC.'}
              </td></tr>
            )}
            {!cargando && pagina.filas.map((r) => (
              <tr key={`${r.origen}-${r.ordenId}`}>
                <td className="mono" style={{ textAlign: 'right' }}>{r.item}</td>
                <td>
                  <button type="button" className="btn btn-link" style={{ padding: 0, fontWeight: 700 }}
                    onClick={() => abrirFila(r)} title="Abrir en Compras">{r.codigo}</button>
                  {r.tipo !== 'compra' && <span className="badge info" style={{ marginLeft: '.35rem', fontSize: '.68rem' }}>{etiquetaTipo(r.tipo)}</span>}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', flexWrap: 'wrap' }}>
                    {r.referencias.length
                      ? r.referencias.map((x) => (
                        <span key={x} className="badge mono" title={x === r.referenciaManual ? 'Anotada en Conciliación' : 'Anotada por Tesorería'}>
                          {x}{x === r.referenciaManual ? ' ✎' : ''}
                        </span>
                      ))
                      : <span className="muted">{textoReferencia(r)}</span>}
                    {puedeAnotar && notasDisponibles && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '.05rem .35rem' }}
                        title={r.referenciaManual ? 'Editar la referencia' : 'Agregar la referencia'} aria-label="Editar la referencia"
                        onClick={() => setReferencia(r)}>✎</button>
                    )}
                  </div>
                  {r.fechaPago && <div className="muted" style={{ fontSize: '.72rem' }}>Pagada {fechaCorta(r.fechaPago)}</div>}
                </td>
                <td>
                  {(() => {
                    const n = r.comprobantesTesoreria.length + r.comprobantesConciliacion.length;
                    if (!n && !(puedeAnotar && notasDisponibles)) return <span className="muted">—</span>;
                    return (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setComprobante(r)}
                        title={n ? 'Ver el comprobante del pago' : 'Cargar el comprobante del pago'}>
                        {n ? `👁 Ver${n > 1 ? ` (${n})` : ''}` : '⬆ Cargar'}
                      </button>
                    );
                  })()}
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
                  {r.origen === 'oc'
                    ? ((r.facturas ?? 0) > 0 || (CON_FACTURA.has(r.estado) && ordenes.get(r.ordenId))
                      ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFactura(ordenes.get(r.ordenId) ?? null)}>
                          {(r.facturas ?? 0) > 0 ? `🧾 Ver${(r.facturas ?? 0) > 1 ? ` (${r.facturas})` : ''}` : '👁 Ver'}
                        </button>
                      : <span className="muted">—</span>)
                    : (r.facturas ?? 0) > 0
                      ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFacturaDirecta(r)}>
                          🧾 Ver{(r.facturas ?? 0) > 1 ? ` (${r.facturas})` : ''}
                        </button>
                      : <span className="muted">Sin factura</span>}
                </td>
                <td><span className={`badge ${r.estadoClase}`}>{r.estadoLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!cargando && filtradas.length > 0 && (
        <Paginador pagina={pagina} tam={tam} unidad="OC" tamanos={TAMANOS}
          onPagina={setPag} onTam={(t) => { setTam(t); setPag(1); }} />
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
                    <th style={{ textAlign: 'right' }}>Ítem</th><th>Código</th><th>Proveedor</th>
                    <th style={{ textAlign: 'right' }}>{tarjeta === 'pagado' ? 'Pagado' : 'Monto'}</th>
                    <th>{tarjeta === 'retencion' ? 'Retención' : tarjeta === 'pagado' ? 'Referencia' : 'Estatus'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filasTarjeta.map((r, i) => (
                    <tr key={`${r.origen}-${r.ordenId}`} style={{ cursor: 'pointer' }} onClick={() => abrirFila(r)}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') abrirFila(r); }}>
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
      {facturaDirecta && <FacturasDirectaModal fila={facturaDirecta} onClose={() => setFacturaDirecta(null)} />}
      {comprobante && (
        <ComprobantesPagoModal fila={comprobante} puedeEditar={puedeAnotar && notasDisponibles} actor={actor}
          onCambio={(lista: ArchivoNota[]) => actualizarFila(comprobante, { comprobantesConciliacion: lista })}
          onClose={() => setComprobante(null)} />
      )}
      {referencia && (
        <ReferenciaModal fila={referencia} actor={actor}
          onGuardado={(ref) => actualizarFila(referencia, conReferencia(referencia, ref))}
          onClose={() => setReferencia(null)} />
      )}
      {reporte && <ReporteConciliacionModal todas={filas} filtros={f} onClose={() => setReporte(false)} />}
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
