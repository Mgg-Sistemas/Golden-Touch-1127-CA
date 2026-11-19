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
   - Resumen de flota en tarjetas (check arriba del todo de la ventana): sale
     como lo primero del PDF (parte de arriba de la página 1) y como hoja
     «Resumen» del Excel, con una tarjeta por grupo (tipo de equipo, marca,
     apartado, estado o empresa) y su cantidad; «Solo el resumen» imprime
     únicamente esa página.
   - Recuerda las preferencias del usuario en localStorage.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { textoReporteFlotaWhatsapp } from './maquinariaWhatsapp';
import { toast } from '@/shared/ui/Toast';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import {
  claseEquipo,
  listarApartados,
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
  normalizarUbicacion,
  UBICACION_UNIFICADA_GT,
  type AgrupacionResumen,
  type ContextoEquipoExportar,
  type ModoAgrupacionEquipos,
  type OpcionesResumenFlota,
  type OrientacionHoja,
} from './exportarEquipos';

const CLAVE_LOCAL_CAMPOS = 'maquinaria.exportar-equipos.campos.v2';
const CLAVE_LOCAL_AGRUPACION = 'maquinaria.exportar-equipos.agrupacion.v3';
const CLAVE_LOCAL_RESUMEN = 'maquinaria.exportar-equipos.resumen.v1';

/** Cómo se agrupan los conteos del resumen en tarjetas (una tarjeta por grupo). */
const OPCIONES_RESUMEN: { id: AgrupacionResumen; icon: string; label: string; etiqueta: string }[] = [
  { id: 'tipo', icon: '🚜', label: 'Tipo de equipo', etiqueta: 'tipo de equipo' },
  { id: 'marca', icon: '🏷️', label: 'Marca', etiqueta: 'marca' },
  { id: 'apartado', icon: '🗂️', label: 'Apartado', etiqueta: 'apartado' },
  { id: 'estado', icon: '🔧', label: 'Estado', etiqueta: 'estado' },
  { id: 'propietario', icon: '🏢', label: 'Empresa / Propietario', etiqueta: 'empresa / propietario' },
];

const RESUMEN_POR_DEFECTO: OpcionesResumenFlota = { activo: false, agruparPor: 'tipo', soloResumen: false };

function esAgrupacionResumen(v: unknown): v is AgrupacionResumen {
  return typeof v === 'string' && OPCIONES_RESUMEN.some((o) => o.id === v);
}

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

/** Lee `{ activo, agruparPor, soloResumen }`; cualquier basura guardada vuelve al valor por defecto. */
function resumenGuardado(): OpcionesResumenFlota {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLAVE_LOCAL_RESUMEN) ?? 'null');
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return {
        activo: o.activo === true,
        agruparPor: esAgrupacionResumen(o.agruparPor) ? o.agruparPor : RESUMEN_POR_DEFECTO.agruparPor,
        soloResumen: o.soloResumen === true,
      };
    }
  } catch { /* usa valor por defecto */ }
  return RESUMEN_POR_DEFECTO;
}

