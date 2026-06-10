import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { date, money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { CorreoReporteModal } from '@/shared/ui/CorreoReporteModal';
import type { ContratoAcopio } from '@/shared/lib/types';
import { listContratos } from '@/modules/produccion/contratos.repository';
import { descargarMovAcopioPdf, descargarMovAcopioExcel, enviarMovAcopioPorCorreo } from './movimientosAcopioReportes';

/**
 * Lista de movimientos del Centro de Acopio (réplica del Excel «caja» de acopio).
 * Por ahora se alimenta de los CONTRATOS DE PRODUCCIÓN CERRADOS: al cerrar un
 * contrato, sus Kg de casiterita entran al inventario y se reflejan aquí como un
 * movimiento. El número de Kg que aporta el contrato se resalta con color.
 * Incluye filtros (estilo Tesorería) y reportes PDF / Excel / correo.
 */

interface FilaMov {
  id: string;
  fecha: string;
  descripcion: string;
  usdEntregado: number | null;
  kgCerrados: number;       // ← lo que aporta el contrato (se refleja en la caja)
  precioUsdKg: number | null;
  usdFacturados: number;
  gastosGt: number | null;
  nominasGt: number | null;
  trasladoCaja: number | null;
  saldoUsd: number;
  kgRecibidosMgg: number | null;
  saldoKgCasiterita: number; // saldo corrido
}

export function MovimientosAcopioView({ onResumen }: { onResumen?: (r: { saldoKg: number; tasa: number }) => void } = {}) {
  const { user } = useSession();
  const [contratos, setContratos] = useState<ContratoAcopio[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtros (estilo Tesorería).
  const [fTexto, setFTexto] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [ordenDesc, setOrdenDesc] = useState(false); // false = más viejo→nuevo; true = más nuevo→viejo
  const [correoOpen, setCorreoOpen] = useState(false);

  const recargar = useCallback(async () => { setContratos(await listContratos()); }, []);
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    recargar().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar movimientos', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [recargar]);
  useRealtime(['acopio_contratos'], () => { void recargar(); });

  // Solo los contratos CERRADOS se reflejan como movimiento, ordenados por fecha (saldo corrido).
  const filas = useMemo<FilaMov[]>(() => {
    const cerrados = contratos
      .filter((c) => c.estado === 'cerrado')
      .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '') || (a.seq - b.seq));
    // Saldo corrido: RESULTADO ANTERIOR + Kg Cerrados − Kg Recibidos por MGG = NUEVO RESULTADO.
    let saldoKg = 0;
    return cerrados.map((c) => {
      const kg = Number(c.kg_seco_limpio) || 0;
      const mgg = 0; // Kg Recibidos por MGG (aún no conectado) → cuando exista se resta acá.
      saldoKg = saldoKg + kg - mgg;
      return {
        id: c.id,
        fecha: c.fecha,
        descripcion: `CONTRATO PRODUCCIÓN GT - #${c.seq}`,
        usdEntregado: null,
        kgCerrados: kg,
        precioUsdKg: null,
        usdFacturados: 0,
        gastosGt: null,
        nominasGt: null,
        trasladoCaja: null,
        saldoUsd: 0,
        kgRecibidosMgg: mgg || null,
        saldoKgCasiterita: saldoKg,
      };
    });
  }, [contratos]);

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

  // Totales y saldo/tasa generales (sobre TODOS los movimientos, no el filtro) para las tarjetas.
  const totalKg = filas.reduce((a, f) => a + f.kgCerrados, 0);
  const totalFacturado = filas.reduce((a, f) => a + (f.usdFacturados ?? 0), 0);
  const totalGastos = filas.reduce((a, f) => a + (f.gastosGt ?? 0), 0);
  const totalNominas = filas.reduce((a, f) => a + (f.nominasGt ?? 0), 0);
  const saldoFinal = filas.length ? filas[filas.length - 1].saldoKgCasiterita : 0;
  // TASA ACTUAL DEL MATERIAL = (Facturado + Gastos + Nóminas) ÷ Kg cerrados.
  const tasa = totalKg !== 0 ? (totalFacturado + totalGastos + totalNominas) / totalKg : 0;

  // Reflejamos el saldo acumulado de casiterita y la tasa en las tarjetas de la página.
  useEffect(() => { onResumen?.({ saldoKg: saldoFinal, tasa }); }, [saldoFinal, tasa, onResumen]);

  // Totales de la vista (para la fila de totales de la tabla, respeta el filtro).
  const totKgVista = mostradas.reduce((a, f) => a + f.kgCerrados, 0);
  const totMggVista = mostradas.reduce((a, f) => a + (f.kgRecibidosMgg ?? 0), 0);
  // Saldo final del rango filtrado = el del movimiento cronológicamente más nuevo (no depende del orden mostrado).
  const ascFiltradas = ordenDesc ? mostradas.slice().reverse() : mostradas;
  const saldoVista = ascFiltradas.length ? ascFiltradas[ascFiltradas.length - 1].saldoKgCasiterita : 0;

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
                <th>Precio $Usd por Kg</th>
                <th>$Usd Facturados</th>
                <th>Gastos GT</th>
                <th>Nóminas GT</th>
                <th>Traslado de caja</th>
                <th>Saldo en moneda $ Usd</th>
                <th>Kg Recibidos por MGG</th>
                <th>Saldo en Kg de casiterita</th>
              </tr>
            </thead>
            <tbody>
              {!mostradas.length && (
                <tr><td colSpan={12} className="muted" style={{ textAlign: 'center' }}>Ningún movimiento coincide con el filtro.</td></tr>
              )}
              {mostradas.map((f) => (
                <tr key={f.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{date(f.fecha)}</td>
                  <td style={{ fontWeight: 600 }}>{f.descripcion}</td>
                  <td className="mono">{f.usdEntregado == null ? '—' : money(f.usdEntregado)}</td>
                  {/* Kg que aporta el contrato al cerrarse → resaltado */}
                  <td className="mono" style={{ fontWeight: 800, color: 'var(--primary-3)' }}>{num(f.kgCerrados)}</td>
                  <td className="mono">{f.precioUsdKg == null ? '—' : money(f.precioUsdKg)}</td>
                  <td className="mono">{money(f.usdFacturados)}</td>
                  <td className="mono">{f.gastosGt == null ? '—' : money(f.gastosGt)}</td>
                  <td className="mono">{f.nominasGt == null ? '—' : money(f.nominasGt)}</td>
                  <td className="mono">{f.trasladoCaja == null ? '—' : money(f.trasladoCaja)}</td>
                  <td className="mono"><strong>{money(f.saldoUsd)}</strong></td>
                  <td className="mono">{f.kgRecibidosMgg == null ? '—' : num(f.kgRecibidosMgg)}</td>
                  {/* Saldo corrido de casiterita → resaltado (permite negativo) */}
                  <td className="mono" style={{ fontWeight: 800, color: f.saldoKgCasiterita < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{num(f.saldoKgCasiterita)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Totales</td>
                <td className="mono" style={{ fontWeight: 800, color: 'var(--primary-3)' }}>{num(totKgVista)}</td>
                <td colSpan={6}></td>
                <td className="mono" style={{ fontWeight: 700 }}>{totMggVista ? num(totMggVista) : '—'}</td>
                <td className="mono" style={{ fontWeight: 800, color: saldoVista < 0 ? 'var(--danger)' : 'var(--success, #45c08a)' }}>{num(saldoVista)}</td>
              </tr>
            </tfoot>
          </table>
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
    </div>
  );
}
