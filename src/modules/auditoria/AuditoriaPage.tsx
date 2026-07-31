import { useEffect, useMemo, useState, useCallback } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import { BarChart, HBarChart, LineChart, type ChartPoint } from '@/shared/ui/Chart';
import { dateTime } from '@/shared/lib/format';
import {
  listSesiones, usuariosConectados, resumenPorUsuario, fmtDuracion,
  type SesionRow, type UsuarioActividad,
} from '@/modules/usuarios/actividadUsuarios';
import {
  listEventos, eventosPorUsuario, eventosPorDia, eventosPorModulo, agruparPorDia,
  describirEvento, type AuditoriaEvento,
} from './auditoria.repository';
import { descargarAuditoriaResumenPdf, descargarAuditoriaUsuarioPdf } from './auditoriaPdf';

type Rango = 'hoy' | '7' | 'mes' | 'todo' | 'rango';
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function restarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const inicioMes = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Tiempo de conexión por día (min) de un conjunto de sesiones. */
function conexionPorDia(sesiones: SesionRow[]): { dia: string; min: number }[] {
  const m = new Map<string, number>();
  for (const s of sesiones) {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.inicio));
    m.set(dia, (m.get(dia) ?? 0) + s.duracionMin);
  }
  return Array.from(m.entries()).map(([dia, min]) => ({ dia, min })).sort((a, b) => a.dia.localeCompare(b.dia));
}

