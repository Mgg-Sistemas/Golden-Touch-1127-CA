/* ============================================================
   Golden Touch · Usuarios · Resumen de Actividad (modal)
   Supervisión: usuarios conectados ahora (con tiempo en el
   sistema) + sesiones por rango y tiempo por usuario. PDF previa.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { dateTime } from '@/shared/lib/format';
import {
  listSesiones,
  usuariosConectados,
  resumenPorUsuario,
  descargarActividadPdf,
  fmtDuracion,
  rangoLabel,
  type SesionRow,
} from './actividadUsuarios';

function hoyISO(): string { return new Date().toISOString().slice(0, 10); }
function isoMenosDias(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function ResumenActividadModal({ onClose }: { onClose: () => void }) {
  const [desde, setDesde] = useState<string>(isoMenosDias(6));
  const [hasta, setHasta] = useState<string>(hoyISO());
  const [conectados, setConectados] = useState<SesionRow[]>([]);
  const [sesiones, setSesiones] = useState<SesionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const cargarConectados = useCallback(() => {
    usuariosConectados().then(setConectados).catch(() => { /* sin datos */ });
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    listSesiones(desde || null, hasta || null)
      .then((r) => { if (!cancel) setSesiones(r); })
      .catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar la actividad', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [desde, hasta]);

  // Conectados: carga inicial + refresco automático cada 30 s (presencia en vivo).
  useEffect(() => {
    cargarConectados();
    const id = setInterval(cargarConectados, 30_000);
    return () => clearInterval(id);
  }, [cargarConectados]);

  const porUsuario = useMemo(() => resumenPorUsuario(sesiones), [sesiones]);

  async function exportarPdf() {
    setBusy(true);
    try { await descargarActividadPdf(conectados, porUsuario, sesiones, desde || null, hasta || null); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
    finally { setBusy(false); }
  }

  const footer = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-primary" disabled={busy} onClick={() => void exportarPdf()}>↓ PDF (vista previa)</button>
    </>
  );

  return (
    <Modal title="📊 Resumen de Actividad" size="xl" onClose={onClose} footer={footer}>
      {/* Conectados ahora */}
      <div className="card" style={{ padding: '.6rem', marginBottom: '.75rem', borderLeft: '3px solid #10b981' }}>
        <div className="card-title" style={{ marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🟢 Conectados ahora · {conectados.length}</span>
          <button className="btn btn-sm btn-ghost" onClick={cargarConectados} title="Actualizar">↻ Actualizar</button>
        </div>
        <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.8rem' }}>
            <thead>
              <tr><th>Usuario</th><th>Correo</th><th>Conectado desde</th><th style={{ textAlign: 'right' }}>Tiempo en sistema</th><th>Última actividad</th></tr>
            </thead>
            <tbody>
              {conectados.map((s) => (
                <tr key={s.id}>
                  <td><span style={{ color: '#10b981' }}>●</span> {s.nombre}</td>
                  <td className="muted">{s.email}</td>
                  <td className="muted">{dateTime(s.inicio)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmtDuracion(s.duracionMin)}</td>
                  <td className="muted">{dateTime(s.ultimo_latido)}</td>
                </tr>
              ))}
              {!conectados.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Nadie conectado en este momento.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rango de fechas */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '.6rem' }}>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Desde</label>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Hasta</label>
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '.3rem' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(hoyISO()); setHasta(hoyISO()); }}>Hoy</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(isoMenosDias(6)); setHasta(hoyISO()); }}>7 días</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { setDesde(''); setHasta(''); }}>Todo</button>
        </div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '.78rem' }}>{rangoLabel(desde || null, hasta || null)}</span>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: '1rem', textAlign: 'center' }}>Cargando…</div>
      ) : (
        <>
          {/* Tiempo por usuario */}
          <div className="card" style={{ padding: '.6rem', marginBottom: '.6rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Tiempo por usuario</span></div>
            <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '.8rem' }}>
                <thead>
                  <tr><th>Usuario</th><th>Correo</th><th style={{ textAlign: 'right' }}>Sesiones</th><th style={{ textAlign: 'right' }}>Tiempo total</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {porUsuario.map((u) => (
                    <tr key={u.user_id}>
                      <td>{u.nombre}</td>
                      <td className="muted">{u.email}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{u.sesiones}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtDuracion(u.totalMin)}</td>
                      <td>{u.conectado ? <span style={{ color: '#10b981' }}>● Conectado</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                  {!porUsuario.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin sesiones en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle de sesiones */}
          <div className="card" style={{ padding: '.6rem' }}>
            <div className="card-title" style={{ marginBottom: '.4rem' }}><span>Sesiones · {sesiones.length}</span></div>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '.78rem' }}>
                <thead>
                  <tr><th>Usuario</th><th>Inicio</th><th>Última actividad</th><th style={{ textAlign: 'right' }}>Duración</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {sesiones.map((s) => (
                    <tr key={s.id}>
                      <td>{s.nombre}</td>
                      <td className="muted">{dateTime(s.inicio)}</td>
                      <td className="muted">{dateTime(s.ultimo_latido)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtDuracion(s.duracionMin)}</td>
                      <td>{s.conectado ? <span style={{ color: '#10b981' }}>● Conectado</span> : <span className="muted">Cerrada</span>}</td>
                    </tr>
                  ))}
                  {!sesiones.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Sin sesiones en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
