/* ============================================================
   Golden Touch · Tesorería · «Tiene retención» al pagar un directo

   La misma tarjeta que el pago de una OC (PagarOrdenModal), para compras y
   servicios directos. La retención se carga en Bs (como sale el comprobante)
   o en $, con su propia tasa: arranca en la BCV del día y se puede cambiar por
   la del comprobante. Lo que se resta del total es la retención expresada en
   la moneda del documento. Las reglas viven en retencionPago.ts y pagoDirecto.ts.
   ============================================================ */
import { useEffect, useState } from 'react';
import { dosDecimales, num } from '@/shared/lib/format';
import { errorRetencionPago, netoAPagar } from '@/modules/pedidos/pagoDirecto';
import { convertirRetencion, type MonedaRetencion, type RetencionConvertida } from './retencionPago';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (v: number, m: MonedaRetencion) => `${m === 'Bs' ? 'Bs' : '$'} ${num(r2(v))}`;

export interface RetencionPago {
  activa: boolean;
  setActiva: (v: boolean) => void;
  montoStr: string;
  setMontoStr: (v: string) => void;
  moneda: MonedaRetencion;
  setMoneda: (v: MonedaRetencion) => void;
  tasaStr: string;
  setTasaStr: (v: string) => void;
  tasaEditada: boolean;
  setTasaEditada: (v: boolean) => void;
  conv: RetencionConvertida;
  /** La retención en la moneda del documento (0 si no está marcada). */
  monto: number;
  /** Por qué no se puede pagar así; `null` si está bien o no hay retención. */
  error: string | null;
  /** Lo que se paga: total − retención (el total mientras la retención no sea válida). */
  neto: number;
}

/**
 * Estado de la retención de un pago. `inicial` precarga un monto ya conocido (en la moneda
 * del documento): en compras directas, la retención que cargó Compras al montar, para que
 * Tesorería no la cargue dos veces.
 */
export function useRetencionPago(total: number, monedaDoc: MonedaRetencion, tasaBcv: number, inicial?: number | null): RetencionPago {
  const inicialNum = r2(Number(inicial) || 0);
  const [activa, setActiva] = useState(inicialNum > 0);
  const [montoStr, setMontoStr] = useState(inicialNum > 0 ? String(inicialNum) : '');
  const [moneda, setMoneda] = useState<MonedaRetencion>(inicialNum > 0 ? monedaDoc : 'Bs');
  const [tasaStr, setTasaStr] = useState('');
  const [tasaEditada, setTasaEditada] = useState(false);
  // La tasa arranca en la BCV del día y la sigue hasta que se edite a mano.
  useEffect(() => { if (!tasaEditada && tasaBcv > 0) setTasaStr(String(tasaBcv)); }, [tasaBcv, tasaEditada]);

  const conv = convertirRetencion(activa ? Number(montoStr) || 0 : 0, moneda, Number(tasaStr) || 0, monedaDoc);
  const monto = activa ? conv.enMonedaOc : 0;
  const error = !activa
    ? null
    : conv.faltaTasa ? 'Indicá la tasa (Bs por $) para convertir la retención.' : errorRetencionPago(total, monto);
  return {
    activa, setActiva, montoStr, setMontoStr, moneda, setMoneda, tasaStr, setTasaStr, tasaEditada, setTasaEditada,
    conv, monto, error, neto: activa && !error ? netoAPagar(total, monto) : r2(total),
  };
}

export function RetencionPagoCard({ r, total, monedaDoc, tasaBcv }: {
  r: RetencionPago;
  total: number;
  monedaDoc: MonedaRetencion;
  tasaBcv: number;
}) {
  const tasa = Number(r.tasaStr) || 0;
  return (
    <div className="card" style={{ marginBottom: '.75rem', borderColor: r.activa ? 'var(--brand, #ff8a00)' : undefined }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer', fontWeight: 600 }}>
        <input type="checkbox" checked={r.activa}
          onChange={(e) => { r.setActiva(e.target.checked); if (!e.target.checked) r.setMontoStr(''); }} />
        Tiene retención
      </label>
      {r.activa && (
        <div style={{ display: 'grid', gap: '.5rem', marginTop: '.5rem' }}>
          <div style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Moneda en la que se carga. Al cambiarla, lo ya escrito se convierte. */}
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Moneda</label>
              <div style={{ display: 'inline-flex', gap: '.25rem' }}>
                {(['Bs', 'USD'] as const).map((m) => (
                  <button key={m} type="button"
                    className={`btn btn-sm ${r.moneda === m ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      if (m === r.moneda) return;
                      const n = Number(r.montoStr) || 0;
                      if (n > 0 && tasa > 0) r.setMontoStr(String(m === 'Bs' ? r2(n * tasa) : r2(n / tasa)));
                      r.setMoneda(m);
                    }}>
                    {m === 'Bs' ? 'Bs' : '$'}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 0, minWidth: 160 }}>
              <label>Monto de la retención ({r.moneda === 'Bs' ? 'Bs' : '$'})</label>
              <input className="input mono" type="number" min={0} step="any" value={r.montoStr}
                onChange={(e) => r.setMontoStr(dosDecimales(e.target.value))} placeholder="0,00"
                style={{ textAlign: 'right', borderColor: r.error && !r.conv.faltaTasa ? 'var(--danger)' : undefined }} />
            </div>
            <div className="form-row" style={{ marginBottom: 0, minWidth: 150 }}>
              <label>Tasa (Bs por $){r.tasaEditada ? ' · modificada' : ' · BCV'}</label>
              <input className="input mono" type="number" min={0} step="any" value={r.tasaStr}
                onChange={(e) => { r.setTasaEditada(true); r.setTasaStr(e.target.value); }} placeholder="0,00"
                style={{ textAlign: 'right', borderColor: r.conv.faltaTasa ? 'var(--danger)' : undefined }} />
            </div>
            {r.tasaEditada && tasaBcv > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" title="Volver a la tasa BCV del día"
                onClick={() => { r.setTasaEditada(false); r.setTasaStr(String(tasaBcv)); }}>
                ↺ Tasa BCV
              </button>
            )}
          </div>
          <div style={{ fontSize: '.88rem', lineHeight: 1.5 }}>
            Retención <strong className="mono">{fmt(r.conv.enBs, 'Bs')}</strong>
            {' ⇄ '}<strong className="mono">{fmt(r.conv.enUsd, 'USD')}</strong>
            {tasa > 0 && <span className="muted"> · a {tasa.toLocaleString('es-VE')} Bs por $</span>}
          </div>
          <div style={{ fontSize: '.88rem', lineHeight: 1.5 }}>
            Factura <strong className="mono">{fmt(total, monedaDoc)}</strong>
            {' − '}retención <strong className="mono">{fmt(r.monto, monedaDoc)}</strong>
            {' = '}<strong className="mono" style={{ color: r.error ? 'var(--danger)' : 'var(--success)' }}>{fmt(r2(total - r.monto), monedaDoc)}</strong> a pagar
          </div>
        </div>
      )}
      {r.error && <small style={{ color: 'var(--danger)', display: 'block', marginTop: '.3rem' }}>{r.error}</small>}
      {!r.activa && <small className="muted" style={{ display: 'block', marginTop: '.2rem' }}>Marcalo si la factura tiene retención: el monto se resta del total a pagar.</small>}
    </div>
  );
}
