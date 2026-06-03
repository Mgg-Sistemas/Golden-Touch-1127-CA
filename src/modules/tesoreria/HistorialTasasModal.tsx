import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date } from '@/shared/lib/format';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import type { TasaCambio, TasaHoy } from '@/shared/lib/types';
import { getTasaHoy, listHistorialTasas, refrescarTasa, setTasaManual } from './tasas.repository';
import { listMonedas } from './monedas';

/** Formatea una tasa (Bs por unidad) con 2 decimales en es-VE. */
function bs(n: number | null | undefined): string {
  if (n == null) return '—';
  return `Bs ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HistorialTasasModal({ tasaHoy, onClose, onRefreshed }: {
  tasaHoy: TasaHoy | null;
  onClose: () => void;
  onRefreshed?: (t: TasaHoy) => void;
}) {
  const { isAdmin } = usePermissions();
  const [filtros, setFiltros] = useState<{ desde: string; hasta: string; moneda: string }>({ desde: '', hasta: '', moneda: '' });
  const [filas, setFilas] = useState<TasaCambio[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Corrección manual
  const [mMoneda, setMMoneda] = useState<string>('USD');
  const [mTasa, setMTasa] = useState('');
  // Monedas con tasa (todas las del sistema menos Bs, que es la base).
  const [monedasTasa, setMonedasTasa] = useState<string[]>(['USD', 'EUR', 'USDT', 'COP']);
  useEffect(() => {
    listMonedas()
      .then((ms) => setMonedasTasa(Array.from(new Set(['USD', 'EUR', ...ms])).filter((m) => m !== 'Bs')))
      .catch(() => { /* base */ });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFilas(await listHistorialTasas({
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
        moneda: filtros.moneda || undefined,
      }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo cargar el historial', 'error');
    } finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { void reload(); }, [reload]);

  async function actualizar() {
    setBusy(true);
    try {
      const t = await refrescarTasa();
      onRefreshed?.(t);
      toast(`Tasa actualizada: ${bs(t.usd)}/$`, 'success');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'); }
    finally { setBusy(false); }
  }

  async function guardarManual() {
    const v = Number(mTasa);
    if (!Number.isFinite(v) || v <= 0) { toast('Indicá una tasa válida', 'error'); return; }
    setBusy(true);
    try {
      await setTasaManual({ moneda: mMoneda, tasa: v });
      setMTasa('');
      onRefreshed?.(await getTasaHoy());
      toast('Tasa corregida', 'success');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-primary" onClick={actualizar} disabled={busy}>{busy ? 'Actualizando…' : '↻ Actualizar ahora'}</button>
    </>
  );

  return (
    <Modal title="Historial de tasas · BCV" size="lg" onClose={onClose} footer={footer}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div><div className="muted" style={{ fontSize: '.72rem' }}>USD (BCV) hoy</div><strong className="mono" style={{ fontSize: '1.1rem' }}>{bs(tasaHoy?.usd)}</strong></div>
          <div><div className="muted" style={{ fontSize: '.72rem' }}>EUR hoy</div><strong className="mono" style={{ fontSize: '1.1rem' }}>{bs(tasaHoy?.eur)}</strong></div>
          <div><div className="muted" style={{ fontSize: '.72rem' }}>Fecha</div><strong>{tasaHoy?.fecha ? date(tasaHoy.fecha) : '—'}</strong></div>
        </div>
      </div>

      {isAdmin && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title"><span>Corregir tasa de hoy (manual)</span></div>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-row" style={{ margin: 0 }}>
              <label>Moneda</label>
              <select className="select" value={mMoneda} onChange={(e) => setMMoneda(e.target.value)}>
                {monedasTasa.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ margin: 0 }}>
              <label>Tasa (Bs)</label>
              <input className="input mono" type="number" min={0} step="0.01" value={mTasa} onChange={(e) => setMTasa(e.target.value)} />
            </div>
            <button className="btn btn-sm btn-primary" onClick={guardarManual} disabled={busy}>Guardar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        <div className="form-row" style={{ margin: 0 }}>
          <label>Desde</label>
          <input className="input" type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <label>Hasta</label>
          <input className="input" type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <label>Moneda</label>
          <select className="select" value={filtros.moneda} onChange={(e) => setFiltros((f) => ({ ...f, moneda: e.target.value }))}>
            <option value="">Todas</option>
            {monedasTasa.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {(filtros.desde || filtros.hasta || filtros.moneda) && (
          <button className="btn btn-sm btn-ghost" onClick={() => setFiltros({ desde: '', hasta: '', moneda: '' })}>Limpiar</button>
        )}
      </div>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.86rem' }}>
          <thead><tr><th>Fecha</th><th>Moneda</th><th style={{ textAlign: 'right' }}>Tasa</th><th>Fuente</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !filas.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Sin registros.</td></tr>}
            {!loading && filas.map((r) => (
              <tr key={r.id}>
                <td>{date(r.fecha)}</td>
                <td>{r.moneda}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{bs(r.tasa)}</td>
                <td><span className="muted">{r.fuente}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
