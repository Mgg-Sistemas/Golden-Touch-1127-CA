import { useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { montoMoneda } from '@/shared/lib/format';
import type { Orden } from '@/shared/lib/types';
import { registrarAnticipoServicio } from './pedidos.repository';

/**
 * Bloque para registrar / EDITAR / quitar el PAGO ANTICIPADO de una orden de servicio.
 * El anticipo no toca caja: se resta del total y el resto queda como crédito pendiente.
 * Editable mientras la orden no esté pagada/cerrada.
 */
export function AnticipoServicioBloque({ orden, actorEmail, onSaved }: {
  orden: Orden; actorEmail: string; onSaved?: () => void;
}) {
  const total = Math.round((Number(orden.total) || 0) * 100) / 100;
  const yaTiene = (Number(orden.anticipo_monto) || 0) > 0;
  const cerrada = ['pagada', 'recibida', 'finalizada'].includes(orden.estado);
  const [on, setOn] = useState<boolean>(yaTiene);
  const [moneda, setMoneda] = useState<'USD' | 'Bs'>(orden.anticipo_moneda === 'Bs' ? 'Bs' : 'USD');
  const [monto, setMonto] = useState<string>(orden.anticipo_monto ? String(orden.anticipo_monto) : '');
  const [guardando, setGuardando] = useState(false);

  const monedaOrden = orden.total_moneda === 'Bs' ? 'Bs' : 'USD';
  const abonado = Math.round((Number(orden.abonado_total) || 0) * 100) / 100;
  const pendiente = Math.max(0, Math.round((total - abonado) * 100) / 100);

  async function guardar(quitar = false) {
    setGuardando(true);
    try {
      await registrarAnticipoServicio(orden, { monto: quitar ? 0 : (Number(monto) || 0), moneda }, actorEmail);
      toast(quitar ? 'Anticipo quitado' : 'Pago anticipado guardado', 'success');
      onSaved?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar el anticipo', 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (cerrada && !yaTiene) return null;

  return (
    <div className="card" style={{ marginTop: '.75rem' }}>
      <div className="card-title" style={{ fontSize: '.85rem', marginBottom: '.35rem' }}>💵 Pago anticipado</div>
      {total <= 0 ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>La orden aún no tiene monto total (aceptá una oferta primero).</div>
      ) : (
        <>
          {yaTiene && (
            <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.4rem' }}>
              Anticipo actual: <strong>{montoMoneda(Number(orden.anticipo_monto), orden.anticipo_moneda === 'Bs' ? 'Bs' : 'USD')}</strong>
              {' · '}pendiente <strong style={{ color: 'var(--brand, #ff8a00)' }}>{montoMoneda(pendiente, monedaOrden)}</strong>
              <span style={{ fontSize: '.72rem' }}> (de {montoMoneda(total, monedaOrden)})</span>
            </div>
          )}
          {!cerrada && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
                <span>Registrar / editar un adelanto (se resta del total, no descuenta caja)</span>
              </label>
              {on && (
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.4rem', flexWrap: 'wrap' }}>
                  <select className="select" style={{ maxWidth: 120 }} value={moneda} onChange={(e) => setMoneda(e.target.value === 'Bs' ? 'Bs' : 'USD')}>
                    <option value="USD">$ (USD)</option>
                    <option value="Bs">Bs</option>
                  </select>
                  <input className="input mono" type="number" min={0} step="any" placeholder="Monto del anticipo"
                    style={{ maxWidth: 180, textAlign: 'right' }} value={monto} onChange={(e) => setMonto(e.target.value)} />
                  <button className="btn btn-primary btn-sm" onClick={() => void guardar(false)} disabled={guardando}>
                    {guardando ? 'Guardando…' : '💾 Guardar'}
                  </button>
                  {yaTiene && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => void guardar(true)} disabled={guardando}>Quitar</button>
                  )}
                </div>
              )}
              <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
                El resto queda como crédito pendiente (aparece en Tesorería · Cuentas por pagar). El anticipo se ve en la trazabilidad.
              </small>
            </>
          )}
        </>
      )}
    </div>
  );
}
