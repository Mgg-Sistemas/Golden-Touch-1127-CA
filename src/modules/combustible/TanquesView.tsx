import { Quien } from '@/shared/ui/Quien';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { AdjuntosSalida, SelectorAdjuntos } from '@/modules/salidas/AdjuntosSalida';
import { adjuntosCombustible, MODULO_ADJUNTO_TANQUE } from './adjuntosCombustible.repository';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ConsumoChartModal } from '@/shared/ui/ConsumoChartModal';
import { ReporteExistenciasModal } from './ReporteExistenciasModal';
import type {
  CatalogoCombustible,
  ConciliacionCombustible,
  CubicacionCombustible,
  MovimientoTanque,
  TanqueCombustible,
  TipoCatalogoCombustible,
  TipoMovTanque,
  TipoTanque,
  TransferenciaCombustibleInter,
} from '@/shared/lib/types';
import { TransferenciasInterModal } from '@/shared/ui/TransferenciasInterModal';
import {
  listTanques, listCatalogos, listMovimientosTanque, reporteGlobal, listConciliaciones,
  registrarEntrada, registrarUso, registrarTraslado, registrarRetorno, registrarMerma, eliminarMovimientoTanque,
  registrarTrasladoMGG, reintentarTrasladoMGG, revertirTrasladoMGG, listTransferenciasCombustible,
  DESTINO_MGG, DESTINO_MGG_LABEL, ultimoHorometroEquipo, ultimoKilometrajeEquipo, ultimoContadorTanque,
  actualizarMovimientoTanque,
  crearTanque, actualizarTanque, eliminarTanque, addCatalogo, setCatalogoActivo, updateCatalogo, eliminarCatalogo, setEquipoTanquesPermitidos, setMultipleCatalogosActivo, crearConciliacion,
  listCubicaciones, crearCubicacion, eliminarCubicacion, cubicarLitros, capacidadCalculada,
  consumoUso, resumenTanquesPeriodo, esBrasileros, postearConsumoCombustibleSemana,
  previewConsumoCombustibleSemana, type PreviewConsumoSemana, type ReporteTanque, type ResumenTanquePeriodo,
} from './tanques.repository';
import { descargarMovimientosTanquePdf } from './tanquePdf';
import { descargarMovimientosTanqueExcel } from './tanqueExcel';
import { enviarMovimientosTanquePorCorreo } from './enviarTanque';
import { descargarConciliacionesPdf, type ConciliacionRow } from './conciliacionPdf';
import { descargarConciliacionesExcel } from './conciliacionExcel';
import { enviarConciliacionesPorCorreo } from './enviarConciliacion';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import { norm } from '@/shared/lib/texto';
import { horaAInput, horaDesdeInput } from './horaMovimiento';
import { ExportarCombustibleModal } from './ExportarCombustibleModal';
import { contadorFinalPropuesto, pasaPorSurtidor } from './contadorSurtidor';
import { errorHorometro } from './horometroEquipo';
import { MARGEN_MERMA_DEFECTO, mermaDeRecepcion } from './mermaRecepcion';
import { errorSaldoInsuficiente, etiquetaTanque, litrosExtraQueSalen, saleDelTanque, tanqueSinLitros } from './saldoSuficiente';
import { esBidon, etiquetaTanqueDestino } from './bidonCombustible';
import { mensajeError } from '@/shared/lib/errores';
import { CalculadoraCubicacionModal } from './CalculadoraCubicacionModal';
import { CambioContadorModal } from './CambioContadorModal';
import { calcularMermaImplicitaTanque, DEFAULT_MERMA_IMPLICITA_PCT, generarObservacionMermaImplicita } from './mermaImplicita';
import { useFichasEquipos } from './fichasEquipos';
import { opcionesEquipos, esTanquePermitidoParaEquipo, type FichaEquipoOpcion } from './opcionesEquipos';
import './combustible.css';

/** Hora actual del sistema (zona Venezuela) en formato «8:02:00 AM», como en el Excel. */
function horaSistema(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(new Date());
}

/** YYYY-MM del mes actual (zona Venezuela). */
function mesActualVE(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return f.slice(0, 7);
}
/** «junio de 2026» a partir de «2026-06». */
function nombreMes(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(y, (m || 1) - 1, 1));
}
/** Mes (YYYY-MM) de una fecha ISO. */
const mesDe = (fecha: string | null | undefined) => (fecha ?? '').slice(0, 7);

/** Totales de un grupo de tanques: litros disponibles, valor en USD, tasa promedio
 *  ponderada por litros (correcta aunque cada tanque tenga distinta tasa) y cantidad. */
function totalesGrupo(rep: ReporteTanque[]): { litros: number; valor: number; tasa: number; count: number } {
  const litros = rep.reduce((a, r) => a + (Number(r.disponible) || 0), 0);
  const valor = rep.reduce((a, r) => a + (Number(r.disponible) || 0) * (Number(r.tanque.tasa_usd_litro) || 0), 0);
  return { litros, valor, tasa: litros > 0 ? valor / litros : 0, count: rep.length };
}

