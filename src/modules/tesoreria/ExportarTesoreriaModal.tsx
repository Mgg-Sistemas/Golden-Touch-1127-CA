/* ============================================================
   Golden Touch · Tesorería · Diálogo de Reporte y Exportación
   (02/11/2026)

   Modal interactivo moldeable (patrón de ExportarCombustibleModal):
   - Ámbito: Movimientos de caja · Pendientes por pagar · Cuentas a crédito.
   - Dimensión principal (caja, moneda, tipo, categoría, proveedor, documento,
     día, mes, detallado).
   - Valuación: tasa BCV del día vs histórica, con interruptores maestros de
     USD y Bs (al apagar uno, desaparecen sus cifras de tarjetas, tabla y KPIs).
   - Filtros por cajas, monedas, tipos, categorías, contrapartes y estados.
   - Columnas por casillas; formato Fichas vs Tabla; orientación; orden; resumen.
   - Vista previa en vivo (KPIs + fichas o tabla) y exportación a PDF/Excel/CSV.
   Las preferencias se guardan en localStorage (por usuario del navegador).
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { mensajeError } from '@/shared/lib/errores';
import type { MovimientoCaja } from '@/shared/lib/types';
import { listLibroMayor } from './tesoreria.repository';
import { cargarPendientesPorPagar, type DatosPendientesPorPagar } from './pendientesPorPagar';
import { listCuentasPorPagar, type CuentaPorPagar } from './cuentasPorPagar.repository';
import { listCuentasPorCobrar, type CuentaPorCobrar } from './cuentasPorCobrar.repository';
import { getTasaHoy, getTasasUsdDeFechas } from './tasas.repository';
import {
  CAMPOS_REPORTE_TESORERIA,
  CAMPOS_POR_DEFECTO_POR_MODO,
  ETIQUETA_FLUJO,
  diaDe,
  normalizarMovimientosTesoreria,
  normalizarPendientesPorPagar,
  normalizarCreditosCartera,
  filtrarFilasTesoreria,
  procesarFilasReporteTesoreria,
  obtenerMetricasFichaTesoreria,
  type ContextoTasas,
  type AmbitoTesoreria,
  type ModoAgrupacionTesoreria,
  type BaseTasaTesoreria,
  type TipoFlujoTesoreria,
  type FilaReporteTesoreria,
} from './reporteTesoreriaMoldeable';
import {
  descargarTesoreriaCsv,
  descargarTesoreriaExcel,
  descargarTesoreriaPdf,
  type MetadatosExportacionTesoreria,
} from './exportarTesoreria';
import { textoWhatsappTesoreria } from './whatsappTesoreria';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';

const CLAVE_CAMPOS = 'tesoreria.reporte.campos.v1';
const CLAVE_AMBITO = 'tesoreria.reporte.ambito.v1';
const CLAVE_AGRUPACION = 'tesoreria.reporte.agrupacion.v1';
const CLAVE_TASA = 'tesoreria.reporte.tasa.v1';
const CLAVE_USD = 'tesoreria.reporte.usd.v1';
const CLAVE_BS = 'tesoreria.reporte.bs.v1';
const CLAVE_RESUMEN = 'tesoreria.reporte.resumen.v1';
const CLAVE_KPIS = 'tesoreria.reporte.kpisSimples.v1';

const AMBITOS: { id: AmbitoTesoreria; icon: string; label: string }[] = [
  { id: 'movimientos', icon: '📒', label: 'Movimientos de caja' },
  { id: 'por_pagar', icon: '📄', label: 'Pendientes por pagar' },
  { id: 'creditos_cartera', icon: '🤝', label: 'Cuentas a crédito' },
];

const MODOS: { id: ModoAgrupacionTesoreria; icon: string; label: string }[] = [
  { id: 'caja', icon: '🏦', label: 'Por Caja' },
  { id: 'moneda', icon: '💱', label: 'Por Moneda' },
  { id: 'tipo_movimiento', icon: '🔀', label: 'Por Tipo' },
  { id: 'categoria_gasto', icon: '🏷️', label: 'Por Categoría' },
  { id: 'contraparte', icon: '👤', label: 'Por Proveedor' },
  { id: 'origen_documento', icon: '📑', label: 'Por Documento' },
  { id: 'dia', icon: '📆', label: 'Por Día' },
  { id: 'mes', icon: '📅', label: 'Por Mes' },
  { id: 'detallado', icon: '📋', label: 'Detallado' },
];

const TIPOS_FLUJO: TipoFlujoTesoreria[] = ['egreso', 'ingreso', 'traslado'];

function hoyVE(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function primerDiaMesActual(): string { return `${hoyVE().slice(0, 7)}-01`; }
function primerDiaMesAnterior(): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) + '-01'; }
function ultimoDiaMesAnterior(): string { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); }
function diasAtras(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function primerDiaAnioActual(): string { return `${new Date().getFullYear()}-01-01`; }

function leerPrefs() {
  let ambito: AmbitoTesoreria = 'movimientos';
  try { const a = localStorage.getItem(CLAVE_AMBITO) as AmbitoTesoreria; if (a && AMBITOS.some((x) => x.id === a)) ambito = a; } catch { /* default */ }
  let agrupacion: ModoAgrupacionTesoreria = 'categoria_gasto';
  try { const a = localStorage.getItem(CLAVE_AGRUPACION) as ModoAgrupacionTesoreria; if (a && MODOS.some((x) => x.id === a)) agrupacion = a; } catch { /* default */ }
  let campos = CAMPOS_POR_DEFECTO_POR_MODO[agrupacion];
  try { const c = JSON.parse(localStorage.getItem(CLAVE_CAMPOS) ?? 'null'); if (Array.isArray(c) && c.length) campos = c; } catch { /* default */ }
  let baseTasa: BaseTasaTesoreria = 'bcv_dia';
  try { const t = localStorage.getItem(CLAVE_TASA) as BaseTasaTesoreria; if (t === 'bcv_dia' || t === 'historica') baseTasa = t; } catch { /* default */ }
  const leerBool = (k: string, def: boolean) => { try { const v = localStorage.getItem(k); return v == null ? def : v === 'true'; } catch { return def; } };
  return { ambito, agrupacion, campos, baseTasa, mostrarUsd: leerBool(CLAVE_USD, true), mostrarBs: leerBool(CLAVE_BS, true), incluirResumen: leerBool(CLAVE_RESUMEN, true), kpisSimplificados: leerBool(CLAVE_KPIS, false) };
}

