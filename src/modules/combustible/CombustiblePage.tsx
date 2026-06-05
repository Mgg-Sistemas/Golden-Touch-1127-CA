import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { dateTime, money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { getNombresAlmacenes } from '@/modules/inventario/almacenes.repository';
import { DestinoSelect } from '@/modules/salidas/DestinoSelect';
import type { Combustible, SolicitudCombustible } from '@/shared/lib/types';
import {
  listCombustibles,
  listSolicitudesCombustible,
  crearCombustible,
  registrarIngreso,
  renombrarCombustible,
  setEstadoCombustible,
  crearSolicitudCombustible,
  aprobarSolicitudCombustible,
  finalizarSolicitudCombustible,
  cancelarSolicitudCombustible,
  consumoCombustiblePeriodo,
} from './combustible.repository';
import { ConsumoChartModal } from '@/shared/ui/ConsumoChartModal';
import { descargarSolicitudCombustiblePdf } from './combustiblePdf';
import { enviarCombustibleAMultiples } from './enviarCombustible';

type Vista = 'kanban' | 'lista';
const COLS: { key: SolicitudCombustible['estado']; label: string }[] = [
  { key: 'por_aprobar', label: 'Por aprobar' },
  { key: 'aprobada', label: 'Aprobada' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'cancelada', label: 'Cancelada' },
];
const ESTADO_LABEL: Record<string, string> = {
  por_aprobar: '⏳ Por aprobar', aprobada: '✅ Aprobada', finalizada: '🏁 Finalizada', cancelada: '✖ Cancelada',
};

export function CombustiblePage() {
  const { user } = useSession();
  const { can: canPerm, appUser } = usePermissions();
  const canWrite = canPerm('combustible', 'escritura');
  const actor = user?.email ?? 'sistema';
  // Nombre de la persona logueada (no el correo) para precargar "quién solicita".
  const miNombre = appUser?.nombre?.trim() || user?.email || '';

  const [combustibles, setCombustibles] = useState<Combustible[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudCombustible[]>([]);
  const [almacenes, setAlmacenes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('kanban');
  const [modal, setModal] = useState<'none' | 'solicitud' | 'ingreso' | 'gestionar' | 'consumo'>('none');
  const [detalle, setDetalle] = useState<SolicitudCombustible | null>(null);

  const reload = useCallback(async () => {
    const [cs, ss, alms] = await Promise.all([
      listCombustibles(),
      listSolicitudesCombustible(),
      getNombresAlmacenes(),
    ]);
    setCombustibles(cs);
    setSolicitudes(ss);
    setAlmacenes(alms);
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    reload().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reload]);

  // Realtime multiusuario: las solicitudes de combustible se reflejan al instante.
  useRealtime(['combustible_solicitudes'], () => { void reload(); });

  const activos = useMemo(() => combustibles.filter((c) => c.estado === 'activo'), [combustibles]);
  const valorTotal = useMemo(() => combustibles.reduce((a, c) => a + (Number(c.litros) || 0) * (Number(c.costo_litro) || 0), 0), [combustibles]);
  const litrosTotal = useMemo(() => combustibles.reduce((a, c) => a + (Number(c.litros) || 0), 0), [combustibles]);

  const porEstado = useMemo(() => {
    const m: Record<string, SolicitudCombustible[]> = { por_aprobar: [], aprobada: [], finalizada: [], cancelada: [] };
    solicitudes.forEach((s) => { (m[s.estado] ??= []).push(s); });
    return m;
  }, [solicitudes]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>⛽ Combustible</h1>
          <p className="muted">Inventario de combustible y solicitudes de salida. Flujo: Por aprobar → Aprobada → Finalizada (descuenta litros).</p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setModal('consumo')} title="Gráfica de consumo de combustible por tipo">📊 Consumo</button>
          {canWrite && (
            <>
              <button className="btn btn-ghost" onClick={() => setModal('gestionar')}>⛽ Combustibles</button>
              <button className="btn btn-ghost" onClick={() => setModal('ingreso')} disabled={!activos.length}>⬇ Registrar ingreso</button>
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal('solicitud')} disabled={!activos.length}>+ Nueva solicitud de salida</button>
            </>
          )}
        </div>
      </div>

      {/* Tarjetas de inventario */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {combustibles.map((c) => {
          const litros = Number(c.litros) || 0;
          const costo = Number(c.costo_litro) || 0;
          return (
            <div key={c.id} className="card" style={{ opacity: c.estado === 'activo' ? 1 : 0.55 }}>
              <div className="card-title"><span>⛽ {c.nombre}</span>{c.estado !== 'activo' && <span className="badge">inactivo</span>}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }} className="mono">{num(litros)} L</div>
              <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem' }}>
                <div>Costo por litro: <strong className="mono">{money(costo)}</strong></div>
                <div>Valor total: <strong className="mono" style={{ color: 'var(--primary-3)' }}>{money(litros * costo)}</strong></div>
              </div>
            </div>
          );
        })}
        {combustibles.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--primary)' }}>
            <div className="card-title"><span>TOTAL GENERAL</span></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }} className="mono">{num(litrosTotal)} L</div>
            <div className="muted" style={{ fontSize: '.82rem', marginTop: '.4rem' }}>
              Valor: <strong className="mono" style={{ color: 'var(--primary-3)' }}>{money(valorTotal)}</strong>
            </div>
          </div>
        )}
        {!combustibles.length && !loading && (
          <div className="card"><p className="muted" style={{ margin: 0 }}>Sin combustibles. Creá uno con "⛽ Combustibles".</p></div>
        )}
      </div>

      {/* Solicitudes */}
      <div className="filterbar" style={{ justifyContent: 'flex-end' }}>
        <div className="view-toggle" role="tablist" aria-label="Modo de vista">
          <button className={vista === 'kanban' ? 'active' : ''} onClick={() => setVista('kanban')}>▦ Kanban</button>
          <button className={vista === 'lista' ? 'active' : ''} onClick={() => setVista('lista')}>☰ Lista</button>
        </div>
      </div>

      {loading ? (
        <EmptyState message="Cargando…" icon="◔" />
      ) : !solicitudes.length ? (
        <EmptyState message="Sin solicitudes de salida de combustible." icon="⛽" />
      ) : vista === 'kanban' ? (
        <div className="kanban">
          {COLS.map((col) => (
            <div key={col.key} className="kanban-col">
              <div className="kanban-col-head"><strong>{col.label}</strong><span className="badge">{porEstado[col.key]?.length ?? 0}</span></div>
              <div className="kanban-col-body">
                {(porEstado[col.key] ?? []).map((s) => (
                  <div key={s.id} className="card" style={{ margin: 0, cursor: 'pointer' }} onClick={() => setDetalle(s)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}>
                      <strong>{s.codigo}</strong><span className="badge">{num(s.litros)} L</span>
                    </div>
                    <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>
                      ⛽ {s.combustible_nombre} · → {s.destino}
                    </div>
                    <div className="muted" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>Solicita: {s.solicitante}</div>
                  </div>
                ))}
                {!(porEstado[col.key] ?? []).length && <div className="muted" style={{ padding: '.5rem' }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Código</th><th>Combustible</th><th>Solicita</th><th>Destino</th><th>Litros</th><th>Estado</th><th>Creada</th></tr></thead>
            <tbody>
              {solicitudes.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setDetalle(s)}>
                  <td className="mono">{s.codigo}</td>
                  <td>{s.combustible_nombre}</td>
                  <td>{s.solicitante}</td>
                  <td>{s.destino}</td>
                  <td className="mono">{num(s.litros)} L</td>
                  <td>{ESTADO_LABEL[s.estado] ?? s.estado}</td>
                  <td className="muted">{dateTime(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'solicitud' && (
        <SolicitudModal combustibles={activos} almacenes={almacenes} actor={actor} defaultSolicitante={miNombre}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await reload(); }} />
      )}
      {modal === 'ingreso' && (
        <IngresoModal combustibles={activos} almacenes={almacenes} actor={actor}
          onClose={() => setModal('none')} onSaved={async () => { setModal('none'); await reload(); }} />
      )}
      {modal === 'gestionar' && (
        <GestionarModal combustibles={combustibles} almacenes={almacenes} actor={actor}
          onClose={() => setModal('none')} onChanged={reload} />
      )}
      {modal === 'consumo' && (
        <ConsumoChartModal
          title="Consumo de combustible"
          subtitle="Litros consumidos por tipo de combustible (salidas). El valor en $ usa el costo por litro de cada salida."
          cargar={async (desde, hasta) => {
            const items = await consumoCombustiblePeriodo(desde, hasta);
            return items.map((x) => ({ id: x.id, label: x.nombre, unidad: 'Lt', cantidad: x.cantidad, valor: x.valor }));
          }}
          onClose={() => setModal('none')}
        />
      )}
      {detalle && (
        <DetalleModal solicitud={detalle} canWrite={canWrite} actor={actor}
          onClose={() => setDetalle(null)} onChanged={async () => { await reload(); setDetalle(null); }} />
      )}
    </div>
  );
}

/* ───────────── Modales ───────────── */

function SolicitudModal({ combustibles, almacenes, actor, defaultSolicitante, onClose, onSaved }: {
  combustibles: Combustible[]; almacenes: string[]; actor: string; defaultSolicitante: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [combustibleId, setCombustibleId] = useState(combustibles[0]?.id ?? '');
  const [solicitante, setSolicitante] = useState(defaultSolicitante);
  const [destino, setDestino] = useState('');
  const [almacen, setAlmacen] = useState(combustibles[0]?.home_almacen ?? almacenes[0] ?? '');
  const [litros, setLitros] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comb = combustibles.find((c) => c.id === combustibleId) ?? null;
  const litrosNum = Number(litros) || 0;
  const excede = comb ? litrosNum > Number(comb.litros) : false;

  // Al cambiar de combustible, sugerimos su almacén "casa".
  useEffect(() => { if (comb?.home_almacen) setAlmacen(comb.home_almacen); }, [combustibleId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!combustibleId) { setError('Elegí el combustible.'); return; }
    if (litrosNum <= 0) { setError('Indicá los litros solicitados.'); return; }
    if (!solicitante.trim()) { setError('Indicá quién solicita.'); return; }
    if (!almacen.trim()) { setError('Indicá de qué almacén sale.'); return; }
    if (!destino.trim()) { setError('Indicá a dónde va.'); return; }
    setSaving(true);
    try {
      const s = await crearSolicitudCombustible({
        combustibleId, combustibleNombre: comb?.nombre ?? '', solicitante, destino, almacen,
        litros: litrosNum, motivo: motivo.trim() || null, actor,
      });
      notify(`Solicitud de combustible creada: ${s.codigo} · ${num(litrosNum)} L → ${destino}`, 'success', { link: '#/app/combustible' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la solicitud.');
    } finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cmb-sol" className="btn btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear solicitud'}</button>
    </>
  );
  return (
    <Modal title="Nueva solicitud de salida de combustible" size="lg" onClose={onClose} footer={footer}>
      <form id="cmb-sol" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Combustible</label>
            <select className="select" value={combustibleId} onChange={(e) => setCombustibleId(e.target.value)}>
              {!combustibles.length && <option value="">— sin combustibles —</option>}
              {combustibles.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {num(c.litros)} L disp.</option>)}
            </select>
            {comb && <small className="muted">Disponible: <strong className="mono">{num(comb.litros)} L</strong></small>}
          </div>
          <div className="form-row">
            <label>Total de litros solicitados</label>
            <input className="input mono" type="number" min={0} step="any" value={litros} onChange={(e) => setLitros(e.target.value)} required />
            {excede && <small style={{ color: 'var(--warning)' }}>Supera el stock; se validará al finalizar.</small>}
          </div>
        </div>
        <div className="form-row">
          <label>Quién hace la solicitud</label>
          <input className="input" value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nombre de quien solicita" required />
        </div>
        <div className="form-row">
          <label>De qué almacén sale</label>
          <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} required>
            {!almacenes.length && <option value="">— sin almacenes —</option>}
            {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <small className="muted">Al finalizar, los litros salen del stock de este almacén.</small>
        </div>
        <DestinoSelect value={destino} onChange={setDestino} almacenes={almacenes} label="A dónde va ese combustible" />
        <div className="form-row">
          <label>Motivo / detalle (opcional)</label>
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Referencia, equipo, etc." />
        </div>
      </form>
    </Modal>
  );
}

function IngresoModal({ combustibles, almacenes, actor, onClose, onSaved }: {
  combustibles: Combustible[]; almacenes: string[]; actor: string; onClose: () => void; onSaved: () => void;
}) {
  const [combustibleId, setCombustibleId] = useState(combustibles[0]?.id ?? '');
  const [almacen, setAlmacen] = useState(combustibles[0]?.home_almacen ?? almacenes[0] ?? '');
  const [litros, setLitros] = useState('');
  const [costo, setCosto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const litrosNum = Number(litros) || 0;
  const costoNum = Number(costo) || 0;
  const comb = combustibles.find((c) => c.id === combustibleId) ?? null;

  // Al cambiar de combustible, sugerimos su almacén "casa".
  useEffect(() => { if (comb?.home_almacen) setAlmacen(comb.home_almacen); }, [combustibleId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!combustibleId) { setError('Elegí el combustible.'); return; }
    if (!almacen.trim()) { setError('Indicá el almacén del ingreso.'); return; }
    if (litrosNum <= 0) { setError('Indicá los litros que ingresan.'); return; }
    setSaving(true);
    try {
      await registrarIngreso({ combustibleId, almacen, litros: litrosNum, costoLitro: costoNum, actor });
      notify(`Ingreso de combustible: +${num(litrosNum)} L → ${almacen}`, 'success', { link: '#/app/combustible' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el ingreso.');
    } finally { setSaving(false); }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="cmb-ing" className="btn btn-primary" disabled={saving}>{saving ? 'Registrando…' : 'Registrar ingreso'}</button>
    </>
  );
  return (
    <Modal title="Registrar ingreso de combustible" size="md" onClose={onClose} footer={footer}>
      <form id="cmb-ing" onSubmit={submit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Combustible</label>
            <select className="select" value={combustibleId} onChange={(e) => setCombustibleId(e.target.value)}>
              {combustibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Almacén destino</label>
            <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} required>
              {!almacenes.length && <option value="">— sin almacenes —</option>}
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <small className="muted">Entra como ENTRADA al inventario de este almacén.</small>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>Litros que ingresan</label>
            <input className="input mono" type="number" min={0} step="any" value={litros} onChange={(e) => setLitros(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Costo por litro (USD)</label>
            <input className="input mono" type="number" min={0} step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
            <small className="muted">Entra al inventario y recalcula el costo promedio (PMP).</small>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function GestionarModal({ combustibles, almacenes, actor, onClose, onChanged }: {
  combustibles: Combustible[]; almacenes: string[]; actor: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [almacen, setAlmacen] = useState(almacenes[0] ?? '');
  const [litros, setLitros] = useState('');
  const [costo, setCosto] = useState('');
  const [busy, setBusy] = useState(false);
  const [renombrando, setRenombrando] = useState<{ id: string; actual: string } | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');

  async function crear() {
    if (!nombre.trim()) { toast('Indicá el nombre', 'error'); return; }
    if (!almacen.trim()) { toast('Elegí el almacén', 'error'); return; }
    setBusy(true);
    try {
      await crearCombustible({ nombre, almacen, litrosIniciales: Number(litros) || 0, costoLitro: Number(costo) || 0, actorEmail: actor });
      toast(`Combustible "${nombre}" registrado en ${almacen}`, 'success');
      setNombre(''); setLitros(''); setCosto('');
      await onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo crear', 'error'); }
    finally { setBusy(false); }
  }
  function abrirRenombrar(id: string, actual: string) {
    setRenombrando({ id, actual });
    setNuevoNombre(actual);
  }
  async function confirmarRenombrar() {
    if (!renombrando) return;
    const nuevo = nuevoNombre.trim();
    if (!nuevo) { toast('Indicá el nombre', 'error'); return; }
    if (nuevo === renombrando.actual) { setRenombrando(null); return; }
    setBusy(true);
    try {
      await renombrarCombustible(renombrando.id, nuevo);
      setRenombrando(null);
      await onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo renombrar', 'error'); }
    finally { setBusy(false); }
  }
  async function toggleEstado(id: string, estado: string) {
    try { await setEstadoCombustible(id, estado === 'activo' ? 'inactivo' : 'activo'); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }

  return (
    <Modal title="Gestionar combustibles" size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title"><span>Nuevo combustible</span></div>
        <div className="form-grid">
          <div className="form-row"><label>Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Diésel, Gasolina 95…" /></div>
          <div className="form-row">
            <label>Almacén</label>
            <select className="select" value={almacen} onChange={(e) => setAlmacen(e.target.value)} required>
              {!almacenes.length && <option value="">— sin almacenes —</option>}
              {almacenes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-row"><label>Litros iniciales (opcional)</label><input className="input mono" type="number" min={0} step="any" value={litros} onChange={(e) => setLitros(e.target.value)} /></div>
          <div className="form-row"><label>Costo por litro (opcional)</label><input className="input mono" type="number" min={0} step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} /></div>
        </div>
        <small className="muted" style={{ display: 'block', margin: '0 0 .6rem' }}>Se registra primero en el inventario (almacén elegido) y se vincula al módulo de Combustible.</small>
        <button className="btn btn-primary btn-sm" onClick={crear} disabled={busy}>+ Crear combustible</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Combustible</th><th>Litros</th><th>Costo/L</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {!combustibles.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Sin combustibles.</td></tr>}
            {combustibles.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td className="mono">{num(c.litros)} L</td>
                <td className="mono">{money(c.costo_litro)}</td>
                <td>{c.estado === 'activo' ? '🟢 Activo' : '⚪ Inactivo'}</td>
                <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => abrirRenombrar(c.id, c.nombre)}>✎</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleEstado(c.id, c.estado)}>{c.estado === 'activo' ? 'Deshabilitar' : 'Habilitar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {renombrando && (
        <Modal
          title="Renombrar combustible"
          size="md"
          onClose={() => setRenombrando(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRenombrando(null)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarRenombrar} disabled={busy}>Guardar</button>
            </>
          }
        >
          <div className="form-row">
            <label>Nuevo nombre del combustible</label>
            <input
              className="input"
              autoFocus
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirmarRenombrar(); }}
              placeholder="Diésel, Gasolina 95…"
            />
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function DetalleModal({ solicitud, canWrite, actor, onClose, onChanged }: {
  solicitud: SolicitudCombustible; canWrite: boolean; actor: string;
  onClose: () => void; onChanged: () => Promise<void>;
}) {
  const s = solicitud;
  const [busy, setBusy] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);
  const [emails, setEmails] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState('');

  async function aprobar() {
    setBusy(true);
    try { await aprobarSolicitudCombustible(s, actor); notify(`Solicitud ${s.codigo} aprobada`, 'success', { link: '#/app/combustible' }); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo aprobar', 'error'); setBusy(false); }
  }
  async function finalizar() {
    setBusy(true);
    try { await finalizarSolicitudCombustible(s, actor); notify(`Solicitud ${s.codigo} finalizada · -${num(s.litros)} L`, 'success', { link: '#/app/combustible' }); await onChanged(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo finalizar', 'error'); setBusy(false); }
  }
  async function cancelar() {
    const motivo = motivoCancel.trim();
    if (!motivo) { toast('Indicá el motivo de la cancelación', 'error'); return; }
    setBusy(true);
    try {
      await cancelarSolicitudCombustible(s, actor, motivo);
      notify(`Solicitud ${s.codigo} cancelada`, 'info', { link: '#/app/combustible' });
      setCancelOpen(false);
      await onChanged();
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cancelar', 'error'); setBusy(false); }
  }
  async function pdf() {
    try { await descargarSolicitudCombustiblePdf(s); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }
  async function enviarCorreo() {
    const lista = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!lista.length) { toast('Indicá al menos un correo', 'error'); return; }
    setEnviando(true);
    try {
      const { enviados, fallidos } = await enviarCombustibleAMultiples(s, lista);
      toast(`Enviado a: ${enviados.join(', ')}`, 'success');
      if (fallidos.length) toast(`Falló: ${fallidos.map((f) => f.email).join(', ')}`, 'error');
      setCorreoOpen(false); setEmails('');
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo enviar', 'error'); }
    finally { setEnviando(false); }
  }

  const filas: Array<[string, string]> = [
    ['Código', s.codigo],
    ['Combustible', s.combustible_nombre],
    ['Quién solicita', s.solicitante],
    ['Almacén de origen', s.almacen || '—'],
    ['A dónde va', s.destino],
    ['Total de litros', `${num(s.litros)} L`],
    ['Estado', ESTADO_LABEL[s.estado] ?? s.estado],
    ['Motivo', s.motivo || '—'],
    ['Creada', dateTime(s.created_at)],
    ['Aprobada', s.aprobada_en ? `${dateTime(s.aprobada_en)} · ${s.aprobada_por ?? ''}`.trim() : '—'],
    ['Finalizada', s.finalizada_en ? `${dateTime(s.finalizada_en)} · ${s.finalizada_por ?? ''}`.trim() : '—'],
  ];

  return (
    <Modal title={`Solicitud ${s.codigo}`} size="md" onClose={onClose} footer={
      <>
        <button className="btn btn-ghost" onClick={pdf}>↓ PDF</button>
        <button className="btn btn-ghost" onClick={() => setCorreoOpen(true)}>✉ Correo</button>
        {canWrite && s.estado === 'por_aprobar' && <button className="btn btn-primary" onClick={aprobar} disabled={busy}>Aprobar</button>}
        {canWrite && s.estado === 'aprobada' && <button className="btn btn-primary" onClick={finalizar} disabled={busy}>Finalizar (descuenta litros)</button>}
        {canWrite && s.estado !== 'finalizada' && s.estado !== 'cancelada' && <button className="btn btn-danger" onClick={() => setCancelOpen(true)} disabled={busy}>Cancelar</button>}
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </>
    }>
      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.86rem' }}>
          <tbody>{filas.map(([k, v]) => <tr key={k}><td style={{ fontWeight: 600, width: 170 }}>{k}</td><td>{v}</td></tr>)}</tbody>
        </table>
      </div>

      {correoOpen && (
        <Modal title="Enviar solicitud por correo" size="md" onClose={() => !enviando && setCorreoOpen(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCorreoOpen(false)} disabled={enviando}>Cancelar</button>
            <button className="btn btn-primary" onClick={enviarCorreo} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar'}</button>
          </>
        }>
          <div className="form-row">
            <label>Correo(s) destinatario(s)</label>
            <input className="input" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="correo@ejemplo.com, otro@ejemplo.com" autoFocus />
            <small className="muted">Separá varios con coma o espacio. Se adjunta el reporte PDF.</small>
          </div>
        </Modal>
      )}

      {cancelOpen && (
        <Modal title={`Cancelar solicitud ${s.codigo}`} size="md" onClose={() => !busy && setCancelOpen(false)} footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCancelOpen(false)} disabled={busy}>Volver</button>
            <button className="btn btn-danger" onClick={cancelar} disabled={busy}>Confirmar cancelación</button>
          </>
        }>
          <div className="form-row">
            <label>Motivo de la cancelación</label>
            <textarea className="input" rows={3} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} placeholder="Indicá por qué se cancela la solicitud…" autoFocus />
          </div>
        </Modal>
      )}
    </Modal>
  );
}
