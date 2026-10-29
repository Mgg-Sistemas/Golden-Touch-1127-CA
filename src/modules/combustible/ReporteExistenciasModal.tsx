import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { money, num } from '@/shared/lib/format';
import { isoAVe } from '@/shared/lib/fechaVE';
import { esBidon } from './bidonCombustible';
import { listMovimientosTanque, type ReporteTanque } from './tanques.repository';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import { descargarReporteExistenciasPdf } from './reporteExistenciasPdf';
import { descargarReporteExistenciasExcel } from './reporteExistenciasExcel';

interface Props {
  tanques: TanqueCombustible[];
  reporte: ReporteTanque[];
  onClose: () => void;
}

type PeriodoFiltro = 'mes_actual' | '7dias' | '15dias' | '30dias' | 'todos';
type TipoFiltro = 'uso_traslado' | 'uso' | 'traslado' | 'todos';

function fechaHoraActualVE(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
}

function hoyIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function restarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d);
  date.setDate(date.getDate() - dias);
  const resY = date.getFullYear();
  const resM = String(date.getMonth() + 1).padStart(2, '0');
  const resD = String(date.getDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

export function ReporteExistenciasModal({ tanques, reporte, onClose }: Props) {
  // 1. Filtros de periodo y tipo de movimiento
  const [periodo, setPeriodo] = useState<PeriodoFiltro>('mes_actual');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('uso_traslado');

  // 2. Cache de movimientos por tanque
  const [movsMap, setMovsMap] = useState<Record<string, MovimientoTanque[]>>({});
  const [cargandoMovs, setCargandoMovs] = useState<boolean>(false);
  const [generandoPdf, setGenerandoPdf] = useState<boolean>(false);
  const [generandoExcel, setGenerandoExcel] = useState<boolean>(false);

  const hoy = useMemo(() => hoyIso(), []);
  const mesActual = useMemo(() => hoy.slice(0, 7), [hoy]);
  const fechaDesdeFiltro = useMemo(() => {
    if (periodo === 'mes_actual') return `${mesActual}-01`;
    if (periodo === '7dias') return restarDias(hoy, 7);
    if (periodo === '15dias') return restarDias(hoy, 15);
    if (periodo === '30dias') return restarDias(hoy, 30);
    return '';
  }, [periodo, mesActual, hoy]);

  const periodoLabel = useMemo(() => {
    switch (periodo) {
      case 'mes_actual': return 'Mes en curso';
      case '7dias': return 'Últimos 7 días';
      case '15dias': return 'Últimos 15 días';
      case '30dias': return 'Últimos 30 días';
      case 'todos': return 'Historial completo';
    }
  }, [periodo]);

  // Mapa rápido de id -> TanqueCombustible
  const tanqueById = useMemo(() => {
    const map = new Map<string, TanqueCombustible>();
    for (const t of tanques) map.set(t.id, t);
    return map;
  }, [tanques]);

  // Cargar movimientos para todos los tanques de una vez
  useEffect(() => {
    const todosIds = reporte.map((r) => r.tanque.id);
    const faltantes = todosIds.filter((id) => !movsMap[id]);
    if (!faltantes.length) return;

    let cancel = false;
    setCargandoMovs(true);

    Promise.all(
      faltantes.map(async (id) => {
        try {
          const ms = await listMovimientosTanque(id);
          return { id, ms };
        } catch {
          return { id, ms: [] };
        }
      }),
    )
      .then((resultados) => {
        if (cancel) return;
        setMovsMap((prev) => {
          const next = { ...prev };
          for (const res of resultados) {
            next[res.id] = res.ms;
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancel) setCargandoMovs(false);
      });

    return () => {
      cancel = true;
    };
  }, [reporte, movsMap]);

  // Totales acumulados de todos los tanques
  const totales = useMemo(() => {
    const totalLitros = reporte.reduce((acc, r) => acc + (Number(r.disponible) || 0), 0);
    const totalValor = reporte.reduce(
      (acc, r) => acc + (Number(r.disponible) || 0) * (Number(r.tanque.tasa_usd_litro) || 0),
      0,
    );
    const tasaProm = totalLitros > 0 ? totalValor / totalLitros : 0;
    return {
      litros: totalLitros,
      valor: totalValor,
      tasaProm,
      count: reporte.length,
    };
  }, [reporte]);

  // Movimientos filtrados por cada tanque según periodo y tipo
  const detallePorTanque = useMemo(() => {
    return reporte.map((rep) => {
      const todosMovs = movsMap[rep.tanque.id] ?? [];
      const filtrados = todosMovs.filter((m) => {
        // Filtro de periodo
        if (fechaDesdeFiltro && (m.fecha ?? '') < fechaDesdeFiltro) return false;
        // Filtro de tipo
        if (tipoFiltro === 'uso_traslado') {
          return m.tipo === 'uso' || m.tipo === 'traslado';
        }
        if (tipoFiltro === 'uso') return m.tipo === 'uso';
        if (tipoFiltro === 'traslado') return m.tipo === 'traslado';
        return true;
      });

      // Subtotales del periodo para este tanque
      const surtidosLitros = filtrados
        .filter((m) => m.tipo === 'uso')
        .reduce((acc, m) => acc + (Number(m.litros) || 0), 0);
      const surtidosCount = filtrados.filter((m) => m.tipo === 'uso').length;

      const trasladosLitros = filtrados
        .filter((m) => m.tipo === 'traslado')
        .reduce((acc, m) => acc + (Number(m.litros) || 0), 0);
      const trasladosCount = filtrados.filter((m) => m.tipo === 'traslado').length;

      const entradasLitros = filtrados
        .filter((m) => m.tipo === 'entrada' || m.tipo === 'retorno')
        .reduce((acc, m) => acc + (Number(m.litros) || 0), 0);

      return {
        tanque: rep.tanque,
        disponible: rep.disponible,
        movimientos: filtrados,
        surtidosLitros,
        surtidosCount,
        trasladosLitros,
        trasladosCount,
        entradasLitros,
      };
    });
  }, [reporte, movsMap, fechaDesdeFiltro, tipoFiltro]);

  const emitido = useMemo(() => fechaHoraActualVE(), []);

  // Exportar a PDF
  async function handleExportPdf() {
    setGenerandoPdf(true);
    try {
      await descargarReporteExistenciasPdf({
        reportes: reporte,
        detallePorTanque,
        periodoLabel,
      });
    } finally {
      setGenerandoPdf(false);
    }
  }

  // Exportar a Excel
  async function handleExportExcel() {
    setGenerandoExcel(true);
    try {
      await descargarReporteExistenciasExcel({
        reportes: reporte,
        detallePorTanque,
        periodoLabel,
      });
    } finally {
      setGenerandoExcel(false);
    }
  }

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '.5rem' }}>
      <button className="btn btn-ghost" onClick={onClose}>
        Cerrar
      </button>

      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={handleExportExcel}
          disabled={generandoExcel || cargandoMovs}
          title="Generar y previsualizar reporte en Excel (.xlsx) con hojas de existencias y movimientos"
        >
          {generandoExcel ? 'Generando Excel…' : '📊 Descargar Excel'}
        </button>

        <button
          className="btn btn-ghost"
          onClick={handleExportPdf}
          disabled={generandoPdf || cargandoMovs}
          title="Generar y previsualizar reporte oficial en PDF con membrete formal"
        >
          {generandoPdf ? 'Generando PDF…' : '📄 Descargar PDF'}
        </button>

        <button
          className="btn btn-primary"
          onClick={() => window.print()}
          title="Imprimir vista previa"
        >
          🖨 Imprimir
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      title="📄 Reporte de existencias y movimientos de combustible"
      size="xl"
      onClose={onClose}
      footer={footer}
    >
      <div style={{ color: 'var(--text)' }}>
        {/* Cabecera / Barra de herramientas superior con los estilos nativos del sistema */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '.75rem',
            padding: '.75rem 1rem',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
            marginBottom: '1.25rem',
          }}
        >
          {/* Selector de periodo estilizado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: '.8rem', fontWeight: 600 }}>
              📅 Movimientos:
            </span>
            <div style={{ display: 'inline-flex', gap: '.25rem' }}>
              <button
                type="button"
                className={`btn btn-xs ${periodo === 'mes_actual' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodo('mes_actual')}
              >
                Mes actual
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === '7dias' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodo('7dias')}
              >
                7 días
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === '15dias' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodo('15dias')}
              >
                15 días
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === '30dias' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodo('30dias')}
              >
                30 días
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriodo('todos')}
              >
                Todos
              </button>
            </div>
          </div>

          {/* Filtro de tipo de movimiento */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span className="muted" style={{ fontSize: '.8rem', fontWeight: 600 }}>
              Filtrar:
            </span>
            <select
              className="input input-sm"
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)}
              style={{ minWidth: 180, fontSize: '.8rem' }}
            >
              <option value="uso_traslado">⛽ Surtidos y ↔ Traslados</option>
              <option value="uso">Solo Surtidos (Equipos)</option>
              <option value="traslado">Solo Traslados</option>
              <option value="todos">Todos los movimientos</option>
            </select>
          </div>
        </div>

        {/* Encabezado del documento para vista previa y para impresión */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--primary)' }}>
            Golden Touch 1127 C.A. · Control de Combustible
          </div>
          <h2 style={{ margin: '.25rem 0 .2rem 0', fontSize: '1.4rem' }}>
            Reporte de Existencias y Movimientos
          </h2>
          <div className="muted" style={{ fontSize: '.8rem', textTransform: 'capitalize' }}>
            {emitido} · {periodoLabel}
          </div>
        </div>

        {/* ================= BLOQUE 1: TARJETAS DE LO QUE QUEDA ================= */}
        <div style={{ marginBottom: '1.75rem' }}>
          {/* Tarjeta Hero Resumen Consolidado */}
          <div
            className="card"
            style={{
              margin: '0 0 1rem 0',
              borderColor: 'var(--primary)',
              borderWidth: 2,
              background: 'linear-gradient(135deg, var(--surface-2), var(--surface))',
              padding: '1.1rem',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1.25rem',
              textAlign: 'center',
            }}
          >
            <div>
              <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Total Disponible en Tanques
              </div>
              <div className="mono" style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--primary)' }}>
                {num(totales.litros)} <span style={{ fontSize: '1rem', fontWeight: 500 }} className="muted">ltrs</span>
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.5rem' }}>
              <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Valor Total Disponible
              </div>
              <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)' }}>
                {money(totales.valor)}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.5rem' }}>
              <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Tasa Ponderada Promedio
              </div>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {money(totales.tasaProm)} / ltr
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.5rem' }}>
              <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Tanques Activos
              </div>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                {totales.count}
              </div>
            </div>
          </div>

          {/* Grid de tarjetas individuales por tanque */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '.75rem',
            }}
          >
            {reporte.map((r) => {
              const cap = Number(r.tanque.capacidad_litros) || 0;
              const disp = Number(r.disponible) || 0;
              const tasa = Number(r.tanque.tasa_usd_litro) || 0;
              const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
              const colorBarra = pct < 12 ? 'var(--danger)' : pct < 30 ? 'var(--warning)' : 'var(--primary)';

              return (
                <div
                  key={r.tanque.id}
                  className="card"
                  style={{
                    margin: 0,
                    padding: '.85rem',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    pageBreakInside: 'avoid',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.4rem', marginBottom: '.35rem' }}>
                      <strong style={{ fontSize: '.9rem' }}>
                        {esBidon(r.tanque.nombre) ? '🪣' : r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}
                      </strong>
                      <div style={{ display: 'inline-flex', gap: '.25rem' }}>
                        {esBidon(r.tanque.nombre) && <span className="badge" style={{ fontSize: '.68rem' }}>bidón</span>}
                        {r.tanque.es_movil && !esBidon(r.tanque.nombre) && <span className="badge" style={{ fontSize: '.68rem' }}>móvil</span>}
                        {r.tanque.estado !== 'activo' && <span className="badge" style={{ fontSize: '.68rem' }}>inactivo</span>}
                      </div>
                    </div>

                    {/* Litros disponibles */}
                    <div className="mono" style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text)' }}>
                      {num(disp)} <span style={{ fontSize: '.78rem', fontWeight: 500 }} className="muted">ltrs</span>
                    </div>

                    {/* Barra de progreso de llenado */}
                    <div
                      style={{
                        height: 7,
                        borderRadius: 4,
                        background: 'var(--surface-2)',
                        margin: '.45rem 0',
                        overflow: 'hidden',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ width: `${pct}%`, height: '100%', background: colorBarra }} />
                    </div>
                  </div>

                  {/* Capacidad y métricas monetarias */}
                  <div className="muted" style={{ fontSize: '.74rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.35rem', marginTop: '.2rem' }}>
                    <span>Cap. <strong className="mono">{num(cap)}</strong> l ({pct.toFixed(0)}%)</span>
                    <span>Tasa <strong className="mono">{money(tasa)}</strong></span>
                    <span style={{ color: 'var(--success)' }}>Valor <strong className="mono">{money(disp * tasa)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= BLOQUE 2: DETALLE POR TANQUE DE SURTIDOS Y TRASLADOS ================= */}
        <div style={{ marginTop: '2rem' }}>
          <div style={{ borderBottom: '2px solid var(--primary)', paddingBottom: '.4rem', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
              📋 Detalle de Movimientos por Tanque
            </h3>
            <div className="muted" style={{ fontSize: '.8rem', marginTop: '.2rem' }}>
              {tipoFiltro === 'uso_traslado'
                ? 'Surtidos (consumo de equipos) y Traslados (hacia/desde minas)'
                : tipoFiltro === 'uso'
                  ? 'Despachos de combustible a equipos'
                  : tipoFiltro === 'traslado'
                    ? 'Traslados entre tanques o minas'
                    : 'Todos los movimientos registrados'}
              {' · '}
              <span>{periodoLabel}</span>
            </div>
          </div>

          {cargandoMovs && (
            <p className="muted" style={{ fontSize: '.85rem', fontStyle: 'italic', margin: '1rem 0' }}>
              Cargando movimientos…
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {detallePorTanque.map((item) => {
              return (
                <div
                  key={item.tanque.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    overflow: 'hidden',
                    pageBreakInside: 'avoid',
                  }}
                >
                  {/* Cabecera del tanque */}
                  <div
                    style={{
                      background: 'var(--surface-2)',
                      padding: '.7rem .95rem',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '.6rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>
                        {esBidon(item.tanque.nombre) ? '🪣' : item.tanque.es_movil ? '🚚' : '🛢'}
                      </span>
                      <div>
                        <strong style={{ fontSize: '.95rem' }}>{item.tanque.nombre}</strong>
                        <div className="muted" style={{ fontSize: '.75rem' }}>
                          Capacidad: {num(item.tanque.capacidad_litros)} ltrs · Saldo disponible: <strong className="mono" style={{ color: 'var(--primary)' }}>{num(item.disponible)} ltrs</strong>
                        </div>
                      </div>
                    </div>

                    {/* Resumen del periodo en chips */}
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', fontSize: '.78rem' }}>
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(255, 138, 0, 0.15)',
                          color: 'var(--primary)',
                          borderColor: 'var(--primary)',
                          padding: '.25rem .55rem',
                        }}
                      >
                        ⛽ Surtidos: <strong>{num(item.surtidosLitros)} ltrs</strong> ({item.surtidosCount})
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#3b82f6',
                          borderColor: '#3b82f6',
                          padding: '.25rem .55rem',
                        }}
                      >
                        ↔ Traslados: <strong>{num(item.trasladosLitros)} ltrs</strong> ({item.trasladosCount})
                      </span>
                      {item.entradasLitros > 0 && (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--success)',
                            borderColor: 'var(--success)',
                            padding: '.25rem .55rem',
                          }}
                        >
                          ⬇ Entradas: <strong>{num(item.entradasLitros)} ltrs</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tabla de movimientos del tanque */}
                  {item.movimientos.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center' }} className="muted">
                      Sin movimientos registrados en este período.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table" style={{ width: '100%', fontSize: '.8rem', margin: 0 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'left', width: '100px' }}>Fecha</th>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'left', width: '115px' }}>Tipo</th>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'left' }}>Equipo / Destino</th>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'right', width: '105px' }}>Litros</th>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'right', width: '105px' }}>Saldo Tank</th>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'left', width: '130px' }}>Autorizado / Chofer</th>
                            <th style={{ padding: '.5rem .7rem', textAlign: 'left' }}>Observaciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.movimientos.map((m) => {
                            const esSalida = m.tipo === 'uso' || m.tipo === 'traslado' || m.tipo === 'merma';
                            const tanqueDestino = m.tanque_destino_id ? tanqueById.get(m.tanque_destino_id) : null;

                            return (
                              <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '.45rem .7rem', verticalAlign: 'top' }}>
                                  <div className="mono" style={{ fontWeight: 600 }}>{isoAVe(m.fecha)}</div>
                                  {m.hora && <div className="muted" style={{ fontSize: '.7rem' }}>{m.hora}</div>}
                                </td>

                                <td style={{ padding: '.45rem .7rem', verticalAlign: 'top' }}>
                                  {m.tipo === 'uso' ? (
                                    <span className="badge" style={{ background: 'rgba(255, 138, 0, 0.15)', color: 'var(--primary)', borderColor: 'var(--primary)', fontSize: '.7rem' }}>
                                      ⛽ Surtido
                                    </span>
                                  ) : m.tipo === 'traslado' ? (
                                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderColor: '#3b82f6', fontSize: '.7rem' }}>
                                      ↔ Traslado
                                    </span>
                                  ) : m.tipo === 'entrada' ? (
                                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', borderColor: 'var(--success)', fontSize: '.7rem' }}>
                                      ⬇ Entrada
                                    </span>
                                  ) : m.tipo === 'retorno' ? (
                                    <span className="badge" style={{ fontSize: '.7rem' }}>↩ Retorno</span>
                                  ) : (
                                    <span className="badge" style={{ fontSize: '.7rem', color: 'var(--danger)' }}>🔻 Merma</span>
                                  )}
                                </td>

                                <td style={{ padding: '.45rem .7rem', verticalAlign: 'top' }}>
                                  {m.tipo === 'uso' ? (
                                    <div>
                                      <strong style={{ color: 'var(--text)' }}>{m.equipo || '—'}</strong>
                                      <div className="muted" style={{ fontSize: '.7rem', marginTop: '.1rem' }}>
                                        {m.horometro_fin != null ? (
                                          <span>Horómetro: <strong className="mono">{num(m.horometro_fin)} h</strong></span>
                                        ) : m.kilometraje != null ? (
                                          <span>Km: <strong className="mono">{num(m.kilometraje)}</strong></span>
                                        ) : null}
                                        {m.ubicacion ? ` · ${m.ubicacion}` : ''}
                                      </div>
                                    </div>
                                  ) : m.tipo === 'traslado' ? (
                                    <div>
                                      <strong>{tanqueDestino ? `Hacia: ${tanqueDestino.nombre}` : m.ubicacion ? `Hacia: ${m.ubicacion}` : 'Traslado'}</strong>
                                      {m.ubicacion && tanqueDestino && (
                                        <div className="muted" style={{ fontSize: '.7rem' }}>Lugar: {m.ubicacion}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span>{m.ubicacion || 'Recepción'}</span>
                                    </div>
                                  )}
                                </td>

                                <td style={{ padding: '.45rem .7rem', textAlign: 'right', verticalAlign: 'top' }}>
                                  <span
                                    className="mono"
                                    style={{
                                      fontWeight: 700,
                                      color: esSalida ? 'var(--danger)' : 'var(--success)',
                                    }}
                                  >
                                    {esSalida ? `-${num(m.litros)}` : `+${num(m.litros)}`}
                                  </span>
                                </td>

                                <td style={{ padding: '.45rem .7rem', textAlign: 'right', verticalAlign: 'top' }}>
                                  <span className="mono muted" style={{ fontWeight: 600 }}>
                                    {m.saldo_litros != null ? `${num(m.saldo_litros)} l` : '—'}
                                  </span>
                                </td>

                                <td style={{ padding: '.45rem .7rem', verticalAlign: 'top' }}>
                                  <div>{m.autorizado_por || m.actor_name || m.created_by || '—'}</div>
                                </td>

                                <td style={{ padding: '.45rem .7rem', verticalAlign: 'top', color: 'var(--text-muted)' }}>
                                  {m.observacion || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pie de página */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', textAlign: 'center', fontSize: '.75rem' }} className="muted">
          <div>Golden Touch 1127 C.A. · Sistema de Gestión de Combustible</div>
          <div style={{ marginTop: '.2rem' }}>Valores calculados con la tasa promedio ponderada ($/L) vigente de cada tanque.</div>
        </div>
      </div>
    </Modal>
  );
}