function guardarPreferencias(claves: string[], modo: ModoAgrupacionEquipos, resumen: OpcionesResumenFlota) {
  try {
    localStorage.setItem(CLAVE_LOCAL_CAMPOS, JSON.stringify(claves));
    localStorage.setItem(CLAVE_LOCAL_AGRUPACION, modo);
    localStorage.setItem(CLAVE_LOCAL_RESUMEN, JSON.stringify({
      activo: resumen.activo,
      agruparPor: resumen.agruparPor,
      soloResumen: resumen.soloResumen === true,
    }));
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

/* ───────────── Componente Buscable con lista desplegable y casillas ───────────── */
interface OpcionBuscable {
  value: string;
  label: string;
  cant?: number;
  destacado?: boolean;
}

function FiltroBuscableDesplegable({
  id,
  label,
  icono,
  opciones,
  seleccionados,
  onChange,
  textoTodos,
  totalCant,
}: {
  id: string;
  label: string;
  icono: string;
  opciones: OpcionBuscable[];
  seleccionados: string[];
  onChange: (nuevos: string[]) => void;
  textoTodos: string;
  totalCant: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickAfuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda('');
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAbierto(false);
        setBusqueda('');
      }
    }
    if (abierto) {
      document.addEventListener('mousedown', handleClickAfuera);
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => inputRef.current?.focus(), 40);
      return () => {
        document.removeEventListener('mousedown', handleClickAfuera);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [abierto]);

  const marcados = useMemo(() => seleccionados.filter((x) => x !== '__ninguna__'), [seleccionados]);
  const estaActivo = seleccionados.length > 0;
  const esNinguno = seleccionados.includes('__ninguna__') && seleccionados.length === 1;

  const textoResumen = useMemo(() => {
    if (!estaActivo) return `${textoTodos} (${totalCant})`;
    if (esNinguno) return 'Ninguno seleccionado (0)';
    if (marcados.length === 1) {
      const op = opciones.find((o) => o.value === marcados[0]);
      if (op) return `${op.label}${op.cant != null ? ` (${op.cant})` : ''}`;
      return marcados[0];
    }
    if (marcados.length === 2) {
      const ops = marcados.map((m) => {
        const op = opciones.find((o) => o.value === m);
        return op?.label ?? m;
      });
      const suma = marcados.reduce((acc, m) => acc + (opciones.find((o) => o.value === m)?.cant ?? 0), 0);
      return `${ops.join(', ')} (${suma})`;
    }
    const suma = marcados.reduce((acc, m) => acc + (opciones.find((o) => o.value === m)?.cant ?? 0), 0);
    return `${marcados.length} seleccionados (${suma})`;
  }, [estaActivo, esNinguno, marcados, textoTodos, totalCant, opciones]);

  const normB = (s: string | null | undefined) =>
    (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const opcionesVisibles = useMemo(() => {
    const q = normB(busqueda);
    if (!q) return opciones;
    return opciones.filter((o) => normB(o.label).includes(q) || normB(o.value).includes(q));
  }, [opciones, busqueda]);

  function alternarOpcion(val: string) {
    if (!estaActivo) {
      onChange([val]);
      return;
    }
    if (marcados.includes(val)) {
      const res = marcados.filter((x) => x !== val);
      onChange(res.length === 0 ? ['__ninguna__'] : res);
    } else {
      const res = [...marcados, val];
      if (opciones.length > 0 && opciones.every((o) => res.includes(o.value))) {
        onChange([]);
      } else {
        onChange(res);
      }
    }
  }

  function marcarCoincidentes() {
    const vals = opcionesVisibles.map((o) => o.value);
    if (!vals.length) return;
    if (!estaActivo) {
      onChange(vals);
    } else {
      const union = Array.from(new Set([...marcados, ...vals]));
      if (opciones.length > 0 && opciones.every((o) => union.includes(o.value))) {
        onChange([]);
      } else {
        onChange(union);
      }
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label
        htmlFor={id}
        style={{
          fontSize: '.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '.25rem',
          color: 'var(--text, #f1f5f9)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          {icono} {label}:
        </span>
        {estaActivo && (
          <span
            className="badge"
            style={{
              fontSize: '.7rem',
              padding: '1px 6px',
              background: 'var(--primary, #f97316)',
              color: '#1a0e00',
              fontWeight: 700,
            }}
          >
            {esNinguno ? '0' : marcados.length} sel.
          </span>
        )}
      </label>

      <button
        id={id}
        type="button"
        className="select"
        style={{
          width: '100%',
          fontSize: '.82rem',
          padding: '.35rem .55rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          borderColor: estaActivo ? 'var(--primary, #f97316)' : undefined,
          boxShadow: estaActivo ? '0 0 0 1px var(--primary, #f97316)' : undefined,
        }}
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        title={textoResumen}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: estaActivo ? '78%' : '88%' }}>
          {textoResumen}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', flexShrink: 0 }}>
          {estaActivo && (
            <span
              role="button"
              tabIndex={0}
              title="Restablecer a todos"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                color: 'var(--text, #f1f5f9)',
                fontSize: '.68rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✕
            </span>
          )}
          <span style={{ fontSize: '.7rem', opacity: 0.7 }}>
            {abierto ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Menú flotante con buscador y casillas */}
      {abierto && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            minWidth: '260px',
            zIndex: 110,
            marginTop: '4px',
            background: 'var(--surface-1, #0f172a)',
            border: '1px solid var(--border-strong, #334155)',
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.75)',
            padding: '.55rem .6rem',
            maxHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Input de Búsqueda rápida */}
          <div style={{ position: 'relative', marginBottom: '.4rem' }}>
            <input
              ref={inputRef}
              type="text"
              className="input"
              style={{
                width: '100%',
                fontSize: '.82rem',
                padding: '.3rem 1.6rem .3rem .55rem',
                background: 'rgba(15, 23, 42, 0.9)',
                borderColor: busqueda ? 'var(--primary, #f97316)' : undefined,
              }}
              placeholder={`🔍 Buscar ${label.toLowerCase()}…`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted, #94a3b8)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  fontSize: '.75rem',
                }}
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {/* Barra rápida de acciones: Todos / Ninguno / Marcar coincidentes */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '.35rem',
            marginBottom: '.35rem',
            borderBottom: '1px solid var(--border, #334155)',
            gap: '.3rem',
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '.72rem', padding: '.15rem .45rem', height: 'auto' }}
                onClick={() => onChange([])}
              >
                ✓ Todos
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '.72rem', padding: '.15rem .45rem', height: 'auto' }}
                onClick={() => onChange(['__ninguna__'])}
              >
                ✕ Ninguno
              </button>
            </div>
            {busqueda.trim() && opcionesVisibles.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: '.72rem', padding: '.15rem .45rem', height: 'auto', color: 'var(--primary, #f97316)', fontWeight: 600 }}
                onClick={marcarCoincidentes}
              >
                ✓ Marcar {opcionesVisibles.length} coincidentes
              </button>
            )}
          </div>

          {/* Lista de opciones con scroll */}
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: '220px', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
            {/* Fila: Todos */}
            {!busqueda && (
              <>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '.32rem .45rem',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    background: !estaActivo ? 'rgba(249, 115, 22, 0.12)' : 'transparent',
                    fontSize: '.82rem',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <input
                      type="checkbox"
                      checked={!estaActivo}
                      onChange={() => onChange([])}
                    />
                    <strong style={{ color: !estaActivo ? 'var(--primary, #f97316)' : 'inherit' }}>
                      {textoTodos}
                    </strong>
                  </span>
                  <span className="badge" style={{ fontSize: '.7rem', padding: '1px 6px' }}>
                    {totalCant}
                  </span>
                </label>
                <div style={{ borderTop: '1px dashed var(--border, #334155)', margin: '.25rem 0' }} />
              </>
            )}

            {/* Opciones individuales */}
            {opcionesVisibles.length === 0 ? (
              <div className="muted" style={{ fontSize: '.78rem', padding: '.6rem .45rem', textAlign: 'center' }}>
                Sin resultados para «{busqueda}»
              </div>
            ) : (
              opcionesVisibles.map((op) => {
                const checked = !estaActivo || marcados.includes(op.value);
                return (
                  <label
                    key={op.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '.5rem',
                      padding: '.32rem .45rem',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      background: checked && estaActivo ? 'rgba(249, 115, 22, 0.10)' : 'transparent',
                      fontSize: '.8rem',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => alternarOpcion(op.value)}
                      />
                      <span style={{
                        fontWeight: op.destacado ? 700 : checked && estaActivo ? 600 : 400,
                        color: op.destacado ? 'var(--primary, #f97316)' : 'inherit',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {op.label}
                      </span>
                    </span>
                    {op.cant != null && (
                      <span className="badge" style={{ fontSize: '.7rem', padding: '1px 6px', flexShrink: 0 }}>
                        {op.cant}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          {/* Pie del desplegable: Conteo y botón Listo */}
          <div style={{
            marginTop: '.45rem',
            paddingTop: '.4rem',
            borderTop: '1px solid var(--border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span className="muted" style={{ fontSize: '.72rem' }}>
              {!estaActivo
                ? 'Todos activos'
                : esNinguno
                ? '0 seleccionados'
                : `${marcados.length} de ${opciones.length} sel.`}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ fontSize: '.74rem', padding: '.2rem .65rem' }}
              onClick={() => {
                setAbierto(false);
                setBusqueda('');
              }}
            >
              Listo ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExportarEquiposModal({ equipos, total, contextoMap, fotosMap, onClose, formatoInicial }: Props) {
  const [marcados, setMarcados] = useState<string[]>(seleccionGuardada);
  const [modoAgrupacion, setModoAgrupacion] = useState<ModoAgrupacionEquipos>(agrupacionGuardada);
  const [propietariosSel, setPropietariosSel] = useState<string[]>([]);
  const [ubicacionesSel, setUbicacionesSel] = useState<string[]>([]);
  const [categoriaSel, setCategoriaSel] = useState<'todas' | ClaseEquipo>('todas');
  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [estatusSel, setEstatusSel] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<'xlsx' | 'pdf' | null>(null);
  const [orientacion, setOrientacion] = useState<OrientacionHoja>('auto');
  const [verWhatsapp, setVerWhatsapp] = useState(false);
  // Resumen de flota en tarjetas (sale como lo primero del PDF / hoja «Resumen» del Excel)
  const [resumenActivo, setResumenActivo] = useState<boolean>(() => resumenGuardado().activo);
  const [resumenAgrupar, setResumenAgrupar] = useState<AgrupacionResumen>(() => resumenGuardado().agruparPor);
  const [resumenSolo, setResumenSolo] = useState<boolean>(() => resumenGuardado().soloResumen === true);

  // Listas únicas de propietarios y ubicaciones normalizadas
  const listaPropietarios = useMemo(() => {
    const s = new Set<string>();
    for (const e of equipos) {
      const p = (e.propietario ?? '').trim();
      if (p) s.add(p);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }, [equipos]);

  // Ubicaciones normalizadas (unifica Peramanal y Golden Touch en MINA GOLDEN TOUCH / PERAMANAL)
  const listaUbicaciones = useMemo(() => {
    const s = new Set<string>();
    for (const e of equipos) {
      const u = normalizarUbicacion(e.ubicacion);
      if (u) s.add(u);
    }
    return Array.from(s).sort((a, b) => {
      if (a === UBICACION_UNIFICADA_GT) return -1;
      if (b === UBICACION_UNIFICADA_GT) return 1;
      return a.localeCompare(b, 'es');
    });
  }, [equipos]);

  // Conteos por ubicación normalizada
  const conteosUbicaciones = useMemo(() => {
    const map = new Map<string, number>();
    let sinUbic = 0;
    for (const e of equipos) {
      const u = normalizarUbicacion(e.ubicacion);
      if (u) {
        map.set(u, (map.get(u) ?? 0) + 1);
      } else {
        sinUbic++;
      }
    }
    return { map, sinUbic };
  }, [equipos]);

  // Lista de estatus presentes en los equipos
  const listaEstatusPresentes = useMemo(() => {
    const s = new Set<EstadoEquipo>();
    for (const e of equipos) {
      s.add(estadoEfectivo(e));
    }
    return Array.from(s);
  }, [equipos]);

  // Helper de normalización para comparar tipos sin importar acentos ni mayúsculas/minúsculas
  const normTipo = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

  // Lista de tipos de equipos disponibles en el subconjunto filtrado por propietario, ubicación, categoría y estatus
  const infoTipos = useMemo(() => {
    const base = equipos.filter((e) => {
      if (propietariosSel.length > 0) {
        if (propietariosSel.includes('__ninguna__') && propietariosSel.length === 1) return false;
        const p = (e.propietario ?? '').trim();
        if (!p) {
          if (!propietariosSel.includes('__sin__')) return false;
        } else if (!propietariosSel.some((sel) => sel.toUpperCase() === p.toUpperCase())) {
          return false;
        }
      }
      if (ubicacionesSel.length > 0) {
        if (ubicacionesSel.includes('__ninguna__') && ubicacionesSel.length === 1) return false;
        const u = normalizarUbicacion(e.ubicacion);
        if (!u) {
          if (!ubicacionesSel.includes('__sin__')) return false;
        } else if (!ubicacionesSel.includes(u)) {
          return false;
        }
      }
      if (categoriaSel !== 'todas') {
        if (claseEquipo(e) !== categoriaSel) return false;
      }
      if (estatusSel.length > 0) {
        if (estatusSel.includes('__ninguna__') && estatusSel.length === 1) return false;
        if (!estatusSel.includes(estadoEfectivo(e))) return false;
      }
      return true;
    });

    const mapa = new Map<string, { tipoOriginal: string; cant: number }>();
    let sinTipo = 0;
    for (const e of base) {
      const t = (e.tipo ?? '').trim();
      if (!t) {
        sinTipo++;
      } else {
        const k = normTipo(t);
        const item = mapa.get(k);
        if (item) item.cant++;
        else mapa.set(k, { tipoOriginal: t, cant: 1 });
      }
    }
    const lista = Array.from(mapa.values()).sort((a, b) => a.tipoOriginal.localeCompare(b.tipoOriginal, 'es'));
    return { lista, sinTipo, total: base.length };
  }, [equipos, propietariosSel, ubicacionesSel, categoriaSel, estatusSel]);

  // Si algún tipo activo ya no existe en la combinación actual, se limpia
  useEffect(() => {
    if (tiposSel.length > 0) {
      const validos = tiposSel.filter((t) => {
        if (t === '__sin__') return infoTipos.sinTipo > 0;
        if (t === '__ninguna__') return true;
        return infoTipos.lista.some((it) => normTipo(it.tipoOriginal) === normTipo(t));
      });
      if (validos.length !== tiposSel.length) {
        setTiposSel(validos);
      }
    }
  }, [tiposSel, infoTipos]);

  // Opciones formateadas para los 4 buscables
  const opcionesPropietarios = useMemo<OpcionBuscable[]>(() => {
    const lista: OpcionBuscable[] = listaPropietarios.map((p) => {
      const cant = equipos.filter((e) => (e.propietario ?? '').trim().toUpperCase() === p.toUpperCase()).length;
      return { value: p, label: p, cant };
    });
    const sinProp = equipos.filter((e) => !(e.propietario ?? '').trim()).length;
    if (sinProp > 0) {
      lista.push({ value: '__sin__', label: 'Sin propietario asignado', cant: sinProp });
    }
    return lista;
  }, [equipos, listaPropietarios]);

  const opcionesUbicaciones = useMemo<OpcionBuscable[]>(() => {
    const lista: OpcionBuscable[] = listaUbicaciones.map((u) => {
      const cant = conteosUbicaciones.map.get(u) ?? 0;
      const esGT = u === UBICACION_UNIFICADA_GT;
      return { value: u, label: esGT ? `⭐ ${u}` : u, cant, destacado: esGT };
    });
    if (conteosUbicaciones.sinUbic > 0) {
      lista.push({ value: '__sin__', label: 'Sin ubicación asignada', cant: conteosUbicaciones.sinUbic });
    }
    return lista;
  }, [listaUbicaciones, conteosUbicaciones]);

  const opcionesEstatus = useMemo<OpcionBuscable[]>(() => {
    return listaEstatusPresentes.map((st) => {
      const infoSt = ESTADOS_EQUIPO[st];
      const cant = equipos.filter((e) => estadoEfectivo(e) === st).length;
      return { value: st, label: `${infoSt?.icon ?? '•'} ${infoSt?.label ?? st}`, cant };
    });
  }, [equipos, listaEstatusPresentes]);

  const opcionesTipos = useMemo<OpcionBuscable[]>(() => {
    const lista: OpcionBuscable[] = infoTipos.lista.map((t) => ({
      value: t.tipoOriginal,
      label: t.tipoOriginal,
      cant: t.cant,
    }));
    if (infoTipos.sinTipo > 0) {
      lista.push({ value: '__sin__', label: 'Sin tipo especificado', cant: infoTipos.sinTipo });
    }
    return lista;
  }, [infoTipos]);

  // Filtrado reactivo de equipos con todos los criterios combinados
  const equiposAExportar = useMemo(() => {
    return equipos.filter((e) => {
      // 1. Propietarios
      if (propietariosSel.length > 0) {
        if (propietariosSel.includes('__ninguna__') && propietariosSel.length === 1) return false;
        const p = (e.propietario ?? '').trim();
        if (!p) {
          if (!propietariosSel.includes('__sin__')) return false;
        } else if (!propietariosSel.some((sel) => sel.toUpperCase() === p.toUpperCase())) {
          return false;
        }
      }

      // 2. Ubicación / Garaje
      if (ubicacionesSel.length > 0) {
        if (ubicacionesSel.includes('__ninguna__') && ubicacionesSel.length === 1) return false;
        const u = normalizarUbicacion(e.ubicacion);
        if (!u) {
          if (!ubicacionesSel.includes('__sin__')) return false;
        } else if (!ubicacionesSel.includes(u)) {
          return false;
        }
      }

      // 3. Categoría (clase de equipo)
      if (categoriaSel !== 'todas') {
        if (claseEquipo(e) !== categoriaSel) return false;
      }

      // 3b. Tipos de equipo
      if (tiposSel.length > 0) {
        if (tiposSel.includes('__ninguna__') && tiposSel.length === 1) return false;
        const t = (e.tipo ?? '').trim();
        if (!t) {
          if (!tiposSel.includes('__sin__')) return false;
        } else {
          const k = normTipo(t);
          if (!tiposSel.some((sel) => normTipo(sel) === k)) return false;
        }
      }

      // 4. Estatus / Condición operativa
      if (estatusSel.length > 0) {
        if (estatusSel.includes('__ninguna__') && estatusSel.length === 1) return false;
        if (!estatusSel.includes(estadoEfectivo(e))) return false;
      }

      return true;
    });
  }, [equipos, propietariosSel, ubicacionesSel, categoriaSel, tiposSel, estatusSel]);

  // Conteos de categorías calculados sobre el subconjunto de los otros filtros
  const conteoCategorias = useMemo(() => {
    const base = equipos.filter((e) => {
      if (propietariosSel.length > 0) {
        if (propietariosSel.includes('__ninguna__') && propietariosSel.length === 1) return false;
        const p = (e.propietario ?? '').trim();
        if (!p) {
          if (!propietariosSel.includes('__sin__')) return false;
        } else if (!propietariosSel.some((sel) => sel.toUpperCase() === p.toUpperCase())) {
          return false;
        }
      }
      if (ubicacionesSel.length > 0) {
        if (ubicacionesSel.includes('__ninguna__') && ubicacionesSel.length === 1) return false;
        const u = normalizarUbicacion(e.ubicacion);
        if (!u) {
          if (!ubicacionesSel.includes('__sin__')) return false;
        } else if (!ubicacionesSel.includes(u)) {
          return false;
        }
      }
      if (estatusSel.length > 0) {
        if (estatusSel.includes('__ninguna__') && estatusSel.length === 1) return false;
        if (!estatusSel.includes(estadoEfectivo(e))) return false;
      }
      if (tiposSel.length > 0) {
        if (tiposSel.includes('__ninguna__') && tiposSel.length === 1) return false;
        const t = (e.tipo ?? '').trim();
        if (!t) {
          if (!tiposSel.includes('__sin__')) return false;
        } else if (!tiposSel.some((sel) => normTipo(sel) === normTipo(t))) {
          return false;
        }
      }
      return true;
    });

    const m = new Map<ClaseEquipo, number>();
    for (const e of base) {
      const c = claseEquipo(e);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return { mapa: m, total: base.length };
  }, [equipos, propietariosSel, ubicacionesSel, estatusSel, tiposSel]);

  const apartados = useMemo(() => listarApartados(), []);

  const categoriaLabel = categoriaSel === 'todas' ? null : (apartados.find((c) => c.id === categoriaSel)?.label ?? null);
  const tipoLabel = useMemo(() => {
    if (tiposSel.length === 0) return null;
    if (tiposSel.includes('__ninguna__') && tiposSel.length === 1) return 'Ningún tipo';
    const marcados = tiposSel.filter((x) => x !== '__ninguna__');
    if (marcados.length === 1) return marcados[0] === '__sin__' ? 'Sin tipo' : marcados[0];
    if (marcados.length <= 2) return marcados.map((m) => m === '__sin__' ? 'Sin tipo' : m).join(', ');
    return `${marcados.length} tipos (${marcados.slice(0, 2).map((m) => m === '__sin__' ? 'Sin tipo' : m).join(', ')}…)`;
  }, [tiposSel]);

  const propietarioLabel = useMemo(() => {
    if (propietariosSel.length === 0) return null;
    if (propietariosSel.includes('__ninguna__') && propietariosSel.length === 1) return 'Ningún propietario';
    const marcados = propietariosSel.filter((x) => x !== '__ninguna__');
    if (marcados.length === 1) return marcados[0] === '__sin__' ? 'Sin propietario' : marcados[0];
    if (marcados.length <= 2) return marcados.map((m) => m === '__sin__' ? 'Sin prop.' : m).join(', ');
    return `${marcados.length} propietarios`;
  }, [propietariosSel]);

  const ubicacionesLabel = useMemo(() => {
    if (ubicacionesSel.length === 0) return null;
    if (ubicacionesSel.includes('__ninguna__') && ubicacionesSel.length === 1) return 'Ninguna ubicación';
    const marcadas = ubicacionesSel.filter((x) => x !== '__ninguna__');
    if (marcadas.length === 1) return marcadas[0] === '__sin__' ? 'Sin ubicación' : marcadas[0];
    if (marcadas.length <= 2) return marcadas.map((m) => m === '__sin__' ? 'Sin ubic.' : m).join(', ');
    return `${marcadas.length} ubicaciones`;
  }, [ubicacionesSel]);

  const estatusLabel = useMemo(() => {
    if (estatusSel.length === 0) return null;
    if (estatusSel.includes('__ninguna__') && estatusSel.length === 1) return 'Ningún estatus';
    const marcados = estatusSel.filter((x) => x !== '__ninguna__');
    if (marcados.length === 1) return ESTADOS_EQUIPO[marcados[0] as EstadoEquipo]?.label ?? marcados[0];
    return `${marcados.length} estatus`;
  }, [estatusSel]);

  const subtituloExportacion = useMemo(() => {
    if (tipoLabel && categoriaLabel) return `${categoriaLabel} · ${tipoLabel}`;
    if (tipoLabel) return tipoLabel;
    return categoriaLabel;
  }, [tipoLabel, categoriaLabel]);

  const hayFiltrosActivos = propietariosSel.length > 0 || ubicacionesSel.length > 0 || categoriaSel !== 'todas' || tiposSel.length > 0 || estatusSel.length > 0;

  const resetearFiltros = () => {
    setPropietariosSel([]);
    setUbicacionesSel([]);
    setCategoriaSel('todas');
    setTiposSel([]);
    setEstatusSel([]);
  };

  const alternar = (clave: string) =>
    setMarcados((m) => (m.includes(clave) ? m.filter((x) => x !== clave) : [...m, clave]));

  const soloResumen = resumenActivo && resumenSolo;
  const etiquetaResumen = OPCIONES_RESUMEN.find((o) => o.id === resumenAgrupar)?.etiqueta ?? 'grupo';

  async function descargar(formato: 'xlsx' | 'pdf') {
    setOcupado(formato);
    try {
      const resumen: OpcionesResumenFlota = { activo: resumenActivo, agruparPor: resumenAgrupar, soloResumen: resumenSolo };
      guardarPreferencias(marcados, modoAgrupacion, resumen);
      // Con «Solo el resumen» no hace falta marcar datos: se pasa una clave para que el motor no rechace la lista vacía.
      const claves = marcados.length === 0 && soloResumen ? ['equipo'] : marcados;
      if (formato === 'xlsx') {
        await descargarEquiposExcelPersonalizado(
          equiposAExportar,
          claves,
          modoAgrupacion,
          contextoMap,
          orientacion,
          subtituloExportacion,
          resumen,
        );
      } else {
        await descargarEquiposPdfPersonalizado(
          equiposAExportar,
          claves,
          modoAgrupacion,
          contextoMap,
          orientacion,
          fotosMap,
          subtituloExportacion,
          resumen,
        );
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setOcupado(null);
    }
  }

  const textoWsp = useMemo(() => {
    return textoReporteFlotaWhatsapp({
      equipos: equiposAExportar,
      categoriaSel,
      tipoSel: tipoLabel ?? undefined,
      propietarioSel: propietarioLabel ?? undefined,
      ubicacionesSel: ubicacionesSel.length > 0 ? ubicacionesSel : undefined,
      estatusSel: estatusLabel ?? undefined,
      modoAgrupacion,
      contextoMap,
    });
  }, [equiposAExportar, categoriaSel, tipoLabel, propietarioLabel, ubicacionesSel, estatusLabel, modoAgrupacion, contextoMap]);

    // Con «Solo el resumen» se puede descargar aunque no haya datos marcados.
  const nada = marcados.length === 0 && !soloResumen;

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
            type="button"
            className="btn btn-ghost"
            onClick={() => setVerWhatsapp((v) => !v)}
            disabled={!!ocupado || !equiposAExportar.length}
          >
            💬 WhatsApp
          </button>
          <button
            className={`btn ${formatoInicial !== 'xlsx' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => void descargar('pdf')}
            disabled={nada || !!ocupado || !equiposAExportar.length}
          >
            {ocupado === 'pdf' ? 'Generando…' : soloResumen ? '📄 PDF (resumen)' : '📄 PDF (imprimir)'}
          </button>
        </>
      }
    >
      {/* Panel de WhatsApp */}
      {verWhatsapp && (
        <div style={{
          background: 'var(--surface-2, #182230)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '.75rem',
          marginBottom: '.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <span style={{ fontSize: '.86rem', fontWeight: 600 }}>💬 Enviar por WhatsApp — Reporte de Flota</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setVerWhatsapp(false)}>← Volver a opciones</button>
          </div>
          <p className="muted" style={{ fontSize: '.76rem', marginTop: 0, marginBottom: '.5rem' }}>
            Aviso directo para chat: resumen de operatividad y estado de cada equipo con lectura y ubicación.
          </p>
          <CompartirWhatsapp texto={textoWsp} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.6rem' }}>
        <p className="muted" style={{ fontSize: '.84rem', margin: 0 }}>
          Se exportarán <strong style={{ color: 'var(--primary, #f97316)' }}>{equiposAExportar.length}</strong> de {total || equipos.length} equipo(s) disponible(s)
          {hayFiltrosActivos ? (
            <> ({[tipoLabel, categoriaLabel, propietarioLabel, ubicacionesLabel, estatusLabel].filter(Boolean).join(' · ')})</>
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

      {/* Resumen de flota en tarjetas: va arriba del todo; sale como lo primero del PDF (hoja «Resumen» en Excel) */}
      <div style={{
        background: 'var(--surface-2, #182230)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '.6rem .75rem',
        marginBottom: '.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
          <span style={{ fontSize: '.84rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.4rem', color: 'var(--text, #f1f5f9)' }}>
            📊 Resumen en tarjetas
          </span>
          <span className="muted" style={{ fontSize: '.76rem' }}>
            {resumenActivo
              ? `Sale primero: una tarjeta por ${etiquetaResumen} con su cantidad (ej. RETROEXCAVADORA · 5 · CAT 3 · VOLVO 2)`
              : 'Marca el check para añadir una página de resumen con el conteo por grupo'}
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.84rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            id="exp-resumen-activo"
            checked={resumenActivo}
            onChange={(e) => setResumenActivo(e.target.checked)}
          />
          Incluir resumen en tarjetas
        </label>
        {resumenActivo && (
          <div style={{ marginTop: '.5rem', paddingTop: '.5rem', borderTop: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.35rem' }}>Agrupar el resumen por:</div>
            <div className="flo-pills solido" role="group" aria-label="Agrupar el resumen por" style={{ marginBottom: '.5rem', flexWrap: 'wrap' }}>
              {OPCIONES_RESUMEN.map((o) => (
                <button key={o.id} type="button" className="flo-pill" aria-pressed={resumenAgrupar === o.id} onClick={() => setResumenAgrupar(o.id)}>
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.84rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                id="exp-resumen-solo"
                checked={resumenSolo}
                onChange={(e) => setResumenSolo(e.target.checked)}
              />
              Solo el resumen (sin las fichas)
            </label>
          </div>
        )}
      </div>

      {/* Panel de Filtros Combinados (Buscables / Buscadoras con lista desplegable y casillas) */}
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
        <FiltroBuscableDesplegable
          id="exp-filtro-propietario"
          icono="🏢"
          label="Empresa / Propietario"
          textoTodos="Todos los propietarios"
          totalCant={equipos.length}
          opciones={opcionesPropietarios}
          seleccionados={propietariosSel}
          onChange={setPropietariosSel}
        />

        {/* Filtro: Ubicación / Garaje */}
        <FiltroBuscableDesplegable
          id="exp-filtro-ubicacion"
          icono="📍"
          label="Ubicación / Garaje"
          textoTodos="Todas las ubicaciones"
          totalCant={equipos.length}
          opciones={opcionesUbicaciones}
          seleccionados={ubicacionesSel}
          onChange={setUbicacionesSel}
        />

        {/* Filtro: Estatus / Condición operativa */}
        <FiltroBuscableDesplegable
          id="exp-filtro-estatus"
          icono="🚦"
          label="Estatus / Condición"
          textoTodos="Todos los estatus"
          totalCant={equipos.length}
          opciones={opcionesEstatus}
          seleccionados={estatusSel}
          onChange={setEstatusSel}
        />

        {/* Filtro: Tipo de equipo específico (ej. Generador, Generador Eléctrico, etc.) */}
        <FiltroBuscableDesplegable
          id="exp-filtro-tipo"
          icono="⚙️"
          label="Tipo de equipo"
          textoTodos="Todos los tipos"
          totalCant={infoTipos.total}
          opciones={opcionesTipos}
          seleccionados={tiposSel}
          onChange={setTiposSel}
        />
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
          {apartados.map((c) => (
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
