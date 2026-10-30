/* ============================================================
   Golden Touch · Combustible · Diálogo de Reporte y Exportación
   (30/10/2026)

   Modal interactivo con controles de casillas (checks) y pills para:
   - Seleccionar columnas/datos a mostrar.
   - Elegir la dimensión principal (por Equipo, Empresa, Ubicación, Tipo,
     Tanque, Mes o Detallado).
   - Valuación USD: Tasa histórica vs Tasa actual del tanque.
   - Filtros multi-selección con checks y pills (Empresas, Tipos de máquina,
     Equipos específicos, Ubicaciones y Tanques).
   - Formato de orientación con checks/pills (Horizontal vs Vertical).
   - Rango de fechas con atajos rápidos.
   - Exportación a Excel (ExcelJS con estilos), PDF (look Maquinaria GT) y CSV.
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
  rangoInicial?: { desde: string; hasta: string };
  onClose: () => void;
}

export function ExportarCombustibleModal({ tanques, tanqueInicialId, rangoInicial, onClose }: Props) {
  const prefs = useMemo(() => preferenciasGuardadas(), []);

  const [desde, setDesde] = useState<string>(() => rangoInicial?.desde || primerDiaMesActual());
  const [hasta, setHasta] = useState<string>(() => rangoInicial?.hasta || hoyVE());
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionCombustible>(prefs.agrupacion);
  const [baseTasa, setBaseTasa] = useState<BaseTasaUsd>(prefs.baseTasa);
  const [marcados, setMarcados] = useState<string[]>(prefs.campos);
  const [incluirResumen, setIncluirResumen] = useState<boolean>(prefs.incluirResumen);
  const [orientacion, setOrientacion] = useState<'landscape' | 'portrait'>('landscape');
  const [formatoPresentacion, setFormatoPresentacion] = useState<'fichas' | 'tabla'>('fichas');
  const [ordenarPor, setOrdenarPor] = useState<'usd' | 'litros' | 'horas'>('usd');

  // Filtros de inclusión mediante checks y pills (vacío = todos)
  const [empresasSel, setEmpresasSel] = useState<string[]>([]);
  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [equiposSel, setEquiposSel] = useState<string[]>([]);
  const [tanquesSel, setTanquesSel] = useState<string[]>(() => (tanqueInicialId ? [tanques.find((t) => t.id === tanqueInicialId)?.nombre || tanqueInicialId] : []));
  const [ubicacionesSel, setUbicacionesSel] = useState<string[]>([]);

  // Pestaña activa de filtros
  const [seccionFiltro, setSeccionFiltro] = useState<'empresas' | 'tipos' | 'equipos' | 'ubicaciones' | 'tanques'>('empresas');
  const [qEquipos, setQEquipos] = useState<string>('');
  const [soloConConsumoEnFiltro, setSoloConConsumoEnFiltro] = useState(false);

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

  // 3. Catálogos disponibles detectados en los movimientos actuales con métricas
  const catalogosDetectados = useMemo(() => {
    const empMap = new Map<string, { count: number; litros: number }>();
    const tipMap = new Map<string, { count: number; litros: number }>();
    const eqMap = new Map<string, { count: number; litros: number; tipo: string; empresa: string }>();
    const tkeMap = new Map<string, { count: number; litros: number }>();
    const ubiMap = new Map<string, { count: number; litros: number }>();

    for (const item of enriquecidos) {
      const l = item.litros;
      // Empresa
      const e = item.empresa || 'Sin empresa asignada';
      const prevE = empMap.get(e) || { count: 0, litros: 0 };
      empMap.set(e, { count: prevE.count + 1, litros: prevE.litros + l });

      // Tipo
      const tp = item.tipoMaquina || 'Otros / No clasificado';
      const prevTp = tipMap.get(tp) || { count: 0, litros: 0 };
      tipMap.set(tp, { count: prevTp.count + 1, litros: prevTp.litros + l });

      // Equipo
      const eq = item.equipoNombre || 'Sin equipo';
      const prevEq = eqMap.get(eq) || { count: 0, litros: 0, tipo: tp, empresa: e };
      eqMap.set(eq, { count: prevEq.count + 1, litros: prevEq.litros + l, tipo: tp, empresa: e });

      // Tanque
      const tk = item.tanqueNombre || 'Tanque desconocido';
      const prevTk = tkeMap.get(tk) || { count: 0, litros: 0 };
      tkeMap.set(tk, { count: prevTk.count + 1, litros: prevTk.litros + l });

      // Ubicación
      const ub = item.ubicacionNormalizada || 'Sin ubicación';
      const prevUb = ubiMap.get(ub) || { count: 0, litros: 0 };
      ubiMap.set(ub, { count: prevUb.count + 1, litros: prevUb.litros + l });
    }

    const sortAlfa = (a: { nombre: string }, b: { nombre: string }) =>
      a.nombre.localeCompare(b.nombre, 'es');

    return {
      empresas: Array.from(empMap.entries()).map(([nombre, d]) => ({ nombre, ...d })).sort(sortAlfa),
      tipos: Array.from(tipMap.entries()).map(([nombre, d]) => ({ nombre, ...d })).sort(sortAlfa),
      equipos: Array.from(eqMap.entries()).map(([nombre, d]) => ({ nombre, ...d })).sort(sortAlfa),
      tanques: Array.from(tkeMap.entries()).map(([nombre, d]) => ({ nombre, ...d })).sort(sortAlfa),
      ubicaciones: Array.from(ubiMap.entries()).map(([nombre, d]) => ({ nombre, ...d })).sort(sortAlfa),
    };
  }, [enriquecidos]);

  // Movimientos filtrados por las demás dimensiones (excepto equipos) para saber con exactitud
  // cuántos litros y despachos tiene cada equipo bajo los filtros activos (ej. Tanque #1)
  const movimientosFiltrosCruzadosEquipos = useMemo(() => {
    return filtrarMovimientos(enriquecidos, {
      empresasSel: empresasSel.length ? empresasSel : undefined,
      tiposSel: tiposSel.length ? tiposSel : undefined,
      tanquesSel: tanquesSel.length ? tanquesSel : undefined,
      ubicacionesSel: ubicacionesSel.length ? ubicacionesSel : undefined,
    });
  }, [enriquecidos, empresasSel, tiposSel, tanquesSel, ubicacionesSel]);

  const statsEquiposEnFiltrosCruzados = useMemo(() => {
    const map = new Map<string, { litros: number; count: number }>();
    for (const mov of movimientosFiltrosCruzadosEquipos) {
      const eq = mov.equipoNombre || 'Sin equipo';
      const prev = map.get(eq) || { litros: 0, count: 0 };
      map.set(eq, { litros: prev.litros + mov.litros, count: prev.count + 1 });
    }
    return map;
  }, [movimientosFiltrosCruzadosEquipos]);

  const hayFiltrosCruzadosActivos = useMemo(() => {
    return (
      (tanquesSel.length > 0 && !tanquesSel.includes('__ninguno__')) ||
      (empresasSel.length > 0 && !empresasSel.includes('__ninguno__')) ||
      (tiposSel.length > 0 && !tiposSel.includes('__ninguno__')) ||
      (ubicacionesSel.length > 0 && !ubicacionesSel.includes('__ninguno__'))
    );
  }, [tanquesSel, empresasSel, tiposSel, ubicacionesSel]);

  const equiposConMovimientoEnFiltroCount = useMemo(() => {
    let count = 0;
    for (const eq of catalogosDetectados.equipos) {
      const s = statsEquiposEnFiltrosCruzados.get(eq.nombre);
      if (s && s.litros > 0) count++;
    }
    return count;
  }, [catalogosDetectados.equipos, statsEquiposEnFiltrosCruzados]);

  // 4. Filtrar movimientos según las selecciones de inclusión
  const filtrados = useMemo(() => {
    return filtrarMovimientos(enriquecidos, {
      empresasSel: empresasSel.length ? empresasSel : undefined,
      tiposSel: tiposSel.length ? tiposSel : undefined,
      equiposSel: equiposSel.length ? equiposSel : undefined,
      tanquesSel: tanquesSel.length ? tanquesSel : undefined,
      ubicacionesSel: ubicacionesSel.length ? ubicacionesSel : undefined,
    });
  }, [enriquecidos, empresasSel, tiposSel, equiposSel, tanquesSel, ubicacionesSel]);

  // 5. Procesar filas y resumen
  const { filas, resumen } = useMemo(() => {
    return procesarFilasReporte(filtrados, agrupacion, ordenarPor);
  }, [filtrados, agrupacion, ordenarPor]);

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

  // Manejadores de filtros de inclusión (Pills y Checks)
  const alternarPillFiltro = (
    actual: string[],
    setLista: React.Dispatch<React.SetStateAction<string[]>>,
    todosNombres: string[],
    item: string
  ) => {
    if (actual.includes('__ninguno__')) {
      setLista([item]);
      return;
    }
    if (actual.length === 0 || actual.length === todosNombres.length) {
      setLista(todosNombres.filter((x) => x !== item));
      return;
    }
    if (actual.includes(item)) {
      const sig = actual.filter((x) => x !== item);
      setLista(sig.length === 0 ? ['__ninguno__'] : sig);
    } else {
      const sig = [...actual, item];
      setLista(sig.length === todosNombres.length ? [] : sig);
    }
  };

  const estaActivoFiltro = (actual: string[], item: string) => {
    if (actual.includes('__ninguno__')) return false;
    return actual.length === 0 || actual.includes(item);
  };

  const hayFiltrosActivos =
    empresasSel.length > 0 ||
    tiposSel.length > 0 ||
    equiposSel.length > 0 ||
    tanquesSel.length > 0 ||
    ubicacionesSel.length > 0;

  const limpiarFiltros = () => {
    setEmpresasSel([]);
    setTiposSel([]);
    setEquiposSel([]);
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
      const partesSub: string[] = [];
      if (empresasSel.length > 0 && !empresasSel.includes('__ninguno__')) {
        partesSub.push(empresasSel.length === 1 ? empresasSel[0] : `${empresasSel.length} emp.`);
      }
      if (tiposSel.length > 0 && !tiposSel.includes('__ninguno__')) {
        partesSub.push(tiposSel.length === 1 ? tiposSel[0] : `${tiposSel.length} tipos`);
      }
      if (equiposSel.length > 0 && !equiposSel.includes('__ninguno__')) {
        partesSub.push(equiposSel.length === 1 ? equiposSel[0] : `${equiposSel.length} eq.`);
      }
      if (tanquesSel.length > 0 && !tanquesSel.includes('__ninguno__')) {
        partesSub.push(tanquesSel.length === 1 ? tanquesSel[0] : `${tanquesSel.length} tanques`);
      }
      if (ubicacionesSel.length > 0 && !ubicacionesSel.includes('__ninguno__')) {
        partesSub.push(ubicacionesSel.length === 1 ? ubicacionesSel[0] : `${ubicacionesSel.length} ubic.`);
      }
      const subFiltros = partesSub.length > 0 ? `Filtros: ${partesSub.join(' · ')}` : undefined;

      const meta: MetadatosExportacion = {
        desde,
        hasta,
        agrupacion,
        baseTasa,
        subtituloFiltros: subFiltros,
        incluirResumen,
        orientacion,
        formatoPresentacion,
        ordenarPor,
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
      title="📄 Descargar Reporte de Combustible"
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
              title="Descargar PDF institucional estilo Maquinaria GT"
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

        {/* 3. SECCIÓN: Filtros de Inclusión mediante Checks y Pills */}
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.5rem' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
              🔍 Filtros por Empresa, Tipo, Equipo y Ubicación
            </span>
            {hayFiltrosActivos && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={limpiarFiltros} style={{ color: 'var(--primary, #f97316)' }}>
                ↺ Restablecer filtros
              </button>
            )}
          </div>

          {/* Pills de Categorías de Filtro */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginBottom: '.6rem' }}>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'empresas' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '999px', padding: '.25rem .65rem' }}
              onClick={() => setSeccionFiltro('empresas')}
            >
              🏢 Empresas
              {empresasSel.length > 0 && !empresasSel.includes('__ninguno__') && (
                <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>
                  {empresasSel.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'tipos' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '999px', padding: '.25rem .65rem' }}
              onClick={() => setSeccionFiltro('tipos')}
            >
              🏷️ Tipos de Máquina
              {tiposSel.length > 0 && !tiposSel.includes('__ninguno__') && (
                <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>
                  {tiposSel.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'equipos' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '999px', padding: '.25rem .65rem' }}
              onClick={() => setSeccionFiltro('equipos')}
            >
              🚜 Equipos Específicos
              {equiposSel.length > 0 && !equiposSel.includes('__ninguno__') && (
                <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>
                  {equiposSel.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'ubicaciones' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '999px', padding: '.25rem .65rem' }}
              onClick={() => setSeccionFiltro('ubicaciones')}
            >
              📍 Ubicaciones
              {ubicacionesSel.length > 0 && !ubicacionesSel.includes('__ninguno__') && (
                <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>
                  {ubicacionesSel.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${seccionFiltro === 'tanques' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '999px', padding: '.25rem .65rem' }}
              onClick={() => setSeccionFiltro('tanques')}
            >
              ⛽ Tanques
              {tanquesSel.length > 0 && !tanquesSel.includes('__ninguno__') && (
                <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>
                  {tanquesSel.length}
                </span>
              )}
            </button>
          </div>

          {/* Panel con Checks y Pills según la categoría activa */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
            {/* Aviso informativo de criterio de inclusión y filtros activos */}
            <div style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '.55rem .85rem',
              marginBottom: '.65rem',
              fontSize: '.8rem',
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 600, color: '#38bdf8' }}>
                <span>ℹ️</span>
                <span>Criterio del reporte: Solo equipos con movimientos registrados en el período</span>
              </div>
              <div style={{ fontSize: '.76rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Se muestran únicamente las máquinas que registraron <strong>despachos o consumos</strong> entre el <strong>{desde}</strong> y el <strong>{hasta}</strong>. Los equipos del catálogo general sin movimientos en este rango se omiten automáticamente del reporte.
              </div>
              {hayFiltrosCruzadosActivos && (
                <div style={{ fontSize: '.76rem', color: '#FF8A00', fontWeight: 500, borderTop: '1px solid rgba(255, 138, 0, 0.2)', paddingTop: '.3rem', marginTop: '.2rem' }}>
                  ⚠️ <strong>Filtros activos ({[
                    tanquesSel.length && !tanquesSel.includes('__ninguno__') ? `Tanques: ${tanquesSel.join(', ')}` : '',
                    empresasSel.length && !empresasSel.includes('__ninguno__') ? `Empresas: ${empresasSel.join(', ')}` : '',
                    tiposSel.length && !tiposSel.includes('__ninguno__') ? `Tipos: ${tiposSel.join(', ')}` : '',
                    ubicacionesSel.length && !ubicacionesSel.includes('__ninguno__') ? `Ubicaciones: ${ubicacionesSel.join(', ')}` : '',
                  ].filter(Boolean).join(' · ')}):</strong> Solo <strong>{equiposConMovimientoEnFiltroCount} de {catalogosDetectados.equipos.length} equipos</strong> tienen despachos con estos filtros. Los marcados con <em>(0 L en filtro)</em> no aparecerán en el PDF generado.
                </div>
              )}
            </div>

            {/* EMPRESAS */}
            {seccionFiltro === 'empresas' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                  <span className="muted" style={{ fontSize: '.76rem' }}>
                    Marca las empresas a incluir ({empresasSel.length === 0 ? 'Todas incluidas' : `${empresasSel.includes('__ninguno__') ? 0 : empresasSel.length} de ${catalogosDetectados.empresas.length}`}):
                  </span>
                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmpresasSel([])}>Todas</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmpresasSel(['__ninguno__'])}>Ninguna</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '150px', overflowY: 'auto', padding: '.2rem 0' }}>
                  {!catalogosDetectados.empresas.length && <span className="muted" style={{ fontSize: '.76rem' }}>Sin empresas en el período.</span>}
                  {catalogosDetectados.empresas.map((it) => {
                    const activo = estaActivoFiltro(empresasSel, it.nombre);
                    const todosNombres = catalogosDetectados.empresas.map((x) => x.nombre);
                    return (
                      <button
                        key={it.nombre}
                        type="button"
                        onClick={() => alternarPillFiltro(empresasSel, setEmpresasSel, todosNombres, it.nombre)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.35rem',
                          padding: '.25rem .65rem',
                          borderRadius: '999px',
                          fontSize: '.78rem',
                          border: '1px solid',
                          borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)',
                          background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)',
                          color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                          cursor: 'pointer',
                          transition: 'all .12s ease',
                        }}
                        title={`${it.nombre}: ${Math.round(it.litros).toLocaleString('es-VE')} L (${it.count} despachos)`}
                      >
                        <input
                          type="checkbox"
                          checked={activo}
                          readOnly
                          style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                        />
                        <span>{it.nombre}</span>
                        <span className="muted" style={{ fontSize: '.7rem', opacity: 0.85 }}>({Math.round(it.litros)} L)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TIPOS DE MÁQUINA */}
            {seccionFiltro === 'tipos' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                  <span className="muted" style={{ fontSize: '.76rem' }}>
                    Marca los tipos de máquina a incluir ({tiposSel.length === 0 ? 'Todos incluidos' : `${tiposSel.includes('__ninguno__') ? 0 : tiposSel.length} de ${catalogosDetectados.tipos.length}`}):
                  </span>
                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTiposSel([])}>Todos</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTiposSel(['__ninguno__'])}>Ninguno</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '150px', overflowY: 'auto', padding: '.2rem 0' }}>
                  {!catalogosDetectados.tipos.length && <span className="muted" style={{ fontSize: '.76rem' }}>Sin tipos de máquina en el período.</span>}
                  {catalogosDetectados.tipos.map((it) => {
                    const activo = estaActivoFiltro(tiposSel, it.nombre);
                    const todosNombres = catalogosDetectados.tipos.map((x) => x.nombre);
                    return (
                      <button
                        key={it.nombre}
                        type="button"
                        onClick={() => alternarPillFiltro(tiposSel, setTiposSel, todosNombres, it.nombre)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.35rem',
                          padding: '.25rem .65rem',
                          borderRadius: '999px',
                          fontSize: '.78rem',
                          border: '1px solid',
                          borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)',
                          background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)',
                          color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                          cursor: 'pointer',
                          transition: 'all .12s ease',
                        }}
                        title={`${it.nombre}: ${Math.round(it.litros).toLocaleString('es-VE')} L (${it.count} despachos)`}
                      >
                        <input
                          type="checkbox"
                          checked={activo}
                          readOnly
                          style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                        />
                        <span>{it.nombre}</span>
                        <span className="muted" style={{ fontSize: '.7rem', opacity: 0.85 }}>({Math.round(it.litros)} L)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EQUIPOS ESPECÍFICOS */}
            {seccionFiltro === 'equipos' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.4rem' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px', maxWidth: '300px', flex: 1 }}>
                    <input
                      type="search"
                      className="input"
                      placeholder="🔍 Buscar equipo específico..."
                      value={qEquipos}
                      onChange={(e) => setQEquipos(e.target.value)}
                      style={{
                        fontSize: '.78rem',
                        padding: '.3rem .6rem',
                        width: '100%',
                        background: 'var(--surface-1, #0f172a)',
                        borderColor: 'var(--border, #334155)',
                        color: 'var(--text, #f1f5f9)',
                        borderRadius: '6px',
                      }}
                    />
                    {qEquipos && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => setQEquipos('')}
                        style={{ position: 'absolute', right: '6px', padding: '0 4px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Toggle para mostrar solo equipos con consumo bajo el filtro activo */}
                  {hayFiltrosCruzadosActivos && (
                    <button
                      type="button"
                      className={`btn btn-xs ${soloConConsumoEnFiltro ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setSoloConConsumoEnFiltro((prev) => !prev)}
                      style={{ whiteSpace: 'nowrap', fontSize: '.74rem' }}
                      title="Oculta los equipos que tienen 0 L bajo los tanques/filtros seleccionados actualmente"
                    >
                      {soloConConsumoEnFiltro ? `✓ Solo con consumo (${equiposConMovimientoEnFiltroCount})` : `Mostrar solo con consumo (${equiposConMovimientoEnFiltroCount})`}
                    </button>
                  )}

                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEquiposSel([])}>Todos</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEquiposSel(['__ninguno__'])}>Ninguno</button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '160px', overflowY: 'auto', padding: '.2rem 0' }}>
                  {catalogosDetectados.equipos
                    .filter((it) => {
                      if (!qEquipos.trim()) return true;
                      const q = qEquipos.trim().toLowerCase();
                      return (
                        it.nombre.toLowerCase().includes(q) ||
                        it.tipo.toLowerCase().includes(q) ||
                        it.empresa.toLowerCase().includes(q)
                      );
                    })
                    .filter((it) => {
                      if (!soloConConsumoEnFiltro || !hayFiltrosCruzadosActivos) return true;
                      const statsCruzadas = statsEquiposEnFiltrosCruzados.get(it.nombre);
                      return statsCruzadas && statsCruzadas.litros > 0;
                    })
                    .map((it) => {
                      const activo = estaActivoFiltro(equiposSel, it.nombre);
                      const todosNombres = catalogosDetectados.equipos.map((x) => x.nombre);
                      const statsCruzadas = statsEquiposEnFiltrosCruzados.get(it.nombre);
                      const tieneMovEnFiltro = statsCruzadas && statsCruzadas.litros > 0;
                      const litrosMostrar = hayFiltrosCruzadosActivos && statsCruzadas ? statsCruzadas.litros : it.litros;

                      return (
                        <button
                          key={it.nombre}
                          type="button"
                          onClick={() => alternarPillFiltro(equiposSel, setEquiposSel, todosNombres, it.nombre)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.35rem',
                            padding: '.25rem .65rem',
                            borderRadius: '999px',
                            fontSize: '.78rem',
                            border: '1px solid',
                            borderColor: activo
                              ? (hayFiltrosCruzadosActivos && !tieneMovEnFiltro ? 'rgba(249, 115, 22, 0.4)' : 'var(--primary, #f97316)')
                              : 'var(--border, #334155)',
                            background: activo
                              ? (hayFiltrosCruzadosActivos && !tieneMovEnFiltro ? 'rgba(249, 115, 22, 0.08)' : 'rgba(249, 115, 22, 0.15)')
                              : 'var(--surface-1, #0f172a)',
                            color: activo
                              ? (hayFiltrosCruzadosActivos && !tieneMovEnFiltro ? '#94a3b8' : 'var(--text, #f1f5f9)')
                              : 'var(--text-muted, #94a3b8)',
                            opacity: hayFiltrosCruzadosActivos && !tieneMovEnFiltro ? 0.6 : 1,
                            cursor: 'pointer',
                            transition: 'all .12s ease',
                          }}
                          title={
                            hayFiltrosCruzadosActivos && !tieneMovEnFiltro
                              ? `${it.nombre}: tiene ${Math.round(it.litros).toLocaleString('es-VE')} L en total en el período, pero 0 L en los filtros activos (ej. Tanque seleccionado). No aparecerá en el PDF.`
                              : `${it.nombre} · ${it.tipo} · ${it.empresa} (${Math.round(litrosMostrar).toLocaleString('es-VE')} L)`
                          }
                        >
                          <input
                            type="checkbox"
                            checked={activo}
                            readOnly
                            style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                          />
                          <span>{it.nombre}</span>
                          {hayFiltrosCruzadosActivos ? (
                            tieneMovEnFiltro ? (
                              <span style={{ fontSize: '.7rem', color: '#10b981', fontWeight: 600 }}>({Math.round(litrosMostrar)} L)</span>
                            ) : (
                              <span className="muted" style={{ fontSize: '.68rem', fontStyle: 'italic', opacity: 0.8 }}>(0 L en filtro)</span>
                            )
                          ) : (
                            <span className="muted" style={{ fontSize: '.7rem', opacity: 0.85 }}>({Math.round(it.litros)} L)</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* UBICACIONES */}
            {seccionFiltro === 'ubicaciones' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                  <span className="muted" style={{ fontSize: '.76rem' }}>
                    Marca las ubicaciones a incluir ({ubicacionesSel.length === 0 ? 'Todas incluidas' : `${ubicacionesSel.includes('__ninguno__') ? 0 : ubicacionesSel.length} de ${catalogosDetectados.ubicaciones.length}`}):
                  </span>
                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setUbicacionesSel([])}>Todas</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setUbicacionesSel(['__ninguno__'])}>Ninguna</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '150px', overflowY: 'auto', padding: '.2rem 0' }}>
                  {!catalogosDetectados.ubicaciones.length && <span className="muted" style={{ fontSize: '.76rem' }}>Sin ubicaciones registradas en el período.</span>}
                  {catalogosDetectados.ubicaciones.map((it) => {
                    const activo = estaActivoFiltro(ubicacionesSel, it.nombre);
                    const todosNombres = catalogosDetectados.ubicaciones.map((x) => x.nombre);
                    return (
                      <button
                        key={it.nombre}
                        type="button"
                        onClick={() => alternarPillFiltro(ubicacionesSel, setUbicacionesSel, todosNombres, it.nombre)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.35rem',
                          padding: '.25rem .65rem',
                          borderRadius: '999px',
                          fontSize: '.78rem',
                          border: '1px solid',
                          borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)',
                          background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)',
                          color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                          cursor: 'pointer',
                          transition: 'all .12s ease',
                        }}
                        title={`${it.nombre}: ${Math.round(it.litros).toLocaleString('es-VE')} L (${it.count} despachos)`}
                      >
                        <input
                          type="checkbox"
                          checked={activo}
                          readOnly
                          style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                        />
                        <span>{it.nombre}</span>
                        <span className="muted" style={{ fontSize: '.7rem', opacity: 0.85 }}>({Math.round(it.litros)} L)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TANQUES */}
            {seccionFiltro === 'tanques' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                  <span className="muted" style={{ fontSize: '.76rem' }}>
                    Marca los tanques o bidones de origen ({tanquesSel.length === 0 ? 'Todos incluidos' : `${tanquesSel.includes('__ninguno__') ? 0 : tanquesSel.length} de ${catalogosDetectados.tanques.length}`}):
                  </span>
                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTanquesSel([])}>Todos</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTanquesSel(['__ninguno__'])}>Ninguno</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '150px', overflowY: 'auto', padding: '.2rem 0' }}>
                  {!catalogosDetectados.tanques.length && <span className="muted" style={{ fontSize: '.76rem' }}>Sin tanques registrados en el período.</span>}
                  {catalogosDetectados.tanques.map((it) => {
                    const activo = estaActivoFiltro(tanquesSel, it.nombre);
                    const todosNombres = catalogosDetectados.tanques.map((x) => x.nombre);
                    return (
                      <button
                        key={it.nombre}
                        type="button"
                        onClick={() => alternarPillFiltro(tanquesSel, setTanquesSel, todosNombres, it.nombre)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.35rem',
                          padding: '.25rem .65rem',
                          borderRadius: '999px',
                          fontSize: '.78rem',
                          border: '1px solid',
                          borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)',
                          background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)',
                          color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                          cursor: 'pointer',
                          transition: 'all .12s ease',
                        }}
                        title={`${it.nombre}: ${Math.round(it.litros).toLocaleString('es-VE')} L (${it.count} despachos)`}
                      >
                        <input
                          type="checkbox"
                          checked={activo}
                          readOnly
                          style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                        />
                        <span>{it.nombre}</span>
                        <span className="muted" style={{ fontSize: '.7rem', opacity: 0.85 }}>({Math.round(it.litros)} L)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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

        {/* 5. SECCIÓN: Opciones de Formato, Presentación y Orientación */}
        <div style={{
          background: 'var(--surface-2, #182230)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '.65rem .8rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '.6rem',
        }}>
          {/* Fila 1: Formato de presentación y Criterio de ordenamiento principal */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem', borderBottom: '1px solid var(--border)', paddingBottom: '.5rem' }}>
            {/* Formato de presentación: Fichas Ejecutivas vs Tabla Tabular */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
                🎨 Formato de Presentación:
              </span>
              <div style={{ display: 'inline-flex', gap: '.4rem' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${formatoPresentacion === 'fichas' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    borderRadius: '999px',
                    padding: '.25rem .75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    fontWeight: formatoPresentacion === 'fichas' ? 600 : 400,
                  }}
                  onClick={() => setFormatoPresentacion('fichas')}
                  title="Diseño visual en tarjetas/fichas por equipo con métricas claras y legibles, sin columnas apretadas"
                >
                  <input
                    type="checkbox"
                    checked={formatoPresentacion === 'fichas'}
                    readOnly
                    style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                  />
                  <span>🏢 Fichas Ejecutivas</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${formatoPresentacion === 'tabla' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    borderRadius: '999px',
                    padding: '.25rem .75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    fontWeight: formatoPresentacion === 'tabla' ? 600 : 400,
                  }}
                  onClick={() => setFormatoPresentacion('tabla')}
                  title="Diseño clásico en cuadrícula y tabla de datos"
                >
                  <input
                    type="checkbox"
                    checked={formatoPresentacion === 'tabla'}
                    readOnly
                    style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                  />
                  <span>📊 Tabla Tabular</span>
                </button>
              </div>
            </div>

            {/* Ordenamiento principal: por Costo, Consumo u Horas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
                🎯 Principal por:
              </span>
              <div style={{ display: 'inline-flex', gap: '.3rem' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${ordenarPor === 'usd' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .6rem' }}
                  onClick={() => setOrdenarPor('usd')}
                  title="Ordenar resultados por mayor costo/inversión en dólares ($ USD)"
                >
                  💵 Costo ($)
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${ordenarPor === 'litros' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .6rem' }}
                  onClick={() => setOrdenarPor('litros')}
                  title="Ordenar resultados por mayor volumen de litros consumidos"
                >
                  ⛽ Litros
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${ordenarPor === 'horas' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .6rem' }}
                  onClick={() => setOrdenarPor('horas')}
                  title="Ordenar resultados por cantidad de horas trabajadas"
                >
                  ⏱️ Horas
                </button>
              </div>
            </div>
          </div>

          {/* Fila 2: Orientación y Resumen */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem' }}>
            {/* Orientación con pills y checks interactivos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
                📐 Orientación:
              </span>
              <div style={{ display: 'inline-flex', gap: '.4rem' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${orientacion === 'landscape' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    borderRadius: '999px',
                    padding: '.25rem .75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    fontWeight: orientacion === 'landscape' ? 600 : 400,
                  }}
                  onClick={() => setOrientacion('landscape')}
                  title="Formato horizontal (apaisado), recomendado para fichas ejecutivas y tablas anchas"
                >
                  <input
                    type="checkbox"
                    checked={orientacion === 'landscape'}
                    readOnly
                    style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                  />
                  <span>Horizontal (Apaisado)</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${orientacion === 'portrait' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    borderRadius: '999px',
                    padding: '.25rem .75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    fontWeight: orientacion === 'portrait' ? 600 : 400,
                  }}
                  onClick={() => setOrientacion('portrait')}
                  title="Formato vertical (carta estándar)"
                >
                  <input
                    type="checkbox"
                    checked={orientacion === 'portrait'}
                    readOnly
                    style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                  />
                  <span>Vertical (Carta)</span>
                </button>
              </div>
            </div>

            {/* Check Resumen KPIs */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.8rem' }}>
              <input
                type="checkbox"
                checked={incluirResumen}
                onChange={(e) => setIncluirResumen(e.target.checked)}
              />
              <span><strong>Incluir resumen en tarjetas (KPIs)</strong> en cabecera</span>
            </label>
          </div>
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
            <div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>EQUIPOS EN REPORTE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b' }}>
              {resumen.totalEquipos} <span style={{ fontSize: '.72rem', fontWeight: 500, color: '#94a3b8' }}>({filas.length} {agrupacion === 'equipo' ? 'reg.' : 'filas'})</span>
            </div>
          </div>
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

