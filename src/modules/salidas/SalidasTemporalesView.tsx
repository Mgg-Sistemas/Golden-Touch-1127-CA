/* ============================================================
   Golden Touch · Salidas Temporales · Vista (Kanban + Lista)
   Sacar un material a MANTENIMIENTO y retornarlo al inventario.
   Flujo:  pendiente → (aprobar, firma Leydis/Jesús) en_transito
           → (finalizar) finalizada  (muestra el tiempo en tránsito).
   Se EDITA en cualquier estado (si ya movió inventario, se ajusta la
   diferencia); se ELIMINA solo mientras está 'pendiente'.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect, SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { num, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Existencia, Producto, SalidaTemporal, EstadoSalidaTemporal, EventoHistorial } from '@/shared/lib/types';
import { getCategorias, getUnidades } from '@/modules/inventario/inventario.repository';
import { esCategoriaReal } from '@/modules/inventario/categoriaReal';
import { puedeAprobarOc } from '@/modules/pedidos/aprobadoresOc';
import { TransporteFields, transporteVacio, type TransporteSeleccion } from './TransporteFields';
import {
  listSalidasTemporales, crearSalidaTemporal, editarSalidaTemporal, eliminarSalidaTemporal,
  aprobarSalidaTemporal, finalizarSalidaTemporal, formatDuracion,
  type ItemSalidaTemporalInput,
} from './salidasTemporales.repository';
import { descargarSalidaTemporalPdf } from './salidaTemporalPdf';
import { duracionEntre } from './salidaTemporalAjuste';
import { norm } from '@/shared/lib/texto';

type Vista = 'kanban' | 'lista';

/** Inventario único: el almacén guardado es `'General'`; se muestra «Inventario General». */
const invLabel = (a?: string | null): string => (a && a.trim().toLowerCase() === 'general' ? 'Inventario General' : (a || '—'));

const EST_COLS: { key: EstadoSalidaTemporal; label: string; badge: string }[] = [
  { key: 'pendiente', label: 'Pendiente', badge: 'warning' },
  { key: 'en_transito', label: 'En tránsito', badge: 'info' },
  { key: 'finalizada', label: 'Finalizada', badge: 'success' },
];
const EST_BADGE: Record<EstadoSalidaTemporal, string> = {
  pendiente: 'warning', en_transito: 'info', finalizada: 'success',
};
const EST_LABEL: Record<EstadoSalidaTemporal, string> = {
  pendiente: 'Pendiente', en_transito: 'En tránsito', finalizada: 'Finalizada',
};

interface Props {
  productos: Producto[];
  existencias: Existencia[];
  almacenesList: string[];
  actor: string;
  actorName?: string | null;
  canWrite: boolean;
  userEmail?: string | null;
  userRole?: string | null;
}

