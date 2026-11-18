/* ============================================================
   Golden Touch · Inventario · Modal de Reporte Dinámico de Pendientes por Recepcionar
   (18/11/2026)

   Permite moldear en tiempo real el reporte de órdenes pendientes por recepcionar
   tanto en PDF (Tabla / Fichas) como en Mensaje de WhatsApp:
   - Filtros por tipo (OC / CS / Directa), estado, analista encargado, almacén,
     solicitante, búsqueda libre y rango de fechas (montada o pago Tesorería).
   - Selección individual por casilla (incluir / excluir órdenes puntuales).
   - Agrupación dinámica, ordenamiento y casillas de columnas/campos visibles.
   ============================================================ */

import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import {
  AVISO_WHATSAPP_POR_DEFECTO,
  CAMPOS_PENDIENTES_RECEPCION,
  CAMPOS_POR_DEFECTO_PENDIENTES,
  ETIQUETA_AGRUPACION_PENDIENTES,
  calcularResumenPendientes,
  construirWhatsappPendientesRecepcion,
  describirFiltrosPendientes,
  filtrarCandidatasPendientes,
  isoADiaVE,
  ordenarPendientesRecepcion,
  type AgrupacionPendientesRecepcion,
  type CampoPendienteRecepcion,
  type CriterioFechaPendientes,
  type EstadoPendienteRecepcion,
  type FilaPendienteRecepcion,
  type OrigenPendienteRecepcion,
  type OrdenPendientesRecepcion,
} from './pendientesRecepcionReporte';
import { descargarPendientesRecepcionPdf } from './pendientesRecepcionPdf';

interface ReportePendientesRecepcionModalProps {
  filas: FilaPendienteRecepcion[];
  modoInicial?: 'pdf' | 'whatsapp';
  onClose: () => void;
}

function fechaHaceDiasVE(dias: number): string {
  const d = new Date(Date.now() - dias * 86_400_000);
  return isoADiaVE(d.toISOString());
}

