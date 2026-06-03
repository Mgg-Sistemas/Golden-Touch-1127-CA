import { useEffect, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { money } from '@/shared/lib/format';
import type { Caja, Moneda } from '@/shared/lib/types';
import {
  listCajas, crearCaja, renombrarCaja, deshabilitarCaja, habilitarCaja, ajustarSaldo,
} from './cajas.repository';

/** Administra las cajas de la tesorería: alta (con moneda + saldo inicial),
 *  renombrar, deshabilitar/reactivar y ajustar saldo. */
export function GestionarCajasModal({
  actor, actorName, onClose, onCambioAplicado,
}: {
  actor: string;
  actorName?: string | null;
  onClose: () => void;
  onCambioAplicado?: () => void;
}) {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [saldoIni, setSaldoIni] = useState('0');

  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [ajusteId, setAjusteId] = useState<string | null>(null);
  const [ajusteVal, setAjusteVal] = useState('');
  const [ajusteMotivo, setAjusteMotivo] = useState('');

  async function recargar() {
    setLoading(true);
    try { setCajas(await listCajas()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las cajas', 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void recargar(); }, []);
  function cambio() { onCambioAplicado?.(); }

  async function agregar() {
    if (!nombre.trim()) { toast('Escribí el nombre de la caja', 'error'); return; }
    setBusy(true);
    try {
      await crearCaja({ nombre, moneda, saldoInicial: Number(saldoIni) || 0 }, actor);
      notify(`Caja "${nombre.trim()}" creada`, 'success');
      setNombre(''); setSaldoIni('0');
      await recargar(); cambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo crear', 'error'); }
    finally { setBusy(false); }
  }

  async function guardarRename() {
    if (!editId) return;
    setBusy(true);
    try {
      await renombrarCaja(editId, editVal);
      notify('Caja renombrada', 'success');
      setEditId(null); await recargar(); cambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo renombrar', 'error'); }
    finally { setBusy(false); }
  }

  async function toggleEstado(c: Caja) {
    setBusy(true);
    try {
      if (c.estado === 'activo') { await deshabilitarCaja(c.id); notify(`Caja "${c.nombre}" deshabilitada`, 'success'); }
      else { await habilitarCaja(c.id); notify(`Caja "${c.nombre}" reactivada`, 'success'); }
      await recargar(); cambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'); }
    finally { setBusy(false); }
  }

  async function guardarAjuste() {
    if (!ajusteId) return;
    if (!ajusteMotivo.trim()) { toast('Indicá el motivo del ajuste', 'error'); return; }
    setBusy(true);
    try {
      await ajustarSaldo(ajusteId, Number(ajusteVal) || 0, ajusteMotivo, actor, actorName);
      notify('Saldo ajustado', 'success');
      setAjusteId(null); setAjusteMotivo('');
      await recargar(); cambio();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo ajustar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Cajas (tesorería)" size="lg" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
        Cuentas de dinero con saldo. Una salida de dinero descuenta el saldo; un traslado
        lo mueve entre cajas de la misma moneda.
      </p>

      {/* Alta */}
      <div className="form-grid" style={{ marginBottom: '.85rem' }}>
        <div className="form-row">
          <label>Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Caja chica" />
        </div>
        <div className="form-row">
          <label>Moneda</label>
          <select className="select" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
            <option value="USD">USD ($)</option>
            <option value="Bs">Bolívares (Bs)</option>
          </select>
        </div>
        <div className="form-row">
          <label>Saldo inicial</label>
          <input className="input mono" type="number" min={0} step="0.01" value={saldoIni} onChange={(e) => setSaldoIni(e.target.value)} />
        </div>
        <div className="form-row" style={{ alignSelf: 'end' }}>
          <button className="btn btn-primary" onClick={agregar} disabled={busy}>+ Crear caja</button>
        </div>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: '1rem' }}>Cargando cajas…</div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.88rem' }}>
            <thead>
              <tr><th>Caja</th><th>Moneda</th><th style={{ textAlign: 'right' }}>Saldo</th><th>Estado</th><th style={{ width: 280 }}></th></tr>
            </thead>
            <tbody>
              {cajas.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin cajas.</td></tr>}
              {cajas.map((c) => {
                const enEd = editId === c.id;
                const activo = c.estado === 'activo';
                return (
                  <tr key={c.id}>
                    <td>{enEd ? (
                      <input className="input" value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') void guardarRename(); if (e.key === 'Escape') setEditId(null); }} />
                    ) : <strong>{c.nombre}</strong>}</td>
                    <td><span className="badge">{c.moneda}</span></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{money(Number(c.saldo) || 0)}</td>
                    <td><span className={`badge ${activo ? 'success' : 'warning'}`}>{activo ? 'Activa' : 'Inhabilitada'}</span></td>
                    <td className="actions">
                      {enEd ? (
                        <>
                          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void guardarRename()}>Guardar</button>
                          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setEditId(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-ghost" onClick={() => { setEditId(c.id); setEditVal(c.nombre); }}>✎</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => { setAjusteId(c.id); setAjusteVal(String(c.saldo)); setAjusteMotivo(''); }}>$ Ajustar</button>
                          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => toggleEstado(c)}>{activo ? '⃠ Deshabilitar' : '↺ Reactivar'}</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {cajas.length > 0 && (
              <tfoot>
                {(['USD', 'Bs'] as Moneda[]).map((m) => {
                  const total = cajas.filter((c) => c.moneda === m).reduce((a, c) => a + (Number(c.saldo) || 0), 0);
                  if (!cajas.some((c) => c.moneda === m)) return null;
                  return (
                    <tr key={m}>
                      <td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>Total registrado ({m})</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{m === 'USD' ? '$ ' : 'Bs '}{total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td colSpan={2}></td>
                    </tr>
                  );
                })}
              </tfoot>
            )}
          </table>
        </div>
      )}

      {ajusteId && (
        <Modal title="Ajustar saldo" size="md" onClose={() => setAjusteId(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setAjusteId(null)} disabled={busy}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarAjuste} disabled={busy}>Guardar</button>
          </>}>
          <div className="form-row">
            <label>Nuevo saldo</label>
            <input className="input mono" type="number" step="0.01" value={ajusteVal} onChange={(e) => setAjusteVal(e.target.value)} autoFocus />
          </div>
          <div className="form-row">
            <label>Motivo del ajuste</label>
            <input className="input" value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} placeholder="Ej. conciliación de caja" />
          </div>
        </Modal>
      )}
    </Modal>
  );
}
