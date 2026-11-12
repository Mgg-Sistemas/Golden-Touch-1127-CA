/* ============================================================
   Entregas del almacén para mantenimiento · pantallas de Maquinaria
   (12/11/2026). PC y teléfono usan las mismas piezas:
     · EntregasAlmacenAviso: «📦 N entregas del almacén por registrar».
     · EntregasAlmacenModal: la lista; al tocar una se ve el detalle.
     · DetalleEntrega: qué entregó el almacén (con fotos de la salida) y
       los botones Registrar mantenimiento / Rechazar.
     · RegistrarEntregaForm: qué se hizo, fecha, horómetro, fotos… → bitácora.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import { previewGaleria } from '@/shared/lib/reportePreview';
import { listEquipos, reiniciarMantenimientoDeEquipo, type MaquinariaEquipo } from './maquinariaEquipos.repository';
import { TIPOS_MANTENIMIENTO, etiquetaTipoMant } from './maquinariaMant.repository';
import { nombreCortoEquipo } from './flota';
import {
  errorRegistroEntrega, lineaItem, resumenEntrega, type EntregaAlmacen, type FotoArchivo,
} from './entregasAlmacen';
import {
  MAX_FOTOS_MANTENIMIENTO, listEntregasPendientes, rechazarEntrega, registrarEntrega, subirFotosMantenimiento,
  urlsFotosMantenimiento, urlsFotosSalida,
} from './entregasAlmacen.repository';

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? d);

/** Pendientes + realtime. */
export function useEntregasPendientes(habilitado = true) {
  const [entregas, setEntregas] = useState<EntregaAlmacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const cargar = useCallback(async () => {
    if (!habilitado) { setCargando(false); return; }
    try { setEntregas(await listEntregasPendientes()); }
    catch { /* sin permiso o sin red: el aviso simplemente no sale */ }
    finally { setCargando(false); }
  }, [habilitado]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['maquinaria_entregas_almacen'], () => { void cargar(); }, { enabled: habilitado });
  return { entregas, cargando, recargar: cargar };
}

