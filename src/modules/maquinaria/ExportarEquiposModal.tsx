/* ============================================================
   Golden Touch · Control de Maquinaria · Diálogo «Descargar datos de equipos»
   (27/10/2026)

   Casillas para elegir qué datos salen (idéntico a RRHH):
   - Selección de columnas personalizables («Foto del equipo» decide si la
     ficha PDF lleva el recuadro de la foto).
   - Filtros combinados e independientes:
     * Por Empresa / Propietario
     * Por Ubicación / Garaje
     * Por Categoría (maquinaria / vehículos / motos / lanchas)
     * Por Estatus / Condición operativa
   - Agrupación personalizable:
     * 🏢 Por Empresa / Propietario
     * 📍 Por Ubicación / Garaje
     * 📄 Sin agrupar (listado continuo)
   - Exportación fiel a Excel (ExcelJS con estilos) y a PDF (fichas técnicas
     con foto y columnas dinámicas que reflejan las casillas marcadas).
   - Recuerda las preferencias del usuario en localStorage.
   ============================================================ */
import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import {
  CLASES_EQUIPO,
  claseEquipo,
  type ClaseEquipo,
  ESTADOS_EQUIPO,
  estadoEfectivo,
  type EstadoEquipo,
} from './flota';
import {
  CAMPOS_EQUIPO,
  CAMPOS_POR_DEFECTO_EQUIPOS,
  descargarEquiposExcelPersonalizado,
  descargarEquiposPdfPersonalizado,
  orientacionFinal,
  type ContextoEquipoExportar,
  type ModoAgrupacionEquipos,
  type OrientacionHoja,
} from './exportarEquipos';

const CLAVE_LOCAL_CAMPOS = 'maquinaria.exportar-equipos.campos.v2';
const CLAVE_LOCAL_AGRUPACION = 'maquinaria.exportar-equipos.agrupacion.v3';

function seleccionGuardada(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_LOCAL_CAMPOS) ?? 'null');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length) return v;
  } catch { /* usa valor por defecto */ }
  return CAMPOS_POR_DEFECTO_EQUIPOS;
}

function agrupacionGuardada(): ModoAgrupacionEquipos {
  try {
    const v = localStorage.getItem(CLAVE_LOCAL_AGRUPACION);
    if (v === 'empresa' || v === 'ubicacion' || v === 'ninguno') return v;
  } catch { /* usa valor por defecto */ }
  return 'empresa'; // Por defecto agrupado por empresa
}

function guardarPreferencias(claves: string[], modo: ModoAgrupacionEquipos) {
  try {
    localStorage.setItem(CLAVE_LOCAL_CAMPOS, JSON.stringify(claves));
    localStorage.setItem(CLAVE_LOCAL_AGRUPACION, modo);
  } catch { /* no crítico */ }
}

interface Props {
  equipos: MaquinariaEquipo[];
  total: number;
  contextoMap?: Map<string, ContextoEquipoExportar>;
  fotosMap?: Map<string, string>;
  onClose: () => void;
  formatoInicial?: 'pdf' | 'xlsx' | null;
}

