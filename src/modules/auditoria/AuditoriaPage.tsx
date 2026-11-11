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
import './auditoria.css';

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
  const { can } = usePermissions();
  // 11/11/2026: la entrada la decide el permiso «Auditoría» de la matriz (el admin pasa siempre por can()).
  const puedeVer = can('auditoria');

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

  if (!puedeVer) {
    return <div className="page"><div className="card"><p className="muted" style={{ margin: 0 }}>Tu rol no tiene permiso para ver Auditoría. Pídelo en Usuarios → Roles y permisos.</p></div></div>;
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
        <div className="page-head">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>← Volver a la auditoría</button>
            <h1 style={{ margin: '.4rem 0 .25rem' }}>
              {sel.nombre} {conectadoU && <span className="badge success" style={{ fontSize: '.7rem' }}>● Conectado</span>}
            </h1>
            <p className="muted hint" style={{ margin: 0 }}>{sel.email} · {rangoTexto(d, h)}</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void pdfUsuario()}>🖨 Vista previa PDF</button>
        </div>

        <RangoSelector rango={rango} setRango={setRango} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />

        <div className="kpi-grid" style={{ marginTop: '1rem' }}>
          <Kpi titulo="Tiempo conectado" valor={fmtDuracion(totalMinU)} nota={`${sesU.length} sesión(es)`} destacado />
          <Kpi titulo="Acciones registradas" valor={String(evU.length)} nota="en el período" />
          <Kpi titulo="Días activos" valor={String(porDiaU.length)} nota="con actividad" />
          <Kpi titulo="Última actividad" valor={sesU[0] ? dateTime(sesU[0].ultimo_latido) : '—'} nota="" />
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title" style={{ marginBottom: '.4rem' }}>Tiempo conectado por día</div>
          <BarChart data={conexU} color="var(--info)" yFormatter={(n) => fmtDuracion(n)} emptyMessage="Sin sesiones en el período." />
        </div>

        {/* Línea de tiempo de acciones, por día */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: '.5rem' }}>Detalle de acciones ({evU.length})</div>
          {loading ? <p className="muted">Cargando…</p> : porDiaU.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Sin acciones registradas en el período.</p>
          ) : porDiaU.map(({ dia, eventos: evs }) => (
            <div key={dia} className="aud-dia">
              <div className="aud-dia-head">
                {diaLegible(dia)} <span className="aud-dia-n">· {evs.length} acción(es)</span>
              </div>
              {/* Secuencia sobre un riel: se ve el orden y el volumen del día. */}
              <ol className="aud-riel">
                {evs.map((e) => <EventoFila key={e.id} e={e} />)}
              </ol>
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
      <div className="page-head">
        <div>
          <h1>Auditoría de usuarios</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0', maxWidth: '72ch' }}>Quién se conecta, cuánto tiempo y qué hace (cambios, aprobaciones, registros). Toca un usuario para ver su detalle.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void pdfResumen()} disabled={loading}>🖨 Vista previa PDF</button>
      </div>

      <RangoSelector rango={rango} setRango={setRango} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />

      <div className="kpi-grid" style={{ marginTop: '1rem' }}>
        <Kpi titulo="Conectados ahora" valor={String(conectados.length)} nota="latido < 3 min" destacado />
        <Kpi titulo="Tiempo total conectado" valor={fmtDuracion(conexTotal)} nota={`${sesiones.length} sesión(es)`} />
        <Kpi titulo="Usuarios activos" valor={String(porUsuario.length)} nota="en el período" />
        <Kpi titulo="Acciones registradas" valor={String(eventos.length)} nota="cambios / aprobaciones…" />
      </div>

      {/* Conectados ahora */}
      {conectados.length > 0 && (
        <div className="card aud-conectados" style={{ marginBottom: '1rem' }}>
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

      {/* Conserva el alto mientras carga: antes la página saltaba al llegar los datos. */}
      {loading ? <div className="card aud-cargando"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>⏱ Tiempo conectado por usuario</div>
              <HBarChart data={barsConexion} yFormatter={(n) => fmtDuracion(n)} emptyMessage="Sin sesiones en el período."
                onBarClick={(_p, i) => { const u = porUsuario[i]; if (u) abrirUsuario(u); }} />
              <small className="muted">Toca una barra para ver el detalle del usuario.</small>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>⚡ Acciones por usuario</div>
              <HBarChart data={barsEventos} color="var(--primary)" emptyMessage="Sin acciones en el período."
                onBarClick={(_p, i) => { const u = evPorUsuario[i]; if (u) abrirUsuario(u); }} />
              <small className="muted">Toca una barra para ver el detalle del usuario.</small>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>📈 Actividad por día</div>
              <LineChart data={lineaDia} color="var(--info)" emptyMessage="Sin actividad en el período." />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: '.4rem' }}>🧩 Acciones por módulo</div>
              <HBarChart data={barsModulo} color="var(--gold)" emptyMessage="Sin acciones en el período." />
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
                    /* La fila ya abría el detalle, pero solo con el ratón. */
                    <tr
                      key={u.user_id}
                      className="aud-fila"
                      tabIndex={0}
                      onClick={() => abrirUsuario(u)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirUsuario(u); } }}
                      title="Ver detalle del usuario"
                    >
                      <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                      <td className="muted">{u.email}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{u.sesiones}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtDuracion(u.totalMin)}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{evCountByUser.get(u.user_id) ?? 0}</td>
                      <td>{u.conectado ? <span className="badge success">● Conectado</span> : <span className="muted">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button" className="btn btn-sm btn-ghost"
                          onClick={(ev) => { ev.stopPropagation(); abrirUsuario(u); }}
                          aria-label={`Ver el detalle de ${u.nombre}`}
                        >
                          Ver →
                        </button>
                      </td>
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
/* El período es un control segmentado, no cinco botones sueltos — y ahora
   dice que lo es. Mismos cinco valores y mismas fechas de siempre. */
function RangoSelector({ rango, setRango, desde, hasta, setDesde, setHasta }: {
  rango: Rango; setRango: (r: Rango) => void; desde: string; hasta: string; setDesde: (s: string) => void; setHasta: (s: string) => void;
}) {
  return (
    <div className="aud-periodo">
      <span className="aud-periodo-label" id="aud-periodo-lbl">Período</span>
      <div className="view-toggle" role="tablist" aria-labelledby="aud-periodo-lbl">
        {([['hoy', 'Hoy'], ['7', 'Últimos 7 días'], ['mes', 'Este mes'], ['todo', 'Todo'], ['rango', 'Rango…']] as const).map(([v, t]) => (
          <button
            key={v} type="button" role="tab"
            aria-selected={rango === v}
            className={rango === v ? 'active' : ''}
            onClick={() => setRango(v)}
          >
            {t}
          </button>
        ))}
      </div>
      {rango === 'rango' && (
        <>
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
        </>
      )}
    </div>
  );
}

/* La tarjeta del sistema (.kpi), no una propia. */
function Kpi({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota: string; destacado?: boolean }) {
  return (
    <div className={`kpi${destacado ? ' destacado' : ''}`}>
      <div className="label">{titulo}</div>
      <div className="value">{valor}</div>
      {nota && <div className="delta neutro">{nota}</div>}
    </div>
  );
}

const TOPE_CAMPOS = 6;

function EventoFila({ e }: { e: AuditoriaEvento }) {
  const d = describirEvento(e);
  const [todo, setTodo] = useState(false);
  const hora = new Date(e.at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  const sobran = d.detalle.length - TOPE_CAMPOS;
  const campos = todo ? d.detalle : d.detalle.slice(0, TOPE_CAMPOS);
  return (
    <li className="aud-evento">
      <span className="aud-evento-icono" aria-hidden="true">{d.icono}</span>
      <div className="aud-evento-cuerpo">
        <div className="aud-evento-titulo">{d.titulo}</div>
        {d.detalle.length > 0 && (
          <div className="aud-evento-detalle mono">
            {campos.join(' · ')}
            {/* Antes decía «(+3)» y ahí moría: ahora se abre. */}
            {sobran > 0 && (
              <button type="button" className="aud-evento-mas" aria-expanded={todo} onClick={() => setTodo((v) => !v)}>
                {todo ? 'ver menos' : `+${sobran} más`}
              </button>
            )}
          </div>
        )}
      </div>
      <span className="aud-evento-hora mono">{hora}</span>
    </li>
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