export function SalidasTemporalesView({
  productos, existencias, almacenesList, actor, actorName, canWrite, userEmail, userRole,
}: Props) {
  const [items, setItems] = useState<SalidaTemporal[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('kanban');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ open: boolean; edit: SalidaTemporal | null }>({ open: false, edit: null });
  const [traza, setTraza] = useState<SalidaTemporal | null>(null);
  const [aEliminar, setAEliminar] = useState<SalidaTemporal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Reloj vivo: refresca el "tiempo en tránsito" cada minuto.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const puedeAprobar = puedeAprobarOc(userRole, userEmail);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setItems(await listSalidasTemporales()); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar las salidas temporales', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useRealtime(['salidas_temporales'], () => { void reload(); });

  // Histórico buscable por código, solicitante, responsable, material, motivo.
  const filtradas = useMemo(() => {
    const t = norm(q);
    if (!t) return items;
    // Envoltura para campos de cualquier tipo (números, fechas): normaliza igual.
    const txt = (v: unknown) => norm(String(v ?? ''));
    return items.filter((s) =>
      [s.codigo, s.solicitante, s.chofer_nombre, s.motivo, s.unidad_solicitante, EST_LABEL[s.estado]].some((v) => txt(v).includes(t)) ||
      (s.items ?? []).some((it) => txt(it.producto_nombre).includes(t) || txt(it.producto_sku).includes(t)),
    );
  }, [items, q]);

  async function handlePdf(s: SalidaTemporal) {
    try { await descargarSalidaTemporalPdf(s); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  }
  async function handleAprobar(s: SalidaTemporal) {
    setBusyId(s.id);
    try {
      await aprobarSalidaTemporal(s, { actor, actorName, aprobadorEmail: userEmail ?? actor, aprobadorNombre: actorName });
      notify(`Salida temporal ${s.codigo} aprobada · material a mantenimiento`, 'success');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo aprobar', 'error'); }
    finally { setBusyId(null); }
  }
  async function handleFinalizar(s: SalidaTemporal) {
    setBusyId(s.id);
    try {
      await finalizarSalidaTemporal(s, { actor, actorName });
      notify(`Salida temporal ${s.codigo} finalizada · material retornado al inventario`, 'success');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo finalizar', 'error'); }
    finally { setBusyId(null); }
  }
  async function confirmarEliminar() {
    const s = aEliminar;
    if (!s) return;
    setBusyId(s.id);
    try {
      await eliminarSalidaTemporal(s);
      notify(`Salida temporal ${s.codigo} eliminada`, 'success');
      setAEliminar(null);
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
    finally { setBusyId(null); }
  }

  const cardProps = {
    now, canWrite, puedeAprobar, busyId,
    onPdf: handlePdf, onTraza: setTraza,
    onAprobar: handleAprobar, onFinalizar: handleFinalizar,
    onModificar: (s: SalidaTemporal) => setForm({ open: true, edit: s }),
    onEliminar: setAEliminar,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Salidas Temporales</h1>
          <p className="muted hint">Sacá un material a <strong>mantenimiento</strong> y retornalo al inventario. Se crea <strong>pendiente</strong>, se <strong>aprueba</strong> (firma) y sale del stock; al <strong>finalizar</strong> el material vuelve y se registra el tiempo que estuvo afuera.</p>
        </div>
        <div className="actions">
          {canWrite && <button className="btn btn-primary" onClick={() => setForm({ open: true, edit: null })}>＋ Nueva salida temporal</button>}
        </div>
      </div>

      <div className="view-toggle" role="tablist" aria-label="Kanban o lista" style={{ marginBottom: '1rem' }}>
        <button className={vista === 'kanban' ? 'active' : ''} onClick={() => setVista('kanban')}>🗂 Kanban</button>
        <button className={vista === 'lista' ? 'active' : ''} onClick={() => setVista('lista')}>📜 Histórico</button>
      </div>

      {/* Buscador (histórico) */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.8rem' }}>
        <div style={{ position: 'relative' }}>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar (código, solicitante, responsable, material, motivo…)" style={{ width: 320, paddingRight: q ? '1.6rem' : undefined }} />
          {q && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQ('')} title="Limpiar"
            style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>}
        </div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '.8rem' }}>{filtradas.length} salida(s) temporal(es)</span>
      </div>

      {loading ? (
        <EmptyState message="Cargando…" icon="◔" />
      ) : vista === 'kanban' ? (
        !filtradas.length ? (
          <EmptyState message="No hay salidas temporales. Creá la primera con el botón de arriba." icon="🔧" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.75rem' }}>
            {EST_COLS.map((col) => {
              const cols = filtradas.filter((s) => s.estado === col.key);
              return (
                <div key={col.key} className="card" style={{ margin: 0, padding: '.6rem', background: 'var(--bg-1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                    <strong style={{ fontSize: '.85rem' }}>{col.label}</strong>
                    <span className={`badge ${col.badge}`}>{cols.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', maxHeight: '68vh', overflowY: 'auto', paddingRight: cols.length > 3 ? '.2rem' : 0 }}>
                    {cols.map((s) => <SalidaTempCard key={s.id} s={s} {...cardProps} />)}
                    {!cols.length && <div className="muted" style={{ fontSize: '.74rem', padding: '.25rem' }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        !filtradas.length ? (
          <EmptyState message="Sin salidas temporales en el histórico." icon="🔧" />
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead>
                <tr>
                  <th>Código</th><th>Estado</th><th>Solicitante</th><th>Responsable</th>
                  <th>Material(es)</th><th>Motivo</th><th>Fecha</th><th>Tiempo</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.codigo}</td>
                    <td><span className={`badge ${EST_BADGE[s.estado]}`}>{EST_LABEL[s.estado]}</span></td>
                    <td>{s.solicitante}{s.unidad_solicitante ? <div className="muted" style={{ fontSize: '.7rem' }}>{s.unidad_solicitante}</div> : null}</td>
                    <td>{s.chofer_nombre || '—'}</td>
                    <td>{resumenItems(s)}</td>
                    <td className="muted" style={{ fontSize: '.78rem' }}>{s.motivo || '—'}</td>
                    <td className="muted" style={{ fontSize: '.78rem' }}>{date(s.fecha ?? s.created_at)}</td>
                    <td className="mono" style={{ fontSize: '.78rem' }}>{tiempoDe(s, now)}</td>
                    <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                      {canWrite && <button className="btn btn-sm btn-ghost" title="Editar" onClick={() => setForm({ open: true, edit: s })}>✎</button>}
                      <button className="btn btn-sm btn-ghost" onClick={() => void handlePdf(s)}>📄 PDF</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setTraza(s)}>🧾</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {form.open && (
        <SalidaTemporalForm
          edit={form.edit}
          productos={productos} existencias={existencias} almacenesList={almacenesList}
          actor={actor} actorName={actorName}
          onClose={() => setForm({ open: false, edit: null })}
          onSaved={() => { setForm({ open: false, edit: null }); void reload(); }}
        />
      )}
      {traza && <TrazabilidadModal s={traza} onClose={() => setTraza(null)} />}
      {aEliminar && (
        <ConfirmDialog title="Eliminar salida temporal" confirmText="Eliminar" danger
          message={`Se eliminará la salida temporal ${aEliminar.codigo}. Solo se puede eliminar mientras está pendiente (sin aprobar). ¿Continuar?`}
          onCancel={() => setAEliminar(null)} onConfirm={() => void confirmarEliminar()} />
      )}
    </div>
  );
}

/* ───────── Helpers de presentación ───────── */
/** ISO → valor de <input type="datetime-local"> en la hora local ('' si no hay). */
function aLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Valor de <input type="datetime-local"> (hora local) → ISO. */
function aIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function resumenItems(s: SalidaTemporal): string {
  const its = s.items ?? [];
  if (!its.length) return '—';
  const first = its[0];
  const nombre = `${num(Number(first.cantidad) || 0)} ${first.unidad ?? ''} · ${first.producto_nombre}`.trim();
  return its.length > 1 ? `${nombre} +${its.length - 1} más` : nombre;
}
/** Tiempo en tránsito (vivo si sigue en tránsito, fijo si finalizada). */
function tiempoDe(s: SalidaTemporal, now: number): string {
  if (s.estado === 'finalizada') return formatDuracion(s.duracion_min);
  if (s.estado === 'en_transito' && s.en_transito_en) {
    return formatDuracion(Math.round((now - new Date(s.en_transito_en).getTime()) / 60000));
  }
  return '—';
}

/* ───────── Tarjeta del kanban ───────── */
function SalidaTempCard({
  s, now, canWrite, puedeAprobar, busyId,
  onPdf, onTraza, onAprobar, onFinalizar, onModificar, onEliminar,
}: {
  s: SalidaTemporal; now: number; canWrite: boolean; puedeAprobar: boolean; busyId: string | null;
  onPdf: (s: SalidaTemporal) => void; onTraza: (s: SalidaTemporal) => void;
  onAprobar: (s: SalidaTemporal) => void; onFinalizar: (s: SalidaTemporal) => void;
  onModificar: (s: SalidaTemporal) => void; onEliminar: (s: SalidaTemporal) => void;
}) {
  const busy = busyId === s.id;
  return (
    <div className="card" style={{ margin: 0, padding: '.6rem .7rem', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
        <span className="mono" style={{ fontSize: '.74rem', color: 'var(--primary-3)' }}>{s.codigo}</span>
        <span className={`badge ${EST_BADGE[s.estado]}`} style={{ fontSize: '.62rem' }}>{EST_LABEL[s.estado]}</span>
      </div>
      <div style={{ fontSize: '.82rem', fontWeight: 600, marginTop: '.2rem' }}>{resumenItems(s)}</div>
      <div className="muted" style={{ fontSize: '.74rem', marginTop: '.15rem' }}>
        👤 {s.solicitante}{s.unidad_solicitante ? ` · ${s.unidad_solicitante}` : ''}
      </div>
      {s.chofer_nombre && <div className="muted" style={{ fontSize: '.72rem' }}>🚚 {s.chofer_nombre}{s.vehiculo_placa ? ` · ${s.vehiculo_placa}` : ''}</div>}
      {s.motivo && <div className="muted" style={{ fontSize: '.72rem', marginTop: '.1rem' }}>📝 {s.motivo}</div>}
      <div className="muted" style={{ fontSize: '.68rem', marginTop: '.2rem' }}>📅 {date(s.fecha ?? s.created_at)}</div>

      {s.estado === 'en_transito' && (
        <div style={{ fontSize: '.72rem', marginTop: '.3rem', color: 'var(--info, #38bdf8)', fontWeight: 600 }}>
          ⏱ En tránsito desde {dateTime(s.en_transito_en)} · {tiempoDe(s, now)}
        </div>
      )}
      {s.estado === 'finalizada' && (
        <div style={{ fontSize: '.72rem', marginTop: '.3rem', color: 'var(--success)', fontWeight: 600 }}>
          ✓ Tiempo en tránsito/mantenimiento: {formatDuracion(s.duracion_min)}
        </div>
      )}

      <div className="actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginTop: '.5rem' }}>
        {canWrite && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onModificar(s)}>✎ Editar</button>
        )}
        {s.estado === 'pendiente' && canWrite && (
          <>
            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => onEliminar(s)}>🗑 Eliminar</button>
            {puedeAprobar && (
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onAprobar(s)}>{busy ? '…' : '✔ Aprobar'}</button>
            )}
          </>
        )}
        {s.estado === 'en_transito' && canWrite && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onFinalizar(s)}>{busy ? '…' : '✔ Finalizar (retornar al inventario)'}</button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => onPdf(s)}>📄 PDF</button>
        <button className="btn btn-sm btn-ghost" onClick={() => onTraza(s)}>🧾 Trazabilidad</button>
      </div>
    </div>
  );
}

/* ───────── Trazabilidad ───────── */
function TrazabilidadModal({ s, onClose }: { s: SalidaTemporal; onClose: () => void }) {
  const eventos = [...(s.historial ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1));
  const labelEvento: Record<string, string> = {
    creada: 'Creada', editada: 'Editada', edicion_revertida: 'Edición revertida (no se pudo ajustar el inventario)', aprobada: 'Aprobada (salió a mantenimiento)', finalizada: 'Finalizada (retornó al inventario)',
  };
  return (
    <Modal title={`🧾 Trazabilidad · ${s.codigo}`} size="md" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <div className="card" style={{ padding: '.6rem .75rem', background: 'var(--bg-1)', marginBottom: '.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
          <span className="mono">{s.codigo}</span>
          <span className={`badge ${EST_BADGE[s.estado]}`}>{EST_LABEL[s.estado]}</span>
        </div>
        <div className="muted" style={{ fontSize: '.8rem', marginTop: '.3rem' }}>
          Solicitante: <strong>{s.solicitante}</strong>{s.unidad_solicitante ? ` · ${s.unidad_solicitante}` : ''}
        </div>
        {s.chofer_nombre && <div className="muted" style={{ fontSize: '.8rem' }}>Responsable: {s.chofer_nombre}{s.chofer_cedula ? ` · C.I. ${s.chofer_cedula}` : ''}</div>}
        {(s.direccion_despacho || s.direccion_destino) && (
          <div className="muted" style={{ fontSize: '.8rem' }}>{s.direccion_despacho || '—'} → {s.direccion_destino || 'MANTENIMIENTO'}</div>
        )}
        {s.motivo && <div className="muted" style={{ fontSize: '.8rem' }}>Motivo: {s.motivo}</div>}
        {s.aprobada_por && <div className="muted" style={{ fontSize: '.8rem' }}>Aprobó: {s.aprobada_por_nombre || s.aprobada_por}{s.aprobada_en ? ` · ${dateTime(s.aprobada_en)}` : ''}</div>}
        {s.estado === 'finalizada' && <div className="muted" style={{ fontSize: '.8rem' }}>Tiempo en tránsito/mantenimiento: <strong>{formatDuracion(s.duracion_min)}</strong></div>}
      </div>

      <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.2rem 0 .4rem' }}>
        Materiales
      </label>
      <div className="table-wrap" style={{ marginBottom: '.75rem' }}>
        <table className="table" style={{ fontSize: '.8rem' }}>
          <thead><tr><th>Material</th><th>Almacén</th><th className="num">Cantidad</th></tr></thead>
          <tbody>
            {(s.items ?? []).map((it, i) => (
              <tr key={i}>
                <td>{it.producto_nombre}{it.es_nuevo ? <span className="badge" style={{ marginLeft: '.35rem', fontSize: '.6rem' }}>NUEVO</span> : null}{it.producto_sku ? <div className="muted mono" style={{ fontSize: '.68rem' }}>{it.producto_sku}</div> : null}</td>
                <td className="muted">{invLabel(it.almacen)}</td>
                <td className="num mono">{num(Number(it.cantidad) || 0)} {it.unidad ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.2rem 0 .4rem' }}>
        Historial
      </label>
      {!eventos.length ? (
        <div className="muted" style={{ fontSize: '.82rem' }}>Sin eventos registrados.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {eventos.map((ev, i) => {
            const meta = ev as EventoHistorial & { firma?: string; duracion_min?: number };
            return (
              <div key={i} className="card" style={{ padding: '.45rem .6rem', margin: 0, background: 'var(--bg-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '.82rem' }}>{labelEvento[ev.evento] ?? ev.evento}</strong>
                  <span className="muted mono" style={{ fontSize: '.72rem' }}>{dateTime(ev.at)}</span>
                </div>
                <div className="muted" style={{ fontSize: '.74rem' }}>
                  Por: {ev.actor}
                  {meta.firma ? ` · firma: ${meta.firma === 'leydis' ? 'Leydis Rengel' : 'Jesús Lozada'}` : ''}
                  {typeof meta.duracion_min === 'number' ? ` · duración: ${formatDuracion(meta.duracion_min)}` : ''}
                  {typeof (meta as { ajustes?: number }).ajustes === 'number' ? ` · ${(meta as { ajustes?: number }).ajustes} ajuste(s) de inventario` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ───────── Formulario (crear / modificar) ───────── */
interface Renglon {
  key: number;
  esNuevo: boolean;
  // material existente
  productoKey: string;         // `${producto_id}|${almacen}`
  producto_id: string | null;
  producto_nombre: string;
  producto_sku: string | null;
  unidad: string | null;
  almacen: string | null;
  // material nuevo
  nombre: string;
  categoria: string;
  unidadNueva: string;
  // común
  cantidad: string;
  observacion: string;
}

function renglonVacio(key: number): Renglon {
  return {
    key, esNuevo: false, productoKey: '', producto_id: null, producto_nombre: '', producto_sku: null,
    unidad: null, almacen: null, nombre: '', categoria: '', unidadNueva: '', cantidad: '1', observacion: '',
  };
}

function SalidaTemporalForm({
  edit, productos, existencias, almacenesList, actor, actorName, onClose, onSaved,
}: {
  edit: SalidaTemporal | null;
  productos: Producto[];
  existencias: Existencia[];
  almacenesList: string[];
  actor: string;
  actorName?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const almacenes = almacenesList.length ? almacenesList : ['General'];
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  useEffect(() => {
    getCategorias(productos).then(setCategorias).catch(() => setCategorias([]));
    getUnidades(productos).then(setUnidades).catch(() => setUnidades([]));
  }, [productos]);

  // Opciones de material EXISTENTE (con stock) para sacar del inventario.
  const activos = useMemo(() => new Map(productos.filter((p) => p.estado === 'activo').map((p) => [p.id, p])), [productos]);
  const exMap = useMemo(() => {
    const m = new Map<string, Existencia>();
    existencias.forEach((e) => m.set(`${e.producto_id}|${e.almacen}`, e));
    return m;
  }, [existencias]);
  // Lo que esta salida YA sacó del inventario (en tránsito o finalizada), por producto|almacén:
  // al editar, eso también está disponible para ella.
  const movioInventario = !!edit && edit.estado !== 'pendiente';
  const yaAfuera = useMemo(() => {
    const m = new Map<string, number>();
    if (!edit || edit.estado !== 'en_transito') return m;
    (edit.items ?? []).forEach((it) => {
      if (!it.producto_id || it.es_nuevo || !it.almacen) return;
      const k = `${it.producto_id}|${it.almacen}`;
      m.set(k, (m.get(k) ?? 0) + (Number(it.cantidad) || 0));
    });
    return m;
  }, [edit]);
  /** Máximo que puede llevar un renglón. En una finalizada lo que sale también retornó: no hay tope. */
  const disponiblePara = (pk: string): number =>
    edit?.estado === 'finalizada' ? Infinity : (Number(exMap.get(pk)?.stock) || 0) + (yaAfuera.get(pk) ?? 0);
  const opcionesExistentes = useMemo(() => {
    const opts = existencias
      .filter((e) => (Number(e.stock) || 0) > 0 && activos.has(e.producto_id))
      .map((e) => {
        const p = activos.get(e.producto_id)!;
        return { value: `${e.producto_id}|${e.almacen}`, label: `${p.nombre} · ${p.sku} (${num(Number(e.stock) || 0)})`, nombre: p.nombre };
      });
    // Los materiales de la salida que se edita siguen elegibles aunque hoy tengan stock 0 (están afuera).
    (edit?.items ?? []).forEach((it) => {
      if (!it.producto_id || it.es_nuevo) return;
      const value = `${it.producto_id}|${it.almacen ?? ''}`;
      if (opts.some((o) => o.value === value)) return;
      opts.push({ value, label: `${it.producto_nombre}${it.producto_sku ? ` · ${it.producto_sku}` : ''} (en esta salida)`, nombre: it.producto_nombre ?? '' });
    });
    return opts.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [existencias, activos, edit]);

  const [seq, setSeq] = useState(1);
  const [renglones, setRenglones] = useState<Renglon[]>(() => {
    if (edit && edit.items?.length) {
      let k = 0;
      return edit.items.map((it) => {
        k += 1;
        if (it.es_nuevo || !it.producto_id) {
          // Un material nuevo ya dado de alta conserva su ficha (producto_id): no se crea otra.
          return {
            ...renglonVacio(k), esNuevo: true, producto_id: it.producto_id ?? null, producto_sku: it.producto_sku ?? null,
            nombre: it.producto_nombre ?? '', unidadNueva: it.unidad ?? '', almacen: it.almacen ?? null,
            cantidad: String(Number(it.cantidad) || 0), observacion: it.observacion ?? '',
          };
        }
        return {
          ...renglonVacio(k), esNuevo: false, productoKey: `${it.producto_id}|${it.almacen ?? ''}`,
          producto_id: it.producto_id, producto_nombre: it.producto_nombre ?? '', producto_sku: it.producto_sku ?? null,
          unidad: it.unidad ?? null, almacen: it.almacen ?? null, cantidad: String(Number(it.cantidad) || 0), observacion: it.observacion ?? '',
        };
      });
    }
    return [renglonVacio(1)];
  });
  useEffect(() => { setSeq(renglones.length + 1); /* solo al montar */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [solicitante, setSolicitante] = useState(edit?.solicitante ?? actorName ?? '');
  const [unidadSolic, setUnidadSolic] = useState(edit?.unidad_solicitante ?? '');
  const [motivo, setMotivo] = useState(edit?.motivo ?? '');
  const [fecha, setFecha] = useState(edit?.fecha ?? new Date().toISOString().slice(0, 10));
  const [transporte, setTransporte] = useState<TransporteSeleccion>(() => edit ? {
    choferId: edit.chofer_id ?? null, choferNombre: edit.chofer_nombre ?? null, choferCedula: edit.chofer_cedula ?? null,
    vehiculoId: edit.vehiculo_id ?? null, vehiculoDescripcion: edit.vehiculo_descripcion ?? null, vehiculoPlaca: edit.vehiculo_placa ?? null,
    direccionDespacho: edit.direccion_despacho ?? '', direccionDestino: edit.direccion_destino ?? '',
  } : transporteVacio());
  const [enTransitoEn, setEnTransitoEn] = useState(() => aLocal(edit?.en_transito_en));
  const [finalizadaEn, setFinalizadaEn] = useState(() => aLocal(edit?.finalizada_en));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Cambiar entre «del inventario» y «nuevo» empieza el renglón de cero (conserva cantidad y observación). */
  function cambiarOrigen(r: Renglon, esNuevo: boolean) {
    if (r.esNuevo === esNuevo) return;
    setRenglon(r.key, { ...renglonVacio(r.key), esNuevo, cantidad: r.cantidad, observacion: r.observacion });
  }

  function setRenglon(key: number, patch: Partial<Renglon>) {
    setRenglones((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addRenglon() { setRenglones((ls) => [...ls, renglonVacio(seq)]); setSeq((s) => s + 1); }
  function quitarRenglon(key: number) { setRenglones((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls)); }

  function elegirExistente(key: number, pk: string) {
    const [pid, alm] = pk.split('|');
    const p = activos.get(pid);
    const ex = exMap.get(pk);
    setRenglon(key, {
      productoKey: pk, producto_id: pid, producto_nombre: p?.nombre ?? '', producto_sku: p?.sku ?? null,
      unidad: p?.unidad ?? null, almacen: alm,
      cantidad: ex ? String(Math.min(Number(ex.stock) || 0, Number(renglones.find((r) => r.key === key)?.cantidad) || 1) || 1) : '1',
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!solicitante.trim()) { setError('Indicá quién hace la solicitud.'); return; }

    const itemsInput: ItemSalidaTemporalInput[] = [];
    for (const r of renglones) {
      const cant = Number(r.cantidad) || 0;
      if (r.esNuevo) {
        if (!r.nombre.trim()) {
          if (cant > 0) { setError('Indicá el nombre del material nuevo.'); return; }
          continue; // renglón vacío: se ignora
        }
        if (cant <= 0) { setError(`Poné una cantidad mayor que 0 para «${r.nombre.trim()}».`); return; }
        if (r.producto_id) {
          // Ya dado de alta en una edición anterior: se conserva la ficha.
          itemsInput.push({
            producto_id: r.producto_id,
            producto_nombre: r.nombre.trim(),
            producto_sku: r.producto_sku,
            unidad: r.unidadNueva.trim() || 'UND',
            cantidad: cant,
            almacen: r.almacen || almacenes[0],
            es_nuevo: true,
            observacion: r.observacion.trim() || null,
          });
          continue;
        }
        if (!esCategoriaReal(r.categoria)) { setError(`Elegí la categoría de «${r.nombre.trim()}». GENERAL ya no es una categoría.`); return; }
        itemsInput.push({
          producto_nombre: r.nombre.trim(),
          unidad: r.unidadNueva.trim() || 'UND',
          cantidad: cant,
          almacen: r.almacen || almacenes[0],
          es_nuevo: true,
          categoria: r.categoria.trim().toUpperCase(),
          observacion: r.observacion.trim() || null,
        });
      } else {
        if (!r.producto_id) {
          if (cant > 1 || r.observacion.trim()) { setError('Elegí el material en cada renglón (o quitá el renglón vacío).'); return; }
          continue; // renglón sin material: se ignora
        }
        if (cant <= 0) { setError(`Poné una cantidad mayor que 0 para «${r.producto_nombre}».`); return; }
        const disponible = disponiblePara(r.productoKey);
        if (Number.isFinite(disponible) && cant > disponible) { setError(`No hay stock suficiente de ${r.producto_nombre} en ${invLabel(r.almacen)}. Disponible: ${num(disponible)}.`); return; }
        itemsInput.push({
          producto_id: r.producto_id,
          producto_nombre: r.producto_nombre,
          producto_sku: r.producto_sku,
          unidad: r.unidad,
          cantidad: cant,
          almacen: r.almacen,
          es_nuevo: false,
          observacion: r.observacion.trim() || null,
        });
      }
    }
    if (!itemsInput.length) { setError('Agregá al menos un material con cantidad.'); return; }
    if (movioInventario && !enTransitoEn) { setError('Indicá desde cuándo está en tránsito.'); return; }
    if (edit?.estado === 'finalizada') {
      if (!finalizadaEn) { setError('Indicá cuándo retornó al inventario.'); return; }
      if (new Date(finalizadaEn).getTime() < new Date(enTransitoEn).getTime()) { setError('El retorno no puede ser anterior a la salida.'); return; }
    }

    setSaving(true);
    try {
      const base = {
        items: itemsInput,
        solicitante: solicitante.trim(),
        unidadSolicitante: unidadSolic.trim() || null,
        motivo: motivo.trim() || null,
        fecha: fecha || null,
        choferId: transporte.choferId, choferNombre: transporte.choferNombre, choferCedula: transporte.choferCedula,
        vehiculoId: transporte.vehiculoId, vehiculoDescripcion: transporte.vehiculoDescripcion, vehiculoPlaca: transporte.vehiculoPlaca,
        direccionDespacho: transporte.direccionDespacho || null,
        direccionDestino: transporte.direccionDestino || null,
        actor,
      };
      if (edit) {
        await editarSalidaTemporal(edit, {
          ...base,
          actorName,
          ...(movioInventario ? { enTransitoEn: aIso(enTransitoEn) } : {}),
          ...(edit.estado === 'finalizada' ? { finalizadaEn: aIso(finalizadaEn) } : {}),
        });
        notify(`Salida temporal ${edit.codigo} actualizada${movioInventario ? ' · inventario ajustado a los cambios' : ''}`, 'success');
      } else {
        const nueva = await crearSalidaTemporal({ ...base, actorName });
        notify(`Salida temporal creada: ${nueva.codigo} · queda pendiente de aprobación`, 'success');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
      <button type="submit" form="salida-temp-form" className="btn btn-primary" disabled={saving}>
        {saving ? 'Guardando…' : (edit ? 'Guardar cambios' : 'Crear salida temporal')}
      </button>
    </>
  );

  return (
    <Modal title={edit ? `Editar salida temporal ${edit.codigo} · ${EST_LABEL[edit.estado]}` : 'Nueva salida temporal'} size="lg" onClose={onClose} footer={footer}>
      <form id="salida-temp-form" onSubmit={handleSubmit}>
        {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}

        <div className="card" style={{ padding: '.55rem .75rem', background: 'var(--bg-1)', marginBottom: '.75rem', borderColor: movioInventario ? 'var(--warning, #f59e0b)' : undefined }}>
          <span className="muted" style={{ fontSize: '.8rem' }}>
            {movioInventario ? (
              <>Esta salida <strong>ya movió inventario</strong> ({edit?.estado === 'finalizada' ? 'salió y retornó' : 'el material está afuera'}). Si cambiás materiales o cantidades, el inventario se <strong>ajusta solo por la diferencia</strong> y queda en el kardex.</>
            ) : (
              <>El N° correlativo (<strong>ST-001…</strong>) se asigna solo al guardar. El material sale del inventario al <strong>aprobar</strong> y retorna al <strong>finalizar</strong>.</>
            )}
          </span>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Solicitante</label>
            <input className="input" value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Quién hace la solicitud" />
          </div>
          <div className="form-row">
            <label>Unidad solicitante</label>
            <input className="input" value={unidadSolic} onChange={(e) => setUnidadSolic(e.target.value.toUpperCase())} placeholder="Departamento / unidad" />
          </div>
        </div>

        {/* ── Materiales ── */}
        <label style={{ display: 'block', fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600, margin: '.5rem 0 .35rem' }}>
          Materiales
        </label>
        {renglones.map((r, idx) => {
          const stock = r.productoKey ? disponiblePara(r.productoKey) : 0;
          const excede = !r.esNuevo && !!r.producto_id && Number.isFinite(stock) && (Number(r.cantidad) || 0) > stock;
          return (
            <div key={r.key} className="card" style={{ margin: '0 0 .5rem', padding: '.6rem .7rem', background: 'var(--bg-1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                <div className="view-toggle" role="tablist" aria-label="Origen del material" style={{ margin: 0 }}>
                  <button type="button" className={!r.esNuevo ? 'active' : ''} onClick={() => cambiarOrigen(r, false)}>📦 Del inventario</button>
                  <button type="button" className={r.esNuevo ? 'active' : ''} onClick={() => cambiarOrigen(r, true)}>✨ Material nuevo</button>
                </div>
                {renglones.length > 1 && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} title="Quitar material" onClick={() => quitarRenglon(r.key)}>✕</button>
                )}
              </div>

              {!r.esNuevo ? (
                <div className="form-grid">
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label>Material #{idx + 1}</label>
                    <SearchSelect value={r.productoKey} onChange={(v) => elegirExistente(r.key, v)}
                      placeholder={opcionesExistentes.length ? '🔍 Buscar material con stock…' : '— no hay materiales con stock —'}
                      options={opcionesExistentes.map((o) => ({ value: o.value, label: o.label }))} />
                    {r.producto_id && (Number.isFinite(stock)
                      ? <small className="muted">Disponible: <strong className="mono">{num(stock)} {r.unidad ?? ''}</strong> en {invLabel(r.almacen)}{yaAfuera.get(r.productoKey) ? ' (incluye lo que ya salió con esta salida)' : ''}</small>
                      : <small className="muted">Ya retornó: cambiar la cantidad corrige la salida y el retorno, sin cambiar el stock.</small>)}
                  </div>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label>Cantidad{r.unidad ? ` (${r.unidad})` : ''}</label>
                    <input className="input mono" type="number" min={0} step="any" value={r.cantidad}
                      onChange={(e) => setRenglon(r.key, { cantidad: e.target.value })} />
                    {excede && <small style={{ color: 'var(--danger)' }}>Máximo disponible: {num(stock)} {r.unidad ?? ''}.</small>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-grid">
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Nombre del material nuevo</label>
                      <input className="input" value={r.nombre} readOnly={!!r.producto_id}
                        onChange={(e) => setRenglon(r.key, { nombre: e.target.value.toUpperCase() })} placeholder="Ej. MOTOR DE ARRANQUE" />
                      {r.producto_id && <small className="muted">Ya está dado de alta{r.producto_sku ? ` (${r.producto_sku})` : ''}. Para cambiar el nombre, editalo en Inventario.</small>}
                    </div>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Cantidad</label>
                      <input className="input mono" type="number" min={0} step="any" value={r.cantidad}
                        onChange={(e) => setRenglon(r.key, { cantidad: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-grid" style={{ marginTop: '.5rem' }}>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Categoría *</label>
                      <SearchCreateSelect value={r.categoria} onChange={(v) => setRenglon(r.key, { categoria: v.toUpperCase() })}
                        options={categorias} placeholder="Elegí o escribí una categoría" />
                    </div>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Medida / unidad</label>
                      <SearchSelect value={r.unidadNueva} onChange={(v) => setRenglon(r.key, { unidadNueva: v })}
                        options={unidades.map((u) => ({ value: u, label: u }))} placeholder="Elegí una medida existente" />
                      <small className="muted">Solo medidas existentes.</small>
                    </div>
                  </div>
                  <div className="form-row" style={{ marginTop: '.5rem', marginBottom: 0 }}>
                    <label>Inventario de retorno</label>
                    <input className="input" value="Inventario General" readOnly tabIndex={-1} />
                    <small className="muted">Al finalizar, el material entra al Inventario General.</small>
                  </div>
                </>
              )}

              <div className="form-row" style={{ marginTop: '.5rem', marginBottom: 0 }}>
                <label>Observación (opcional)</label>
                <input className="input" value={r.observacion} onChange={(e) => setRenglon(r.key, { observacion: e.target.value })} placeholder="Detalle del renglón…" />
              </div>
            </div>
          );
        })}
        <button type="button" className="btn btn-sm btn-ghost" onClick={addRenglon} style={{ marginBottom: '.6rem' }}>＋ Agregar material</button>

        <div className="form-grid">
          <div className="form-row">
            <label>Motivo</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del envío a mantenimiento…" />
          </div>
          <div className="form-row">
            <label>Fecha</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        {movioInventario && (
          <div className="form-grid">
            <div className="form-row">
              <label>En tránsito desde</label>
              <input className="input" type="datetime-local" value={enTransitoEn} onChange={(e) => setEnTransitoEn(e.target.value)} />
            </div>
            {edit?.estado === 'finalizada' && (
              <div className="form-row">
                <label>Retornó al inventario</label>
                <input className="input" type="datetime-local" value={finalizadaEn} min={enTransitoEn || undefined} onChange={(e) => setFinalizadaEn(e.target.value)} />
                <small className="muted">El tiempo en tránsito se recalcula: {formatDuracion(duracionEntre(aIso(enTransitoEn), aIso(finalizadaEn)))}.</small>
              </div>
            )}
          </div>
        )}

        {/* Responsable + vehículo + direcciones */}
        <TransporteFields value={transporte} onChange={setTransporte} actor={actor} />
      </form>
    </Modal>
  );
}
