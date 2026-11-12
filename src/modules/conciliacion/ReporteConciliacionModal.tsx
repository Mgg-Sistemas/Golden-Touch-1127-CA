/* ============================================================
   Conciliación · reporte dinámico (12/11/2026).
   Toma las filas ya filtradas de la pantalla; aquí se eligen columnas y
   agrupación, se ve la vista previa en vivo y sale en PDF, Excel o WhatsApp
   (el texto también se ve antes de enviarlo). Las columnas y la agrupación
   se recuerdan en este navegador.
   ============================================================ */

import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { filtrarFilas, indicadores, renumerar, type FilaConciliacion, type FiltrosConciliacion } from './conciliacion';
import { diaVE, hoyVE } from '@/modules/tesoreria/tasas.repository';
import {
  AGRUPACIONES, COLUMNAS_POR_DEFECTO, COLUMNAS_REPORTE, agrupar, bs, celda, describirFiltros, textoWhatsappConciliacion, usd,
  type Agrupacion, type ClaveColumna, type MetaReporte,
} from './reporteConciliacion';
import { descargarConciliacionExcel, descargarConciliacionPdf } from './exportarConciliacion';

const PREFS = 'gt.conciliacion.reporte';
const MAX_PREVIA = 60;

function leerPrefs(): { columnas: ClaveColumna[]; modo: Agrupacion } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null') as { columnas?: ClaveColumna[]; modo?: Agrupacion } | null;
    const validas = (p?.columnas ?? []).filter((c) => COLUMNAS_REPORTE.some((x) => x.clave === c));
    return {
      columnas: validas.length ? validas : COLUMNAS_POR_DEFECTO,
      modo: AGRUPACIONES.some((a) => a.valor === p?.modo) ? p!.modo! : 'ninguna',
    };
  } catch {
    return { columnas: COLUMNAS_POR_DEFECTO, modo: 'ninguna' };
  }
}

