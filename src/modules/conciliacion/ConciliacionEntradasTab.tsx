/* ============================================================
   Conciliación · Submódulo de Conciliación por Entradas de Retención
   (Entradas - Reintegros de Retenciones y Descuentos).

   Diseño homologado con Mineral Group Guayana (MGG):
   - 12 columnas estándar:
     #, CÓDIGO OC, PROVEEDOR, FACTURA, TIPOS RETENCIÓN, MONTO RETENIDO,
     DÍA REINTEGRO, REF. ENTRADA, MONTO REINTEGRADO, SOPORTE,
     DRIVE/BANCO, ACCIÓN (✏️ Registrar).
   - Selector por página (15, 25, 50) y paginador estándar.
   - Modal interactivo «✏️ Registrar» para registrar o editar el
     día de reintegro, referencia bancaria de entrada y monto.
   ============================================================ */

import { useMemo, useState } from 'react';
import type { FilaConciliacion } from './conciliacion';
import {
  indicadoresEntradas,
  type FilaConciliacionEntrada,
  type IndicadoresEntradas,
} from './conciliacionEntradas';
import { bs, usd, fechaCorta } from './reporteConciliacion';
import { FiltroChecks } from '@/shared/ui/FiltroChecks';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';

interface Props {
  filasSalidas: FilaConciliacion[];
  entradas: FilaConciliacionEntrada[];
  cargando: boolean;
  onActualizar: () => Promise<void>;
  onAbrirEnCompras?: (ordenId: string) => void;
}

const TAMANOS_PAGINA = [15, 25, 50] as const;

