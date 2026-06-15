import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, date } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal, AnticipoPrestamo } from '@/shared/lib/types';
import { listPersonal } from './personal.repository';
import { listAnticipos, crearAnticipo, eliminarAnticipo, type AnticipoInput } from './anticipos.repository';

const VACIO: AnticipoInput = { personal_id: '', tipo: 'anticipo', monto_total: 0, cuota_sugerida: null, motivo: '' };

export function AnticiposTab({ canWrite, actor, actorName }: { canWrite: boolean; actor: string; actorName: string | null }) {
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [lista, setLista] = useState<AnticipoPrestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AnticipoInput>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verSaldadas, setVerSaldadas] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const recargar = useCallback(async () => {
    setLoading(true);
    const [ps, as] = await Promise.all([
      listPersonal(false).catch((e) => { toast(e instanceof Error ? e.message : 'No se pudo cargar el personal', 'error'); return [] as Personal[]; }),
      listAnticipos().catch(() => [] as AnticipoPrestamo[]),
    ]);
    setPersonal(ps); setLista(as);
    setLoading(false);
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['anticipos_prestamos', 'personal'], () => { void recargar(); });

  const nombre = (id?: string | null) => {
    const p = personal.find((x) => x.id === id);
    return p ? `${p.nombre} ${p.apellido}`.trim() : '—';
  };

  async function guardar(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (!form.personal_id) { setError('Elegí el trabajador.'); return; }
    if (!(Number(form.monto_total) > 0)) { setError('Indicá el monto.'); return; }
    setGuardando(true);
    try {
      await crearAnticipo(form, actor, actorName);
      toast('Registrado', 'success');
      setForm(VACIO);
      setFormKey((k) => k + 1);
      await recargar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  async function borrar(a: AnticipoPrestamo) {
    if (!window.confirm('¿Eliminar este registro?')) return;
    try { await eliminarAnticipo(a.id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const visibles = lista.filter((a) => verSaldadas || a.estado === 'activo');

  return (
    <div>
      {canWrite && (
        <form onSubmit={guardar} style={{ marginBottom: '1rem' }}>
          {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}
          <div className="card" style={{ padding: '.85rem' }}>
            <div className="card-title" style={{ marginBottom: '.5rem' }}>Registrar anticipo / préstamo</div>
            <div className="form-grid" key={formKey}>
              <div className="form-row">
                <label>Trabajador</label>
                <SearchSelect value={form.personal_id} onChange={(v) => setForm((f) => ({ ...f, personal_id: v }))} placeholder="🔍 Buscar trabajador…"
                  options={personal.filter((p) => p.activo).map((p) => ({ value: p.id, label: `${p.nombre} ${p.apellido}` }))} />
              </div>
              <div className="form-row">
                <label>Tipo</label>
                <select className="select" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as 'anticipo' | 'prestamo' }))}>
                  <option value="anticipo">Anticipo</option>
                  <option value="prestamo">Préstamo</option>
                </select>
              </div>
              <div className="form-row"><label>Monto total (USD)</label><input name="anticipo-monto-total" className="input mono" type="number" min={0} step="any" defaultValue={form.monto_total || ''} onChange={(e) => setForm((f) => ({ ...f, monto_total: Number(e.target.value) || 0 }))} placeholder="0,00" required /></div>
              <div className="form-row"><label>Cuota sugerida por quincena (opcional)</label><input name="anticipo-cuota-sugerida" className="input mono" type="number" min={0} step="any" defaultValue={form.cuota_sugerida ?? ''} onChange={(e) => setForm((f) => ({ ...f, cuota_sugerida: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="0,00" /></div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}><label>Motivo</label><input name="anticipo-motivo" className="input" defaultValue={form.motivo ?? ''} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} placeholder="Adelanto de quincena, préstamo personal…" /></div>
            </div>
            <div style={{ marginTop: '.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : '+ Registrar'}</button>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.4rem' }}>El saldo se descuenta automáticamente al pagar la nómina, hasta saldar.</small>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.85rem' }}>
          <input type="checkbox" checked={verSaldadas} onChange={(e) => setVerSaldadas(e.target.checked)} /> Mostrar saldados
        </label>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>Trabajador</th><th>Tipo</th><th>Motivo</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ textAlign: 'center' }}>Estado</th><th>Fecha</th>{canWrite && <th></th>}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !visibles.length && <tr><td colSpan={8}><EmptyState message="Sin anticipos ni préstamos" icon="💵" /></td></tr>}
            {!loading && visibles.map((a) => (
              <tr key={a.id} style={{ opacity: a.estado === 'saldado' ? 0.6 : 1 }}>
                <td>{nombre(a.personal_id)}</td>
                <td><span className="badge">{a.tipo === 'anticipo' ? 'Anticipo' : 'Préstamo'}</span></td>
                <td className="muted">{a.motivo || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(a.monto_total)}</td>
                <td className="mono" style={{ textAlign: 'right', color: Number(a.saldo) > 0 ? 'var(--danger)' : 'var(--success)' }}>{money(a.saldo)}</td>
                <td style={{ textAlign: 'center' }}><span className="badge" style={{ color: a.estado === 'activo' ? 'var(--warning)' : 'var(--success)' }}>{a.estado === 'activo' ? 'Activo' : 'Saldado'}</span></td>
                <td className="muted">{date(a.created_at)}</td>
                {canWrite && <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-ghost" onClick={() => borrar(a)} title="Eliminar" style={{ color: 'var(--danger)' }}>🗑</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
