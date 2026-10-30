/* ============================================================
   Golden Touch · Combustible · Diálogo «Reporte Moldeable»
   (29/10/2026)

   Modal interactivo con controles de casillas (checks) para:
   - Seleccionar columnas/datos a mostrar.
   - Elegir la dimensión principal (por Equipo, Empresa, Ubicación, Tipo,
     Tanque, Mes o Detallado).
   - Valuación USD: Tasa histórica vs Tasa actual del tanque.
   - Filtros multi-selección con checks (Empresas, Tipos de máquina,
     Tanques, Ubicaciones).
   - Rango de fechas con atajos rápidos.
   - Exportación a Excel (ExcelJS con estilos), PDF (look Maquinaria GT) y CSV.
   - Persistencia de preferencias en localStorage.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { mensajeError } from '@/shared/lib/errores';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import { listEquipos, type MaquinariaEquipo } from '@/modules/maquinaria/maquinariaEquipos.repository';
import { consultarMovimientosReporteCombustible } from './tanques.repository';
import {
  CAMPOS_POR_DEFECTO_POR_MODO,
  CAMPOS_REPORTE_COMBUSTIBLE,
  enriquecerMovimientos,
  filtrarMovimientos,
  procesarFilasReporte,
  type BaseTasaUsd,
  type ModoAgrupacionCombustible,
} from './reporteMoldeable';
import {
  descargarCombustibleCsv,
  descargarCombustibleExcel,
  descargarCombustiblePdf,
  type MetadatosExportacion,
} from './exportarCombustible';

const CLAVE_LOCAL_CAMPOS = 'combustible.reporte.campos.v1';
const CLAVE_LOCAL_AGRUPACION = 'combustible.reporte.agrupacion.v1';
const CLAVE_LOCAL_TASA = 'combustible.reporte.tasa.v1';
const CLAVE_LOCAL_RESUMEN = 'combustible.reporte.resumen.v1';

const MODOS_AGRUPACION: { id: ModoAgrupacionCombustible; icon: string; label: string }[] = [
  { id: 'equipo', icon: '🚜', label: 'Por Equipo' },
  { id: 'empresa', icon: '🏢', label: 'Por Empresa' },
  { id: 'tipo', icon: '🏷️', label: 'Por Tipo' },
  { id: 'ubicacion', icon: '📍', label: 'Por Ubicación' },
  { id: 'tanque', icon: '⛽', label: 'Por Tanque' },
  { id: 'mes', icon: '📅', label: 'Por Mes' },
  { id: 'detallado', icon: '📋', label: 'Detallado' },
];

function hoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function primerDiaMesActual(): string {
  const h = hoyVE();
  return `${h.slice(0, 7)}-01`;
}

function primerDiaMesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7) + '-01';
}

function ultimoDiaMesAnterior(): string {
  const d = new Date();
  d.setDate(0); // Último día del mes anterior
  return d.toISOString().slice(0, 10);
}

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function primerDiaAnioActual(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function preferenciasGuardadas(): {
  campos: string[];
  agrupacion: ModoAgrupacionCombustible;
  baseTasa: BaseTasaUsd;
  incluirResumen: boolean;
} {
  let agrupacion: ModoAgrupacionCombustible = 'equipo';
  try {
    const a = localStorage.getItem(CLAVE_LOCAL_AGRUPACION) as ModoAgrupacionCombustible;
    if (a && MODOS_AGRUPACION.some((m) => m.id === a)) agrupacion = a;
  } catch { /* usa default */ }

  let campos = CAMPOS_POR_DEFECTO_POR_MODO[agrupacion];
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_LOCAL_CAMPOS) ?? 'null');
    if (Array.isArray(c) && c.length) campos = c;
  } catch { /* usa default */ }

  let baseTasa: BaseTasaUsd = 'historica';
  try {
    const t = localStorage.getItem(CLAVE_LOCAL_TASA) as BaseTasaUsd;
    if (t === 'historica' || t === 'actual') baseTasa = t;
  } catch { /* usa default */ }

  let incluirResumen = true;
  try {
    const r = localStorage.getItem(CLAVE_LOCAL_RESUMEN);
    if (r != null) incluirResumen = r === 'true';
  } catch { /* usa default */ }

  return { campos, agrupacion, baseTasa, incluirResumen };
}