export function ExportarEquiposModal({ equipos, total, contextoMap, fotosMap, onClose, formatoInicial }: Props) {
  const [marcados, setMarcados] = useState<string[]>(seleccionGuardada);
  const [modoAgrupacion, setModoAgrupacion] = useState<ModoAgrupacionEquipos>(agrupacionGuardada);
  const [propietarioSel, setPropietarioSel] = useState<string>('todos');
  const [ubicacionSel, setUbicacionSel] = useState<string>('todas');
  const [categoriaSel, setCategoriaSel] = useState<'todas' | ClaseEquipo>('todas');
  const [estatusSel, setEstatusSel] = useState<string>('todos');
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | null>(null);
  const [orientacion, setOrientacion] = useState<OrientacionHoja>('auto');

  // Listas únicas de propietarios y ubicaciones
  const listaPropietarios = useMemo(() => {
    const s = new Set<string>();
    for (const e of equipos) {
      const p = (e.propietario ?? '').trim();
      if (p) s.add(p);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [equipos]);

  const listaUbicaciones = useMemo(() => {
    const s = new Set<string>();
    for (const e of equipos) {
      const u = (e.ubicacion ?? '').trim();
      if (u) s.add(u);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [equipos]);

  // Lista de estatus presentes en los equipos
  const listaEstatusPresentes = useMemo(() => {
    const s = new Set<EstadoEquipo>();
    for (const e of equipos) {
      s.add(estadoEfectivo(e));
    }
    return Array.from(s);
  }, [equipos]);

  // Filtrado reactivo de equipos con todos los criterios combinados
  const equiposAExportar = useMemo(() => {
    return equipos.filter((e) => {
      // 1. Propietario
      if (propietarioSel !== 'todos') {
        const p = (e.propietario ?? '').trim();
        if (propietarioSel === '__sin__') {
          if (p) return false;
        } else if (p.toUpperCase() !== propietarioSel.toUpperCase()) {
          return false;
        }
      }

      // 2. Ubicación / Garaje
      if (ubicacionSel !== 'todas') {
        const u = (e.ubicacion ?? '').trim();
        if (ubicacionSel === '__sin__') {
          if (u) return false;
        } else if (u.toUpperCase() !== ubicacionSel.toUpperCase()) {
          return false;
        }
      }

      // 3. Categoría (clase de equipo)
      if (categoriaSel !== 'todas') {
        if (claseEquipo(e) !== categoriaSel) return false;
      }

      // 4. Estatus / Condición operativa
      if (estatusSel !== 'todos') {
        if (estadoEfectivo(e) !== estatusSel) return false;
      }

      return true;
    });
  }, [equipos, propietarioSel, ubicacionSel, categoriaSel, estatusSel]);

  // Conteos de categorías calculados sobre el subconjunto de los otros filtros
  const conteoCategorias = useMemo(() => {
    const base = equipos.filter((e) => {
      if (propietarioSel !== 'todos') {
        const p = (e.propietario ?? '').trim();
        if (propietarioSel === '__sin__') {
          if (p) return false;
        } else if (p.toUpperCase() !== propietarioSel.toUpperCase()) {
          return false;
        }
      }
      if (ubicacionSel !== 'todas') {
        const u = (e.ubicacion ?? '').trim();
        if (ubicacionSel === '__sin__') {
          if (u) return false;
        } else if (u.toUpperCase() !== ubicacionSel.toUpperCase()) {
          return false;
        }
      }
      if (estatusSel !== 'todos') {
        if (estadoEfectivo(e) !== estatusSel) return false;
      }
      return true;
    });

    const m = new Map<ClaseEquipo, number>();
    for (const e of base) {
      const c = claseEquipo(e);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return { mapa: m, total: base.length };
  }, [equipos, propietarioSel, ubicacionSel, estatusSel]);

  const categoriaLabel = categoriaSel === 'todas' ? null : (CLASES_EQUIPO.find((c) => c.id === categoriaSel)?.label ?? null);
  const propietarioLabel = propietarioSel === 'todos' ? null : propietarioSel === '__sin__' ? 'Sin propietario' : propietarioSel;
  const ubicacionLabel = ubicacionSel === 'todas' ? null : ubicacionSel === '__sin__' ? 'Sin ubicación' : ubicacionSel;
  const estatusLabel = estatusSel === 'todos' ? null : (ESTADOS_EQUIPO[estatusSel as EstadoEquipo]?.label ?? estatusSel);

  const hayFiltrosActivos = propietarioSel !== 'todos' || ubicacionSel !== 'todas' || categoriaSel !== 'todas' || estatusSel !== 'todos';

  const resetearFiltros = () => {
    setPropietarioSel('todos');
    setUbicacionSel('todas');
    setCategoriaSel('todas');
    setEstatusSel('todos');
  };

  const alternar = (clave: string) =>
    setMarcados((m) => (m.includes(clave) ? m.filter((x) => x !== clave) : [...m, clave]));

  async function descargar(formato: 'xlsx' | 'pdf') {
    setOcupado(formato);
    try {
      guardarPreferencias(marcados, modoAgrupacion);
      if (formato === 'xlsx') {
        await descargarEquiposExcelPersonalizado(
          equiposAExportar,
          marcados,
          modoAgrupacion,
          contextoMap,
          orientacion,
          categoriaLabel,
        );
      } else {
        await descargarEquiposPdfPersonalizado(
          equiposAExportar,
          marcados,
          modoAgrupacion,
          contextoMap,
          orientacion,
          fotosMap,
          categoriaLabel,
        );
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setOcupado(null);
    }
  }

  const nada = marcados.length === 0;

  return (
    <Modal
      title="⬇ Descargar datos de maquinaria y vehículos"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>Cerrar</button>
          <button
            className={`btn ${formatoInicial === 'xlsx' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => void descargar('xlsx')}
            disabled={nada || !!ocupado || !equiposAExportar.length}
          >
            {ocupado === 'xlsx' ? 'Generando…' : '📊 Excel'}
          </button>
          <button
            className={`btn ${formatoInicial !== 'xlsx' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => void descargar('pdf')}
            disabled={nada || !!ocupado || !equiposAExportar.length}
          >
            {ocupado === 'pdf' ? 'Generando…' : '📄 PDF (imprimir)'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.6rem' }}>
        <p className="muted" style={{ fontSize: '.84rem', margin: 0 }}>
          Se exportarán <strong style={{ color: 'var(--primary, #f97316)' }}>{equiposAExportar.length}</strong> de {total || equipos.length} equipo(s) disponible(s)
          {hayFiltrosActivos ? (
            <> ({[categoriaLabel, propietarioLabel, ubicacionLabel, estatusLabel].filter(Boolean).join(' · ')})</>
          ) : null}.
        </p>
        {hayFiltrosActivos && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '.76rem', padding: '.2rem .5rem', height: 'auto' }}
            onClick={resetearFiltros}
          >
            ↺ Restablecer filtros
          </button>
        )}
      </div>

      {/* Panel de Filtros Combinados */}
      <div style={{
        background: 'var(--surface-2, #182230)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '.65rem .75rem',
        marginBottom: '.5rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '.6rem .8rem',
      }}>
        {/* Filtro: Propietario / Empresa */}
        <div>
          <label htmlFor="exp-filtro-propietario" style={{ fontSize: '.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.3rem', marginBottom: '.25rem', color: 'var(--text, #f1f5f9)' }}>
            🏢 Empresa / Propietario:
          </label>
          <select
            id="exp-filtro-propietario"
            className="select"
            style={{ width: '100%', fontSize: '.82rem', padding: '.3rem .55rem' }}
            value={propietarioSel}
            onChange={(e) => setPropietarioSel(e.target.value)}
          >
            <option value="todos">Todos los propietarios ({equipos.length})</option>
            {listaPropietarios.map((p) => {
              const cant = equipos.filter((e) => (e.propietario ?? '').trim().toUpperCase() === p.toUpperCase()).length;
              return (
                <option key={p} value={p}>
                  {p} ({cant})
                </option>
              );
            })}
            {equipos.some((e) => !(e.propietario ?? '').trim()) && (
              <option value="__sin__">Sin propietario asignado</option>
            )}
          </select>
        </div>

        {/* Filtro: Ubicación / Garaje */}
        <div>
          <label htmlFor="exp-filtro-ubicacion" style={{ fontSize: '.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.3rem', marginBottom: '.25rem', color: 'var(--text, #f1f5f9)' }}>
            📍 Ubicación / Garaje:
          </label>
          <select
            id="exp-filtro-ubicacion"
            className="select"
            style={{ width: '100%', fontSize: '.82rem', padding: '.3rem .55rem' }}
            value={ubicacionSel}
            onChange={(e) => setUbicacionSel(e.target.value)}
          >
            <option value="todas">Todas las ubicaciones ({equipos.length})</option>
            {listaUbicaciones.map((u) => {
              const cant = equipos.filter((e) => (e.ubicacion ?? '').trim().toUpperCase() === u.toUpperCase()).length;
              return (
                <option key={u} value={u}>
                  {u} ({cant})
                </option>
              );
            })}
            {equipos.some((e) => !(e.ubicacion ?? '').trim()) && (
              <option value="__sin__">Sin ubicación asignada</option>
            )}
          </select>
        </div>

        {/* Filtro: Estatus / Condición operativa */}
        <div>
          <label htmlFor="exp-filtro-estatus" style={{ fontSize: '.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.3rem', marginBottom: '.25rem', color: 'var(--text, #f1f5f9)' }}>
            🚦 Estatus / Condición:
          </label>
          <select
            id="exp-filtro-estatus"
            className="select"
            style={{ width: '100%', fontSize: '.82rem', padding: '.3rem .55rem' }}
            value={estatusSel}
            onChange={(e) => setEstatusSel(e.target.value)}
          >
            <option value="todos">Todos los estatus ({equipos.length})</option>
            {listaEstatusPresentes.map((st) => {
              const infoSt = ESTADOS_EQUIPO[st];
              const cant = equipos.filter((e) => estadoEfectivo(e) === st).length;
              return (
                <option key={st} value={st}>
                  {infoSt?.icon ?? '•'} {infoSt?.label ?? st} ({cant})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Categoría a exportar (pills combinadas con los otros filtros) */}
      <div style={{
        background: 'var(--surface-2, #182230)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '.6rem .75rem',
        marginBottom: '.5rem',
      }}>
        <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: '.35rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          🚜 Categoría a exportar:
        </div>
        <div className="flo-pills solido" role="group" aria-label="Categoría a exportar" style={{ marginBottom: 0 }}>
          <button type="button" className="flo-pill" aria-pressed={categoriaSel === 'todas'} onClick={() => setCategoriaSel('todas')}>
            Todas<span className="n">{conteoCategorias.total}</span>
          </button>
          {CLASES_EQUIPO.map((c) => (
            <button key={c.id} type="button" className="flo-pill" aria-pressed={categoriaSel === c.id} onClick={() => setCategoriaSel(c.id)}>
              {c.icon} {c.label}<span className="n">{conteoCategorias.mapa.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Agrupación: Empresa vs Ubicación vs Sin agrupar */}
      <div style={{
        background: 'var(--surface-2, #182230)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '.6rem .75rem',
        marginBottom: '.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
          <span style={{ fontSize: '.84rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.4rem', color: 'var(--text, #f1f5f9)' }}>
            📁 Agrupar equipos por:
          </span>
          <span className="muted" style={{ fontSize: '.76rem' }}>
            {modoAgrupacion === 'empresa'
              ? 'Subtotales y secciones separadas por empresa'
              : modoAgrupacion === 'ubicacion'
              ? 'Subtotales y secciones separadas por ubicación'
              : 'Listado corrido continuo numerado'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${modoAgrupacion === 'empresa' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.82rem', padding: '.25rem .65rem' }}
            onClick={() => setModoAgrupacion('empresa')}
          >
            🏢 Empresa / Propietario
          </button>
          <button
            type="button"
            className={`btn btn-sm ${modoAgrupacion === 'ubicacion' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.82rem', padding: '.25rem .65rem' }}
            onClick={() => setModoAgrupacion('ubicacion')}
          >
            📍 Ubicación / Garaje
          </button>
          <button
            type="button"
            className={`btn btn-sm ${modoAgrupacion === 'ninguno' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '.82rem', padding: '.25rem .65rem' }}
            onClick={() => setModoAgrupacion('ninguno')}
          >
            📄 Sin agrupar (continuo)
          </button>
        </div>
      </div>

      {/* Selector de columnas a exportar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <span style={{ fontSize: '.84rem', fontWeight: 600 }}>📋 Datos que quieres que salgan:</span>
        <div style={{ display: 'flex', gap: '.3rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '.76rem', padding: '.2rem .5rem', height: 'auto' }}
            onClick={() => setMarcados(CAMPOS_POR_DEFECTO_EQUIPOS)}
          >
            Solo principales
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '.76rem', padding: '.2rem .5rem', height: 'auto' }}
            onClick={() => setMarcados(CAMPOS_EQUIPO.map((c) => c.clave))}
          >
            Marcar todos
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '.76rem', padding: '.2rem .5rem', height: 'auto' }}
            onClick={() => setMarcados([])}
          >
            Ninguno
          </button>
        </div>
      </div>

      {/* Grid de casillas de verificación */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '.3rem .8rem' }}>
        {CAMPOS_EQUIPO.map((c) => (
          <label key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.84rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              id={`exp-equipo-${c.clave}`}
              checked={marcados.includes(c.clave)}
              onChange={() => alternar(c.clave)}
            />
            {c.etiqueta}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginTop: '.85rem' }}>
        <label htmlFor="exp-equipo-orientacion" style={{ fontSize: '.84rem', fontWeight: 600 }}>Hoja</label>
        <select
          id="exp-equipo-orientacion"
          className="input"
          style={{ width: 'auto', fontSize: '.82rem', padding: '.25rem .5rem' }}
          value={orientacion}
          onChange={(e) => setOrientacion(e.target.value as OrientacionHoja)}
        >
          <option value="auto">Automática (según las columnas)</option>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
        <small className="muted" style={{ fontSize: '.76rem' }}>
          Sale en {orientacionFinal(marcados, orientacion) === 'portrait' ? 'vertical' : 'horizontal'}. Al imprimir, elige la misma orientación.
        </small>
      </div>

      {nada && <p className="muted" style={{ fontSize: '.78rem', color: 'var(--warning, #f59e0b)', marginTop: '.4rem' }}>Marca al menos un dato.</p>}
    </Modal>
  );
}
export default ExportarEquiposModal;