const fmtUsd = (v: number) => `$ ${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBs = (v: number) => `Bs ${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtFechaCorta = (f: string) => { const [y, m, d] = (f || '').split('-'); return y && m && d ? `${d}/${m}` : f; };

interface Props {
  ambitoInicial?: AmbitoTesoreria;
  rangoInicial?: { desde: string; hasta: string };
  onClose: () => void;
}

export function ExportarTesoreriaModal({ ambitoInicial, rangoInicial, onClose }: Props) {
  const prefs = useMemo(() => leerPrefs(), []);

  const [desde, setDesde] = useState<string>(() => rangoInicial?.desde || primerDiaMesActual());
  const [hasta, setHasta] = useState<string>(() => rangoInicial?.hasta || hoyVE());
  const [ambito, setAmbito] = useState<AmbitoTesoreria>(ambitoInicial ?? prefs.ambito);
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionTesoreria>(prefs.agrupacion);
  const [baseTasa, setBaseTasa] = useState<BaseTasaTesoreria>(prefs.baseTasa);
  const [mostrarUsd, setMostrarUsd] = useState<boolean>(prefs.mostrarUsd);
  const [mostrarBs, setMostrarBs] = useState<boolean>(prefs.mostrarBs);
  const [marcados, setMarcados] = useState<string[]>(prefs.campos);
  const [incluirResumen, setIncluirResumen] = useState<boolean>(prefs.incluirResumen);
  const [kpisSimplificados, setKpisSimplificados] = useState<boolean>(prefs.kpisSimplificados);
  const [verWhatsapp, setVerWhatsapp] = useState(false);
  const [orientacion, setOrientacion] = useState<'landscape' | 'portrait'>('landscape');
  const [formatoPresentacion, setFormatoPresentacion] = useState<'fichas' | 'tabla'>('fichas');
  const [ordenarPor, setOrdenarPor] = useState<'usd' | 'bs' | 'fecha' | 'contraparte'>('usd');

  // Filtros (vacío = todos)
  const [cajasSel, setCajasSel] = useState<string[]>([]);
  const [monedasSel, setMonedasSel] = useState<string[]>([]);
  const [tiposSel, setTiposSel] = useState<TipoFlujoTesoreria[]>([]);
  const [categoriasSel, setCategoriasSel] = useState<string[]>([]);
  const [contrapartesSel, setContrapartesSel] = useState<string[]>([]);
  const [estadosSel, setEstadosSel] = useState<string[]>([]);
  const [seccionFiltro, setSeccionFiltro] = useState<'cajas' | 'monedas' | 'tipos' | 'categorias' | 'contrapartes' | 'estados'>('categorias');

  // Datos crudos + contexto de tasas
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<'pdf' | 'xlsx' | 'csv' | null>(null);
  const [movs, setMovs] = useState<MovimientoCaja[]>([]);
  const [datosPP, setDatosPP] = useState<DatosPendientesPorPagar | null>(null);
  const [cxp, setCxp] = useState<CuentaPorPagar[]>([]);
  const [cxc, setCxc] = useState<CuentaPorCobrar[]>([]);
  const [ctx, setCtx] = useState<ContextoTasas>({ tasaBcvHoy: 0, tasaFecha: null });

  // Carga por ámbito + tasas
  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      try {
        const tasaHoy = await getTasaHoy().catch(() => ({ usd: null, eur: null, fecha: null }));
        const tasaBcvHoy = Number(tasaHoy?.usd) || 0;
        const tasaFecha = tasaHoy?.fecha ?? null;

        if (ambito === 'movimientos') {
          const lista = await listLibroMayor({ desde, hasta });
          let tasasPorFecha: Map<string, number> | undefined;
          try {
            const dias = [...new Set(lista.map((m) => diaDe(m.at)).filter(Boolean))];
            tasasPorFecha = await getTasasUsdDeFechas(dias);
          } catch { tasasPorFecha = undefined; }
          if (!cancelado) { setMovs(lista); setCtx({ tasaBcvHoy, tasaFecha, tasasPorFecha }); }
        } else if (ambito === 'por_pagar') {
          const datos = await cargarPendientesPorPagar();
          if (!cancelado) { setDatosPP(datos); setCtx({ tasaBcvHoy: Number(datos.tasa) || tasaBcvHoy, tasaFecha: datos.tasaFecha ?? tasaFecha }); }
        } else {
          const [p, c] = await Promise.all([listCuentasPorPagar(true), listCuentasPorCobrar(true)]);
          if (!cancelado) { setCxp(p); setCxc(c); setCtx({ tasaBcvHoy, tasaFecha }); }
        }
      } catch (e) {
        if (!cancelado) toast(mensajeError(e, 'No se pudieron cargar los datos de Tesorería'), 'error');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    void cargar();
    return () => { cancelado = true; };
  }, [ambito, desde, hasta]);

  // Normalización a filas de detalle según el ámbito
  const filasDetalle = useMemo<FilaReporteTesoreria[]>(() => {
    if (ambito === 'movimientos') return normalizarMovimientosTesoreria(movs, ctx, baseTasa);
    if (ambito === 'por_pagar') return datosPP ? normalizarPendientesPorPagar(datosPP) : [];
    return normalizarCreditosCartera(cxp, cxc, ctx, baseTasa);
  }, [ambito, movs, datosPP, cxp, cxc, ctx, baseTasa]);

  // Catálogos presentes (para los filtros)
  const catalogos = useMemo(() => {
    const cajas = new Map<string, number>();
    const monedas = new Map<string, number>();
    const tipos = new Set<TipoFlujoTesoreria>();
    const categorias = new Map<string, number>();
    const contrapartes = new Map<string, number>();
    const estados = new Map<string, number>();
    for (const f of filasDetalle) {
      if (f.caja_origen && f.caja_origen !== '—') cajas.set(f.caja_origen, (cajas.get(f.caja_origen) || 0) + 1);
      monedas.set(f.moneda_original, (monedas.get(f.moneda_original) || 0) + 1);
      tipos.add(f.tipo_movimiento);
      categorias.set(f.categoria, (categorias.get(f.categoria) || 0) + 1);
      if (f.contraparte && f.contraparte !== '—') contrapartes.set(f.contraparte, (contrapartes.get(f.contraparte) || 0) + 1);
      if (f.estado) estados.set(f.estado, (estados.get(f.estado) || 0) + 1);
    }
    const aLista = (m: Map<string, number>) => Array.from(m.entries()).map(([nombre, count]) => ({ nombre, count })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return {
      cajas: aLista(cajas),
      monedas: aLista(monedas),
      tipos: TIPOS_FLUJO.filter((t) => tipos.has(t)),
      categorias: aLista(categorias),
      contrapartes: aLista(contrapartes),
      estados: aLista(estados),
    };
  }, [filasDetalle]);

  const filtradas = useMemo(() => filtrarFilasTesoreria(filasDetalle, {
    cajasSel: cajasSel.length ? cajasSel : undefined,
    monedasSel: monedasSel.length ? monedasSel : undefined,
    tiposSel: tiposSel.length ? tiposSel : undefined,
    categoriasSel: categoriasSel.length ? categoriasSel : undefined,
    contrapartesSel: contrapartesSel.length ? contrapartesSel : undefined,
    estadosSel: estadosSel.length ? estadosSel : undefined,
  }), [filasDetalle, cajasSel, monedasSel, tiposSel, categoriasSel, contrapartesSel, estadosSel]);

  const { filas, resumen } = useMemo(() => procesarFilasReporteTesoreria(filtradas, agrupacion, { ordenarPor }), [filtradas, agrupacion, ordenarPor]);
  // Nombre legible de la dimensión activa (sin el prefijo «Por »), para los avisos de claridad:
  // así el usuario entiende que el nº de tarjetas/filas = nº de grupos de ESA dimensión.
  const nombreDimension = (MODOS.find((m) => m.id === agrupacion)?.label ?? '').replace(/^Por\s+/, '');

  // Columnas visibles en pantalla (respetan los toggles de moneda)
  const marcadosVisibles = useMemo(() => marcados.filter((c) => {
    if (c === 'monto_usd' && !mostrarUsd) return false;
    if (c === 'monto_bs' && !mostrarBs) return false;
    return true;
  }), [marcados, mostrarUsd, mostrarBs]);

  const cambiarAgrupacion = (modo: ModoAgrupacionTesoreria) => { setAgrupacion(modo); setMarcados(CAMPOS_POR_DEFECTO_POR_MODO[modo]); };

  const alternarColumna = (clave: string) => setMarcados((prev) => (prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]));

  // Interruptores maestros: no se pueden apagar los dos a la vez.
  const alternarUsd = (v: boolean) => { if (!v && !mostrarBs) { toast('Debe quedar al menos una moneda visible (USD o Bs).', 'warning'); return; } setMostrarUsd(v); if (!v && ordenarPor === 'usd') setOrdenarPor('bs'); };
  const alternarBs = (v: boolean) => { if (!v && !mostrarUsd) { toast('Debe quedar al menos una moneda visible (USD o Bs).', 'warning'); return; } setMostrarBs(v); if (!v && ordenarPor === 'bs') setOrdenarPor('usd'); };

  const toggleFiltro = <T extends string>(setLista: React.Dispatch<React.SetStateAction<T[]>>, item: T) =>
    setLista((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  const filtroActivo = (lista: string[], item: string) => lista.length === 0 || lista.includes(item);

  const hayFiltros = cajasSel.length || monedasSel.length || tiposSel.length || categoriasSel.length || contrapartesSel.length || estadosSel.length;
  const limpiarFiltros = () => { setCajasSel([]); setMonedasSel([]); setTiposSel([]); setCategoriasSel([]); setContrapartesSel([]); setEstadosSel([]); };

  const descargar = async (formato: 'pdf' | 'xlsx' | 'csv') => {
    if (marcadosVisibles.length === 0) { toast('Marca al menos una columna visible para exportar.', 'warning'); return; }
    if (filas.length === 0) { toast('No hay datos con los filtros y período seleccionados.', 'warning'); return; }
    setOcupado(formato);
    try { localStorage.setItem(CLAVE_CAMPOS, JSON.stringify(marcados)); localStorage.setItem(CLAVE_AMBITO, ambito); localStorage.setItem(CLAVE_AGRUPACION, agrupacion); localStorage.setItem(CLAVE_TASA, baseTasa); localStorage.setItem(CLAVE_USD, String(mostrarUsd)); localStorage.setItem(CLAVE_BS, String(mostrarBs)); localStorage.setItem(CLAVE_RESUMEN, String(incluirResumen)); localStorage.setItem(CLAVE_KPIS, String(kpisSimplificados)); } catch { /* no crítico */ }

    const partes: string[] = [];
    if (cajasSel.length) partes.push(cajasSel.length === 1 ? cajasSel[0] : `${cajasSel.length} cajas`);
    if (monedasSel.length) partes.push(monedasSel.join('/'));
    if (tiposSel.length) partes.push(tiposSel.map((t) => ETIQUETA_FLUJO[t]).join('/'));
    if (categoriasSel.length) partes.push(categoriasSel.length === 1 ? categoriasSel[0] : `${categoriasSel.length} categorías`);
    if (contrapartesSel.length) partes.push(contrapartesSel.length === 1 ? contrapartesSel[0] : `${contrapartesSel.length} proveedores`);
    if (estadosSel.length) partes.push(estadosSel.join('/'));

    const meta: MetadatosExportacionTesoreria = {
      desde, hasta, ambito, agrupacion, baseTasa,
      monedaConsolidacion: mostrarUsd ? 'usd' : 'bs',
      mostrarUsd, mostrarBs,
      subtituloFiltros: partes.length ? `Filtros: ${partes.join(' · ')}` : undefined,
      incluirResumen, orientacion, formatoPresentacion, ordenarPor,
      kpisSimplificados,
    };
    try {
      if (formato === 'pdf') await descargarTesoreriaPdf(filas, resumen, marcados, meta);
      else if (formato === 'xlsx') await descargarTesoreriaExcel(filas, resumen, marcados, meta);
      else descargarTesoreriaCsv(filas, marcados, meta);
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

  const montoPrincipal = (f: FilaReporteTesoreria) => (mostrarUsd ? fmtUsd(f.monto_usd) : fmtBs(f.monto_bs));

  // Aviso puntual para WhatsApp: ítems en su moneda + total consolidado, por ámbito.
  const textoWsp = useMemo(
    () => textoWhatsappTesoreria(filtradas, { ambito, desde, hasta, mostrarUsd, mostrarBs }),
    [filtradas, ambito, desde, hasta, mostrarUsd, mostrarBs],
  );

  return (
    <Modal
      title="📄 Descargar Reporte de Tesorería"
      size="lg"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '.5rem', flexWrap: 'wrap' }}>
          <div className="muted" style={{ fontSize: '.8rem' }}>{cargando ? 'Cargando datos...' : (agrupacion === 'detallado' ? `${filas.length} fila(s) a exportar` : `${filas.length} grupo(s) · agrupado por ${nombreDimension}`)}</div>
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
        {/* Panel de WhatsApp: aviso puntual del ámbito actual, con el texto y los botones de compartir/copiar */}
        {verWhatsapp && (
          <div style={{ ...surf2, borderColor: 'var(--primary, #25D366)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
              <span style={tituloSec}>💬 Enviar por WhatsApp — {AMBITOS.find((a) => a.id === ambito)?.label ?? 'Reporte'}</span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setVerWhatsapp(false)}>← Volver al reporte</button>
            </div>
            <p className="muted" style={{ fontSize: '.76rem', marginTop: 0, marginBottom: '.5rem' }}>
              Aviso directo: cada ítem con su monto y el total consolidado. Respeta el período, los filtros y las monedas activas.
            </p>
            <CompartirWhatsapp texto={textoWsp} />
          </div>
        )}

        {/* Ámbito */}
        <div style={surf2}>
          <div style={{ ...tituloSec, marginBottom: '.4rem' }}>🧭 Ámbito del reporte</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
            {AMBITOS.map((a) => (
              <button key={a.id} type="button" className={`btn btn-xs ${ambito === a.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAmbito(a.id)} style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
          {ambito !== 'movimientos' && (
            <div className="muted" style={{ fontSize: '.73rem', marginTop: '.4rem', fontStyle: 'italic' }}>
              {ambito === 'por_pagar' ? 'Compromisos vigentes por pagar (no dependen del rango de fechas).' : 'Cuentas a crédito abiertas: lo que se debe (CxP) y lo que nos deben (CxC).'}
            </div>
          )}
        </div>

        {/* Fechas */}
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

        {/* Dimensión + Valuación */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.6rem' }}>
          <div style={surf2}>
            <div style={{ ...tituloSec, marginBottom: '.4rem' }}>🎯 Dimensión principal (Agrupar por)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
              {MODOS.map((m) => (
                <button key={m.id} type="button" className={`btn btn-xs ${agrupacion === m.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => cambiarAgrupacion(m.id)} style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                  <span>{m.icon}</span><span>{m.label}</span>
                </button>
              ))}
            </div>
            {!cargando && (
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.45rem', lineHeight: 1.35 }}>
                {agrupacion === 'detallado'
                  ? `Sin agrupar: cada movimiento es una fila (${filas.length} en total).`
                  : `Agrupando por ${nombreDimension}: ${filas.length} grupo(s) → el reporte tendrá ${filas.length} tarjeta(s)/fila(s). Cambia la dimensión para ver más o menos.`}
              </div>
            )}
          </div>
          <div style={surf2}>
            <div style={{ ...tituloSec, marginBottom: '.4rem' }}>💱 Valuación y monedas</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, color: mostrarUsd ? '#22c55e' : '#94a3b8' }}>
                <input type="checkbox" checked={mostrarUsd} onChange={(e) => alternarUsd(e.target.checked)} /><span>Mostrar $ USD</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, color: mostrarBs ? '#FF8A00' : '#94a3b8' }}>
                <input type="checkbox" checked={mostrarBs} onChange={(e) => alternarBs(e.target.checked)} /><span>Mostrar Bs</span>
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.8rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' }}><input type="radio" name="baseTasaT" checked={baseTasa === 'bcv_dia'} onChange={() => setBaseTasa('bcv_dia')} /><span><strong>Tasa BCV del día</strong> (última oficial)</span></label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: ambito === 'movimientos' ? 'pointer' : 'not-allowed', opacity: ambito === 'movimientos' ? 1 : 0.5 }}><input type="radio" name="baseTasaT" checked={baseTasa === 'historica'} disabled={ambito !== 'movimientos'} onChange={() => setBaseTasa('historica')} /><span><strong>Tasa histórica</strong> de cada movimiento</span></label>
            </div>
            <div className="muted" style={{ fontSize: '.72rem', marginTop: '.35rem' }}>Tasa BCV aplicada: {resumen.tasaBcvReferencia > 0 ? fmtBs(resumen.tasaBcvReferencia) + '/$' : '—'}</div>
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
              ['contrapartes', '👤 Proveedores', contrapartesSel],
              ['tipos', '🔀 Tipos', tiposSel],
              ['cajas', '🏦 Cajas', cajasSel],
              ['monedas', '💱 Monedas', monedasSel],
              ['estados', '🗂️ Estados', estadosSel],
            ] as const).map(([id, label, sel]) => (
              <button key={id} type="button" className={`btn btn-xs ${seccionFiltro === id ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .65rem' }} onClick={() => setSeccionFiltro(id)}>
                {label}
                {sel.length > 0 && <span className="badge" style={{ marginLeft: '.35rem', background: 'var(--primary, #f97316)', color: '#000', fontSize: '.68rem', padding: '1px 5px', borderRadius: '999px', fontWeight: 700 }}>{sel.length}</span>}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
            {seccionFiltro === 'categorias' && renderPills(catalogos.categorias, categoriasSel, setCategoriasSel, 'Sin categorías en el período.')}
            {seccionFiltro === 'contrapartes' && renderPills(catalogos.contrapartes, contrapartesSel, setContrapartesSel, 'Sin proveedores/beneficiarios.')}
            {seccionFiltro === 'cajas' && renderPills(catalogos.cajas, cajasSel, setCajasSel, 'Sin cajas en el período.')}
            {seccionFiltro === 'monedas' && renderPills(catalogos.monedas, monedasSel, setMonedasSel, 'Sin monedas.')}
            {seccionFiltro === 'estados' && renderPills(catalogos.estados, estadosSel, setEstadosSel, 'Sin estados.')}
            {seccionFiltro === 'tipos' && (
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
                        <span>{ETIQUETA_FLUJO[t]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columnas */}
        <div style={surf2}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
            <span style={tituloSec}>☑️ Columnas a mostrar ({marcados.length} seleccionadas)</span>
            <div style={{ display: 'flex', gap: '.3rem' }}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMarcados(CAMPOS_POR_DEFECTO_POR_MODO[agrupacion])}>Principales</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMarcados(CAMPOS_REPORTE_TESORERIA.map((c) => c.clave))}>Todas</button>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMarcados([])}>Ninguna</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '.35rem .5rem', maxHeight: '160px', overflowY: 'auto' }}>
            {CAMPOS_REPORTE_TESORERIA.map((col) => {
              const marcado = marcados.includes(col.clave);
              const ocultoPorToggle = (col.clave === 'monto_usd' && !mostrarUsd) || (col.clave === 'monto_bs' && !mostrarBs);
              return (
                <label key={col.clave} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem', cursor: 'pointer', color: marcado ? 'var(--text, #f1f5f9)' : 'var(--text-muted, #94a3b8)', opacity: ocultoPorToggle ? 0.45 : 1 }} title={ocultoPorToggle ? 'Oculta por el interruptor de moneda' : col.descripcion}>
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
              {mostrarUsd && <button type="button" className={`btn btn-xs ${ordenarPor === 'usd' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('usd')}>💵 Monto ($)</button>}
              {mostrarBs && <button type="button" className={`btn btn-xs ${ordenarPor === 'bs' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('bs')}>🧾 Monto (Bs)</button>}
              <button type="button" className={`btn btn-xs ${ordenarPor === 'fecha' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('fecha')}>📆 Fecha</button>
              <button type="button" className={`btn btn-xs ${ordenarPor === 'contraparte' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.2rem .6rem' }} onClick={() => setOrdenarPor('contraparte')}>👤 Proveedor</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span style={{ ...tituloSec, fontSize: '.82rem' }}>📐 Orientación:</span>
              <button type="button" className={`btn btn-xs ${orientacion === 'landscape' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .75rem' }} onClick={() => setOrientacion('landscape')}>Horizontal</button>
              <button type="button" className={`btn btn-xs ${orientacion === 'portrait' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '999px', padding: '.25rem .75rem' }} onClick={() => setOrientacion('portrait')}>Vertical</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.8rem' }}>
                <input type="checkbox" checked={kpisSimplificados} onChange={(e) => setKpisSimplificados(e.target.checked)} />
                <span><strong>KPIs en vista simple</strong> (Total $ / Total Bs)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', fontSize: '.8rem' }}>
                <input type="checkbox" checked={incluirResumen} onChange={(e) => setIncluirResumen(e.target.checked)} />
                <span><strong>Incluir resumen (KPIs)</strong> en cabecera</span>
              </label>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ background: 'var(--surface-1, #0f172a)', border: '1px solid var(--border)', borderRadius: '8px', padding: '.5rem .8rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem' }}>
          <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>FILAS EN REPORTE</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b' }}>{filas.length}</div></div>
          {kpisSimplificados ? (
            <>
              {mostrarUsd && <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>TOTAL $</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#22c55e' }}>{fmtUsd(resumen.totalEgresosUsd + resumen.totalIngresosUsd)}</div></div>}
              {mostrarBs && <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>TOTAL Bs</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FF8A00' }}>{fmtBs(resumen.totalEgresosBs + resumen.totalIngresosBs)}</div></div>}
            </>
          ) : (
            <>
              {mostrarUsd && <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>EGRESOS ($)</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FF8A00' }}>{fmtUsd(resumen.totalEgresosUsd)}</div></div>}
              {mostrarUsd && <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>INGRESOS ($)</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#22c55e' }}>{fmtUsd(resumen.totalIngresosUsd)}</div></div>}
              {mostrarBs && <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>EGRESOS (Bs)</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FF8A00' }}>{fmtBs(resumen.totalEgresosBs)}</div></div>}
              <div><div className="muted" style={{ fontSize: '.68rem', fontWeight: 600 }}>SALDO NETO</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: (mostrarUsd ? resumen.saldoNetoUsd : resumen.saldoNetoBs) >= 0 ? '#22c55e' : '#ef4444' }}>{mostrarUsd ? fmtUsd(resumen.saldoNetoUsd) : fmtBs(resumen.saldoNetoBs)}</div></div>
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
            <div style={{ textAlign: 'center', padding: '1.2rem', color: '#94a3b8', fontSize: '.82rem' }}>Cargando datos de Tesorería...</div>
          ) : filas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.2rem', color: '#94a3b8', fontSize: '.82rem' }}>No hay datos para el ámbito, período o filtros seleccionados.</div>
          ) : formatoPresentacion === 'fichas' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '.55rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '.2rem' }}>
              {filas.map((f) => {
                const acento = f.tipo_movimiento === 'ingreso' ? '#10b981' : f.tipo_movimiento === 'traslado' ? '#38bdf8' : '#FF8A00';
                const metricas = obtenerMetricasFichaTesoreria(f, marcados, { mostrarUsd, mostrarBs });
                const titulo = f.contraparte && f.contraparte !== '—' ? f.contraparte : (f.categoria || f.concepto || 'Sin clasificar');
                return (
                  <div key={f.id} style={{ background: 'var(--surface-1, #0f172a)', border: '1px solid var(--border, #334155)', borderLeft: `4px solid ${acento}`, borderRadius: '6px', padding: '.55rem .7rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.5rem' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '.86rem', color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={titulo}>{titulo}</div>
                        <div className="muted" style={{ fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[f.categoria !== titulo ? f.categoria : null, f.caja_origen && f.caja_origen !== '—' ? f.caja_origen : null, f.fecha ? fmtFechaCorta(f.fecha) : null].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right', background: 'rgba(255,255,255,0.05)', border: `1px solid ${acento}55`, borderRadius: '6px', padding: '.25rem .55rem', lineHeight: 1.2 }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 700, color: acento }}>{f.pct_del_total != null ? `${f.pct_del_total.toFixed(1)}%` : montoPrincipal(f)}</div>
                        <div style={{ fontSize: '.62rem', color: '#94a3b8' }}>{ETIQUETA_FLUJO[f.tipo_movimiento]}</div>
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
                      const cDef = CAMPOS_REPORTE_TESORERIA.find((c) => c.clave === cKey);
                      return <th key={cKey} style={{ padding: '.4rem .55rem', textAlign: cDef?.alineacion || 'left', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{cDef?.etiqueta || cKey}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, idx) => (
                    <tr key={f.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      {marcadosVisibles.map((cKey) => {
                        const cDef = CAMPOS_REPORTE_TESORERIA.find((c) => c.clave === cKey);
                        let txt = '—';
                        if (cKey === 'monto_usd') txt = fmtUsd(f.monto_usd);
                        else if (cKey === 'monto_bs') txt = fmtBs(f.monto_bs);
                        else if (cKey === 'monto_original') txt = f.monto_original.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        else if (cKey === 'tasa_bcv') txt = f.tasa_bcv_aplicada ? f.tasa_bcv_aplicada.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
                        else if (cKey === 'pct_total') txt = f.pct_del_total != null ? `${f.pct_del_total.toFixed(1)}%` : '—';
                        else if (cKey === 'saldo_caja') txt = f.saldo_caja_momento != null ? f.saldo_caja_momento.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
                        else if (cKey === 'tipo_mov') txt = ETIQUETA_FLUJO[f.tipo_movimiento];
                        else if (cKey === 'caja') txt = f.caja_origen || '—';
                        else if (cKey === 'fecha') txt = f.fecha || '—';
                        else { const raw = (f as unknown as Record<string, unknown>)[cKey]; txt = raw != null && raw !== '' ? String(raw) : '—'; }
                        return <td key={cKey} style={{ padding: '.35rem .55rem', textAlign: cDef?.alineacion || 'left', whiteSpace: 'nowrap', color: cKey === 'monto_usd' ? '#22c55e' : cKey === 'monto_bs' ? '#FF8A00' : '#f1f5f9' }}>{txt}</td>;
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