export function AuditoriaPage() {
  const { isAdmin } = usePermissions();

  const [rango, setRango] = useState<Rango>('7');
  const [desde, setDesde] = useState(restarDias(hoyISO(), 6));
  const [hasta, setHasta] = useState(hoyISO());
  const { d, h } = useMemo(() => {
    const hoy = hoyISO();
    if (rango === 'hoy') return { d: hoy, h: hoy };
    if (rango === '7') return { d: restarDias(hoy, 6), h: hoy };
    if (rango === 'mes') return { d: inicioMes(hoy), h: hoy };
    if (rango === 'todo') return { d: null as string | null, h: null as string | null };
    return { d: desde, h: hasta };
  }, [rango, desde, hasta]);

  const [sesiones, setSesiones] = useState<SesionRow[]>([]);
  const [conectados, setConectados] = useState<SesionRow[]>([]);
  const [eventos, setEventos] = useState<AuditoriaEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<{ user_id: string; nombre: string; email: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [ses, con, evs] = await Promise.all([
        listSesiones(d, h).catch(() => [] as SesionRow[]),
        usuariosConectados().catch(() => [] as SesionRow[]),
        listEventos({ desde: d, hasta: h, limit: 4000 }).catch(() => [] as AuditoriaEvento[]),
      ]);
      setSesiones(ses); setConectados(con); setEventos(evs);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar la auditoría', 'error'); }
    finally { setLoading(false); }
  }, [d, h]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['auditoria_eventos', 'sesiones_usuario'], () => { void cargar(); });

  const porUsuario = useMemo(() => resumenPorUsuario(sesiones), [sesiones]);
  const evPorUsuario = useMemo(() => eventosPorUsuario(eventos), [eventos]);
  const evPorDia = useMemo(() => eventosPorDia(eventos), [eventos]);
  const evPorModulo = useMemo(() => eventosPorModulo(eventos), [eventos]);
  const conexTotal = useMemo(() => porUsuario.reduce((a, u) => a + u.totalMin, 0), [porUsuario]);

  // Índices por usuario para el detalle.
  const evCountByUser = useMemo(() => {
    const m = new Map<string, number>(); evPorUsuario.forEach((u) => m.set(u.user_id, u.eventos)); return m;
  }, [evPorUsuario]);

  if (!isAdmin) {
    return <div className="page"><div className="card"><p className="muted" style={{ margin: 0 }}>Este módulo es solo para administradores.</p></div></div>;
  }

  /* ─────────── DETALLE de un usuario ─────────── */
  if (sel) {
    const sesU = sesiones.filter((s) => s.user_id === sel.user_id);
    const evU = eventos.filter((e) => e.user_id === sel.user_id);
    const conexU = conexPorDiaChart(conexionPorDia(sesU));
    const totalMinU = sesU.reduce((a, s) => a + s.duracionMin, 0);
    const porDiaU = agruparPorDia(evU);
    const conectadoU = conectados.some((c) => c.user_id === sel.user_id);

    const pdfUsuario = async () => {
      try {
        await descargarAuditoriaUsuarioPdf({
          nombre: sel.nombre, email: sel.email, rango: rangoTexto(d, h), conectado: conectadoU,
          tiempoTotal: fmtDuracion(totalMinU), sesiones: sesU.length, acciones: evU.length, diasActivos: porDiaU.length,
          porDia: conexionPorDia(sesU).map((r) => ({ dia: diaLegible(r.dia), tiempo: fmtDuracion(r.min) })),
          timeline: porDiaU.flatMap(({ dia, eventos: evs }) => evs.map((e) => {
            const desc = describirEvento(e);
            // Cap de campos para que la celda no crezca de más (igual que en pantalla).
            const campos = desc.detalle.slice(0, 8).join(' · ');
            const extra = desc.detalle.length > 8 ? ` (+${desc.detalle.length - 8})` : '';
            return {
              fecha: diaLegible(dia),
              hora: new Date(e.at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
              titulo: desc.titulo,
              detalle: campos + extra,
            };
          })),
        });
      } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
    };

    return (
      <div className="page">
        <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>← Volver a la auditoría</button>
            <h1 style={{ margin: '.4rem 0 0' }}>🔎 {sel.nombre} {conectadoU && <span className="badge success" style={{ fontSize: '.7rem' }}>● Conectado</span>}</h1>
            <p className="muted hint" style={{ margin: '.25rem 0 0' }}>{sel.email} · {rangoTexto(d, h)}</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void pdfUsuario()}>🖨 Vista previa PDF</button>
        </div>

        <RangoSelector rango={rango} setRango={setRango} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
          <Kpi titulo="Tiempo conectado" valor={fmtDuracion(totalMinU)} nota={`${sesU.length} sesión(es)`} destacado />
          <Kpi titulo="Acciones registradas" valor={String(evU.length)} nota="en el período" />
          <Kpi titulo="Días activos" valor={String(porDiaU.length)} nota="con actividad" />
          <Kpi titulo="Última actividad" valor={sesU[0] ? dateTime(sesU[0].ultimo_latido) : '—'} nota="" />
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Tiempo conectado por día</div>
          <BarChart data={conexU} color="#3b82f6" yFormatter={(n) => fmtDuracion(n)} emptyMessage="Sin sesiones en el período." />
        </div>

        {/* Línea de tiempo de acciones, por día */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Detalle de acciones ({evU.length})</div>
          {loading ? <p className="muted">Cargando…</p> : porDiaU.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Sin acciones registradas en el período.</p>
          ) : porDiaU.map(({ dia, eventos: evs }) => (
            <div key={dia} style={{ marginBottom: '1rem' }}>
              <div style={{ position: 'sticky', top: 0, fontWeight: 800, color: 'var(--brand, #ff8a00)', padding: '.25rem 0', borderBottom: '1px solid var(--border)' }}>
                {diaLegible(dia)} <span className="muted" style={{ fontWeight: 500 }}>· {evs.length} acción(es)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginTop: '.4rem' }}>
                {evs.map((e) => <EventoFila key={e.id} e={e} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─────────── OVERVIEW ─────────── */
  const barsConexion: ChartPoint[] = porUsuario.slice(0, 15).map((u) => ({ label: u.nombre, value: u.totalMin, tooltip: `${u.nombre}: ${fmtDuracion(u.totalMin)} · ${u.sesiones} sesión(es)` }));
  const barsEventos: ChartPoint[] = evPorUsuario.slice(0, 15).map((u) => ({ label: u.nombre, value: u.eventos, tooltip: `${u.nombre}: ${u.eventos} acción(es)` }));
  const lineaDia: ChartPoint[] = evPorDia.map((x) => ({ label: x.dia.slice(5), value: x.eventos, tooltip: `${diaLegible(x.dia)}: ${x.eventos} acción(es)` }));
  const barsModulo: ChartPoint[] = evPorModulo.slice(0, 12).map((x) => ({ label: `${x.icono} ${x.modulo}`, value: x.eventos, tooltip: `${x.modulo}: ${x.eventos} acción(es)` }));

  const abrirUsuario = (u: { user_id: string; nombre: string; email: string }) => setSel(u);

  const pdfResumen = async () => {
    try {
      await descargarAuditoriaResumenPdf({
        rango: rangoTexto(d, h),
        conectados: conectados.length,
        tiempoTotal: fmtDuracion(conexTotal),
        usuariosActivos: porUsuario.length,
        accionesTotal: eventos.length,
        usuarios: porUsuarioConEventos(porUsuario, evPorUsuario).map((u) => ({
          nombre: u.nombre, email: u.email, sesiones: u.sesiones,
          tiempo: fmtDuracion(u.totalMin), acciones: evCountByUser.get(u.user_id) ?? 0, conectado: u.conectado,
        })),
        modulos: evPorModulo.map((m) => ({ modulo: m.modulo, icono: m.icono, acciones: m.eventos })),
      });
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error'); }
  };

  return (
    <div className="page">
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>🛡️ Auditoría de usuarios</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Quién se conecta, cuánto tiempo y qué hace (cambios, aprobaciones, registros). Tocá un usuario para ver su detalle.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void pdfResumen()} disabled={loading}>🖨 Vista previa PDF</button>
      </div>

      <RangoSelector rango={rango} setRango={setRango} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
        <Kpi titulo="Conectados ahora" valor={String(conectados.length)} nota="latido < 3 min" destacado />
        <Kpi titulo="Tiempo total conectado" valor={fmtDuracion(conexTotal)} nota={`${sesiones.length} sesión(es)`} />
        <Kpi titulo="Usuarios activos" valor={String(porUsuario.length)} nota="en el período" />
        <Kpi titulo="Acciones registradas" valor={String(eventos.length)} nota="cambios / aprobaciones…" />
      </div>

      {/* Conectados ahora */}
      {conectados.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--success, #22c55e)' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>🟢 Conectados ahora ({conectados.length})</div>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {conectados.map((c) => (
              <button key={c.user_id} className="btn btn-sm btn-ghost" onClick={() => abrirUsuario({ user_id: c.user_id, nombre: c.nombre, email: c.email })} title={`Desde ${dateTime(c.inicio)} · ${fmtDuracion(c.duracionMin)}`}>
                🟢 {c.nombre} · {fmtDuracion(c.duracionMin)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>⏱ Tiempo conectado por usuario</div>
              <HBarChart data={barsConexion} yFormatter={(n) => fmtDuracion(n)} emptyMessage="Sin sesiones en el período."
                onBarClick={(_p, i) => { const u = porUsuario[i]; if (u) abrirUsuario(u); }} />
              <small className="muted">Tocá una barra para ver el detalle del usuario.</small>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>⚡ Acciones por usuario</div>
              <HBarChart data={barsEventos} color="#ff8a00" emptyMessage="Sin acciones en el período."
                onBarClick={(_p, i) => { const u = evPorUsuario[i]; if (u) abrirUsuario(u); }} />
              <small className="muted">Tocá una barra para ver el detalle del usuario.</small>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>📈 Actividad por día</div>
              <LineChart data={lineaDia} color="#3b82f6" emptyMessage="Sin actividad en el período." />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>🧩 Acciones por módulo</div>
              <HBarChart data={barsModulo} color="#a855f7" emptyMessage="Sin acciones en el período." />
            </div>
          </div>

          {/* Tabla de usuarios (clic → detalle) */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: '.4rem' }}>Usuarios en el período</div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '.86rem' }}>
                <thead><tr>
                  <th>Usuario</th><th>Correo</th>
                  <th style={{ textAlign: 'right' }}>Sesiones</th>
                  <th style={{ textAlign: 'right' }}>Tiempo conectado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                  <th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {porUsuarioConEventos(porUsuario, evPorUsuario).map((u) => (
                    <tr key={u.user_id} style={{ cursor: 'pointer' }} onClick={() => abrirUsuario(u)} title="Ver detalle del usuario">
                      <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                      <td className="muted">{u.email}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{u.sesiones}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtDuracion(u.totalMin)}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{evCountByUser.get(u.user_id) ?? 0}</td>
                      <td>{u.conectado ? <span className="badge success">● Conectado</span> : <span className="muted">—</span>}</td>
                      <td style={{ textAlign: 'right' }}><span className="btn btn-sm btn-ghost">Ver →</span></td>
                    </tr>
                  ))}
                  {porUsuario.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Sin sesiones en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────── Subcomponentes ─────────── */
function RangoSelector({ rango, setRango, desde, hasta, setDesde, setHasta }: {
  rango: Rango; setRango: (r: Rango) => void; desde: string; hasta: string; setDesde: (s: string) => void; setHasta: (s: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {([['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['mes', 'Este mes'], ['todo', 'Todo'], ['rango', 'Rango…']] as const).map(([v, t]) => (
        <button key={v} className={rango === v ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost'} onClick={() => setRango(v)}>{t}</button>
      ))}
      {rango === 'rango' && (
        <>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota: string; destacado?: boolean }) {
  return (
    <div className="card" style={{ margin: 0, borderColor: destacado ? 'var(--brand, #ff8a00)' : undefined }}>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{titulo}</div>
      <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: destacado ? 'var(--brand, #ff8a00)' : undefined }}>{valor}</div>
      {nota && <div className="muted" style={{ fontSize: '.74rem' }}>{nota}</div>}
    </div>
  );
}

function EventoFila({ e }: { e: AuditoriaEvento }) {
  const d = describirEvento(e);
  const hora = new Date(e.at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ display: 'flex', gap: '.6rem', padding: '.45rem .6rem', border: '1px solid var(--border)', borderRadius: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1.1rem' }}>{d.icono}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{d.titulo}</div>
        {d.detalle.length > 0 && (
          <div className="muted mono" style={{ fontSize: '.76rem' }}>{d.detalle.slice(0, 6).join(' · ')}{d.detalle.length > 6 ? ` …(+${d.detalle.length - 6})` : ''}</div>
        )}
      </div>
      <span className="muted mono" style={{ fontSize: '.74rem', whiteSpace: 'nowrap' }}>{hora}</span>
    </div>
  );
}

/* ─────────── helpers ─────────── */
function conexPorDiaChart(rows: { dia: string; min: number }[]): ChartPoint[] {
  return rows.map((r) => ({ label: r.dia.slice(5), value: r.min, tooltip: `${diaLegible(r.dia)}: ${fmtDuracion(r.min)}` }));
}
function diaLegible(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function rangoTexto(d: string | null, h: string | null): string {
  if (d && h) return d === h ? `Día ${diaLegible(d)}` : `${diaLegible(d)} — ${diaLegible(h)}`;
  return 'Todo el período';
}
/** Merge de tiempo (sesiones) + eventos por usuario, para que aparezcan también
 *  usuarios que actuaron aunque su sesión no esté en el corte. */
function porUsuarioConEventos(porUsuario: UsuarioActividad[], evPorUsuario: { user_id: string; nombre: string; email: string; eventos: number }[]): UsuarioActividad[] {
  const m = new Map<string, UsuarioActividad>();
  porUsuario.forEach((u) => m.set(u.user_id, u));
  for (const ev of evPorUsuario) {
    if (ev.user_id === '—sistema—') continue;
    if (!m.has(ev.user_id)) {
      m.set(ev.user_id, { user_id: ev.user_id, nombre: ev.nombre, email: ev.email, sesiones: 0, totalMin: 0, conectado: false, ultimaActividad: '' });
    }
  }
  return Array.from(m.values()).sort((a, b) => b.totalMin - a.totalMin);
}
