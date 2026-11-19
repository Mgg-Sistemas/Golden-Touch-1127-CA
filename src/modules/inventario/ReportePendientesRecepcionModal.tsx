/* ============================================================
   Golden Touch · Modal de Reporte Dinámico de Pendientes por Recepcionar
   (Alineado al estilo estándar MGG · 18/11/2026)
   ============================================================ */

import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import {
  calcularTotalesPendientes,
  construirWhatsappPendientesRecepcion,
  filtrarPendientesRecepcion,
  isoADiaVE,
  type FilaPendienteRecepcion,
  type FiltrosReportePendientes,
  type TipoFiltroRecepcion,
} from './pendientesRecepcionReporte';
import { generarReportePendientesRecepcionPdf } from './pendientesRecepcionPdf';

const surf2 = {
  background: 'var(--surface-2, #182230)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '.75rem .9rem',
} as const;

const tituloSec = {
  fontSize: '.78rem',
  fontWeight: 700,
  letterSpacing: '.03em',
  color: 'var(--text-muted, #94a3b8)',
  textTransform: 'uppercase',
  display: 'flex',
  alignItems: 'center',
  gap: '.35rem',
  marginBottom: '.45rem',
} as const;

interface ReportePendientesRecepcionModalProps {
  filas: FilaPendienteRecepcion[];
  actor?: string | null;
  modoInicial?: 'reporte' | 'pdf' | 'whatsapp';
  onClose: () => void;
}

function rangoMesVE(offsetMeses: number): { desde: string; hasta: string } {
  const hoy = isoADiaVE(new Date().toISOString());
  const [yStr, mStr] = hoy.split('-');
  const y0 = Number(yStr) || new Date().getFullYear();
  const m0 = (Number(mStr) || 1) - 1 + offsetMeses;
  const inicio = new Date(Date.UTC(y0, m0, 1));
  const fin = new Date(Date.UTC(y0, m0 + 1, 0));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { desde: fmt(inicio), hasta: offsetMeses === 0 ? hoy : fmt(fin) };
}

