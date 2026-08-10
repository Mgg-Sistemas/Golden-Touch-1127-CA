import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { crearMovimientoCaja } from './caja.repository';

/**
 * Entrada de dinero al Centro de Acopio (columna «$Usd entregado»).
 * Registra un movimiento de caja SOLO con el monto entregado y una descripción
 * armada como «<CAJA ORIGEN> DESCRIPCIÓN: <detalle>». La caja origen se elige
 * entre las dos fuentes de fondos del centro:
 *   · CAJA MULTIMONEDAS MGG
 *   · CAJA GT PERAMANAL
 */
const CAJAS_ORIGEN = ['CAJA MULTIMONEDAS MGG', 'CAJA GT PERAMANAL'] as const;

export function EntradaDineroAcopioModal({ cajaId, actor, actorName, onClose, onSaved }: {
  /** Caja (cierre) ABIERTA a la que se asigna la entrada. */
  cajaId: string | null;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cajaOrigen, setCajaOrigen] = useState<string>(CAJAS_ORIGEN[0]);
  const [monto, setMonto] = useState('');
  const [detalle, setDetalle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto) || 0;
  const descripcionPreview = `${cajaOrigen} DESCRIPCIÓN: ${detalle.trim() || '…'}`;

  async function guardar() {
    setError(null);
    if (montoNum <= 0) { setError('Ingresá un monto en USD mayor a 0.'); return; }
    setSaving(true);
    try {
      await crearMovimientoCaja(
        {
          fecha,
          descripcion: `${cajaOrigen} DESCRIPCIÓN: ${detalle.trim()}`.trim(),
          usd_entregado: montoNum,
          kg_cerrados: 0, facturados: 0, gastos: 0, nominas: 0, traslado: 0, kg_recibidos: 0,
          clasif_grupo: null, clasif_valor: null,
          costo_clasificacion: null, costo_subclasificacion: null, equipo: null,
          caja_id: cajaId,
        },
        actor, actorName,
      );
      toast('Entrada de dinero registrada', 'success');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la entrada.');
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Entrada de dinero al Centro de Acopio"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void guardar()} disabled={saving}>
            {saving ? 'Registrando…' : '💵 Registrar entrada'}
          </button>
        </>
      }
    >
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>
        Registra un ingreso de dinero al centro. Suma en la columna <strong>$Usd entregado</strong>.
      </p>
      <div className="form-grid">
        <div className="form-row">
          <label>Fecha</label>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Caja de origen</label>
          <select className="select" value={cajaOrigen} onChange={(e) => setCajaOrigen(e.target.value)}>
            {CAJAS_ORIGEN.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <label>Monto entregado (USD)</label>
        <input className="input mono" type="number" min={0} step="any" value={monto}
          onChange={(e) => setMonto(e.target.value)} placeholder="0,00" inputMode="decimal" />
      </div>
      <div className="form-row">
        <label>Descripción</label>
        <textarea className="input" rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)}
          placeholder="Detalle de la entrada de dinero…" />
        <small className="muted">Se guardará como: <strong>{descripcionPreview}</strong></small>
      </div>
    </Modal>
  );
}