export function ConciliacionEntradasTab({
  filasSalidas,
  entradas,
  cargando,
  onActualizar,
  onAbrirEnCompras,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'reintegrado' | 'esperando_reintegro'>('todas');
  const [filtroRetencion, setFiltroRetencion] = useState<string>('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Paginación (15 por página por defecto, idéntico a MGG)
  const [tamPagina, setTamPagina] = useState<number>(15);
  const [paginaActual, setPaginaActual] = useState<number>(1);

  // Modal «✏️ Registrar» para anotar o editar reintegro
  const [modalRegistro, setModalRegistro] = useState<FilaConciliacionEntrada | null>(null);
  const [regFecha, setRegFecha] = useState('');
  const [regRef, setRegRef] = useState('');
  const [regMontoBs, setRegMontoBs] = useState('');
  const [regBanco, setRegBanco] = useState('');

  // Combinar órdenes con retención de Salidas + entradas extraídas/registradas
  const filasTotales = useMemo(() => {
    const mapaPorOc = new Map<string, FilaConciliacionEntrada>();

    // 1. Agregar las entradas reales registradas o extraídas del Drive/Banco
    for (const e of entradas) {
      const clave = e.ordenId ? `id:${e.ordenId}` : e.codigoOc ? `oc:${e.codigoOc.toUpperCase().replace(/\s+/g, '')}` : e.id;
      mapaPorOc.set(clave, e);
    }

    // 2. Si hay órdenes con retención en Compras que aún no tienen reintegro registrado, agregarlas como pendientes
    for (const s of filasSalidas) {
      if (!s.llevaRetencion && (!s.retenciones || !s.retenciones.length)) continue;
      const claveId = `id:${s.ordenId}`;
      const claveOc = `oc:${s.codigo.toUpperCase().replace(/\s+/g, '')}`;
      if (mapaPorOc.has(claveId) || mapaPorOc.has(claveOc)) continue;

      const tipoRet = s.retenciones.length
        ? Array.from(new Set(s.retenciones.map((r) => r.tipo))).join(' + ')
        : 'Retención';
      const montoRetenidoBs = s.totalBs != null ? s.totalBs : 0;
      const montoRetenidoUsd = s.totalUsd != null ? s.totalUsd : 0;

      mapaPorOc.set(claveId, {
        item: 0,
        id: `salida-ret-${s.ordenId}`,
        ordenId: s.ordenId,
        codigoOc: s.codigo,
        subcodigo: null,
        proveedor: s.proveedor,
        fechaReintegro: '',
        moneda: 'Bs',
        montoBs: montoRetenidoBs,
        montoUsd: montoRetenidoUsd,
        montoRetenidoBs,
        montoRetenidoUsd,
        montoReintegradoBs: null,
        montoReintegradoUsd: null,
        tasa: s.tasa,
        referencia: null,
        cuentaBanco: null,
        tipoRetencion: tipoRet,
        facturas: [],
        motivo: `Orden con retención pendiente de reintegro (${s.codigo})`,
        estado: 'esperando_reintegro',
        estadoLabel: 'Pendiente',
        drive: null,
      });
    }

    return Array.from(mapaPorOc.values()).map((f, i) => ({ ...f, item: i + 1 }));
  }, [entradas, filasSalidas]);

  // Filtrado de filas
  const filtradas = useMemo(() => {
    return filasTotales.filter((e) => {
      if (filtroEstado !== 'todas' && e.estado !== filtroEstado) return false;
      if (filtroRetencion !== 'todas' && !e.tipoRetencion.toUpperCase().includes(filtroRetencion.toUpperCase())) {
        return false;
      }
      if (desde && e.fechaReintegro && e.fechaReintegro < desde) return false;
      if (hasta && e.fechaReintegro && e.fechaReintegro > hasta) return false;

      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const enCodigo = (e.codigoOc ?? '').toLowerCase().includes(q);
        const enSub = (e.subcodigo ?? '').toLowerCase().includes(q);
        const enProv = (e.proveedor ?? '').toLowerCase().includes(q);
        const enRef = (e.referencia ?? '').toLowerCase().includes(q);
        const enFacturas = (e.facturas ?? []).some((f) => f.toLowerCase().includes(q));
        const enMotivo = (e.motivo ?? '').toLowerCase().includes(q);
        if (!enCodigo && !enSub && !enProv && !enRef && !enFacturas && !enMotivo) return false;
      }
      return true;
    });
  }, [filasTotales, filtroEstado, filtroRetencion, desde, hasta, busqueda]);

  const kpis: IndicadoresEntradas = useMemo(() => indicadoresEntradas(filtradas), [filtradas]);

  // Paginación calculada
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamPagina));
  const paginaValida = Math.min(Math.max(1, paginaActual), totalPaginas);
  const indiceInicio = (paginaValida - 1) * tamPagina;
  const filasPagina = filtradas.slice(indiceInicio, indiceInicio + tamPagina);

  // Tipos únicos de retención para el selector
  const tiposRetencion = useMemo(() => {
    const s = new Set<string>();
    for (const e of filasTotales) {
      if (e.tipoRetencion.includes('ISAE')) s.add('ISAE');
      if (e.tipoRetencion.includes('IVA')) s.add('IVA');
      if (e.tipoRetencion.includes('ISLR')) s.add('ISLR');
      if (e.tipoRetencion.includes('Descuento')) s.add('Descuento');
    }
    return Array.from(s);
  }, [filasTotales]);

  const abrirModalRegistro = (e: FilaConciliacionEntrada) => {
    setModalRegistro(e);
    setRegFecha(e.fechaReintegro || new Date().toISOString().slice(0, 10));
    setRegRef(e.referencia || '');
    setRegMontoBs(e.montoReintegradoBs != null ? String(e.montoReintegradoBs) : (e.montoBs != null ? String(e.montoBs) : ''));
    setRegBanco(e.cuentaBanco || '');
  };

  const guardarRegistro = () => {
    if (!modalRegistro) return;
    const monto = parseFloat(regMontoBs.replace(/\./g, '').replace(',', '.'));
    if (isNaN(monto) || monto <= 0) {
      toast('Ingresa un monto válido para el reintegro', 'error');
      return;
    }

    modalRegistro.fechaReintegro = regFecha;
    modalRegistro.referencia = regRef.trim() || null;
    modalRegistro.montoReintegradoBs = monto;
    modalRegistro.montoBs = monto;
    modalRegistro.cuentaBanco = regBanco.trim() || null;
    modalRegistro.estado = 'reintegrado';
    modalRegistro.estadoLabel = 'Reintegrado';
    modalRegistro.drive = {
      estado: 'cuadra',
      detalle: `Reintegro anotado · Ref. ${regRef.trim() || 'Sin ref'}`,
      archivo: null,
      archivoPath: null,
      en: regFecha,
      por: 'Registro manual',
    };

    toast(`Reintegro para ${modalRegistro.codigoOc ?? 'la orden'} registrado exitosamente`, 'success');
    setModalRegistro(null);
  };

  const copiarResumen = () => {
    const lineas = [
      `*📥 CONCILIACIÓN POR ENTRADAS DE RETENCIÓN (GT)*`,
      `*Total entradas/reintegros:* ${kpis.total} (${bs(kpis.totalBs)} · ${usd(kpis.totalUsd)})`,
      `*Reintegrados en banco:* ${kpis.cantidadReintegrados} (${bs(kpis.totalBsReintegrado)})`,
      `*Esperando reintegro:* ${kpis.cantidadEsperando} (${bs(kpis.esperandoReintegro.bs)})`,
      `*Cruzados con Drive/Banco:* ${kpis.cantidadCruzados}`,
      '',
      ...filtradas.slice(0, 15).map((e) =>
        `• ${e.fechaReintegro ? fechaCorta(e.fechaReintegro) : 'Pendiente'}: ${e.codigoOc ?? 'Sin OC'} | ${e.proveedor} | ${e.tipoRetencion} | ${bs(e.montoBs)}${e.referencia ? ` (Ref. ${e.referencia})` : ''} [${e.estadoLabel}]`
      ),
    ];
    if (filtradas.length > 15) lineas.push(`... y ${filtradas.length - 15} más.`);
    void navigator.clipboard.writeText(lineas.join('\n'));
    toast('Resumen de entradas copiado al portapapeles', 'success');
  };

  const toggleFiltro = (estado: 'todas' | 'reintegrado' | 'esperando_reintegro') => {
    if (filtroEstado === estado && estado !== 'todas') {
      setFiltroEstado('todas');
    } else {
      setFiltroEstado(estado);
    }
  };

  return (
    <div style={{ marginTop: '.5rem' }}>
      {/* ── Tarjetas KPI (diseño idéntico a las tarjetas del sistema) ── */}
      <div className="kpi-grid" style={{ marginBottom: '1.25rem' }}>
        <div
          className={`kpi ${filtroEstado === 'todas' ? 'destacado' : ''}`}
          role="button"
          tabIndex={0}
          style={{
            cursor: 'pointer',
            ...(filtroEstado === 'todas' ? { borderColor: 'var(--primary, #f59e0b)' } : {}),
          }}
          onClick={() => toggleFiltro('todas')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleFiltro('todas');
            }
          }}
          title="Ver todas las entradas de retención"
        >
          <div className="label">Total Reintegros / Entradas</div>
          <div className="value">{cargando ? '…' : kpis.total}</div>
          <div className="delta" style={{ color: 'var(--text-muted)' }}>
            {cargando ? 'Cargando…' : `${bs(kpis.totalBs)} · ${usd(kpis.totalUsd)}`}
          </div>
          <div className="icon" aria-hidden="true">📥</div>
        </div>

        <div
          className={`kpi ${filtroEstado === 'reintegrado' ? 'destacado' : ''}`}
          role="button"
          tabIndex={0}
          style={{
            cursor: 'pointer',
            ...(filtroEstado === 'reintegrado' ? { borderColor: 'var(--success, #10b981)' } : {}),
          }}
          onClick={() => toggleFiltro('reintegrado')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleFiltro('reintegrado');
            }
          }}
          title="Filtrar sólo las que ya fueron reintegradas en banco"
        >
          <div className="label">Reintegrado en Banco</div>
          <div className="value">{cargando ? '…' : kpis.cantidadReintegrados}</div>
          <div className="delta" style={{ color: 'var(--success, #10b981)' }}>
            {cargando ? 'Cargando…' : `${bs(kpis.totalBsReintegrado)} · ${usd(kpis.totalUsdEquivalente)}`}
          </div>
          <div className="icon" aria-hidden="true">✅</div>
        </div>

        <div
          className={`kpi ${filtroEstado === 'esperando_reintegro' ? 'destacado' : ''}`}
          role="button"
          tabIndex={0}
          style={{
            cursor: 'pointer',
            ...(filtroEstado === 'esperando_reintegro' ? { borderColor: 'var(--warning, #f59e0b)' } : {}),
          }}
          onClick={() => toggleFiltro('esperando_reintegro')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleFiltro('esperando_reintegro');
            }
          }}
          title="Filtrar órdenes esperando reintegro del proveedor"
        >
          <div className="label">Esperando Reintegro</div>
          <div className="value">{cargando ? '…' : kpis.cantidadEsperando}</div>
          <div className="delta" style={{ color: 'var(--warning, #f59e0b)' }}>
            {cargando ? 'Cargando…' : `${bs(kpis.esperandoReintegro.bs)} · ${usd(kpis.esperandoReintegro.usd)}`}
          </div>
          <div className="icon" aria-hidden="true">⏳</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
        <div className="form-row" style={{ flex: '2 1 220px', margin: 0 }}>
          <label>Buscar</label>
          <input
            className="input"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPaginaActual(1); }}
            placeholder="🔍 OC, proveedor, factura o referencia bancaria…"
          />
        </div>

        <div className="form-row" style={{ flex: '1 1 160px', margin: 0 }}>
          <label>Estatus</label>
          <FiltroChecks
            ariaLabel="Estatus de entrada"
            todos="Todos"
            opciones={[
              { value: 'reintegrado', label: 'Reintegrados' },
              { value: 'esperando_reintegro', label: 'Esperando reintegro' },
            ]}
            seleccion={filtroEstado === 'todas' ? [] : [filtroEstado]}
            onChange={(v) => { setFiltroEstado(v.length === 1 ? (v[0] as 'reintegrado' | 'esperando_reintegro') : 'todas'); setPaginaActual(1); }}
          />
        </div>

        {tiposRetencion.length > 0 && (
          <div className="form-row" style={{ flex: '1 1 150px', margin: 0 }}>
            <label>Tipo Retención</label>
            <FiltroChecks
              ariaLabel="Tipo de retención"
              todos="Todas"
              opciones={tiposRetencion.map((t) => ({ value: t, label: t }))}
              seleccion={filtroRetencion === 'todas' ? [] : [filtroRetencion]}
              onChange={(v) => { setFiltroRetencion(v.length === 1 ? v[0] : 'todas'); setPaginaActual(1); }}
            />
          </div>
        )}

        <div className="form-row" style={{ flex: '1 1 130px', margin: 0 }}>
          <label>Desde</label>
          <input className="input" type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPaginaActual(1); }} />
        </div>

        <div className="form-row" style={{ flex: '1 1 130px', margin: 0 }}>
          <label>Hasta</label>
          <input className="input" type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPaginaActual(1); }} />
        </div>

        <div style={{ display: 'flex', gap: '.4rem', marginLeft: 'auto' }}>
          {(busqueda || filtroEstado !== 'todas' || filtroRetencion !== 'todas' || desde || hasta) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setBusqueda('');
                setFiltroEstado('todas');
                setFiltroRetencion('todas');
                setDesde('');
                setHasta('');
                setPaginaActual(1);
              }}
            >
              Limpiar
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={copiarResumen} title="Copiar resumen para WhatsApp">
            📋 Copiar WhatsApp
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void onActualizar()} disabled={cargando}>
            ↻ Recargar
          </button>
        </div>
      </div>

      {/* ── Tabla de Entradas · Formato idéntico a MGG ── */}
      <div className="table-wrap card">
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: '40px' }}>#</th>
              <th>CÓDIGO OC</th>
              <th>PROVEEDOR</th>
              <th>FACTURA</th>
              <th>TIPOS RETENCIÓN</th>
              <th style={{ textAlign: 'right' }}>MONTO RETENIDO</th>
              <th style={{ textAlign: 'center' }}>DÍA REINTEGRO</th>
              <th>REF. ENTRADA</th>
              <th style={{ textAlign: 'right' }}>MONTO REINTEGRADO</th>
              <th style={{ textAlign: 'center' }}>SOPORTE</th>
              <th style={{ textAlign: 'center' }}>DRIVE/BANCO</th>
              <th style={{ textAlign: 'center' }}>ACCIÓN</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={12} className="muted" style={{ textAlign: 'center', padding: '1.8rem' }}>
                  Cargando órdenes y reintegros de retención…
                </td>
              </tr>
            )}
            {!cargando && !filtradas.length && (
              <tr>
                <td colSpan={12} className="muted" style={{ textAlign: 'center', padding: '1.8rem' }}>
                  {filasTotales.length
                    ? 'Ninguna orden con retención coincide con los filtros aplicados.'
                    : 'No hay órdenes con retención registradas para este periodo. Al cargar el archivo de banco/Drive o crear OCs con retención aparecerán aquí.'}
                </td>
              </tr>
            )}
            {!cargando &&
              filasPagina.map((e, idx) => {
                const numFila = indiceInicio + idx + 1;
                const estaReintegrado = e.estado === 'reintegrado' || !!e.fechaReintegro;
                const montoRet = e.montoRetenidoBs ?? e.montoBs;
                const montoReint = e.montoReintegradoBs ?? (estaReintegrado ? e.montoBs : null);

                return (
                  <tr key={e.id || `entrada-${numFila}`}>
                    {/* 1. # */}
                    <td className="mono" style={{ textAlign: 'center', color: 'var(--text-muted, #9ca3af)', fontSize: '.85rem' }}>
                      {numFila}
                    </td>

                    {/* 2. CÓDIGO OC */}
                    <td>
                      {e.codigoOc ? (
                        <div>
                          {e.ordenId && onAbrirEnCompras ? (
                            <button
                              type="button"
                              className="btn btn-link"
                              style={{ padding: 0, fontWeight: 700, fontSize: '.9rem', textAlign: 'left' }}
                              onClick={() => onAbrirEnCompras(e.ordenId as string)}
                              title="Abrir orden en Compras"
                            >
                              {e.codigoOc}
                            </button>
                          ) : (
                            <strong className="mono" style={{ fontSize: '.9rem' }}>{e.codigoOc}</strong>
                          )}
                          {e.subcodigo && (
                            <div className="muted mono" style={{ fontSize: '.72rem', color: 'var(--text-muted, #9ca3af)' }}>
                              {e.subcodigo}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 3. PROVEEDOR */}
                    <td style={{ fontWeight: 500, fontSize: '.88rem' }}>
                      {e.proveedor || '—'}
                    </td>

                    {/* 4. FACTURA */}
                    <td>
                      {e.facturas && e.facturas.length > 0 ? (
                        <span
                          className="badge"
                          style={{
                            background: '#1e293b',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            fontSize: '.75rem',
                            padding: '.2rem .5rem',
                            borderRadius: '9999px',
                            cursor: 'help',
                          }}
                          title={e.facturas.join(', ')}
                        >
                          {e.facturas.length} soporte(s)
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 5. TIPOS RETENCIÓN */}
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: '#ffffff',
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: '.72rem',
                          padding: '.15rem .45rem',
                          borderRadius: '4px',
                          letterSpacing: '.03em',
                        }}
                      >
                        {e.tipoRetencion ? e.tipoRetencion.toUpperCase() : 'RETENCIÓN'}
                      </span>
                    </td>

                    {/* 6. MONTO RETENIDO */}
                    <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {montoRet != null && montoRet > 0 ? (
                        <div>
                          <strong>{bs(montoRet)}</strong>
                          {e.montoRetenidoUsd != null && e.montoRetenidoUsd > 0 && (
                            <div className="muted" style={{ fontSize: '.72rem' }}>{usd(e.montoRetenidoUsd)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 7. DÍA REINTEGRO */}
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {estaReintegrado && e.fechaReintegro ? (
                        <span className="mono" style={{ color: 'var(--text-color, #e2e8f0)', fontSize: '.85rem' }}>
                          {fechaCorta(e.fechaReintegro)}
                        </span>
                      ) : (
                        <span
                          className="badge"
                          style={{
                            background: '#1c1917',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            fontSize: '.78rem',
                            padding: '.2rem .6rem',
                            borderRadius: '9999px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.3rem',
                          }}
                        >
                          <span aria-hidden="true">⌛</span> Pendiente
                        </span>
                      )}
                    </td>

                    {/* 8. REF. ENTRADA */}
                    <td>
                      {e.referencia ? (
                        <span className="badge mono success" style={{ fontSize: '.78rem' }} title="Referencia bancaria de la entrada">
                          {e.referencia}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 9. MONTO REINTEGRADO */}
                    <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {montoReint != null && montoReint > 0 ? (
                        <strong style={{ color: 'var(--success, #10b981)' }}>{bs(montoReint)}</strong>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 10. SOPORTE */}
                    <td style={{ textAlign: 'center' }}>
                      {e.soporteUrl ? (
                        <a
                          href={e.soporteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '.15rem .45rem' }}
                          title="Ver soporte"
                        >
                          👁 Ver
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 11. DRIVE/BANCO */}
                    <td style={{ textAlign: 'center' }}>
                      {e.drive ? (
                        <span
                          className={`badge ${e.drive.estado === 'cuadra' ? 'success' : 'danger'}`}
                          style={{ cursor: 'help', whiteSpace: 'nowrap', fontSize: '.75rem' }}
                          title={e.drive.detalle ?? undefined}
                        >
                          {e.drive.estado === 'cuadra' ? 'CUADRA' : 'NO CUADRA'}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* 12. ACCIÓN */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{
                          fontSize: '.78rem',
                          padding: '.25rem .6rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.3rem',
                        }}
                        onClick={() => abrirModalRegistro(e)}
                        title="Registrar o editar reintegro"
                      >
                        <span aria-hidden="true">✏️</span> Registrar
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* ── Barra de Paginación inferior estilo MGG ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginTop: '1rem',
          padding: '.5rem 0',
          fontSize: '.85rem',
          color: 'var(--text-muted, #9ca3af)',
        }}
      >
        <div>
          Mostrando {filtradas.length > 0 ? `${indiceInicio + 1}–${Math.min(indiceInicio + tamPagina, filtradas.length)}` : '0'} de {filtradas.length} órdenes
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <span>Por página:</span>
            <select
              className="input"
              style={{ width: 'auto', padding: '.2rem .5rem', fontSize: '.85rem' }}
              value={tamPagina}
              onChange={(e) => {
                setTamPagina(Number(e.target.value));
                setPaginaActual(1);
              }}
            >
              {TAMANOS_PAGINA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={paginaValida <= 1}
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              style={{ padding: '.2rem .5rem' }}
            >
              ◀ Anterior
            </button>
            <span className="mono" style={{ padding: '0 .3rem' }}>
              {paginaValida}/{totalPaginas}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={paginaValida >= totalPaginas}
              onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
              style={{ padding: '.2rem .5rem' }}
            >
              Siguiente ▶
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal «✏️ Registrar Reintegro» ── */}
      {modalRegistro && (
        <Modal
          title={`✏️ Registrar Reintegro · ${modalRegistro.codigoOc ?? 'Orden'}`}
          size="md"
          onClose={() => setModalRegistro(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
              Proveedor: <strong>{modalRegistro.proveedor}</strong> · Tipo: <span className="badge warning">{modalRegistro.tipoRetencion}</span>
            </p>

            <div className="form-row" style={{ margin: 0 }}>
              <label>Día de reintegro (fecha en banco)</label>
              <input
                className="input"
                type="date"
                value={regFecha}
                onChange={(e) => setRegFecha(e.target.value)}
              />
            </div>

            <div className="form-row" style={{ margin: 0 }}>
              <label>Referencia bancaria de entrada</label>
              <input
                className="input"
                placeholder="Ej. 35760051"
                value={regRef}
                onChange={(e) => setRegRef(e.target.value)}
              />
            </div>

            <div className="form-row" style={{ margin: 0 }}>
              <label>Monto reintegrado en Bs</label>
              <input
                className="input"
                placeholder="0,00"
                value={regMontoBs}
                onChange={(e) => setRegMontoBs(e.target.value)}
              />
            </div>

            <div className="form-row" style={{ margin: 0 }}>
              <label>Cuenta / Banco</label>
              <input
                className="input"
                placeholder="Ej. BDT JURIDICO GT, Banesco..."
                value={regBanco}
                onChange={(e) => setRegBanco(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.5rem', marginTop: '.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setModalRegistro(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={guardarRegistro}
              >
                Guardar Reintegro
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