function guardarPrefs(columnas: ClaveColumna[], modo: Agrupacion) {
  try { localStorage.setItem(PREFS, JSON.stringify({ columnas, modo })); } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Primer y último día de un mes (YYYY-MM) en YYYY-MM-DD. */
function rangoMes(anio: number, mes: number): { desde: string; hasta: string } {
  const d = new Date(Date.UTC(anio, mes, 1));
  const h = new Date(Date.UTC(anio, mes + 1, 0));
  return { desde: d.toISOString().slice(0, 10), hasta: h.toISOString().slice(0, 10) };
}

/**
 * `todas`: todas las OC; el reporte aplica los filtros de la pantalla y, encima, su
 * PROPIO rango de fechas (12/11/2026), que arranca en el de la pantalla y se puede
 * cambiar aquí sin tocarla (por fecha de la OC o por fecha de pago).
 */
export function ReporteConciliacionModal({ todas, filtros, onClose }: {
  todas: FilaConciliacion[]; filtros: FiltrosConciliacion; onClose: () => void;
}) {
  const [desde, setDesde] = useState(filtros.desde);
  const [hasta, setHasta] = useState(filtros.hasta);
  const [fechaDe, setFechaDe] = useState<'oc' | 'pago'>(filtros.fechaDe ?? 'oc');
  const filtrosReporte = useMemo<FiltrosConciliacion>(() => ({ ...filtros, desde, hasta, fechaDe }), [filtros, desde, hasta, fechaDe]);
  const filas = useMemo(() => renumerar(filtrarFilas(todas, filtrosReporte, diaVE)), [todas, filtrosReporte]);
  const rangoInvalido = !!desde && !!hasta && desde > hasta;
  const atajo = (cual: 'mes' | 'mes_pasado' | 'anio' | 'todo') => {
    const [a, m] = hoyVE().split('-').map(Number);
    if (cual === 'todo') { setDesde(''); setHasta(''); return; }
    if (cual === 'anio') { setDesde(`${a}-01-01`); setHasta(`${a}-12-31`); return; }
    const r = cual === 'mes' ? rangoMes(a, m - 1) : rangoMes(a, m - 2);
    setDesde(r.desde); setHasta(r.hasta);
  };

  const inicial = useMemo(leerPrefs, []);
  const [columnas, setColumnas] = useState<ClaveColumna[]>(inicial.columnas);
  const [modo, setModo] = useState<Agrupacion>(inicial.modo);
  const [ocupado, setOcupado] = useState<'pdf' | 'excel' | null>(null);
  const [whatsapp, setWhatsapp] = useState(false);

  const meta: MetaReporte = useMemo(() => ({
    titulo: 'Conciliación de órdenes de compra',
    filtrosTexto: describirFiltros(filtrosReporte),
    generado: new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }),
  }), [filtrosReporte]);

  const cols = COLUMNAS_REPORTE.filter((c) => columnas.includes(c.clave));
  const grupos = useMemo(() => agrupar(filas, modo), [filas, modo]);
  const k = useMemo(() => indicadores(filas), [filas]);
  const textoWsp = useMemo(() => textoWhatsappConciliacion(filas, meta), [filas, meta]);

  const alternar = (c: ClaveColumna) => {
    const sig = columnas.includes(c) ? columnas.filter((x) => x !== c) : COLUMNAS_REPORTE.map((x) => x.clave).filter((x) => x === c || columnas.includes(x));
    setColumnas(sig); guardarPrefs(sig, modo);
  };
  const cambiarModo = (m: Agrupacion) => { setModo(m); guardarPrefs(columnas, m); };

  async function exportar(tipo: 'pdf' | 'excel') {
    setOcupado(tipo);
    try {
      if (tipo === 'pdf') await descargarConciliacionPdf(filas, columnas, modo, meta);
      else await descargarConciliacionExcel(filas, columnas, modo, meta);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el reporte.', 'error');
    } finally {
      setOcupado(null);
    }
  }

  let mostradas = 0;

  return (
    <Modal title="📊 Reporte de conciliación" size="xl" onClose={onClose} footer={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button type="button" className="btn btn-wsp" onClick={() => setWhatsapp(true)} disabled={!filas.length}>💬 WhatsApp</button>
        <button type="button" className="btn btn-ghost" onClick={() => void exportar('excel')} disabled={!filas.length || !columnas.length || !!ocupado}>
          {ocupado === 'excel' ? 'Generando…' : '📗 Excel'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void exportar('pdf')} disabled={!filas.length || !columnas.length || !!ocupado}>
          {ocupado === 'pdf' ? 'Generando…' : '🖨 PDF'}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        Sale con los filtros de la pantalla y el rango de fechas de abajo{meta.filtrosTexto ? ` (${meta.filtrosTexto})` : ' (todas las OC)'}: <strong>{filas.length} OC</strong>.
      </p>

      {/* ── Rango de fechas del reporte (12/11/2026) ── */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end', marginBottom: '.75rem' }}>
        <div className="form-row" style={{ margin: 0, flex: '1 1 150px' }}>
          <label>Fecha de</label>
          <select className="select" value={fechaDe} onChange={(e) => setFechaDe(e.target.value as 'oc' | 'pago')}>
            <option value="oc">La OC</option>
            <option value="pago">El pago</option>
          </select>
        </div>
        <div className="form-row" style={{ margin: 0, flex: '1 1 140px' }}>
          <label>Desde</label>
          <input className="input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row" style={{ margin: 0, flex: '1 1 140px' }}>
          <label>Hasta</label>
          <input className="input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', paddingBottom: '.2rem' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => atajo('mes')}>Este mes</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => atajo('mes_pasado')}>Mes pasado</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => atajo('anio')}>Este año</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => atajo('todo')}>Todas las fechas</button>
        </div>
        {rangoInvalido && <small style={{ color: 'var(--danger)', flexBasis: '100%' }}>La fecha «Desde» es posterior a «Hasta»: no hay OC en ese rango.</small>}
        {fechaDe === 'pago' && (desde || hasta) && <small className="muted" style={{ flexBasis: '100%' }}>Por fecha de pago, las OC sin pagar no entran.</small>}
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>Columnas</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem .9rem' }}>
            {COLUMNAS_REPORTE.map((c) => (
              <label key={c.clave} style={{ display: 'flex', gap: '.3rem', alignItems: 'center', fontSize: '.85rem', fontWeight: 400 }}>
                <input type="checkbox" checked={columnas.includes(c.clave)} onChange={() => alternar(c.clave)} />
                {c.titulo}
              </label>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>Agrupar</label>
          <select className="select" value={modo} onChange={(e) => cambiarModo(e.target.value as Agrupacion)} style={{ maxWidth: 260 }}>
            {AGRUPACIONES.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
          </select>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginTop: '.5rem' }}>
        <div className="kpi"><div className="label">Total de OC</div><div className="value">{k.totalOc.cantidad}</div><div className="delta" style={{ color: 'var(--text-muted)' }}>{usd(k.totalOc.usd)} · {bs(k.totalOc.bs)}</div></div>
        <div className="kpi"><div className="label">Total pagado</div><div className="value">{usd(k.pagado.usd)}</div><div className="delta" style={{ color: 'var(--text-muted)' }}>{bs(k.pagado.bs)} · {k.pagado.cantidad} OC</div></div>
        <div className="kpi"><div className="label">OC con retenciones</div><div className="value">{k.conRetencion.cantidad}</div><div className="delta" style={{ color: 'var(--text-muted)' }}>{usd(k.conRetencion.usd)} · {bs(k.conRetencion.bs)}</div></div>
      </div>

      <div className="card-title" style={{ margin: '.5rem 0' }}>Vista previa</div>
      {!cols.length ? <p className="muted">Elige al menos una columna.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{cols.map((c) => <th key={c.clave} style={{ textAlign: 'center' }}>{c.titulo}</th>)}</tr></thead>
            <tbody>
              {grupos.map((g) => {
                if (mostradas >= MAX_PREVIA) return null;
                const filasGrupo = g.filas.slice(0, MAX_PREVIA - mostradas);
                mostradas += filasGrupo.length;
                return [
                  modo !== 'ninguna' && (
                    <tr key={`g-${g.titulo}`}>
                      <td colSpan={cols.length} style={{ background: 'var(--bg-1)', fontWeight: 700 }}>
                        {g.titulo} · {g.filas.length} OC · {usd(g.totalUsd)} · {bs(g.totalBs)}
                      </td>
                    </tr>
                  ),
                  ...filasGrupo.map((r) => (
                    <tr key={r.ordenId}>
                      {cols.map((c) => <td key={c.clave} className={c.numerica ? 'mono' : undefined} style={c.numerica ? { textAlign: 'right', whiteSpace: 'nowrap' } : undefined}>{celda(r, c.clave)}</td>)}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
          {filas.length > MAX_PREVIA && (
            <p className="muted" style={{ fontSize: '.8rem' }}>Vista previa de las primeras {MAX_PREVIA} OC; el PDF y el Excel llevan las {filas.length}.</p>
          )}
        </div>
      )}

      {whatsapp && (
        <Modal title="💬 Conciliación por WhatsApp" onClose={() => setWhatsapp(false)}>
          <CompartirWhatsapp texto={textoWsp} />
        </Modal>
      )}
    </Modal>
  );
}