export function ReportePendientesRecepcionModal({
  filas,
  modoInicial = 'pdf',
  onClose,
}: ReportePendientesRecepcionModalProps) {
  const [vistaActiva, setVistaActiva] = useState<'tabla' | 'whatsapp'>(
    modoInicial === 'whatsapp' ? 'whatsapp' : 'tabla',
  );

  // Filtros dinámicos (por defecto «todas» para mostrar las 10 órdenes completas de inmediato)
  const [busqueda, setBusqueda] = useState('');
  const [origenes, setOrigenes] = useState<OrigenPendienteRecepcion[]>([]);
  const [estados, setEstados] = useState<EstadoPendienteRecepcion[]>([]);
  const [analista, setAnalista] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [criterioFecha, setCriterioFecha] = useState<CriterioFechaPendientes>('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [excluidos, setExcluidos] = useState<Set<string>>(() => new Set());

  // Estructura, agrupación y campos visibles
  const [agrupacion, setAgrupacion] = useState<AgrupacionPendientesRecepcion>('sin_agrupar');
  const [orden, setOrden] = useState<OrdenPendientesRecepcion>('pago_reciente');
  const [campos, setCampos] = useState<CampoPendienteRecepcion[]>(() => [...CAMPOS_POR_DEFECTO_PENDIENTES]);
  const [formatoPdf, setFormatoPdf] = useState<'tabla' | 'fichas'>('tabla');
  const [orientacionPdf, setOrientacionPdf] = useState<'landscape' | 'portrait'>('landscape');
  const [incluirResumen, setIncluirResumen] = useState(true);
  const [avisoWhatsapp, setAvisoWhatsapp] = useState(AVISO_WHATSAPP_POR_DEFECTO);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // Catálogos dinámicos derivados de las órdenes reales
  const analistasUnicos = useMemo(
    () => Array.from(new Set(filas.map((f) => f.analista).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es-VE')),
    [filas],
  );
  const almacenesUnicos = useMemo(
    () => Array.from(new Set(filas.map((f) => f.almacenDestino).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es-VE')),
    [filas],
  );
  const solicitantesUnicos = useMemo(
    () => Array.from(new Set(filas.map((f) => f.solicitante).filter((s) => s && s !== '—'))).sort((a, b) => a.localeCompare(b, 'es-VE')),
    [filas],
  );

  const filtrosBase = useMemo(
    () => ({
      busqueda,
      origenes,
      estados,
      analista,
      almacen,
      solicitante,
      criterioFecha,
      desde,
      hasta,
    }),
    [busqueda, origenes, estados, analista, almacen, solicitante, criterioFecha, desde, hasta],
  );

  const candidatas = useMemo(
    () => ordenarPendientesRecepcion(filtrarCandidatasPendientes(filas, filtrosBase), orden),
    [filas, filtrosBase, orden],
  );

  const seleccionadas = useMemo(
    () => candidatas.filter((f) => !excluidos.has(f.uid)),
    [candidatas, excluidos],
  );

  const resumen = useMemo(() => calcularResumenPendientes(seleccionadas), [seleccionadas]);
  const subtituloFiltros = useMemo(() => describirFiltrosPendientes(filtrosBase), [filtrosBase]);

  const textoWhatsapp = useMemo(
    () =>
      construirWhatsappPendientesRecepcion({
        filas: seleccionadas,
        agrupacion,
        campos,
        incluirResumen,
        subtituloFiltros,
        avisoEstado: avisoWhatsapp,
      }),
    [seleccionadas, agrupacion, campos, incluirResumen, subtituloFiltros, avisoWhatsapp],
  );

  function toggleOrigen(o: OrigenPendienteRecepcion) {
    setOrigenes((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
  }

  function toggleEstado(e: EstadoPendienteRecepcion) {
    setEstados((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function toggleCampo(c: CampoPendienteRecepcion) {
    setCampos((prev) => {
      if (prev.includes(c)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== c);
      }
      return [...prev, c];
    });
  }

  function toggleFila(uid: string) {
    setExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function marcarVisibles(marcar: boolean) {
    setExcluidos((prev) => {
      const next = new Set(prev);
      for (const f of candidatas) {
        if (marcar) next.delete(f.uid);
        else next.add(f.uid);
      }
      return next;
    });
  }

  function limpiarFiltros() {
    setBusqueda('');
    setOrigenes([]);
    setEstados([]);
    setAnalista('');
    setAlmacen('');
    setSolicitante('');
    setCriterioFecha('todas');
    setDesde('');
    setHasta('');
    setExcluidos(new Set());
  }

  function aplicarPresetFechas(preset: 'todas' | 'hoy' | '7d' | 'mes') {
    const hoy = isoADiaVE(new Date().toISOString());
    if (preset === 'todas') {
      setCriterioFecha('todas');
      setDesde('');
      setHasta('');
      return;
    }
    if (criterioFecha === 'todas') setCriterioFecha('pago');
    if (preset === 'hoy') {
      setDesde(hoy);
      setHasta(hoy);
    } else if (preset === '7d') {
      setDesde(fechaHaceDiasVE(7));
      setHasta(hoy);
    } else if (preset === 'mes') {
      setDesde(`${hoy.slice(0, 8)}01`);
      setHasta(hoy);
    }
  }

  function aplicarPresetCampos(preset: 'estandar' | 'completo' | 'almacen_sin_montos') {
    if (preset === 'estandar') {
      setCampos([...CAMPOS_POR_DEFECTO_PENDIENTES]);
    } else if (preset === 'completo') {
      setCampos(CAMPOS_PENDIENTES_RECEPCION.map((c) => c.clave));
    } else {
      setCampos([
        'codigo',
        'tipo_estado',
        'analista',
        'fecha_montada',
        'fecha_pago',
        'proveedor',
        'solicitante',
        'almacen',
        'items',
        'detalle_items',
      ]);
    }
  }

  async function handleGenerarPdf() {
    if (!seleccionadas.length) {
      toast('Selecciona al menos una orden pendiente para generar el PDF.', 'warning');
      return;
    }
    setGenerandoPdf(true);
    try {
      await descargarPendientesRecepcionPdf({
        filas: seleccionadas,
        campos,
        agrupacion,
        formatoPresentacion: formatoPdf,
        orientacion: orientacionPdf,
        incluirResumen,
        subtituloFiltros,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar el PDF.', 'error');
    } finally {
      setGenerandoPdf(false);
    }
  }

  const hayFiltrosActivos = Boolean(
    busqueda.trim() ||
    origenes.length ||
    estados.length ||
    analista ||
    almacen ||
    solicitante ||
    criterioFecha !== 'todas' ||
    excluidos.size > 0,
  );

  const todasVisiblesMarcadas = candidatas.length > 0 && candidatas.every((f) => !excluidos.has(f.uid));

  return (
    <Modal
      title="📊 Reporte dinámico · Pendientes por recepcionar"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={generandoPdf}>
            Cerrar
          </button>
          <button
            type="button"
            className={`btn ${vistaActiva === 'whatsapp' ? 'btn-ghost' : 'btn-wsp'}`}
            onClick={() => setVistaActiva(vistaActiva === 'whatsapp' ? 'tabla' : 'whatsapp')}
          >
            {vistaActiva === 'whatsapp' ? '📋 Ver tabla de órdenes' : `📲 Mensaje WhatsApp (${num(seleccionadas.length)})`}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleGenerarPdf()}
            disabled={generandoPdf || seleccionadas.length === 0}
          >
            {generandoPdf ? 'Generando PDF…' : `📄 Generar PDF (${num(seleccionadas.length)})`}
          </button>
        </>
      }
    >
      {/* ─── 1. Franja de KPIs en vivo ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          gap: '.55rem',
          marginBottom: '.75rem',
        }}
      >
        <div className="card" style={{ margin: 0, padding: '.55rem .75rem', borderLeft: '3px solid var(--brand, #ff8a00)' }}>
          <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', fontWeight: 700 }}>Incluidas en reporte</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            {num(seleccionadas.length)} <span className="muted" style={{ fontSize: '.78rem', fontWeight: 400 }}>de {num(filas.length)}</span>
          </div>
          <div className="muted" style={{ fontSize: '.7rem' }}>
            {resumen.totalOc} OC · {resumen.totalCs} CS{resumen.totalDirectas ? ` · ${resumen.totalDirectas} CD` : ''}
          </div>
        </div>

        <div className="card" style={{ margin: 0, padding: '.55rem .75rem', borderLeft: '3px solid var(--primary-3, #38bdf8)' }}>
          <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', fontWeight: 700 }}>Renglones / Unidades</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700 }}>{num(resumen.totalUnidades)} und.</div>
          <div className="muted" style={{ fontSize: '.7rem' }}>{num(resumen.totalItems)} ítem(s) por ingresar</div>
        </div>

        <div className="card" style={{ margin: 0, padding: '.55rem .75rem', borderLeft: '3px solid var(--success, #10b981)' }}>
          <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', fontWeight: 700 }}>Monto seleccionado</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--success, #10b981)' }}>
            {money(resumen.totalMontoUsd)}
          </div>
          <div className="muted" style={{ fontSize: '.7rem' }}>
            {num(resumen.totalPagadas)} pagada(s) · {num(resumen.totalPorRecibirSinPago)} sin pago
          </div>
        </div>

        <div className="card" style={{ margin: 0, padding: '.55rem .75rem', borderLeft: '3px solid var(--warning, #f59e0b)' }}>
          <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', fontWeight: 700 }}>Tiempo esperando</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700 }}>{resumen.promedioDiasPendiente} d prom.</div>
          <div className="muted" style={{ fontSize: '.7rem' }}>Máxima espera: {resumen.maxDiasPendiente} día(s)</div>
        </div>
      </div>

      {/* ─── 2. Panel de filtros dinámicos ─── */}
      <div className="card" style={{ margin: '0 0 .75rem', padding: '.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.55rem' }}>
          <strong style={{ fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>🎛 Filtros dinámicos</strong>
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            {(['oc', 'cs', 'directa'] as OrigenPendienteRecepcion[]).map((tipo) => {
              const activo = origenes.includes(tipo);
              const lbl = tipo === 'oc' ? '📦 OC' : tipo === 'cs' ? '🔧 CS (Servicios)' : '⚡ Directas';
              return (
                <button
                  key={tipo}
                  type="button"
                  className={`btn btn-sm ${activo ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleOrigen(tipo)}
                >
                  {lbl}
                </button>
              );
            })}
            {(['pagada', 'por_recibir'] as EstadoPendienteRecepcion[]).map((est) => {
              const activo = estados.includes(est);
              const lbl = est === 'pagada' ? '🟢 Pagadas' : '🟠 Sin pago aún';
              return (
                <button
                  key={est}
                  type="button"
                  className={`btn btn-sm ${activo ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleEstado(est)}
                >
                  {lbl}
                </button>
              );
            })}
            {hayFiltrosActivos && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={limpiarFiltros}>
                ↺ Restablecer todo
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.55rem' }}>
          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Búsqueda libre</label>
            <input
              className="input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔎 Código, analista, proveedor, ítem…"
            />
          </div>

          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Analista encargado</label>
            <select className="select" value={analista} onChange={(e) => setAnalista(e.target.value)}>
              <option value="">Todos los analistas ({analistasUnicos.length})</option>
              {analistasUnicos.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Almacén destino</label>
            <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              <option value="">Todos los destinos ({almacenesUnicos.length})</option>
              {almacenesUnicos.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Solicitante</label>
            <select className="select" value={solicitante} onChange={(e) => setSolicitante(e.target.value)}>
              <option value="">Todos los solicitantes ({solicitantesUnicos.length})</option>
              {solicitantesUnicos.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtro opcional de fechas (montada vs pago Tesorería) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'flex-end', marginTop: '.55rem' }}>
          <div style={{ minWidth: 195 }}>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Filtrar por fecha</label>
            <select
              className="select"
              value={criterioFecha}
              onChange={(e) => setCriterioFecha(e.target.value as CriterioFechaPendientes)}
            >
              <option value="todas">Todas las pendientes (sin corte)</option>
              <option value="pago">Por fecha pago Tesorería</option>
              <option value="montada">Por fecha montada (OC)</option>
            </select>
          </div>

          {criterioFecha !== 'todas' && (
            <>
              <div>
                <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Desde</label>
                <input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Hasta</label>
                <input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetFechas('todas')}>Todas</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetFechas('hoy')}>Hoy</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetFechas('7d')}>Últimos 7 días</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetFechas('mes')}>Este mes</button>
          </div>
        </div>
      </div>

      {/* ─── 3. Estructura, agrupación y campos visibles (PDF + WhatsApp) ─── */}
      <div className="card" style={{ margin: '0 0 .75rem', padding: '.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '.55rem', marginBottom: '.6rem' }}>
          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Agrupar reporte por</label>
            <select
              className="select"
              value={agrupacion}
              onChange={(e) => setAgrupacion(e.target.value as AgrupacionPendientesRecepcion)}
            >
              {Object.entries(ETIQUETA_AGRUPACION_PENDIENTES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Ordenar por</label>
            <select
              className="select"
              value={orden}
              onChange={(e) => setOrden(e.target.value as OrdenPendientesRecepcion)}
            >
              <option value="pago_reciente">Pago Tesorería (más reciente)</option>
              <option value="pago_antiguo">Pago Tesorería (más antigua)</option>
              <option value="montada_reciente">Fecha montada (más reciente)</option>
              <option value="montada_antigua">Fecha montada (más antigua)</option>
              <option value="antiguedad_desc">Mayor tiempo esperando</option>
              <option value="monto_desc">Mayor monto ($)</option>
              <option value="codigo_asc">Código (A → Z)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Diseño del PDF</label>
            <div style={{ display: 'flex', gap: '.35rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${formatoPdf === 'tabla' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setFormatoPdf('tabla')}
              >
                📋 Tabla
              </button>
              <button
                type="button"
                className={`btn btn-sm ${formatoPdf === 'fichas' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setFormatoPdf('fichas')}
              >
                🗂 Fichas
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '.73rem', display: 'block', marginBottom: '.2rem' }} className="muted">Orientación PDF</label>
            <div style={{ display: 'flex', gap: '.35rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${orientacionPdf === 'landscape' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setOrientacionPdf('landscape')}
              >
                ↔ Horizontal
              </button>
              <button
                type="button"
                className={`btn btn-sm ${orientacionPdf === 'portrait' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setOrientacionPdf('portrait')}
              >
                ↕ Vertical
              </button>
            </div>
          </div>
        </div>

        {/* Selector de columnas / campos */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.4rem', marginBottom: '.4rem' }}>
          <span className="muted" style={{ fontSize: '.74rem', fontWeight: 600 }}>
            Campos incluidos en PDF y WhatsApp ({campos.length} de {CAMPOS_PENDIENTES_RECEPCION.length}):
          </span>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetCampos('estandar')}>Estándar</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetCampos('completo')}>Con renglones</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => aplicarPresetCampos('almacen_sin_montos')}>Almacén (sin $)</button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.75rem', marginLeft: '.35rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={incluirResumen} onChange={(e) => setIncluirResumen(e.target.checked)} />
              Incluir KPIs de resumen
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem .65rem' }}>
          {CAMPOS_PENDIENTES_RECEPCION.map((c) => {
            const activo = campos.includes(c.clave);
            return (
              <label
                key={c.clave}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.3rem',
                  fontSize: '.76rem',
                  padding: '.2rem .5rem',
                  borderRadius: 6,
                  border: `1px solid ${activo ? 'var(--brand, #ff8a00)' : 'var(--border, rgba(148,163,184,.25))'}`,
                  background: activo ? 'rgba(255, 138, 0, 0.12)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={() => toggleCampo(c.clave)}
                />
                <span>{c.etiqueta}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ─── 4. Selector de pestañas: Tabla interactiva vs Mensaje de WhatsApp ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <div style={{ display: 'flex', gap: '.4rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${vistaActiva === 'tabla' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVistaActiva('tabla')}
          >
            📋 Selección de órdenes ({num(seleccionadas.length)} / {num(candidatas.length)})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${vistaActiva === 'whatsapp' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setVistaActiva('whatsapp')}
          >
            📲 Vista previa y envío por WhatsApp
          </button>
        </div>

        {vistaActiva === 'tabla' && candidatas.length > 0 && (
          <div style={{ display: 'flex', gap: '.35rem' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => marcarVisibles(true)}>
              ☑ Marcar visibles
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => marcarVisibles(false)}>
              ☐ Desmarcar visibles
            </button>
          </div>
        )}
      </div>

      {vistaActiva === 'whatsapp' ? (
        <div className="card" style={{ margin: 0, padding: '.85rem' }}>
          <div style={{ marginBottom: '.65rem' }}>
            <label style={{ fontSize: '.74rem', display: 'block', marginBottom: '.25rem', fontWeight: 600 }} className="muted">
              🚨 Encabezado / llamado de atención en WhatsApp
            </label>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 240, fontWeight: 700 }}
                value={avisoWhatsapp}
                onChange={(e) => setAvisoWhatsapp(e.target.value)}
                placeholder={AVISO_WHATSAPP_POR_DEFECTO}
              />
              {avisoWhatsapp !== AVISO_WHATSAPP_POR_DEFECTO && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setAvisoWhatsapp(AVISO_WHATSAPP_POR_DEFECTO)}
                >
                  ↺ Restaurar aviso
                </button>
              )}
            </div>
          </div>
          <CompartirWhatsapp texto={textoWhatsapp} />
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: '38vh', overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th style={{ width: 34, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={todasVisiblesMarcadas}
                    onChange={(e) => marcarVisibles(e.target.checked)}
                    aria-label="Seleccionar o desmarcar todas las órdenes visibles"
                  />
                </th>
                <th>Código</th>
                <th>Estado</th>
                <th>Analista encargado</th>
                <th>Fecha montada</th>
                <th>Pago Tesorería</th>
                <th>Proveedor</th>
                <th>Solicita / Destino</th>
                <th className="num">Ítems</th>
                {campos.includes('monto') && <th className="num">Monto ($)</th>}
              </tr>
            </thead>
            <tbody>
              {candidatas.length === 0 ? (
                <tr>
                  <td colSpan={campos.includes('monto') ? 10 : 9} className="muted" style={{ textAlign: 'center', padding: '1.2rem' }}>
                    Ninguna orden pendiente coincide con los filtros actuales.
                  </td>
                </tr>
              ) : (
                candidatas.map((f) => {
                  const marcada = !excluidos.has(f.uid);
                  return (
                    <tr
                      key={f.uid}
                      onClick={() => toggleFila(f.uid)}
                      style={{
                        cursor: 'pointer',
                        opacity: marcada ? 1 : 0.48,
                      }}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => toggleFila(f.uid)}
                          aria-label={`Incluir ${f.codigo}`}
                        />
                      </td>
                      <td className="mono">
                        <strong>{f.codigo}</strong>
                        {f.codigoSolicitud && <div className="muted" style={{ fontSize: '.68rem' }}>{f.codigoSolicitud}</div>}
                      </td>
                      <td>
                        <span className={`badge ${f.estado === 'pagada' ? 'success' : 'warning'}`}>
                          {f.estadoLabel}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{f.analista}</td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{f.fechaMontadaFmt}</td>
                      <td
                        className="mono"
                        style={{
                          whiteSpace: 'nowrap',
                          color: f.tienePagoTesoreria ? 'var(--success, #10b981)' : 'var(--warning, #f59e0b)',
                          fontWeight: f.tienePagoTesoreria ? 600 : 400,
                        }}
                      >
                        {f.fechaPagoFmt}
                      </td>
                      <td>{f.proveedor}</td>
                      <td>
                        <div>{f.solicitante}</div>
                        <div className="muted" style={{ fontSize: '.7rem' }}>↳ {f.almacenDestino}</div>
                      </td>
                      <td className="num mono" style={{ whiteSpace: 'nowrap' }}>
                        {num(f.numItems)} · {num(f.totalUnidades)}u
                      </td>
                      {campos.includes('monto') && (
                        <td className="num mono" style={{ fontWeight: 600 }}>
                          {money(f.montoUsd)}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
