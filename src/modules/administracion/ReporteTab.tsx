/* ============================================================
   Golden Touch · Administración · pestaña «Reporte»
   El análisis del HISTÓRICO (egresos efectivos), tan potente como el de
   Combustible: filtros (período · moneda, la empresa viene de la cabecera),
   total del alcance, desglose por categoría y por empresa, y descarga del
   resumen para WhatsApp (TXT) y del detalle (CSV). Reusa agruparTotales y el
   lenguaje visual del tablero aprobado. Los totales salen de la lógica pura.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { agruparTotales, totalGeneral, type Moneda, type MovimientoCalc } from './administracionCalculo';
import { nombreArchivoReporteMov, reporteMovimientosTxt } from './administracionWhatsApp';
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

function descargarTexto(nombre: string, contenido: string, tipo = 'text/plain;charset=utf-8'): boolean {
  try {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
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

  const nombreCat = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);
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
  const calc: MovimientoCalc[] = useMemo(
    () => filtrados.map((m) => ({ empresaClave: nombreEmp.get(m.empresaClave) ?? m.empresaClave, categoria: m.categoriaGastoId ? nombreCat.get(m.categoriaGastoId) ?? 'Sin categoría' : 'Sin categoría', moneda: m.moneda, monto: m.monto })),
    [filtrados, nombreEmp, nombreCat],
  );
  const total = useMemo(() => totalGeneral(calc, TASA_DEMO), [calc]);
  const porCategoria = useMemo(() => agruparTotales(calc, 'categoria', { tasa: TASA_DEMO }), [calc]);
  const porEmpresa = useMemo(() => agruparTotales(calc, 'empresa', { tasa: TASA_DEMO }), [calc]);
  const maxCat = Math.max(1, ...porCategoria.map((g) => g.equivUsd));

  const alcanceLabel = periodo === TODOS ? 'Todo el histórico' : etiquetaPeriodo(periodo);
  const empresaNombre = empresaClave ? nombreEmp.get(empresaClave) ?? empresaClave : null;

  function descargarWhatsApp() {
    const txt = reporteMovimientosTxt(porCategoria, total, { empresaNombre, periodoLabel: alcanceLabel });
    const ok = descargarTexto(nombreArchivoReporteMov(alcanceLabel), txt);
    toast(ok ? 'Resumen para WhatsApp descargado — pégalo en el chat.' : 'No se pudo generar el archivo.', ok ? 'success' : 'error');
  }
  function descargarCsv() {
    const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const cab = ['fecha', 'empresa', 'concepto', 'categoria', 'monto', 'moneda', 'periodo', 'estado', 'origen'];
    const filas = filtrados.map((m) => [
      m.fecha, nombreEmp.get(m.empresaClave) ?? m.empresaClave, m.concepto,
      m.categoriaGastoId ? nombreCat.get(m.categoriaGastoId) ?? '' : '', monto2(m.monto), m.moneda, m.periodo, m.estadoPago, m.origen,
    ].map((c) => esc(String(c))).join(','));
    const csv = [cab.join(','), ...filas].join('\n');
    const ok = descargarTexto(`reporte-gastos-${alcanceLabel.toLowerCase().replace(/\s+/g, '-')}.csv`, csv, 'text/csv;charset=utf-8');
    toast(ok ? 'CSV del detalle descargado.' : 'No se pudo generar el CSV.', ok ? 'success' : 'error');
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={descargarCsv} disabled={!filtrados.length}>⬇ CSV</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={descargarWhatsApp} disabled={!filtrados.length}
            title="Descarga un resumen con formato de WhatsApp, listo para pegar en el chat">📱 WhatsApp</button>
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
                    {(empresaClave ? agruparTotales(calc, 'moneda', { tasa: TASA_DEMO }) : porEmpresa).map((g) => (
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
    </div>
  );
}
