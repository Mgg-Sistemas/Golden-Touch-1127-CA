import { useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money } from '@/shared/lib/format';
import { aceptarGastoAcopio, rechazarGastoAcopio, type GastoPorAceptar } from './caja.repository';

/**
 * Tarjeta-banner «GASTOS POR ACEPTAR»: gastos registrados en Tesorería y marcados
 * «Es de Peramanal». No entran solos a los movimientos: Acopio ve el detalle
 * (descripción, monto en $, categoría/subcategoría, si es nómina) y decide
 * ACEPTAR (entra a los movimientos, grupo Gastos o Nómina) o RECHAZAR (se descarta).
 */
export function GastosPorAceptar({ gastos, onReload }: {
  gastos: GastoPorAceptar[];
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const count = gastos.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`card${count ? ' alert-pulse' : ''}`}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          borderColor: count ? 'var(--warning)' : 'var(--border)',
          borderWidth: count ? 2 : 1,
          background: count ? 'linear-gradient(135deg, rgba(245,158,11,.18), var(--surface))' : 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{count ? '🧾' : '🧾'}</span>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '.02em', color: count ? 'var(--warning)' : undefined }}>
              {count ? '¡GASTOS POR ACEPTAR!' : 'GASTOS POR ACEPTAR'}
            </div>
            <div className="muted" style={{ fontSize: '.78rem' }}>
              {count
                ? `${count} gasto${count > 1 ? 's' : ''} de Tesorería · clic para revisar y ACEPTAR o RECHAZAR`
                : 'Sin gastos pendientes de aceptar'}
            </div>
          </div>
        </div>
        {count > 0 && <span className="badge" style={{ background: 'var(--warning)', color: '#3a2606', fontWeight: 700 }}>{count}</span>}
      </button>

      {open && <GastosModal gastos={gastos} onClose={() => setOpen(false)} onReload={onReload} />}
    </>
  );
}

function GastosModal({ gastos, onClose, onReload }: {
  gastos: GastoPorAceptar[];
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aRechazar, setARechazar] = useState<GastoPorAceptar | null>(null);

  async function aceptar(g: GastoPorAceptar) {
    setBusyId(g.id);
    try {
      await aceptarGastoAcopio(g.id);
      toast('Gasto aceptado · entró a los movimientos del Centro de Acopio', 'success');
      await onReload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo aceptar', 'error'); setBusyId(null); }
  }
  async function rechazar(g: GastoPorAceptar) {
    setBusyId(g.id);
    try {
      await rechazarGastoAcopio(g.id);
      toast('Gasto rechazado · no entró a los movimientos', 'success');
      await onReload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo rechazar', 'error'); setBusyId(null); }
    finally { setARechazar(null); }
  }

  return (
    <Modal title="🧾 Gastos por aceptar (desde Tesorería)" size="lg" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {!gastos.length ? (
        <p className="muted" style={{ margin: 0 }}>No hay gastos pendientes de aceptar.</p>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {gastos.map((g) => {
            const bs = (g.moneda ?? '') === 'Bs';
            return (
              <div key={g.id} className="card" style={{ borderColor: 'var(--warning)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
                  <div>
                    <div className="muted" style={{ fontSize: '.74rem' }}>
                      Gasto registrado en Tesorería {g.es_nomina ? '· entra como NÓMINA' : '· entra como GASTO'}
                    </div>
                    <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--warning)' }}>{money(g.monto)}</div>
                    {bs && g.monto_original != null && (
                      <div className="muted" style={{ fontSize: '.72rem' }}>
                        Original: {Number(g.monto_original).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs → convertido a $
                      </div>
                    )}
                  </div>
                </div>

                {g.descripcion && <div style={{ fontSize: '.86rem', marginTop: '.35rem' }}>{g.descripcion}</div>}
                <div className="muted" style={{ fontSize: '.76rem', marginTop: '.25rem' }}>
                  {g.gasto_categoria ? <>Categoría: <strong>{g.gasto_categoria}</strong></> : 'Sin categoría'}
                  {g.gasto_subcategoria ? <> · Subcategoría: <strong>{g.gasto_subcategoria}</strong></> : ''}
                </div>

                <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.6rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }}
                    onClick={() => setARechazar(g)} disabled={busyId === g.id}>✕ Rechazar</button>
                  <button className="btn btn-primary" onClick={() => aceptar(g)} disabled={busyId === g.id}>
                    {busyId === g.id ? 'Procesando…' : '✓ ACEPTAR GASTO'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aRechazar && (
        <ConfirmDialog title="Rechazar gasto"
          message={`¿Rechazar este gasto de ${money(aRechazar.monto)}? Se descarta de la cola y NO entra a los movimientos del Centro de Acopio. El gasto sigue existiendo en Tesorería.`}
          confirmText="Rechazar" danger
          onConfirm={() => void rechazar(aRechazar)} onCancel={() => setARechazar(null)} />
      )}
    </Modal>
  );
}
