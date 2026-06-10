import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { date, money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { ContratoAcopio } from '@/shared/lib/types';
import { listContratos } from '@/modules/produccion/contratos.repository';

/**
 * Lista de movimientos del Centro de Acopio (réplica del Excel «caja» de acopio).
 * Por ahora se alimenta de los CONTRATOS DE PRODUCCIÓN CERRADOS: al cerrar un
 * contrato, sus Kg de casiterita entran al inventario y se reflejan aquí como un
 * movimiento. El número de Kg que aporta el contrato se resalta con color.
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

export function MovimientosAcopioView() {
  const [contratos, setContratos] = useState<ContratoAcopio[]>([]);
  const [loading, setLoading] = useState(true);

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
    let saldoKg = 0;
    return cerrados.map((c) => {
      const kg = Number(c.kg_seco_limpio) || 0;
      saldoKg += kg;
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
        kgRecibidosMgg: null,
        saldoKgCasiterita: saldoKg,
      };
    });
  }, [contratos]);

  const totalKg = filas.reduce((a, f) => a + f.kgCerrados, 0);

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📋 Movimientos del Centro de Acopio</span>
        <span className="muted" style={{ fontSize: '.8rem' }}>{filas.length} movimiento(s)</span>
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
              {filas.map((f) => (
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
                  {/* Saldo corrido de casiterita → resaltado */}
                  <td className="mono" style={{ fontWeight: 800, color: 'var(--success, #45c08a)' }}>{num(f.saldoKgCasiterita)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border, rgba(255,255,255,.15))' }}>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Totales</td>
                <td className="mono" style={{ fontWeight: 800, color: 'var(--primary-3)' }}>{num(totalKg)}</td>
                <td colSpan={7}></td>
                <td className="mono" style={{ fontWeight: 800, color: 'var(--success, #45c08a)' }}>{num(totalKg)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
