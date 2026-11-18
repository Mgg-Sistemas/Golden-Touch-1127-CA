/* ============================================================
   Golden Touch · Contabilidad · Pestaña de Reporte Dinámico
   (18/11/2026)

   Estándar interactivo de excelencia:
   - Presets de período y rangos personalizados.
   - Selector dinámico de agrupación (Comprobante, Cuenta, Centro, Auxiliar, Tipo, Detallado).
   - KPIs ejecutivos y verificación de cuadre de partida doble.
   - Filtros avanzados por cuenta, centro, auxiliar y tipo de comprobante.
   - Selector de columnas visibles con modal interactivo.
   - Exportación profesional a PDF corporativo y Excel bimoneda nativo.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { getFuenteReporteDinamico } from './contabilidad.repository';
import {
  CAMPOS_REPORTE_CONTABLE, CLAVES_COLUMNAS_DEFECTO,
  MODOS_AGRUPACION_CONTABLE, calcularRangoPreset, generarReporteContableDinamico,
  type ConfiguracionFiltroContable, type FuenteReporteContable,
  type ModoAgrupacionContable, type PresetPeriodoContable,
} from './logica/reporteContableDinamico';
import {
  exportarReporteContableExcel, exportarReporteContablePdf,
} from './exportarReporteContableDinamico';
import type { ContParametros } from './tipos';

const fmtBs = (v: number | null | undefined) =>
  v == null ? '—' : `Bs ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUsd = (v: number | null | undefined) =>
  v == null ? '—' : `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReporteDinamicoTab({
  parametros,
  empresaClave = 'GT',
}: {
  parametros: ContParametros;
  empresaClave?: string;
}) {
  const [fuente, setFuente] = useState<FuenteReporteContable | null>(null);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [preset, setPreset] = useState<PresetPeriodoContable>('mes_actual');
  const [desde, setDesde] = useState(() => calcularRangoPreset('mes_actual').desde);
  const [hasta, setHasta] = useState(() => calcularRangoPreset('mes_actual').hasta);
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionContable>('comprobante');
  const [busqueda, setBusqueda] = useState('');
  const [tipoCompId, setTipoCompId] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [centroId, setCentroId] = useState('');
  const [auxiliarId, setAuxiliarId] = useState('');
  const [soloContabilizados, setSoloContabilizados] = useState(true);
  const [monedaVista, setMonedaVista] = useState<'todas' | 'VES' | 'USD'>('todas');

  // Columnas visibles y modal
  const [columnasVisibles, setColumnasVisibles] = useState<string[]>(CLAVES_COLUMNAS_DEFECTO);
  const [modalColumnas, setModalColumnas] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [modalExportarPdf, setModalExportarPdf] = useState(false);

  // Cargar datos
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await getFuenteReporteDinamico(empresaClave);
      setFuente(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar la información contable.', 'error');
    } finally {
      setCargando(false);
    }
  }, [empresaClave]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Al cambiar preset de fecha
  const cambiarPreset = (p: PresetPeriodoContable) => {
    setPreset(p);
    if (p !== 'personalizado') {
      const r = calcularRangoPreset(p);
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  };

  // Configuración del reporte
  const config: ConfiguracionFiltroContable = useMemo(() => ({
    empresaClave,
    empresaNombre: parametros.empresa_nombre ?? undefined,
    desde,
    hasta,
    agrupacion,
    columnasVisibles,
    soloContabilizados,
    tipoComprobanteId: tipoCompId || undefined,
    cuentaId: cuentaId || undefined,
    centroCostoId: centroId || undefined,
    auxiliarId: auxiliarId || undefined,
    busqueda,
    monedaVista,
  }), [
    empresaClave, parametros.empresa_nombre, desde, hasta, agrupacion,
    columnasVisibles, soloContabilizados, tipoCompId, cuentaId, centroId,
    auxiliarId, busqueda, monedaVista,
  ]);

  // Ejecución síncrona del motor de datos
  const reporte = useMemo(() => {
    if (!fuente) return null;
    return generarReporteContableDinamico(fuente, config);
  }, [fuente, config]);

  // Opciones de selector de cuentas
  const opcionesCuentas = useMemo(() => {
    if (!fuente) return [];
    return fuente.cuentas
      .filter((c) => c.activa)
      .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));
  }, [fuente]);

  // Acciones de exportación
  const ejecutarExportacionPdf = async (formato: 'resumen' | 'detallado' | 'hibrido') => {
    if (!reporte) return;
    setExportando(true);
    setModalExportarPdf(false);
    try {
      await exportarReporteContablePdf(reporte, formato);
      toast('Vista previa del PDF generada.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al exportar PDF.', 'error');
    } finally {
      setExportando(false);
    }
  };

  const ejecutarExportacionExcel = async () => {
    if (!reporte) return;
    setExportando(true);
    try {
      await exportarReporteContableExcel(reporte, 'hibrido');
      toast('Vista previa del Excel generada.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al exportar Excel.', 'error');
    } finally {
      setExportando(false);
    }
  };

  if (cargando) return <p className="muted">Cargando el reporte contable dinámico…</p>;
  if (!fuente || !reporte) return <EmptyState icon="📊" message="No se pudo inicializar la fuente de datos." />;

  const r = reporte.resumen;
  const cols = CAMPOS_REPORTE_CONTABLE.filter((c) => columnasVisibles.includes(c.clave));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 1. Barra Superior de Control y Agrupación */}
      <div className="card" style={{ padding: '.85rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.8rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>📊 Reporte Contable Dinámico</h2>
            <p className="muted hint" style={{ margin: '.2rem 0 0', fontSize: '.82rem' }}>
              Consolidación analítica bimoneda de comprobantes, asientos y auxiliares para <strong>{parametros.empresa_nombre}</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setModalColumnas(true)}
              title="Personalizar columnas visibles en pantalla y exportación"
            >
              ⚙ Columnas ({columnasVisibles.length})
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setModalExportarPdf(true)}
              disabled={exportando}
              title="Exportar a documento PDF oficial"
            >
              📄 Exportar PDF
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void ejecutarExportacionExcel()}
              disabled={exportando}
              title="Exportar a hoja de cálculo Excel nativa"
            >
              📊 Exportar Excel
            </button>
          </div>
        </div>

        {/* Selector de Dimensión de Agrupación */}
        <div style={{ marginTop: '.85rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <span className="muted hint" style={{ fontSize: '.8rem', fontWeight: 600 }}>Agrupar por:</span>
            {MODOS_AGRUPACION_CONTABLE.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`btn btn-xs ${agrupacion === m.id ? 'btn-primary' : 'btn-ghost'}`}
                style={agrupacion === m.id ? { background: '#ff8a00', color: '#000', fontWeight: 700 } : undefined}
                onClick={() => setAgrupacion(m.id)}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Tarjetas de KPIs Ejecutivos y Partida Doble */}
      <div className="kpi-grid m-tiles">
        <div className="kpi">
          <div className="label">Comprobantes</div>
          <div className="value">{r.totalComprobantes}</div>
          <div className="hint" style={{ fontSize: '.72rem' }}>{r.totalAsientos} asientos totales</div>
        </div>
        <div className="kpi">
          <div className="label">Total Debe (Cargos)</div>
          <div className="value" style={{ fontSize: '1.05rem', color: '#10b981' }}>{fmtBs(r.totalDebeVes)}</div>
          <div className="hint" style={{ fontSize: '.75rem' }}>{fmtUsd(r.totalDebeUsd)}</div>
        </div>
        <div className="kpi">
          <div className="label">Total Haber (Abonos)</div>
          <div className="value" style={{ fontSize: '1.05rem', color: '#38bdf8' }}>{fmtBs(r.totalHaberVes)}</div>
          <div className="hint" style={{ fontSize: '.75rem' }}>{fmtUsd(r.totalHaberUsd)}</div>
        </div>
        <div className="kpi">
          <div className="label">Estado de Cuadre</div>
          <div className="value">
            {r.cuadra ? (
              <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700 }}>
                ✓ Cuadrado
              </span>
            ) : (
              <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700 }}>
                ⚠ Descuadre {fmtBs(r.diferenciaVes)}
              </span>
            )}
          </div>
          <div className="hint" style={{ fontSize: '.72rem' }}>Partida doble verificada</div>
        </div>
      </div>

      {/* 3. Panel de Filtros Multidimensionales */}
      <div className="card" style={{ padding: '.75rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Período</span>
            <select className="select select-sm" value={preset} onChange={(e) => cambiarPreset(e.target.value as PresetPeriodoContable)}>
              <option value="mes_actual">Mes Actual</option>
              <option value="mes_anterior">Mes Anterior</option>
              <option value="este_ano">Año Actual</option>
              <option value="ejercicio">Ejercicio Fiscal</option>
              <option value="todos">Todo el Historial</option>
              <option value="personalizado">Personalizado…</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Desde</span>
            <input className="input input-sm" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPreset('personalizado'); }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Hasta</span>
            <input className="input input-sm" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPreset('personalizado'); }} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Tipo Comprobante</span>
            <select className="select select-sm" value={tipoCompId} onChange={(e) => setTipoCompId(e.target.value)}>
              <option value="">Todos los tipos</option>
              {(fuente.tipos ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Centro de Costo</span>
            <select className="select select-sm" value={centroId} onChange={(e) => setCentroId(e.target.value)}>
              <option value="">Todos los centros</option>
              {(fuente.centros ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Tercero / Auxiliar</span>
            <select className="select select-sm" value={auxiliarId} onChange={(e) => setAuxiliarId(e.target.value)}>
              <option value="">Todos los auxiliares</option>
              {(fuente.auxiliares ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.78rem' }}>
            <span className="muted hint">Moneda</span>
            <select className="select select-sm" value={monedaVista} onChange={(e) => setMonedaVista(e.target.value as 'todas' | 'VES' | 'USD')}>
              <option value="todas">Bimoneda (Todas)</option>
              <option value="VES">Bolívares (VES)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </label>
        </div>

        {/* Segunda línea de filtros: Cuenta y Búsqueda */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.6rem', marginTop: '.6rem', alignItems: 'center' }}>
          <div>
            <span className="muted hint" style={{ fontSize: '.78rem', display: 'block', marginBottom: '.2rem' }}>Filtrar por Cuenta Contable</span>
            <SearchSelect
              options={[{ value: '', label: 'Todas las cuentas contables…' }, ...opcionesCuentas]}
              value={cuentaId}
              onChange={setCuentaId}
              placeholder="Todas las cuentas…"
            />
          </div>

          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center' }}>
            <input
              type="search"
              className="input input-sm"
              placeholder="🔍 Buscar por comprobante, cuenta, concepto…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ flex: 1 }}
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={soloContabilizados} onChange={(e) => setSoloContabilizados(e.target.checked)} />
              Solo Contabilizados
            </label>
          </div>
        </div>
      </div>

      {/* 4. Tabla de Datos Dinámica */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {reporte.filas.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <EmptyState icon="🔎" message="No se encontraron movimientos contables para los filtros seleccionados." />
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 600, overflowY: 'auto' }}>
            <table className="table cont-tabla-informe">
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 1 }}>
                <tr>
                  {cols.map((col) => (
                    <th key={col.clave} className={col.alineacion === 'right' ? 'num' : ''} style={{ textAlign: col.alineacion }}>
                      {col.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reporte.grupos.map((g) => (
                  <tr key={`header-${g.clave}`} className="titulo" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <td colSpan={cols.length}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#ff8a00' }}>▶ {g.etiqueta}</strong>
                          {g.subetiqueta && <span className="muted hint" style={{ marginLeft: '.5rem', fontSize: '.75rem' }}>({g.subetiqueta})</span>}
                        </div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text)' }}>
                          {g.totalAsientos} asiento(s) | Debe: <strong style={{ color: '#10b981' }}>{fmtBs(g.debe_ves)}</strong> | Haber: <strong style={{ color: '#38bdf8' }}>{fmtBs(g.haber_ves)}</strong>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}

                {reporte.filas.map((f) => (
                  <tr key={f.id}>
                    {cols.map((col) => {
                      let valor: React.ReactNode = '—';
                      switch (col.clave) {
                        case 'fecha': valor = f.fecha; break;
                        case 'comprobante': valor = <span className="mono">{f.comprobante}</span>; break;
                        case 'tipo': valor = f.tipo; break;
                        case 'origen': valor = f.origen; break;
                        case 'referencia': valor = f.referencia; break;
                        case 'descripcion': valor = f.descripcion; break;
                        case 'cuenta_codigo': valor = <span className="mono">{f.cuenta_codigo}</span>; break;
                        case 'cuenta_nombre': valor = f.cuenta_nombre; break;
                        case 'centro': valor = f.centro; break;
                        case 'auxiliar': valor = f.auxiliar; break;
                        case 'moneda': valor = f.moneda; break;
                        case 'debe_ves': valor = f.debe_ves > 0 ? fmtNum(f.debe_ves) : '—'; break;
                        case 'haber_ves': valor = f.haber_ves > 0 ? fmtNum(f.haber_ves) : '—'; break;
                        case 'debe_usd': valor = f.debe_usd > 0 ? fmtNum(f.debe_usd) : '—'; break;
                        case 'haber_usd': valor = f.haber_usd > 0 ? fmtNum(f.haber_usd) : '—'; break;
                        case 'saldo_ves': valor = fmtNum(f.saldo_ves); break;
                        case 'saldo_usd': valor = fmtNum(f.saldo_usd); break;
                      }

                      return (
                        <td key={col.clave} className={col.alineacion === 'right' ? 'num' : ''} style={{ textAlign: col.alineacion }}>
                          {valor}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--surface-2)', fontWeight: 700 }}>
                <tr>
                  {cols.map((col, idx) => {
                    if (idx === 0) return <td key={col.clave}>TOTALES:</td>;
                    if (col.clave === 'debe_ves') return <td key={col.clave} className="num" style={{ color: '#10b981' }}>{fmtNum(r.totalDebeVes)}</td>;
                    if (col.clave === 'haber_ves') return <td key={col.clave} className="num" style={{ color: '#38bdf8' }}>{fmtNum(r.totalHaberVes)}</td>;
                    if (col.clave === 'debe_usd') return <td key={col.clave} className="num" style={{ color: '#10b981' }}>{fmtNum(r.totalDebeUsd)}</td>;
                    if (col.clave === 'haber_usd') return <td key={col.clave} className="num" style={{ color: '#38bdf8' }}>{fmtNum(r.totalHaberUsd)}</td>;
                    return <td key={col.clave} />;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Selector de Columnas Visibles */}
      {modalColumnas && (
        <Modal
          title="⚙ Personalizar Columnas del Reporte"
          size="md"
          onClose={() => setModalColumnas(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setColumnasVisibles(CLAVES_COLUMNAS_DEFECTO)}>
                Restablecer por Defecto
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalColumnas(false)}>
                Listo
              </button>
            </>
          }
        >
          <p className="muted hint" style={{ fontSize: '.82rem', margin: '0 0 .75rem' }}>
            Marca o desmarca las columnas que deseas visualizar en la tabla y en las exportaciones a PDF y Excel:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.5rem' }}>
            {CAMPOS_REPORTE_CONTABLE.map((c) => {
              const checked = columnasVisibles.includes(c.clave);
              return (
                <label key={c.clave} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setColumnasVisibles([...columnasVisibles, c.clave]);
                      else setColumnasVisibles(columnasVisibles.filter((k) => k !== c.clave));
                    }}
                  />
                  <span>{c.etiqueta}</span>
                </label>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Modal: Opciones de Formato para Exportar a PDF */}
      {modalExportarPdf && (
        <Modal
          title="📄 Opciones de Exportación PDF"
          size="md"
          onClose={() => setModalExportarPdf(false)}
        >
          <p className="muted hint" style={{ fontSize: '.82rem', margin: '0 0 1rem' }}>
            Elige el formato de presentación para el documento PDF:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '.7rem .9rem' }}
              onClick={() => void ejecutarExportacionPdf('hibrido')}
            >
              <div>
                <strong>📑 Formato Híbrido (Recomendado)</strong>
                <div className="muted hint" style={{ fontSize: '.74rem' }}>Resumen ejecutivo con KPIs y desglose seguido del listado detallado.</div>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '.7rem .9rem' }}
              onClick={() => void ejecutarExportacionPdf('resumen')}
            >
              <div>
                <strong>📊 Solo Resumen Ejecutivo</strong>
                <div className="muted hint" style={{ fontSize: '.74rem' }}>Totales de control, verificación de partida doble y analítica por tipo.</div>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '.7rem .9rem' }}
              onClick={() => void ejecutarExportacionPdf('detallado')}
            >
              <div>
                <strong>📋 Solo Listado Detallado</strong>
                <div className="muted hint" style={{ fontSize: '.74rem' }}>Renglones contables completos organizados por la dimensión elegida.</div>
              </div>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
