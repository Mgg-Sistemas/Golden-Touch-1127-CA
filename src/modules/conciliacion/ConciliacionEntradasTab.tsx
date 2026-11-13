/* ============================================================
   Conciliación · Submódulo de Conciliación por Entradas de Retención
   (Entradas - Reintegros de Retenciones y Descuentos).

   Muestra exclusivamente las ENTRADAS: reintegros de retenciones
   fiscales (ISAE, IVA, ISLR) y descuentos que entran a las cuentas
   bancarias de Golden Touch, con su respectiva referencia bancaria,
   el día del reintegro y su estatus (reintegrado vs esperando reintegro).
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
import { toast } from '@/shared/ui/Toast';

interface Props {
  filasSalidas: FilaConciliacion[];
  entradas: FilaConciliacionEntrada[];
  cargando: boolean;
  onActualizar: () => Promise<void>;
  onAbrirEnCompras?: (ordenId: string) => void;
}

export function ConciliacionEntradasTab({
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

  // Filtrado de filas
  const filtradas = useMemo(() => {
    return entradas.filter((e) => {
      if (filtroEstado !== 'todas' && e.estado !== filtroEstado) return false;
      if (filtroRetencion !== 'todas' && !e.tipoRetencion.toUpperCase().includes(filtroRetencion.toUpperCase())) {
        return false;
      }
      if (desde && e.fechaReintegro && e.fechaReintegro < desde) return false;
      if (hasta && e.fechaReintegro && e.fechaReintegro > hasta) return false;

      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const enCodigo = (e.codigoOc ?? '').toLowerCase().includes(q);
        const enProv = (e.proveedor ?? '').toLowerCase().includes(q);
        const enRef = (e.referencia ?? '').toLowerCase().includes(q);
        const enFacturas = (e.facturas ?? []).some((f) => f.toLowerCase().includes(q));
        const enMotivo = (e.motivo ?? '').toLowerCase().includes(q);
        if (!enCodigo && !enProv && !enRef && !enFacturas && !enMotivo) return false;
      }
      return true;
    });
  }, [entradas, filtroEstado, filtroRetencion, desde, hasta, busqueda]);

  const kpis: IndicadoresEntradas = useMemo(() => indicadoresEntradas(filtradas), [filtradas]);

  // Tipos únicos de retención para el selector
  const tiposRetencion = useMemo(() => {
    const s = new Set<string>();
    for (const e of entradas) {
      if (e.tipoRetencion.includes('ISAE')) s.add('ISAE');
      if (e.tipoRetencion.includes('IVA')) s.add('IVA');
      if (e.tipoRetencion.includes('ISLR')) s.add('ISLR');
      if (e.tipoRetencion.includes('Descuento')) s.add('Descuento');
    }
    return Array.from(s);
  }, [entradas]);

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
            onChange={(e) => setBusqueda(e.target.value)}
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
            onChange={(v) => setFiltroEstado(v.length === 1 ? (v[0] as 'reintegrado' | 'esperando_reintegro') : 'todas')}
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
              onChange={(v) => setFiltroRetencion(v.length === 1 ? v[0] : 'todas')}
            />
          </div>
        )}

        <div className="form-row" style={{ flex: '1 1 130px', margin: 0 }}>
          <label>Desde</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>

        <div className="form-row" style={{ flex: '1 1 130px', margin: 0 }}>
          <label>Hasta</label>
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
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

      {/* ── Tabla de Entradas ── */}
      <div className="table-wrap card">
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: 'right' }}>Ítem</th>
              <th>Día de reintegro</th>
              <th>Código OC</th>
              <th>Proveedor</th>
              <th>Retención</th>
              <th>Factura(s)</th>
              <th style={{ textAlign: 'right' }}>Monto Bs</th>
              <th>Ref. Bancaria</th>
              <th>Cuenta / Banco</th>
              <th>Estatus</th>
              <th>DRIVE / BANCO</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={11} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  Cargando entradas y reintegros…
                </td>
              </tr>
            )}
            {!cargando && !filtradas.length && (
              <tr>
                <td colSpan={11} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  {entradas.length
                    ? 'Ninguna entrada coincide con los filtros aplicados.'
                    : 'No hay entradas de reintegro cargadas todavía. Puedes subir el archivo de libro mayor / banco o registrar comprobantes.'}
                </td>
              </tr>
            )}
            {!cargando &&
              filtradas.map((e, idx) => (
                <tr key={e.id || `entrada-${idx}`}>
                  <td className="mono" style={{ textAlign: 'right' }}>
                    {idx + 1}
                  </td>
                  <td>
                    {e.fechaReintegro ? (
                      <span className="mono">{fechaCorta(e.fechaReintegro)}</span>
                    ) : (
                      <span className="muted" title="Esperando que el proveedor realice el reembolso bancario">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td>
                    {e.codigoOc ? (
                      e.ordenId && onAbrirEnCompras ? (
                        <button
                          type="button"
                          className="btn btn-link"
                          style={{ padding: 0, fontWeight: 700 }}
                          onClick={() => onAbrirEnCompras(e.ordenId as string)}
                          title="Abrir orden en Compras"
                        >
                          {e.codigoOc}
                        </button>
                      ) : (
                        <strong className="mono">{e.codigoOc}</strong>
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{e.proveedor || '—'}</td>
                  <td>
                    <span className="badge warning" style={{ fontSize: '.78rem' }}>
                      {e.tipoRetencion || 'Retención'}
                    </span>
                  </td>
                  <td>
                    {e.facturas && e.facturas.length > 0 ? (
                      <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                        {e.facturas.map((f, fi) => (
                          <span key={fi} className="badge info mono" style={{ fontSize: '.72rem' }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <strong>{bs(e.montoBs)}</strong>
                    {e.montoUsd != null && (
                      <div className="muted" style={{ fontSize: '.72rem' }}>
                        {usd(e.montoUsd)}
                        {e.tasa && ` · tasa ${e.tasa.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
                      </div>
                    )}
                  </td>
                  <td>
                    {e.referencia ? (
                      <span className="badge mono success" title="Referencia bancaria de la entrada">
                        {e.referencia}
                      </span>
                    ) : (
                      <span className="muted">Sin ref</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '.8rem' }}>{e.cuentaBanco || '—'}</span>
                  </td>
                  <td>
                    <span className={`badge ${e.estado === 'reintegrado' ? 'success' : 'warning'}`}>
                      {e.estadoLabel}
                    </span>
                  </td>
                  <td>
                    {e.drive ? (
                      <span
                        className={`badge ${e.drive.estado === 'cuadra' ? 'success' : 'danger'}`}
                        style={{ cursor: 'help', whiteSpace: 'nowrap' }}
                        title={e.drive.detalle ?? undefined}
                      >
                        {e.drive.estado === 'cuadra' ? 'CUADRA' : 'NO CUADRA'}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

