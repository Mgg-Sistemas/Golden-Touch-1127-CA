/* ============================================================
   Golden Touch · Recursos Humanos · Diálogo «Reporte Dinámico de Personal»
   (04/11/2026)

   Modal moldeable interactivo de RRHH y Nómina:
     · Multi-empresa nativo con chips y checks (GT, MTO y nóminas creadas).
     · Filtros secundarios por Empresa, Departamento, Cargo, Estado, Género y Carga Familiar.
     · Selector dinámico de columnas con presets (Principales / Todas / Ninguna).
     · Doble formato de presentación: Fichas Ejecutivas vs Tabla Tabular.
     · Selector de orientación: Horizontal (Apaisado) vs Vertical (Carta).
     · Banner de KPIs interactivo en cabecera.
     · Vista previa en vivo con tarjetas o tabla que reacciona a cada casilla.
     · Descarga directa a Excel (ExcelJS), PDF institucional (jsPDF) y CSV.
     · Preparado con selector de ámbitos para Histórico Salarial e Histórico de Cargos.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { EmpresaRrhh, Personal, PersonalFamiliar, PersonalSueldo } from '@/shared/lib/types';
import type { PersonalCargo } from './cargos';
import { useEmpresasRrhh } from '@/shared/lib/empresasRrhh';
import { listFamiliaresDeTodos } from './familiares.repository';
import { listPersonal } from './personal.repository';
import { listTodosCambiosSueldo } from './sueldos.repository';
import { listTodosCambiosCargo } from './cargos.repository';
import {
  CAMPOS_POR_DEFECTO_POR_MODO,
  CAMPOS_POR_DEFECTO_POR_AMBITO,
  CAMPOS_PRINCIPALES_PERSONAL,
  CAMPOS_REPORTE_PERSONAL,
  calcularKpisCabeceraDinamicos,
  filtrarFilasPersonal,
  normalizarPersonal,
  normalizarHistoricoSalarial,
  normalizarHistoricoCargos,
  obtenerMetricasFichaPersonal,
  procesarFilasReportePersonal,
  type AmbitoReportePersonal,
  type CriterioOrdenPersonal,
  type FiltroTriestado,
  type FormatoPresentacionPersonal,
  type ModoAgrupacionPersonal,
  type OrientacionReportePersonal,
} from './personalMoldeable';
import {
  descargarPersonalCsv,
  descargarPersonalExcel,
  descargarPersonalPdf,
  type MetadatosExportacionPersonal,
} from './exportarPersonalReporte';

const CLAVE_LOCAL_CAMPOS = 'gt.rrhh.reporte.campos';
const CLAVE_LOCAL_AGRUPACION = 'gt.rrhh.reporte.agrupacion';
const CLAVE_LOCAL_FORMATO = 'gt.rrhh.reporte.formato';
const CLAVE_LOCAL_ORIENTACION = 'gt.rrhh.reporte.orientacion';
const CLAVE_LOCAL_ORDEN = 'gt.rrhh.reporte.orden';
const CLAVE_LOCAL_RESUMEN = 'gt.rrhh.reporte.resumen';

const MODOS_AGRUPACION: { id: ModoAgrupacionPersonal; icon: string; label: string }[] = [
  { id: 'departamento', icon: '🏢', label: 'Por Departamento' },
  { id: 'cargo', icon: '💼', label: 'Por Cargo' },
  { id: 'empresa', icon: '🏛️', label: 'Por Empresa' },
  { id: 'estado', icon: '🟢', label: 'Por Estado' },
  { id: 'genero', icon: '👤', label: 'Por Género' },
  { id: 'hijos', icon: '👶', label: 'Por Carga Familiar' },
  { id: 'antiguedad', icon: '⏳ Por Antigüedad', label: 'Por Antigüedad' },
  { id: 'grado_instruccion', icon: '🎓', label: 'Por Instrucción' },
  { id: 'detallado', icon: '📋', label: 'Detallado' },
];

type SeccionFiltroSecundario = 'empresas' | 'departamentos' | 'cargos' | 'estado_genero' | 'familia';

interface Props {
  personas: Personal[];
  total: number;
  titulo?: string;
  empresa?: EmpresaRrhh;
  familiaresMap?: Map<string, PersonalFamiliar[]>;
  onClose: () => void;
}

export function ExportarPersonalModal({
  personas: personasIniciales,
  total,
  titulo = 'Reporte de Personal',
  empresa: empresaProp,
  familiaresMap: familiaresProp,
  onClose,
}: Props) {
  const catalogoEmpresas = useEmpresasRrhh();

  // Ámbito del reporte (Directorio o históricos operativos)
  const [ambito, setAmbito] = useState<AmbitoReportePersonal>('directorio');

  // Estado de datos base
  const [personalCompleto, setPersonalCompleto] = useState<Personal[]>(personasIniciales);
  const [familiaresMap, setFamiliaresMap] = useState<Map<string, PersonalFamiliar[]>>(
    familiaresProp || new Map(),
  );

  // Estados de datos históricos operativos
  const [cambiosSueldo, setCambiosSueldo] = useState<PersonalSueldo[] | null>(null);
  const [cambiosCargo, setCambiosCargo] = useState<PersonalCargo[] | null>(null);
  const [cargandoHistorico, setCargandoHistorico] = useState<boolean>(false);

  // Preferencias persistidas
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionPersonal>(() => {
    try {
      const v = localStorage.getItem(CLAVE_LOCAL_AGRUPACION) as ModoAgrupacionPersonal;
      if (v && MODOS_AGRUPACION.some((m) => m.id === v)) return v;
    } catch { /* ignore */ }
    return 'departamento';
  });

  const [formatoPresentacion, setFormatoPresentacion] = useState<FormatoPresentacionPersonal>(() => {
    try {
      const v = localStorage.getItem(CLAVE_LOCAL_FORMATO) as FormatoPresentacionPersonal;
      if (v === 'fichas' || v === 'tabla') return v;
    } catch { /* ignore */ }
    return 'fichas';
  });

  const [orientacion, setOrientacion] = useState<OrientacionReportePersonal>(() => {
    try {
      const v = localStorage.getItem(CLAVE_LOCAL_ORIENTACION) as OrientacionReportePersonal;
      if (v === 'vertical' || v === 'horizontal') return v;
    } catch { /* ignore */ }
    return 'vertical';
  });

  const [orden, setOrden] = useState<CriterioOrdenPersonal>(() => {
    try {
      const v = localStorage.getItem(CLAVE_LOCAL_ORDEN) as CriterioOrdenPersonal;
      if (v) return v;
    } catch { /* ignore */ }
    return 'sueldo_desc';
  });

  const [incluirResumen, setIncluirResumen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(CLAVE_LOCAL_RESUMEN);
      if (v != null) return v === 'true';
    } catch { /* ignore */ }
    return true;
  });

  const [marcados, setMarcados] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL_CAMPOS) ?? 'null');
      if (Array.isArray(v) && v.length) return v;
    } catch { /* ignore */ }
    return CAMPOS_POR_DEFECTO_POR_MODO[agrupacion] || CAMPOS_PRINCIPALES_PERSONAL;
  });

  // Filtros secundarios
  const [seccionFiltro, setSeccionFiltro] = useState<SeccionFiltroSecundario>('empresas');
  const [empresasSel, setEmpresasSel] = useState<string[]>(() => {
    if (empresaProp) return [empresaProp];
    return [];
  });
  const [departamentosSel, setDepartamentosSel] = useState<string[]>([]);
  const [cargosSel, setCargosSel] = useState<string[]>([]);
  const [estadosSel, setEstadosSel] = useState<string[]>(['activos']);
  const [generosSel, setGenerosSel] = useState<string[]>([]);
  const [hijosFiltro, setHijosFiltro] = useState<FiltroTriestado>('todos');

  // Buscador en vista previa
  const [busquedaPrevia, setBusquedaPrevia] = useState('');
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | 'csv' | null>(null);

  // Carga de familiares si no venían pasados por prop
  useEffect(() => {
    if (!familiaresProp || familiaresProp.size === 0) {
      listFamiliaresDeTodos()
        .then(setFamiliaresMap)
        .catch(() => setFamiliaresMap(new Map()));
    }
  }, [familiaresProp]);

  // Carga reactiva de históricos al activar un ámbito operativo
  useEffect(() => {
    if (ambito === 'historico_salarial' && cambiosSueldo === null) {
      setCargandoHistorico(true);
      listTodosCambiosSueldo()
        .then(setCambiosSueldo)
        .catch((err) => {
          console.error(err);
          toast('No se pudo cargar el histórico salarial', 'error');
        })
        .finally(() => setCargandoHistorico(false));
    } else if (ambito === 'historico_cargos' && cambiosCargo === null) {
      setCargandoHistorico(true);
      listTodosCambiosCargo()
        .then(setCambiosCargo)
        .catch((err) => {
          console.error(err);
          toast('No se pudo cargar el histórico de cargos', 'error');
        })
        .finally(() => setCargandoHistorico(false));
    }
  }, [ambito, cambiosSueldo, cambiosCargo]);

  // Si el usuario quiere ver todas las empresas o desmarca la empresa inicial, traemos la nómina completa
  useEffect(() => {
    if (empresasSel.length === 0 || empresasSel.length > 1 || (empresasSel.length === 1 && empresasSel[0] !== empresaProp)) {
      listPersonal(false)
        .then(setPersonalCompleto)
        .catch(() => {});
    }
  }, [empresasSel, empresaProp]);

  // Guardar preferencias en localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_LOCAL_AGRUPACION, agrupacion);
      localStorage.setItem(CLAVE_LOCAL_FORMATO, formatoPresentacion);
      localStorage.setItem(CLAVE_LOCAL_ORIENTACION, orientacion);
      localStorage.setItem(CLAVE_LOCAL_ORDEN, orden);
      localStorage.setItem(CLAVE_LOCAL_RESUMEN, String(incluirResumen));
      localStorage.setItem(CLAVE_LOCAL_CAMPOS, JSON.stringify(marcados));
    } catch { /* ignore */ }
  }, [agrupacion, formatoPresentacion, orientacion, orden, incluirResumen, marcados]);

  // Catálogos detectados en el lote de personal
  const catalogosDetectados = useMemo(() => {
    const deptos = new Set<string>();
    const cargos = new Set<string>();
    const empresas = new Map<string, number>();

    personalCompleto.forEach((p) => {
      if (p.departamento) deptos.add(p.departamento.trim());
      if (p.cargo) cargos.add(p.cargo.trim());
      const e = p.empresa || 'GT';
      empresas.set(e, (empresas.get(e) || 0) + 1);
    });

    return {
      departamentos: Array.from(deptos).sort((a, b) => a.localeCompare(b, 'es')),
      cargos: Array.from(cargos).sort((a, b) => a.localeCompare(b, 'es')),
      empresas: catalogoEmpresas.map((emp) => ({
        clave: emp.clave,
        nombre: emp.nombre,
        icono: emp.icono,
        conteo: empresas.get(emp.clave) || 0,
      })),
    };
  }, [personalCompleto, catalogoEmpresas]);

  // Diccionario id -> Personal para enriquecer históricos
  const personasMap = useMemo(() => {
    return new Map(personalCompleto.map((p) => [p.id, p]));
  }, [personalCompleto]);

  // Normalización plana según el ámbito activo
  const filasNormalizadas = useMemo(() => {
    if (ambito === 'historico_salarial') {
      if (!cambiosSueldo) return [];
      return normalizarHistoricoSalarial(cambiosSueldo, personasMap, familiaresMap);
    }
    if (ambito === 'historico_cargos') {
      if (!cambiosCargo) return [];
      return normalizarHistoricoCargos(cambiosCargo, personasMap, familiaresMap);
    }
    return personalCompleto.map((p) => normalizarPersonal(p, familiaresMap, 'directorio'));
  }, [ambito, cambiosSueldo, cambiosCargo, personalCompleto, personasMap, familiaresMap]);

  // Filtrado
  const filasFiltradas = useMemo(() => {
    return filtrarFilasPersonal(filasNormalizadas, {
      empresasSel,
      departamentosSel,
      cargosSel,
      estadosSel,
      generosSel,
      hijosFiltro,
    });
  }, [filasNormalizadas, empresasSel, departamentosSel, cargosSel, estadosSel, generosSel, hijosFiltro]);

  // Procesamiento y KPIs
  const resultado = useMemo(() => {
    return procesarFilasReportePersonal(filasFiltradas, agrupacion, orden);
  }, [filasFiltradas, agrupacion, orden]);

  // Filas visibles en la vista previa con buscador rápido
  const filasParaPreview = useMemo(() => {
    if (!busquedaPrevia.trim()) return resultado.filasPlanasyOrdenadas;
    const q = busquedaPrevia.toLowerCase().trim();
    return resultado.filasPlanasyOrdenadas.filter(
      (f) =>
        f.nombre_completo.toLowerCase().includes(q) ||
        f.cedula.toLowerCase().includes(q) ||
        f.cargo.toLowerCase().includes(q) ||
        f.departamento.toLowerCase().includes(q),
    );
  }, [resultado.filasPlanasyOrdenadas, busquedaPrevia]);

  // Handlers para columnas
  const alternarColumna = (clave: string) => {
    setMarcados((prev) => (prev.includes(clave) ? prev.filter((x) => x !== clave) : [...prev, clave]));
  };

  const seleccionarPrincipalesColumnas = () => {
    setMarcados(CAMPOS_PRINCIPALES_PERSONAL);
  };

  const seleccionarTodasColumnas = () => {
    setMarcados(CAMPOS_REPORTE_PERSONAL.map((c) => c.clave));
  };

  const limpiarColumnas = () => {
    setMarcados([]);
  };

  const cambiarAmbito = (nuevoAmbito: AmbitoReportePersonal) => {
    setAmbito(nuevoAmbito);
    const sugeridas = CAMPOS_POR_DEFECTO_POR_AMBITO[nuevoAmbito];
    if (sugeridas && sugeridas.length > 0) {
      setMarcados(sugeridas);
    }
  };

  const cambiarModoAgrupacion = (modo: ModoAgrupacionPersonal) => {
    setAgrupacion(modo);
    const sugeridas = CAMPOS_POR_DEFECTO_POR_MODO[modo];
    if (sugeridas) setMarcados(sugeridas);
  };

  // Handlers para filtros por chips
  const alternarChip = (array: string[], setArray: (v: string[]) => void, valor: string) => {
    if (array.includes('__ninguno__')) {
      setArray([valor]);
      return;
    }
    if (array.includes(valor)) {
      const nuevo = array.filter((x) => x !== valor);
      setArray(nuevo);
    } else {
      setArray([...array, valor]);
    }
  };

  // Acciones de descarga
  const descargar = async (tipo: 'xlsx' | 'pdf' | 'csv') => {
    if (marcados.length === 0) {
      toast('Selecciona al menos una columna para exportar.', 'warning');
      return;
    }
    if (filasFiltradas.length === 0) {
      toast('No hay personas para exportar con los filtros seleccionados.', 'warning');
      return;
    }

    setOcupado(tipo);
    try {
      const empresaUnica = empresasSel.length === 1 ? empresasSel[0] : (empresasSel.length === 0 && catalogoEmpresas.length === 1 ? catalogoEmpresas[0].clave : null);
      const partesSubtitulo: string[] = [];
      if (empresaUnica) partesSubtitulo.push(`Empresa: ${empresaUnica}`);
      else if (empresasSel.length > 1) partesSubtitulo.push(`Empresas: ${empresasSel.join(', ')}`);
      if (departamentosSel.length) partesSubtitulo.push(`Deptos: ${departamentosSel.join(', ')}`);
      if (hijosFiltro === 'si') partesSubtitulo.push('Solo con hijos');
      if (hijosFiltro === 'no') partesSubtitulo.push('Sin hijos');

      const meta: MetadatosExportacionPersonal = {
        ambito,
        agrupacion,
        formatoPresentacion,
        orientacion,
        empresaPrincipal: empresaUnica,
        subtituloFiltros: partesSubtitulo.join(' · ') || undefined,
        incluirResumen,
      };

      if (tipo === 'xlsx') {
        await descargarPersonalExcel(filasFiltradas, resultado.resumen, resultado.grupos, marcados, meta);
      } else if (tipo === 'pdf') {
        await descargarPersonalPdf(filasFiltradas, resultado.resumen, resultado.grupos, marcados, meta);
      } else {
        descargarPersonalCsv(filasFiltradas, marcados, meta);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al generar el reporte', 'error');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Modal
      title={titulo ? `📊 ${titulo}` : '📊 Reporte Dinámico de Personal · Nómina GT'}
      size="xl"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.84rem', color: 'var(--text-muted, #94a3b8)' }}>
            <span>Registros: <strong>{filasFiltradas.length}</strong> de {personalCompleto.length}</span>
            <span>·</span>
            <span>Masa salarial: <strong style={{ color: '#22c55e' }}>${resultado.resumen.masaSalarialTotalUsd.toLocaleString('es-VE')}</strong></span>
          </div>
          <div style={{ display: 'flex', gap: '.45rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>
              Cerrar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void descargar('csv')}
              disabled={!!ocupado || !filasFiltradas.length || !marcados.length}
            >
              {ocupado === 'csv' ? 'Generando…' : '📋 CSV'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void descargar('xlsx')}
              disabled={!!ocupado || !filasFiltradas.length || !marcados.length}
            >
              {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void descargar('pdf')}
              disabled={!!ocupado || !filasFiltradas.length || !marcados.length}
            >
              {ocupado === 'pdf' ? 'Generando…' : '📄 PDF (Imprimir)'}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>

        {/* 1. SECCIÓN: Ámbito del Reporte (Directorio / Históricos operativos) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.5rem .8rem', flexWrap: 'wrap', gap: '.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Ámbito:</span>
            <button
              type="button"
              className={`btn btn-xs ${ambito === 'directorio' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => cambiarAmbito('directorio')}
            >
              👥 Directorio Activo
            </button>
            <button
              type="button"
              className={`btn btn-xs ${ambito === 'historico_salarial' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => cambiarAmbito('historico_salarial')}
              title="Histórico de aumentos, variaciones salariales y motivos"
            >
              📈 Histórico Salarial {cambiosSueldo ? `(${cambiosSueldo.length})` : ''}
            </button>
            <button
              type="button"
              className={`btn btn-xs ${ambito === 'historico_cargos' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => cambiarAmbito('historico_cargos')}
              title="Histórico de cargos, promociones y ascensos"
            >
              🎖️ Histórico de Cargos {cambiosCargo ? `(${cambiosCargo.length})` : ''}
            </button>
            {cargandoHistorico && (
              <span className="muted" style={{ fontSize: '.74rem', marginLeft: '.4rem' }}>
                ⏳ Cargando datos…
              </span>
            )}
          </div>
          <span className="muted" style={{ fontSize: '.76rem' }}>
            {ambito === 'directorio'
              ? `${total} personas en catálogo`
              : `${filasFiltradas.length} registros en historial`}
          </span>
        </div>

        {/* 2. SECCIÓN: Dimensión Principal (Agrupar por) */}
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

        {/* 3. SECCIÓN: Filtros Secundarios con Pestañas y Chips de Checks */}
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '.4rem', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' }}>
              🔍 Filtros por Empresa, Departamento, Estatus y Carga Familiar
            </span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              <button
                type="button"
                className={`btn btn-xs ${seccionFiltro === 'empresas' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSeccionFiltro('empresas')}
              >
                🏛️ Empresas {empresasSel.length > 0 && `(${empresasSel.length})`}
              </button>
              <button
                type="button"
                className={`btn btn-xs ${seccionFiltro === 'departamentos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSeccionFiltro('departamentos')}
              >
                🏢 Departamentos {departamentosSel.length > 0 && `(${departamentosSel.length})`}
              </button>
              <button
                type="button"
                className={`btn btn-xs ${seccionFiltro === 'cargos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSeccionFiltro('cargos')}
              >
                💼 Cargos {cargosSel.length > 0 && `(${cargosSel.length})`}
              </button>
              <button
                type="button"
                className={`btn btn-xs ${seccionFiltro === 'estado_genero' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSeccionFiltro('estado_genero')}
              >
                🟢 Estatus / Género
              </button>
              <button
                type="button"
                className={`btn btn-xs ${seccionFiltro === 'familia' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSeccionFiltro('familia')}
              >
                👶 Carga Familiar {hijosFiltro !== 'todos' && `(✓)`}
              </button>
            </div>
          </div>

          {/* Pestaña: EMPRESAS */}
          {seccionFiltro === 'empresas' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>
                  Marca las empresas o nóminas a incluir ({empresasSel.length === 0 ? 'Todas incluidas' : `${empresasSel.length} seleccionada(s)`}):
                </span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmpresasSel([])}>Todas</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmpresasSel(['__ninguno__'])}>Ninguna</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '130px', overflowY: 'auto' }}>
                {catalogosDetectados.empresas.map((it) => {
                  const activo = empresasSel.length === 0 || empresasSel.includes(it.clave);
                  return (
                    <button
                      key={it.clave}
                      type="button"
                      onClick={() => {
                        const todosClaves = catalogosDetectados.empresas.map((x) => x.clave);
                        if (empresasSel.length === 0) {
                          setEmpresasSel(todosClaves.filter((c) => c !== it.clave));
                        } else {
                          alternarChip(empresasSel, setEmpresasSel, it.clave);
                        }
                      }}
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
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={activo}
                        readOnly
                        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                      />
                      <span>{it.icono || '🏛️'}</span>
                      <span>{it.nombre}</span>
                      <span className="muted" style={{ fontSize: '.7rem' }}>({it.conteo} pers.)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pestaña: DEPARTAMENTOS */}
          {seccionFiltro === 'departamentos' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>
                  Marca los departamentos a incluir ({departamentosSel.length === 0 ? 'Todos incluidos' : `${departamentosSel.length} de ${catalogosDetectados.departamentos.length}`}):
                </span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setDepartamentosSel([])}>Todos</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setDepartamentosSel(['__ninguno__'])}>Ninguno</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '130px', overflowY: 'auto' }}>
                {catalogosDetectados.departamentos.map((d) => {
                  const activo = departamentosSel.length === 0 || departamentosSel.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        if (departamentosSel.length === 0) {
                          setDepartamentosSel(catalogosDetectados.departamentos.filter((x) => x !== d));
                        } else {
                          alternarChip(departamentosSel, setDepartamentosSel, d);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '.35rem',
                        padding: '.25rem .6rem',
                        borderRadius: '999px',
                        fontSize: '.76rem',
                        border: '1px solid',
                        borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)',
                        background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)',
                        color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={activo}
                        readOnly
                        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                      />
                      <span>{d}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pestaña: CARGOS */}
          {seccionFiltro === 'cargos' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
                <span className="muted" style={{ fontSize: '.76rem' }}>
                  Marca los cargos a incluir ({cargosSel.length === 0 ? 'Todos incluidos' : `${cargosSel.length} de ${catalogosDetectados.cargos.length}`}):
                </span>
                <div style={{ display: 'flex', gap: '.3rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCargosSel([])}>Todos</button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCargosSel(['__ninguno__'])}>Ninguno</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '130px', overflowY: 'auto' }}>
                {catalogosDetectados.cargos.map((c) => {
                  const activo = cargosSel.length === 0 || cargosSel.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (cargosSel.length === 0) {
                          setCargosSel(catalogosDetectados.cargos.filter((x) => x !== c));
                        } else {
                          alternarChip(cargosSel, setCargosSel, c);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '.35rem',
                        padding: '.25rem .6rem',
                        borderRadius: '999px',
                        fontSize: '.76rem',
                        border: '1px solid',
                        borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)',
                        background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)',
                        color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={activo}
                        readOnly
                        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }}
                      />
                      <span>{c}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pestaña: ESTADO Y GÉNERO */}
          {seccionFiltro === 'estado_genero' && (
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <span className="muted" style={{ fontSize: '.76rem', display: 'block', marginBottom: '.3rem' }}>
                  Estatus Laboral:
                </span>
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${estadosSel.includes('activos') ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => alternarChip(estadosSel, setEstadosSel, 'activos')}
                  >
                    <input type="checkbox" checked={estadosSel.includes('activos')} readOnly style={{ margin: 0 }} />
                    <span>Activos</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${estadosSel.includes('inactivos') ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => alternarChip(estadosSel, setEstadosSel, 'inactivos')}
                  >
                    <input type="checkbox" checked={estadosSel.includes('inactivos')} readOnly style={{ margin: 0 }} />
                    <span>Inactivos</span>
                  </button>
                </div>
              </div>

              <div>
                <span className="muted" style={{ fontSize: '.76rem', display: 'block', marginBottom: '.3rem' }}>
                  Género:
                </span>
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${generosSel.includes('M') ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => alternarChip(generosSel, setGenerosSel, 'M')}
                  >
                    <input type="checkbox" checked={generosSel.includes('M')} readOnly style={{ margin: 0 }} />
                    <span>Hombres</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${generosSel.includes('F') ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => alternarChip(generosSel, setGenerosSel, 'F')}
                  >
                    <input type="checkbox" checked={generosSel.includes('F')} readOnly style={{ margin: 0 }} />
                    <span>Mujeres</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${generosSel.includes('sin_genero') ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => alternarChip(generosSel, setGenerosSel, 'sin_genero')}
                  >
                    <input type="checkbox" checked={generosSel.includes('sin_genero')} readOnly style={{ margin: 0 }} />
                    <span>No especificado</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pestaña: CARGA FAMILIAR */}
          {seccionFiltro === 'familia' && (
            <div>
              <span className="muted" style={{ fontSize: '.76rem', display: 'block', marginBottom: '.3rem' }}>
                Filtro por Paternidad / Hijos:
              </span>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${hijosFiltro === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setHijosFiltro('todos')}
                >
                  🌐 Todos (con y sin hijos)
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${hijosFiltro === 'si' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setHijosFiltro('si')}
                >
                  👶 Solo con hijos a cargo ({resultado.resumen.conHijos})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${hijosFiltro === 'no' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setHijosFiltro('no')}
                >
                  👤 Solo sin hijos ({resultado.resumen.sinHijos})
                </button>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '.3rem .6rem', maxHeight: '140px', overflowY: 'auto' }}>
            {CAMPOS_REPORTE_PERSONAL.map((col) => {
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
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem', borderBottom: '1px solid var(--border)', paddingBottom: '.5rem' }}>

            {/* Formato: Fichas vs Tabla */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Formato:</span>
              <div style={{ display: 'inline-flex', gap: '.35rem' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${formatoPresentacion === 'fichas' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.25rem .7rem' }}
                  onClick={() => setFormatoPresentacion('fichas')}
                >
                  <input type="checkbox" checked={formatoPresentacion === 'fichas'} readOnly style={{ margin: 0 }} />
                  <span>🏢 Fichas Ejecutivas</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${formatoPresentacion === 'tabla' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.25rem .7rem' }}
                  onClick={() => setFormatoPresentacion('tabla')}
                >
                  <input type="checkbox" checked={formatoPresentacion === 'tabla'} readOnly style={{ margin: 0 }} />
                  <span>📊 Tabla Tabular</span>
                </button>
              </div>
            </div>

            {/* Criterio de Orden */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.8rem' }}>
              <span style={{ fontWeight: 600 }}>Ordenar por:</span>
              <select
                className="input input-xs"
                value={orden}
                onChange={(e) => setOrden(e.target.value as CriterioOrdenPersonal)}
                style={{ width: 'auto' }}
              >
                <option value="sueldo_desc">💵 Sueldo Base (Mayor a menor)</option>
                <option value="sueldo_asc">💵 Sueldo Base (Menor a mayor)</option>
                <option value="alfabetico">🔤 Apellidos y Nombres (A-Z)</option>
                <option value="antiguedad_desc">⏳ Mayor Antigüedad</option>
                <option value="cedula">🆔 Cédula de Identidad</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem' }}>
            {/* Orientación */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Orientación PDF:</span>
              <button
                type="button"
                className={`btn btn-xs ${orientacion === 'vertical' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setOrientacion('vertical')}
              >
                Vertical (Carta)
              </button>
              <button
                type="button"
                className={`btn btn-xs ${orientacion === 'horizontal' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setOrientacion('horizontal')}
              >
                Horizontal (Apaisado)
              </button>
            </div>

            {/* Incluir resumen */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.78rem' }}>
              <input
                type="checkbox"
                checked={incluirResumen}
                onChange={(e) => setIncluirResumen(e.target.checked)}
              />
              <span>Incluir resumen en tarjetas (KPIs) en cabecera</span>
            </label>
          </div>
        </div>

        {/* 6. SECCIÓN: Banner de KPIs en Vivo (100% dinámico según checks) */}
        {incluirResumen && (() => {
          const kpisDinamicos = calcularKpisCabeceraDinamicos(filasFiltradas, resultado.resumen, marcados, ambito);
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
              {kpisDinamicos.map((kpi) => (
                <div
                  key={kpi.id}
                  style={{
                    background: 'var(--surface-2, #182230)',
                    border: '1px solid var(--border)',
                    borderTop: `3px solid ${kpi.colorHex}`,
                    borderRadius: '6px',
                    padding: '.5rem .7rem',
                  }}
                >
                  <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600 }}>{kpi.titulo}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: kpi.colorHex }}>
                    {kpi.valor}
                  </div>
                  <div style={{ fontSize: '.68rem', color: '#64748b' }}>
                    {kpi.sub}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* 7. SECCIÓN: Vista Previa en Vivo (Live Preview) */}
        <div style={{ background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontSize: '.84rem', fontWeight: 600 }}>👁️ Vista Previa en Vivo</span>
              <span className="badge badge-sm">{filasParaPreview.length} registros</span>
            </div>
            <input
              type="search"
              placeholder="Buscar en vista previa (nombre, cédula, cargo)…"
              className="input input-xs"
              value={busquedaPrevia}
              onChange={(e) => setBusquedaPrevia(e.target.value)}
              style={{ width: '260px' }}
            />
          </div>

          <div style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '.2rem' }}>
            {filasParaPreview.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '.84rem' }}>
                No hay personas que coincidan con los filtros seleccionados.
              </div>
            ) : formatoPresentacion === 'fichas' ? (
              /* RENDERIZADO EN FICHAS EJECUTIVAS (100% dinámico según checks) */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '.6rem' }}>
                {filasParaPreview.map((f) => {
                  const metricas = obtenerMetricasFichaPersonal(f, marcados);
                  return (
                    <div
                      key={f.id}
                      style={{
                        background: 'var(--surface-1, #0f172a)',
                        border: '1px solid var(--border)',
                        borderLeft: '4px solid #ff8a00',
                        borderRadius: '6px',
                        padding: '.6rem .75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '.4rem',
                      }}
                    >
                      {/* Cabecera de la ficha */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.4rem' }}>
                        <div>
                          <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text, #f1f5f9)' }}>
                            {f.nombre_completo}
                          </div>
                          {(() => {
                            const partes: string[] = [];
                            if (marcados.includes('ficha_nro') && f.ficha_nro) partes.push(`Ficha ${f.ficha_nro}`);
                            if (marcados.includes('cedula')) partes.push(f.cedula || 'Sin cédula');
                            if (marcados.includes('cargo')) partes.push(f.cargo || 'Sin cargo');
                            if (marcados.includes('departamento')) partes.push(f.departamento || 'Sin dpto.');
                            if (partes.length === 0 && marcados.includes('fecha_ingreso') && f.fecha_ingreso) {
                              partes.push(`Ingreso: ${f.fecha_ingreso}`);
                            }
                            return (
                              <div style={{ fontSize: '.72rem', color: '#94a3b8', minHeight: '1.1rem' }}>
                                {partes.length > 0 ? partes.join(' · ') : <span style={{ opacity: 0.5 }}>—</span>}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                          {marcados.includes('empresa') && (
                            <span
                              style={{
                                fontSize: '.64rem',
                                fontWeight: 600,
                                padding: '.12rem .4rem',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: '#cbd5e1',
                              }}
                            >
                              {f.empresa_nombre || f.empresa}
                            </span>
                          )}
                          {marcados.includes('estado_texto') && (
                            <span
                              style={{
                                fontSize: '.66rem',
                                fontWeight: 700,
                                padding: '.15rem .45rem',
                                borderRadius: '4px',
                                background: f.activo ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: f.activo ? '#22c55e' : '#ef4444',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {f.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Métricas dinámicas */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, metricas.length)}, 1fr)`, gap: '.4rem', borderTop: '1px solid var(--border)', paddingTop: '.4rem', marginTop: '.2rem' }}>
                        {metricas.map((m) => (
                          <div key={m.clave}>
                            <div style={{ fontSize: '.6rem', color: '#64748b', fontWeight: 600 }}>{m.etiqueta}</div>
                            <div style={{ fontSize: '.84rem', fontWeight: 700, color: m.colorHex }}>{m.valor}</div>
                            {m.sub && <div style={{ fontSize: '.62rem', color: '#94a3b8' }}>{m.sub}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* RENDERIZADO EN TABLA TABULAR (100% dinámico según checks) */
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3, #334155)', color: '#fff', textAlign: 'left' }}>
                    {marcados.map((cKey) => {
                      const col = CAMPOS_REPORTE_PERSONAL.find((x) => x.clave === cKey);
                      return (
                        <th key={cKey} style={{ padding: '.45rem .6rem', borderBottom: '2px solid #ff8a00', textAlign: col?.alineacion || 'left' }}>
                          {col?.etiqueta || cKey}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filasParaPreview.map((f, idx) => (
                    <tr
                      key={f.id}
                      style={{
                        background: idx % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {marcados.map((cKey) => {
                        const colDef = CAMPOS_REPORTE_PERSONAL.find((x) => x.clave === cKey);
                        const val = (f as unknown as Record<string, unknown>)[cKey];
                        let displayVal = '—';
                        if (val != null && val !== '') {
                          if (colDef?.formato === 'moneda') {
                            displayVal = `$ ${Number(val || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          } else if (cKey === 'variacion_sueldo_usd') {
                            const num = Number(val || 0);
                            const pref = num > 0 ? '+$ ' : num < 0 ? '-$ ' : '$ ';
                            displayVal = `${pref}${Math.abs(num).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          } else if (cKey === 'variacion_sueldo_pct') {
                            const num = Number(val);
                            displayVal = `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
                          } else {
                            displayVal = String(val);
                          }
                        }
                        return (
                          <td
                            key={cKey}
                            style={{
                              padding: '.4rem .6rem',
                              textAlign: colDef?.alineacion || 'left',
                              color: val == null || val === '' ? 'var(--text-muted, #64748b)' : 'inherit',
                            }}
                          >
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}
