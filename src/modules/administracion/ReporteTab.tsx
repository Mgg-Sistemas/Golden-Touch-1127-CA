/* ============================================================
   Golden Touch · Administración · pestaña «Reporte»
   El análisis del HISTÓRICO (egresos efectivos), al estándar de reportes del
   sistema: filtros (período · moneda; la empresa viene de la cabecera), total
   del alcance, desglose por categoría y por empresa, y las salidas PDF, Excel
   y WhatsApp (los tres del mismo armado puro `armarReporteAdmin`). Mantiene el
   lenguaje visual del tablero aprobado.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { type Moneda } from './administracionCalculo';
import { armarReporteAdmin } from './administracionReporte';
import { descargarReporteAdminPdf } from './administracionReportePdf';
import { descargarReporteAdminExcel } from './administracionReporteExcel';
import { reporteMovimientosTxt } from './administracionWhatsApp';
import { WhatsAppReporteModal } from './WhatsAppReporteModal';
import type { AdminRepo, Empresa, Movimiento, OpcionRef } from './admin.repository';

const num0 = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 0 });
const monto2 = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TASA_DEMO = 40;
const TODOS = '__todos__';

/** «2026-10» → «Octubre 2026»; otros tokens (B6, T4…) se muestran tal cual. */
function etiquetaPeriodo(token: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(token);
  if (!m) return token;
  const nombre = new Intl.DateTimeFormat('es-VE', { month: 'long' }).format(new Date(Number(m[1]), Number(m[2]) - 1, 1));
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${m[1]}`;
}

export function ReporteTab({ repo, empresaClave, empresas }: {
  repo: AdminRepo;
  empresaClave: string | null;
  empresas: Empresa[];
}) {
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [categorias, setCategorias] = useState<OpcionRef[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string>(TODOS);
  const [moneda, setMoneda] = useState<'' | Moneda>('');
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

  // Si la empresa cambia y el período elegido ya no aparece, vuelve a «Todos».
  const periodos = useMemo(() => [...new Set(movs.map((m) => m.periodo))].sort().reverse(), [movs]);
  useEffect(() => { if (periodo !== TODOS && !periodos.includes(periodo)) setPeriodo(TODOS); }, [periodos, periodo]);

  const filtrados = useMemo(
    () => movs.filter((m) => m.estadoPago !== 'anulado' && (periodo === TODOS || m.periodo === periodo) && (!moneda || m.moneda === moneda)),
    [movs, periodo, moneda],
  );
  const alcanceLabel = periodo === TODOS ? 'Todo el histórico' : etiquetaPeriodo(periodo);
  const empresaNombre = empresaClave ? nombreEmp.get(empresaClave) ?? empresaClave : null;

  // UN solo armado puro → las tres salidas (WhatsApp, PDF, Excel) y la vista dicen lo mismo.
  const data = useMemo(
    () => armarReporteAdmin(filtrados, empresas, categorias, { empresaNombre, alcanceLabel, tasa: TASA_DEMO }),
    [filtrados, empresas, categorias, empresaNombre, alcanceLabel],
  );
  const { total, porCategoria, porEmpresa, porMoneda } = data;
  const maxCat = Math.max(1, ...porCategoria.map((g) => g.equivUsd));

  function abrirWhatsApp() {
    setWsp(reporteMovimientosTxt(porCategoria, total, { empresaNombre, periodoLabel: alcanceLabel }));
  }
  async function descargarPdf() {
    try { await descargarReporteAdminPdf(data); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF.', 'error'); }
  }
  async function descargarExcel() {
    try { await descargarReporteAdminExcel(data); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el Excel.', 'error'); }
  }

  return (
    <div className="adm-tablero">
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <span className="muted hint">Período</span>
            <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ minWidth: 150 }}>
              <option value={TODOS}>Todo el histórico</option>
              {periodos.map((p) => <option key={p} value={p}>{etiquetaPeriodo(p)}</option>)}
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <span className="muted hint">Moneda</span>
            <select className="input" value={moneda} onChange={(e) => setMoneda(e.target.value as '' | Moneda)}>
              <option value="">Ambas</option>
              <option value="USD">USD</option>
              <option value="Bs">Bs</option>
            </select>
          </label>
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
        <div className="card"><EmptyState icon="📊" message="No hay movimientos en este alcance. Cargá el histórico en «Movimientos»." /></div>
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
              <div className="adm-grafico-tit">Por categoría</div>
              <ul className="adm-barras">
                {porCategoria.map((g) => (
                  <li key={g.clave}>
                    <span className="adm-barra-nom" title={g.clave}>{g.clave}</span>
                    <span className="adm-barra-pista"><span className="adm-barra-fill" style={{ width: `${Math.round((g.equivUsd / maxCat) * 100)}%` }} /></span>
                    <span className="adm-barra-val">$ {num0(g.equivUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card adm-grafico">
              <div className="adm-grafico-tit">{empresaClave ? 'Detalle por moneda' : 'Por empresa'}</div>
              <div className="adm-tabla">
                <table>
                  <thead>
                    <tr><th>{empresaClave ? 'Moneda' : 'Empresa'}</th><th style={{ textAlign: 'right' }}>Bs</th><th style={{ textAlign: 'right' }}>USD</th><th style={{ textAlign: 'right' }}>Equiv. $</th><th style={{ textAlign: 'right' }}>Mov.</th></tr>
                  </thead>
                  <tbody>
                    {(empresaClave ? porMoneda : porEmpresa).map((g) => (
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
