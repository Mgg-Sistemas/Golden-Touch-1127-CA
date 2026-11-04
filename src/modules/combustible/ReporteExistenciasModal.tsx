import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { money, num } from '@/shared/lib/format';
import { isoAVe } from '@/shared/lib/fechaVE';
import { esBidon } from './bidonCombustible';
import { listMovimientosTanque, type ReporteTanque } from './tanques.repository';
import type { MovimientoTanque, TanqueCombustible } from '@/shared/lib/types';
import { descargarReporteExistenciasPdf } from './reporteExistenciasPdf';
import { descargarReporteExistenciasExcel } from './reporteExistenciasExcel';
import {
  calcularCorteTanque,
  calcularTotalesCierre,
  hoyIsoVE,
  nombreMesEs,
  obtenerPresetRango,
  type PresetPeriodoCombustible,
  type SaldoCorteTanque,
} from './reporteExistenciasCorte';

interface Props {
  tanques: TanqueCombustible[];
  reporte: ReporteTanque[];
  onClose: () => void;
}

type TipoFiltro = 'uso_traslado' | 'uso' | 'traslado' | 'todos';

function fechaHoraActualVE(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
}

export function ReporteExistenciasModal({ tanques, reporte, onClose }: Props) {
  // 1. Selección de qué tanques incluir en el reporte (por defecto todos)
  const [tanquesSeleccionados, setTanquesSeleccionados] = useState<Set<string>>(
    () => new Set(reporte.map((r) => r.tanque.id)),
  );

  // Sincronizar si cambian los tanques de la prop
  useEffect(() => {
    setTanquesSeleccionados((prev) => {
      const next = new Set<string>();
      for (const r of reporte) {
        if (prev.size === 0 || prev.has(r.tanque.id)) {
          next.add(r.tanque.id);
        }
      }
      return next.size > 0 ? next : new Set(reporte.map((r) => r.tanque.id));
    });
  }, [reporte]);

  const toggleTanque = (id: string) => {
    setTanquesSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const seleccionarTodos = () => {
    setTanquesSeleccionados(new Set(reporte.map((r) => r.tanque.id)));
  };

  const seleccionarSoloConStock = () => {
    const conStock = reporte
      .filter((r) => {
        const corte = cortesPorTanque.get(r.tanque.id);
        const ltrs = corte ? corte.saldoCierreLitros : Number(r.disponible) || 0;
        return ltrs > 0;
      })
      .map((r) => r.tanque.id);
    setTanquesSeleccionados(new Set(conStock));
  };

  const seleccionarNinguno = () => {
    setTanquesSeleccionados(new Set());
  };

  // 2. Filtros de periodo y rango de fechas (Desde / Hasta)
  const hoy = useMemo(() => hoyIsoVE(), []);
  const [periodo, setPeriodo] = useState<PresetPeriodoCombustible>('mes_actual');
  const [fechaDesde, setFechaDesde] = useState<string>(() => obtenerPresetRango('mes_actual').desde);
  const [fechaHasta, setFechaHasta] = useState<string>(() => obtenerPresetRango('mes_actual').hasta);

  // 3. Vista de presentación: Fichas vs Tabla Comparativa
  const [formatoVista, setFormatoVista] = useState<'tarjetas' | 'tabla'>('tarjetas');

  // 4. Tipo de movimiento en detalle
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('uso_traslado');

  // 5. Cache de movimientos por tanque
  const [movsMap, setMovsMap] = useState<Record<string, MovimientoTanque[]>>({});
  const [cargandoMovs, setCargandoMovs] = useState<boolean>(false);
  const [generandoPdf, setGenerandoPdf] = useState<boolean>(false);
  const [generandoExcel, setGenerandoExcel] = useState<boolean>(false);

  // Aplicar un preset de fechas rápido
  const aplicarPreset = (p: PresetPeriodoCombustible) => {
    setPeriodo(p);
    const r = obtenerPresetRango(p, hoy);
    setFechaDesde(r.desde);
    setFechaHasta(r.hasta);
  };

  const cambiarFechaDesde = (val: string) => {
    setFechaDesde(val);
    setPeriodo('personalizado');
  };

  const cambiarFechaHasta = (val: string) => {
    setFechaHasta(val);
    setPeriodo('personalizado');
  };

  // Etiqueta legible del periodo activo
  const periodoLabel = useMemo(() => {
    if (periodo === 'mes_actual') return `Mes actual (${nombreMesEs(Number(hoy.slice(5, 7)))})`;
    if (periodo === 'mes_anterior') return obtenerPresetRango('mes_anterior', hoy).label;
    if (periodo === '7dias') return 'Últimos 7 días';
    if (periodo === '15dias') return 'Últimos 15 días';
    if (periodo === '30dias') return 'Últimos 30 días';
    if (periodo === 'este_ano') return `Año ${hoy.slice(0, 4)}`;
    if (periodo === 'todos') return 'Historial completo';
    if (fechaDesde && fechaHasta) return `Del ${isoAVe(fechaDesde)} al ${isoAVe(fechaHasta)}`;
    if (fechaHasta) return `Corte al ${isoAVe(fechaHasta)}`;
    if (fechaDesde) return `Desde el ${isoAVe(fechaDesde)}`;
    return 'Periodo seleccionado';
  }, [periodo, fechaDesde, fechaHasta, hoy]);

  // Mapa rápido de id -> TanqueCombustible
  const tanqueById = useMemo(() => {
    const map = new Map<string, TanqueCombustible>();
    for (const t of tanques) map.set(t.id, t);
    return map;
  }, [tanques]);

  // Cargar movimientos para los tanques
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

  // Cálculo de corte (apertura, flujo en periodo, cierre y valoración) para cada tanque
  const cortesPorTanque = useMemo(() => {
    const map = new Map<string, SaldoCorteTanque>();
    for (const r of reporte) {
      const t = r.tanque;
      const movs = movsMap[t.id] ?? [];
      const corte = calcularCorteTanque(t, movs, fechaDesde || null, fechaHasta || null, hoy);
      // Fallback si aún no hay movimientos cargados y estamos en tiempo real sin fecha límite
      if (movs.length === 0 && !fechaDesde && !fechaHasta && r.disponible != null) {
        corte.saldoCierreLitros = Number(r.disponible) || 0;
        corte.saldoCierreUsd = corte.saldoCierreLitros * (Number(t.tasa_usd_litro) || 0);
      }
      map.set(t.id, corte);
    }
    return map;
  }, [reporte, movsMap, fechaDesde, fechaHasta, hoy]);

  // Subconjunto de cortes solo con los tanques seleccionados por casillas (checks)
  const cortesSeleccionados = useMemo(() => {
    return reporte
      .filter((r) => tanquesSeleccionados.has(r.tanque.id))
      .map((r) => cortesPorTanque.get(r.tanque.id)!)
      .filter(Boolean);
  }, [reporte, tanquesSeleccionados, cortesPorTanque]);

  // Totales acumulados calculados dinámicamente sobre los tanques seleccionados y el corte de fecha
  const totales = useMemo(() => {
    return calcularTotalesCierre(cortesSeleccionados, reporte.length, fechaHasta || null, hoy);
  }, [cortesSeleccionados, reporte.length, fechaHasta, hoy]);

  // Movimientos filtrados por cada tanque según periodo y tipo (solo tanques seleccionados)
  const detallePorTanque = useMemo(() => {
    return cortesSeleccionados.map((corte) => {
      const todosMovs = corte.movimientos;
      const filtrados = todosMovs.filter((m) => {
        if (tipoFiltro === 'uso_traslado') {
          return m.tipo === 'uso' || m.tipo === 'traslado';
        }
        if (tipoFiltro === 'uso') return m.tipo === 'uso';
        if (tipoFiltro === 'traslado') return m.tipo === 'traslado';
        return true;
      });

      return {
        tanque: corte.tanque,
        disponible: corte.saldoCierreLitros,
        movimientos: filtrados,
        surtidosLitros: corte.surtidosLitros,
        surtidosCount: corte.surtidosCount,
        trasladosLitros: corte.trasladosLitros,
        trasladosCount: corte.trasladosCount,
        entradasLitros: corte.entradasLitros,
        saldoInicialLitros: corte.saldoInicialLitros,
        saldoCierreLitros: corte.saldoCierreLitros,
        saldoCierreUsd: corte.saldoCierreUsd,
        tasaCierre: corte.tasaCierre,
        porcentajeLleno: corte.porcentajeLleno,
      };
    });
  }, [cortesSeleccionados, tipoFiltro]);

  const emitido = useMemo(() => fechaHoraActualVE(), []);

  // Exportar a PDF (solo tanques seleccionados)
  async function handleExportPdf() {
    if (!cortesSeleccionados.length) return;
    setGenerandoPdf(true);
    try {
      await descargarReporteExistenciasPdf({
        reportes: cortesSeleccionados.map((c) => ({
          tanque: c.tanque,
          disponible: c.saldoCierreLitros,
          entradas: c.entradasLitros,
          uso: c.surtidosLitros,
          traslados: c.trasladosLitros,
        })),
        detallePorTanque,
        periodoLabel,
        totalesCorte: totales,
      });
    } finally {
      setGenerandoPdf(false);
    }
  }

  // Exportar a Excel (solo tanques seleccionados)
  async function handleExportExcel() {
    if (!cortesSeleccionados.length) return;
    setGenerandoExcel(true);
    try {
      await descargarReporteExistenciasExcel({
        reportes: cortesSeleccionados.map((c) => ({
          tanque: c.tanque,
          disponible: c.saldoCierreLitros,
          entradas: c.entradasLitros,
          uso: c.surtidosLitros,
          traslados: c.trasladosLitros,
        })),
        detallePorTanque,
        periodoLabel,
        totalesCorte: totales,
      });
    } finally {
      setGenerandoExcel(false);
    }
  }

  const ningunTanqueSeleccionado = tanquesSeleccionados.size === 0;

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '.5rem' }}>
      <button className="btn btn-ghost" onClick={onClose}>
        Cerrar
      </button>

      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
        <button
          className="btn btn-ghost"
          onClick={handleExportExcel}
          disabled={generandoExcel || cargandoMovs || ningunTanqueSeleccionado}
          title={ningunTanqueSeleccionado ? 'Selecciona al menos un tanque' : 'Generar y previsualizar reporte en Excel (.xlsx)'}
        >
          {generandoExcel ? 'Generando Excel…' : '📊 Descargar Excel'}
        </button>

        <button
          className="btn btn-ghost"
          onClick={handleExportPdf}
          disabled={generandoPdf || cargandoMovs || ningunTanqueSeleccionado}
          title={ningunTanqueSeleccionado ? 'Selecciona al menos un tanque' : 'Generar y previsualizar reporte en PDF con membrete'}
        >
          {generandoPdf ? 'Generando PDF…' : '📄 Descargar PDF'}
        </button>

        <button
          className="btn btn-primary"
          onClick={() => window.print()}
          disabled={ningunTanqueSeleccionado}
          title="Imprimir reporte de tanques seleccionados"
        >
          🖨 Imprimir
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      title="📄 Reporte Dinámico de Existencias y Movimientos de Combustible"
      size="xl"
      onClose={onClose}
      footer={footer}
    >
      <div style={{ color: 'var(--text)' }}>
        {/* 1. SECCIÓN: Barra de Herramientas Superior (Rango de Fechas + Tipo de Movimiento + Vista) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '.65rem',
            padding: '.75rem 1rem',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
            marginBottom: '.75rem',
          }}
        >
          {/* Fila 1: Presets rápidos de Periodo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '.8rem', fontWeight: 600 }}>
                📅 Rango de Fechas:
              </span>
              <button
                type="button"
                className={`btn btn-xs ${periodo === 'mes_actual' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('mes_actual')}
              >
                Mes actual ({nombreMesEs(Number(hoy.slice(5, 7)))})
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === 'mes_anterior' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('mes_anterior')}
                title="Cierre histórico del mes anterior (Octubre)"
              >
                Mes anterior (Octubre)
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === '7dias' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('7dias')}
              >
                7 días
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === '15dias' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('15dias')}
              >
                15 días
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === '30dias' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('30dias')}
              >
                30 días
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === 'este_ano' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('este_ano')}
              >
                Año {hoy.slice(0, 4)}
              </button>
              <button
                type="button"
                className={`btn btn-xs ${periodo === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => aplicarPreset('todos')}
              >
                Historial completo
              </button>
            </div>

            {/* Alternador de Vista: Tarjetas vs Tabla */}
            <div style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: '.76rem', fontWeight: 600 }}>Vista:</span>
              <button
                type="button"
                className={`btn btn-xs ${formatoVista === 'tarjetas' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFormatoVista('tarjetas')}
                style={{ borderRadius: '999px', padding: '.2rem .6rem' }}
              >
                🏢 Fichas
              </button>
              <button
                type="button"
                className={`btn btn-xs ${formatoVista === 'tabla' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFormatoVista('tabla')}
                style={{ borderRadius: '999px', padding: '.2rem .6rem' }}
              >
                📊 Tabla
              </button>
            </div>
          </div>

          {/* Fila 2: Selectores de fecha Desde - Hasta e Input de Tipo de Movimiento */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem', borderTop: '1px solid var(--border)', paddingTop: '.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.78rem' }}>
                <span className="muted">Desde:</span>
                <input
                  type="date"
                  className="input input-xs"
                  value={fechaDesde}
                  onChange={(e) => cambiarFechaDesde(e.target.value)}
                  style={{ width: '135px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.78rem' }}>
                <span className="muted">Hasta:</span>
                <input
                  type="date"
                  className="input input-xs"
                  value={fechaHasta}
                  onChange={(e) => cambiarFechaHasta(e.target.value)}
                  style={{ width: '135px' }}
                />
              </div>

              {totales.esHistorico && (
                <span
                  className="badge"
                  style={{
                    background: 'rgba(255, 138, 0, 0.15)',
                    color: 'var(--primary)',
                    borderColor: 'var(--primary)',
                    fontSize: '.72rem',
                    fontWeight: 700,
                  }}
                >
                  📅 Corte histórico: {isoAVe(fechaHasta)}
                </span>
              )}
            </div>

            {/* Filtro de tipo de movimiento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span className="muted" style={{ fontSize: '.78rem', fontWeight: 600 }}>
                Filtrar detalle:
              </span>
              <select
                className="input input-xs"
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as TipoFiltro)}
                style={{ minWidth: 175, fontSize: '.78rem' }}
              >
                <option value="uso_traslado">⛽ Surtidos y ↔ Traslados</option>
                <option value="uso">Solo Surtidos (Equipos)</option>
                <option value="traslado">Solo Traslados</option>
                <option value="todos">Todos los movimientos</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. SECCIÓN: Barra Selectora de Tanques a Incluir (Checks interactivos) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '.6rem',
            background: 'var(--surface-hover, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: '.55rem .9rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text)' }}>
              🛢️ Tanques a incluir ({tanquesSeleccionados.size} de {reporte.length}):
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={seleccionarTodos}
              style={{ fontSize: '.75rem', padding: '.2rem .55rem' }}
            >
              ✓ Todos
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={seleccionarSoloConStock}
              style={{ fontSize: '.75rem', padding: '.2rem .55rem' }}
            >
              Solo con combustible ({reporte.filter((r) => {
                const c = cortesPorTanque.get(r.tanque.id);
                return (c ? c.saldoCierreLitros : Number(r.disponible) || 0) > 0;
              }).length})
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={seleccionarNinguno}
              style={{ fontSize: '.75rem', padding: '.2rem .55rem' }}
            >
              ✕ Desmarcar todos
            </button>
          </div>
          <div className="muted" style={{ fontSize: '.74rem' }}>
            💡 Haz clic en cualquier tarjeta o fila de tanque para incluirlo o excluirlo del reporte
          </div>
        </div>

        {/* 3. SECCIÓN: Encabezado del Documento */}
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
          {totales.esHistorico && (
            <div style={{ fontSize: '.76rem', color: 'var(--primary)', marginTop: '.25rem', fontWeight: 600 }}>
              📌 Existencias históricas determinadas al cierre del {isoAVe(fechaHasta)}
            </div>
          )}
        </div>

        {/* 4. SECCIÓN: Tarjetas Resumen Dinámicas en la Cabecera (Hero Banner de KPIs) */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div
            className="card"
            style={{
              margin: '0 0 1rem 0',
              borderColor: 'var(--primary)',
              borderWidth: 2,
              background: 'linear-gradient(135deg, var(--surface-2), var(--surface))',
              padding: '1.1rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* KPI 1: Existencia al Cierre */}
            <div style={{ textAlign: 'center', padding: '.4rem .5rem', borderTop: '3px solid var(--primary)', borderRadius: '4px' }}>
              <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                {totales.esHistorico ? 'Existencia al Cierre' : 'Total Disponible en Tanques'}
              </div>
              <div className="mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--primary)', marginTop: '.15rem' }}>
                {num(totales.totalLitrosCierre)} <span style={{ fontSize: '.82rem', fontWeight: 500 }} className="muted">ltrs</span>
              </div>
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.2rem' }}>
                {totales.esHistorico ? `Cierre al ${isoAVe(fechaHasta)}` : 'Saldo actual disponible'}
                {totales.totalLitrosApertura > 0 && ` · Apertura: ${num(totales.totalLitrosApertura)} L`}
              </div>
            </div>

            {/* KPI 2: Valor Monetario al Cierre */}
            <div style={{ textAlign: 'center', padding: '.4rem .5rem', borderTop: '3px solid #22c55e', borderRadius: '4px' }}>
              <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                {totales.esHistorico ? 'Valor Total al Cierre' : 'Valor Total Disponible'}
              </div>
              <div className="mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--success)', marginTop: '.15rem' }}>
                {money(totales.totalValorCierre)}
              </div>
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.2rem' }}>
                Tasa ponderada: <strong>{money(totales.tasaPromedioCierre)}</strong> / ltr
              </div>
            </div>

            {/* KPI 3: Consumo / Surtidos en el Periodo */}
            <div style={{ textAlign: 'center', padding: '.4rem .5rem', borderTop: '3px solid #f59e0b', borderRadius: '4px' }}>
              <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                Consumo en el Periodo
              </div>
              <div className="mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f59e0b', marginTop: '.15rem' }}>
                {num(totales.totalSurtidosLitros)} <span style={{ fontSize: '.82rem', fontWeight: 500 }} className="muted">ltrs</span>
              </div>
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.2rem' }}>
                {money(totales.totalSurtidosUsd)} · {totales.totalSurtidosCount} surtidos a equipos
              </div>
            </div>

            {/* KPI 4: Movilización / Traslados y Tanques */}
            <div style={{ textAlign: 'center', padding: '.4rem .5rem', borderTop: '3px solid #3b82f6', borderRadius: '4px' }}>
              <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                Traslados y Nómina Tanques
              </div>
              <div className="mono" style={{ fontSize: '1.85rem', fontWeight: 800, color: '#3b82f6', marginTop: '.15rem' }}>
                {num(totales.totalTrasladosLitros)} <span style={{ fontSize: '.82rem', fontWeight: 500 }} className="muted">ltrs</span>
              </div>
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.2rem' }}>
                Entradas: +{num(totales.totalEntradasLitros)} L · {totales.tanquesSeleccionadosCount} de {totales.totalTanquesCatalogo} tanques
              </div>
            </div>
          </div>

          {/* 5. SECCIÓN: Vista de Fichas Ejecutivas vs Vista de Tabla Tabular */}
          {formatoVista === 'tarjetas' ? (
            /* ================= VISTA DE TARJETAS ================= */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                gap: '.75rem',
              }}
            >
              {reporte.map((r) => {
                const corte = cortesPorTanque.get(r.tanque.id);
                const cap = Number(r.tanque.capacidad_litros) || 0;
                const disp = corte ? corte.saldoCierreLitros : Number(r.disponible) || 0;
                const valorUsd = corte ? corte.saldoCierreUsd : disp * (Number(r.tanque.tasa_usd_litro) || 0);
                const tasa = corte ? corte.tasaCierre : Number(r.tanque.tasa_usd_litro) || 0;
                const pct = corte ? corte.porcentajeLleno : cap > 0 ? (disp / cap) * 100 : 0;
                const colorBarra = pct < 12 ? 'var(--danger)' : pct < 30 ? 'var(--warning)' : 'var(--primary)';
                const seleccionado = tanquesSeleccionados.has(r.tanque.id);

                return (
                  <div
                    key={r.tanque.id}
                    onClick={() => toggleTanque(r.tanque.id)}
                    className={`card ${!seleccionado ? 'no-print' : ''}`}
                    style={{
                      margin: 0,
                      padding: '.85rem',
                      border: seleccionado ? '2px solid var(--primary)' : '1px dashed var(--border)',
                      background: seleccionado ? 'var(--surface)' : 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      pageBreakInside: 'avoid',
                      opacity: seleccionado ? 1 : 0.45,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      userSelect: 'none',
                      boxShadow: seleccionado ? '0 0 0 1px rgba(255, 138, 0, 0.2)' : 'none',
                    }}
                    title={seleccionado ? 'Clic para excluir del reporte' : 'Clic para incluir en el reporte'}
                  >
                    {/* Badge superior derecho de estado en reporte */}
                    <div style={{ position: 'absolute', top: '.5rem', right: '.5rem' }} className="no-print">
                      {seleccionado ? (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: 'var(--success)',
                            borderColor: 'var(--success)',
                            fontSize: '.68rem',
                            fontWeight: 700,
                            padding: '.15rem .45rem',
                          }}
                        >
                          ✓ Incluido
                        </span>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-muted)',
                            borderColor: 'var(--border)',
                            fontSize: '.68rem',
                            padding: '.15rem .45rem',
                          }}
                        >
                          ✕ Excluido
                        </span>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.4rem', marginBottom: '.35rem', paddingRight: '4.5rem' }}>
                        <strong style={{ fontSize: '.9rem', color: seleccionado ? 'var(--text)' : 'var(--text-muted)' }}>
                          {esBidon(r.tanque.nombre) ? '🪣' : r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}
                        </strong>
                      </div>

                      <div style={{ display: 'inline-flex', gap: '.25rem', marginBottom: '.35rem' }}>
                        {esBidon(r.tanque.nombre) && <span className="badge" style={{ fontSize: '.68rem' }}>bidón</span>}
                        {r.tanque.es_movil && !esBidon(r.tanque.nombre) && <span className="badge" style={{ fontSize: '.68rem' }}>móvil</span>}
                        {r.tanque.estado !== 'activo' && <span className="badge" style={{ fontSize: '.68rem' }}>inactivo</span>}
                      </div>

                      {/* Litros al corte / cierre */}
                      <div className="mono" style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text)' }}>
                        {num(disp)} <span style={{ fontSize: '.78rem', fontWeight: 500 }} className="muted">ltrs</span>
                      </div>

                      <div style={{ fontSize: '.72rem', color: totales.esHistorico ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '.3rem', fontWeight: 600 }}>
                        {totales.esHistorico ? `Cierre al ${isoAVe(fechaHasta)}` : 'Saldo actual disponible'}
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
                    <div>
                      <div className="muted" style={{ fontSize: '.74rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.35rem', marginTop: '.2rem' }}>
                        <span>Cap. <strong className="mono">{num(cap)}</strong> l ({pct.toFixed(0)}%)</span>
                        <span>Tasa <strong className="mono">{money(tasa)}</strong></span>
                        <span style={{ color: 'var(--success)' }}>Valor <strong className="mono">{money(valorUsd)}</strong></span>
                      </div>

                      {/* Chips con el flujo en el periodo */}
                      {corte && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem', marginTop: '.45rem', borderTop: '1px solid var(--border)', paddingTop: '.4rem', fontSize: '.68rem' }}>
                          <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8' }}>
                            Apertura: {num(corte.saldoInicialLitros)} L
                          </span>
                          {corte.surtidosLitros > 0 && (
                            <span className="badge" style={{ background: 'rgba(255, 138, 0, 0.12)', color: 'var(--primary)' }}>
                              ⛽ Surtidos: -{num(corte.surtidosLitros)} L
                            </span>
                          )}
                          {corte.trasladosLitros > 0 && (
                            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                              ↔ Traslados: -{num(corte.trasladosLitros)} L
                            </span>
                          )}
                          {corte.entradasLitros > 0 && (
                            <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--success)' }}>
                              ⬇ Entradas: +{num(corte.entradasLitros)} L
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ================= VISTA DE TABLA TABULAR ================= */
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}>
              <table className="table" style={{ width: '100%', fontSize: '.8rem', margin: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '2px solid var(--primary)' }}>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'center', width: '40px' }}>Inc.</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'left' }}>Tanque</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'left', width: '90px' }}>Tipo</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '100px' }}>Apertura (L)</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '95px', color: 'var(--success)' }}>Entradas (+)</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '95px', color: 'var(--primary)' }}>Surtidos (-)</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '95px', color: '#3b82f6' }}>Traslados (-)</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '115px', background: 'rgba(255, 138, 0, 0.08)' }}>
                      {totales.esHistorico ? `Cierre (${isoAVe(fechaHasta)})` : 'Saldo Actual (L)'}
                    </th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'center', width: '80px' }}>% Cap.</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '85px' }}>Tasa ($/L)</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'right', width: '110px', color: 'var(--success)' }}>Valor ($ USD)</th>
                    <th style={{ padding: '.55rem .7rem', textAlign: 'center', width: '75px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.map((r, idx) => {
                    const corte = cortesPorTanque.get(r.tanque.id);
                    const cap = Number(r.tanque.capacidad_litros) || 0;
                    const disp = corte ? corte.saldoCierreLitros : Number(r.disponible) || 0;
                    const valorUsd = corte ? corte.saldoCierreUsd : disp * (Number(r.tanque.tasa_usd_litro) || 0);
                    const tasa = corte ? corte.tasaCierre : Number(r.tanque.tasa_usd_litro) || 0;
                    const pct = corte ? corte.porcentajeLleno : cap > 0 ? (disp / cap) * 100 : 0;
                    const seleccionado = tanquesSeleccionados.has(r.tanque.id);

                    return (
                      <tr
                        key={r.tanque.id}
                        onClick={() => toggleTanque(r.tanque.id)}
                        style={{
                          background: idx % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                          opacity: seleccionado ? 1 : 0.45,
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <td style={{ textAlign: 'center', padding: '.45rem' }}>
                          <input
                            type="checkbox"
                            checked={seleccionado}
                            readOnly
                            style={{ margin: 0, pointerEvents: 'none', accentColor: 'var(--primary)' }}
                          />
                        </td>
                        <td style={{ padding: '.45rem .7rem', fontWeight: 600 }}>
                          {esBidon(r.tanque.nombre) ? '🪣' : r.tanque.es_movil ? '🚚' : '🛢'} {r.tanque.nombre}
                        </td>
                        <td style={{ padding: '.45rem .7rem' }}>
                          <span className="badge" style={{ fontSize: '.68rem' }}>
                            {esBidon(r.tanque.nombre) ? 'Bidón' : r.tanque.es_movil ? 'Móvil' : 'Estacionario'}
                          </span>
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right' }}>
                          {num(corte?.saldoInicialLitros || 0)}
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right', color: 'var(--success)' }}>
                          {corte && corte.entradasLitros > 0 ? `+${num(corte.entradasLitros)}` : '—'}
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right', color: 'var(--primary)' }}>
                          {corte && corte.surtidosLitros > 0 ? `-${num(corte.surtidosLitros)}` : '—'}
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right', color: '#3b82f6' }}>
                          {corte && corte.trasladosLitros > 0 ? `-${num(corte.trasladosLitros)}` : '—'}
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right', fontWeight: 700, color: 'var(--text)', background: 'rgba(255, 138, 0, 0.06)' }}>
                          {num(disp)} L
                        </td>
                        <td style={{ padding: '.45rem .7rem', textAlign: 'center', fontWeight: 600 }}>
                          {pct.toFixed(0)}%
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right' }}>
                          {money(tasa)}
                        </td>
                        <td className="mono" style={{ padding: '.45rem .7rem', textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>
                          {money(valorUsd)}
                        </td>
                        <td style={{ padding: '.45rem .7rem', textAlign: 'center' }}>
                          <span className="badge" style={{ fontSize: '.68rem' }}>
                            {r.tanque.estado === 'activo' ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--primary)', fontWeight: 800 }}>
                    <td colSpan={3} style={{ padding: '.6rem .7rem' }}>
                      TOTAL CONSOLIDADO ({totales.tanquesSeleccionadosCount} tanques)
                    </td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right' }}>
                      {num(totales.totalLitrosApertura)}
                    </td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right', color: 'var(--success)' }}>
                      +{num(totales.totalEntradasLitros)}
                    </td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right', color: 'var(--primary)' }}>
                      -{num(totales.totalSurtidosLitros)}
                    </td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right', color: '#3b82f6' }}>
                      -{num(totales.totalTrasladosLitros)}
                    </td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right', color: 'var(--primary)', fontSize: '.9rem', background: 'rgba(255, 138, 0, 0.12)' }}>
                      {num(totales.totalLitrosCierre)} L
                    </td>
                    <td style={{ padding: '.6rem .7rem', textAlign: 'center' }}>—</td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right' }}>
                      {money(totales.tasaPromedioCierre)}
                    </td>
                    <td className="mono" style={{ padding: '.6rem .7rem', textAlign: 'right', color: 'var(--success)', fontSize: '.9rem' }}>
                      {money(totales.totalValorCierre)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* 6. SECCIÓN: Detalle de Movimientos por Tanque en el Periodo */}
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
              {' · '}
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                {cortesSeleccionados.length} tanque(s) en reporte
              </span>
            </div>
          </div>

          {cargandoMovs && (
            <p className="muted" style={{ fontSize: '.85rem', fontStyle: 'italic', margin: '1rem 0' }}>
              Cargando movimientos…
            </p>
          )}

          {ningunTanqueSeleccionado ? (
            <div
              className="card"
              style={{
                padding: '2rem',
                textAlign: 'center',
                borderColor: 'var(--warning)',
                background: 'rgba(255, 138, 0, 0.05)',
                margin: '1.5rem 0',
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>⚠️</div>
              <strong style={{ fontSize: '1rem' }}>No hay tanques seleccionados</strong>
              <p className="muted" style={{ fontSize: '.85rem', margin: '.5rem 0 1rem 0' }}>
                Haz clic en las tarjetas de arriba o pulsa el botón «✓ Todos» para incluir tanques en el reporte.
              </p>
              <button type="button" className="btn btn-primary btn-sm" onClick={seleccionarTodos}>
                ✓ Seleccionar todos los tanques
              </button>
            </div>
          ) : (
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
                            Capacidad: {num(item.tanque.capacidad_litros)} ltrs · Saldo al corte: <strong className="mono" style={{ color: 'var(--primary)' }}>{num(item.disponible)} ltrs</strong>
                            {totales.esHistorico && ` (Cierre al ${isoAVe(fechaHasta)})`}
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
          )}
        </div>

        {/* Pie de página institucional */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', textAlign: 'center', fontSize: '.75rem' }} className="muted">
          <div>Golden Touch 1127 C.A. · Sistema de Gestión de Combustible</div>
          <div style={{ marginTop: '.2rem' }}>
            Valores y saldos de combustible calculados al corte del periodo ({periodoLabel}) con su tasa ponderada correspondiente.
          </div>
        </div>
      </div>
    </Modal>
  );
}