/** Miniaturas de fotos (de la salida o del mantenimiento); al tocar, vista previa en galería. */
export function FotosMiniatura({ fotos, origen, etiqueta }: { fotos: FotoArchivo[]; origen: 'salida' | 'mantenimiento'; etiqueta?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const clave = fotos.map((f) => f.path).join('|');
  useEffect(() => {
    let vivo = true;
    if (!fotos.length) { setUrls({}); return; }
    (origen === 'salida' ? urlsFotosSalida(fotos) : urlsFotosMantenimiento(fotos)).then((u) => { if (vivo) setUrls(u); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, origen]);
  if (!fotos.length) return null;
  const items = fotos.map((f) => ({ url: urls[f.path] ?? '', filename: f.filename, etiqueta }));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
      {fotos.map((f, i) => (
        <button key={f.path} type="button" title={`Ver ${f.filename}`} aria-label={`Ver foto ${f.filename}`}
          onClick={() => previewGaleria(items, i)} disabled={!urls[f.path]}
          style={{ width: 64, height: 64, padding: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-1)', cursor: 'pointer' }}>
          {urls[f.path]
            ? <img src={urls[f.path]} alt={f.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span className="muted" style={{ fontSize: '.7rem' }}>…</span>}
        </button>
      ))}
    </div>
  );
}

/** Aviso destacado de entregas pendientes (no sale si no hay ninguna). */
export function EntregasAlmacenAviso({ canWrite, actorName, abrirAlCargar = false }: {
  canWrite: boolean; actorName: string | null; abrirAlCargar?: boolean;
}) {
  const { entregas, cargando, recargar } = useEntregasPendientes();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { if (abrirAlCargar && !cargando && entregas.length) setAbierto(true); }, [abrirAlCargar, cargando, entregas.length]);
  if (!entregas.length && !abierto) return null;
  return (
    <>
      {entregas.length > 0 && (
        <button type="button" className="card" onClick={() => setAbierto(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '.75rem', width: '100%', textAlign: 'left', cursor: 'pointer',
            borderLeft: '4px solid var(--warning)', marginBottom: '1rem', padding: '.75rem 1rem' }}>
          <span style={{ fontSize: '1.6rem' }} aria-hidden>📦</span>
          <span style={{ flex: 1 }}>
            <strong>{entregas.length} {entregas.length === 1 ? 'entrega del almacén' : 'entregas del almacén'} por registrar</strong>
            <span className="muted" style={{ display: 'block', fontSize: '.82rem' }}>{resumenEntrega(entregas[0])}{entregas.length > 1 ? ' y más…' : ''}</span>
          </span>
          <span className="btn btn-primary btn-sm">Ver</span>
        </button>
      )}
      {abierto && <EntregasAlmacenModal entregas={entregas} canWrite={canWrite} actorName={actorName}
        onClose={() => setAbierto(false)} onCambio={() => void recargar()} />}
    </>
  );
}

export function EntregasAlmacenModal({ entregas, canWrite, actorName, onClose, onCambio }: {
  entregas: EntregaAlmacen[]; canWrite: boolean; actorName: string | null; onClose: () => void; onCambio: () => void;
}) {
  const [sel, setSel] = useState<EntregaAlmacen | null>(null);
  return (
    <Modal title={`📦 Entregas del almacén por registrar · ${entregas.length}`} size="lg" onClose={onClose}>
      {!entregas.length && <p className="muted">No hay entregas pendientes. 👍</p>}
      <div style={{ display: 'grid', gap: '.5rem' }}>
        {entregas.map((e) => (
          <button key={e.id} type="button" className="card" onClick={() => setSel(e)}
            style={{ textAlign: 'left', cursor: 'pointer', margin: 0, padding: '.7rem .9rem' }}>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong className="mono">{e.codigo}</strong>
              <span className="badge warning">Pendiente</span>
              <span className="badge">{e.origen === 'pc' ? '🖥 PC' : '📱 Teléfono'}</span>
              <span className="muted" style={{ fontSize: '.78rem', marginLeft: 'auto' }}>{dateTime(e.created_at)}</span>
            </div>
            <div style={{ marginTop: '.3rem' }}>{resumenEntrega(e)}</div>
            <div className="muted" style={{ fontSize: '.8rem' }}>{e.items.map(lineaItem).join(' · ')}</div>
          </button>
        ))}
      </div>
      {sel && <DetalleEntrega entrega={sel} canWrite={canWrite} actorName={actorName}
        onClose={() => setSel(null)} onListo={() => { setSel(null); onCambio(); }} />}
    </Modal>
  );
}

export function DetalleEntrega({ entrega: e, canWrite, actorName, onClose, onListo }: {
  entrega: EntregaAlmacen; canWrite: boolean; actorName: string | null; onClose: () => void; onListo: () => void;
}) {
  const [modo, setModo] = useState<'ver' | 'registrar' | 'rechazar'>('ver');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function rechazar() {
    if (motivo.trim().length < 3) { toast('Escribe el motivo del rechazo.', 'error'); return; }
    setGuardando(true);
    try {
      await rechazarEntrega(e.id, motivo.trim(), actorName);
      toast(`Entrega ${e.codigo} rechazada: vuelve al almacén como devolución.`, 'success');
      onListo();
    } catch (err) { toast(errMsg(err, 'No se pudo rechazar'), 'error'); }
    finally { setGuardando(false); }
  }

  return (
    <Modal title={`📦 ${e.codigo} · ${e.equipo_nombre}`} size="lg" onClose={onClose}>
      <div className="card" style={{ background: 'var(--bg-1)', marginBottom: '.75rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '.25rem' }}>{resumenEntrega(e)}</div>
        <div className="muted" style={{ fontSize: '.82rem' }}>
          {dateTime(e.created_at)} · {e.origen === 'pc' ? 'Salida de la PC' : 'Salida del teléfono'}{e.ref_codigo ? ` · ${e.ref_codigo}` : ''}{e.almacen ? ` · ${e.almacen}` : ''}
        </div>
        <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.1rem' }}>
          {e.items.map((i, k) => <li key={`${i.producto_id}-${k}`}>{lineaItem(i)}</li>)}
        </ul>
        {e.tipo_sugerido && <div style={{ marginTop: '.4rem', fontSize: '.85rem' }}>Para: <strong>{etiquetaTipoMant(e.tipo_sugerido)}</strong></div>}
        {e.nota && <div style={{ marginTop: '.3rem', fontSize: '.85rem' }}>Nota del almacén: {e.nota}</div>}
        {e.fotos.length > 0 && (
          <div style={{ marginTop: '.6rem' }}>
            <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.25rem' }}>Fotos de la salida</div>
            <FotosMiniatura fotos={e.fotos} origen="salida" etiqueta={`${e.codigo} · salida del almacén`} />
          </div>
        )}
      </div>

      {e.estado !== 'pendiente' ? (
        <p className="muted">Esta entrega ya se atendió ({e.estado}).</p>
      ) : !canWrite ? (
        <p className="muted">Solo quien tiene permiso de escritura en Maquinaria puede registrarla o rechazarla.</p>
      ) : modo === 'ver' ? (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-danger" onClick={() => setModo('rechazar')}>↩ Rechazar y devolver</button>
          <button type="button" className="btn btn-success" onClick={() => setModo('registrar')}>🔧 Registrar mantenimiento</button>
        </div>
      ) : modo === 'rechazar' ? (
        <div className="card">
          <div className="form-row">
            <label>Motivo del rechazo *</label>
            <textarea className="input" rows={3} value={motivo} onChange={(ev) => setMotivo(ev.target.value)}
              placeholder="Ej.: ese filtro no es de esta máquina; no se usó…" />
            <small className="muted">La entrega vuelve al almacenista como devolución: él le da entrada al inventario desde Retornos.</small>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setModo('ver')} disabled={guardando}>Volver</button>
            <button type="button" className="btn btn-danger" onClick={() => void rechazar()} disabled={guardando}>{guardando ? 'Rechazando…' : 'Rechazar entrega'}</button>
          </div>
        </div>
      ) : (
        <RegistrarEntregaForm entrega={e} actorName={actorName} onCancel={() => setModo('ver')} onListo={onListo} />
      )}
    </Modal>
  );
}

const TIPOS_ELEGIBLES = TIPOS_MANTENIMIENTO.filter((t) => t.value !== 'lectura');

function RegistrarEntregaForm({ entrega: e, actorName, onCancel, onListo }: {
  entrega: EntregaAlmacen; actorName: string | null; onCancel: () => void; onListo: () => void;
}) {
  const [equipos, setEquipos] = useState<MaquinariaEquipo[]>([]);
  const [equipoId, setEquipoId] = useState(e.equipo_id);
  const [tipos, setTipos] = useState<string[]>(e.tipo_sugerido ? [e.tipo_sugerido] : []);
  const [fecha, setFecha] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()));
  const [horometro, setHorometro] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [aceite, setAceite] = useState('');
  const [refrigerante, setRefrigerante] = useState('');
  const [trabajo, setTrabajo] = useState('');
  const [mecanico, setMecanico] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [reiniciar, setReiniciar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => { previas.forEach((u) => URL.revokeObjectURL(u)); }, [previas]);
  useEffect(() => { listEquipos().then((xs) => setEquipos(xs.filter((x) => x.activo !== false))).catch(() => {}); }, []);
  const equipo = equipos.find((x) => x.id === equipoId);
  useEffect(() => { if (equipo && !ubicacion) setUbicacion(equipo.ubicacion ?? ''); }, [equipo, ubicacion]);

  const alternar = (t: string) => setTipos((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    const problema = errorRegistroEntrega({ tipos, fecha, horometro, kilometraje });
    if (problema) { toast(problema, 'error'); return; }
    setGuardando(true);
    try {
      const subidas = fotos.length ? await subirFotosMantenimiento(equipoId, fotos) : [];
      const n = (v: string) => (v.trim() === '' ? null : Number(v));
      await registrarEntrega(e.id, {
        equipoId, fecha, tipos,
        horometro: n(horometro), kilometraje: n(kilometraje), aceiteLts: n(aceite), refrigeranteLts: n(refrigerante),
        trabajo: trabajo.trim() || tipos.map((t) => TIPOS_MANTENIMIENTO.find((x) => x.value === t)?.label ?? t).join(', '),
        mecanico: mecanico.trim() || null, ubicacion: ubicacion.trim() || null, observacion: observacion.trim() || null,
        fotos: subidas, actorName,
      });
      if (reiniciar) {
        try { await reiniciarMantenimientoDeEquipo(equipoId); }
        catch (err) { toast(`Quedó en la bitácora, pero no se pudo reiniciar el contador: ${errMsg(err, 'error')}`, 'warning'); }
      }
      toast(`Mantenimiento registrado en la bitácora de ${equipo?.equipo ?? e.equipo_nombre}.`, 'success');
      onListo();
    } catch (err) { toast(errMsg(err, 'No se pudo registrar'), 'error'); }
    finally { setGuardando(false); }
  }

  return (
    <form className="card" onSubmit={(ev) => void guardar(ev)}>
      <div className="form-row">
        <label>Máquina</label>
        <SearchSelect value={equipoId} onChange={(v) => v && setEquipoId(v)}
          options={equipos.map((x) => ({ value: x.id, label: x.equipo, hint: nombreCortoEquipo(x) }))} />
        {equipoId !== e.equipo_id && <small style={{ color: 'var(--warning)' }}>Cambiaste la máquina que eligió el almacén ({e.equipo_nombre}).</small>}
      </div>
      <div className="form-row">
        <label>¿Qué se hizo? * <span className="muted">(puedes marcar varios)</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
          {TIPOS_ELEGIBLES.map((t) => (
            <button key={t.value} type="button" className={`btn btn-sm ${tipos.includes(t.value) ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={tipos.includes(t.value)} onClick={() => alternar(t.value)}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Fecha en que se hizo *</label><input className="input" type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} /></div>
        <div className="form-row"><label>Horómetro (lectura)</label><input className="input mono" type="number" step="any" min={0} value={horometro} onChange={(ev) => setHorometro(ev.target.value)} /></div>
        <div className="form-row"><label>Kilometraje</label><input className="input mono" type="number" step="any" min={0} value={kilometraje} onChange={(ev) => setKilometraje(ev.target.value)} /></div>
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Aceite (Lts)</label><input className="input mono" type="number" step="any" min={0} value={aceite} onChange={(ev) => setAceite(ev.target.value)} /></div>
        <div className="form-row"><label>Refrigerante (Lts)</label><input className="input mono" type="number" step="any" min={0} value={refrigerante} onChange={(ev) => setRefrigerante(ev.target.value)} /></div>
        <div className="form-row"><label>Mecánico / taller</label><input className="input" value={mecanico} onChange={(ev) => setMecanico(ev.target.value.toUpperCase())} /></div>
      </div>
      <div className="form-row">
        <label>Trabajo realizado</label>
        <input className="input" value={trabajo} onChange={(ev) => setTrabajo(ev.target.value)} placeholder="Ej.: cambio de filtros de aceite y combustible, aceite 15W40" />
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Ubicación</label><input className="input" value={ubicacion} onChange={(ev) => setUbicacion(ev.target.value.toUpperCase())} /></div>
        <div className="form-row"><label>Observación</label><input className="input" value={observacion} onChange={(ev) => setObservacion(ev.target.value)} /></div>
      </div>
      <div className="form-row">
        <label>Fotos del mantenimiento ({fotos.length}/{MAX_FOTOS_MANTENIMIENTO}) · opcional</label>
        {fotos.length < MAX_FOTOS_MANTENIMIENTO && (
          <input className="input" type="file" accept="image/*" multiple
            onChange={(ev) => {
              const nuevas = Array.from(ev.target.files ?? []).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
              setFotos((xs) => [...xs, ...nuevas].slice(0, MAX_FOTOS_MANTENIMIENTO));
              ev.target.value = '';
            }} />
        )}
        {fotos.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', marginTop: '.35rem' }}>
            {fotos.map((f, i) => (
              <div key={`${f.name}-${i}`} style={{ position: 'relative', width: 64, height: 64 }}>
                <img src={previas[i]} alt={f.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                <button type="button" className="btn btn-xs btn-ghost" aria-label={`Quitar ${f.name}`}
                  style={{ position: 'absolute', top: -6, right: -6, padding: '0 .3rem', background: 'var(--bg-1)' }}
                  onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <label style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: '.88rem', margin: '.25rem 0 .75rem' }}>
        <input type="checkbox" checked={reiniciar} onChange={(ev) => setReiniciar(ev.target.checked)} />
        Fue el servicio preventivo: reiniciar el contador del próximo servicio
      </label>
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={guardando}>Volver</button>
        <button type="submit" className="btn btn-success" disabled={guardando}>{guardando ? 'Guardando…' : '✓ Guardar en la bitácora'}</button>
      </div>
    </form>
  );
}
