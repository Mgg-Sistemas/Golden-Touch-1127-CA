import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import type { Caja } from '@/shared/lib/types';
import { trasladoDinero } from './cajas.repository';

export function TrasladoDineroForm({
  cajas, actor, actorName, onClose, onSaved,
}: {
  cajas: Caja[];
  actor: string;
  actorName?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const activas = useMemo(() => cajas.filter((c) => c.estado === 'activo'), [cajas]);

  const [origenId, setOrigenId] = useState(activas[0]?.id ?? '');
  const origen = activas.find((c) => c.id === origenId) ?? null;
  // El destino debe ser otra caja de la MISMA moneda.
  const destinos = useMemo(
    () => activas.filter((c) => c.id !== origenId && c.moneda === origen?.moneda),
    [activas, origenId, origen],
  );
  const [destinoId, setDestinoId] = useState(destinos[0]?.id ?? '');
  const [monto, setMonto] = useState('0');
  const [motivo, setMotivo] = useState('');
  const [notaOn, setNotaOn] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si cambió el origen y el destino ya no aplica, reseteamos.
  const destinoValido = destinos.some((c) => c.id === destinoId) ? destinoId : (destinos[0]?.id ?? '');
  const saldo = Number(origen?.saldo) || 0;
  const montoNum = Number(monto) || 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!origenId || !destinoValido) { setError('Elegí caja origen y destino (misma moneda).'); return; }
    if (montoNum <= 0) { setError('El monto debe ser mayor que 0.'); return; }
    if (montoNum > saldo) { setError(`Saldo insuficiente. Disponible: ${money(saldo)} ${origen?.moneda}.`); return; }
    setSaving(true);
    try {
      await trasladoDinero({ origenId, destinoId: destinoValido, monto: montoNum, motivo: motivo.trim() || null, notaEntrega: notaOn ? (notaTexto.trim() || null) : null, actor, actorName });
      const dest = activas.find((c) => c.id === destinoValido);
      notify(`Traslado de dinero: ${money(montoNum)} ${origen?.moneda} · ${origen?.nombre} → ${dest?.nombre}`, 'success');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el traslado.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="traslado-dinero-form" className="btn btn-primary" disabled={saving}>
        {saving ? 'Trasladando…' : 'Registrar traslado'}
      </button>
    </>
  );

  return (
    <Modal title="Nuevo traslado de dinero" size="lg" onClose={onClose} footer={footer}>
      <form id="traslado-dinero-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="form-grid">
          <div className="form-row">
            <label>Caja origen</label>
            <select className="select" value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
              {!activas.length && <option value="">— sin cajas —</option>}
              {activas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.moneda} · {money(Number(c.saldo) || 0)}</option>)}
            </select>
            {origen && <small className="muted">Saldo: <strong className="mono">{money(saldo)} {origen.moneda}</strong></small>}
          </div>
          <div className="form-row">
            <label>Caja destino (misma moneda)</label>
            <select className="select" value={destinoValido} onChange={(e) => setDestinoId(e.target.value)}>
              {!destinos.length && <option value="">— no hay otra caja en {origen?.moneda} —</option>}
              {destinos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {money(Number(c.saldo) || 0)}</option>)}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Monto ({origen?.moneda ?? '—'})</label>
            <input className="input mono" type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Motivo (opcional)</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del traslado…" />
          </div>
        </div>

        <div className="form-row">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={notaOn} onChange={(e) => setNotaOn(e.target.checked)} />
            Nota de entrega
          </label>
          {notaOn && (
            <textarea className="input" rows={2} value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribí el motivo / detalle de la nota de entrega…" style={{ marginTop: '.4rem' }} />
          )}
          {notaOn && <small className="muted">Este texto se imprime en el PDF del traslado como “Nota de entrega”.</small>}
        </div>
      </form>
    </Modal>
  );
}
