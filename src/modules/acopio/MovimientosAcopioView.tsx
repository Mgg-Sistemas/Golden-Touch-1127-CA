import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { date, money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import type { ContratoAcopio, CajaMovimiento, CajaCierre, ClasificacionAcopio, CostoClase } from '@/shared/lib/types';
import { listContratos } from '@/modules/produccion/contratos.repository';
import { listCajaMovimientos, listClasificaciones, listCostoClases } from './caja.repository';
import { MovimientoCajaModal } from './MovimientoCajaModal';
import { descargarMovAcopioPdf, descargarMovAcopioExcel, enviarMovAcopioPorCorreo } from './movimientosAcopioReportes';
import { construirMovimientosAcopio, type FilaMov, type ResumenAcopio } from './movimientosAcopioCalc';

export type { ResumenAcopio } from './movimientosAcopioCalc';

/**
 * Lista de movimientos del Centro de Acopio (réplica del Excel «caja» de acopio).
 * Por ahora se alimenta de los CONTRATOS DE PRODUCCIÓN CERRADOS: al cerrar un
 * contrato, sus Kg de casiterita entran al inventario y se reflejan aquí como un
 * movimiento. El número de Kg que aporta el contrato se resalta con color.
 * Incluye filtros (estilo Tesorería) y reportes PDF / Excel / correo.
 */

export function MovimientosAcopioView({ onResumen, onFilas, visible = true, caja = null, esHistorico = false }: {
  onResumen?: (r: ResumenAcopio) => void;
  onFilas?: (filas: FilaMov[]) => void;
  visible?: boolean;
  /** Caja a la que se scopea la vista (la ABIERTA en la página; una cerrada en el histórico). */
  caja?: CajaCierre | null;
  /** true cuando se muestra una caja ya cerrada (histórico): no incluye movimientos sin asignar. */
  esHistorico?: boolean;
} = {}) {
  const { user } = useSession();
  const { can, appUser } = usePermissions();
  const canWrite = can('acopio', 'escritura');
  const actorName = appUser?.nombre?.trim() || user?.email || null;
  const navigate = useNavigate();
  const [contratos, setContratos] = useState<ContratoAcopio[]>([]);
  const [cajaMovs, setCajaMovs] = useState<CajaMovimiento[]>([]);
  const [clasificaciones, setClasificaciones] = useState<ClasificacionAcopio[]>([]);
  const [costoClases, setCostoClases] = useState<CostoClase[]>([]);
  const [editMov, setEditMov] = useState<CajaMovimiento | null>(null);
  const [loading, setLoading] = useState(true);
  // Filtros (estilo Tesorería).
  const [fTexto, setFTexto] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [ordenDesc, setOrdenDesc] = useState(false); // false = más viejo→nuevo; true = más nuevo→viejo
  const [correoOpen, setCorreoOpen] = useState(false);

  const recargar = useCallback(async () => {
    const [cs, cms, cls, ccs] = await Promise.all([listContratos(), listCajaMovimientos(), listClasificaciones(), listCostoClases()]);
    setContratos(cs);
    setCajaMovs(cms);
    setClasificaciones(cls);
    setCostoClases(ccs);
  }, []);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    recargar().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar movimientos', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [recargar]);
  useRealtime(['acopio_contratos', 'acopio_caja_movimientos'], () => { void recargar(); });

  // El movimiento del Centro de Acopio es la mezcla de DOS fuentes (contratos
  // cerrados + movimientos de caja), scopeada a la caja activa. La lógica vive en
  // `construirMovimientosAcopio` para que la vista y el cierre vean lo mismo.
  const { filas, resumen: resumenScope } = useMemo(
    () => construirMovimientosAcopio({ contratos, cajaMovs, caja, esHistorico }),
    [contratos, cajaMovs, caja, esHistorico],
  );

  // Vista filtrada + ordenada por fecha (mantiene el saldo corrido calculado sobre TODOS los movimientos).
  const mostradas = useMemo(() => {
    const q = fTexto.trim().toLowerCase();
    const arr = filas.filter((f) => {
      if (fDesde && (f.fecha ?? '') < fDesde) return false;
      if (fHasta && (f.fecha ?? '') > fHasta) return false;
      if (q && !`${f.fecha} ${f.descripcion}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // `filas` ya viene en orden ascendente por fecha; si se pide descendente, se invierte.
    return ordenDesc ? arr.slice().reverse() : arr;
  }, [filas, fTexto, fDesde, fHasta, ordenDesc]);

  const hayFiltro = !!(fTexto || fDesde || fHasta);
  const filtroTxt = () => (hayFiltro ? 'filtrado' : undefined);

  // Reflejamos en las tarjetas de la página el MISMO resumen que alimenta la tabla,
  // y exponemos las filas (para que el cierre tome la foto exacta de lo mostrado).
  useEffect(() => { onResumen?.(resumenScope); }, [resumenScope, onResumen]);
  useEffect(() => { onFilas?.(filas); }, [filas, onFilas]);

  // Totales de la vista (para la fila de totales de la tabla, respeta el filtro).
  const totUsdEntregadoVista = mostradas.reduce((a, f) => a + (f.usdEntregado ?? 0), 0);
  const totKgVista = mostradas.reduce((a, f) => a + f.kgCerrados, 0);
  const totFacturadosVista = mostradas.reduce((a, f) => a + (f.usdFacturados ?? 0), 0);
  // Saldo final del rango filtrado = el del movimiento cronológicamente más nuevo (no depende del orden mostrado).
  const ascFiltradas = ordenDesc ? mostradas.slice().reverse() : mostradas;
  const saldoVista = ascFiltradas.length ? ascFiltradas[ascFiltradas.length - 1].saldoKgCasiterita : 0;

  // Columnas: Fecha, Descripción, Entregado, Kg, $Usd Facturados (lo gastado al comprar
  // casiterita), Gastos, Saldo $Usd, Saldo Kg, [acciones?]. Facturados es una columna
  // fija (aunque esté en $0,00), para ver siempre lo gastado en la compra de material.
  const totalCols = 8 + (canWrite ? 1 : 0);

  // El switch «Listar movimientos» de la página controla si se muestra la tabla.
  // Aunque esté oculta, el componente sigue montado para alimentar las tarjetas (onResumen).
  if (!visible) return null;

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
        <span>📋 Movimientos del Centro de Acopio</span>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input className="input" type="search" value={fTexto} onChange={(e) => setFTexto(e.target.value)}
              placeholder="🔍 Buscar (fecha, descripción…)" style={{ width: 240, paddingRight: fTexto ? '1.6rem' : undefined }} />
            {fTexto && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFTexto('')} title="Limpiar búsqueda"
                style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
            )}
          </div>
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
            Desde <input className="input" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem' }}>
            Hasta <input className="input" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ width: 'auto' }} />
          </label>
          <button className="btn btn-sm btn-ghost" onClick={() => setOrdenDesc((v) => !v)} title="Ordenar por fecha">
            Fecha {ordenDesc ? '↓ (nuevo→viejo)' : '↑ (viejo→nuevo)'}
          </button>
          {hayFiltro && <button className="btn btn-sm btn-ghost" onClick={() => { setFTexto(''); setFDesde(''); setFHasta(''); }}>✕ Limpiar</button>}
          <span className="muted" style={{ fontSize: '.8rem' }}>{mostradas.length}/{filas.length}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
        <button className="btn btn-ghost btn-sm" disabled={!mostradas.length} onClick={() => void descargarMovAcopioPdf(mostradas, { filtro: filtroTxt() }).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'))}>↓ PDF</button>
        <button className="btn btn-ghost btn-sm" disabled={!mostradas.length} onClick={() => void descargarMovAcopioExcel(mostradas).catch((e) => toast(e instanceof Error ? e.message : 'No se pudo generar el Excel', 'error'))}>📊 Excel</button>
        <button className="btn btn-ghost btn-sm" disabled={!mostradas.length} onClick={() => setCorreoOpen(true)}>✉ Correo</button>
      </div>

      {loading ? <EmptyState message="Cargando…" icon="◔" /> : !filas.length ? (
        <EmptyState message="Sin movimientos. Al cerrar un contrato de producción, se reflejará aquí." icon="📋" />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>$Usd entregado</th>
                <th>Kg Cerrados</th>
                <th title="Lo que se gastó al comprar casiterita (material facturado a mineros)">$Usd Facturados</th>
                <th>Gastos</th>
                <th>Saldo en moneda $ Usd</th>
                <th title="Saldo corrido = saldo anterior + Kg Cerrados − Kg Recibidos por MGG">Saldo en Kg de casiterita ⓘ</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {!mostradas.length && (
                <tr><td colSpan={totalCols} className="muted" style={{ textAlign: 'center' }}>Ningún movimiento coincide con el filtro.</td></tr>
              )}
              {mostradas.map((f) => {
                const movId = f.id.startsWith('m-') ? f.id.slice(2) : null;
                const editable = canWrite && !!movId;     // las filas de caja se editan con el botón ✎ del final
                // Solo las filas de CONTRATO son clicables (llevan a Producción). La edición de
                // los movimientos de caja se hace con el botón ✎ al final de la fila.
                const onRowClick = f.contratoId ? () => navigate(`/app/produccion?contrato=${f.contratoId}`) : undefined;
                return (
                <tr
                  key={f.id}
                  onClick={onRowClick}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                  title={f.contratoId ? 'Ver el contrato en Producción' : undefined}
                >
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{date(f.fecha)}</td>
                  <td style={{ fontWeight: 600 }}>
                    {f.descripcion}
                    {f.contratoId && <span className="muted" style={{ marginLeft: '.4rem', fontWeight: 400 }} title="Ver el contrato en Producción">↗</span>}
                  </td>
                  <td className="mono">{f.usdEntregado == null ? '—' : money(f.usdEntregado)}</td>
                  {/* Kg que aporta el contrato al cerrarse → resaltado */}
                  <td className="mono" style={{ fontWeight: 800, color: 'var(--primary-3)' }}>{num(f.kgCerrados)}</td>
                  {/* $Usd Facturados = lo gastado al comprar casiterita (material a mineros) */}
                  <td className="mono">{f.usdFacturados ? money(f.usdFacturados) : '—'}</td>
                  {/* Gastos = Gastos GT + Nómina GT unificados */}
                  <td className="mono">{(() => { const g = (f.gastosGt ?? 0) + (f.nominasGt ?? 0); return g === 0 && f.gastosGt == null && f.nominasGt == null ? '—' : money(g); })()}</td>
                  <td className="mono"><strong>{money(f.saldoUsd)}</strong></td>
                  {/* Saldo corrido de casiterita → resaltado (permite negativo) */}
                  <td className="mono" style={{ fontWeight: 800, color: f.saldoKgCasiterita < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{num(f.saldoKgCasiterita)}</td>
                  {canWrite && (
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {editable && (
                        <button className="btn btn-sm btn-ghost" title="Editar movimiento"
                          onClick={(e) => { e.stopPropagation(); const m = cajaMovs.find((x) => x.id === movId); if (m) setEditMov(m); }}>✎</button>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
                <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>Totales</td>
                <td className="mono" style={{ fontWeight: 800, color: 'var(--success, #45c08a)' }}>{totUsdEntregadoVista ? money(totUsdEntregadoVista) : '—'}</td>
                <td className="mono" style={{ fontWeight: 800, color: 'var(--primary-3)' }}>{num(totKgVista)}</td>
                {/* Total facturado (lo gastado al comprar casiterita); Gastos + Saldo $Usd quedan vacíos */}
                <td className="mono" style={{ fontWeight: 800, color: 'var(--danger)' }}>{totFacturadosVista ? money(totFacturadosVista) : '—'}</td>
                <td colSpan={2}></td>
                <td className="mono" style={{ fontWeight: 800, color: saldoVista < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{num(saldoVista)}</td>
                {canWrite && <td></td>}
              </tr>
            </tfoot>
          </table>
          <p className="muted" style={{ fontSize: '.74rem', marginTop: '.5rem' }}>
            <strong>Saldo en Kg de casiterita</strong> = saldo anterior + Kg Cerrados − Kg Recibidos por MGG (acumulado corrido; admite negativo).
          </p>
        </div>
      )}

      {correoOpen && (
        <CorreoReporteModal
          titulo="Enviar movimientos del Centro de Acopio"
          descripcion={`Se enviará el PDF con ${mostradas.length} movimiento(s)${hayFiltro ? ', con el filtro aplicado' : ''}.`}
          defaultEmail={user?.email ?? ''}
          onEnviar={async (emails) => {
            const { destinatarios } = await enviarMovAcopioPorCorreo(mostradas, emails, { filtro: filtroTxt() });
            return destinatarios;
          }}
          onClose={() => setCorreoOpen(false)}
        />
      )}

      {editMov && (
        <MovimientoCajaModal
          mov={editMov}
          cajaId={editMov.caja_id ?? null}
          clasificaciones={clasificaciones}
          costoClases={costoClases}
          actor={user?.email ?? 'sistema'}
          actorName={actorName}
          onClose={() => setEditMov(null)}
          onSaved={async () => { setEditMov(null); await recargar(); }}
        />
      )}
    </div>
  );
}