/** Tarjeta-resumen ejecutiva de un grupo de combustible (litros + valor + tasa promedio + barra de ocupación). */
function ResumenCombustible({ titulo, totales, grupo }: {
  titulo: string;
  totales: { litros: number; valor: number; tasa: number; count: number };
  grupo: ReporteTanque[];
}) {
  const capTotal = useMemo(() => grupo.reduce((a, r) => a + (Number(r.tanque.capacidad_litros) || 0), 0), [grupo]);
  const pctOcupacion = capTotal > 0 ? Math.min(100, Math.max(0, (totales.litros / capTotal) * 100)) : 0;

  return (
    <div className="comb-resumen-banner">
      <div className="comb-resumen-top">
        <div className="comb-resumen-title">
          <svg width="15" height="19" viewBox="0 0 14 18" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M7 0 C7 0 0 8 0 12 a7 7 0 0 0 14 0 C14 8 7 0 7 0 Z" fill="#f59e0b" stroke="rgba(255,255,255,.3)" strokeWidth="0.8" />
          </svg>
          {titulo}
        </div>
        <div className="comb-resumen-badge">
          <span>{totales.count} tanque(s) en este grupo</span>
          {capTotal > 0 && <span>· Cap. instalada {num(capTotal)} L</span>}
        </div>
      </div>

      <div className="comb-resumen-stats-grid">
        <div className="comb-stat-volumen">
          <div className="comb-stat-volumen-num">
            {num(totales.litros)}<span>ltrs</span>
          </div>
          <div className="comb-stat-volumen-sub">Combustible disponible en tanques</div>
        </div>

        {capTotal > 0 && (
          <div className="comb-stat-capacidad">
            <div className="comb-stat-capacidad-header">
              <span>Nivel de ocupación del grupo</span>
              <strong className="mono">{num(pctOcupacion)}%</strong>
            </div>
            <div className="comb-stat-capacidad-bar-bg" title={`${num(totales.litros)} L de ${num(capTotal)} L de capacidad instalada`}>
              <div className="comb-stat-capacidad-bar-fill" style={{ width: `${pctOcupacion}%` }} />
            </div>
          </div>
        )}

        <div className="comb-stat-valores">
          <div className="comb-stat-valor-col">
            <span className="comb-stat-valor-label">Valoración total USD</span>
            <span className="comb-stat-valor-usd">{money(totales.valor)}</span>
          </div>
          <div className="comb-stat-valor-col">
            <span className="comb-stat-valor-label">Tasa promedio ponderada</span>
            <span className="comb-stat-valor-tasa">{money(totales.tasa)} <span>/ltrs</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Un grupo de combustible: su tarjeta-resumen ejecutiva + grid de tanques debajo. */
function GrupoTanques({ titulo, totales, grupo, canWrite, loading, vacio, onAbrir, onEditar }: {
  titulo: string;
  totales: { litros: number; valor: number; tasa: number; count: number };
  grupo: ReporteTanque[];
  canWrite: boolean;
  loading: boolean;
  estiloTop?: string;
  vacio: string;
  onAbrir: (id: string) => void;
  onEditar: (t: TanqueCombustible) => void;
}) {
  return (
    <section className="comb-grupo-section">
      <ResumenCombustible titulo={titulo} totales={totales} grupo={grupo} />
      <div className="comb-tanques-grid">
        {grupo.map((r) => (
          <TanqueCard key={r.tanque.id} r={r} canWrite={canWrite}
            onClick={() => onAbrir(r.tanque.id)}
            onEdit={() => onEditar(r.tanque)} />
        ))}
        {!grupo.length && !loading && (
          <div className="card" style={{ gridColumn: '1 / -1', padding: '1.5rem', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>{vacio}</p>
          </div>
        )}
      </div>
    </section>
  );
}




const TIPO_MOV_LABEL: Record<TipoMovTanque, string> = {
  entrada: '⬇ Entrada (entra combustible)',
  uso: '⛽ Uso (consumo de equipo)',
  traslado: '↔ Traslado (a otra mina/tanque)',
  retorno: '↩ Retorno (vuelve al tanque)',
  merma: '🔻 Merma del tanque (pérdida)',
};

export function TanquesView() {
  const { user } = useSession();
  const { can } = usePermissions();
  const canWrite = can('combustible', 'escritura');
  // Asentar un cambio de contador decide como se leen TODOS los surtidos siguientes:
  // se pide control total de Combustible, igual que las mermas fuera de margen.
  const puedeCambiarContador = can('combustible', 'full');
  const actor = user?.email ?? 'sistema';
  const { appUser } = usePermissions();
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [tanques, setTanques] = useState<TanqueCombustible[]>([]);
  const [reporte, setReporte] = useState<ReporteTanque[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoCombustible[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'mov' | 'tanque' | 'catalogos' | 'conciliacion' | 'consumo' | 'cubicacion' | 'calculadora' | 'consumoSemanal' | 'reporte' | 'transferencias' | 'exportarReporte' | 'contador'>('none');
  const [rangoReporte, setRangoReporte] = useState<{ desde: string; hasta: string } | undefined>(undefined);
  // GT-INT-11 · Envíos a MGG. Se cargan siempre (no solo al abrir el modal) para poder
  // avisar en la barra cuando alguno quedó sin llegar: el combustible ya salió del
  // tanque, así que enterarse tarde es justamente el problema.
  const [transferencias, setTransferencias] = useState<TransferenciaCombustibleInter[]>([]);
  const [detalle, setDetalle] = useState<MovimientoTanque | null>(null);
  const [aBorrar, setABorrar] = useState<MovimientoTanque | null>(null);
  const [editTanque, setEditTanque] = useState<TanqueCombustible | null>(null);
  const [tanqueABorrar, setTanqueABorrar] = useState<TanqueCombustible | null>(null);
  const [borrandoTanque, setBorrandoTanque] = useState(false);
  // La lista actual solo muestra el mes en curso; lo anterior va al Histórico.
  const [historico, setHistorico] = useState(false);
  // Se incrementa ante cada recarga/realtime para que el modal Histórico (que tiene
  // su propio estado de movimientos) vuelva a consultar y refleje las ediciones.
  const [reloadKey, setReloadKey] = useState(0);
  const mesActual = useMemo(() => mesActualVE(), []);

  const reloadTanques = useCallback(async () => {
    const [ts, rep, cat, transf] = await Promise.all([
      listTanques(), reporteGlobal(), listCatalogos(),
      // Que el puente esté caído no debe dejar la pantalla de tanques en blanco.
      listTransferenciasCombustible().catch(() => [] as TransferenciaCombustibleInter[]),
    ]);
    setTanques(ts);
    setReporte(rep);
    setCatalogos(cat);
    setTransferencias(transf);
    setSelId((prev) => prev || ts[0]?.id || '');
  }, []);

  const reloadMovs = useCallback(async (id: string) => {
    if (!id) { setMovs([]); return; }
    setMovs(await listMovimientosTanque(id));
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reloadTanques().catch((e) => { if (!cancel) toast(mensajeError(e, 'Error al cargar'), 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reloadTanques]);

  useEffect(() => { void reloadMovs(selId); }, [selId, reloadMovs]);

  // GT-INT-16 · Faltaban `combustible_cubicaciones` (el modal de cubicación cargaba
  // el historial solo al montarse) y las transferencias con MGG.
  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos', 'combustible_contador_cambios', 'combustible_catalogos', 'combustible_conciliaciones', 'combustible_cubicaciones', 'transferencias_combustible_inter', 'maquinaria_lecturas', 'maquinaria_equipos'], () => {
    void reloadTanques();
    void reloadMovs(selId);
    setReloadKey((k) => k + 1);
  });


  const sel = useMemo(() => tanques.find((t) => t.id === selId) ?? null, [tanques, selId]);
  // El total de combustible se divide en DOS grupos: «Los Brasileros» (Tanque #2
  // Brasileros + Registro Brasileros - GT, identificados por su nombre) y el resto.
  // Esos tanques se descuentan del total general y SOLO suman en la tarjeta Brasileros.
  const transferenciasEnError = useMemo(() => transferencias.filter((t) => t.estado === 'error').length, [transferencias]);
  const grupoBrasileros = useMemo(() => reporte.filter((r) => esBrasileros(r.tanque.nombre)), [reporte]);
  const grupoGeneral = useMemo(() => reporte.filter((r) => !esBrasileros(r.tanque.nombre)), [reporte]);
  const totalGeneral = useMemo(() => totalesGrupo(grupoGeneral), [grupoGeneral]);
  const totalBrasileros = useMemo(() => totalesGrupo(grupoBrasileros), [grupoBrasileros]);
  // Modo de vista: false = inicio (resumen + tarjetas); true = detalle (tarjeta + movimientos).
  const [abierto, setAbierto] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState<'none' | 'reportes' | 'mediciones' | 'ajustes'>('none');
  const reporteSel = useMemo(() => reporte.find((r) => r.tanque.id === selId) ?? null, [reporte, selId]);

  // La lista actual solo muestra los movimientos del MES EN CURSO. Los meses
  // anteriores quedan en el Histórico (agrupados por mes). El saldo, horómetro y
  // contador NO se reinician: siguen encadenados sobre TODOS los movimientos.
  const movsMesActual = useMemo(() => movs.filter((m) => mesDe(m.fecha) === mesActual), [movs, mesActual]);

  async function recargarTodo() { await reloadTanques(); await reloadMovs(selId); setReloadKey((k) => k + 1); }

  return (
    <div className="comb-root">
      {/* Backdrop transparente para cerrar menús abiertos */}
      {menuAbierto !== 'none' && (
        <div className="comb-dropdown-backdrop" onClick={() => setMenuAbierto('none')} />
      )}

      {/* Toolbar Ejecutiva */}
      <div className="comb-toolbar">
        <div className="comb-toolbar-group">
          {/* Dropdown 1: Reportes & Histórico */}
          <div className="comb-dropdown-wrap">
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${menuAbierto === 'reportes' ? 'active' : ''}`}
              onClick={() => setMenuAbierto((prev) => (prev === 'reportes' ? 'none' : 'reportes'))}
              title="Reportes, existencias y consumos"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 600 }}
            >
              <span>📊 Reportes</span>
              <span style={{ fontSize: '.7rem', opacity: 0.7 }}>▾</span>
            </button>
            {menuAbierto === 'reportes' && (
              <div className="comb-dropdown-menu">
                <button
                  type="button"
                  className="comb-dropdown-item"
                  onClick={() => { setMenuAbierto('none'); setHistorico(true); }}
                  disabled={!tanques.length}
                >
                  <span>📚</span> Histórico de movimientos
                </button>
                <button
                  type="button"
                  className="comb-dropdown-item"
                  onClick={() => { setMenuAbierto('none'); setModal('reporte'); }}
                  disabled={!reporte.length}
                >
                  <span>📄</span> Reporte de existencias al corte
                </button>
                <button
                  type="button"
                  className="comb-dropdown-item"
                  onClick={() => { setMenuAbierto('none'); setModal('consumo'); }}
                >
                  <span>📊</span> Consumo por equipo
                </button>
              </div>
            )}
          </div>

          {/* Dropdown 2: Operaciones & Mediciones */}
          <div className="comb-dropdown-wrap">
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${menuAbierto === 'mediciones' ? 'active' : ''}`}
              onClick={() => setMenuAbierto((prev) => (prev === 'mediciones' ? 'none' : 'mediciones'))}
              title="Medición, cubicación y conciliación semanal"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 600 }}
            >
              <span>📐 Mediciones</span>
              <span style={{ fontSize: '.7rem', opacity: 0.7 }}>▾</span>
            </button>
            {menuAbierto === 'mediciones' && (
              <div className="comb-dropdown-menu">
                {canWrite && (
                  <button
                    type="button"
                    className="comb-dropdown-item"
                    onClick={() => { setMenuAbierto('none'); setModal('cubicacion'); }}
                    disabled={!sel}
                    title="Medir altura con varilla → litros"
                  >
                    <span>📐</span> Cubicación de tanque
                  </button>
                )}
                <button
                  type="button"
                  className="comb-dropdown-item"
                  onClick={() => { setMenuAbierto('none'); setModal('calculadora'); }}
                  title="Calculadora rápida de cubicación (tanque y cm)"
                >
                  <span>🧮</span> Calculadora rápida
                </button>
                {canWrite && (
                  <button
                    type="button"
                    className="comb-dropdown-item"
                    onClick={() => { setMenuAbierto('none'); setModal('conciliacion'); }}
                    disabled={!tanques.length}
                    title="Conciliación semanal de los tanques"
                  >
                    <span>⚖</span> Conciliación semanal
                  </button>
                )}
                {canWrite && (
                  <button
                    type="button"
                    className="comb-dropdown-item"
                    onClick={() => { setMenuAbierto('none'); setModal('consumoSemanal'); }}
                    title="Cargar consumo de GT en Caja Peramanal"
                  >
                    <span>💰</span> Cargar en Caja Peramanal
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Botón directo: Envíos a MGG */}
          <button
            type="button"
            className={`btn btn-sm ${transferenciasEnError ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setModal('transferencias')}
            title={transferenciasEnError
              ? `${transferenciasEnError} envío(s) a MGG no llegaron: el combustible ya salió del tanque`
              : 'Combustible enviado a MGG y su estado'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 600 }}
          >
            <span>🌐 Envíos a MGG</span>
            {transferenciasEnError > 0 && (
              <span style={{
                background: '#dc2626',
                color: '#fff',
                fontSize: '.72rem',
                fontWeight: 800,
                padding: '1px 6px',
                borderRadius: '999px',
              }}>
                {transferenciasEnError}
              </span>
            )}
          </button>

          {/* Dropdown 3: Ajustes & Configuración */}
          {(canWrite || puedeCambiarContador) && (
            <div className="comb-dropdown-wrap">
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${menuAbierto === 'ajustes' ? 'active' : ''}`}
                onClick={() => setMenuAbierto((prev) => (prev === 'ajustes' ? 'none' : 'ajustes'))}
                title="Configuración de tanques, catálogos y contadores"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 600 }}
              >
                <span>⚙ Ajustes</span>
                <span style={{ fontSize: '.7rem', opacity: 0.7 }}>▾</span>
              </button>
              {menuAbierto === 'ajustes' && (
                <div className="comb-dropdown-menu">
                  {canWrite && (
                    <button
                      type="button"
                      className="comb-dropdown-item"
                      onClick={() => { setMenuAbierto('none'); setEditTanque(null); setModal('tanque'); }}
                    >
                      <span>➕</span> Crear nuevo tanque
                    </button>
                  )}
                  {canWrite && (
                    <button
                      type="button"
                      className="comb-dropdown-item"
                      onClick={() => { setMenuAbierto('none'); setModal('catalogos'); }}
                    >
                      <span>🗂</span> Catálogos de combustible
                    </button>
                  )}
                  {puedeCambiarContador && (
                    <button
                      type="button"
                      className="comb-dropdown-item"
                      onClick={() => { setMenuAbierto('none'); setModal('contador'); }}
                      disabled={!sel}
                      title="Asentar cambio de contador físico"
                    >
                      <span>⚙</span> Cambio de contador
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Acción Primaria Protagonista */}
        {canWrite && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal('mov')}
            disabled={!tanques.length}
            style={{ fontWeight: 800, padding: '.45rem 1.1rem', display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
          >
            <span>+</span> Nuevo movimiento
          </button>
        )}
      </div>

      {!abierto ? (
        <>
          {/* Cada banner con SUS tanques debajo: general (sin Brasileros) y Los Brasileros. */}
          <GrupoTanques
            titulo="Combustible disponible" totales={totalGeneral} grupo={grupoGeneral}
            canWrite={canWrite} loading={loading}
            vacio={reporte.length ? 'Sin tanques en este grupo.' : 'Sin tanques. Crea uno con "+ Tanque".'}
            onAbrir={(id) => { setSelId(id); setAbierto(true); }}
            onEditar={(t) => { setEditTanque(t); setModal('tanque'); }} />
          <GrupoTanques
            titulo="Los Brasileros" totales={totalBrasileros} grupo={grupoBrasileros}
            canWrite={canWrite} loading={loading}
            vacio="Sin tanques en Los Brasileros."
            onAbrir={(id) => { setSelId(id); setAbierto(true); }}
            onEditar={(t) => { setEditTanque(t); setModal('tanque'); }} />
        </>
      ) : sel && reporteSel ? (
        <>
          {/* Detalle: botón Volver + tarjeta seleccionada arriba + movimientos abajo */}
          <div className="comb-detalle-back-bar">
            <button className="comb-btn-volver" onClick={() => setAbierto(false)} title="Volver al inicio de Combustible">
              ← Volver a todos los tanques
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <TanqueCard r={reporteSel} canWrite={canWrite} activo
              onEdit={() => { setEditTanque(reporteSel.tanque); setModal('tanque'); }} />
          </div>

          <div className="comb-detalle-hero">
            <div className="comb-detalle-hero-title">
              <h2>
                {esBidon(sel.nombre) ? '🪣' : sel.es_movil ? '🚚' : '🛢'} {sel.nombre}
              </h2>
            </div>
            <div className="comb-detalle-hero-meta">
              <span>Saldo: <strong className="mono">{num(sel.saldo_litros)} ltrs</strong></span>
              <span>Valor: <strong className="mono" style={{ color: 'var(--success, #10b981)' }}>{money(sel.saldo_usd)}</strong></span>
              <span>Tasa: <strong className="mono">{money(sel.tasa_usd_litro)} /ltrs</strong></span>
              {Number(sel.capacidad_litros) > 0 && <span>Capacidad: <strong className="mono">{num(sel.capacidad_litros)} L</strong></span>}
            </div>
          </div>

          <RegistroMovimientos
            sel={sel}
            movs={movsMesActual}
            userEmail={user?.email ?? ''}
            canWrite={canWrite}
            allowDelete
            titulo={`Registro de movimientos · ${nombreMes(mesActual)}`}
            emptyMsg="Sin movimientos este mes."
            loading={loading}
            onVerDetalle={setDetalle}
            onBorrar={setABorrar}
          />
        </>
      ) : null}

      {modal === 'mov' && sel && (
        <MovimientoModal tanques={tanques.filter((t) => t.estado === 'activo')} tanqueSel={sel} catalogos={catalogos} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await recargarTodo(); }} />
      )}
      {modal === 'tanque' && (
        <TanqueModal catalogos={catalogos} actor={actor} tanque={editTanque}
          onClose={() => { setModal('none'); setEditTanque(null); }}
          onRequestDelete={(t) => { setModal('none'); setEditTanque(null); setTanqueABorrar(t); }}
          onSaved={async () => { setModal('none'); setEditTanque(null); await reloadTanques(); }} />
      )}
      {modal === 'catalogos' && (
        <CatalogosModal catalogos={catalogos} tanques={tanques.filter((t) => t.estado === 'activo')} onClose={() => setModal('none')} onChanged={reloadTanques} />
      )}
      {modal === 'conciliacion' && (
        <ConciliacionModal tanques={tanques} actor={actor} defaultEmail={user?.email ?? ''} onClose={() => setModal('none')} />
      )}
      {modal === 'consumoSemanal' && (
        <ConsumoSemanalModal onClose={() => setModal('none')} onPosted={recargarTodo} />
      )}
      {modal === 'transferencias' && (
        <TransferenciasInterModal
          recurso="Combustible"
          unidad="litros"
          filas={transferencias.map((t) => ({
            id: t.id, estado: t.estado, resumen: t.resumen, motivo: t.motivo,
            mensaje_error: t.mensaje_error, created_at: t.created_at,
            actor: t.actor, actor_name: t.actor_name,
            revertida_at: t.revertida_at, revertida_por: t.revertida_por,
            origen: t.tanque_nombre,
          }))}
          puedeOperar={canWrite}
          onReintentar={async (id) => { await reintentarTrasladoMGG({ id, actor, actorName }); await recargarTodo(); }}
          onRevertir={async (id) => { await revertirTrasladoMGG({ id, actor, actorName }); await recargarTodo(); }}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'exportarReporte' && (
        <ExportarCombustibleModal tanques={tanques} tanqueInicialId={sel?.id} rangoInicial={rangoReporte} onClose={() => setModal('consumo')} />
      )}
      {modal === 'reporte' && (
        <ReporteExistenciasModal
          tanques={tanques}
          reporte={reporte}
          onClose={() => setModal('none')} />
      )}
      {modal === 'contador' && sel && (
        <CambioContadorModal
          tanque={{ id: sel.id, nombre: sel.nombre }}
          actor={actor}
          onClose={() => setModal('none')}
          onGuardado={() => { void reloadMovs(sel.id); }}
        />
      )}
      {modal === 'cubicacion' && sel && (
        <CubicacionModal tanque={sel} actor={actor} onClose={() => setModal('none')} onSaved={recargarTodo} />
      )}
      {modal === 'calculadora' && (
        <CalculadoraCubicacionModal
          tanqueInicial={sel?.nombre}
          tanques={tanques}
          onClose={() => setModal('none')}
        />
      )}
      {detalle && (
        <DetalleMovimientoModal mov={detalle} tanque={tanques.find((t) => t.id === detalle.tanque_id) ?? sel}
          catalogos={catalogos} canWrite={canWrite} actor={actor}
          onClose={() => setDetalle(null)}
          onSaved={async () => { setDetalle(null); await recargarTodo(); }} />
      )}
      {aBorrar && (
        <ConfirmDialog
          title="Eliminar movimiento"
          message={
            aBorrar.tipo === 'traslado' && aBorrar.mov_vinculado_id
              ? 'Este es un traslado entre tanques. Al eliminarlo se revierte el saldo de AMBOS tanques (sale del destino y vuelve al origen). ¿Continuar?'
              : '¿Eliminar este movimiento? Se revertirá el saldo del tanque.'
          }
          confirmText="Eliminar"
          danger
          onCancel={() => setABorrar(null)}
          onConfirm={() => { const m = aBorrar; setABorrar(null); void borrar(m); }}
        />
      )}
      {tanqueABorrar && (
        <ConfirmDialog
          title={`Eliminar ${tanqueABorrar.nombre}`}
          message={`Vas a borrar el tanque «${tanqueABorrar.nombre}» y TODOS sus movimientos. Esta acción no se puede deshacer. Para confirmar que no es por error, escribe el nombre del tanque tal cual.`}
          requireText={tanqueABorrar.nombre}
          confirmText={borrandoTanque ? 'Eliminando…' : 'Eliminar tanque'}
          danger
          onCancel={() => { if (!borrandoTanque) setTanqueABorrar(null); }}
          onConfirm={async () => {
            const t = tanqueABorrar;
            setBorrandoTanque(true);
            try {
              await eliminarTanque(t.id);
              toast(`Tanque «${t.nombre}» eliminado`, 'success');
              setTanqueABorrar(null);
              if (selId === t.id) { setSelId(''); setAbierto(false); }
              await reloadTanques();
            } catch (err) {
              toast(mensajeError(err, 'No se pudo eliminar el tanque'), 'error');
            } finally { setBorrandoTanque(false); }
          }}
        />
      )}
      {historico && (
        <HistoricoMovimientosModal
          tanques={tanques}
          reporte={reporte}
          userEmail={user?.email ?? ''}
          mesActual={mesActual}
          reloadKey={reloadKey}
          onVerDetalle={setDetalle}
          onClose={() => setHistorico(false)}
        />
      )}
      {modal === 'consumo' && (
        <ConsumoChartModal
          title="Consumo de combustible por equipo"
          subtitle="Litros consumidos (movimientos de USO) por equipo. El valor en $ usa la tasa del tanque."
          permitirHoras
          onAbrirReporte={({ desde, hasta }) => {
            setRangoReporte({
              desde: desde.toISOString().slice(0, 10),
              hasta: hasta.toISOString().slice(0, 10),
            });
            setModal('exportarReporte');
          }}
          cargar={async (desde, hasta) => {
            const items = await consumoUso(desde, hasta, 'equipo');
            return items.map((x) => ({
              id: x.id,
              label: x.nombre,
              unidad: 'Lt',
              cantidad: x.cantidad,
              valor: x.valor,
              horas: x.horas,
            }));
          }}
          realtimeTables={['combustible_tanque_movimientos', 'combustible_tanques']}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );

  async function borrar(m: MovimientoTanque) {
    try { await eliminarMovimientoTanque(m); await recargarTodo(); toast('Movimiento eliminado', 'success'); }
    catch (e) { toast(mensajeError(e, 'No se pudo eliminar'), 'error'); }
  }
}

/* ───────────── Tarjeta de un tanque (reporte) ─────────────
   Reutilizable: en el grid del inicio (clickeable, abre el detalle) y arriba del
   detalle (sin click, solo informativa). */
function TanqueCard({ r, canWrite, activo, onClick, onEdit }: {
  r: ReporteTanque; canWrite: boolean; activo?: boolean;
  onClick?: () => void; onEdit?: () => void;
}) {
  const cap = Number(r.tanque.capacidad_litros) || 0;
  const capCalc = Number(r.tanque.capacidad_calculada_litros) || 0;
  const disp = Number(r.disponible) || 0;
  const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
  const esBid = esBidon(r.tanque.nombre);
  const esInactivo = r.tanque.estado !== 'activo';
  const clickable = !!onClick;

  // Semáforo de reserva
  let nivelClase = 'optimo';
  let nivelLabel = `${num(pct)}%`;
  if (disp <= 0 && !esBid) {
    nivelClase = 'critico';
    nivelLabel = 'Vacío (0%)';
  } else if (pct < 12) {
    nivelClase = 'critico';
    nivelLabel = `${num(pct)}% · Reserva`;
  } else if (pct < 35) {
    nivelClase = 'medio';
    nivelLabel = `${num(pct)}%`;
  } else {
    nivelClase = 'optimo';
    nivelLabel = `${num(pct)}%`;
  }

  const valorUsd = disp * (Number(r.tanque.tasa_usd_litro) || 0);

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick!(); } : undefined}
      className={`comb-tanque-card${activo ? ' activo' : ''}${esInactivo ? ' inactivo' : ''}`}
      title={clickable ? 'Haz clic para ver el registro de movimientos de este tanque' : undefined}
    >
      <div className="comb-tanque-header">
        <div className="comb-tanque-name-area">
          <span className="comb-tanque-icon">
            {esBid ? '🪣' : r.tanque.es_movil ? '🚚' : '🛢'}
          </span>
          <span className="comb-tanque-name" title={r.tanque.nombre}>
            {r.tanque.nombre}
          </span>
        </div>

        <div className="comb-tanque-badges">
          {esBid && <span className="comb-tanque-badge bidon" title="Bidón para consumo en campo (sin saldo)">bidón</span>}
          {r.tanque.es_movil && !esBid && <span className="comb-tanque-badge movil" title="Tanque móvil">móvil</span>}
          {esInactivo && <span className="comb-tanque-badge inactivo">inactivo</span>}
          {canWrite && onEdit && (
            <button
              type="button"
              className="comb-tanque-edit-btn"
              title="Editar configuración del tanque"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              ✎
            </button>
          )}
        </div>
      </div>

      <div className="comb-tanque-main-metric">
        <div className="comb-tanque-litros">
          {num(disp)}<span>ltrs</span>
        </div>
        {!esBid && (
          <span className={`comb-tanque-pct-chip ${nivelClase}`}>
            {nivelClase === 'critico' && '⚠ '}
            {nivelLabel}
          </span>
        )}
      </div>

      {!esBid && (
        <div className="comb-fluid-gauge" title={`Nivel de llenado: ${num(pct)}% (${num(disp)} / ${num(cap)} L)`}>
          <div className={`comb-fluid-gauge-fill ${nivelClase}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="comb-tanque-info-line">
        {esBid ? (
          <span>Salida directa · Sin saldo en sistema</span>
        ) : (
          <>
            <span>Cap. <strong>{num(cap)}</strong> L{capCalc > 0 ? <> · calc. <strong className="mono">{num(capCalc)}</strong></> : null}</span>
            <span>Tasa <strong className="mono">{money(r.tanque.tasa_usd_litro)}</strong>/L</span>
          </>
        )}
      </div>

      {!esBid && valorUsd > 0 && (
        <div className="comb-tanque-info-line" style={{ marginTop: '-0.35rem' }}>
          <span className="muted">Valor estimado:</span>
          <strong className="mono" style={{ color: 'var(--success, #10b981)' }}>{money(valorUsd)}</strong>
        </div>
      )}

      <div className="comb-tanque-footer-chips">
        <span className="comb-mini-chip entrada" title="Entradas del mes">↓ {num(r.entradas)} L</span>
        <span className="comb-mini-chip uso" title="Despachos / Consumo del mes">⛽ {num(r.uso)} L</span>
        <span className="comb-mini-chip traslado" title="Traslados del mes">↔ {num(r.traslados)} L</span>
      </div>
    </div>
  );
}

type ColId =
  | 'fecha'
  | 'equipo'
  | 'autorizado'
  | 'destino'
  | 'observacion'
  | 'cuaderno'
  | 'saldoDrive'
  | 'diferencia'
  | 'hi'
  | 'hf'
  | 'hrs'
  | 'contFin'
  | 'ltUsados'
  | 'entrada'
  | 'uso'
  | 'traslado'
  | 'retorno'
  | 'merma'
  | 'saldoLtrs'
  | 'montoMov'
  | 'saldoUsd'
  | 'acciones';

const COLUMNAS_TABLA: { id: ColId; label: string; title?: string }[] = [
  { id: 'fecha', label: 'Fecha', title: 'Fecha y hora del movimiento' },
  { id: 'equipo', label: 'Equipo', title: 'Equipo o máquina receptora' },
  { id: 'autorizado', label: 'Autorizado', title: 'Persona que autorizó el movimiento' },
  { id: 'destino', label: 'Destino', title: 'Ubicación o frente de destino' },
  { id: 'observacion', label: 'Observación', title: 'Detalles u observaciones' },
  { id: 'hi', label: 'HI', title: 'Horómetro inicial' },
  { id: 'hf', label: 'HF', title: 'Horómetro final' },
  { id: 'hrs', label: 'Hrs', title: 'Horas trabajadas calculadas' },
  { id: 'contFin', label: 'Cont. fin', title: 'Lectura final del totalizador del surtidor' },
  { id: 'ltUsados', label: 'Lt usados (cont.)', title: 'Litros medidos por el contador' },
  { id: 'entrada', label: 'Entrada', title: 'Litros ingresados al tanque' },
  { id: 'uso', label: 'Uso', title: 'Litros consumidos/despachados' },
  { id: 'traslado', label: 'Traslado', title: 'Litros trasladados hacia otro tanque' },
  { id: 'retorno', label: 'Retorno', title: 'Litros devueltos al tanque' },
  { id: 'merma', label: 'Merma', title: 'Litros de merma o evaporación' },
  { id: 'cuaderno', label: 'Cuaderno', title: 'Registro físico en cuaderno de campo' },
  { id: 'saldoDrive', label: 'Saldo Drive', title: 'Saldo reportado en la hoja de Google Drive' },
  { id: 'diferencia', label: 'Diferencia', title: 'Diferencia contra Google Drive, Cuaderno físico y Contador' },
  { id: 'saldoLtrs', label: 'Saldo ltrs', title: 'Saldo resultante en litros en el tanque' },
  { id: 'montoMov', label: '$ Mov.', title: 'Costo valorizado en USD del movimiento' },
  { id: 'saldoUsd', label: 'Saldo $', title: 'Saldo valorizado en USD en el tanque' },
  { id: 'acciones', label: 'Acciones', title: 'Ver detalle / eliminar' },
];

/* ───────────── Registro de movimientos (filtros + tabla) reutilizable ─────────────
   Se usa tanto para la LISTA ACTUAL (mes en curso) como para cada mes del HISTÓRICO.
   La tabla NO muestra Tanque, HI (horómetro inicial), Cont. ini ni Tasa: esos datos
   quedan disponibles en «Ver detalle». */
function RegistroMovimientos({ sel, movs, userEmail, canWrite, allowDelete, titulo, emptyMsg, loading, onVerDetalle, onBorrar }: {
  sel: TanqueCombustible;
  movs: MovimientoTanque[];        // ya acotados a un mes, en orden cronológico ascendente
  userEmail: string;
  canWrite: boolean;
  allowDelete?: boolean;
  titulo: ReactNode;
  emptyMsg?: string;
  loading?: boolean;
  onVerDetalle: (m: MovimientoTanque) => void;
  onBorrar?: (m: MovimientoTanque) => void;
}) {
  const [fTexto, setFTexto] = useState('');
  const [fTipo, setFTipo] = useState<'todos' | TipoMovTanque>('todos');
  const [fEquipo, setFEquipo] = useState('');
  const [fAutorizado, setFAutorizado] = useState('');
  const [fUbicacion, setFUbicacion] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [ordenDesc, setOrdenDesc] = useState(true);
  const [ordenCampo, setOrdenCampo] = useState<'fecha' | 'contIni' | 'contFin'>('fecha');
  const [correoOpen, setCorreoOpen] = useState(false);
  const [colsVisibles, setColsVisibles] = useState<Record<ColId, boolean>>(() => ({
    fecha: true, equipo: true, autorizado: true, destino: true, observacion: true,
    cuaderno: true, saldoDrive: true, diferencia: true, hi: true, hf: true, hrs: true,
    contFin: true, ltUsados: true, entrada: true, uso: true, traslado: true,
    retorno: true, merma: true, saldoLtrs: true, montoMov: true, saldoUsd: true,
    acciones: true,
  }));
  const [menuColsOpen, setMenuColsOpen] = useState(false);
  const [filtrosAvanzadosOpen, setFiltrosAvanzadosOpen] = useState(false);
  const numColsVisibles = useMemo(() => Object.values(colsVisibles).filter(Boolean).length, [colsVisibles]);

  const conteosPorTipo = useMemo(() => {
    const counts: Record<string, number> = { todos: movs.length, uso: 0, entrada: 0, traslado: 0, retorno: 0, merma: 0 };
    movs.forEach((m) => {
      if (counts[m.tipo] != null) counts[m.tipo]++;
    });
    return counts;
  }, [movs]);

  const numFiltrosAvanzados = useMemo(() => {
    let n = 0;
    if (fEquipo) n++;
    if (fAutorizado) n++;
    if (fUbicacion) n++;
    if (fDesde) n++;
    if (fHasta) n++;
    return n;
  }, [fEquipo, fAutorizado, fUbicacion, fDesde, fHasta]);

  // Orden de columnas reorganizable
  const [ordenColumnas, setOrdenColumnas] = useState<ColId[]>(() => COLUMNAS_TABLA.map((col) => col.id));
  const [colArraste, setColArraste] = useState<ColId | null>(null);
  const [colHover, setColHover] = useState<ColId | null>(null);

  const moverColumna = (origen: ColId | null, destino: ColId) => {
    if (!origen || origen === destino) return;
    setOrdenColumnas((prev) => {
      const idxOrigen = prev.indexOf(origen);
      const idxDestino = prev.indexOf(destino);
      if (idxOrigen === -1 || idxDestino === -1) return prev;
      const nuevo = [...prev];
      nuevo.splice(idxOrigen, 1);
      nuevo.splice(idxDestino, 0, origen);
      return nuevo;
    });
  };

  const moverColumnaPaso = (colId: ColId, direccion: -1 | 1) => {
    setOrdenColumnas((prev) => {
      const idx = prev.indexOf(colId);
      if (idx === -1) return prev;
      const nuevoIdx = idx + direccion;
      if (nuevoIdx < 0 || nuevoIdx >= prev.length) return prev;
      const nuevo = [...prev];
      const [item] = nuevo.splice(idx, 1);
      nuevo.splice(nuevoIdx, 0, item);
      return nuevo;
    });
  };
  // Cuántas fotos tiene cada movimiento (el 📎 n de la lista). Se pide por tandas para no armar una URL enorme.
  const [conteoFotos, setConteoFotos] = useState<Map<string, number>>(new Map());
  const idsMovs = useMemo(() => movs.map((m) => m.id), [movs]);
  const cargarConteoFotos = useCallback(async () => {
    try {
      const total = new Map<string, number>();
      for (let i = 0; i < idsMovs.length; i += 150) {
        for (const [k, v] of await adjuntosCombustible.contar(MODULO_ADJUNTO_TANQUE, idsMovs.slice(i, i + 150))) total.set(k, v);
      }
      setConteoFotos(total);
    } catch { /* sin permiso o sin red: la lista sale sin el 📎 */ }
  }, [idsMovs]);
  useEffect(() => { void cargarConteoFotos(); }, [cargarConteoFotos]);
  useRealtime([adjuntosCombustible.tabla], () => { void cargarConteoFotos(); });
  function ordenarPor(campo: 'fecha' | 'contIni' | 'contFin') {
    if (campo === ordenCampo) setOrdenDesc((d) => !d);
    else { setOrdenCampo(campo); setOrdenDesc(true); }
  }
  // Al cambiar de tanque, limpiamos los filtros.
  useEffect(() => { setFTexto(''); setFTipo('todos'); setFEquipo(''); setFAutorizado(''); setFUbicacion(''); setFDesde(''); setFHasta(''); }, [sel.id]);

  const opcs = useMemo(() => {
    const uniq = (g: (m: MovimientoTanque) => string | null | undefined) =>
      Array.from(new Set(movs.map((m) => (g(m) ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es-VE'));
    return { equipos: uniq((m) => m.equipo), autorizados: uniq((m) => m.autorizado_por), ubicaciones: uniq((m) => m.ubicacion) };
  }, [movs]);

  const movsFiltrados = useMemo(() => {
    const q = norm(fTexto);
    const arr = movs.filter((m) => {
      if (fTipo !== 'todos' && m.tipo !== fTipo) return false;
      if (fEquipo && (m.equipo ?? '') !== fEquipo) return false;
      if (fAutorizado && (m.autorizado_por ?? '') !== fAutorizado) return false;
      if (fUbicacion && (m.ubicacion ?? '') !== fUbicacion) return false;
      if (fDesde && (m.fecha ?? '') < fDesde) return false;
      if (fHasta && (m.fecha ?? '') > fHasta) return false;
      if (q) {
        const hay = [m.fecha, m.hora, m.equipo, m.autorizado_por, m.ubicacion, m.observacion, m.tipo]
          .map((x) => norm(String(x ?? ''))).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (ordenCampo === 'fecha') return ordenDesc ? arr.slice().reverse() : arr;
    return arr.slice().sort((a, b) => {
      const av = ordenCampo === 'contIni' ? a.contador_global_ini : a.contador_global_fin;
      const bv = ordenCampo === 'contIni' ? b.contador_global_ini : b.contador_global_fin;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const d = Number(av) - Number(bv);
      return ordenDesc ? -d : d;
    });
  }, [movs, fTexto, fTipo, fEquipo, fAutorizado, fUbicacion, fDesde, fHasta, ordenDesc, ordenCampo]);

  const hayFiltro = !!(fTexto || fTipo !== 'todos' || fEquipo || fAutorizado || fUbicacion || fDesde || fHasta);
  function limpiarFiltros() { setFTexto(''); setFTipo('todos'); setFEquipo(''); setFAutorizado(''); setFUbicacion(''); setFDesde(''); setFHasta(''); }


  // Detección exhaustiva de diferencias contra Drive, Cuaderno y Contador
  const renderDiferencia = (m: MovimientoTanque) => {
    const diffs: Array<{
      tipo: 'Drive' | 'Cuaderno' | 'Contador';
      diferencia: number;
      detalle: string;
      color: string;
      bg: string;
      border: string;
    }> = [];

    // 1. Diferencia contra Saldo Drive: Saldo Drive vs Saldo Sistema
    if (m.saldo_drive != null && m.saldo_litros != null) {
      const d = Number((m.saldo_drive - m.saldo_litros).toFixed(2));
      diffs.push({
        tipo: 'Drive',
        diferencia: d,
        detalle: `Saldo Drive: ${num(m.saldo_drive)} L vs Sistema: ${num(m.saldo_litros)} L`,
        color: d === 0 ? '#10b981' : d > 0 ? '#38bdf8' : '#f87171',
        bg: d === 0 ? 'rgba(16, 185, 129, 0.12)' : d > 0 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        border: d === 0 ? 'rgba(16, 185, 129, 0.3)' : d > 0 ? 'rgba(56, 189, 248, 0.3)' : 'rgba(239, 68, 68, 0.3)',
      });
    }

    // 2. Diferencia contra Cuaderno físico: Cuaderno vs Despacho en Sistema
    if (m.cuaderno_litros != null && m.litros != null && (m.tipo === 'uso' || m.tipo === 'traslado')) {
      const d = Number((m.cuaderno_litros - m.litros).toFixed(2));
      if (d !== 0) {
        diffs.push({
          tipo: 'Cuaderno',
          diferencia: d,
          detalle: `Cuaderno físico: ${num(m.cuaderno_litros)} L vs Despacho registrado: ${num(m.litros)} L`,
          color: d > 0 ? '#fbbf24' : '#f87171',
          bg: d > 0 ? 'rgba(251, 191, 36, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: d > 0 ? 'rgba(251, 191, 36, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        });
      }
    }

    // 3. Diferencia contra Contador mecánico / flujómetro del Surtidor: Contador vs Despacho en Sistema
    if (m.contador_global_dif != null && m.litros != null && (m.tipo === 'uso' || m.tipo === 'traslado')) {
      const d = Number((m.contador_global_dif - m.litros).toFixed(2));
      if (d !== 0) {
        diffs.push({
          tipo: 'Contador',
          diferencia: d,
          detalle: `Contador surtidor: ${num(m.contador_global_dif)} L vs Despacho registrado: ${num(m.litros)} L`,
          color: d > 0 ? '#a855f7' : '#f87171',
          bg: d > 0 ? 'rgba(168, 85, 247, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: d > 0 ? 'rgba(168, 85, 247, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        });
      }
    }

    if (diffs.length === 0) {
      return <span className="muted">—</span>;
    }

    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
        {diffs.map((df) => {
          const esCero = df.diferencia === 0;
          const textoSigno = esCero ? '✓ 0 L' : (df.diferencia > 0 ? `+${num(df.diferencia)} L` : `${num(df.diferencia)} L`);
          const label = diffs.length > 1 ? `${df.tipo}: ${textoSigno}` : (df.tipo !== 'Drive' ? `${df.tipo}: ${textoSigno}` : textoSigno);

          return (
            <span
              key={df.tipo}
              title={df.detalle}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: '.72rem',
                fontWeight: 700,
                color: df.color,
                background: df.bg,
                padding: '1px 5px',
                borderRadius: '4px',
                border: `1px solid ${df.border}`,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    );
  };

  // Renderizador de encabezados de columna con soporte de arrastrar y soltar (Drag and Drop)
  const renderTh = (colId: ColId) => {
    const isDragging = colArraste === colId;
    const isOver = colHover === colId;
    const baseStyle: React.CSSProperties = {
      cursor: colId !== 'acciones' ? 'grab' : 'default',
      opacity: isDragging ? 0.4 : 1,
      borderLeft: isOver ? '3px solid var(--primary, #f97316)' : undefined,
      background: isOver ? 'rgba(249, 115, 22, 0.08)' : undefined,
      userSelect: 'none',
      whiteSpace: 'nowrap',
    };

    const dragProps = colId !== 'acciones' ? {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', colId);
        setColArraste(colId);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setColHover(colId);
      },
      onDragLeave: () => setColHover(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        moverColumna(colArraste, colId);
        setColArraste(null);
        setColHover(null);
      },
    } : {};

    const colDef = COLUMNAS_TABLA.find((c) => c.id === colId);
    const titleText = colDef?.title ? `${colDef.title} · (Arrastra para reorganizar)` : 'Arrastra para reorganizar columna';

    switch (colId) {
      case 'fecha': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Fecha</th>;
      case 'equipo': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Equipo</th>;
      case 'autorizado': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Autorizado</th>;
      case 'destino': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Destino</th>;
      case 'observacion': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Observación</th>;
      case 'hi': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>HI</th>;
      case 'hf': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>HF</th>;
      case 'hrs': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Hrs</th>;
      case 'contFin': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Cont. fin</th>;
      case 'ltUsados': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Lt usados (cont.)</th>;
      case 'entrada': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Entrada</th>;
      case 'uso': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Uso</th>;
      case 'traslado': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Traslado</th>;
      case 'retorno': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Retorno</th>;
      case 'merma': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Merma</th>;
      case 'cuaderno': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Cuaderno</th>;
      case 'saldoDrive': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Saldo Drive</th>;
      case 'diferencia': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Diferencia</th>;
      case 'saldoLtrs': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Saldo ltrs</th>;
      case 'montoMov': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>$ Mov.</th>;
      case 'saldoUsd': return <th key={colId} title={titleText} style={baseStyle} {...dragProps}>Saldo $</th>;
      case 'acciones': return <th key={colId} style={{ width: 100 }}></th>;
      default: return null;
    }
  };

  // Renderizador de celdas por columna activa
  const renderCelda = (m: MovimientoTanque, colId: ColId) => {
    switch (colId) {
      case 'fecha':
        return (
          <td key={colId} className="mono" style={{ whiteSpace: 'nowrap' }}>
            {m.fecha}{m.hora ? <div className="muted" style={{ fontSize: '.7rem' }}>{m.hora}</div> : null}
          </td>
        );
      case 'equipo':
        return <td key={colId}>{m.equipo || '—'}</td>;
      case 'autorizado':
        return <td key={colId} className="muted">{m.autorizado_por || '—'}</td>;
      case 'destino':
        return <td key={colId} className="muted">{m.ubicacion || '—'}</td>;
      case 'observacion':
        return <td key={colId} className="muted" style={{ maxWidth: 180 }}>{m.observacion || '—'}</td>;
      case 'hi':
        return <td key={colId} className="mono muted">{m.horometro_ini != null ? num(m.horometro_ini) : '—'}</td>;
      case 'hf':
        return <td key={colId} className="mono muted">{m.horometro_fin != null ? num(m.horometro_fin) : '—'}</td>;
      case 'hrs':
        return <td key={colId} className="mono muted">{m.horas_utilizadas ? num(m.horas_utilizadas) : '—'}</td>;
      case 'contFin':
        return (
          <td key={colId} className="mono muted"
              title={m.contador_global_fin != null && m.contador_marcaba_fin !== m.contador_global_fin
                ? `Acumulado del sistema: ${num(m.contador_global_fin)}` : undefined}>
            {m.contador_marcaba_fin != null ? num(m.contador_marcaba_fin) : '—'}
          </td>
        );
      case 'ltUsados':
        return <td key={colId} className="mono muted">{m.contador_global_dif ? num(m.contador_global_dif) : '—'}</td>;
      case 'entrada':
        return <td key={colId} className="mono" style={{ color: 'var(--primary-3)' }}>{m.tipo === 'entrada' ? num(m.litros) : ''}</td>;
      case 'uso':
        return <td key={colId} className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'uso' ? num(m.litros) : ''}</td>;
      case 'traslado':
        return <td key={colId} className="mono" style={{ color: 'var(--warning)' }}>{m.tipo === 'traslado' ? num(m.litros) : ''}</td>;
      case 'retorno':
        return <td key={colId} className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{m.tipo === 'retorno' ? num(m.litros) : ''}</td>;
      case 'merma':
        return <td key={colId} className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'merma' ? num(m.litros) : ''}</td>;
      case 'cuaderno':
        return (
          <td key={colId} style={{ whiteSpace: 'nowrap' }}>
            {m.registrado_en_cuaderno ? (
              <span className="comb-chip-cuaderno">
                ✓ {m.cuaderno_litros != null ? `${num(m.cuaderno_litros)} L` : 'Sí'}
              </span>
            ) : m.registrado_en_cuaderno === false ? (
              <span style={{
                fontSize: '.72rem',
                color: '#94a3b8',
                background: 'rgba(255,255,255,0.04)',
                padding: '2px 5px',
                borderRadius: '4px',
              }}>
                ✕ No
              </span>
            ) : (
              <span className="muted">—</span>
            )}
          </td>
        );
      case 'saldoDrive':
        return (
          <td key={colId} className="mono" style={{ whiteSpace: 'nowrap' }}>
            {m.saldo_drive != null ? (
              <span className="comb-chip-drive">
                {num(m.saldo_drive)} L
              </span>
            ) : m.registrado_en_drive ? (
              <span style={{ fontSize: '.72rem', color: '#38bdf8' }}>✓ Reg.</span>
            ) : m.registrado_en_drive === false ? (
              <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>✕ No</span>
            ) : (
              <span className="muted">—</span>
            )}
          </td>
        );
      case 'diferencia':
        return (
          <td key={colId} className="mono" style={{ whiteSpace: 'nowrap' }}>
            {renderDiferencia(m)}
          </td>
        );
      case 'saldoLtrs':
        return <td key={colId} className="mono"><strong>{num(m.saldo_litros)}</strong></td>;
      case 'montoMov':
        return <td key={colId} className="mono">{money(m.monto_usd)}</td>;
      case 'saldoUsd':
        return <td key={colId} className="mono"><strong>{money(m.saldo_usd)}</strong></td>;
      case 'acciones':
        return (
          <td key={colId} style={{ whiteSpace: 'nowrap' }}>
            <div className="comb-row-actions">
              <button className="comb-row-btn" title="Ver detalle completo" onClick={() => onVerDetalle(m)}>
                👁 Ver
              </button>
              {(conteoFotos.get(m.id) ?? 0) > 0 && (
                <button className="comb-row-btn" title="Ver fotos adjuntas" onClick={() => onVerDetalle(m)}>
                  📷 {conteoFotos.get(m.id)}
                </button>
              )}
              {canWrite && allowDelete && onBorrar && (
                <button className="comb-row-btn danger" title="Eliminar (revierte saldo)" onClick={() => onBorrar(m)}>
                  🗑
                </button>
              )}
            </div>
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="comb-movs-container">
      {!!movs.length && (
        <>
          {/* Fila Superior: Título + Botones de Exportación */}
          <div className="comb-movs-top-bar">
            <div className="comb-movs-title-group">
              <span className="comb-movs-title-text">{titulo}</span>
            </div>
            <div className="comb-export-btns">
              <button
                type="button"
                className="comb-export-btn"
                disabled={!movsFiltrados.length}
                title="Descargar PDF del registro (con filtros aplicados)"
                onClick={() => void descargarMovimientosTanquePdf(sel, movsFiltrados, { filtro: hayFiltro ? 'filtrado' : undefined }).catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'))}
              >
                ↓ PDF
              </button>
              <button
                type="button"
                className="comb-export-btn"
                disabled={!movsFiltrados.length}
                title="Descargar Excel del registro (con filtros aplicados)"
                onClick={() => void descargarMovimientosTanqueExcel(sel, movsFiltrados).catch((e) => toast(mensajeError(e, 'No se pudo generar el Excel'), 'error'))}
              >
                📊 Excel
              </button>
              <button
                type="button"
                className="comb-export-btn"
                disabled={!movsFiltrados.length}
                title="Enviar el registro por correo (con filtros aplicados)"
                onClick={() => setCorreoOpen(true)}
              >
                ✉ Correo
              </button>
            </div>
          </div>

          {/* Fila de Segmented Pills por Tipo de Movimiento */}
          <div className="comb-type-pills" role="tablist" aria-label="Filtrar por tipo de movimiento">
            {[
              { id: 'todos', label: 'Todos', icon: '📋' },
              { id: 'uso', label: 'Uso / Despacho', icon: '⛽' },
              { id: 'entrada', label: 'Entradas', icon: '⬇' },
              { id: 'traslado', label: 'Traslados', icon: '↔' },
              { id: 'retorno', label: 'Retornos', icon: '↩' },
              { id: 'merma', label: 'Mermas', icon: '🔻' },
            ].map((tp) => {
              const activo = fTipo === tp.id;
              const count = conteosPorTipo[tp.id] ?? 0;
              return (
                <button
                  key={tp.id}
                  type="button"
                  className={`comb-type-pill${activo ? ' active' : ''}`}
                  onClick={() => setFTipo(tp.id as 'todos' | TipoMovTanque)}
                  role="tab"
                  aria-selected={activo}
                >
                  <span>{tp.icon}</span>
                  <span>{tp.label}</span>
                  <span className="pill-badge">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Barra de Filtros Compacta */}
          <div className="comb-filterbar-compact">
            <div className="comb-filterbar-left">
              {/* Buscador inteligente */}
              <div className="comb-search-box">
                <span className="comb-search-icon">🔍</span>
                <input
                  type="search"
                  value={fTexto}
                  onChange={(e) => setFTexto(e.target.value)}
                  placeholder="Buscar por equipo, autorizado, destino, tipo..."
                />
                {fTexto && (
                  <button
                    type="button"
                    className="comb-search-clear"
                    onClick={() => setFTexto('')}
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Botón Filtros Avanzados (con badge de cantidad activa) */}
              <button
                type="button"
                className={`btn btn-sm ${numFiltrosAvanzados > 0 ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFiltrosAvanzadosOpen((v) => !v)}
                title="Filtros detallados por equipo, fechas y destino"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontWeight: 600 }}
              >
                <span>⚙ Filtros</span>
                {numFiltrosAvanzados > 0 && (
                  <span style={{
                    background: '#f59e0b',
                    color: '#000',
                    fontSize: '.7rem',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '999px',
                  }}>
                    {numFiltrosAvanzados}
                  </span>
                )}
                <span style={{ fontSize: '.7rem', opacity: 0.7 }}>{filtrosAvanzadosOpen ? '▲' : '▼'}</span>
              </button>

              {hayFiltro && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={limpiarFiltros}
                  title="Restablecer todos los filtros"
                  style={{ color: 'var(--danger, #ef4444)' }}
                >
                  ✕ Limpiar
                </button>
              )}
            </div>

            <div className="comb-filterbar-right">
              {/* Botones de orden */}
              <button
                type="button"
                className={`btn btn-sm ${ordenCampo === 'fecha' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => ordenarPor('fecha')}
                title="Ordenar cronológicamente"
                style={{ fontSize: '.78rem' }}
              >
                Fecha {ordenCampo === 'fecha' ? (ordenDesc ? '↓' : '↑') : ''}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${ordenCampo === 'contFin' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => ordenarPor('contFin')}
                title="Ordenar por lectura final del contador"
                style={{ fontSize: '.78rem' }}
              >
                Cont. F {ordenCampo === 'contFin' ? (ordenDesc ? '↓' : '↑') : ''}
              </button>

              {/* Selector de Columnas */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${numColsVisibles < COLUMNAS_TABLA.length ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setMenuColsOpen((v) => !v)}
                  title="Elegir qué columnas ver u ocultar en la tabla"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem' }}
                >
                  👁 Columnas ({numColsVisibles}/{COLUMNAS_TABLA.length}) ▾
                </button>
                {menuColsOpen && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                      onClick={() => setMenuColsOpen(false)}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        right: 0,
                        width: '240px',
                        maxHeight: '380px',
                        overflowY: 'auto',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.6)',
                        padding: '.6rem .75rem',
                        zIndex: 999,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '.4rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '.78rem', color: '#f1f5f9' }}>Columnas y orden</span>
                        <div style={{ display: 'flex', gap: '.3rem' }}>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => {
                              const all = {} as Record<ColId, boolean>;
                              COLUMNAS_TABLA.forEach((col) => { all[col.id] = true; });
                              setColsVisibles(all);
                            }}
                            style={{ fontSize: '.7rem', padding: '1px 5px' }}
                          >
                            Todas
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => {
                              const minCols = {} as Record<ColId, boolean>;
                              COLUMNAS_TABLA.forEach((col) => {
                                minCols[col.id] = col.id === 'fecha' || col.id === 'equipo' || col.id === 'uso' || col.id === 'saldoLtrs' || col.id === 'acciones';
                              });
                              setColsVisibles(minCols);
                            }}
                            style={{ fontSize: '.7rem', padding: '1px 5px' }}
                          >
                            Mínimo
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => setOrdenColumnas(COLUMNAS_TABLA.map((col) => col.id))}
                            title="Restablecer orden predeterminado"
                            style={{ fontSize: '.7rem', padding: '1px 5px', color: '#38bdf8' }}
                          >
                            ↺ Orden
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', maxHeight: '340px', overflowY: 'auto' }}>
                        {ordenColumnas.map((colId, index) => {
                          const colDef = COLUMNAS_TABLA.find((col) => col.id === colId) || { id: colId, label: colId };
                          return (
                            <div
                              key={colId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '.4rem',
                                padding: '2px 4px',
                                borderRadius: '4px',
                                background: colsVisibles[colId] ? 'rgba(255,255,255,0.03)' : 'transparent',
                              }}
                            >
                              <label
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '.5rem',
                                  fontSize: '.78rem',
                                  color: colsVisibles[colId] ? '#f8fafc' : '#64748b',
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  flex: 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={colsVisibles[colId]}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setColsVisibles((prev) => ({ ...prev, [colId]: checked }));
                                  }}
                                  style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                />
                                <span>{colDef.label}</span>
                              </label>
                              <div style={{ display: 'flex', gap: '2px' }}>
                                <button
                                  type="button"
                                  disabled={index === 0}
                                  onClick={() => moverColumnaPaso(colId, -1)}
                                  title="Mover a la izquierda / antes"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: index === 0 ? '#475569' : '#94a3b8',
                                    cursor: index === 0 ? 'default' : 'pointer',
                                    fontSize: '.68rem',
                                    padding: '1px 3px',
                                  }}
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={index === ordenColumnas.length - 1}
                                  onClick={() => moverColumnaPaso(colId, 1)}
                                  title="Mover a la derecha / después"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: index === ordenColumnas.length - 1 ? '#475569' : '#94a3b8',
                                    cursor: index === ordenColumnas.length - 1 ? 'default' : 'pointer',
                                    fontSize: '.68rem',
                                    padding: '1px 3px',
                                  }}
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <span className="muted mono" style={{ fontSize: '.78rem', marginLeft: '.25rem' }}>
                {movsFiltrados.length}/{movs.length}
              </span>
            </div>
          </div>

          {/* Panel Desplegable de Filtros Avanzados */}
          {filtrosAvanzadosOpen && (
            <div className="comb-filtros-avanzados-panel">
              <div className="comb-filtro-field">
                <span className="comb-filtro-label">Equipo receptor</span>
                <SearchSelect
                  value={fEquipo}
                  onChange={setFEquipo}
                  placeholder="🔍 Todo equipo…"
                  options={[{ value: '', label: 'Todo equipo' }, ...opcs.equipos.map((v) => ({ value: v, label: v }))]}
                />
              </div>

              <div className="comb-filtro-field">
                <span className="comb-filtro-label">Autorizado por</span>
                <SearchSelect
                  value={fAutorizado}
                  onChange={setFAutorizado}
                  placeholder="🔍 Todo autorizado…"
                  options={[{ value: '', label: 'Todo autorizado' }, ...opcs.autorizados.map((v) => ({ value: v, label: v }))]}
                />
              </div>

              <div className="comb-filtro-field">
                <span className="comb-filtro-label">Destino / Frente</span>
                <SearchSelect
                  value={fUbicacion}
                  onChange={setFUbicacion}
                  placeholder="🔍 Todo destino…"
                  options={[{ value: '', label: 'Todo destino' }, ...opcs.ubicaciones.map((v) => ({ value: v, label: v }))]}
                />
              </div>

              <div className="comb-filtro-field">
                <span className="comb-filtro-label">Desde fecha</span>
                <input
                  className="input"
                  type="date"
                  value={fDesde}
                  onChange={(e) => setFDesde(e.target.value)}
                />
              </div>

              <div className="comb-filtro-field">
                <span className="comb-filtro-label">Hasta fecha</span>
                <input
                  className="input"
                  type="date"
                  value={fHasta}
                  onChange={(e) => setFHasta(e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}

      {loading ? (
        <EmptyState message="Cargando movimientos…" icon="◔" />
      ) : !movs.length ? (
        <EmptyState message={emptyMsg ?? 'Sin movimientos.'} icon="🛢" />
      ) : (
        <div className="comb-table-wrap">
          <table className="comb-table">
            <thead>
              <tr>
                {ordenColumnas.map((colId) => {
                  if (!colsVisibles[colId]) return null;
                  return renderTh(colId);
                })}
              </tr>
            </thead>
            <tbody>
              {!movsFiltrados.length && (
                <tr>
                  <td colSpan={Math.max(1, numColsVisibles)} className="muted" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                    Ningún movimiento coincide con los filtros aplicados.
                  </td>
                </tr>
              )}
              {movsFiltrados.map((m) => (
                <tr key={m.id}>
                  {ordenColumnas.map((colId) => {
                    if (!colsVisibles[colId]) return null;
                    return renderCelda(m, colId);
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {correoOpen && (
        <CorreoReporteModal
          titulo={`Enviar registro · ${sel.nombre}`}
          descripcion={`Se enviará el PDF del registro de ${sel.nombre} (${movsFiltrados.length} movimiento(s)${hayFiltro ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={userEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarMovimientosTanquePorCorreo(sel, movsFiltrados, emails, { filtro: hayFiltro ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────── Modal: Histórico de Movimientos (por tanque y por mes) ─────────────
   Tarjetas de tanques → al elegir uno, sus movimientos de meses ANTERIORES al actual,
   agrupados por mes, con filtros, búsqueda y reportes. El mes en curso NO aparece aquí
   (ese está en la lista actual). No se reinicia saldo/horómetro/contador: solo es una
   vista segmentada por mes de los mismos movimientos. */
function HistoricoMovimientosModal({ tanques, reporte, userEmail, mesActual, reloadKey, onVerDetalle, onClose }: {
  tanques: TanqueCombustible[];
  reporte: ReporteTanque[];
  userEmail: string;
  mesActual: string;
  reloadKey: number;
  onVerDetalle: (m: MovimientoTanque) => void;
  onClose: () => void;
}) {
  const [tankId, setTankId] = useState('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState('');
  const tank = useMemo(() => tanques.find((t) => t.id === tankId) ?? null, [tanques, tankId]);

  useEffect(() => {
    if (!tankId) { setMovs([]); setMes(''); return; }
    let cancel = false;
    setLoading(true);
    listMovimientosTanque(tankId).then((ms) => {
      if (cancel) return;
      // Solo meses ANTERIORES al mes en curso (el actual vive en la lista actual).
      const previos = ms.filter((m) => mesDe(m.fecha) < mesActual);
      setMovs(previos);
      const meses = Array.from(new Set(previos.map((m) => mesDe(m.fecha)).filter(Boolean))).sort();
      // Conservar el mes que el usuario está viendo (si sigue existiendo tras recargar);
      // si no, mostrar el más reciente.
      setMes((prev) => (prev && meses.includes(prev) ? prev : (meses[meses.length - 1] ?? '')));
    }).catch((e) => { if (!cancel) toast(mensajeError(e, 'No se pudo cargar el histórico'), 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
    // reloadKey: al editar/eliminar un movimiento (o por realtime) se vuelve a consultar.
  }, [tankId, mesActual, reloadKey]);

  const meses = useMemo(() => Array.from(new Set(movs.map((m) => mesDe(m.fecha)).filter(Boolean))).sort().reverse(), [movs]);
  const movsMes = useMemo(() => movs.filter((m) => mesDe(m.fecha) === mes), [movs, mes]);

  return (
    <Modal title="📚 Histórico de Movimientos" size="xl" className="comb-modal comb-modal-xl" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="comb-modal-wrap">
        {!tankId ? (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Elige un tanque para ver sus movimientos de meses anteriores, agrupados por mes.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {reporte.map((r) => {
              const cap = Number(r.tanque.capacidad_litros) || 0;
              const disp = Number(r.disponible) || 0;
              const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
              return (
                <div key={r.tanque.id} role="button" tabIndex={0} onClick={() => setTankId(r.tanque.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTankId(r.tanque.id); }} className="card"
                  style={{ textAlign: 'left', cursor: 'pointer', opacity: r.tanque.estado === 'activo' ? 1 : 0.55 }}>
                  <div className="card-title"><span>{esBidon(r.tanque.nombre) ? '🪣' : r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}</span></div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }} className="mono">{num(disp)} <span style={{ fontSize: '.8rem', fontWeight: 500 }}>ltrs</span></div>
                  <div style={{ height: 7, borderRadius: 5, background: 'var(--surface-2)', margin: '.5rem 0', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct < 12 ? 'var(--danger)' : 'var(--primary)' }} />
                  </div>
                  <div className="muted" style={{ fontSize: '.76rem' }}>
                    {esBidon(r.tanque.nombre) ? (
                      <span>Salida directa · Sin saldo</span>
                    ) : (
                      <>Cap. {num(cap)} ltrs · Tasa <strong className="mono">{money(r.tanque.tasa_usd_litro)}</strong>/ltrs</>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
                    ↓{num(r.entradas)} · ⛽{num(r.uso)} · ↔{num(r.traslados)} ltrs
                  </div>
                </div>
              );
            })}
            {!reporte.length && <div className="card"><p className="muted" style={{ margin: 0 }}>Sin tanques.</p></div>}
          </div>
        </>
      ) : (
        <>
          <div className="page-head" style={{ marginBottom: '.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setTankId('')}>← Tanques</button>
              <h3 style={{ margin: 0 }}>{esBidon(tank?.nombre) ? '🪣' : tank?.es_movil ? '🚚' : '🛢'} {tank?.nombre}</h3>
              {!!meses.length && (
                <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.82rem' }}>
                  Mes
                  <select className="select" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 'auto' }}>
                    {meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
          {loading ? <EmptyState message="Cargando…" icon="◔" /> : !meses.length ? (
            <EmptyState message="Este tanque aún no tiene meses anteriores en el histórico." icon="📚" />
          ) : tank ? (
            <RegistroMovimientos
              sel={tank}
              movs={movsMes}
              userEmail={userEmail}
              canWrite={false}
              titulo={`Movimientos · ${nombreMes(mes)}`}
              emptyMsg="Sin movimientos en este mes."
              onVerDetalle={onVerDetalle}
            />
          ) : null}
        </>
      )}
      </div>
    </Modal>
  );
}

/* ───────────── Modal: nuevo movimiento ───────────── */

function MovimientoModal({ tanques, tanqueSel, catalogos, actor, actorName, onClose, onSaved }: {
  tanques: TanqueCombustible[]; tanqueSel: TanqueCombustible; catalogos: CatalogoCombustible[];
  actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [tanqueId, setTanqueId] = useState(tanqueSel.id);
  const [tipo, setTipo] = useState<TipoMovTanque>('uso');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(() => horaSistema());
  const [equipo, setEquipo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [litros, setLitros] = useState('');
  const [costo, setCosto] = useState('');
  const [destinoId, setDestinoId] = useState('');
  // Medidores del equipo (integrados al movimiento, ya no en un modal aparte).
  const [hi, setHi] = useState('');
  const [hf, setHf] = useState('');
  const [km, setKm] = useState('');         // kilometraje (odómetro) del vehículo
  const [ci, setCi] = useState('');
  const [cf, setCf] = useState('');
  // Cuando el HI / contador inicial se traen del último del equipo, quedan BLOQUEADOS (no se modifican).
  const [hiAuto, setHiAuto] = useState(false);
  const [ciAuto, setCiAuto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Merma de recepción (02/10/2026): lo que llegó de verdad en una entrada o un traslado.
  const [recibidos, setRecibidos] = useState('');
  const [motivoMerma, setMotivoMerma] = useState('');
  const [registradoEnCuaderno, setRegistradoEnCuaderno] = useState(false);
  const [cuadernoLitros, setCuadernoLitros] = useState('');
  const [registradoEnDrive, setRegistradoEnDrive] = useState(false);
  const [saldoDrive, setSaldoDrive] = useState('');
  const [movsTanque, setMovsTanque] = useState<MovimientoTanque[]>([]);
  const [pctMermaInput, setPctMermaInput] = useState<string>(() => {
    const t = tanques.find((x) => x.id === tanqueId);
    return String(t?.merma_implicita_pct ?? DEFAULT_MERMA_IMPLICITA_PCT);
  });
  const pctMermaImplicita = useMemo(() => {
    const limpio = pctMermaInput.trim().replace(',', '.');
    if (limpio === '') return 0;
    const n = Number(limpio);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MERMA_IMPLICITA_PCT;
  }, [pctMermaInput]);
  const [verRespaldoMovs, setVerRespaldoMovs] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const { can } = usePermissions();
  const isAdmin = can('combustible', 'full'); // Full control de Combustible guarda mermas fuera de margen (17/10/2026).

  useEffect(() => {
    const t = tanques.find((x) => x.id === tanqueId);
    setPctMermaInput(String(t?.merma_implicita_pct ?? DEFAULT_MERMA_IMPLICITA_PCT));
  }, [tanqueId, tanques]);

  useEffect(() => {
    if (tipo === 'merma' && tanqueId) {
      listMovimientosTanque(tanqueId).then(setMovsTanque).catch(() => {});
    }
  }, [tipo, tanqueId]);

  const resumenMerma = useMemo(() => {
    if (tipo !== 'merma') return null;
    return calcularMermaImplicitaTanque({
      movimientos: movsTanque,
      porcentaje: pctMermaImplicita,
    });
  }, [tipo, movsTanque, pctMermaImplicita]);

  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);

  // Igual que en el teléfono (27/10/2026): agrupado por apartado de Maquinaria y buscable por el
  // alias / placa de la ficha. En la PC el nombre oficial queda como label y el alias de hint.
  const fichas = useFichasEquipos();
  const tanqueActualObj = useMemo(() => tanques.find((t) => t.id === tanqueId) ?? tanqueSel, [tanques, tanqueId, tanqueSel]);
  const equiposOptions = useMemo(() => [
    { value: '', label: '— elige el equipo —' },
    ...opcionesEquipos({
      catalogo: catalogos.filter((c) => c.tipo === 'equipo'),
      fichas,
      bidones: esBidon(tanqueActualObj?.nombre ?? '') ? tanques.filter((t) => esBidon(t.nombre)).map((t) => t.nombre) : [],
      modo: 'pc',
      tanqueActual: tanqueActualObj,
      incluirValor: equipo,
    }),
  ], [catalogos, tanques, fichas, tanqueActualObj, equipo]);

  // El HORÓMETRO inicial sí es del vehículo: autocarga con el último HF de ese equipo.
  const cargarHi = useCallback(() => {
    if (!equipo) { setHiAuto(false); return; }
    ultimoHorometroEquipo(equipo).then((ult) => {
      if (ult != null) { setHi(String(ult)); setHiAuto(true); } else { setHiAuto(false); }
    }).catch(() => {});
    // KILOMETRAJE: precarga la última lectura del odómetro del equipo (editable; el chofer la sube).
    ultimoKilometrajeEquipo(equipo).then((ult) => { if (ult != null) setKm(String(ult)); }).catch(() => {});
  }, [equipo]);
  useEffect(() => { cargarHi(); }, [cargarHi]);

  // El CONTADOR GLOBAL es por TANQUE: el contador final de un movimiento es el inicial del
  // siguiente del mismo tanque. Para un movimiento normal trae el último del tanque seleccionado;
  // para un traslado trae el del tanque ORIGEN (que es justamente el tanque seleccionado), y
  // ese contador se refleja luego en el tanque destino. Si trae dato, se bloquea.
  const cargarCi = useCallback(() => {
    if (!tanqueId) { setCiAuto(false); return; }
    ultimoContadorTanque(tanqueId).then((ult) => {
      if (ult != null) { setCi(String(ult)); setCiAuto(true); } else { setCi(''); setCiAuto(false); }
    }).catch(() => {});
  }, [tanqueId]);
  useEffect(() => { cargarCi(); }, [cargarCi]);

  // En vivo: si se elimina/edita/agrega un movimiento o se actualiza un horómetro en Maquinaria,
  // el HI del equipo y el contador del tanque se vuelven a consultar para no quedar desfasados.
  useRealtime(['combustible_tanque_movimientos', 'combustible_contador_cambios', 'maquinaria_lecturas', 'maquinaria_equipos'], () => { cargarHi(); cargarCi(); });

  const hrs = hi !== '' && hf !== '' ? Number(hf) - Number(hi) : null;
  // Litros usados según el contador del surtidor (final − inicial). No se modifica.
  const litrosContador = ci !== '' && cf !== '' ? Number(cf) - Number(ci) : null;

  // El contador al terminar es donde arranca el siguiente: vacío se guarda inicial + litros.
  const cfPropuesto = pasaPorSurtidor(tipo) ? contadorFinalPropuesto(ci === '' ? null : Number(ci), Number(litros) || 0) : null;

  const destinoSelTanque = tanques.find((t) => t.id === destinoId);
  const destinoEsBidon = tipo === 'traslado' && !!destinoSelTanque && esBidon(destinoSelTanque.nombre);

  // Merma de recepción: en una entrada mide el tanque elegido; en un traslado, el que recibe (salvo si es bidón).
  const tanqueRecibe = tipo === 'entrada' ? tanques.find((t) => t.id === tanqueId)
    : tipo === 'traslado' && destinoId && destinoId !== DESTINO_MGG && !destinoEsBidon ? tanques.find((t) => t.id === destinoId) : undefined;
  const margenRecibe = tanqueRecibe?.margen_merma_pct ?? MARGEN_MERMA_DEFECTO;
  const recepcion = tanqueRecibe
    ? mermaDeRecepcion(Number(litros) || 0, recibidos.trim() === '' ? null : Number(recibidos.replace(',', '.')), margenRecibe)
    : { ok: null, error: null };

  // No se saca más de lo que hay (09/10/2026): uso, merma, traslado y envío a MGG restan
  // del tanque elegido. Se avisa mientras se escribe y el botón no deja guardar.
  const tanqueOrigen = tanques.find((t) => t.id === tanqueId);
  const origenEsBidon = !!tanqueOrigen && esBidon(tanqueOrigen.nombre);
  const origenVacio = !!tanqueOrigen && !origenEsBidon && saleDelTanque(tipo) && tanqueSinLitros(tanqueOrigen.saldo_litros);
  const errSaldo = tanqueOrigen && saleDelTanque(tipo)
    ? errorSaldoInsuficiente({ nombre: tanqueOrigen.nombre, saldo: tanqueOrigen.saldo_litros, litros: Number(litros) || 0 })
    : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const litrosNum = Number(litros) || 0;
    if (litros.trim() === '' || litrosNum === 0) { setError('Indica los litros (se admiten negativos, como en el Excel).'); return; }
    if (tipo === 'traslado' && !destinoId) { setError('Indica el tanque destino del traslado.'); return; }
    if (tipo === 'traslado' && destinoId === tanqueId) { setError('El tanque destino debe ser distinto.'); return; }
    if (errSaldo) { setError(errSaldo); return; }
    // HF < HI dejaría horas negativas y el próximo surtido del equipo arrancaría mal.
    const errHor = errorHorometro(hi === '' ? null : Number(hi), hf === '' ? null : Number(hf));
    if (errHor) { setError(errHor); return; }
    if (recepcion.error) { setError(recepcion.error); return; }
    if (recepcion.ok?.excede && !motivoMerma.trim()) { setError(`La merma pasa el margen de ${margenRecibe}%: indica el motivo.`); return; }
    if (recepcion.ok?.excede && !isAdmin) { setError(`La merma pasa el margen de ${margenRecibe}%: solo un administrador puede guardarla.`); return; }
    const rec = tanqueRecibe && recibidos.trim() !== '' ? { recibidos: Number(recibidos.replace(',', '.')), motivo: motivoMerma } : null;
      const cLitrosNum = registradoEnCuaderno
        ? (cuadernoLitros.trim() !== '' ? Number(cuadernoLitros.replace(',', '.')) : litrosNum)
        : null;
      const sDriveNum = registradoEnDrive
        ? (saldoDrive.trim() !== '' ? Number(saldoDrive.replace(',', '.')) : null)
        : null;
      const campos = {
        fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
        horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
        kilometraje: km === '' ? null : Number(km),
        contadorGlobalIni: ci === '' ? null : Number(ci), contadorGlobalFin: cf === '' ? null : Number(cf),
        registrado_en_cuaderno: registradoEnCuaderno,
        cuaderno_litros: cLitrosNum,
        registrado_en_drive: registradoEnDrive,
        saldo_drive: sDriveNum,
      };
    setSaving(true);
    try {
      let mov: MovimientoTanque;
      if (tipo === 'entrada') mov = await registrarEntrada({ tanqueId, litros: litrosNum, costoLitro: Number(costo) || 0, campos, actor, actorName, recepcion: rec });
      else if (tipo === 'uso') mov = await registrarUso({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (tipo === 'retorno') mov = await registrarRetorno({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (tipo === 'merma') mov = await registrarMerma({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else if (destinoId === DESTINO_MGG) mov = await registrarTrasladoMGG({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else mov = await registrarTraslado({ tanqueId, litros: litrosNum, tanqueDestinoId: destinoId || null, campos, actor, actorName, recepcion: rec });

      if (adjuntos.length && mov?.id) {
        try {
          const r = await adjuntosCombustible.subir(MODULO_ADJUNTO_TANQUE, mov.id, adjuntos, actor);
          for (const f of r.fallos) toast(`Movimiento guardado, pero un soporte no se pudo subir: ${f}`, 'error');
        } catch {
          toast('Movimiento guardado, pero hubo un detalle al subir los soportes de imagen', 'warning');
        }
      }

      toast(destinoEsBidon ? 'Salida directa a bidón registrada' : 'Movimiento registrado', 'success');
      onSaved();
    } catch (err) { setError((err as { message?: string })?.message || 'No se pudo registrar.'); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-mov" className="btn btn-primary" disabled={saving || !!errSaldo}>{saving ? 'Guardando…' : 'Registrar movimiento'}</button>
    </>
  );
  return (
    <Modal title="⛽ Registrar Movimiento de Combustible" size="lg" className="comb-modal comb-modal-lg" onClose={onClose} footer={footer}>
      <div className="comb-modal-wrap">
        <form id="tnk-mov" onSubmit={submit} className="comb-modal-form">
          {error && <div className="card comb-error-banner"><strong>Error:</strong> {error}</div>}

          {/* SECCIÓN 1: OPERACIÓN Y TANQUE */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>⛽ Operación & Tanque</span>
            </div>
            <div className="comb-form-grid-2">
              <div className="form-row">
                <label>Tanque de origen</label>
                <SearchSelect value={tanqueId} onChange={setTanqueId} placeholder="Buscar tanque…"
                  options={tanques.map((t) => ({ value: t.id, label: etiquetaTanque(t.nombre, t.saldo_litros) }))} />
                {origenVacio && <small style={{ color: 'var(--danger)' }}>{tanqueOrigen?.nombre} está sin litros: solo admite entradas y retornos.</small>}
                {origenEsBidon && <small style={{ color: 'var(--primary)' }}>🪣 Los bidones funcionan como receptáculo de salida directa: se surten desde el Tanque 1 o Tanque 3.</small>}
              </div>
              <div className="form-row">
                <label>Tipo de movimiento</label>
                <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovTanque)}>
                  <option value="entrada">{TIPO_MOV_LABEL.entrada}</option>
                  <option value="uso">{TIPO_MOV_LABEL.uso}</option>
                  <option value="traslado">{TIPO_MOV_LABEL.traslado}</option>
                  <option value="retorno">{TIPO_MOV_LABEL.retorno}</option>
                  <option value="merma">{TIPO_MOV_LABEL.merma}</option>
                </select>
              </div>
            </div>
            <div className="comb-form-grid-2">
              <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
              {/* Selector de hora, no texto libre (28/09/2026, pedido del usuario). */}
              <div className="form-row">
                <label>Hora (opcional)</label>
                <input className="input" type="time" step={1} name="mov-hora"
                  value={horaAInput(hora)} onChange={(e) => setHora(horaDesdeInput(e.target.value))} />
                <small className="muted">{hora ? `Se guarda como ${hora}` : 'Si se deja vacía, el movimiento va primero en el día.'}</small>
              </div>
            </div>
            <div className={tipo === 'entrada' || tipo === 'traslado' ? "comb-form-grid-2" : "form-row"}>
              <div className="form-row">
                <label>Litros</label>
                <input className="input mono comb-litros-destacado" type="number" step="any" name="mov-litros" defaultValue={litros} onChange={(e) => setLitros(e.target.value)} required />
                {errSaldo
                  ? <small style={{ color: 'var(--danger)', fontWeight: 700 }}>{errSaldo}</small>
                  : tanqueOrigen && saleDelTanque(tipo) && <small className="muted">Disponible en {tanqueOrigen.nombre}: {num(Math.max(0, Number(tanqueOrigen.saldo_litros) || 0))} L.</small>}
              </div>
              {tipo === 'entrada' && (
                <div className="form-row">
                  <label>Costo por litro (USD)</label>
                  <input className="input mono" type="number" min={0} step="any" name="mov-costo" defaultValue={costo} onChange={(e) => setCosto(e.target.value)} />
                  <small className="muted">Recalcula la tasa promedio del tanque.</small>
                </div>
              )}
              {tipo === 'traslado' && (
                <div className="form-row">
                  <label>Tanque destino *</label>
                  <SearchSelect value={destinoId} onChange={setDestinoId} placeholder="🔍 Buscar destino…"
                    options={[
                      { value: '', label: '— elige el tanque destino —' },
                      { value: DESTINO_MGG, label: `🌐 ${DESTINO_MGG_LABEL} (otro sistema)` },
                      ...tanques.filter((t) => t.id !== tanqueId).map((t) => ({ value: t.id, label: etiquetaTanqueDestino(t) })),
                    ]} />
                  {destinoEsBidon ? (
                    <small style={{ color: 'var(--primary)', fontWeight: 600, display: 'block', marginTop: '.25rem' }}>
                      🪣 Al trasladar hacia <strong>{destinoSelTanque?.nombre}</strong> se registra como <strong>salida directa</strong> (el combustible se retira para consumo en campo y no queda con saldo en el bidón).
                    </small>
                  ) : (
                    <small className="muted">Si es a otro tanque, se acredita allí al costo del origen. <strong>{DESTINO_MGG_LABEL}</strong> envía el combustible al otro sistema (MGG lo confirma y entra a su TANQUE MGG).</small>
                  )}
                </div>
              )}
            </div>
            {tanqueRecibe && (
              <div className="card" style={{ padding: '.75rem .9rem', marginTop: '.4rem', borderColor: recepcion.ok?.excede ? 'var(--danger)' : undefined, background: 'rgba(0,0,0,0.25)' }}>
                <div className="comb-form-grid-2">
                  <div className="form-row">
                    <label>Litros recibidos (medido) <span className="muted">· opcional</span></label>
                    <input className="input mono" type="number" min={0} step="any" name="mov-recibidos" value={recibidos}
                      onChange={(e) => setRecibidos(e.target.value)} placeholder={tipo === 'entrada' ? 'lo que llegó al tanque' : `lo que llegó a ${tanqueRecibe.nombre}`} />
                    <small className="muted">
                      {tipo === 'entrada' ? 'Los litros de arriba son los de la guía.' : 'Los litros de arriba son los que salieron del origen.'}{' '}
                      Si llegó menos, la diferencia queda como merma de este movimiento. Vacío = llegó todo.
                    </small>
                  </div>
                  <div className="form-row">
                    <label>Merma</label>
                    <input className="input mono" readOnly
                      value={recepcion.ok ? `${num(recepcion.ok.merma)} L · ${num(recepcion.ok.pct)}% de ${num(margenRecibe)}% permitido` : '—'}
                      style={{ color: recepcion.ok?.excede ? 'var(--danger)' : recepcion.ok?.merma ? 'var(--warning)' : undefined, fontWeight: 700 }} />
                    <small className="muted">Margen de {tanqueRecibe.nombre}: {num(margenRecibe)}% (se cambia al editar el tanque).</small>
                  </div>
                </div>
                {recepcion.error && <small style={{ color: 'var(--danger)' }}>{recepcion.error}</small>}
                {recepcion.ok?.excede && (
                  <div className="form-row" style={{ marginTop: '.5rem' }}>
                    <label>Motivo de la merma *</label>
                    <input className="input" name="mov-motivo-merma" value={motivoMerma} onChange={(e) => setMotivoMerma(e.target.value)}
                      placeholder="Por qué se perdió más de lo permitido" />
                    <small style={{ color: 'var(--danger)' }}>
                      Pasa el margen del tanque. {isAdmin ? 'Se avisa a administración al guardar.' : 'Solo un administrador puede guardarla.'}
                    </small>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECCIÓN 2: ASIGNACIÓN Y DESTINO */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>🚜 Asignación & Destino</span>
            </div>
            <div className="comb-form-grid-2">
              <div className="form-row">
                <label>Equipo beneficiario</label>
                <SearchSelect value={equipo} onChange={setEquipo} placeholder="🔍 Buscar equipo…"
                  options={equiposOptions} />
              </div>
              <div className="form-row">
                <label>Autorizado por</label>
                <SearchSelect value={autorizado} onChange={setAutorizado} placeholder="🔍 Buscar autorizado…"
                  options={[{ value: '', label: '— elige quién autorizó —' }, ...opts('autorizado').map((c) => ({ value: c.valor, label: c.valor }))]} />
              </div>
            </div>
            <div className="comb-form-grid-2">
              <div className="form-row">
                <label>Destino</label>
                <SearchSelect value={ubicacion} onChange={setUbicacion} placeholder="🔍 Buscar destino…"
                  options={[{ value: '', label: '— elige el destino —' }, ...opts('ubicacion').map((c) => ({ value: c.valor, label: c.valor }))]} />
                <small className="muted">¿Falta un destino? Agrégalo en 🗂 Catálogos → Ubicaciones.</small>
              </div>
              <div className="form-row">
                <label>Observación</label>
                <input className="input" name="mov-observacion" defaultValue={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="SUMINISTRO COMBUSTIBLE…" />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: TELEMETRÍA Y MEDIDORES */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>🕒 Telemetría & Medidores del Equipo</span>
            </div>
            <div className="comb-telemetria-container">
              <div className="comb-subcard">
                <div className="comb-subcard-title">
                  <span>⏱ Horómetros y Odómetro</span>
                </div>
                <div className="comb-form-grid-2">
                  <div className="form-row">
                    <label>Horómetro inicial (HI)</label>
                    <input className="input mono" type="number" step="any" value={hi} onChange={(e) => setHi(e.target.value)} readOnly={hiAuto}
                      placeholder="auto: último" style={hiAuto ? { background: 'rgba(255,255,255,.04)', cursor: 'not-allowed' } : undefined} />
                    <small className="muted">{hiAuto ? '🔒 Traído del último HF (fijo).' : 'Último del equipo o manual.'}</small>
                  </div>
                  <div className="form-row">
                    <label>Horómetro final (HF)</label>
                    <input className="input mono" type="number" step="any" name="mov-hf" defaultValue={hf} onChange={(e) => setHf(e.target.value)} />
                  </div>
                </div>
                <div className="comb-calculado-box">
                  <span className="comb-calculado-label">Horas utilizadas (HF − HI)</span>
                  <span className="comb-calculado-val">{hrs == null ? '—' : `${num(hrs)} hrs`}</span>
                </div>
                <div className="form-row">
                  <label>Kilometraje (odómetro, km)</label>
                  <input className="input mono" type="number" step="any" value={km} onChange={(e) => setKm(e.target.value)}
                    placeholder="lectura del odómetro" />
                  <small className="muted">Para vehículos: lectura del odómetro (mantenimiento).</small>
                </div>
              </div>

              <div className="comb-subcard">
                <div className="comb-subcard-title">
                  <span>⛽ Contador del Surtidor</span>
                </div>
                <div className="comb-form-grid-2">
                  <div className="form-row">
                    <label>Contador inicial</label>
                    <input className="input mono" type="number" step="any" value={ci} onChange={(e) => setCi(e.target.value)} readOnly={ciAuto}
                      placeholder="auto: tanque" style={ciAuto ? { background: 'rgba(255,255,255,.04)', cursor: 'not-allowed' } : undefined} />
                    <small className="muted">{ciAuto ? '🔒 Último del tanque (fijo).' : 'Ingreso inicial.'}</small>
                  </div>
                  <div className="form-row">
                    <label>Contador final</label>
                    <input className="input mono" type="number" step="any" name="mov-cf" defaultValue={cf} onChange={(e) => setCf(e.target.value)}
                      placeholder={cfPropuesto != null ? `${cfPropuesto} (sugerido)` : undefined} />
                  </div>
                </div>
                <div className="comb-calculado-box">
                  <span className="comb-calculado-label">Litros según contador (CF − CI)</span>
                  <span className="comb-calculado-val">{litrosContador == null ? '—' : `${num(litrosContador)} L`}</span>
                </div>
                {pasaPorSurtidor(tipo) && (
                  <small className="muted" style={{ display: 'block', fontSize: '.74rem' }}>
                    {cf === '' && cfPropuesto != null
                      ? <>Vacío = se guarda <strong>{num(cfPropuesto)}</strong> (inicial + litros). </>
                      : null}
                    Es donde arrancará el próximo movimiento del tanque.
                  </small>
                )}
              </div>
            </div>
          </div>

          {/* Merma implícita sugerida por movimiento con lista de respaldo (pedido 30/10/2026) */}
          {tipo === 'merma' && resumenMerma && (
            <div style={{
              background: 'linear-gradient(145deg, #182230 0%, #0f172a 100%)',
              border: '1.5px solid rgba(255, 138, 0, 0.45)',
              borderRadius: '12px',
              padding: '1rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.6rem' }}>
                <div>
                  <div style={{ fontSize: '.76rem', textTransform: 'uppercase', fontWeight: 700, color: '#FF8A00', letterSpacing: '0.04em' }}>
                    💡 Merma Implícita Sugerida
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', marginTop: '3px' }}>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffedd5', fontFamily: 'monospace' }}>
                      {num(resumenMerma.totalSugerido)} L
                    </span>
                    <span style={{ fontSize: '.82rem', color: '#94a3b8' }}>
                      sobre {num(resumenMerma.totalLitrosBase)} L en {resumenMerma.cantidadMovimientos} movimientos
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', background: '#0b1120', padding: '.25rem .5rem', borderRadius: '6px', border: '1px solid #334155' }}>
                    <span style={{ fontSize: '.75rem', color: '#94a3b8' }}>Margen:</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      max="100"
                      value={pctMermaInput}
                      onChange={(e) => setPctMermaInput(e.target.value)}
                      onBlur={() => {
                        if (pctMermaInput.trim() === '') {
                          const t = tanques.find((x) => x.id === tanqueId);
                          setPctMermaInput(String(t?.merma_implicita_pct ?? DEFAULT_MERMA_IMPLICITA_PCT));
                        }
                      }}
                      style={{ width: '56px', background: 'transparent', border: 'none', color: '#FF8A00', fontWeight: 700, fontSize: '.88rem', textAlign: 'right', outline: 'none' }}
                    />
                    <span style={{ fontSize: '.78rem', color: '#FF8A00', fontWeight: 700 }}>%</span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    onClick={() => {
                      setLitros(String(resumenMerma.totalSugerido));
                      setObservacion(generarObservacionMermaImplicita(resumenMerma));
                    }}
                    style={{ background: '#FF8A00', color: '#182230', fontWeight: 700, border: 'none' }}
                    title="Aplica este volumen sugerido y redacta la justificación en la observación"
                  >
                    ⚡ Usar sugerida ({num(resumenMerma.totalSugerido)} L)
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '.6rem' }}>
                <button
                  type="button"
                  onClick={() => setVerRespaldoMovs((v) => !v)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.35rem',
                    padding: 0,
                    fontWeight: 600,
                  }}
                >
                  {verRespaldoMovs ? '▾ Ocultar respaldo de movimientos' : `▸ Ver respaldo: ${resumenMerma.cantidadMovimientos} movimientos causantes`}
                  {resumenMerma.fechaUltimaMermaPrevia && (
                    <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                      (desde último corte: {resumenMerma.fechaUltimaMermaPrevia})
                    </span>
                  )}
                </button>

                {verRespaldoMovs && (
                  <div style={{ marginTop: '.6rem', maxHeight: 220, overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '8px', background: '#0b1120' }}>
                    <table className="table" style={{ fontSize: '.78rem', width: '100%' }}>
                      <thead>
                        <tr style={{ background: '#0f172a' }}>
                          <th>Fecha / Hora</th>
                          <th>Tipo / Equipo</th>
                          <th style={{ textAlign: 'right' }}>Litros</th>
                          <th style={{ textAlign: 'right' }}>% Implícito</th>
                          <th style={{ textAlign: 'right' }}>Merma</th>
                          <th style={{ textAlign: 'right' }}>Acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!resumenMerma.items.length && (
                          <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>No hay movimientos registrados desde la última merma.</td></tr>
                        )}
                        {resumenMerma.items.map((it) => (
                          <tr key={it.id}>
                            <td>{it.fecha} {it.hora ? `· ${it.hora}` : ''}</td>
                            <td>
                              <strong>{it.tipo === 'traslado' ? '🔁 Traslado' : '⛽ Surtido'}</strong>
                              {it.equipo ? ` → ${it.equipo}` : ''}
                            </td>
                            <td className="mono" style={{ textAlign: 'right' }}>{num(it.litros)} L</td>
                            <td className="mono" style={{ textAlign: 'right', color: '#94a3b8' }}>{it.pctAplicado}%</td>
                            <td className="mono" style={{ textAlign: 'right', color: '#FF8A00', fontWeight: 700 }}>+{num(it.mermaLitros)} L</td>
                            <td className="mono" style={{ textAlign: 'right', color: '#f8fafc' }}>{num(it.acumulado)} L</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECCIÓN 4: CONTROL DE AUDITORÍA Y CONCILIACIÓN */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>📋 Conciliación Cuaderno y Drive</span>
            </div>
            <div className="comb-concilia-grid">
              <div className={`comb-concilia-card cuaderno ${registradoEnCuaderno ? 'active' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <input
                    id="mov-cuaderno"
                    type="checkbox"
                    checked={registradoEnCuaderno}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setRegistradoEnCuaderno(v);
                      if (v && (!cuadernoLitros || cuadernoLitros === '')) {
                        setCuadernoLitros(litros || '');
                      }
                    }}
                    style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <label htmlFor="mov-cuaderno" style={{ margin: 0, cursor: 'pointer', fontWeight: 700, color: registradoEnCuaderno ? '#34d399' : '#f8fafc' }}>
                    📖 Registro en Cuaderno Físico
                  </label>
                </div>
                {registradoEnCuaderno && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.3rem' }}>
                    <label htmlFor="mov-cuaderno-litros" style={{ fontSize: '.78rem', color: '#6ee7b7', margin: 0, whiteSpace: 'nowrap' }}>
                      Litros anotados:
                    </label>
                    <input
                      id="mov-cuaderno-litros"
                      className="input mono"
                      type="number"
                      step="any"
                      value={cuadernoLitros}
                      onChange={(e) => setCuadernoLitros(e.target.value)}
                      placeholder={litros || '0'}
                      style={{ fontWeight: 700, flex: 1 }}
                    />
                  </div>
                )}
              </div>

              <div className={`comb-concilia-card drive ${registradoEnDrive ? 'active' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <input
                    id="mov-drive"
                    type="checkbox"
                    checked={registradoEnDrive}
                    onChange={(e) => setRegistradoEnDrive(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                  <label htmlFor="mov-drive" style={{ margin: 0, cursor: 'pointer', fontWeight: 700, color: registradoEnDrive ? '#38bdf8' : '#f8fafc' }}>
                    📊 Registro en Google Drive
                  </label>
                </div>
                {registradoEnDrive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.3rem' }}>
                    <label htmlFor="mov-drive-saldo" style={{ fontSize: '.78rem', color: '#7dd3fc', margin: 0, whiteSpace: 'nowrap' }}>
                      Saldo reportado (L):
                    </label>
                    <input
                      id="mov-drive-saldo"
                      className="input mono"
                      type="number"
                      step="any"
                      value={saldoDrive}
                      onChange={(e) => setSaldoDrive(e.target.value)}
                      placeholder="Saldo en litros"
                      style={{ fontWeight: 700, flex: 1 }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN 5: SOPORTES Y FOTOS */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>📷 Soportes & Fotos de Respaldo</span>
            </div>
            <SelectorAdjuntos
              archivos={adjuntos}
              onChange={setAdjuntos}
              titulo={
                tipo === 'entrada'
                  ? '📷 Fotos (guía, factura, cisterna, medida de varilla)'
                  : tipo === 'merma'
                  ? '📷 Fotos (medida de varilla, acta de merma, soporte)'
                  : tipo === 'traslado'
                  ? '📷 Fotos (contador, comprobante de traslado, precinto)'
                  : '📷 Fotos (contador del surtidor, odómetro, equipo, vale)'
              }
            />
          </div>
        </form>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: ver / editar detalle de un movimiento ───────────── */

function DetalleMovimientoModal({ mov, tanque, catalogos, canWrite, actor, onClose, onSaved }: {
  mov: MovimientoTanque; tanque: TanqueCombustible | null | undefined; catalogos: CatalogoCombustible[];
  canWrite: boolean; actor: string; onClose: () => void; onSaved: () => void;
}) {
  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);
  const s = (v: number | null | undefined) => (v == null ? '' : String(v));
  // Misma lista agrupada y buscable por alias que al registrar (27/10/2026).
  const fichas = useFichasEquipos();
  const equiposOptions = useMemo(() => [
    { value: '', label: '— sin equipo —' },
    ...opcionesEquipos({
      catalogo: catalogos.filter((c) => c.tipo === 'equipo'),
      fichas,
      modo: 'pc',
      tanqueActual: tanque,
      incluirValor: mov.equipo,
    }),
  ], [catalogos, fichas, tanque, mov.equipo]);

  const [fecha, setFecha] = useState(mov.fecha);
  const [hora, setHora] = useState(mov.hora ?? '');
  const [equipo, setEquipo] = useState(mov.equipo ?? '');
  const [autorizado, setAutorizado] = useState(mov.autorizado_por ?? '');
  const [ubicacion, setUbicacion] = useState(mov.ubicacion ?? '');
  const [observacion, setObservacion] = useState(mov.observacion ?? '');
  const [tipo, setTipo] = useState<TipoMovTanque>(mov.tipo);
  const [litros, setLitros] = useState(s(mov.litros));
  const [tasa, setTasa] = useState(s(mov.tasa_usd_litro));
  const [hi, setHi] = useState(s(mov.horometro_ini));
  const [hf, setHf] = useState(s(mov.horometro_fin));
  const [km, setKm] = useState(s(mov.kilometraje));
  // Se edita en el idioma del CONTADOR (lo que marcaba el aparato). El repositorio
  // lo traduce al acumulado al guardar, igual que al registrar.
  const [ci, setCi] = useState(s(mov.contador_marcaba_ini ?? mov.contador_global_ini));
  const [cf, setCf] = useState(s(mov.contador_marcaba_fin ?? mov.contador_global_fin));
  const hayArrastre = mov.contador_global_fin != null && mov.contador_marcaba_fin !== mov.contador_global_fin;
  const [registradoEnCuaderno, setRegistradoEnCuaderno] = useState(!!mov.registrado_en_cuaderno);
  const [cuadernoLitros, setCuadernoLitros] = useState(mov.cuaderno_litros != null ? String(mov.cuaderno_litros) : (mov.registrado_en_cuaderno ? String(mov.litros) : ''));
  const [registradoEnDrive, setRegistradoEnDrive] = useState(!!mov.registrado_en_drive);
  const [saldoDrive, setSaldoDrive] = useState(mov.saldo_drive != null ? String(mov.saldo_drive) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hrs = hi !== '' && hf !== '' ? Number(hf) - Number(hi) : null;
  const litrosContador = ci !== '' && cf !== '' ? Number(cf) - Number(ci) : null;
  const montoCalc = litros !== '' && tasa !== '' ? Number(litros) * Number(tasa) : null;
  // Si la edición SACA más litros del tanque (subir un surtido, pasarlo a uso…), tiene que
  // caber en lo que hay. Bajar litros o corregir un histórico no se frena.
  const extraSale = litrosExtraQueSalen({ tipo: mov.tipo, litros: mov.litros }, { tipo, litros: Number(litros) || 0 });
  const errSaldo = tanque && extraSale > 0
    ? errorSaldoInsuficiente({ nombre: tanque.nombre, saldo: tanque.saldo_litros, litros: extraSale, edicion: true })
    : null;

  async function guardar() {
    setError(null);
    if (litros === '' || Number(litros) === 0) { setError('Indica los litros (distinto de 0).'); return; }
    if (errSaldo) { setError(errSaldo); return; }
    // La misma regla que al registrar: un final menor que el inicial no se guarda.
    const errHor = errorHorometro(hi === '' ? null : Number(hi), hf === '' ? null : Number(hf));
    if (errHor) { setError(errHor); return; }
    setSaving(true);
    try {
      await actualizarMovimientoTanque(mov.id, {
        fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
        tipo, litros: Number(litros), tasaUsdLitro: tasa === '' ? 0 : Number(tasa),
        horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
        kilometraje: km === '' ? null : Number(km),
        contadorGlobalIni: ci === '' ? null : Number(ci), contadorGlobalFin: cf === '' ? null : Number(cf),
        registrado_en_cuaderno: registradoEnCuaderno,
        cuaderno_litros: registradoEnCuaderno
          ? (cuadernoLitros.trim() !== '' ? Number(cuadernoLitros.replace(',', '.')) : (Number(litros) || mov.litros))
          : null,
        registrado_en_drive: registradoEnDrive,
        saldo_drive: registradoEnDrive
          ? (saldoDrive.trim() !== '' ? Number(saldoDrive.replace(',', '.')) : null)
          : null,
      });
      toast('Movimiento actualizado', 'success');
      onSaved();
    } catch (err) { setError((err as { message?: string })?.message || 'No se pudo guardar.'); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>
      {canWrite && <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={saving || !!errSaldo}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>}
    </>
  );

  const Fila = ({ k, v, hi: hl }: { k: string; v: ReactNode; hi?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.35rem 0', borderBottom: '1px solid var(--border, rgba(255,255,255,.08))' }}>
      <span className="muted" style={{ fontSize: '.82rem' }}>{k}</span>
      <span className="mono" style={hl ? { fontWeight: 700, color: 'var(--warning)' } : undefined}>{v}</span>
    </div>
  );

  return (
    <Modal title="🔍 Detalle del Movimiento" size="md" className="comb-modal comb-modal-md" onClose={onClose} footer={footer}>
      <div className="comb-modal-wrap">
        {error && <div className="card comb-error-banner"><strong>Error:</strong> {error}</div>}

        <Fila k="Tanque" v={tanque?.nombre ?? '—'} />
        <Fila k="Saldo del tanque (L · $)" v={`${num(mov.saldo_litros)} L · ${money(mov.saldo_usd)}`} />
        {(mov.created_by || mov.actor_name) && <Fila k="Registrado por" v={<Quien nombre={mov.actor_name} correo={mov.created_by} vacio="—" />} />}

        {/* Las fotos que sacó el surtidor desde el teléfono (o las que se agreguen aquí). */}
        <AdjuntosSalida repo={adjuntosCombustible} modulo={MODULO_ADJUNTO_TANQUE} refId={mov.id} actor={actor} soloLectura={!canWrite} miniaturas />

        {/* Datos editables (TODO). Al cambiar tipo/litros/tasa se recalcula el saldo del tanque. */}
        <div className="comb-form-section">
          <div className="comb-form-section-title">
            <span>✎ Datos del Movimiento</span>
          </div>
          <div className="comb-form-grid-2">
            <div className="form-row">
              <label>Tipo de movimiento</label>
              <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovTanque)} disabled={!canWrite}>
                <option value="entrada">{TIPO_MOV_LABEL.entrada}</option>
                <option value="uso">{TIPO_MOV_LABEL.uso}</option>
                <option value="traslado">{TIPO_MOV_LABEL.traslado}</option>
                <option value="retorno">{TIPO_MOV_LABEL.retorno}</option>
                <option value="merma">{TIPO_MOV_LABEL.merma}</option>
              </select>
            </div>
            <div className="form-row"><label>Litros</label><input className="input mono comb-litros-destacado" type="number" step="any" name="det-litros" defaultValue={litros} onChange={(e) => setLitros(e.target.value)} disabled={!canWrite} />
              {errSaldo && <small style={{ color: 'var(--danger)', fontWeight: 700 }}>{errSaldo}</small>}</div>
          </div>
          <div className="comb-form-grid-2">
            <div className="form-row"><label>Tasa $/L</label><input className="input mono" type="number" step="any" name="det-tasa" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} disabled={!canWrite} /></div>
            <div className="form-row">
              <label>Monto $ (= litros × tasa)</label>
              <input className="input mono" value={montoCalc == null ? '' : money(montoCalc)} readOnly placeholder="se calcula automáticamente"
                style={{ background: 'rgba(255,165,0,.12)', borderColor: 'var(--warning)', fontWeight: 700 }} />
            </div>
          </div>
          <div className="comb-form-grid-2">
            <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!canWrite} /></div>
            <div className="form-row">
              <label>Hora</label>
              <input className="input" type="time" step={1} name="det-hora" disabled={!canWrite}
                value={horaAInput(hora)} onChange={(e) => setHora(horaDesdeInput(e.target.value))} />
              <small className="muted">{hora ? `Se guarda como ${hora}` : 'Sin hora: el movimiento va primero en el día.'}</small>
            </div>
          </div>
          <div className="comb-form-grid-2">
            <div className="form-row">
              <label>Equipo</label>
              <SearchSelect value={equipo} onChange={setEquipo} placeholder="🔍 Buscar equipo…" disabled={!canWrite}
                options={equiposOptions} />
            </div>
            <div className="form-row">
              <label>Autorizado por</label>
              <SearchSelect value={autorizado} onChange={setAutorizado} placeholder="🔍 Buscar autorizado…" disabled={!canWrite}
                options={[{ value: '', label: '— sin autorizado —' }, ...opts('autorizado').map((c) => ({ value: c.valor, label: c.valor }))]} />
            </div>
          </div>
          <div className="form-row">
            <label>Destino</label>
            <SearchSelect value={ubicacion} onChange={setUbicacion} placeholder="🔍 Buscar destino…" disabled={!canWrite}
              options={[{ value: '', label: '— sin destino —' }, ...opts('ubicacion').map((c) => ({ value: c.valor, label: c.valor }))]} />
          </div>
          <div className="form-row"><label>Observación</label><input className="input" name="det-observacion" defaultValue={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={!canWrite} /></div>
        </div>

        <div className="comb-form-section">
          <div className="comb-form-section-title">
            <span>🕒 Medidores & Telemetría</span>
          </div>
          <div className="comb-form-grid-3">
            <div className="form-row"><label>Horómetro inicial (HI)</label><input className="input mono" type="number" step="any" name="det-hi" defaultValue={hi} onChange={(e) => setHi(e.target.value)} disabled={!canWrite} /></div>
            <div className="form-row"><label>Horómetro final (HF)</label><input className="input mono" type="number" step="any" name="det-hf" defaultValue={hf} onChange={(e) => setHf(e.target.value)} disabled={!canWrite} /></div>
            <div className="form-row"><label>Kilometraje (km)</label><input className="input mono" type="number" step="any" name="det-km" defaultValue={km} onChange={(e) => setKm(e.target.value)} disabled={!canWrite} /></div>
          </div>
          <div className="comb-calculado-box">
            <span className="comb-calculado-label">Horas utilizadas (HRS = HF − HI)</span>
            <span className="comb-calculado-val">{hrs == null ? '—' : `${num(hrs)} hrs`}</span>
          </div>
          <div className="comb-form-grid-2">
            <div className="form-row"><label>Contador inicial</label><input className="input mono" type="number" step="any" name="det-ci" defaultValue={ci} onChange={(e) => setCi(e.target.value)} disabled={!canWrite} /></div>
            <div className="form-row"><label>Contador final</label><input className="input mono" type="number" step="any" name="det-cf" defaultValue={cf} onChange={(e) => setCf(e.target.value)} disabled={!canWrite} /></div>
            {hayArrastre && (
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <span className="muted hint" style={{ fontSize: '.74rem' }}>
                  A este tanque se le cambió el contador. Escriba lo que marca el aparato.
                  Acumulado del sistema en este movimiento:{' '}
                  <strong className="mono">
                    {mov.contador_global_ini != null ? num(mov.contador_global_ini) : '—'}
                    {' → '}
                    {mov.contador_global_fin != null ? num(mov.contador_global_fin) : '—'}
                  </strong>
                </span>
              </div>
            )}
          </div>
          <div className="comb-calculado-box">
            <span className="comb-calculado-label">Litros usados (Contador = final − inicial)</span>
            <span className="comb-calculado-val">{litrosContador == null ? '—' : `${num(litrosContador)} L`}</span>
          </div>
        </div>

        {/* Control de Registro Cuaderno & Drive */}
        <div className="comb-form-section">
          <div className="comb-form-section-title">
            <span>📋 Conciliación Cuaderno y Drive</span>
          </div>
          <div className="comb-concilia-grid">
            <div className={`comb-concilia-card cuaderno ${registradoEnCuaderno ? 'active' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <input
                  id="det-mov-cuaderno"
                  type="checkbox"
                  checked={registradoEnCuaderno}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setRegistradoEnCuaderno(v);
                    if (v && (!cuadernoLitros || cuadernoLitros === '')) {
                      setCuadernoLitros(litros || String(mov.litros));
                    }
                  }}
                  disabled={!canWrite}
                  style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                />
                <label htmlFor="det-mov-cuaderno" style={{ margin: 0, cursor: 'pointer', fontWeight: 700, color: registradoEnCuaderno ? '#34d399' : '#f8fafc' }}>
                  📖 Registro Cuaderno
                </label>
              </div>
              {registradoEnCuaderno && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.3rem' }}>
                  <label htmlFor="det-mov-cuaderno-litros" style={{ fontSize: '.78rem', color: '#6ee7b7', margin: 0, whiteSpace: 'nowrap' }}>
                    Litros:
                  </label>
                  <input
                    id="det-mov-cuaderno-litros"
                    className="input mono"
                    type="number"
                    step="any"
                    value={cuadernoLitros}
                    onChange={(e) => setCuadernoLitros(e.target.value)}
                    disabled={!canWrite}
                    placeholder={litros || String(mov.litros)}
                    style={{ fontWeight: 700, flex: 1 }}
                  />
                </div>
              )}
            </div>

            <div className={`comb-concilia-card drive ${registradoEnDrive ? 'active' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <input
                  id="det-mov-drive"
                  type="checkbox"
                  checked={registradoEnDrive}
                  onChange={(e) => setRegistradoEnDrive(e.target.checked)}
                  disabled={!canWrite}
                  style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <label htmlFor="det-mov-drive" style={{ margin: 0, cursor: 'pointer', fontWeight: 700, color: registradoEnDrive ? '#38bdf8' : '#f8fafc' }}>
                  📊 Registro Drive
                </label>
              </div>
              {registradoEnDrive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.3rem' }}>
                  <label htmlFor="det-mov-drive-saldo" style={{ fontSize: '.78rem', color: '#7dd3fc', margin: 0, whiteSpace: 'nowrap' }}>
                    Saldo (L):
                  </label>
                  <input
                    id="det-mov-drive-saldo"
                    className="input mono"
                    type="number"
                    step="any"
                    value={saldoDrive}
                    onChange={(e) => setSaldoDrive(e.target.value)}
                    disabled={!canWrite}
                    placeholder="Saldo en litros"
                    style={{ fontWeight: 700, flex: 1 }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: nuevo tanque ───────────── */

function TanqueModal({ catalogos, actor, tanque, onClose, onSaved, onRequestDelete }: {
  catalogos: CatalogoCombustible[]; actor: string; tanque: TanqueCombustible | null; onClose: () => void; onSaved: () => void;
  onRequestDelete?: (t: TanqueCombustible) => void;
}) {
  const editando = !!tanque;
  const [nombre, setNombre] = useState(tanque?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoTanque>(tanque?.tipo ?? 'rectangular');
  const [esMovil, setEsMovil] = useState(!!tanque?.es_movil);
  const [radio, setRadio] = useState(tanque?.radio_m != null ? String(tanque.radio_m) : '');
  const [largo, setLargo] = useState(tanque?.largo_m != null ? String(tanque.largo_m) : '');
  const [ancho, setAncho] = useState(tanque?.ancho_m != null ? String(tanque.ancho_m) : '');
  const [alto, setAlto] = useState(tanque?.alto_m != null ? String(tanque.alto_m) : '');
  const [capacidad, setCapacidad] = useState(tanque?.capacidad_litros != null ? String(tanque.capacidad_litros) : '');
  const [saldo, setSaldo] = useState('');
  const [tasa, setTasa] = useState(tanque?.tasa_usd_litro != null ? String(tanque.tasa_usd_litro) : '');
  const [ubicacion, setUbicacion] = useState(tanque?.ubicacion ?? '');
  const [margen, setMargen] = useState(String(tanque?.margen_merma_pct ?? MARGEN_MERMA_DEFECTO));
  const [mermaImplicita, setMermaImplicita] = useState(String(tanque?.merma_implicita_pct ?? 0.5));
  const [saving, setSaving] = useState(false);

  // Capacidad calculada por fórmula con las dimensiones actuales (preview en vivo).
  const geom = {
    tipo,
    radio_m: radio === '' ? null : Number(radio),
    largo_m: largo === '' ? null : Number(largo),
    ancho_m: ancho === '' ? null : Number(ancho),
    alto_m: alto === '' ? null : Number(alto),
  };
  const capCalc = capacidadCalculada(geom);

  function datosGeom() {
    return {
      nombre, tipo, esMovil,
      radioM: radio === '' ? null : Number(radio),
      largoM: largo === '' ? null : Number(largo),
      anchoM: ancho === '' ? null : Number(ancho),
      altoM: alto === '' ? null : Number(alto),
      capacidadLitros: Number(capacidad) || 0,
      ubicacion: ubicacion || null,
      margenMermaPct: margen.trim() === '' ? MARGEN_MERMA_DEFECTO : Number(margen.replace(',', '.')),
      mermaImplicitaPct: mermaImplicita.trim() === '' ? 0 : Number(mermaImplicita.replace(',', '.')),
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { toast('Indica el nombre', 'error'); return; }
    const m = Number(margen.replace(',', '.'));
    if (margen.trim() !== '' && !(m >= 0 && m <= 100)) { toast('El margen de merma va de 0 a 100 %', 'error'); return; }
    setSaving(true);
    try {
      if (editando && tanque) {
        await actualizarTanque(tanque.id, { ...datosGeom(), tasaUsdLitro: tasa === '' ? undefined : Number(tasa) });
        toast('Tanque actualizado', 'success');
      } else {
        await crearTanque({ ...datosGeom(), saldoLitros: Number(saldo) || 0, tasaUsdLitro: Number(tasa) || 0, actor });
        toast('Tanque creado', 'success');
      }
      onSaved();
    } catch (err) { toast(mensajeError(err, 'No se pudo guardar'), 'error'); }
    finally { setSaving(false); }
  }
  const footer = (
    <>
      {editando && tanque && onRequestDelete && (
        <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}
          onClick={() => onRequestDelete(tanque)}>🗑 Eliminar tanque</button>
      )}
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-new" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear tanque'}</button>
    </>
  );
  return (
    <Modal title={editando ? `⚙ Editar ${tanque?.nombre}` : '➕ Nuevo Tanque de Combustible'} size="md" className="comb-modal comb-modal-md" onClose={onClose} footer={footer}>
      <div className="comb-modal-wrap">
        <form id="tnk-new" onSubmit={submit} className="comb-modal-form">
          {/* SECCIÓN 1: IDENTIFICACIÓN */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>🏷 Identificación & Tipo</span>
            </div>
            <div className="comb-form-grid-2">
              <div className="form-row"><label>Nombre del tanque</label><input className="input" name="tnk-nombre" defaultValue={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tanque #4" /></div>
              <div className="form-row">
                <label>Geometría de cubicación</label>
                <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTanque)}>
                  <option value="cilindrico_horizontal">Cilíndrico horizontal (acostado)</option>
                  <option value="rectangular">Rectangular / prismático</option>
                </select>
              </div>
            </div>
            <label className="form-row" style={{ flexDirection: 'row', alignItems: 'center', gap: '.5rem', margin: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={esMovil} onChange={(e) => setEsMovil(e.target.checked)} style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '.85rem', fontWeight: 600 }}>🚚 Tanque móvil (camión de lubricación)</span>
            </label>
          </div>

          {/* SECCIÓN 2: DIMENSIONES & CAPACIDAD */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>📐 Dimensiones & Capacidad</span>
            </div>
            {tipo === 'cilindrico_horizontal' ? (
              <div className="comb-form-grid-2">
                <div className="form-row"><label>Radio R (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-radio" defaultValue={radio} onChange={(e) => setRadio(e.target.value)} placeholder="1.1875" /></div>
                <div className="form-row"><label>Largo L (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-largo-cil" defaultValue={largo} onChange={(e) => setLargo(e.target.value)} placeholder="8.17" /></div>
              </div>
            ) : (
              <div className="comb-form-grid-3">
                <div className="form-row"><label>Largo (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-largo-rect" defaultValue={largo} onChange={(e) => setLargo(e.target.value)} placeholder="1.99" /></div>
                <div className="form-row"><label>Ancho (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-ancho" defaultValue={ancho} onChange={(e) => setAncho(e.target.value)} placeholder="0.99" /></div>
                <div className="form-row"><label>Alto / altura total (m)</label><input className="input mono" type="number" min={0} step="any" name="tnk-alto" defaultValue={alto} onChange={(e) => setAlto(e.target.value)} placeholder="0.99" /></div>
              </div>
            )}
            <div className="comb-form-grid-2">
              <div className="form-row">
                <label>Capacidad rotulada (L)</label>
                <input className="input mono" type="number" min={0} step="any" name="tnk-capacidad" defaultValue={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="35000" />
                <small className="muted">Tope operativo físico.</small>
              </div>
              <div className="form-row">
                <label>Capacidad calculada (L)</label>
                <input className="input mono" value={capCalc > 0 ? num(capCalc) : '—'} readOnly title="Calculada por fórmula con las dimensiones" style={{ color: '#fbbf24', fontWeight: 700 }} />
                <small className="muted">Por fórmula geométrica.</small>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: SALDO, COSTOS & MERMAS */}
          <div className="comb-form-section">
            <div className="comb-form-section-title">
              <span>💵 Parámetros Contables & Mermas</span>
            </div>
            {!editando ? (
              <div className="comb-form-grid-2">
                <div className="form-row"><label>Saldo inicial (L)</label><input className="input mono" type="number" min={0} step="any" name="tnk-saldo" defaultValue={saldo} onChange={(e) => setSaldo(e.target.value)} /></div>
                <div className="form-row"><label>Tasa inicial (USD/L)</label><input className="input mono" type="number" min={0} step="any" name="tnk-tasa-new" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} /></div>
              </div>
            ) : (
              <div className="form-row">
                <label>Tasa (USD/L)</label>
                <input className="input mono" type="number" min={0} step="any" name="tnk-tasa-edit" defaultValue={tasa} onChange={(e) => setTasa(e.target.value)} />
                <small className="muted">Modifica la tasa promedio del tanque; recalcula el saldo en USD.</small>
              </div>
            )}
            <div className="form-row">
              <label>Ubicación</label>
              <input className="input" list="cat-ubic-new" name="tnk-ubicacion" defaultValue={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Mina Golden touch" />
              <datalist id="cat-ubic-new">{catalogos.filter((c) => c.tipo === 'ubicacion' && c.activo).map((c) => <option key={c.id} value={c.valor} />)}</datalist>
            </div>
            <div className="comb-form-grid-2">
              <div className="form-row">
                <label>Margen merma recepción (%)</label>
                <input className="input mono" type="number" min={0} max={100} step="any" name="tnk-margen" value={margen} onChange={(e) => setMargen(e.target.value)} />
                <small className="muted">Margen permitido al recibir.</small>
              </div>
              <div className="form-row">
                <label>Merma implícita sugerida (%)</label>
                <input className="input mono" type="number" min={0} max={100} step="any" name="tnk-merma-implicita"
                  value={mermaImplicita} onChange={(e) => setMermaImplicita(e.target.value)} />
                <small className="muted">Porcentaje técnico sugerido (0.5%).</small>
              </div>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: catálogos y autorización de equipos ───────────── */

function CatalogosModal({
  catalogos,
  tanques,
  onClose,
  onChanged,
}: {
  catalogos: CatalogoCombustible[];
  tanques: TanqueCombustible[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<TipoCatalogoCombustible>('equipo');
  const [valor, setValor] = useState('');
  const [valorKey, setValorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [borrarItem, setBorrarItem] = useState<CatalogoCombustible | null>(null);

  // Filtros específicos para equipos
  const [searchEquipo, setSearchEquipo] = useState('');
  const [filtroSurtido, setFiltroSurtido] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [filtroTanque, setFiltroTanque] = useState<string>('');

  // Modal para configurar tanques permitidos de un equipo
  const [tanqueEditItem, setTanqueEditItem] = useState<CatalogoCombustible | null>(null);
  const [todosTanquesChecked, setTodosTanquesChecked] = useState(true);
  const [tanquesSeleccionados, setTanquesSeleccionados] = useState<string[]>([]);

  const fichas = useFichasEquipos();
  const fichasPorNombre = useMemo(() => {
    const map = new Map<string, FichaEquipoOpcion>();
    for (const f of fichas) {
      if (f.combustible_equipo) map.set(norm(f.combustible_equipo), f);
      if (f.equipo) map.set(norm(f.equipo), f);
    }
    return map;
  }, [fichas]);

  const TABS: { key: TipoCatalogoCombustible; label: string }[] = [
    { key: 'equipo', label: 'Equipos y Permisos de Surtido' },
    { key: 'autorizado', label: 'Autorizados' },
    { key: 'ubicacion', label: 'Ubicaciones' },
  ];

  const itemsTab = useMemo(() => catalogos.filter((c) => c.tipo === tab), [catalogos, tab]);

  // Lista filtrada para la pestaña de equipos
  const equiposFiltrados = useMemo(() => {
    if (tab !== 'equipo') return itemsTab;
    let list = itemsTab;

    if (filtroSurtido === 'activos') list = list.filter((c) => c.activo);
    if (filtroSurtido === 'inactivos') list = list.filter((c) => !c.activo);

    if (filtroTanque) {
      list = list.filter((c) => esTanquePermitidoParaEquipo(filtroTanque, c.tanques_permitidos));
    }

    if (searchEquipo.trim()) {
      const q = norm(searchEquipo);
      list = list.filter((c) => {
        if (norm(c.valor).includes(q)) return true;
        const f = fichasPorNombre.get(norm(c.valor));
        if (!f) return false;
        return (
          norm(f.alias ?? '').includes(q) ||
          norm(f.modelo ?? '').includes(q) ||
          norm(f.placa ?? '').includes(q) ||
          norm(f.marca ?? '').includes(q) ||
          norm(f.tipo ?? '').includes(q)
        );
      });
    }

    return list;
  }, [itemsTab, tab, filtroSurtido, filtroTanque, searchEquipo, fichasPorNombre]);

  const totalEquipos = useMemo(() => catalogos.filter((c) => c.tipo === 'equipo').length, [catalogos]);
  const equiposPuedenSurtir = useMemo(() => catalogos.filter((c) => c.tipo === 'equipo' && c.activo).length, [catalogos]);
  const equiposBloqueados = totalEquipos - equiposPuedenSurtir;

  async function agregar() {
    if (!valor.trim()) { toast('Indica el valor', 'error'); return; }
    setBusy(true);
    try {
      await addCatalogo(tab, valor);
      setValor('');
      setValorKey((k) => k + 1);
      await onChanged();
      toast(`${tab === 'equipo' ? 'Equipo' : tab} agregado al catálogo`, 'success');
    } catch (e) {
      toast(mensajeError(e, 'No se pudo agregar'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function guardarEdicion(id: string) {
    try {
      await updateCatalogo(id, editValor);
      setEditId(null);
      await onChanged();
      toast('Actualizado', 'success');
    } catch (e) {
      toast(mensajeError(e, 'No se pudo editar'), 'error');
    }
  }

  async function toggle(id: string, activo: boolean) {
    try {
      await setCatalogoActivo(id, !activo);
      await onChanged();
      toast(activo ? 'Equipo deshabilitado para surtir' : 'Equipo habilitado para surtir', 'info');
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cambiar'), 'error');
    }
  }

  async function borrar(id: string) {
    try {
      await eliminarCatalogo(id);
      await onChanged();
      toast('Eliminado', 'success');
    } catch (e) {
      toast(mensajeError(e, 'No se pudo eliminar'), 'error');
    }
  }

  function abrirConfigTanques(item: CatalogoCombustible) {
    setTanqueEditItem(item);
    const permitidos = item.tanques_permitidos;
    const esTodos = !permitidos || permitidos.length === 0 || permitidos.includes('*');
    setTodosTanquesChecked(esTodos);
    setTanquesSeleccionados(esTodos ? [] : [...permitidos]);
  }

  async function guardarConfigTanques() {
    if (!tanqueEditItem) return;
    setBusy(true);
    try {
      const tanquesFinales = todosTanquesChecked ? null : tanquesSeleccionados;
      await setEquipoTanquesPermitidos(tanqueEditItem.id, tanqueEditItem.valor, tanquesFinales);
      await onChanged();
      setTanqueEditItem(null);
      toast('Tanques autorizados actualizados', 'success');
    } catch (e) {
      toast(mensajeError(e, 'No se pudo guardar la autorización de tanques'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function habilitarTodosFiltrados() {
    const ids = equiposFiltrados.filter((c) => !c.activo).map((c) => c.id);
    if (!ids.length) { toast('No hay equipos para habilitar en el filtro actual', 'info'); return; }
    setBusy(true);
    try {
      await setMultipleCatalogosActivo(ids, true);
      await onChanged();
      toast(`${ids.length} equipos habilitados para surtir`, 'success');
    } catch (e) {
      toast(mensajeError(e, 'Error al habilitar equipos'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deshabilitarTodosFiltrados() {
    const ids = equiposFiltrados.filter((c) => c.activo).map((c) => c.id);
    if (!ids.length) { toast('No hay equipos para deshabilitar en el filtro actual', 'info'); return; }
    setBusy(true);
    try {
      await setMultipleCatalogosActivo(ids, false);
      await onChanged();
      toast(`${ids.length} equipos deshabilitados para surtir`, 'success');
    } catch (e) {
      toast(mensajeError(e, 'Error al deshabilitar equipos'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="🗂 Catálogos y Permisos de Combustible"
      size="xl"
      className="comb-modal comb-modal-xl"
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}
    >
      <div className="comb-modal-wrap">
        <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'equipo' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem' }}>
            <div style={{ background: '#182230', padding: '.5rem .75rem', borderRadius: '6px', border: '1px solid #334155' }}>
              <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Total en catálogo</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>{totalEquipos}</div>
            </div>
            <div style={{ background: '#182230', padding: '.5rem .75rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
              <div style={{ fontSize: '.72rem', textTransform: 'uppercase', fontWeight: 600, color: '#34d399' }}>🟢 Pueden surtir</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>{equiposPuedenSurtir}</div>
            </div>
            <div style={{ background: '#182230', padding: '.5rem .75rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ fontSize: '.72rem', textTransform: 'uppercase', fontWeight: 600, color: '#f87171' }}>⚪ Bloqueados / No surten</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{equiposBloqueados}</div>
            </div>
          </div>

          {/* Formulario para agregar nuevo equipo */}
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <input
              key={valorKey}
              className="input"
              name="cat-valor"
              defaultValue={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Agregar nuevo equipo al catálogo…"
              onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={agregar} disabled={busy}>+ Agregar equipo</button>
          </div>

          {/* Barra de filtros y búsqueda */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', background: '#0f172a', padding: '.5rem .75rem', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
              <input
                className="input input-sm"
                value={searchEquipo}
                onChange={(e) => setSearchEquipo(e.target.value)}
                placeholder="🔍 Buscar por nombre, alias (L220G), marca, placa..."
                style={{ width: '100%', background: '#182230' }}
              />
              {searchEquipo && (
                <button
                  type="button"
                  onClick={() => setSearchEquipo('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '.8rem' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Pills de estado de surtido */}
            <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center' }}>
              <button
                type="button"
                className={`btn btn-xs ${filtroSurtido === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFiltroSurtido('todos')}
              >
                Todos ({totalEquipos})
              </button>
              <button
                type="button"
                className={`btn btn-xs ${filtroSurtido === 'activos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFiltroSurtido('activos')}
                style={filtroSurtido === 'activos' ? { background: '#10b981', borderColor: '#10b981' } : { color: '#34d399' }}
              >
                🟢 Pueden surtir ({equiposPuedenSurtir})
              </button>
              <button
                type="button"
                className={`btn btn-xs ${filtroSurtido === 'inactivos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFiltroSurtido('inactivos')}
                style={filtroSurtido === 'inactivos' ? { background: '#ef4444', borderColor: '#ef4444' } : { color: '#f87171' }}
              >
                ⚪ Bloqueados ({equiposBloqueados})
              </button>
            </div>

            {/* Selector de tanque */}
            <select
              className="select select-sm"
              value={filtroTanque}
              onChange={(e) => setFiltroTanque(e.target.value)}
              style={{ background: '#182230', borderColor: '#334155', fontSize: '.78rem' }}
            >
              <option value="">⛽ Todos los tanques</option>
              {tanques.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} {t.es_movil ? '(Móvil)' : ''}
                </option>
              ))}
            </select>

            {/* Botones de acción rápida */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '.35rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={habilitarTodosFiltrados}
                disabled={busy || !equiposFiltrados.length}
                title="Habilita todos los equipos mostrados actualmente"
              >
                ✓ Habilitar {equiposFiltrados.length}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={deshabilitarTodosFiltrados}
                disabled={busy || !equiposFiltrados.length}
                title="Bloquea todos los equipos mostrados actualmente"
              >
                ✕ Bloquear {equiposFiltrados.length}
              </button>
            </div>
          </div>

          {/* Tabla de equipos y permisos */}
          <div className="table-wrap" style={{ maxHeight: 380, overflow: 'auto', border: '1px solid #1e293b', borderRadius: '8px' }}>
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '38%' }}>Equipo / Identificación</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>¿Puede surtir?</th>
                  <th style={{ width: '32%' }}>Tanques autorizados</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!equiposFiltrados.length && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      No se encontraron equipos con los filtros seleccionados.
                    </td>
                  </tr>
                )}
                {equiposFiltrados.map((c) => {
                  const f = fichasPorNombre.get(norm(c.valor));
                  const permitidos = c.tanques_permitidos;
                  const esTodosTanques = !permitidos || permitidos.length === 0 || permitidos.includes('*');

                  return (
                    <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.6, background: c.activo ? 'transparent' : 'rgba(15, 23, 42, 0.4)' }}>
                      <td>
                        {editId === c.id ? (
                          <input
                            className="input"
                            value={editValor}
                            autoFocus
                            onChange={(e) => setEditValor(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void guardarEdicion(c.id);
                              if (e.key === 'Escape') setEditId(null);
                            }}
                          />
                        ) : (
                          <div>
                            <strong style={{ color: c.activo ? '#f8fafc' : '#94a3b8' }}>{c.valor}</strong>
                            {c.activo && (
                              <span
                                style={{
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#10b981',
                                  border: '1px solid rgba(16, 185, 129, 0.35)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '.7rem',
                                  fontWeight: 600,
                                  marginLeft: '.4rem',
                                }}
                              >
                                Habilitado
                              </span>
                            )}
                            {f && (
                              <div className="muted" style={{ fontSize: '.74rem', marginTop: '2px', display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                                {f.alias && <span style={{ color: '#FF8A00' }}>🏷️ {f.alias}</span>}
                                {f.tipo && <span>· {f.tipo}</span>}
                                {f.marca && <span>· {f.marca}</span>}
                                {f.modelo && <span>{f.modelo}</span>}
                                {f.placa && <span style={{ fontFamily: 'monospace' }}>[{f.placa}]</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Check de Puede surtir */}
                      <td style={{ textAlign: 'center' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.4rem',
                            cursor: 'pointer',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: c.activo ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${c.activo ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={c.activo}
                            onChange={() => toggle(c.id, c.activo)}
                            style={{ accentColor: '#10b981', width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: 600, fontSize: '.78rem', color: c.activo ? '#10b981' : '#f87171' }}>
                            {c.activo ? 'Sí (Habilitado)' : 'No (Bloqueado)'}
                          </span>
                        </label>
                      </td>

                      {/* Tanques autorizados */}
                      <td>
                        {!c.activo ? (
                          <span className="muted" style={{ fontSize: '.76rem', fontStyle: 'italic' }}>— Deshabilitado para surtir —</span>
                        ) : esTodosTanques ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                            <span
                              style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#34d399',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '.76rem',
                                fontWeight: 600,
                              }}
                            >
                              🌐 Todos los tanques
                            </span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => abrirConfigTanques(c)}
                              title="Restringir a tanques específicos"
                              style={{ padding: '1px 6px', fontSize: '.72rem', color: '#94a3b8' }}
                            >
                              ✎ Asignar tanques
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', alignItems: 'center' }}>
                            {tanques.filter((t) => esTanquePermitidoParaEquipo(t, permitidos)).map((t) => (
                              <span
                                key={t.id}
                                style={{
                                  background: '#1e293b',
                                  border: '1px solid #FF8A00',
                                  color: '#ffedd5',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '.72rem',
                                  fontWeight: 600,
                                }}
                              >
                                ⛽ {t.nombre}
                              </span>
                            ))}
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => abrirConfigTanques(c)}
                              title="Modificar tanques autorizados"
                              style={{ padding: '1px 5px', fontSize: '.72rem', color: '#FF8A00' }}
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {editId === c.id ? (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(c.id)}>Guardar</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm btn-ghost" title="Editar nombre" onClick={() => { setEditId(c.id); setEditValor(c.valor); }}>✎</button>
                            <button className="btn btn-sm btn-ghost" title="Eliminar del catálogo" onClick={() => setBorrarItem(c)}>🗑</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Pestañas de Autorizados y Ubicaciones (vista estándar) */
        <>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
            <input
              key={valorKey}
              className="input"
              name="cat-valor"
              defaultValue={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={`Nuevo ${tab}…`}
              onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }}
            />
            <button className="btn btn-primary" onClick={agregar} disabled={busy}>+ Agregar</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
            <table className="table" style={{ fontSize: '.84rem' }}>
              <thead><tr><th>Valor</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {!itemsTab.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin elementos.</td></tr>}
                {itemsTab.map((c) => (
                  <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                    <td>
                      {editId === c.id ? (
                        <input className="input" value={editValor} autoFocus onChange={(e) => setEditValor(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void guardarEdicion(c.id); if (e.key === 'Escape') setEditId(null); }} />
                      ) : c.valor}
                    </td>
                    <td>{c.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editId === c.id ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => void guardarEdicion(c.id)}>Guardar</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => { setEditId(c.id); setEditValor(c.valor); }}>✎</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => toggle(c.id, c.activo)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
                          <button className="btn btn-sm btn-ghost" title="Eliminar" onClick={() => setBorrarItem(c)}>🗑</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal para configurar tanques autorizados de un equipo */}
      {tanqueEditItem && (
        <Modal
          title={`🛡 Tanques autorizados · ${tanqueEditItem.valor}`}
          size="md"
          className="comb-modal comb-modal-md"
          onClose={() => setTanqueEditItem(null)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', width: '100%' }}>
              <button className="btn btn-ghost" onClick={() => setTanqueEditItem(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarConfigTanques} disabled={busy || (!todosTanquesChecked && tanquesSeleccionados.length === 0)}>
                Guardar autorización
              </button>
            </div>
          }
        >
          <div className="comb-modal-wrap">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '.25rem 0' }}>
            <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>
              Define desde qué tanques puede abastecerse <strong>{tanqueEditItem.valor}</strong>. Al surtir desde un tanque no seleccionado, la máquina quedará excluida de la lista.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', background: '#0f172a', padding: '.85rem 1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>
                <input
                  type="radio"
                  name="modo-tanques-perm"
                  checked={todosTanquesChecked}
                  onChange={() => setTodosTanquesChecked(true)}
                  style={{ accentColor: '#FF8A00', width: 17, height: 17 }}
                />
                🌐 Permitir surtido desde TODOS los tanques (sin restricción)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>
                <input
                  type="radio"
                  name="modo-tanques-perm"
                  checked={!todosTanquesChecked}
                  onChange={() => setTodosTanquesChecked(false)}
                  style={{ accentColor: '#FF8A00', width: 17, height: 17 }}
                />
                🎯 Restringir solo a tanques específicos:
              </label>

              {!todosTanquesChecked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', paddingLeft: '1.75rem', marginTop: '.25rem' }}>
                  {tanques.map((t) => {
                    const sel = tanquesSeleccionados.includes(t.id) || tanquesSeleccionados.some((p) => norm(p) === norm(t.nombre));
                    return (
                      <label
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '.5rem',
                          cursor: 'pointer',
                          fontSize: '.86rem',
                          padding: '.4rem .6rem',
                          background: sel ? 'rgba(255, 138, 0, 0.12)' : 'transparent',
                          borderRadius: '6px',
                          border: sel ? '1px solid rgba(255, 138, 0, 0.3)' : '1px solid transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTanquesSeleccionados((prev) => [...prev.filter((x) => x !== t.id && norm(x) !== norm(t.nombre)), t.id]);
                            } else {
                              setTanquesSeleccionados((prev) => prev.filter((x) => x !== t.id && norm(x) !== norm(t.nombre)));
                            }
                          }}
                          style={{ accentColor: '#FF8A00', width: 16, height: 16 }}
                        />
                        <span>
                          <strong>{t.nombre}</strong>
                          <span className="muted" style={{ marginLeft: '.5rem', fontSize: '.78rem' }}>
                            {t.es_movil ? '🚚 Móvil · ' : ''}{num(t.saldo_litros)} L disponibles
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {tanquesSeleccionados.length === 0 && (
                    <small style={{ color: '#f59e0b', fontStyle: 'italic', marginTop: '.25rem' }}>
                      ⚠️ Selecciona al menos un tanque o marca "Todos los tanques".
                    </small>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        </Modal>
      )}

      {borrarItem && (
        <ConfirmDialog
          title="Eliminar del catálogo"
          message={`¿Eliminar "${borrarItem.valor}" del catálogo? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          danger
          onCancel={() => setBorrarItem(null)}
          onConfirm={() => { const id = borrarItem.id; setBorrarItem(null); void borrar(id); }}
        />
      )}
      </div>
    </Modal>
  );
}

/* ───────────── Modal: conciliación ───────────── */

function ConciliacionModal({ tanques, actor, defaultEmail, onClose }: { tanques: TanqueCombustible[]; actor: string; defaultEmail: string; onClose: () => void }) {
  // Semana actual (lunes a domingo) por defecto.
  const semanaActual = () => {
    const d = new Date(); const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const f = (x: Date) => x.toISOString().slice(0, 10);
    return { desde: f(mon), hasta: f(sun) };
  };
  const [{ desde, hasta }, setRango] = useState(semanaActual);
  const [resumenes, setResumenes] = useState<ResumenTanquePeriodo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [libreta, setLibreta] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');
  // Con notas no-controlado, al limpiar tras guardar hay que remontar el input para vaciar el DOM.
  const [notasKey, setNotasKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<ConciliacionCombustible[]>([]);
  // Filtros del historial de conciliaciones (estilo Tesorería).
  const [hTexto, setHTexto] = useState('');
  const [hTanque, setHTanque] = useState('');
  const [hDesde, setHDesde] = useState('');
  const [hHasta, setHHasta] = useState('');
  const [correoOpen, setCorreoOpen] = useState(false);

  const nombreTanque = (id: string) => tanques.find((t) => t.id === id)?.nombre ?? '—';
  const cargarHistorial = useCallback(() => { listConciliaciones().then(setHistorial).catch(() => {}); }, []);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // Recalcular al cambiar la semana (el saldo según la mina se carga a mano).
  useEffect(() => {
    if (!desde || !hasta || desde > hasta) { setResumenes([]); return; }
    let cancel = false;
    setCargando(true);
    resumenTanquesPeriodo(desde, hasta)
      .then((r) => { if (!cancel) setResumenes(r); })
      .catch(() => { if (!cancel) setResumenes([]); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  function moverSemana(dir: number) {
    const f = (x: Date) => x.toISOString().slice(0, 10);
    const d = new Date(desde + 'T00:00:00'); d.setDate(d.getDate() + dir * 7);
    const h = new Date(hasta + 'T00:00:00'); h.setDate(h.getDate() + dir * 7);
    setRango({ desde: f(d), hasta: f(h) });
  }

  const difLibreta = (r: ResumenTanquePeriodo) => {
    const c = libreta[r.tanqueId];
    return c === '' || c == null ? null : r.saldoLibros - (Number(c) || 0);
  };

  // Totales por columna (sin la diferencia) + los dos saldos generales de la semana.
  const tot = useMemo(() => {
    const s = (f: (r: ResumenTanquePeriodo) => number) => resumenes.reduce((a, r) => a + f(r), 0);
    return {
      saldoInicial: s((r) => r.saldoInicial), entradas: s((r) => r.entradas), usos: s((r) => r.usos),
      traslados: s((r) => r.traslados), retornos: s((r) => r.retornos), mermas: s((r) => r.mermas),
      saldoLibros: s((r) => r.saldoLibros),
      libreta: resumenes.reduce((a, r) => a + (Number(libreta[r.tanqueId]) || 0), 0),
    };
  }, [resumenes, libreta]);

  // Historial enriquecido con el nombre del tanque + aplicando filtros.
  const historialFiltrado = useMemo<ConciliacionRow[]>(() => {
    const q = norm(hTexto);
    return historial
      .map((c) => ({ ...c, tanqueNombre: nombreTanque(c.tanque_id) }))
      .filter((c) => {
        if (hTanque && c.tanque_id !== hTanque) return false;
        if (hDesde && (c.fecha ?? '') < hDesde) return false;
        if (hHasta && (c.fecha ?? '') > hHasta) return false;
        if (q) {
          const hay = [c.periodo, c.tanqueNombre, c.fecha, c.notas, num(c.saldo_libros), num(c.saldo_reportado_mina), num(c.diferencia)]
            .map((x) => norm(String(x ?? ''))).join(' ');
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial, hTexto, hTanque, hDesde, hHasta, tanques]);

  const totHist = useMemo(() => ({
    libros: historialFiltrado.reduce((a, c) => a + (Number(c.saldo_libros) || 0), 0),
    libreta: historialFiltrado.reduce((a, c) => a + (Number(c.saldo_reportado_mina) || 0), 0),
  }), [historialFiltrado]);

  const hayFiltroHist = !!(hTexto || hTanque || hDesde || hHasta);
  function limpiarHist() { setHTexto(''); setHTanque(''); setHDesde(''); setHHasta(''); }

  async function guardar() {
    if (!resumenes.length) { toast('Semana sin datos', 'error'); return; }
    setBusy(true);
    try {
      const periodo = `${desde} a ${hasta}`;
      for (const r of resumenes) {
        const lib = libreta[r.tanqueId];
        await crearConciliacion({
          tanqueId: r.tanqueId, periodo, saldoLibros: r.saldoLibros,
          saldoReportadoMina: lib === '' || lib == null ? 0 : Number(lib) || 0,
          saldoCubicacion: null,
          notas: notas || null, actor,
        });
      }
      toast('Conciliación semanal registrada', 'success');
      cargarHistorial(); setNotas(''); setNotasKey((k) => k + 1);
    } catch (e) { toast(mensajeError(e, 'No se pudo guardar'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="⚖ Conciliación Semanal · Tanques" size="xl" className="comb-modal comb-modal-xl" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="comb-modal-wrap">
        <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '.6rem' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => moverSemana(-1)}>← Semana ant.</button>
          <label className="muted" style={{ fontSize: '.8rem' }}>Desde <input className="input" type="date" value={desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} style={{ width: 'auto' }} /></label>
          <label className="muted" style={{ fontSize: '.8rem' }}>Hasta <input className="input" type="date" value={hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} style={{ width: 'auto' }} /></label>
          <button className="btn btn-sm btn-ghost" onClick={() => moverSemana(1)}>Semana sig. →</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setRango(semanaActual())}>Semana actual</button>
        </div>

        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.82rem' }}>
            <thead><tr>
              <th>Tanque</th><th>Saldo inicial</th><th>Entradas</th><th>Usos</th><th>Traslados</th><th>Retornos</th><th>Mermas</th><th>Saldo libros</th><th>Saldo según la mina (Libreta)</th><th>Dif.</th>
            </tr></thead>
            <tbody>
              {cargando && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center' }}>Calculando…</td></tr>}
              {!cargando && !resumenes.length && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center' }}>Sin tanques.</td></tr>}
              {!cargando && resumenes.map((r) => {
                const d = difLibreta(r);
                return (
                  <tr key={r.tanqueId}>
                    <td><strong>{r.tanqueNombre}</strong> <span className="muted" style={{ fontSize: '.72rem' }}>· {r.movimientos} mov.</span></td>
                    <td className="mono">{num(r.saldoInicial)}</td>
                    <td className="mono" style={{ color: 'var(--primary-3)' }}>{num(r.entradas)}</td>
                    <td className="mono" style={{ color: 'var(--danger)' }}>{num(r.usos)}</td>
                    <td className="mono" style={{ color: 'var(--warning)' }}>{num(r.traslados)}</td>
                    <td className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{num(r.retornos)}</td>
                    <td className="mono" style={{ color: 'var(--danger)' }}>{num(r.mermas)}</td>
                    <td className="mono"><strong>{num(r.saldoLibros)}</strong></td>
                    <td><input className="input mono" type="number" step="any" name={`conc-libreta-${r.tanqueId}`} defaultValue={libreta[r.tanqueId] ?? ''} onChange={(e) => setLibreta((c) => ({ ...c, [r.tanqueId]: e.target.value }))} placeholder="libreta" style={{ width: 110 }} /></td>
                    <td className="mono" style={{ color: d != null && Math.abs(d) > 0.01 ? 'var(--warning)' : 'inherit' }}>{d == null ? '—' : num(d)}</td>
                  </tr>
                );
              })}
            </tbody>
            {!cargando && resumenes.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td>TOTALES</td>
                  <td className="mono">{num(tot.saldoInicial)}</td>
                  <td className="mono" style={{ color: 'var(--primary-3)' }}>{num(tot.entradas)}</td>
                  <td className="mono" style={{ color: 'var(--danger)' }}>{num(tot.usos)}</td>
                  <td className="mono" style={{ color: 'var(--warning)' }}>{num(tot.traslados)}</td>
                  <td className="mono" style={{ color: 'var(--info, #6db8ff)' }}>{num(tot.retornos)}</td>
                  <td className="mono" style={{ color: 'var(--danger)' }}>{num(tot.mermas)}</td>
                  <td className="mono">{num(tot.saldoLibros)}</td>
                  <td className="mono">{num(tot.libreta)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Resultado general de la semana (no editable) — como en el Excel de la mina */}
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '.9rem 0' }}>
          <div className="card" style={{ flex: 1, minWidth: 220, textAlign: 'center', background: 'rgba(244,179,179,.10)', borderColor: 'rgba(244,179,179,.4)' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.02em' }}>SALDOS DE CONSUMO DIÉSEL · NUESTROS LIBROS</div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '.2rem' }}>{num(tot.saldoLibros)} L</div>
            <div className="muted" style={{ fontSize: '.7rem' }}>resultado de la semana · no editable</div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 220, textAlign: 'center', background: 'rgba(110,160,230,.12)', borderColor: 'rgba(110,160,230,.45)' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.02em' }}>SALDOS REPORTADOS POR LA MINA (LIBRETA)</div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '.2rem' }}>{num(tot.libreta)} L</div>
            <div className="muted" style={{ fontSize: '.7rem' }}>según libreta · no editable</div>
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '.6rem' }}><label>Notas de la semana</label><input key={notasKey} className="input" name="conc-notas" defaultValue={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy || !resumenes.length}>Guardar conciliación de la semana</button>
        <p className="muted" style={{ fontSize: '.76rem' }}>El saldo en libros se calcula con todos los movimientos de cada tanque en la semana (saldo inicial + entradas + retornos − usos − traslados − mermas). La diferencia contra el <strong>saldo según la mina (libreta)</strong> es el faltante/merma a vigilar.</p>
      </div>

      {/* Historial de conciliaciones: filtros + reportes (estilo Tesorería) */}
      {!!historial.length && (
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
          <span style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            Conciliaciones registradas
            <button className="btn btn-sm btn-ghost" disabled={!historialFiltrado.length} title="Descargar PDF (con el filtro aplicado)"
              onClick={() => void descargarConciliacionesPdf(historialFiltrado, { filtro: hayFiltroHist ? 'filtrado' : undefined }).catch((e) => toast(mensajeError(e, 'No se pudo generar el PDF'), 'error'))}>↓ PDF</button>
            <button className="btn btn-sm btn-ghost" disabled={!historialFiltrado.length} title="Descargar Excel (con el filtro aplicado)"
              onClick={() => void descargarConciliacionesExcel(historialFiltrado).catch((e) => toast(mensajeError(e, 'No se pudo generar el Excel'), 'error'))}>📊 Excel</button>
            <button className="btn btn-sm btn-ghost" disabled={!historialFiltrado.length} title="Enviar por correo (con el filtro aplicado)"
              onClick={() => setCorreoOpen(true)}>✉ Correo</button>
          </span>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input className="input" type="search" value={hTexto} onChange={(e) => setHTexto(e.target.value)}
                placeholder="🔍 Buscar (semana, tanque, notas…)" style={{ width: 240, paddingRight: hTexto ? '1.6rem' : undefined }} />
              {hTexto && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHTexto('')} title="Limpiar búsqueda"
                  style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
              )}
            </div>
            <SearchSelect value={hTanque} onChange={setHTanque} placeholder="🔍 Tanque…" style={{ width: 180 }}
              options={[{ value: '', label: 'Todo tanque' }, ...tanques.map((t) => ({ value: t.id, label: t.nombre }))]} />
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Desde <input className="input" type="date" value={hDesde} onChange={(e) => setHDesde(e.target.value)} style={{ width: 'auto' }} />
            </label>
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
              Hasta <input className="input" type="date" value={hHasta} onChange={(e) => setHHasta(e.target.value)} style={{ width: 'auto' }} />
            </label>
            {hayFiltroHist && <button className="btn btn-sm btn-ghost" onClick={limpiarHist}>✕ Limpiar</button>}
            <span className="muted" style={{ fontSize: '.8rem' }}>{historialFiltrado.length}/{historial.length}</span>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Semana</th><th>Tanque</th><th>Registrada</th><th>Libros</th><th>Libreta (mina)</th><th>Dif.</th><th>Notas</th></tr></thead>
          <tbody>
            {!historial.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin conciliaciones.</td></tr>}
            {!!historial.length && !historialFiltrado.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Ninguna conciliación coincide con el filtro.</td></tr>}
            {historialFiltrado.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.periodo || '—'}</td>
                <td>{c.tanqueNombre}</td>
                <td className="mono">{c.fecha}</td>
                <td className="mono">{num(c.saldo_libros)}</td>
                <td className="mono">{num(c.saldo_reportado_mina)}</td>
                <td className="mono" style={{ color: Math.abs(Number(c.diferencia) || 0) > 0.01 ? 'var(--warning)' : 'inherit' }}>{num(c.diferencia)}</td>
                <td className="muted">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
          {historialFiltrado.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td colSpan={3}>TOTALES</td>
                <td className="mono">{num(totHist.libros)}</td>
                <td className="mono">{num(totHist.libreta)}</td>
                <td></td><td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar conciliaciones"
          descripcion={`Se enviará el PDF de las conciliaciones (${historialFiltrado.length} registro(s)${hayFiltroHist ? ', con el filtro aplicado' : ''}).`}
          defaultEmail={defaultEmail}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarConciliacionesPorCorreo(historialFiltrado, emails, { filtro: hayFiltroHist ? 'filtrado' : undefined });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}
      </div>
    </Modal>
  );
}

/* ───────────── Modal: cubicación (altura → litros) ───────────── */

function CubicacionModal({ tanque, actor, onClose, onSaved }: {
  tanque: TanqueCombustible; actor: string; onClose: () => void; onSaved: () => void;
}) {
  const [altura, setAltura] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState('');
  // Inputs no-controlados: al limpiar por estado tras guardar hay que remontarlos para vaciar el DOM.
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<CubicacionCombustible[]>([]);

  const litros = cubicarLitros(tanque, Number(altura) || 0);
  const libros = Number(tanque.saldo_litros) || 0;
  const dif = libros - litros;
  const geomOk = tanque.tipo === 'cilindrico_horizontal'
    ? (Number(tanque.radio_m) > 0 && Number(tanque.largo_m) > 0)
    : (Number(tanque.largo_m) > 0 && Number(tanque.ancho_m) > 0);

  useEffect(() => { listCubicaciones(tanque.id).then(setHistorial).catch(() => {}); }, [tanque.id]);

  async function guardar() {
    if (altura === '') { toast('Indica la altura medida', 'error'); return; }
    setBusy(true);
    try {
      await crearCubicacion({ tanqueId: tanque.id, alturaCm: Number(altura) || 0, fecha, notas: notas || null, actor });
      toast('Cubicación guardada', 'success');
      setHistorial(await listCubicaciones(tanque.id));
      setAltura(''); setNotas(''); setFormKey((k) => k + 1);
      onSaved();
    } catch (e) { toast(mensajeError(e, 'No se pudo guardar'), 'error'); }
    finally { setBusy(false); }
  }
  async function borrar(id: string) {
    if (!confirm('¿Eliminar esta medición?')) return;
    try { await eliminarCubicacion(id); setHistorial(await listCubicaciones(tanque.id)); }
    catch (e) { toast(mensajeError(e, 'No se pudo eliminar'), 'error'); }
  }

  return (
    <Modal title={`📐 Cubicación · ${tanque.nombre}`} size="lg" className="comb-modal comb-modal-lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="comb-modal-wrap">
        {!geomOk && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '1rem' }}>
          ⚠️ Este tanque no tiene dimensiones cargadas. Edita el tanque ({tanque.tipo === 'cilindrico_horizontal' ? 'radio y largo' : 'largo y ancho'}) para poder cubicar.
        </div>
      )}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>
          Tipo: <strong>{tanque.tipo === 'cilindrico_horizontal' ? 'Cilíndrico horizontal' : 'Rectangular'}</strong>. Mete la varilla, leé la altura del líquido en cm y el sistema calcula los litros.
        </p>
        <div className="form-grid">
          <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="form-row"><label>Altura medida (cm)</label><input key={`alt-${formKey}`} className="input mono" type="number" min={0} step="any" name="cub-altura" defaultValue={altura} onChange={(e) => setAltura(e.target.value)} placeholder="87" autoFocus /></div>
          <div className="form-row"><label>Litros (cubicación)</label><input className="input mono" value={num(litros)} readOnly style={{ color: 'var(--primary-3)', fontWeight: 700 }} /></div>
          <div className="form-row"><label>Saldo por libros (L)</label><input className="input mono" value={num(libros)} readOnly /></div>
          <div className="form-row"><label>Diferencia (L)</label><input className="input mono" value={num(dif)} readOnly style={{ color: Math.abs(dif) > 0 ? 'var(--warning)' : 'var(--primary-3)' }} /></div>
        </div>
        <div className="form-row"><label>Notas</label><input key={`notas-${formKey}`} className="input" name="cub-notas" defaultValue={notas} onChange={(e) => setNotas(e.target.value)} placeholder="medición río Aro…" /></div>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy || !geomOk}>Guardar medición</button>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th>Altura (cm)</th><th>Litros</th><th>Libros</th><th>Diferencia</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            {!historial.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin mediciones.</td></tr>}
            {historial.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.fecha}</td>
                <td className="mono">{num(c.altura_cm)}</td>
                <td className="mono" style={{ color: 'var(--primary-3)' }}>{num(c.litros_cubicacion)}</td>
                <td className="mono">{num(c.saldo_libros)}</td>
                <td className="mono" style={{ color: Math.abs(Number(c.diferencia) || 0) > 0 ? 'var(--warning)' : 'inherit' }}>{num(c.diferencia)}</td>
                <td className="muted">{c.notas || '—'}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => void borrar(c.id)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </Modal>
  );
}

/** Fecha local 'YYYY-MM-DD' (sin corrimiento por UTC). */
function fechaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Pase MANUAL (el único desde el 29/09/2026: se quitó el cron de los domingos) del consumo
 *  de combustible de GT de una semana (lunes→domingo) a la caja de Peramanal. Idempotente: re-generar la misma
 *  semana reemplaza el gasto en vez de duplicarlo. */
function ConsumoSemanalModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void | Promise<void> }) {
  // Por defecto, la última semana completa (lunes→domingo ya cerrada).
  const { lunes, domingo } = (() => {
    const hoy = new Date();
    const dom = new Date(hoy);
    dom.setDate(hoy.getDate() - hoy.getDay()); // domingo más reciente (o hoy si es domingo)
    const lun = new Date(dom);
    lun.setDate(dom.getDate() - 6);
    return { lunes: fechaLocal(lun), domingo: fechaLocal(dom) };
  })();
  const [desde, setDesde] = useState(lunes);
  const [hasta, setHasta] = useState(domingo);
  const [busy, setBusy] = useState(false);
  // Vista previa (solo lectura): litros, tasa y $ que se cargarían, con la misma fórmula del pase.
  const [preview, setPreview] = useState<PreviewConsumoSemana | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!desde || !hasta || hasta < desde) { setPreview(null); setPreviewErr(null); return; }
    setPreviewing(true); setPreviewErr(null);
    previewConsumoCombustibleSemana(desde, hasta)
      .then((p) => { if (!cancel) setPreview(p); })
      .catch((e) => { if (!cancel) { setPreview(null); setPreviewErr(mensajeError(e, 'No se pudo calcular el resumen')); } })
      .finally(() => { if (!cancel) setPreviewing(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  async function generar() {
    if (!desde || !hasta || hasta < desde) { toast('El rango de fechas no es válido.', 'error'); return; }
    setBusy(true);
    try {
      const monto = await postearConsumoCombustibleSemana(desde, hasta);
      toast(
        monto > 0
          ? `Cargado en la caja de Peramanal: gasto ${money(monto)} + entrada de multimoneda ${money(monto)}.`
          : 'No hubo consumo de GT en esa semana (no se cargó nada).',
        monto > 0 ? 'success' : 'info',
      );
      await onPosted();
      onClose();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cargar el consumo'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="💰 CAJA · Consumo semanal de combustible → Caja de Peramanal"
      size="lg"
      className="comb-modal comb-modal-lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void generar()} disabled={busy || (preview != null && preview.litros <= 0)}>
            {busy ? 'Generando…' : preview && preview.litros > 0 ? `Generar consumo · ${money(preview.usd)}` : 'Generar consumo'}
          </button>
        </>
      }
    >
      <div className="comb-modal-wrap">
        <p className="muted" style={{ fontSize: '.86rem', marginTop: 0 }}>
        Carga en la caja de Peramanal <strong>abierta</strong> el consumo de GT de la semana
        (movimientos de tanque tipo <strong>uso</strong>, a su costo por tasa PMP). Se registran
        <strong> dos movimientos</strong> por la misma cantidad: el gasto
        <strong> «CONSUMO COMBUSTIBLE GT»</strong> y una <strong>entrada de multimoneda</strong> que
        lo compensa. El pase se hace <strong>solo con este botón</strong> (ya no corre solo los domingos):
        normalmente el <strong>lunes</strong>, por la semana que acaba de cerrar. Es idempotente: re-generar
        la misma semana <strong>reemplaza</strong> los movimientos, no los duplica.
      </p>
      <div className="form-grid" style={{ marginTop: '.6rem' }}>
        <div className="form-row">
          <label>Desde (lunes)</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Hasta (domingo)</label>
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {/* Resumen de lo que se enviará a la caja (litros × tasa = $). */}
      <div className="card" style={{ marginTop: '.8rem', borderColor: 'var(--brand, #ff8a00)' }}>
        <strong style={{ fontSize: '.9rem' }}>🧾 Resumen a cargar en la caja</strong>
        {previewErr ? (
          <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem', color: 'var(--danger)' }}>{previewErr}</div>
        ) : previewing && !preview ? (
          <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem' }}>Calculando…</div>
        ) : preview && preview.litros > 0 ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem 1.4rem', marginTop: '.5rem', alignItems: 'baseline' }}>
              <div><span className="muted">Litros consumidos:</span> <strong className="mono">{num(preview.litros)} L</strong></div>
              <div><span className="muted">Tasa tarjeta:</span> <strong className="mono">{money(preview.tasa)}/L</strong></div>
              <div><span className="muted">Movimientos:</span> <strong className="mono">{preview.movimientos}</strong></div>
              <div style={{ marginLeft: 'auto' }}><span className="muted">Total a cargar:</span>{' '}
                <strong className="mono" style={{ color: 'var(--brand, #ff8a00)', fontSize: '1.05rem' }}>{money(preview.usd)}</strong></div>
            </div>
            <div className="muted" style={{ fontSize: '.76rem', marginTop: '.3rem' }}>
              Se registra el gasto <strong>«CONSUMO COMBUSTIBLE GT»</strong> por {money(preview.usd)} y una <strong>entrada de multimoneda</strong> por el mismo monto.
            </div>
            {preview.porEquipo.length > 0 && (
              <details style={{ marginTop: '.5rem' }}>
                <summary className="muted" style={{ fontSize: '.8rem', cursor: 'pointer' }}>Ver litros por equipo ({preview.porEquipo.length})</summary>
                <div className="table-wrap" style={{ marginTop: '.35rem' }}>
                  <table className="table" style={{ fontSize: '.8rem' }}>
                    <thead><tr><th>Equipo</th><th style={{ textAlign: 'right' }}>Litros</th></tr></thead>
                    <tbody>
                      {preview.porEquipo.map((e) => (
                        <tr key={e.equipo}><td>{e.equipo}</td><td className="mono" style={{ textAlign: 'right' }}>{num(e.litros)} L</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        ) : (
          <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem' }}>No hay consumo de GT (tipo «uso») en ese rango. No se cargaría nada.</div>
        )}
      </div>
      </div>
    </Modal>
  );
}
