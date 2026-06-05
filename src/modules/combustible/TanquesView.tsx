import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { ConsumoChartModal } from '@/shared/ui/ConsumoChartModal';
import type {
  CatalogoCombustible,
  ConciliacionCombustible,
  MovimientoTanque,
  TanqueCombustible,
  TipoCatalogoCombustible,
  TipoMovTanque,
} from '@/shared/lib/types';
import {
  listTanques, listCatalogos, listMovimientosTanque, reporteGlobal, listConciliaciones,
  registrarEntrada, registrarUso, registrarTraslado, eliminarMovimientoTanque,
  crearTanque, addCatalogo, setCatalogoActivo, crearConciliacion, consumoPorEquipo,
  type ReporteTanque,
} from './tanques.repository';

export function TanquesView() {
  const { user } = useSession();
  const { can } = usePermissions();
  const canWrite = can('combustible', 'escritura');
  const actor = user?.email ?? 'sistema';
  const { appUser } = usePermissions();
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [tanques, setTanques] = useState<TanqueCombustible[]>([]);
  const [reporte, setReporte] = useState<ReporteTanque[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoCombustible[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'none' | 'mov' | 'tanque' | 'catalogos' | 'conciliacion' | 'consumo'>('none');

  const reloadTanques = useCallback(async () => {
    const [ts, rep, cat] = await Promise.all([listTanques(), reporteGlobal(), listCatalogos()]);
    setTanques(ts);
    setReporte(rep);
    setCatalogos(cat);
    setSelId((prev) => prev || ts[0]?.id || '');
  }, []);

  const reloadMovs = useCallback(async (id: string) => {
    if (!id) { setMovs([]); return; }
    setMovs(await listMovimientosTanque(id));
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reloadTanques().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reloadTanques]);

  useEffect(() => { void reloadMovs(selId); }, [selId, reloadMovs]);

  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos', 'combustible_catalogos', 'combustible_conciliaciones'], () => {
    void reloadTanques();
    void reloadMovs(selId);
  });

  const sel = useMemo(() => tanques.find((t) => t.id === selId) ?? null, [tanques, selId]);
  const totalDisponible = useMemo(() => reporte.reduce((a, r) => a + (Number(r.disponible) || 0), 0), [reporte]);

  async function recargarTodo() { await reloadTanques(); await reloadMovs(selId); }

  return (
    <div>
      <div className="filterbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <div className="muted" style={{ fontSize: '.85rem' }}>
          A la fecha hay <strong className="mono" style={{ color: 'var(--primary-3)' }}>{num(totalDisponible)} L</strong> disponibles en {reporte.length} tanque(s).
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setModal('consumo')}>📊 Consumo por equipo</button>
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('catalogos')}>🗂 Catálogos</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('conciliacion')}>⚖ Conciliación</button>}
          {canWrite && <button className="btn btn-ghost btn-sm" onClick={() => setModal('tanque')}>+ Tanque</button>}
          {canWrite && <button className="btn btn-primary btn-sm" onClick={() => setModal('mov')} disabled={!tanques.length}>+ Nuevo movimiento</button>}
        </div>
      </div>

      {/* Reporte global por tanque */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', margin: '1rem 0 1.25rem' }}>
        {reporte.map((r) => {
          const cap = Number(r.tanque.capacidad_litros) || 0;
          const disp = Number(r.disponible) || 0;
          const pct = cap > 0 ? Math.max(0, Math.min(100, (disp / cap) * 100)) : 0;
          const activo = r.tanque.id === selId;
          return (
            <button key={r.tanque.id} type="button" onClick={() => setSelId(r.tanque.id)} className="card"
              style={{ textAlign: 'left', cursor: 'pointer', borderColor: activo ? 'var(--primary)' : 'var(--border)', borderWidth: activo ? 2 : 1, opacity: r.tanque.estado === 'activo' ? 1 : 0.55 }}>
              <div className="card-title"><span>🛢 {r.tanque.nombre}</span>{r.tanque.estado !== 'activo' && <span className="badge">inactivo</span>}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }} className="mono">{num(disp)} <span style={{ fontSize: '.8rem', fontWeight: 500 }}>L</span></div>
              <div style={{ height: 7, borderRadius: 5, background: 'var(--surface-2)', margin: '.5rem 0', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct < 12 ? 'var(--danger)' : 'var(--primary)' }} />
              </div>
              <div className="muted" style={{ fontSize: '.76rem' }}>
                Cap. {num(cap)} L · Tasa <strong className="mono">{money(r.tanque.tasa_usd_litro)}</strong>/L
              </div>
              <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
                ↓{num(r.entradas)} · ⛽{num(r.uso)} · ↔{num(r.traslados)} L
              </div>
            </button>
          );
        })}
        {!reporte.length && !loading && <div className="card"><p className="muted" style={{ margin: 0 }}>Sin tanques. Creá uno con "+ Tanque".</p></div>}
      </div>

      {/* Libro mayor del tanque seleccionado */}
      {sel && (
        <>
          <div className="page-head" style={{ marginBottom: '.5rem' }}>
            <div><h2 style={{ margin: 0 }}>📒 {sel.nombre}</h2><p className="muted" style={{ margin: 0, fontSize: '.82rem' }}>Saldo: <strong className="mono">{num(sel.saldo_litros)} L</strong> · <strong className="mono">{money(sel.saldo_usd)}</strong> · Tasa {money(sel.tasa_usd_litro)}/L</p></div>
          </div>
          {loading ? <EmptyState message="Cargando…" icon="◔" /> : !movs.length ? (
            <EmptyState message="Sin movimientos en este tanque." icon="🛢" />
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Equipo</th><th>Autorizado</th><th>Ubicación</th><th>Observación</th>
                    <th>HI</th><th>HF</th><th>Hrs</th>
                    <th>Entrada</th><th>Uso</th><th>Traslado</th><th>Saldo L</th>
                    <th>Tasa</th><th>$ Mov.</th><th>Saldo $</th>{canWrite && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{m.fecha}{m.hora ? <div className="muted" style={{ fontSize: '.7rem' }}>{m.hora}</div> : null}</td>
                      <td>{m.equipo || '—'}</td>
                      <td className="muted">{m.autorizado_por || '—'}</td>
                      <td className="muted">{m.ubicacion || '—'}</td>
                      <td className="muted" style={{ maxWidth: 180 }}>{m.observacion || '—'}</td>
                      <td className="mono muted">{m.horometro_ini != null ? num(m.horometro_ini) : '—'}</td>
                      <td className="mono muted">{m.horometro_fin != null ? num(m.horometro_fin) : '—'}</td>
                      <td className="mono muted">{m.horas_utilizadas ? num(m.horas_utilizadas) : '—'}</td>
                      <td className="mono" style={{ color: 'var(--primary-3)' }}>{m.tipo === 'entrada' ? num(m.litros) : ''}</td>
                      <td className="mono" style={{ color: 'var(--danger)' }}>{m.tipo === 'uso' ? num(m.litros) : ''}</td>
                      <td className="mono" style={{ color: 'var(--warning)' }}>{m.tipo === 'traslado' ? num(m.litros) : ''}</td>
                      <td className="mono"><strong>{num(m.saldo_litros)}</strong></td>
                      <td className="mono muted">{money(m.tasa_usd_litro)}</td>
                      <td className="mono">{money(m.monto_usd)}</td>
                      <td className="mono"><strong>{money(m.saldo_usd)}</strong></td>
                      {canWrite && <td><button className="btn btn-sm btn-ghost" title="Eliminar (revierte saldo)" onClick={() => void borrar(m)}>🗑</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modal === 'mov' && sel && (
        <MovimientoModal tanques={tanques.filter((t) => t.estado === 'activo')} tanqueSel={sel} catalogos={catalogos} actor={actor} actorName={actorName}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await recargarTodo(); }} />
      )}
      {modal === 'tanque' && (
        <TanqueModal catalogos={catalogos} actor={actor}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await reloadTanques(); }} />
      )}
      {modal === 'catalogos' && (
        <CatalogosModal catalogos={catalogos} onClose={() => setModal('none')} onChanged={reloadTanques} />
      )}
      {modal === 'conciliacion' && sel && (
        <ConciliacionModal tanque={sel} actor={actor} onClose={() => setModal('none')} />
      )}
      {modal === 'consumo' && (
        <ConsumoChartModal
          title="Consumo de combustible por equipo"
          subtitle="Litros consumidos (movimientos de USO) por equipo. El valor en $ usa la tasa del tanque."
          cargar={async (desde, hasta) => {
            const items = await consumoPorEquipo(desde, hasta);
            return items.map((x) => ({ id: x.id, label: x.nombre, unidad: 'Lt', cantidad: x.cantidad, valor: x.valor }));
          }}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  );

  async function borrar(m: MovimientoTanque) {
    if (!confirm('¿Eliminar este movimiento? Se revertirá el saldo del tanque.')) return;
    try { await eliminarMovimientoTanque(m); await recargarTodo(); toast('Movimiento eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }
}

/* ───────────── Modal: nuevo movimiento ───────────── */

function MovimientoModal({ tanques, tanqueSel, catalogos, actor, actorName, onClose, onSaved }: {
  tanques: TanqueCombustible[]; tanqueSel: TanqueCombustible; catalogos: CatalogoCombustible[];
  actor: string; actorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [tanqueId, setTanqueId] = useState(tanqueSel.id);
  const [tipo, setTipo] = useState<TipoMovTanque>('uso');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState('');
  const [equipo, setEquipo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [litros, setLitros] = useState('');
  const [costo, setCosto] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [hi, setHi] = useState('');
  const [hf, setHf] = useState('');
  const [cgi, setCgi] = useState('');
  const [cgf, setCgf] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const litrosNum = Number(litros) || 0;
    if (litrosNum <= 0) { setError('Indicá los litros.'); return; }
    if (tipo === 'traslado' && destinoId && destinoId === tanqueId) { setError('El tanque destino debe ser distinto.'); return; }
    const campos = {
      fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
      horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
      contadorGlobalIni: cgi === '' ? null : Number(cgi), contadorGlobalFin: cgf === '' ? null : Number(cgf),
    };
    setSaving(true);
    try {
      if (tipo === 'entrada') await registrarEntrada({ tanqueId, litros: litrosNum, costoLitro: Number(costo) || 0, campos, actor, actorName });
      else if (tipo === 'uso') await registrarUso({ tanqueId, litros: litrosNum, campos, actor, actorName });
      else await registrarTraslado({ tanqueId, litros: litrosNum, tanqueDestinoId: destinoId || null, campos, actor, actorName });
      toast('Movimiento registrado', 'success');
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); }
    finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-mov" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar movimiento'}</button>
    </>
  );
  return (
    <Modal title="Nuevo movimiento de tanque" size="lg" onClose={onClose} footer={footer}>
      <form id="tnk-mov" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Tanque</label>
            <select className="select" value={tanqueId} onChange={(e) => setTanqueId(e.target.value)}>
              {tanques.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {num(t.saldo_litros)} L</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Tipo de movimiento</label>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovTanque)}>
              <option value="entrada">⬇ Entrada (entra combustible)</option>
              <option value="uso">⛽ Uso (consumo de equipo)</option>
              <option value="traslado">↔ Traslado (a otra mina/tanque)</option>
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row"><label>Fecha</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></div>
          <div className="form-row"><label>Hora (opcional)</label><input className="input" value={hora} onChange={(e) => setHora(e.target.value)} placeholder="8:02:00 AM" /></div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Litros</label>
            <input className="input mono" type="number" min={0} step="any" value={litros} onChange={(e) => setLitros(e.target.value)} required />
          </div>
          {tipo === 'entrada' && (
            <div className="form-row">
              <label>Costo por litro (USD)</label>
              <input className="input mono" type="number" min={0} step="0.0001" value={costo} onChange={(e) => setCosto(e.target.value)} />
              <small className="muted">Recalcula la tasa promedio del tanque.</small>
            </div>
          )}
          {tipo === 'traslado' && (
            <div className="form-row">
              <label>Tanque destino (opcional)</label>
              <select className="select" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">— otra mina / externo —</option>
                {tanques.filter((t) => t.id !== tanqueId).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <small className="muted">Si es a otro tanque, se acredita allí al costo del origen.</small>
            </div>
          )}
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Equipo</label>
            <input className="input" list="cat-equipos" value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="Elegí o escribí…" />
            <datalist id="cat-equipos">{opts('equipo').map((c) => <option key={c.id} value={c.valor} />)}</datalist>
          </div>
          <div className="form-row">
            <label>Autorizado por</label>
            <input className="input" list="cat-aut" value={autorizado} onChange={(e) => setAutorizado(e.target.value)} placeholder="Elegí o escribí…" />
            <datalist id="cat-aut">{opts('autorizado').map((c) => <option key={c.id} value={c.valor} />)}</datalist>
          </div>
        </div>
        <div className="form-row">
          <label>Ubicación</label>
          <input className="input" list="cat-ubic" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Elegí o escribí…" />
          <datalist id="cat-ubic">{opts('ubicacion').map((c) => <option key={c.id} value={c.valor} />)}</datalist>
        </div>
        <div className="form-row"><label>Observación</label><input className="input" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="SUMINISTRO COMBUSTIBLE…" /></div>
        <details style={{ marginTop: '.4rem' }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Medidores (opcional): horómetro del equipo y contador del surtidor</summary>
          <div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="form-row"><label>Horómetro inicial (HI)</label><input className="input mono" type="number" step="any" value={hi} onChange={(e) => setHi(e.target.value)} /></div>
            <div className="form-row"><label>Horómetro final (HF)</label><input className="input mono" type="number" step="any" value={hf} onChange={(e) => setHf(e.target.value)} /></div>
          </div>
          <div className="form-grid">
            <div className="form-row"><label>Contador global inicial</label><input className="input mono" type="number" step="any" value={cgi} onChange={(e) => setCgi(e.target.value)} /></div>
            <div className="form-row"><label>Contador global final</label><input className="input mono" type="number" step="any" value={cgf} onChange={(e) => setCgf(e.target.value)} /></div>
          </div>
        </details>
      </form>
    </Modal>
  );
}

/* ───────────── Modal: nuevo tanque ───────────── */

function TanqueModal({ catalogos, actor, onClose, onSaved }: {
  catalogos: CatalogoCombustible[]; actor: string; onClose: () => void; onSaved: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [saldo, setSaldo] = useState('');
  const [tasa, setTasa] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { toast('Indicá el nombre', 'error'); return; }
    setSaving(true);
    try {
      await crearTanque({ nombre, capacidadLitros: Number(capacidad) || 0, saldoLitros: Number(saldo) || 0, tasaUsdLitro: Number(tasa) || 0, ubicacion: ubicacion || null, actor });
      toast('Tanque creado', 'success');
      onSaved();
    } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo crear', 'error'); }
    finally { setSaving(false); }
  }
  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="tnk-new" className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear tanque'}</button>
    </>
  );
  return (
    <Modal title="Nuevo tanque" size="md" onClose={onClose} footer={footer}>
      <form id="tnk-new" onSubmit={submit}>
        <div className="form-row"><label>Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tanque #4" /></div>
        <div className="form-grid">
          <div className="form-row"><label>Capacidad (litros)</label><input className="input mono" type="number" min={0} step="any" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} /></div>
          <div className="form-row"><label>Saldo inicial (litros)</label><input className="input mono" type="number" min={0} step="any" value={saldo} onChange={(e) => setSaldo(e.target.value)} /></div>
        </div>
        <div className="form-grid">
          <div className="form-row"><label>Tasa inicial (USD/L)</label><input className="input mono" type="number" min={0} step="0.0001" value={tasa} onChange={(e) => setTasa(e.target.value)} /></div>
          <div className="form-row">
            <label>Ubicación</label>
            <input className="input" list="cat-ubic-new" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Mina Golden touch" />
            <datalist id="cat-ubic-new">{catalogos.filter((c) => c.tipo === 'ubicacion' && c.activo).map((c) => <option key={c.id} value={c.valor} />)}</datalist>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ───────────── Modal: catálogos ───────────── */

function CatalogosModal({ catalogos, onClose, onChanged }: {
  catalogos: CatalogoCombustible[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<TipoCatalogoCombustible>('equipo');
  const [valor, setValor] = useState('');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => catalogos.filter((c) => c.tipo === tab), [catalogos, tab]);
  const TABS: { key: TipoCatalogoCombustible; label: string }[] = [
    { key: 'equipo', label: 'Equipos' }, { key: 'autorizado', label: 'Autorizados' }, { key: 'ubicacion', label: 'Ubicaciones' },
  ];

  async function agregar() {
    if (!valor.trim()) { toast('Indicá el valor', 'error'); return; }
    setBusy(true);
    try { await addCatalogo(tab, valor); setValor(''); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo agregar', 'error'); }
    finally { setBusy(false); }
  }
  async function toggle(id: string, activo: boolean) {
    try { await setCatalogoActivo(id, !activo); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  return (
    <Modal title="Catálogos de combustible" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="view-toggle" role="tablist" style={{ marginBottom: '.75rem' }}>
        {TABS.map((t) => <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
        <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={`Nuevo ${tab}…`} onKeyDown={(e) => { if (e.key === 'Enter') void agregar(); }} />
        <button className="btn btn-primary" onClick={agregar} disabled={busy}>+ Agregar</button>
      </div>
      <div className="table-wrap" style={{ maxHeight: 340, overflow: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead><tr><th>Valor</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {!items.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>Sin elementos.</td></tr>}
            {items.map((c) => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                <td>{c.valor}</td>
                <td>{c.activo ? '🟢 Activo' : '⚪ Inactivo'}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => toggle(c.id, c.activo)}>{c.activo ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ───────────── Modal: conciliación ───────────── */

function ConciliacionModal({ tanque, actor, onClose }: { tanque: TanqueCombustible; actor: string; onClose: () => void }) {
  const [periodo, setPeriodo] = useState('');
  const [reportado, setReportado] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<ConciliacionCombustible[]>([]);
  const libros = Number(tanque.saldo_litros) || 0;
  const dif = libros - (Number(reportado) || 0);

  useEffect(() => { listConciliaciones(tanque.id).then(setHistorial).catch(() => {}); }, [tanque.id]);

  async function guardar() {
    setBusy(true);
    try {
      await crearConciliacion({ tanqueId: tanque.id, periodo: periodo || null, saldoLibros: libros, saldoReportadoMina: Number(reportado) || 0, notas: notas || null, actor });
      toast('Conciliación registrada', 'success');
      setHistorial(await listConciliaciones(tanque.id));
      setReportado(''); setNotas(''); setPeriodo('');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={`Conciliación · ${tanque.nombre}`} size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-grid">
          <div className="form-row"><label>Período</label><input className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Abril 2026" /></div>
          <div className="form-row"><label>Saldo en nuestros libros (L)</label><input className="input mono" value={num(libros)} readOnly /></div>
          <div className="form-row"><label>Saldo reportado por la mina (L)</label><input className="input mono" type="number" step="any" value={reportado} onChange={(e) => setReportado(e.target.value)} /></div>
          <div className="form-row"><label>Diferencia (L)</label><input className="input mono" value={num(dif)} readOnly style={{ color: Math.abs(dif) > 0 ? 'var(--warning)' : 'var(--primary-3)' }} /></div>
        </div>
        <div className="form-row"><label>Notas</label><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={guardar} disabled={busy}>Guardar conciliación</button>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Fecha</th><th>Período</th><th>Libros</th><th>Mina</th><th>Diferencia</th><th>Notas</th></tr></thead>
          <tbody>
            {!historial.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Sin conciliaciones.</td></tr>}
            {historial.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.fecha}</td><td>{c.periodo || '—'}</td>
                <td className="mono">{num(c.saldo_libros)}</td><td className="mono">{num(c.saldo_reportado_mina)}</td>
                <td className="mono" style={{ color: Math.abs(Number(c.diferencia) || 0) > 0 ? 'var(--warning)' : 'inherit' }}>{num(c.diferencia)}</td>
                <td className="muted">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