export function ReportePendientesRecepcionModal({
  filas,
  actor,
  modoInicial = 'reporte',
  onClose,
}: ReportePendientesRecepcionModalProps) {
  const totalesBase = useMemo(() => calcularTotalesPendientes(filas), [filas]);

  const { sedesDisponibles, analistasDisponibles } = useMemo(() => {
    const s = new Set<string>();
    const a = new Set<string>();
    for (const f of filas) {
      if (f.almacenDestino && f.almacenDestino !== '—') s.add(f.almacenDestino);
      if (f.analista && f.analista !== '—') a.add(f.analista);
    }
    return {
      sedesDisponibles: Array.from(s).sort((x, y) => x.localeCompare(y, 'es-VE')),
      analistasDisponibles: Array.from(a).sort((x, y) => x.localeCompare(y, 'es-VE')),
    };
  }, [filas]);

  // Estado de filtros interactivos idéntico a MGG
  const [texto, setTexto] = useState('');
  const [sede, setSede] = useState('');
  const [analista, setAnalista] = useState('');
  const [tipo, setTipo] = useState<TipoFiltroRecepcion>('todos');
  const [criterioFecha, setCriterioFecha] = useState<'montada' | 'pago'>('montada');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [presetFecha, setPresetFecha] = useState<'todos' | 'hoy' | 'mes' | 'mesPasado'>('todos');

  // Panel desplegable de WhatsApp integrado arriba
  const [verWhatsapp, setVerWhatsapp] = useState(modoInicial === 'whatsapp');
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const filtrosActuales: FiltrosReportePendientes = useMemo(
    () => ({
      texto,
      sede,
      analista,
      tipo,
      criterioFecha,
      desde,
      hasta,
    }),
    [texto, sede, analista, tipo, criterioFecha, desde, hasta],
  );

  const filasFiltradas = useMemo(
    () => filtrarPendientesRecepcion(filas, filtrosActuales),
    [filas, filtrosActuales],
  );

  const totales = useMemo(() => calcularTotalesPendientes(filasFiltradas), [filasFiltradas]);

  const textoWhatsapp = useMemo(
    () => construirWhatsappPendientesRecepcion(filasFiltradas, filtrosActuales, actor),
    [filasFiltradas, filtrosActuales, actor],
  );

  async function handleDescargarPdf() {
    if (!filasFiltradas.length) {
      toast('No hay recepciones pendientes para generar el PDF.', 'warning');
      return;
    }
    try {
      setGenerandoPdf(true);
      await generarReportePendientesRecepcionPdf(filasFiltradas, filtrosActuales, actor);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo generar el PDF', 'error');
    } finally {
      setGenerandoPdf(false);
    }
  }

  function handleAplicarPreset(p: 'todos' | 'hoy' | 'mes' | 'mesPasado') {
    setPresetFecha(p);
    if (p === 'todos') {
      setDesde('');
      setHasta('');
    } else if (p === 'hoy') {
      const h = isoADiaVE(new Date().toISOString());
      setDesde(h);
      setHasta(h);
    } else if (p === 'mes') {
      const r = rangoMesVE(0);
      setDesde(r.desde);
      setHasta(r.hasta);
    } else {
      const r = rangoMesVE(-1);
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  }

  function handleLimpiarFiltros() {
    setTexto('');
    setSede('');
    setAnalista('');
    setTipo('todos');
    setCriterioFecha('montada');
    setDesde('');
    setHasta('');
    setPresetFecha('todos');
  }

  const desgloseKpi = [
    `${totales.totalOc} OC`,
    totales.totalCs > 0 ? `${totales.totalCs} CS` : null,
    `${totales.totalDirectas} Compras directas`,
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      title="📦 Reporte Dinámico de Pendientes por Recepcionar"
      size="xl"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '.5rem' }}>
          <div className="muted" style={{ fontSize: '.84rem' }}>
            Mostrando <strong>{num(filasFiltradas.length)}</strong> de <strong>{num(filas.length)}</strong> registros
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={generandoPdf || filasFiltradas.length === 0}
              onClick={() => void handleDescargarPdf()}
            >
              {generandoPdf ? 'Generando PDF…' : '📄 Generar PDF'}
            </button>
            <button
              type="button"
              className={`btn ${verWhatsapp ? 'btn-primary' : 'btn-outline-success'}`}
              style={verWhatsapp ? {} : { color: '#25D366', borderColor: '#25D366' }}
              onClick={() => setVerWhatsapp((v) => !v)}
            >
              💬 {verWhatsapp ? 'Ocultar WhatsApp' : 'Compartir por WhatsApp'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>

        {/* ── 1. Panel de WhatsApp Estructurado (Desplegable / Conmutador) ── */}
        {verWhatsapp && (
          <div
            className="card"
            style={{
              margin: 0,
              background: 'var(--surface-3, #1e293b)',
              border: '1px solid var(--success, #25D366)',
              padding: '.85rem',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.25))',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '.6rem',
              }}
            >
              <strong
                style={{
                  fontSize: '.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.45rem',
                  color: 'var(--success, #25D366)',
                }}
              >
                <span>💬</span> Mensaje estructurado para WhatsApp · Pendientes por Recepcionar
              </strong>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setVerWhatsapp(false)}
                style={{ fontSize: '.78rem' }}
              >
                ✕ Ocultar
              </button>
            </div>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 0, marginBottom: '.65rem' }}>
              Incluye analista, fechas de montaje y pago, destino sugerido y la leyenda obligatoria: <strong>NO HA LLEGADO A ALMACEN DAR STATUS</strong>.
            </p>
            <CompartirWhatsapp texto={textoWhatsapp} />
          </div>
        )}

        {/* ── 2. Tarjetas de Filtros Dinámicos (Estilo Tarjetas MGG) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.65rem' }}>

          {/* Tarjeta A: Búsqueda y Segmentación */}
          <div style={surf2}>
            <div style={tituloSec}>
              <span>🔍</span> Búsqueda y Segmentación
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem', marginBottom: '.65rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%', fontSize: '.84rem' }}
                  placeholder="Buscar código (OC / CS / CD), analista, material o proveedor…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '.76rem', fontWeight: 600, display: 'block', marginBottom: '.2rem' }}>
                  🏢 Destino sugerido
                </label>
                <select
                  className="select"
                  style={{ width: '100%', fontSize: '.82rem' }}
                  value={sede}
                  onChange={(e) => setSede(e.target.value)}
                >
                  <option value="">Todos ({sedesDisponibles.length})</option>
                  {sedesDisponibles.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '.76rem', fontWeight: 600, display: 'block', marginBottom: '.2rem' }}>
                  👤 Analista encargado
                </label>
                <select
                  className="select"
                  style={{ width: '100%', fontSize: '.82rem' }}
                  value={analista}
                  onChange={(e) => setAnalista(e.target.value)}
                >
                  <option value="">Todos ({analistasDisponibles.length})</option>
                  {analistasDisponibles.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chips de Tipo de Orden */}
            <div>
              <span className="muted" style={{ fontSize: '.74rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
                📦 Tipo de documento:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${tipo === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.78rem' }}
                  onClick={() => setTipo('todos')}
                >
                  Todos ({filas.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${tipo === 'oc' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.78rem' }}
                  onClick={() => setTipo('oc')}
                >
                  Solo OC ({totalesBase.totalOc})
                </button>
                {totalesBase.totalCs > 0 && (
                  <button
                    type="button"
                    className={`btn btn-xs ${tipo === 'cs' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.78rem' }}
                    onClick={() => setTipo('cs')}
                  >
                    Solo Servicios CS ({totalesBase.totalCs})
                  </button>
                )}
                <button
                  type="button"
                  className={`btn btn-xs ${tipo === 'directa' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.78rem' }}
                  onClick={() => setTipo('directa')}
                >
                  Solo Directas ({totalesBase.totalDirectas})
                </button>
              </div>
            </div>
          </div>

          {/* Tarjeta B: Período y Fechas */}
          <div style={surf2}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.45rem' }}>
              <div style={tituloSec}>
                <span>📅</span> Rango de Fechas
              </div>
              {(texto || sede || analista || tipo !== 'todos' || desde || hasta) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  style={{ fontSize: '.74rem', padding: '0 .4rem' }}
                  onClick={handleLimpiarFiltros}
                >
                  ✕ Limpiar filtros
                </button>
              )}
            </div>

            {/* Criterio de Fecha (Pills) */}
            <div style={{ marginBottom: '.5rem' }}>
              <span className="muted" style={{ fontSize: '.74rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>
                Filtrar período por:
              </span>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${criterioFecha === 'montada' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.78rem' }}
                  onClick={() => setCriterioFecha('montada')}
                >
                  📅 Fecha montada
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${criterioFecha === 'pago' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: '999px', padding: '.2rem .65rem', fontSize: '.78rem' }}
                  onClick={() => setCriterioFecha('pago')}
                >
                  💳 Fecha que pagó Tesorería
                </button>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div style={{ marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${presetFecha === 'todos' && !desde && !hasta ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{ padding: '.15rem .45rem', fontSize: '.75rem' }}
                  onClick={() => handleAplicarPreset('todos')}
                >
                  Histórico completo
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${presetFecha === 'hoy' ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{ padding: '.15rem .45rem', fontSize: '.75rem' }}
                  onClick={() => handleAplicarPreset('hoy')}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${presetFecha === 'mes' ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{ padding: '.15rem .45rem', fontSize: '.75rem' }}
                  onClick={() => handleAplicarPreset('mes')}
                >
                  Este mes
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${presetFecha === 'mesPasado' ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{ padding: '.15rem .45rem', fontSize: '.75rem' }}
                  onClick={() => handleAplicarPreset('mesPasado')}
                >
                  Mes pasado
                </button>
              </div>
            </div>

            {/* Inputs Desde y Hasta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
              <div>
                <label style={{ fontSize: '.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '.15rem' }}>Desde</label>
                <input
                  type="date"
                  className="input input-sm"
                  style={{ width: '100%', fontSize: '.8rem' }}
                  value={desde}
                  onChange={(e) => {
                    setDesde(e.target.value);
                    setPresetFecha('todos');
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '.15rem' }}>Hasta</label>
                <input
                  type="date"
                  className="input input-sm"
                  style={{ width: '100%', fontSize: '.8rem' }}
                  value={hasta}
                  onChange={(e) => {
                    setHasta(e.target.value);
                    setPresetFecha('todos');
                  }}
                />
              </div>
            </div>
          </div>

        </div>

        {/* ── 3. Tarjetas KPI Ejecutivas (Estilo MGG) ── */}
        <div
          style={{
            background: 'var(--surface-1, #0f172a)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '.65rem .85rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '.65rem',
          }}
        >
          <div className="card" style={{ margin: 0, padding: '.65rem .8rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div className="muted" style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' }}>
              Pendientes por recibir
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b', margin: '.2rem 0' }}>
              {num(totales.totalRegistros)}
            </div>
            <div className="muted" style={{ fontSize: '.72rem' }}>
              {desgloseKpi}
            </div>
          </div>

          <div className="card" style={{ margin: 0, padding: '.65rem .8rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div className="muted" style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' }}>
              Ítems y unidades
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', margin: '.2rem 0' }}>
              {num(totales.totalItems)}
            </div>
            <div className="muted" style={{ fontSize: '.72rem' }}>
              {num(totales.totalUnidades)} und. estimadas
            </div>
          </div>

          <div className="card" style={{ margin: 0, padding: '.65rem .8rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div className="muted" style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' }}>
              Total en divisas
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e', margin: '.2rem 0' }}>
              {money(totales.totalUsd, 'USD')}
            </div>
            <div className="muted" style={{ fontSize: '.72rem' }}>
              En órdenes y compras en $
            </div>
          </div>

          {totales.totalBs > 0 && (
            <div className="card" style={{ margin: 0, padding: '.65rem .8rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div className="muted" style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' }}>
                Total en bolívares
              </div>
              <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#eab308', margin: '.2rem 0' }}>
                {money(totales.totalBs, 'Bs')}
              </div>
              <div className="muted" style={{ fontSize: '.72rem' }}>
                En órdenes y compras en Bs
              </div>
            </div>
          )}
        </div>

        {/* ── 4. Vista Previa Tabular Ejecutiva (Estilo Tabla MGG) ── */}
        <div style={surf2}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.4rem' }}>
            <span style={{ ...tituloSec, fontSize: '.84rem', color: 'var(--text, #f1f5f9)' }}>
              <span>👁️</span> Vista previa del listado
              <span className="badge" style={{ fontSize: '.72rem', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>
                {filasFiltradas.length} {filasFiltradas.length === 1 ? 'registro' : 'registros'}
              </span>
            </span>
          </div>

          <div style={{ maxHeight: '42vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem', margin: 0 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-1, #0f172a)', zIndex: 1, borderBottom: '1px solid var(--border)' }}>
                <tr>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'center', width: 36, color: '#94a3b8', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>DOCUMENTO / TIPO</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>FECHA MONTADA</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>PAGÓ TESORERÍA</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>ANALISTA ENCARGADO</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>DESTINO SUGERIDO</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>ÍTEMS / UND.</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>MONTO TOTAL</th>
                  <th style={{ padding: '.5rem .6rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {!filasFiltradas.length ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                      No hay recepciones pendientes que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filasFiltradas.map((f, idx) => (
                    <tr
                      key={f.uid}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '.45rem .6rem', textAlign: 'center', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '.45rem .6rem' }}>
                        <div className="mono" style={{ fontWeight: 700, color: '#f1f5f9' }}>{f.codigo}</div>
                        <span className="muted" style={{ fontSize: '.72rem' }}>{f.origenLabel}</span>
                      </td>
                      <td style={{ padding: '.45rem .6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {f.fechaMontadaFmt}
                      </td>
                      <td style={{ padding: '.45rem .6rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          className={`badge ${f.tienePagoTesoreria ? 'success' : 'warning'}`}
                          style={{ fontSize: '.74rem' }}
                        >
                          {f.fechaPagoFmt}
                        </span>
                      </td>
                      <td style={{ padding: '.45rem .6rem' }}>
                        <span style={{ fontWeight: 600, color: '#f1f5f9' }}>👤 {f.analista}</span>
                      </td>
                      <td style={{ padding: '.45rem .6rem' }}>
                        <span>🏭 {f.almacenDestino}</span>
                      </td>
                      <td style={{ padding: '.45rem .6rem', textAlign: 'center' }}>
                        <div>{f.numItems} ítem{f.numItems !== 1 ? 's' : ''}</div>
                        <div className="muted" style={{ fontSize: '.72rem' }}>({num(f.totalUnidades)} und.)</div>
                      </td>
                      <td style={{ padding: '.45rem .6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className="mono" style={{ fontWeight: 700, color: '#22c55e' }}>
                          {money(f.montoNativo, f.moneda)}
                        </span>
                      </td>
                      <td style={{ padding: '.45rem .6rem', textAlign: 'center' }}>
                        <span className="badge info" style={{ fontSize: '.72rem' }}>
                          {f.estadoLabel}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Modal>
  );
}
