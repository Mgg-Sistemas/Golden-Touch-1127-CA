/* ============================================================
   Golden Touch · Inventario · Diálogo de Reporte y Exportación
   (03/11/2026)

   Modal interactivo moldeable (patrón de ExportarTesoreriaModal):
   - Ámbito: Existencias (foto actual) · Movimientos del período.
   - Dimensión principal (categoría, almacén, sede, unidad, estado, tipo, día,
     mes, detallado).
   - Rango de fechas con atajos (solo afecta al ámbito Movimientos).
   - Filtros por categorías, almacenes, sedes, unidades, estados y tipos; más
     «solo bajo mínimo» y «ocultar sin stock».
   - Columnas por casillas; formato Fichas vs Tabla; orientación; orden; resumen.
   - Vista previa en vivo (KPIs + fichas o tabla) y exportación a PDF/Excel/CSV
     y aviso puntual de WhatsApp.
   Las preferencias se guardan en localStorage (por usuario del navegador).

   El stock y el valor salen SIEMPRE de `existencias` (stock × costo del almacén),
   nunca de producto.stock/producto.precio.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { mensajeError } from '@/shared/lib/errores';
import { supabase } from '@/shared/lib/supabase';
import type { Almacen, Existencia, Producto } from '@/shared/lib/types';
import { listAlmacenes, listExistencias } from './almacenes.repository';
import { cargarResumenInventario, type ResumenInventario } from './resumenInventario';
import {
  CAMPOS_REPORTE_INVENTARIO,
  CAMPOS_POR_DEFECTO_POR_MODO,
  CAMPOS_DETALLE_POR_AMBITO,
  ETIQUETA_TIPO_MOV,
  SIN_SEDE,
  normalizarExistencias,
  normalizarMovimientosInventario,
  filtrarFilasInventario,
  procesarFilasReporteInventario,
  obtenerMetricasFichaInventario,
  type AmbitoInventario,
  type ModoAgrupacionInventario,
  type TipoMovInventario,
  type FilaReporteInventario,
  type MapaProductos,
  type MapaSedes,
  type ProductoInfoInventario,
} from './inventarioMoldeable';
import {
  descargarInventarioCsv,
  descargarInventarioExcel,
  descargarInventarioPdf,
  type MetadatosExportacionInventario,
} from './exportarInventarioMoldeable';
import { textoWhatsappInventario } from './whatsappInventario';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';

const CLAVE_CAMPOS = 'inventario.reporte.campos.v1';
const CLAVE_AMBITO = 'inventario.reporte.ambito.v1';
const CLAVE_AGRUPACION = 'inventario.reporte.agrupacion.v1';
const CLAVE_RESUMEN = 'inventario.reporte.resumen.v1';

const AMBITOS: { id: AmbitoInventario; icon: string; label: string }[] = [
  { id: 'existencias', icon: '📦', label: 'Existencias (hoy)' },
  { id: 'movimientos', icon: '🔄', label: 'Movimientos del período' },
];

const MODOS: { id: ModoAgrupacionInventario; icon: string; label: string; ambito?: AmbitoInventario }[] = [
  { id: 'categoria', icon: '🏷️', label: 'Por Categoría' },
  { id: 'almacen', icon: '🏬', label: 'Por Almacén' },
  { id: 'sede', icon: '📍', label: 'Por Sede' },
  { id: 'unidad', icon: '📏', label: 'Por Unidad' },
  { id: 'estado', icon: '🗂️', label: 'Por Estado', ambito: 'existencias' },
  { id: 'tipo', icon: '🔀', label: 'Por Tipo', ambito: 'movimientos' },
  { id: 'dia', icon: '📆', label: 'Por Día', ambito: 'movimientos' },
  { id: 'mes', icon: '📅', label: 'Por Mes', ambito: 'movimientos' },
  { id: 'detallado', icon: '📋', label: 'Detallado' },
];

const TIPOS_MOV: TipoMovInventario[] = ['entrada', 'salida', 'consumo', 'traslado', 'ajuste'];

function hoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function primerDiaMesActual(): string { return `${hoyVE().slice(0, 7)}-01`; }
function primerDiaMesAnterior(): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) + '-01'; }
function ultimoDiaMesAnterior(): string { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); }
function diasAtras(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function primerDiaAnioActual(): string { return `${new Date().getFullYear()}-01-01`; }

function leerPrefs() {
  let ambito: AmbitoInventario = 'existencias';
  try { const a = localStorage.getItem(CLAVE_AMBITO) as AmbitoInventario; if (a && AMBITOS.some((x) => x.id === a)) ambito = a; } catch { /* default */ }
  let agrupacion: ModoAgrupacionInventario = 'categoria';
  try { const a = localStorage.getItem(CLAVE_AGRUPACION) as ModoAgrupacionInventario; if (a && MODOS.some((x) => x.id === a)) agrupacion = a; } catch { /* default */ }
  let campos = CAMPOS_POR_DEFECTO_POR_MODO[agrupacion];
  try { const c = JSON.parse(localStorage.getItem(CLAVE_CAMPOS) ?? 'null'); if (Array.isArray(c) && c.length) campos = c; } catch { /* default */ }
  const leerBool = (k: string, def: boolean) => { try { const v = localStorage.getItem(k); return v == null ? def : v === 'true'; } catch { return def; } };
  return { ambito, agrupacion, campos, incluirResumen: leerBool(CLAVE_RESUMEN, true) };
}

