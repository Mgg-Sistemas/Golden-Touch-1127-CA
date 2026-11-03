/* ============================================================
   Golden Touch · Administración · pestaña «Reporte» (dinámico)
   Reporte configurable, al estándar del sistema: rango de fechas, filtros
   (moneda, categoría; la empresa viene de la cabecera) y DIMENSIÓN de
   agrupación elegible (empresa/categoría/proveedor/período/moneda/estado).
   Las salidas PDF, Excel y WhatsApp salen del mismo armado puro
   `armarReporteAdmin` → todas dicen lo mismo. Lenguaje visual del tablero.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { type Moneda } from './administracionCalculo';
import { armarReporteAdmin, ETIQUETA_DIMENSION, type DimensionReporte } from './administracionReporte';
import { descargarReporteAdminPdf } from './administracionReportePdf';
import { descargarReporteAdminExcel } from './administracionReporteExcel';
import { reporteMovimientosTxt } from './administracionWhatsApp';
import { WhatsAppReporteModal } from './WhatsAppReporteModal';
import type { AdminRepo, Empresa, Movimiento, OpcionRef } from './admin.repository';

const num0 = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 0 });
const monto2 = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TASA_DEMO = 40;
const DIMENSIONES: DimensionReporte[] = ['categoria', 'empresa', 'proveedor', 'periodo', 'moneda', 'estado'];

const fCorta = (iso: string) => { const [a, m, d] = iso.split('-'); return d && m && a ? `${d}/${m}/${a}` : iso; };

export function ReporteTab({ repo, empresaClave, empresas }: {
  repo: AdminRepo;
  empresaClave: string | null;
  empresas: Empresa[];
}) {
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<OpcionRef[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [moneda, setMoneda] = useState<'' | Moneda>('');
  const [categoriaId, setCategoriaId] = useState('');
  const [agruparPor, setAgruparPor] = useState<DimensionReporte>('categoria');
  const [wsp, setWsp] = useState<string | null>(null);

  const nombreEmp = useMemo(() => new Map(empresas.map((e) => [e.clave, e.nombre])), [empresas]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ms, cats] = await Promise.all([repo.listMovimientos(empresaClave ?? undefined), repo.listCategorias().catch(() => [] as OpcionRef[])]);
      setMovs(ms);
      setCategorias(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los movimientos.');
    } finally {
      setCargando(false);
    }
  }, [repo, empresaClave]);
  useEffect(() => { void cargar(); }, [cargar]);

  const filtrados = useMemo(
    () => movs.filter((m) =>
      m.estadoPago !== 'anulado'
      && (!desde || m.fecha >= desde)
      && (!hasta || m.fecha <= hasta)
      && (!moneda || m.moneda === moneda)
      && (!categoriaId || m.categoriaGastoId === categoriaId)),
    [movs, desde, hasta, moneda, categoriaId],
  );
  const alcanceLabel = (!desde && !hasta) ? 'Todo el histórico' : `${desde ? fCorta(desde) : '…'} – ${hasta ? fCorta(hasta) : '…'}`;
  const empresaNombre = empresaClave ? nombreEmp.get(empresaClave) ?? empresaClave : null;

  // UN solo armado puro, agrupado por la dimensión elegida → las tres salidas y la vista dicen lo mismo.
  const data = useMemo(
    () => armarReporteAdmin(filtrados, empresas, categorias, { empresaNombre, alcanceLabel, tasa: TASA_DEMO, agruparPor }),
    [filtrados, empresas, categorias, empresaNombre, alcanceLabel, agruparPor],
  );
  const { total, grupos } = data;
  const dim = ETIQUETA_DIMENSION[agruparPor];
  const maxVal = Math.max(1, ...grupos.map((g) => g.equivUsd));

  function abrirWhatsApp() {
    setWsp(reporteMovimientosTxt(grupos, total, { empresaNombre, periodoLabel: alcanceLabel, dimLabel: dim.toLowerCase() }));
  }
  async function descargarPdf() {
    try { await descargarReporteAdminPdf(data); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF.', 'error'); }
  }
  async function descargarExcel() {
    try { await descargarReporteAdminExcel(data); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el Excel.', 'error'); }
  }

  return (
    <div className="adm-tablero">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '.2rem' }}>
            <span className="muted hint">Desde</span>
            <input type="date" className="input" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '.2rem' }}>
            <span className="muted hint">Hasta</span>
            <input type="date" className="input" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '.2rem' }}>
            <span className="muted hint">Moneda</span>
            <select className="input" value={moneda} onChange={(e) => setMoneda(e.target.value as '' | Moneda)}>
              <option value="">Ambas</option><option value="USD">USD</option><option value="Bs">Bs</option>
            </select>
          </label>
          <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '.2rem' }}>
            <span className="muted hint">Categoría</span>
            <select className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={{ maxWidth: 170 }}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label style={{ display: 'inline-flex', flexDirection: 'column', gap: '.2rem' }}>
            <span className="muted hint">Agrupar por</span>
            <select className="input" value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as DimensionReporte)}>
              {DIMENSIONES.map((d) => <option key={d} value={d}>{ETIQUETA_DIMENSION[d]}</option>)}
            </select>
          </label>
          {(desde || hasta || moneda || categoriaId) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDesde(''); setHasta(''); setMoneda(''); setCategoriaId(''); }}>✕ Limpiar</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void descargarPdf()} disabled={!filtrados.length}>📄 PDF</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void descargarExcel()} disabled={!filtrados.length}>📊 Excel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={abrirWhatsApp} disabled={!filtrados.length}
            title="Enviar el resumen por WhatsApp (o copiarlo)">💬 WhatsApp</button>
        </div>
      </div>

      {error && <div className="adm-aviso">No se pudo leer: {/sesi|jwt|auth|401|permission|relation|does not exist/i.test(error) ? 'inicia sesión o la base aún no tiene las tablas del módulo.' : error}</div>}

      {cargando ? (
        <div className="card"><p className="muted">Calculando el reporte…</p></div>
      ) : !filtrados.length && !error ? (
        <div className="card"><EmptyState icon="📊" message="No hay movimientos en este alcance. Ajustá los filtros o cargá el histórico en «Movimientos»." /></div>
      ) : (
        <>
          <div className="adm-kpis">
            <div className="adm-kpi oro">
              <span className="adm-kpi-lbl">Total del período</span>
              <span className="adm-kpi-num">$ {num0(total.equivUsd)}</span>
              <span className="adm-kpi-sub">equivalente en USD · tasa {TASA_DEMO}</span>
            </div>
            <div className="adm-kpi">
              <span className="adm-kpi-lbl">En bolívares</span>
              <span className="adm-kpi-num">{num0(total.bs)} <span className="adm-kpi-de">Bs</span></span>
            </div>
            <div className="adm-kpi">
              <span className="adm-kpi-lbl">En dólares</span>
              <span className="adm-kpi-num">$ {num0(total.usd)}</span>
            </div>
            <div className="adm-kpi">
              <span className="adm-kpi-lbl">Movimientos</span>
              <span className="adm-kpi-num">{total.n}</span>
              <span className="adm-kpi-sub">{alcanceLabel}{empresaNombre ? ` · ${empresaNombre}` : ''}</span>
            </div>
          </div>

          <div className="adm-graficos">
            <div className="card adm-grafico">
              <div className="adm-grafico-tit">Por {dim.toLowerCase()}</div>
              <ul className="adm-barras">
                {grupos.map((g) => (
                  <li key={g.clave}>
                    <span className="adm-barra-nom" title={g.clave}>{g.clave}</span>
                    <span className="adm-barra-pista"><span className="adm-barra-fill" style={{ width: `${Math.round((g.equivUsd / maxVal) * 100)}%` }} /></span>
                    <span className="adm-barra-val">$ {num0(g.equivUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card adm-grafico">
              <div className="adm-grafico-tit">Detalle · {dim}</div>
              <div className="adm-tabla">
                <table>
                  <thead>
                    <tr><th>{dim}</th><th style={{ textAlign: 'right' }}>Bs</th><th style={{ textAlign: 'right' }}>USD</th><th style={{ textAlign: 'right' }}>Equiv. $</th><th style={{ textAlign: 'right' }}>Mov.</th></tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.clave}>
                        <td>{g.clave}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto2(g.bs)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{monto2(g.usd)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{num0(g.equivUsd)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{g.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {wsp != null && (
        <WhatsAppReporteModal titulo={`Reporte · ${alcanceLabel}`} texto={wsp} onClose={() => setWsp(null)} />
      )}
    </div>
  );
}