function guardarPreferencias(
  campos: string[],
  agrupacion: ModoAgrupacionCombustible,
  baseTasa: BaseTasaUsd,
  incluirResumen: boolean
) {
  try {
    localStorage.setItem(CLAVE_LOCAL_CAMPOS, JSON.stringify(campos));
    localStorage.setItem(CLAVE_LOCAL_AGRUPACION, agrupacion);
    localStorage.setItem(CLAVE_LOCAL_TASA, baseTasa);
    localStorage.setItem(CLAVE_LOCAL_RESUMEN, String(incluirResumen));
  } catch { /* no crítico */ }
}

interface Props {
  tanques: TanqueCombustible[];
  tanqueInicialId?: string;
  onClose: () => void;
}

export function ExportarCombustibleModal({ tanques, tanqueInicialId, onClose }: Props) {
  const prefs = useMemo(() => preferenciasGuardadas(), []);

  const [desde, setDesde] = useState<string>(primerDiaMesActual);
  const [hasta, setHasta] = useState<string>(hoyVE);
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionCombustible>(prefs.agrupacion);
  const [baseTasa, setBaseTasa] = useState<BaseTasaUsd>(prefs.baseTasa);
  const [marcados, setMarcados] = useState<string[]>(prefs.campos);
  const [incluirResumen, setIncluirResumen] = useState<boolean>(prefs.incluirResumen);
  const [orientacion, setOrientacion] = useState<'auto' | 'portrait' | 'landscape'>('auto');

  // Filtros de inclusión (vacío = todos)
  const [empresasSel, setEmpresasSel] = useState<string[]>([]);
  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [tanquesSel, setTanquesSel] = useState<string[]>(() => (tanqueInicialId ? [tanques.find((t) => t.id === tanqueInicialId)?.nombre || tanqueInicialId] : []));
  const [ubicacionesSel, setUbicacionesSel] = useState<string[]>([]);

  // Pestaña o acordeón de filtro abierto
  const [seccionFiltro, setSeccionFiltro] = useState<'ninguno' | 'empresas' | 'tipos' | 'tanques' | 'ubicaciones'>('ninguno');

  // Estados de carga y acción
  const [cargando, setCargando] = useState<boolean>(true);
  const [ocupado, setOcupado] = useState<'pdf' | 'xlsx' | 'csv' | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoTanque[]>([]);
  const [fichas, setFichas] = useState<MaquinariaEquipo[]>([]);

  // 1. Cargar movimientos y fichas al cambiar rango de fechas
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      try {
        const [movs, fchs] = await Promise.all([
          consultarMovimientosReporteCombustible({ desde, hasta, tipos: ['uso'] }),
          listEquipos().catch(() => [] as MaquinariaEquipo[]),
        ]);
        if (!cancelado) {
          setMovimientos(movs);
          setFichas(fchs);
        }
      } catch (e) {
        if (!cancelado) {
          toast(mensajeError(e, 'No se pudieron consultar los movimientos de combustible'), 'error');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    void cargar();
    return () => { cancelado = true; };
  }, [desde, hasta]);

  // Al cambiar de modo de agrupación, adaptar las columnas si las actuales son las por defecto
  const cambiarModoAgrupacion = (nuevoModo: ModoAgrupacionCombustible) => {
    setAgrupacion(nuevoModo);
    setMarcados(CAMPOS_POR_DEFECTO_POR_MODO[nuevoModo]);
  };

  // 2. Enriquecer los movimientos con fichas de maquinaria y tanques
  const enriquecidos = useMemo(() => {
    return enriquecerMovimientos(movimientos, fichas, tanques, baseTasa);
  }, [movimientos, fichas, tanques, baseTasa]);

  // 3. Catálogos disponibles detectados en los movimientos actuales
  const catalogosDetectados = useMemo(() => {
    const empSet = new Set<string>();
    const tipSet = new Set<string>();
    const tkeSet = new Set<string>();
    const ubiSet = new Set<string>();

    for (const item of enriquecidos) {
      if (item.empresa) empSet.add(item.empresa);
      if (item.tipoMaquina) tipSet.add(item.tipoMaquina);
      if (item.tanqueNombre) tkeSet.add(item.tanqueNombre);
      if (item.ubicacionNormalizada) ubiSet.add(item.ubicacionNormalizada);
    }

    return {
      empresas: Array.from(empSet).sort((a, b) => a.localeCompare(b, 'es')),
      tipos: Array.from(tipSet).sort((a, b) => a.localeCompare(b, 'es')),
      tanques: Array.from(tkeSet).sort((a, b) => a.localeCompare(b, 'es')),
      ubicaciones: Array.from(ubiSet).sort((a, b) => a.localeCompare(b, 'es')),
    };
  }, [enriquecidos]);

  // 4. Filtrar movimientos según las selecciones de inclusión
  const filtrados = useMemo(() => {
    return filtrarMovimientos(enriquecidos, {
      empresasSel: empresasSel.length ? empresasSel : undefined,
      tiposSel: tiposSel.length ? tiposSel : undefined,
      tanquesSel: tanquesSel.length ? tanquesSel : undefined,
      ubicacionesSel: ubicacionesSel.length ? ubicacionesSel : undefined,
    });
  }, [enriquecidos, empresasSel, tiposSel, tanquesSel, ubicacionesSel]);

  // 5. Procesar filas y resumen
  const { filas, resumen } = useMemo(() => {
    return procesarFilasReporte(filtrados, agrupacion);
  }, [filtrados, agrupacion]);

  // Manejadores de columnas (checks)
  const alternarColumna = (clave: string) => {
    setMarcados((prev) => (prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]));
  };

  const seleccionarTodasColumnas = () => {
    setMarcados(CAMPOS_REPORTE_COMBUSTIBLE.map((c) => c.clave));
  };

  const seleccionarPrincipalesColumnas = () => {
    setMarcados(CAMPOS_POR_DEFECTO_POR_MODO[agrupacion]);
  };

  const limpiarColumnas = () => {
    setMarcados([]);
  };

  // Manejadores de filtros de inclusión
  const alternarFiltro = (
    setLista: React.Dispatch<React.SetStateAction<string[]>>,
    valor: string
  ) => {
    setLista((prev) => (prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor]));
  };

  const hayFiltrosActivos =
    empresasSel.length > 0 || tiposSel.length > 0 || tanquesSel.length > 0 || ubicacionesSel.length > 0;

  const limpiarFiltros = () => {
    setEmpresasSel([]);
    setTiposSel([]);
    setTanquesSel([]);
    setUbicacionesSel([]);
  };

  // Descarga en los distintos formatos
  const descargar = async (formato: 'pdf' | 'xlsx' | 'csv') => {
    if (marcados.length === 0) {
      toast('Marca al menos una columna para exportar.', 'warning');
      return;
    }
    if (filas.length === 0) {
      toast('No hay datos con los filtros y período seleccionados.', 'warning');
      return;
    }

    setOcupado(formato);
    guardarPreferencias(marcados, agrupacion, baseTasa, incluirResumen);

    try {
      const subFiltros = [
        empresasSel.length ? `${empresasSel.length} emp.` : null,
        tiposSel.length ? `${tiposSel.length} tipos` : null,
        tanquesSel.length ? `${tanquesSel.length} tanques` : null,
        ubicacionesSel.length ? `${ubicacionesSel.length} ubic.` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const meta: MetadatosExportacion = {
        desde,
        hasta,
        agrupacion,
        baseTasa,
        subtituloFiltros: subFiltros ? `Filtros: ${subFiltros}` : undefined,
        incluirResumen,
        orientacion,
      };

      if (formato === 'pdf') {
        await descargarCombustiblePdf(filas, resumen, marcados, meta);
      } else if (formato === 'xlsx') {
        await descargarCombustibleExcel(filas, resumen, marcados, meta);
      } else if (formato === 'csv') {
        descargarCombustibleCsv(filas, marcados, meta);
      }
    } catch (e) {
      toast(mensajeError(e, 'No se pudo generar la exportación'), 'error');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Modal
      title="📋 Reporte Moldeable de Combustible"
      size="lg"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '.5rem', flexWrap: 'wrap' }}>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            {cargando ? 'Cargando datos...' : `${filas.length} fila(s) a exportar`}
          </div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>
              Cerrar
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => void descargar('csv')}
              disabled={!!ocupado || cargando || filas.length === 0 || marcados.length === 0}
              title="Descargar archivo plano CSV (compatible con Excel)"
            >
              {ocupado === 'csv' ? 'Generando...' : '📝 CSV'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => void descargar('xlsx')}
              disabled={!!ocupado || cargando || filas.length === 0 || marcados.length === 0}
              title="Descargar libro Excel con formatos, fórmulas y resumen"
            >
              {ocupado === 'xlsx' ? 'Generando...' : '📊 Excel'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void descargar('pdf')}
              disabled={!!ocupado || cargando || filas.length === 0 || marcados.length === 0}
              title="Vista previa e impresión de PDF institucional estilo Maquinaria GT"
            >
              {ocupado === 'pdf' ? 'Generando...' : '📄 PDF'}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
        {/* 1. SECCIÓN: Período y atajos rápidos */}
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.5rem' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
              📅 Rango de Fechas
            </span>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(primerDiaMesActual()); setHasta(hoyVE()); }}>
                Este mes
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(primerDiaMesAnterior()); setHasta(ultimoDiaMesAnterior()); }}>
                Mes anterior
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(diasAtras(30)); setHasta(hoyVE()); }}>
                Últimos 30d
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(diasAtras(90)); setHasta(hoyVE()); }}>
                Últimos 90d
              </button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(primerDiaAnioActual()); setHasta(hoyVE()); }}>
                Este año
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <span>Desde:</span>
              <input type="date" className="form-control form-control-sm" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
              <span>Hasta:</span>
              <input type="date" className="form-control form-control-sm" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </div>
        </div>

        {/* 2. SECCIÓN: Dimensión Principal (Agrupación) y Valuación USD */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.6rem' }}>
          {/* Dimensión */}
          <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
            <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: '.4rem', color: 'var(--text, #f1f5f9)' }}>
              🎯 Dimensión Principal (Agrupar por)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
              {MODOS_AGRUPACION.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`btn btn-xs ${agrupacion === m.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => cambiarModoAgrupacion(m.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Valuación USD */}
          <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
            <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: '.4rem', color: 'var(--text, #f1f5f9)' }}>
              💵 Valuación en Dólares ($ USD)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', fontSize: '.8rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="baseTasa"
                  checked={baseTasa === 'historica'}
                  onChange={() => setBaseTasa('historica')}
                />
                <span><strong>Tasa histórica</strong> del movimiento (recomendado)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="baseTasa"
                  checked={baseTasa === 'actual'}
                  onChange={() => setBaseTasa('actual')}
                />
                <span><strong>Tasa actual</strong> del tanque (como en el gráfico)</span>
              </label>
            </div>
          </div>
        </div>

        {/* 3. SECCIÓN: Filtros de Inclusión / Exclusión con Checks */}
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.45rem' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
              🔍 Filtros de Inclusión (Checks)
            </span>
            {hayFiltrosActivos && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={limpiarFiltros} style={{ color: 'var(--primary, #f97316)' }}>
                ↺ Restablecer filtros
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.5rem' }}>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'empresas' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSeccionFiltro(seccionFiltro === 'empresas' ? 'ninguno' : 'empresas')}
            >
              🏢 Empresas {empresasSel.length > 0 && `(${empresasSel.length})`}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'tipos' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSeccionFiltro(seccionFiltro === 'tipos' ? 'ninguno' : 'tipos')}
            >
              🏷️ Tipos de Máquina {tiposSel.length > 0 && `(${tiposSel.length})`}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'tanques' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSeccionFiltro(seccionFiltro === 'tanques' ? 'ninguno' : 'tanques')}
            >
              ⛽ Tanques {tanquesSel.length > 0 && `(${tanquesSel.length})`}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'ubicaciones' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSeccionFiltro(seccionFiltro === 'ubicaciones' ? 'ninguno' : 'ubicaciones')}
            >
              📍 Ubicaciones {ubicacionesSel.length > 0 && `(${ubicacionesSel.length})`}
            </button>
          </div>

          {/* Desplegable de Empresas */}
          {seccionFiltro === 'empresas' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>Marca las empresas a incluir (vacío = todas):</span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmpresasSel(catalogosDetectados.empresas)}>Todas</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmpresasSel([])}>Ninguna (Todas)</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.3rem', maxHeight: '140px', overflowY: 'auto' }}>
                {catalogosDetectados.empresas.map((emp) => (
                  <label key={emp} style={{ fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={empresasSel.length === 0 || empresasSel.includes(emp)}
                      onChange={() => alternarFiltro(setEmpresasSel, emp)}
                    />
                    <span>{emp}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Desplegable de Tipos de Máquina */}
          {seccionFiltro === 'tipos' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>Marca los tipos de máquina a incluir:</span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTiposSel(catalogosDetectados.tipos)}>Todos</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTiposSel([])}>Ninguno (Todos)</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.3rem', maxHeight: '140px', overflowY: 'auto' }}>
                {catalogosDetectados.tipos.map((tip) => (
                  <label key={tip} style={{ fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={tiposSel.length === 0 || tiposSel.includes(tip)}
                      onChange={() => alternarFiltro(setTiposSel, tip)}
                    />
                    <span>{tip}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Desplegable de Tanques */}
          {seccionFiltro === 'tanques' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>Marca los tanques o bidones de origen:</span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTanquesSel(catalogosDetectados.tanques)}>Todos</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTanquesSel([])}>Ninguno (Todos)</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '.3rem', maxHeight: '140px', overflowY: 'auto' }}>
                {catalogosDetectados.tanques.map((tk) => (
                  <label key={tk} style={{ fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={tanquesSel.length === 0 || tanquesSel.includes(tk)}
                      onChange={() => alternarFiltro(setTanquesSel, tk)}
                    />
                    <span>{tk}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Desplegable de Ubicaciones */}
          {seccionFiltro === 'ubicaciones' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>Marca las ubicaciones o minas a incluir:</span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setUbicacionesSel(catalogosDetectados.ubicaciones)}>Todas</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setUbicacionesSel([])}>Ninguna (Todas)</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.3rem', maxHeight: '140px', overflowY: 'auto' }}>
                {catalogosDetectados.ubicaciones.map((ubi) => (
                  <label key={ubi} style={{ fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ubicacionesSel.length === 0 || ubicacionesSel.includes(ubi)}
                      onChange={() => alternarFiltro(setUbicacionesSel, ubi)}
                    />
                    <span>{ubi}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4. SECCIÓN: Selección de Columnas (con checks) */}
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
              ☑️ Columnas y Datos a Mostrar ({marcados.length} seleccionadas)
            </span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={seleccionarPrincipalesColumnas}>Principales</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={seleccionarTodasColumnas}>Todas</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={limpiarColumnas}>Ninguna</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '.35rem .5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {CAMPOS_REPORTE_COMBUSTIBLE.map((col) => {
              const estaMarcado = marcados.includes(col.clave);
              return (
                <label
                  key={col.clave}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    fontSize: '.78rem',
                    cursor: 'pointer',
                    color: estaMarcado ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={estaMarcado}
                    onChange={() => alternarColumna(col.clave)}
                  />
                  <span>{col.etiqueta}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 5. SECCIÓN: Opciones de Formato y Resumen en Tarjetas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem', fontSize: '.8rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={incluirResumen}
              onChange={(e) => setIncluirResumen(e.target.checked)}
            />
            <span><strong>Incluir resumen en tarjetas (KPIs)</strong> en cabecera del PDF y hoja Resumen de Excel</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span>Orientación:</span>
            <select
              className="form-control form-control-sm"
              value={orientacion}
              onChange={(e) => setOrientacion(e.target.value as 'auto' | 'portrait' | 'landscape')}
              style={{ fontSize: '.76rem', padding: '.15rem .4rem', height: 'auto' }}
            >
              <option value="auto">Auto ({marcados.length > 6 ? 'Horizontal' : 'Vertical'})</option>
              <option value="portrait">Vertical (Carta)</option>
              <option value="landscape">Horizontal (Apaisado)</option>
            </select>
          </label>
        </div>

        {/* 6. Previsualización de Totales y KPIs */}
        <div style={{
          background: 'var(--surface-1, #0f172a)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '.5rem .8rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '.5rem',
        }}>
          <div>
            <div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>CONSUMO TOTAL</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary, #f97316)' }}>
              {resumen.totalLitros.toLocaleString('es-VE', { maximumFractionDigits: 1 })} L
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>VALOR ($ USD)</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#22c55e' }}>
              $ {resumen.totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>HORAS TRABAJADAS</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>
              {resumen.totalHoras.toLocaleString('es-VE', { maximumFractionDigits: 1 })} h
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>DESPACHOS</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              {resumen.totalSurtidos}
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>PROMEDIO L/H</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              {resumen.rendimientoPromedio > 0 ? `${resumen.rendimientoPromedio.toFixed(2)} L/h` : '-'}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