const fmtUsd = (v: number) => `$ ${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (v: number) => v.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtFechaCorta = (f: string) => { const [y, m, d] = (f || '').split('-'); return y && m && d ? `${d}/${m}` : f; };

interface Props {
  /** Productos del depósito actual (se usa como semilla; el catálogo completo se recarga). */
  productos?: Producto[];
  /** Nombre del depósito (compatibilidad con el llamador; el reporte es global). */
  titulo?: string;
  onClose: () => void;
}

/** Construye el mapa de ficha de producto por id a partir de una lista de productos. */
function mapaDeProductos(prods: Array<Pick<Producto, 'id' | 'sku' | 'nombre' | 'categoria' | 'unidad' | 'stock_min' | 'estado'>>): MapaProductos {
  const m: MapaProductos = new Map();
  for (const p of prods) {
    const info: ProductoInfoInventario = {
      sku: p.sku ?? '—',
      nombre: p.nombre ?? '—',
      categoria: p.categoria ?? 'Sin categoría',
      unidad: p.unidad ?? 'und',
      stock_min: Number(p.stock_min) || 0,
      estado: p.estado ?? 'activo',
    };
    m.set(p.id, info);
  }
  return m;
}

export function ExportInventarioModal({ productos: semilla = [], onClose }: Props) {
  const prefs = useMemo(() => leerPrefs(), []);

  const [desde, setDesde] = useState<string>(primerDiaMesActual());
  const [hasta, setHasta] = useState<string>(hoyVE());
  const [ambito, setAmbito] = useState<AmbitoInventario>(prefs.ambito);
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionInventario>(prefs.agrupacion);
  const [marcados, setMarcados] = useState<string[]>(prefs.campos);
  const [incluirResumen, setIncluirResumen] = useState<boolean>(prefs.incluirResumen);
  const [verWhatsapp, setVerWhatsapp] = useState(false);
  const [orientacion, setOrientacion] = useState<'landscape' | 'portrait'>('landscape');
  const [formatoPresentacion, setFormatoPresentacion] = useState<'fichas' | 'tabla'>('fichas');
  const [ordenarPor, setOrdenarPor] = useState<'valor' | 'stock' | 'nombre' | 'fecha'>('valor');

  // Filtros (vacío = todos)
  const [categoriasSel, setCategoriasSel] = useState<string[]>([]);
  const [almacenesSel, setAlmacenesSel] = useState<string[]>([]);
  const [sedesSel, setSedesSel] = useState<string[]>([]);
  const [unidadesSel, setUnidadesSel] = useState<string[]>([]);
  const [estadosSel, setEstadosSel] = useState<string[]>([]);
  const [tiposSel, setTiposSel] = useState<TipoMovInventario[]>([]);
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
  const [ocultarSinStock, setOcultarSinStock] = useState(true);
  const [seccionFiltro, setSeccionFiltro] = useState<'categorias' | 'almacenes' | 'sedes' | 'unidades' | 'estados' | 'tipos'>('categorias');

  // Datos crudos
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<'pdf' | 'xlsx' | 'csv' | null>(null);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [mapaProd, setMapaProd] = useState<MapaProductos>(() => mapaDeProductos(semilla));
  const [resumenMov, setResumenMov] = useState<ResumenInventario | null>(null);

  // Catálogo completo de productos + estructura de almacenes (una sola vez)
  useEffect(() => {
    let cancelado = false;
    async function cargarBase() {
      try {
        const [alms, exs, prodRes] = await Promise.all([
          listAlmacenes().catch(() => [] as Almacen[]),
          listExistencias().catch(() => [] as Existencia[]),
          supabase.from('productos').select('id, sku, nombre, categoria, unidad, stock_min, estado'),
        ]);
        if (cancelado) return;
        setAlmacenes(alms);
        setExistencias(exs);
        const prods = (prodRes.data ?? []) as Array<Pick<Producto, 'id' | 'sku' | 'nombre' | 'categoria' | 'unidad' | 'stock_min' | 'estado'>>;
        if (prods.length) setMapaProd(mapaDeProductos(prods));
      } catch (e) {
        if (!cancelado) toast(mensajeError(e, 'No se pudieron cargar los datos de inventario'), 'error');
      }
    }
    void cargarBase();
    return () => { cancelado = true; };
  }, []);

  // Carga de movimientos del período (solo en el ámbito Movimientos)
  useEffect(() => {
    let cancelado = false;
    async function cargarMovs() {
      setCargando(true);
      try {
        if (ambito === 'movimientos') {
          const r = await cargarResumenInventario(desde, hasta);
          if (!cancelado) setResumenMov(r);
        }
      } catch (e) {
        if (!cancelado) toast(mensajeError(e, 'No se pudieron cargar los movimientos'), 'error');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    void cargarMovs();
    return () => { cancelado = true; };
  }, [ambito, desde, hasta]);

  // Mapa sede por nombre de almacén
  const sedeMap = useMemo<MapaSedes>(() => {
    const m: MapaSedes = new Map();
    for (const a of almacenes) m.set(a.nombre, a.sede?.trim() || SIN_SEDE);
    return m;
  }, [almacenes]);

  // Normalización a filas de detalle según el ámbito
  const filasDetalle = useMemo<FilaReporteInventario[]>(() => {
    if (ambito === 'existencias') return normalizarExistencias(existencias, mapaProd, sedeMap);
    if (!resumenMov) return [];
    return normalizarMovimientosInventario(
      { entradas: resumenMov.entradas.filas, salidas: resumenMov.salidas.filas, traslados: resumenMov.traslados.filas },
      mapaProd,
      sedeMap,
    );
  }, [ambito, existencias, mapaProd, sedeMap, resumenMov]);

  // Catálogos presentes (para los filtros)
  const catalogos = useMemo(() => {
    const categorias = new Map<string, number>();
    const almacenesM = new Map<string, number>();
    const sedes = new Map<string, number>();
    const unidades = new Map<string, number>();
    const estados = new Map<string, number>();
    const tipos = new Set<TipoMovInventario>();
    for (const f of filasDetalle) {
      categorias.set(f.categoria, (categorias.get(f.categoria) || 0) + 1);
      almacenesM.set(f.almacen, (almacenesM.get(f.almacen) || 0) + 1);
      sedes.set(f.sede, (sedes.get(f.sede) || 0) + 1);
      unidades.set(f.unidad, (unidades.get(f.unidad) || 0) + 1);
      if (f.estado) estados.set(f.estado, (estados.get(f.estado) || 0) + 1);
      if (f.tipo_mov) tipos.add(f.tipo_mov);
    }
    const aLista = (m: Map<string, number>) => Array.from(m.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return {
      categorias: aLista(categorias),
      almacenes: aLista(almacenesM),
      sedes: aLista(sedes),
      unidades: aLista(unidades),
      estados: aLista(estados),
      tipos: TIPOS_MOV.filter((t) => tipos.has(t)),
    };
  }, [filasDetalle]);

  const filtradas = useMemo(() => filtrarFilasInventario(filasDetalle, {
    categoriasSel: categoriasSel.length ? categoriasSel : undefined,
    almacenesSel: almacenesSel.length ? almacenesSel : undefined,
    sedesSel: sedesSel.length ? sedesSel : undefined,
    unidadesSel: unidadesSel.length ? unidadesSel : undefined,
    estadosSel: estadosSel.length ? estadosSel : undefined,
    tiposSel: tiposSel.length ? tiposSel : undefined,
    soloBajoMinimo: ambito === 'existencias' ? soloBajoMinimo : false,
    ocultarSinStock: ambito === 'existencias' ? ocultarSinStock : false,
  }), [filasDetalle, categoriasSel, almacenesSel, sedesSel, unidadesSel, estadosSel, tiposSel, soloBajoMinimo, ocultarSinStock, ambito]);

  const { filas, resumen } = useMemo(() => procesarFilasReporteInventario(filtradas, agrupacion, { ordenarPor, ambito }), [filtradas, agrupacion, ordenarPor, ambito]);

  const cambiarAmbito = (nuevo: AmbitoInventario) => {
    setAmbito(nuevo);
    // Si la agrupación actual no aplica al nuevo ámbito, se vuelve a la base.
    const modo = MODOS.find((m) => m.id === agrupacion);
    if (modo?.ambito && modo.ambito !== nuevo) {
      const base: ModoAgrupacionInventario = nuevo === 'movimientos' ? 'tipo' : 'categoria';
      setAgrupacion(base);
      setMarcados(CAMPOS_POR_DEFECTO_POR_MODO[base]);
    }
  };

  const cambiarAgrupacion = (modo: ModoAgrupacionInventario) => {
    setAgrupacion(modo);
    setMarcados(modo === 'detallado' ? CAMPOS_DETALLE_POR_AMBITO[ambito] : CAMPOS_POR_DEFECTO_POR_MODO[modo]);
  };

  const alternarColumna = (clave: string) => setMarcados((prev) => (prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]));

  const toggleFiltro = <T extends string>(setLista: React.Dispatch<React.SetStateAction<T[]>>, item: T) =>
    setLista((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  const filtroActivo = (lista: string[], item: string) => lista.length === 0 || lista.includes(item);

  const hayFiltros = categoriasSel.length || almacenesSel.length || sedesSel.length || unidadesSel.length || estadosSel.length || tiposSel.length || soloBajoMinimo;
  const limpiarFiltros = () => { setCategoriasSel([]); setAlmacenesSel([]); setSedesSel([]); setUnidadesSel([]); setEstadosSel([]); setTiposSel([]); setSoloBajoMinimo(false); };

  // Columnas que aplican al ámbito actual (para la vista en pantalla)
  const columnasAmbito = useMemo(() => CAMPOS_REPORTE_INVENTARIO.filter((c) => !c.ambito || c.ambito === 'ambos' || c.ambito === ambito), [ambito]);
  const marcadosVisibles = useMemo(() => marcados.filter((c) => columnasAmbito.some((col) => col.clave === c)), [marcados, columnasAmbito]);

  const descargar = async (formato: 'pdf' | 'xlsx' | 'csv') => {
    if (marcadosVisibles.length === 0) { toast('Marca al menos una columna para exportar.', 'warning'); return; }
    if (filas.length === 0) { toast('No hay datos con los filtros y período seleccionados.', 'warning'); return; }
    setOcupado(formato);
    try { localStorage.setItem(CLAVE_CAMPOS, JSON.stringify(marcados)); localStorage.setItem(CLAVE_AMBITO, ambito); localStorage.setItem(CLAVE_AGRUPACION, agrupacion); localStorage.setItem(CLAVE_RESUMEN, String(incluirResumen)); } catch { /* no crítico */ }

    const partes: string[] = [];
    if (categoriasSel.length) partes.push(categoriasSel.length === 1 ? categoriasSel[0] : `${categoriasSel.length} categorías`);
    if (almacenesSel.length) partes.push(almacenesSel.length === 1 ? almacenesSel[0] : `${almacenesSel.length} almacenes`);
    if (sedesSel.length) partes.push(sedesSel.join('/'));
    if (unidadesSel.length) partes.push(unidadesSel.join('/'));
    if (estadosSel.length) partes.push(estadosSel.join('/'));
    if (tiposSel.length) partes.push(tiposSel.map((t) => ETIQUETA_TIPO_MOV[t]).join('/'));
    if (soloBajoMinimo) partes.push('solo bajo mínimo');

    const meta: MetadatosExportacionInventario = {
      desde, hasta, ambito, agrupacion,
      subtituloFiltros: partes.length ? `Filtros: ${partes.join(' · ')}` : undefined,
      incluirResumen, orientacion, formatoPresentacion, ordenarPor,
    };
    try {
      if (formato === 'pdf') await descargarInventarioPdf(filas, resumen, marcados, meta);
      else if (formato === 'xlsx') await descargarInventarioExcel(filas, resumen, marcados, meta);
      else descargarInventarioCsv(filas, marcados, meta);
    } catch (e) {
      toast(mensajeError(e, 'No se pudo generar la exportación'), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const surf2 = { background: 'var(--surface-2, #182230)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.65rem .8rem' } as const;
  const tituloSec = { fontSize: '.84rem', fontWeight: 600, color: 'var(--text, #f1f5f9)' } as const;

  const renderPills = (
    items: { nombre: string; count: number }[],
    lista: string[],
    setLista: React.Dispatch<React.SetStateAction<string[]>>,
    vacio: string,
  ) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', flexWrap: 'wrap', gap: '.3rem' }}>
        <span className="muted" style={{ fontSize: '.76rem' }}>{lista.length === 0 ? 'Todos incluidos' : `${lista.length} seleccionado(s)`}</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setLista([])}>Todos</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', maxHeight: '150px', overflowY: 'auto', padding: '.2rem 0' }}>
        {!items.length && <span className="muted" style={{ fontSize: '.76rem' }}>{vacio}</span>}
        {items.map((it) => {
          const activo = filtroActivo(lista, it.nombre);
          return (
            <button key={it.nombre} type="button" onClick={() => toggleFiltro(setLista, it.nombre)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', padding: '.25rem .65rem', borderRadius: '999px', fontSize: '.78rem', border: '1px solid', borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)', background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)', color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)', cursor: 'pointer' }}>
              <input type="checkbox" checked={activo} readOnly style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }} />
              <span>{it.nombre}</span>
              <span className="muted" style={{ fontSize: '.7rem', opacity: 0.85 }}>({it.count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Aviso puntual para WhatsApp
  const textoWsp = useMemo(
    () => textoWhatsappInventario(filtradas, { ambito, desde, hasta }),
    [filtradas, ambito, desde, hasta],
  );

  const modosDisponibles = MODOS.filter((m) => !m.ambito || m.ambito === ambito);

  return (
    <Modal
      title="📦 Descargar Reporte de Inventario"
      size="lg"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '.5rem', flexWrap: 'wrap' }}>
          <div className="muted" style={{ fontSize: '.8rem' }}>{cargando ? 'Cargando datos...' : `${filas.length} fila(s) a exportar`}</div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={!!ocupado}>Cerrar</button>
            <button className="btn btn-ghost" onClick={() => void descargar('csv')} disabled={!!ocupado || cargando || filas.length === 0 || marcadosVisibles.length === 0}>{ocupado === 'csv' ? 'Generando...' : '📝 CSV'}</button>
            <button className="btn btn-ghost" onClick={() => void descargar('xlsx')} disabled={!!ocupado || cargando || filas.length === 0 || marcadosVisibles.length === 0}>{ocupado === 'xlsx' ? 'Generando...' : '📊 Excel'}</button>
            <button className="btn btn-ghost" onClick={() => setVerWhatsapp(true)} disabled={!!ocupado || cargando || filas.length === 0}>💬 WhatsApp</button>
            <button className="btn btn-primary" onClick={() => void descargar('pdf')} disabled={!!ocupado || cargando || filas.length === 0 || marcadosVisibles.length === 0}>{ocupado === 'pdf' ? 'Generando...' : '📄 PDF'}</button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
        {/* Panel de WhatsApp */}
        {verWhatsapp && (
          <div style={{ ...surf2, borderColor: 'var(--primary, #25D366)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
              <span style={tituloSec}>💬 Enviar por WhatsApp — {AMBITOS.find((a) => a.id === ambito)?.label ?? 'Reporte'}</span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setVerWhatsapp(false)}>← Volver al reporte</button>
            </div>
            <p className="muted" style={{ fontSize: '.76rem', marginTop: 0, marginBottom: '.5rem' }}>
              Aviso directo: cada ítem con su cantidad y valor, y el total. Respeta el ámbito, el período y los filtros.
            </p>
            <CompartirWhatsapp texto={textoWsp} />
          </div>
        )}

        {/* Ámbito */}
        <div style={surf2}>
          <div style={{ ...tituloSec, marginBottom: '.4rem' }}>🧭 Ámbito del reporte</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
            {AMBITOS.map((a) => (
              <button key={a.id} type="button" className={`btn btn-xs ${ambito === a.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarAmbito(a.id)} style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: '.73rem', marginTop: '.4rem', fontStyle: 'italic' }}>
            {ambito === 'existencias' ? 'Foto actual: stock y valor por almacén/sede/categoría (no depende del rango de fechas).' : 'Entradas, salidas, consumo y traslados ejecutados en el período.'}
          </div>
        </div>

        {/* Fechas (solo movimientos) */}
        {ambito === 'movimientos' && (
          <div style={surf2}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.5rem' }}>
              <span style={tituloSec}>📅 Rango de Fechas</span>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(hoyVE()); setHasta(hoyVE()); }}>Hoy</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { const a = diasAtras(1); setDesde(a); setHasta(a); }}>Ayer</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(primerDiaMesActual()); setHasta(hoyVE()); }}>Este mes</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(primerDiaMesAnterior()); setHasta(ultimoDiaMesAnterior()); }}>Mes anterior</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(diasAtras(30)); setHasta(hoyVE()); }}>Últimos 30d</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(diasAtras(90)); setHasta(hoyVE()); }}>Últimos 90d</button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setDesde(primerDiaAnioActual()); setHasta(hoyVE()); }}>Este año</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}><span>Desde:</span><input type="date" className="form-control form-control-sm" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
              <label style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}><span>Hasta:</span><input type="date" className="form-control form-control-sm" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
            </div>
          </div>
        )}

        {/* Dimensión */}
        <div style={surf2}>
          <div style={{ ...tituloSec, marginBottom: '.4rem' }}>🎯 Dimensión principal (Agrupar por)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
            {modosDisponibles.map((m) => (
              <button key={m.id} type="button" className={`btn btn-xs ${agrupacion === m.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarAgrupacion(m.id)} style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                <span>{m.icon}</span><span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div style={surf2}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.5rem' }}>
            <span style={tituloSec}>🔍 Filtros</span>
            {!!hayFiltros && <button type="button" className="btn btn-ghost btn-xs" onClick={limpiarFiltros} style={{ color: 'var(--primary, #f97316)' }}>↺ Restablecer filtros</button>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginBottom: '.6rem' }}>
            {([
              ['categorias', '🏷️ Categorías', categoriasSel],
              ['almacenes', '🏬 Almacenes', almacenesSel],
              ['sedes', '📍 Sedes', sedesSel],
              ['unidades', '📏 Unidades', unidadesSel],
              ...(ambito === 'existencias' ? [['estados', '🗂️ Estados', estadosSel] as const] : [['tipos', '🔀 Tipos', tiposSel] as const]),
            ] as const).map(([id, label, sel]) => (
              <button key={id} type="button" className={`btn btn-xs ${seccionFiltro === id ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .65rem' }} onClick={() => setSeccionFiltro(id)}>
                {label}
                {sel.length > 0 && <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>{sel.length}</span>}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
            {seccionFiltro === 'categorias' && renderPills(catalogos.categorias, categoriasSel, setCategoriasSel, 'Sin categorías.')}
            {seccionFiltro === 'almacenes' && renderPills(catalogos.almacenes, almacenesSel, setAlmacenesSel, 'Sin almacenes.')}
            {seccionFiltro === 'sedes' && renderPills(catalogos.sedes, sedesSel, setSedesSel, 'Sin sedes.')}
            {seccionFiltro === 'unidades' && renderPills(catalogos.unidades, unidadesSel, setUnidadesSel, 'Sin unidades.')}
            {seccionFiltro === 'estados' && ambito === 'existencias' && renderPills(catalogos.estados, estadosSel, setEstadosSel, 'Sin estados.')}
            {seccionFiltro === 'tipos' && ambito === 'movimientos' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                  <span className="muted" style={{ fontSize: '.76rem' }}>{tiposSel.length === 0 ? 'Todos incluidos' : `${tiposSel.length} seleccionado(s)`}</span>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTiposSel([])}>Todos</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                  {catalogos.tipos.map((t) => {
                    const activo = filtroActivo(tiposSel, t);
                    return (
                      <button key={t} type="button" onClick={() => toggleFiltro(setTiposSel, t)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', padding: '.25rem .65rem', borderRadius: '999px', fontSize: '.78rem', border: '1px solid', borderColor: activo ? 'var(--primary, #f97316)' : 'var(--border, #334155)', background: activo ? 'rgba(249, 115, 22, 0.15)' : 'var(--surface-1, #0f172a)', color: activo ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={activo} readOnly style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--primary, #f97316)' }} />
                        <span>{ETIQUETA_TIPO_MOV[t]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {ambito === 'existencias' && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '.6rem', paddingTop: '.5rem', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.8rem' }}>
                <input type="checkbox" checked={soloBajoMinimo} onChange={(e) => setSoloBajoMinimo(e.target.checked)} />
                <span>Solo productos <strong>bajo el mínimo</strong></span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.8rem' }}>
                <input type="checkbox" checked={ocultarSinStock} onChange={(e) => setOcultarSinStock(e.target.checked)} />
                <span>Ocultar existencias <strong>sin stock</strong></span>
              </label>
            </div>
          )}
        </div>

        {/* Columnas */}
        <div style={surf2}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
            <span style={tituloSec}>☑️ Columnas a mostrar ({marcadosVisibles.length} seleccionadas)</span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMarcados(agrupacion === 'detallado' ? CAMPOS_DETALLE_POR_AMBITO[ambito] : CAMPOS_POR_DEFECTO_POR_MODO[agrupacion])}>Principales</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMarcados(columnasAmbito.map((c) => c.clave))}>Todas</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMarcados([])}>Ninguna</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '.35rem .5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {columnasAmbito.map((col) => {
              const marcado = marcados.includes(col.clave);
              return (
                <label key={col.clave} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem', cursor: 'pointer', color: marcado ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)' }} title={col.descripcion}>
                  <input type="checkbox" checked={marcado} onChange={() => alternarColumna(col.clave)} />
                  <span>{col.etiqueta}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Formato / orientación / orden / resumen */}
        <div style={{ ...surf2, display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem', borderBottom: '1px solid var(--border)', paddingBottom: '.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ ...tituloSec, fontSize: '.82rem' }}>🎨 Presentación:</span>
              <button type="button" className={`btn btn-xs ${formatoPresentacion === 'fichas' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .75rem' }} onClick={() => setFormatoPresentacion('fichas')}>🗂️ Fichas Ejecutivas</button>
              <button type="button" className={`btn btn-xs ${formatoPresentacion === 'tabla' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .75rem' }} onClick={() => setFormatoPresentacion('tabla')}>📊 Tabla Tabular</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ ...tituloSec, fontSize: '.82rem' }}>🎯 Ordenar por:</span>
              <button type="button" className={`btn btn-xs ${ordenarPor === 'valor' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('valor')}>💵 Valor</button>
              <button type="button" className={`btn btn-xs ${ordenarPor === 'stock' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('stock')}>📦 {ambito === 'movimientos' ? 'Cantidad' : 'Stock'}</button>
              <button type="button" className={`btn btn-xs ${ordenarPor === 'nombre' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('nombre')}>🔤 Nombre</button>
              {ambito === 'movimientos' && <button type="button" className={`btn btn-xs ${ordenarPor === 'fecha' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('fecha')}>📆 Fecha</button>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ ...tituloSec, fontSize: '.82rem' }}>📐 Orientación:</span>
              <button type="button" className={`btn btn-xs ${orientacion === 'landscape' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .75rem' }} onClick={() => setOrientacion('landscape')}>Horizontal</button>
              <button type="button" className={`btn btn-xs ${orientacion === 'portrait' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .75rem' }} onClick={() => setOrientacion('portrait')}>Vertical</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.8rem' }}>
              <input type="checkbox" checked={incluirResumen} onChange={(e) => setIncluirResumen(e.target.checked)} />
              <span><strong>Incluir resumen (KPIs)</strong> en cabecera</span>
            </label>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ background: 'var(--surface-1, #0f172a)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.5rem .8rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem' }}>
          <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>FILAS EN REPORTE</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b' }}>{filas.length}</div></div>
          {ambito === 'existencias' ? (
            <>
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>VALOR TOTAL</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#22c55e' }}>{fmtUsd(resumen.valorTotal)}</div></div>
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>STOCK TOTAL</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>{fmtNum(resumen.stockTotal)}</div></div>
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>BAJO MÍNIMO</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: resumen.numBajoMinimo > 0 ? '#ef4444' : '#22c55e' }}>{resumen.numBajoMinimo}</div></div>
            </>
          ) : (
            <>
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>ENTRADAS</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#22c55e' }}>{fmtNum(resumen.entradas)}</div></div>
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>SALIDAS</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ef4444' }}>{fmtNum(resumen.salidas)}</div></div>
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>TRASLADOS</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>{fmtNum(resumen.traslados)}</div></div>
            </>
          )}
        </div>

        {/* Vista previa */}
        <div style={surf2}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <span style={{ ...tituloSec, display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              👁️ Vista previa
              <span className="badge" style={{ fontSize: '.7rem', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>{filas.length} {filas.length === 1 ? 'fila' : 'filas'}</span>
            </span>
            <span className="muted" style={{ fontSize: '.75rem' }}>{formatoPresentacion === 'fichas' ? 'Tarjetas ejecutivas' : 'Cuadrícula tabular'}</span>
          </div>

          {cargando ? (
            <div style={{ textAlign: 'center', padding: '1.2rem', color: '#94a3b8', fontSize: '.82rem' }}>Cargando datos de inventario...</div>
          ) : filas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.2rem', color: '#94a3b8', fontSize: '.82rem' }}>No hay datos para el ámbito, período o filtros seleccionados.</div>
          ) : formatoPresentacion === 'fichas' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.55rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '.2rem' }}>
              {filas.map((f) => {
                const acento = f.ambito === 'movimientos'
                  ? (f.tipo_mov === 'entrada' ? '#22c55e' : f.tipo_mov === 'traslado' ? '#38bdf8' : '#ef4444')
                  : (f.bajo_minimo ? '#ef4444' : '#FF8A00');
                const metricas = obtenerMetricasFichaInventario(f, marcados);
                const titulo = f.nombre || f.categoria || 'Sin clasificar';
                return (
                  <div key={f.id} style={{ background: 'var(--surface-1, #0f172a)', border: '1px solid var(--border, #334155)', borderLeft: `4px solid ${acento}`, borderRadius: '6px', padding: '.55rem .7rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.5rem' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '.86rem', color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={titulo}>{titulo}</div>
                        <div className="muted" style={{ fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[f.sku && f.sku !== '—' ? f.sku : null, f.categoria !== titulo ? f.categoria : null, f.almacen || null, f.ambito === 'movimientos' && f.fecha ? fmtFechaCorta(f.fecha) : null].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right', background: 'rgba(255,255,255,0.05)', border: `1px solid ${acento}55`, borderRadius: '6px', padding: '.25rem .55rem', lineHeight: 1.2 }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 700, color: acento }}>{f.pct_del_total != null ? `${f.pct_del_total.toFixed(1)}%` : fmtUsd(f.valor)}</div>
                        <div style={{ fontSize: '.62rem', color: '#94a3b8' }}>{f.ambito === 'movimientos' && f.tipo_mov ? ETIQUETA_TIPO_MOV[f.tipo_mov] : (f.bajo_minimo ? 'Bajo mínimo' : 'Existencia')}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metricas.length}, 1fr)`, gap: '.25rem', marginTop: '.2rem', background: 'rgba(0,0,0,0.2)', padding: '.35rem', borderRadius: '4px' }}>
                      {metricas.map((m) => (
                        <div key={m.clave}>
                          <div className="muted" style={{ fontSize: '.6rem', fontWeight: 600 }}>{m.etiqueta}</div>
                          <div style={{ fontSize: '.8rem', fontWeight: 700, color: m.colorHex, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.valor}>{m.valor}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ maxHeight: '260px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-1, #0f172a)', borderBottom: '1px solid var(--border)' }}>
                    {marcadosVisibles.map((cKey) => {
                      const cDef = columnasAmbito.find((c) => c.clave === cKey);
                      return <th key={cKey} style={{ padding: '.4rem .55rem', textAlign: cDef?.alineacion || 'left', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{cDef?.etiqueta || cKey}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, idx) => (
                    <tr key={f.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      {marcadosVisibles.map((cKey) => {
                        const cDef = columnasAmbito.find((c) => c.clave === cKey);
                        let txt = '—';
                        if (cKey === 'valor') txt = fmtUsd(f.valor);
                        else if (cKey === 'costo') txt = fmtUsd(f.costo_promedio);
                        else if (cKey === 'stock') txt = f.stock != null ? fmtNum(f.stock) : '—';
                        else if (cKey === 'cantidad') txt = f.cantidad != null ? fmtNum(f.cantidad) : '—';
                        else if (cKey === 'stock_min') txt = f.ambito === 'existencias' ? fmtNum(f.stock_min) : '—';
                        else if (cKey === 'pct_total') txt = f.pct_del_total != null ? `${f.pct_del_total.toFixed(1)}%` : '—';
                        else if (cKey === 'tipo_mov') txt = f.tipo_mov ? ETIQUETA_TIPO_MOV[f.tipo_mov] : '—';
                        else if (cKey === 'bajo_minimo') txt = f.ambito === 'existencias' ? (f.bajo_minimo ? 'Sí' : 'No') : '—';
                        else if (cKey === 'fecha') txt = f.fecha || '—';
                        else { const raw = (f as unknown as Record<string, unknown>)[cKey]; txt = raw != null && raw !== '' ? String(raw) : '—'; }
                        return <td key={cKey} style={{ padding: '.35rem .55rem', textAlign: cDef?.alineacion || 'left', whiteSpace: 'nowrap', color: cKey === 'valor' ? '#22c55e' : cKey === 'bajo_minimo' && f.bajo_minimo ? '#ef4444' : '#f1f5f9' }}>{txt}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
