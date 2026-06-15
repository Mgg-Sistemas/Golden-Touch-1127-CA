import { useMemo, useState } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date, money, num } from '@/shared/lib/format';
import type { CajaCierre, CajaMovimiento, ClasificacionAcopio, CostoClase } from '@/shared/lib/types';
import {
  GRUPOS, grupoColor, grupoLabel,
  cerrarCaja, reabrirCaja, crearCaja, resumirCierre,
} from './caja.repository';
import { MovimientoCajaModal } from './MovimientoCajaModal';

function Chip({ grupo, valor }: { grupo?: string | null; valor?: string | null }) {
  if (!grupo) return <span className="muted">—</span>;
  return (
    <span title={grupoLabel(grupo)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.74rem' }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: grupoColor(grupo), flex: '0 0 auto' }} />
      <span>{valor || grupoLabel(grupo)}</span>
    </span>
  );
}

export function CajaView({ movimientos, clasificaciones, cajas, costoClases, canWrite, actor, actorName, onReload }: {
  movimientos: CajaMovimiento[];
  clasificaciones: ClasificacionAcopio[];
  cajas: CajaCierre[];
  costoClases: CostoClase[];
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onReload: () => Promise<void>;
}) {
  const abierta = cajas.find((c) => c.estado === 'abierta') ?? cajas[0] ?? null;
  const [cajaId, setCajaId] = useState<string>(abierta?.id ?? '');
  const caja = cajas.find((c) => c.id === cajaId) ?? abierta;
  const [modal, setModal] = useState<CajaMovimiento | 'nuevo' | null>(null);
  const [nuevaCaja, setNuevaCaja] = useState(false);

  const movs = useMemo(() => movimientos.filter((m) => (caja ? m.caja_id === caja.id : true)), [movimientos, caja]);
  const resumen = useMemo(() => resumirCierre(caja, movs), [caja, movs]);

  async function cerrar() {
    if (!caja) return;
    if (!window.confirm(`¿Cerrar ${caja.numero}? Quedará como cierre con saldo final ${money(resumen.saldoUsd)}.`)) return;
    try { await cerrarCaja(caja.id, resumen.saldoUsd, actor); toast('Caja cerrada', 'success'); await onReload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
  }
  async function reabrir() {
    if (!caja) return;
    try { await reabrirCaja(caja.id); toast('Caja reabierta', 'success'); await onReload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); }
  }

  return (
    <div>
      {/* Cabecera del cierre */}
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.6rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <SearchSelect value={cajaId} onChange={setCajaId} style={{ maxWidth: 280 }} placeholder="🔍 Buscar cierre…"
              options={cajas.map((c) => ({ value: c.id, label: `${c.numero}${c.nombre ? ` · ${c.nombre}` : ''} ${c.estado === 'cerrada' ? '🔒' : '●'}` }))} />
            {caja && (
              <span className="muted" style={{ fontSize: '.82rem' }}>
                {date(caja.fecha_inicio)} → {caja.fecha_fin ? date(caja.fecha_fin) : 'hoy'}
                {caja.recepcion ? ` · ${caja.recepcion}` : ''} · <strong>{resumen.dias} días</strong>
              </span>
            )}
          </div>
          {canWrite && (
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => setNuevaCaja(true)}>+ Nueva caja</button>
              {caja?.estado === 'abierta'
                ? <button className="btn btn-sm btn-ghost" onClick={cerrar}>🔒 Cerrar caja</button>
                : caja && <button className="btn btn-sm btn-ghost" onClick={reabrir}>Reabrir</button>}
            </div>
          )}
        </div>
      </div>

      {/* Resumen del cierre (calculado) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
        <div className="card" style={{ borderColor: 'var(--primary)' }}><div className="muted" style={{ fontSize: '.72rem' }}>Tasa del material</div><div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-3)' }}>{money(resumen.tasa)}/Kg</div></div>
        <div className="card"><div className="muted" style={{ fontSize: '.72rem' }}>Total gastado</div><div className="mono" style={{ fontWeight: 700 }}>{money(resumen.totalGastado)}</div></div>
        <div className="card"><div className="muted" style={{ fontSize: '.72rem' }}>Saldo de caja</div><div className="mono" style={{ fontWeight: 700 }}>{money(resumen.saldoUsd)}</div></div>
        <div className="card"><div className="muted" style={{ fontSize: '.72rem' }}>Kg cerrados</div><div className="mono" style={{ fontWeight: 700 }}>{num(resumen.kgCerrados)} Kg</div></div>
      </div>

      {/* Distribución por categoría */}
      {resumen.porGrupo.length > 0 && (
        <div className="card" style={{ marginBottom: '.75rem' }}>
          <div className="card-title"><span>Distribución del gasto por categoría</span></div>
          {resumen.porGrupo.map((g) => (
            <div key={g.grupo} style={{ marginBottom: '.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem' }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: g.color, marginRight: 6 }} />{g.label}</span>
                <span className="mono">{money(g.monto)} · {g.pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, g.pct)}%`, height: '100%', background: g.color }} />
              </div>
            </div>
          ))}
          {resumen.porCosto.length > 0 && (
            <details style={{ marginTop: '.5rem' }}>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: '.78rem' }}>Por clasificación de costo (2 niveles)</summary>
              <table className="table" style={{ fontSize: '.78rem', marginTop: '.4rem' }}>
                <thead><tr><th>Clasificación</th><th>Sub-clasificación</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
                <tbody>{resumen.porCosto.map((c, i) => <tr key={i}><td>{c.clasificacion}</td><td>{c.subclasificacion || '—'}</td><td className="mono" style={{ textAlign: 'right' }}>{money(c.monto)}</td><td className="mono" style={{ textAlign: 'right' }}>{c.pct.toFixed(1)}%</td></tr>)}</tbody>
              </table>
            </details>
          )}
        </div>
      )}

      <div className="filterbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {GRUPOS.map((g) => (
            <span key={g.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.74rem' }} className="muted">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color }} /> {g.label}
            </span>
          ))}
        </div>
        {canWrite && caja?.estado === 'abierta' && <button className="btn btn-primary btn-sm" onClick={() => setModal('nuevo')}>+ Movimiento de caja</button>}
      </div>

      {!movs.length ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Sin movimientos en esta caja.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr>
                <th>Fecha</th><th>Descripción</th><th>Clasificación</th>
                <th style={{ textAlign: 'right' }}>$ Entregado</th><th style={{ textAlign: 'right' }}>Kg Cerr.</th>
                <th style={{ textAlign: 'right' }}>Gastos</th><th style={{ textAlign: 'right' }}>Nóminas</th>
                <th style={{ textAlign: 'right' }}>Saldo $</th>{canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id} style={canWrite ? { cursor: 'pointer' } : undefined} onClick={canWrite ? () => setModal(m) : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{date(m.fecha)}</td>
                  <td style={{ maxWidth: 280, whiteSpace: 'pre-wrap' }}>{m.descripcion || '—'}{m.costo_subclasificacion && <div className="muted" style={{ fontSize: '.7rem' }}>↳ {m.costo_subclasificacion}</div>}</td>
                  <td><Chip grupo={m.clasif_grupo} valor={m.clasif_valor} /></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{m.usd_entregado ? money(m.usd_entregado) : ''}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{m.kg_cerrados ? num(m.kg_cerrados) : ''}</td>
                  <td className="mono" style={{ textAlign: 'right', color: m.gastos ? 'var(--danger)' : undefined }}>{m.gastos ? money(m.gastos) : ''}</td>
                  <td className="mono" style={{ textAlign: 'right', color: m.nominas ? 'var(--danger)' : undefined }}>{m.nominas ? money(m.nominas) : ''}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{money(m.saldo_usd ?? 0)}</td>
                  {canWrite && <td style={{ textAlign: 'center' }}>✎</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <MovimientoCajaModal
          mov={modal === 'nuevo' ? null : modal}
          cajaId={caja?.id ?? null}
          clasificaciones={clasificaciones}
          costoClases={costoClases}
          actor={actor}
          actorName={actorName}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await onReload(); }}
        />
      )}
      {nuevaCaja && <NuevaCajaModal actor={actor} onClose={() => setNuevaCaja(false)} onSaved={async (id) => { setNuevaCaja(false); setCajaId(id); await onReload(); }} />}
    </div>
  );
}

function NuevaCajaModal({ actor, onClose, onSaved }: { actor: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [recepcion, setRecepcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  async function guardar() {
    if (!numero.trim()) { toast('Indicá el número de caja', 'error'); return; }
    setSaving(true);
    try { const c = await crearCaja({ numero, nombre, recepcion, fecha_inicio: fecha }, actor); toast('Caja creada', 'success'); onSaved(c.id); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); setSaving(false); }
  }
  return (
    <Modal title="Nueva caja / cierre" size="md" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={saving}>Crear</button></>}>
      <div className="form-grid">
        <div className="form-row"><label>Número</label><input className="input" name="nc-numero" defaultValue={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Caja #13" /></div>
        <div className="form-row"><label>Fecha de inicio</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
      </div>
      <div className="form-row"><label>Nombre (opcional)</label><input className="input" name="nc-nombre" defaultValue={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
      <div className="form-row"><label>Recepción asociada (opcional)</label><input className="input" name="nc-recepcion" defaultValue={recepcion} onChange={(e) => setRecepcion(e.target.value)} placeholder="RECEPCION 69" /></div>
    </Modal>
  );
}

