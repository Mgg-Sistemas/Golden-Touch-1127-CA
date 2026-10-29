import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { money, num } from '@/shared/lib/format';
import { isoAVe } from '@/shared/lib/fechaVE';
import { esBidon } from './bidonCombustible';
import { listMovimientosTanque, type ReporteTanque } from './tanques.repository';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';

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
  // 1. Selección de tanques: por defecto todos los tanques activos
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(reporte.map((r) => r.tanque.id));
  });

  // 2. Filtros de periodo y tipo de movimiento
  const [periodo, setPeriodo] = useState<PeriodoFiltro>('mes_actual');
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('uso_traslado');

  // 3. Cache de movimientos por tanque
  const [movsMap, setMovsMap] = useState<Record<string, MovimientoTanque[]>>({});
  const [cargandoMovs, setCargandoMovs] = useState<boolean>(false);

  const hoy = useMemo(() => hoyIso(), []);
  const mesActual = useMemo(() => hoy.slice(0, 7), [hoy]);
  const fechaDesdeFiltro = useMemo(() => {
    if (periodo === 'mes_actual') return `${mesActual}-01`;
    if (periodo === '7dias') return restarDias(hoy, 7);
    if (periodo === '15dias') return restarDias(hoy, 15);
    if (periodo === '30dias') return restarDias(hoy, 30);
    return '';
  }, [periodo, mesActual, hoy]);

  // Mapa rápido de id -> TanqueCombustible
  const tanqueById = useMemo(() => {
    const map = new Map<string, TanqueCombustible>();
    for (const t of tanques) map.set(t.id, t);
    return map;
  }, [tanques]);

  // Cargar movimientos para los tanques seleccionados que aún no estén en caché
  useEffect(() => {
    const faltantes = Array.from(selectedIds).filter((id) => !movsMap[id]);
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
  }, [selectedIds, movsMap]);

  // Toggle de tanque individual
  const toggleTanque = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const seleccionarTodos = useCallback(() => {
    setSelectedIds(new Set(reporte.map((r) => r.tanque.id)));
  }, [reporte]);

  const deseleccionarTodos = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const seleccionarSoloActivos = useCallback(() => {
    setSelectedIds(new Set(reporte.filter((r) => r.tanque.estado === 'activo').map((r) => r.tanque.id)));
  }, [reporte]);

  // Tanques seleccionados con sus datos de existencia actual
  const reportesSeleccionados = useMemo(() => {
    return reporte.filter((r) => selectedIds.has(r.tanque.id));
  }, [reporte, selectedIds]);

  // Totales acumulados de los tanques seleccionados
  const totales = useMemo(() => {
    const totalLitros = reportesSeleccionados.reduce((acc, r) => acc + (Number(r.disponible) || 0), 0);
    const totalValor = reportesSeleccionados.reduce(
      (acc, r) => acc + (Number(r.disponible) || 0) * (Number(r.tanque.tasa_usd_litro) || 0),
      0,
    );
    const tasaProm = totalLitros > 0 ? totalValor / totalLitros : 0;
    return {
      litros: totalLitros,
      valor: totalValor,
      tasaProm,
      count: reportesSeleccionados.length,
    };
  }, [reportesSeleccionados]);

  // Movimientos filtrados por cada tanque según periodo y tipo
  const detallePorTanque = useMemo(() => {
    return reportesSeleccionados.map((rep) => {
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
  }, [reportesSeleccionados, movsMap, fechaDesdeFiltro, tipoFiltro]);

  const emitido = useMemo(() => fechaHoraActualVE(), []);

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>
        Cerrar
      </button>
      <button
        className="btn btn-primary"
        onClick={() => window.print()}
        disabled={!reportesSeleccionados.length}
        title="Imprimir o exportar como PDF este reporte con tarjetas y movimientos"
      >
        🖨 Imprimir / PDF
      </button>
    </>
  );

  return (
    <Modal
      title="📄 Reporte de existencias y movimientos de combustible"
      size="xl"
      onClose={onClose}
      footer={footer}
    >
      <div className="reporte-print" style={{ color: 'var(--text)' }}>
        {/* Encabezado formal del reporte */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '.75rem' }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--primary)' }}>
            Golden Touch 1127 C.A. · Control de Combustible
          </div>
          <h2 style={{ margin: '.3rem 0 .2rem 0', fontSize: '1.45rem' }}>
            Reporte de Existencias y Movimientos
          </h2>
          <div className="muted" style={{ fontSize: '.82rem', textTransform: 'capitalize' }}>
            Emitido el {emitido}
          </div>
        </div>

        {/* ================= CONTROLES NO IMPRIMIBLES ================= */}
        <div
          className="no-print"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: '.9rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '.85rem',
          }}
        >
          {/* Selector de tanques */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.4rem' }}>
              <strong style={{ fontSize: '.88rem' }}>
                🛢 Seleccionar tanques a incluir ({selectedIds.size} de {reporte.length}):
              </strong>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-xs btn-ghost" onClick={seleccionarTodos}>
                  ✓ Todos
                </button>
                <button type="button" className="btn btn-xs btn-ghost" onClick={seleccionarSoloActivos}>
                  Solo activos
                </button>
                <button type="button" className="btn btn-xs btn-ghost" onClick={deseleccionarTodos}>
                  ✗ Ninguno
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', maxHeight: '130px', overflowY: 'auto', padding: '.25rem 0' }}>
              {reporte.map((r) => {
                const isSelected = selectedIds.has(r.tanque.id);
                return (
                  <button
                    key={r.tanque.id}
                    type="button"
                    onClick={() => toggleTanque(r.tanque.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.4rem',
                      padding: '.35rem .65rem',
                      borderRadius: 'var(--r-sm, 6px)',
                      fontSize: '.8rem',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-subtle, rgba(255, 138, 0, 0.12))' : 'var(--surface)',
                      color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <span>{isSelected ? '☑' : '☐'}</span>
                    <span>{esBidon(r.tanque.nombre) ? '🪣' : r.tanque.es_movil ? '🚚' : '🛢'}</span>
                    <span>{r.tanque.nombre}</span>
                    <span className="mono" style={{ fontSize: '.72rem', opacity: 0.85 }}>({num(r.disponible)} l)</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filtros de periodo y tipo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '.82rem', fontWeight: 600 }}>
                📅 Período de movimientos:
              </span>
              <div style={{ display: 'inline-flex', gap: '.3rem' }}>
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
                  Últimos 7 días
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${periodo === '15dias' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPeriodo('15dias')}
                >
                  Últimos 15 días
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${periodo === '30dias' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPeriodo('30dias')}
                >
                  Últimos 30 días
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${periodo === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPeriodo('todos')}
                >
                  Todo el historial
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '.82rem', fontWeight: 600 }}>
                ⚡ Mostrar:
              </span>
              <select
                className="input input-sm"
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)}
                style={{ minWidth: 170 }}
              >
                <option value="uso_traslado">⛽ Surtidos y ↔ Traslados</option>
                <option value="uso">Solo Surtidos (Uso)</option>
                <option value="traslado">Solo Traslados</option>
                <option value="todos">Todos los movimientos</option>
              </select>
            </div>
          </div>
        </div>

        {/* ================= ESTADO VACÍO ================= */}
        {!reportesSeleccionados.length ? (
          <EmptyState message="No has seleccionado ningún tanque. Marca al menos un tanque arriba para generar el reporte." />
        ) : (
          <>
            {/* ================= SECCIÓN 1: TARJETAS DE LO QUE QUEDA ================= */}
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.65rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary)' }}>
                  📊 Existencias Actuales ({reportesSeleccionados.length} {reportesSeleccionados.length === 1 ? 'tanque seleccionado' : 'tanques seleccionados'})
                </h3>
                <span className="muted" style={{ fontSize: '.78rem' }}>
                  Saldo vigente a la fecha en cada tanque
                </span>
              </div>

              {/* Tarjeta destacada resumen global */}
              <div
                className="card"
                style={{
                  margin: '0 0 1rem 0',
                  borderColor: 'var(--primary)',
                  borderWidth: 2,
                  background: 'linear-gradient(135deg, var(--surface-2), var(--surface))',
                  padding: '1rem',
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Total Disponible
                  </div>
                  <div className="mono" style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {num(totales.litros)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>ltrs</span>
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.25rem' }}>
                  <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Valor Total
                  </div>
                  <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
                    {money(totales.valor)}
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.25rem' }}>
                  <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Tasa Promedio
                  </div>
                  <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                    {money(totales.tasaProm)} / ltr
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1.25rem' }}>
                  <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Tanques Incluidos
                  </div>
                  <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                    {totales.count}
                  </div>
                </div>
              </div>

              {/* Grid de tarjetas individuales por tanque */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '.75rem',
                }}
              >
                {reportesSeleccionados.map((r) => {
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
                          <strong style={{ fontSize: '.92rem' }}>
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

                        {/* Barra de llenado */}
                        <div
                          style={{
                            height: 8,
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

                      {/* Métricas secundarias */}
                      <div className="muted" style={{ fontSize: '.73rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.35rem', marginTop: '.2rem' }}>
                        <span>Cap. <strong className="mono">{num(cap)}</strong> ltrs ({pct.toFixed(0)}%)</span>
                        <span>Tasa <strong className="mono">{money(tasa)}</strong></span>
                        <span style={{ color: 'var(--success)' }}>Valor <strong className="mono">{money(disp * tasa)}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ================= SECCIÓN 2: DETALLE POR TANQUE DE SURTIDOS Y TRASLADOS ================= */}
            <div style={{ marginTop: '2rem' }}>
              <div style={{ borderBottom: '2px solid var(--primary)', paddingBottom: '.4rem', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                  📋 Detalle de Movimientos por Tanque
                </h3>
                <div className="muted" style={{ fontSize: '.8rem', marginTop: '.2rem' }}>
                  {tipoFiltro === 'uso_traslado'
                    ? 'Surtidos a equipos y traslados entre tanques/minas'
                    : tipoFiltro === 'uso'
                      ? 'Despachos y consumo por equipo (surtidos)'
                      : tipoFiltro === 'traslado'
                        ? 'Traslados de combustible entre tanques o minas'
                        : 'Todos los movimientos registrados'}
                  {' · '}
                  <span style={{ textTransform: 'capitalize' }}>
                    {periodo === 'mes_actual'
                      ? 'Mes actual'
                      : periodo === '7dias'
                        ? 'Últimos 7 días'
                        : periodo === '15dias'
                          ? 'Últimos 15 días'
                          : periodo === '30dias'
                            ? 'Últimos 30 días'
                            : 'Historial completo'}
                  </span>
                </div>
              </div>

              {cargandoMovs && (
                <p className="muted" style={{ fontSize: '.85rem', fontStyle: 'italic' }}>
                  Cargando movimientos de los tanques seleccionados…
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
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
                          padding: '.75rem 1rem',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>
                            {esBidon(item.tanque.nombre) ? '🪣' : item.tanque.es_movil ? '🚚' : '🛢'}
                          </span>
                          <div>
                            <strong style={{ fontSize: '1rem' }}>{item.tanque.nombre}</strong>
                            <div className="muted" style={{ fontSize: '.75rem' }}>
                              Capacidad: {num(item.tanque.capacidad_litros)} ltrs · Saldo disponible actual: <strong className="mono" style={{ color: 'var(--primary)' }}>{num(item.disponible)} ltrs</strong>
                            </div>
                          </div>
                        </div>

                        {/* Chips de resumen del periodo */}
                        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', fontSize: '.8rem' }}>
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(255, 138, 0, 0.15)',
                              color: 'var(--primary)',
                              borderColor: 'var(--primary)',
                              padding: '.3rem .6rem',
                            }}
                            title="Total surtido a equipos en este periodo"
                          >
                            ⛽ Surtidos: <strong>{num(item.surtidosLitros)} ltrs</strong> ({item.surtidosCount})
                          </span>
                          <span
                            className="badge"
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#3b82f6',
                              borderColor: '#3b82f6',
                              padding: '.3rem .6rem',
                            }}
                            title="Total transferido a otras minas o tanques en este periodo"
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
                                padding: '.3rem .6rem',
                              }}
                            >
                              ⬇ Entradas: <strong>{num(item.entradasLitros)} ltrs</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Tabla de movimientos del tanque */}
                      {item.movimientos.length === 0 ? (
                        <div style={{ padding: '1.25rem', textAlign: 'center' }} className="muted">
                          Sin movimientos de {tipoFiltro === 'uso_traslado' ? 'surtido o traslado' : tipoFiltro} en este período.
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="table" style={{ width: '100%', fontSize: '.82rem', margin: 0 }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'left', width: '105px' }}>Fecha</th>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'left', width: '120px' }}>Tipo</th>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'left' }}>Equipo / Destino</th>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'right', width: '110px' }}>Litros</th>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'right', width: '110px' }}>Saldo Tank</th>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'left', width: '140px' }}>Autorizado / Chofer</th>
                                <th style={{ padding: '.55rem .75rem', textAlign: 'left' }}>Observaciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.movimientos.map((m) => {
                                const esSalida = m.tipo === 'uso' || m.tipo === 'traslado' || m.tipo === 'merma';
                                const tanqueDestino = m.tanque_destino_id ? tanqueById.get(m.tanque_destino_id) : null;

                                return (
                                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    {/* Fecha y hora */}
                                    <td style={{ padding: '.5rem .75rem', verticalAlign: 'top' }}>
                                      <div className="mono" style={{ fontWeight: 600 }}>{isoAVe(m.fecha)}</div>
                                      {m.hora && <div className="muted" style={{ fontSize: '.72rem' }}>{m.hora}</div>}
                                    </td>

                                    {/* Tipo */}
                                    <td style={{ padding: '.5rem .75rem', verticalAlign: 'top' }}>
                                      {m.tipo === 'uso' ? (
                                        <span className="badge" style={{ background: 'rgba(255, 138, 0, 0.15)', color: 'var(--primary)', borderColor: 'var(--primary)', fontSize: '.72rem' }}>
                                          ⛽ Surtido
                                        </span>
                                      ) : m.tipo === 'traslado' ? (
                                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', borderColor: '#3b82f6', fontSize: '.72rem' }}>
                                          ↔ Traslado
                                        </span>
                                      ) : m.tipo === 'entrada' ? (
                                        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', borderColor: 'var(--success)', fontSize: '.72rem' }}>
                                          ⬇ Entrada
                                        </span>
                                      ) : m.tipo === 'retorno' ? (
                                        <span className="badge" style={{ fontSize: '.72rem' }}>↩ Retorno</span>
                                      ) : (
                                        <span className="badge" style={{ fontSize: '.72rem', color: 'var(--danger)' }}>🔻 Merma</span>
                                      )}
                                    </td>

                                    {/* Equipo / Destino */}
                                    <td style={{ padding: '.5rem .75rem', verticalAlign: 'top' }}>
                                      {m.tipo === 'uso' ? (
                                        <div>
                                          <strong style={{ color: 'var(--text)' }}>{m.equipo || '—'}</strong>
                                          <div className="muted" style={{ fontSize: '.72rem', marginTop: '.1rem' }}>
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
                                            <div className="muted" style={{ fontSize: '.72rem' }}>Lugar: {m.ubicacion}</div>
                                          )}
                                        </div>
                                      ) : (
                                        <div>
                                          <span>{m.ubicacion || 'Recepción'}</span>
                                        </div>
                                      )}
                                    </td>

                                    {/* Litros */}
                                    <td style={{ padding: '.5rem .75rem', textAlign: 'right', verticalAlign: 'top' }}>
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

                                    {/* Saldo corrido */}
                                    <td style={{ padding: '.5rem .75rem', textAlign: 'right', verticalAlign: 'top' }}>
                                      <span className="mono muted" style={{ fontWeight: 600 }}>
                                        {m.saldo_litros != null ? `${num(m.saldo_litros)} l` : '—'}
                                      </span>
                                    </td>

                                    {/* Despachador / Autorizado */}
                                    <td style={{ padding: '.5rem .75rem', verticalAlign: 'top' }}>
                                      <div>{m.autorizado_por || m.actor_name || m.created_by || '—'}</div>
                                    </td>

                                    {/* Observaciones */}
                                    <td style={{ padding: '.5rem .75rem', verticalAlign: 'top', color: 'var(--text-muted)' }}>
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
          </>
        )}

        {/* Pie de página del reporte */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', textAlign: 'center', fontSize: '.75rem' }} className="muted">
          <div>Golden Touch 1127 C.A. · Sistema de Gestión de Combustible · Reporte generado automáticamente</div>
          <div style={{ marginTop: '.2rem' }}>Valores calculados en base a la tasa de costo promedio ponderado ($/ltr) de cada tanque.</div>
        </div>
      </div>
    </Modal>
  );
}
