import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money } from '@/shared/lib/format';
import type { CajaCierre, TransferenciaInter } from '@/shared/lib/types';
import { aceptarEntradaEnCajaAcopio } from './caja.repository';

/** Suma los legs por moneda y arma un texto "USD 1.000,00 · Bs 5.000,00". */
function resumenLegs(t: TransferenciaInter): string {
  if (t.resumen) return t.resumen;
  return (t.legs ?? []).map((l) => `${l.moneda} ${money(l.monto).replace('$', '')}`).join(' · ');
}

/**
 * Tarjeta-banner "DINERO POR ENTRAR": dinero que llega desde el otro sistema
 * (transferencias inter-sistema entrantes pendientes de confirmar). Al hacer
 * clic muestra el monto y el botón ACEPTAR ENTRADA, que acredita el dinero en
 * la caja de Acopio (abierta) que se elija.
 */
export function DineroPorEntrar({ entrantes, cajas, actor, actorName, onReload }: {
  entrantes: TransferenciaInter[];
  cajas: CajaCierre[];
  actor: string;
  actorName: string | null;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const count = entrantes.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`card${count ? ' alert-pulse' : ''}`}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          borderColor: count ? 'var(--success)' : 'var(--border)',
          borderWidth: count ? 2 : 1,
          background: count ? 'linear-gradient(135deg, rgba(34,197,94,.18), var(--surface))' : 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{count ? '🔔' : '💸'}</span>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '.02em', color: count ? 'var(--success)' : undefined }}>
              {count ? '¡DINERO POR ENTRAR!' : 'DINERO POR ENTRAR'}
            </div>
            <div className="muted" style={{ fontSize: '.78rem' }}>
              {count
                ? `${count} transferencia${count > 1 ? 's' : ''} desde otro sistema · clic para revisar y ACEPTAR`
                : 'Sin transferencias pendientes'}
            </div>
          </div>
        </div>
        {count > 0 && <span className="badge" style={{ background: 'var(--success)', color: '#06210f', fontWeight: 700 }}>{count}</span>}
      </button>

      {open && (
        <DineroModal entrantes={entrantes} cajas={cajas} actor={actor} actorName={actorName}
          onClose={() => setOpen(false)} onReload={onReload} />
      )}
    </>
  );
}

function DineroModal({ entrantes, cajas, actor, actorName, onClose, onReload }: {
  entrantes: TransferenciaInter[];
  cajas: CajaCierre[];
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  // Caja de Acopio que recibe el dinero, elegida por transferencia.
  const [cajaSel, setCajaSel] = useState<Record<string, string>>({});
  // Solo cajas de Acopio ABIERTAS pueden recibir el dinero entrante.
  const cajasAbiertas = useMemo(() => cajas.filter((c) => c.estado === 'abierta'), [cajas]);

  async function aceptar(t: TransferenciaInter) {
    const cajaId = cajaSel[t.id];
    if (!cajaId) { toast('Elegí la caja que recibe el dinero', 'error'); return; }
    const caja = cajas.find((c) => c.id === cajaId);
    setBusyId(t.id);
    try {
      await aceptarEntradaEnCajaAcopio({ row: t, cajaId, cajaNombre: caja?.nombre || caja?.numero || null, actor, actorName });
      toast('Entrada aceptada · dinero acreditado en la caja', 'success');
      await onReload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo aceptar', 'error'); setBusyId(null); }
  }

  return (
    <Modal title="💸 Dinero por entrar (desde otro sistema)" size="lg" onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      {!entrantes.length ? (
        <p className="muted" style={{ margin: 0 }}>No hay transferencias entrantes pendientes de confirmar.</p>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {entrantes.map((t) => (
            <div key={t.id} className="card" style={{ borderColor: 'var(--success)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
                <div>
                  <div className="muted" style={{ fontSize: '.74rem' }}>Cantidad a recibir desde <strong>{t.empresa_origen}</strong></div>
                  <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>{resumenLegs(t)}</div>
                  {t.motivo && <div className="muted" style={{ fontSize: '.76rem', marginTop: '.2rem' }}>{t.motivo}</div>}
                </div>
              </div>

              {/* Caja de Acopio que recibe + Aceptar */}
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-end', marginTop: '.6rem', flexWrap: 'wrap' }}>
                <div className="form-row" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                  <label style={{ fontSize: '.74rem' }}>Caja que recibe el dinero</label>
                  {cajasAbiertas.length ? (
                    <select className="select" value={cajaSel[t.id] ?? ''} onChange={(e) => setCajaSel((p) => ({ ...p, [t.id]: e.target.value }))}>
                      <option value="">— elegí la caja —</option>
                      {cajasAbiertas.map((c) => <option key={c.id} value={c.id}>{c.nombre || c.numero}</option>)}
                    </select>
                  ) : (
                    <div className="muted" style={{ fontSize: '.76rem' }}>No hay cajas de Acopio abiertas. Abrí una en la pestaña Caja Peramanal.</div>
                  )}
                </div>
                <button className="btn btn-primary" onClick={() => aceptar(t)} disabled={busyId === t.id || !cajasAbiertas.length}>
                  {busyId === t.id ? 'Aceptando…' : '✓ ACEPTAR ENTRADA'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
