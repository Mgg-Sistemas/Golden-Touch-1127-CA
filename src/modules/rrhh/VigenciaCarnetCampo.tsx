/* ============================================================
   Golden Touch · RRHH · Campo «Carnet vence» del formulario de personal
   La fecha se elige directo o se calcula: «vale N días/semanas/meses/años»
   desde hoy. Lo que se guarda es siempre la fecha.
   ============================================================ */
import { useState } from 'react';
import { FechaInput } from '@/shared/ui/FechaInput';
import { UNIDADES_VIGENCIA, estadoCarnet, venceEn, type UnidadVigencia } from './vigenciaCarnet';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const AVISO: Record<string, { texto: string; color: string }> = {
  vigente: { texto: 'Vigente', color: 'var(--success)' },
  por_vencer: { texto: 'Por vencer (30 días o menos)', color: 'var(--warning)' },
  vencido: { texto: 'Vencido', color: 'var(--danger)' },
};

export function VigenciaCarnetCampo({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState<UnidadVigencia>('meses');
  const estado = estadoCarnet(value);

  function aplicar() {
    const iso = venceEn(hoy(), Number(cantidad), unidad);
    if (iso) onChange(iso);
  }

  return (
    <div className="form-row">
      <label>Carnet vence</label>
      <FechaInput value={value} onChange={onChange} />
      <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center', marginTop: '.35rem', flexWrap: 'wrap' }}>
        <small className="muted">o vale</small>
        <input className="input" type="number" min={1} step={1} inputMode="numeric" name="carnet-vigencia-cantidad"
          value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: '4.5rem' }} placeholder="N" />
        <select className="input" name="carnet-vigencia-unidad" value={unidad}
          onChange={(e) => setUnidad(e.target.value as UnidadVigencia)} style={{ width: 'auto' }}>
          {UNIDADES_VIGENCIA.map((u) => <option key={u.valor} value={u.valor}>{u.label}</option>)}
        </select>
        <small className="muted">desde hoy</small>
        <button type="button" className="btn btn-sm btn-ghost" onClick={aplicar}
          disabled={!(Number(cantidad) >= 1)}>Calcular</button>
      </div>
      <small className="muted">
        {estado
          ? <span style={{ color: AVISO[estado].color, fontWeight: 600 }}>{AVISO[estado].texto}</span>
          : 'Sin fecha: el carnet sale sin vencimiento.'}
        {' '}· La fecha sale impresa en el frente del carnet.
      </small>
    </div>
  );
}
