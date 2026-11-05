/* ============================================================
   Golden Touch · Solicitudes de Pedido · Vista de teléfono (29/10/2026)

   Para Almacén con el celular en la mano, al lado del estante. El inicio
   (02/11/2026, igual que en MGG): tarjetas grandes «Por revisar», «Urgentes»
   y «Revisadas» que filtran la lista, y un buscador por SP, solicitante o
   producto. Al tocar una SP por revisar: cada renglón con su existencia en
   Los Pinos y un «− / +» de lo que TIENE, los botones de lote (cada uno
   responde con un aviso y trae a la vista «Marcar como revisada»), la nota,
   «Marcar como revisada» y el WhatsApp de la solicitud. Al tocar una
   revisada: el WhatsApp de la revisión. Mismo flujo que la PC.

   Solo Los Pinos: el Depósito Mina no entra en la revisión (02/11/2026).
   ============================================================ */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { nombreYApellido } from '@/shared/lib/directorioUsuarios';
import { Quien } from '@/shared/ui/Quien';
import { DecimalInput } from '@/shared/ui/DecimalInput';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { EmptyState } from '@/shared/ui/EmptyState';
import { dateTime, num, relTime } from '@/shared/lib/format';
import type { SolicitudConRevision } from './solicitudesAlmacen.repository';
import {
  faltante, resumenRevision, revisionGuardada, stockDe, textoWhatsappRevision, textoWhatsappSolicitud, tieneDe,
} from './revisionAlmacen';
import { useBorradores, useSolicitudesAlmacen } from './useSolicitudesAlmacen';
import {
  AvisoApagado, BadgeExistencia, BarraCobertura, ModalWhatsapp, renglonesDe, useLotes, useMarcarRevisada,
} from './SolicitudesComun';

type Filtro = 'pendientes' | 'urgentes' | 'revisadas';

/** Las revisadas que se listan (las trae el hook: últimos 7 días). */
const DIAS_REVISADAS = 7;

/** Todo lo que se puede buscar de una SP: número, quién la pide, para qué y qué productos trae. */
function textoBusqueda(s: SolicitudConRevision): string {
  const o = s.orden;
  return [o.codigo, o.solicitante, o.solicitante_email, o.unidad_solicitante, o.motivo, o.finalidad, ...renglonesDe(s).map((i) => i.nombre)]
    .filter(Boolean).join(' ').toUpperCase();
}

export function SolicitudesAlmacenMovilView() {
  const { user } = useSession();
  const { isAdmin, can, role, appUser, soloTelefono, vistasTelefono } = usePermissions();
  // 30/10/2026 · Confirma el ALMACENISTA de Los Pinos (y el admin).
  const puedeRevisar = isAdmin || (role === 'almacenista' && can('inventario', 'escritura'));
  const quien = nombreYApellido(appUser?.nombre, appUser?.apellido) || user?.email || '';

  const datos = useSolicitudesAlmacen();
  const bor = useBorradores(datos.stock);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [q, setQ] = useState('');
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [verWsp, setVerWsp] = useState(false);
  const [wspRevision, setWspRevision] = useState<{ titulo: string; texto: string } | null>(null);
  const marcar = useMarcarRevisada(quien, (id) => { bor.olvidar(id); setAbiertaId(null); void datos.reload(); });
  // Para traer a la vista el «Marcar como revisada» tras un lote (el paso siguiente).
  const btnRevisar = useRef<HTMLButtonElement>(null);
  const [resaltar, setResaltar] = useState(false);
  const lotes = useLotes(datos, bor, marcar, (modo) => {
    if (modo === 'todo_a_compras') return; // ya se abrió la confirmación
    btnRevisar.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setResaltar(true);
    window.setTimeout(() => setResaltar(false), 1300);
  });

  // Si otra persona la revisó mientras estaba abierta, deja de estar en la lista.
  const s = datos.porRevisar.find((x) => x.orden.id === abiertaId) ?? null;

  const urgentes = useMemo(() => datos.porRevisar.filter((x) => x.orden.urgente), [datos.porRevisar]);
  const lista = useMemo(() => {
    const base = filtro === 'revisadas' ? datos.revisadas : filtro === 'urgentes' ? urgentes : datos.porRevisar;
    const t = q.trim().toUpperCase();
    return t ? base.filter((x) => textoBusqueda(x).includes(t)) : base;
  }, [filtro, datos.revisadas, datos.porRevisar, urgentes, q]);

  function abrir(x: SolicitudConRevision) {
    setAbiertaId(x.orden.id);
    setVerWsp(false);
  }

  /** Revisada: se vuelve a abrir el WhatsApp de la revisión (el guardado o, si no, el armado). */
  function abrirRevisada(x: SolicitudConRevision) {
    const r = x.revision;
    const guardado = r?.texto_whatsapp?.trim();
    const guardadoEsValido = guardado && !guardado.includes('�') && !guardado.includes('');
    const texto = (guardadoEsValido ? guardado : null)
      || textoWhatsappRevision(x.orden, resumenRevision(renglonesDe(x), revisionGuardada(r?.items_revision)), r?.revisada_por_nombre || quien, r?.nota);
    setWspRevision({ titulo: `📲 Revisión de ${x.orden.codigo}`, texto });
  }

  const vacio = q.trim() ? 'Nada coincide con la búsqueda.'
    : filtro === 'revisadas' ? `Ninguna solicitud revisada en los últimos ${DIAS_REVISADAS} días.`
      : filtro === 'urgentes' ? 'No hay solicitudes urgentes por revisar.'
        : 'No hay solicitudes esperando a Almacén. Las nuevas aparecen aquí solas.';

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>📋 Solicitudes de Pedido</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{quien} · Almacén Los Pinos</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {s && <button type="button" className="btn btn-ghost" onClick={() => setAbiertaId(null)}>← Lista</button>}
          {!soloTelefono && <Link to="/app/pedidos?tab=almacen" className="btn btn-ghost">🖥 Módulo completo</Link>}
          {soloTelefono && vistasTelefono.length > 1 && <Link to="/app/telefono" className="btn btn-ghost">📱 Mis pantallas</Link>}
        </div>
      </header>

      {datos.loading && datos.activo === null && <p className="muted">Cargando…</p>}
      {!datos.loading && datos.activo === false && <AvisoApagado isAdmin={isAdmin} />}
      {datos.error && <div className="aviso danger sm" style={{ margin: '.5rem 0' }}><span className="aviso-icono">⚠</span><div>{datos.error}</div></div>}

      {datos.activo && !puedeRevisar && (
        <div className="aviso warning sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">👁</span>
          <div>Tu rol solo puede ver. Las solicitudes las confirma el almacenista de Los Pinos (rol almacenista).</div>
        </div>
      )}

      {datos.activo && !s && (
        <>
          <div className="surt-acciones spa-inicio">
            <button type="button" className="surt-btn primario" aria-pressed={filtro === 'pendientes'} onClick={() => setFiltro('pendientes')}>
              <span className="icono" aria-hidden>⏱</span>
              <span>{datos.porRevisar.length}</span>
              <small>Por revisar</small>
            </button>
            <button type="button" className="surt-btn urgentes" aria-pressed={filtro === 'urgentes'} onClick={() => setFiltro('urgentes')}>
              <span className="icono" aria-hidden>🚨</span>
              <span>{urgentes.length}</span>
              <small>Urgentes</small>
            </button>
            <button type="button" className="surt-btn revisadas" aria-pressed={filtro === 'revisadas'} onClick={() => setFiltro('revisadas')}>
              <span className="icono" aria-hidden>✅</span>
              <span>Revisadas ({datos.revisadas.length})</span>
              <small>Últimos {DIAS_REVISADAS} días · toca una para el mensaje de WhatsApp</small>
            </button>
          </div>

          <input className="input surt-input spa-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar SP, solicitante o producto" aria-label="Buscar solicitud" autoComplete="off" />

          <section className="surt-lista">
            {!datos.loading && !lista.length && <EmptyState icon={filtro === 'revisadas' ? '✅' : '📋'} message={vacio} />}
            {lista.map((x) => {
              const n = renglonesDe(x).length;
              if (filtro === 'revisadas') {
                const res = resumenRevision(renglonesDe(x), revisionGuardada(x.revision?.items_revision));
                return (
                  <button key={x.orden.id} type="button" className="surt-mov" onClick={() => abrirRevisada(x)}>
                    <span className="icono" aria-hidden>{res.aCompras.length ? '🛒' : '📦'}</span>
                    <span style={{ minWidth: 0 }}>
                      <div className="titulo mono">{x.orden.codigo}</div>
                      <div className="sub">
                        {x.orden.solicitante?.trim() || <Quien correo={x.orden.solicitante_email} vacio="—" />}
                        {x.orden.unidad_solicitante ? ` · ${x.orden.unidad_solicitante}` : ''}
                      </div>
                      <div className="sub"><Quien nombre={x.revision?.revisada_por_nombre} correo={x.revision?.revisada_por} vacio="—" /> · {dateTime(x.revision?.revisada_en)}</div>
                    </span>
                    <span className="litros" style={{ fontSize: '.85rem' }}>📦 {res.disponibles.length}<br />🛒 {res.aCompras.length}</span>
                  </button>
                );
              }
              return (
                <button key={x.orden.id} type="button" className="surt-mov" onClick={() => abrir(x)}
                  style={x.orden.urgente ? { borderColor: 'var(--danger)' } : undefined}>
                  <span className="icono" aria-hidden>{x.orden.urgente ? '🚨' : '📝'}</span>
                  <span style={{ minWidth: 0 }}>
                    {/* 03/11/2026 · como MGG: «SP · UNIDAD — SOLICITANTE» y «N producto(s) · hace …». */}
                    <div className="titulo">
                      <span className="mono" style={{ color: 'var(--primary-3)' }}>{x.orden.codigo}</span>
                      {x.orden.unidad_solicitante ? ` · ${x.orden.unidad_solicitante}` : ''}
                      {' — '}{x.orden.solicitante?.trim() || <Quien correo={x.orden.solicitante_email} vacio="—" />}
                    </div>
                    <div className="sub">{n} producto{n === 1 ? '' : 's'} · {relTime(x.orden.created_at)}</div>
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.3rem' }}>{n}</span>
                </button>
              );
            })}
          </section>
        </>
      )}

      {datos.activo && s && (() => {
        const items = s.orden.items;
        const revision = bor.revisionDe(s);
        const porIdx = new Map(revision.map((r) => [r.idx, tieneDe(r)]));
        const resumen = resumenRevision(items, revision);
        return (
          <div className="surt-form">
            <div className="surt-form-titulo">
              <span className="icono" aria-hidden>{s.orden.urgente ? '🚨' : '📝'}</span>
              <strong className="mono" style={{ color: 'var(--primary-3)' }}>{s.orden.codigo}</strong>
            </div>
            <div className="surt-detalle">
              <div className="surt-fila"><span>Solicitante</span><span>{s.orden.solicitante?.trim() || <Quien correo={s.orden.solicitante_email} vacio="—" />}</span></div>
              {s.orden.unidad_solicitante && <div className="surt-fila"><span>Unidad</span><span>{s.orden.unidad_solicitante}</span></div>}
              <div className="surt-fila"><span>Fecha</span><span>{dateTime(s.orden.created_at)}</span></div>
              {s.orden.urgente && <div className="surt-fila"><span>Prioridad</span><span style={{ color: 'var(--danger)' }}>URGENTE</span></div>}
              {s.orden.motivo && <div className="surt-fila"><span>Motivo</span><span>{s.orden.motivo}</span></div>}
              {s.orden.finalidad && <div className="surt-fila"><span>Finalidad</span><span>{s.orden.finalidad}</span></div>}
            </div>

            {puedeRevisar && (
              <div className="spa-lote-movil">
                {lotes.botones(s).map((b) => (
                  <button key={b.modo} type="button" className={`btn btn-ghost ${b.clase}`} disabled={b.disabled || marcar.guardando}
                    onClick={() => void lotes.aplicar(s, b.modo)}>{b.texto}</button>
                ))}
              </div>
            )}

            {items.map((it, idx) => {
              const sol = Number(it.cantidad) || 0;
              const tiene = porIdx.get(idx) ?? 0;
              const falta = faltante(sol, tiene);
              const sug = !it.productoId ? datos.sugerido(it.nombre) : null;
              const paso = sol >= 1 ? 1 : sol;
              return (
                <div key={idx} className="spa-renglon">
                  <div className="nombre">{it.nombre}</div>
                  <div className="sub">
                    <span>Piden <b className="mono" style={{ color: 'var(--text)' }}>{num(sol)} {it.unidad || 'und'}</b></span>
                    <span>· 📍 Los Pinos</span>
                    <BadgeExistencia solicitada={sol} stock={stockDe(it, datos.stock)} unidad={it.unidad} />
                  </div>
                  {sug && <div className="sub">Parecido: {sug.nombre} · hay {num(sug.stock)} {sug.unidad}</div>}
                  <BarraCobertura solicitada={sol} disponible={tiene} />
                  <div className="sub" style={{ marginTop: '.3rem' }}>📍 Sale de Los Pinos</div>
                  <div className="spa-stepper">
                    <button type="button" className="btn btn-ghost" disabled={!puedeRevisar || tiene <= 0}
                      aria-label="Menos" onClick={() => bor.fijar(s, idx, Math.max(0, tiene - paso))}>−</button>
                    <DecimalInput className="input" value={tiene} disabled={!puedeRevisar}
                      aria-label={`Sale de Los Pinos: ${it.nombre}`} onChange={(x) => bor.fijar(s, idx, x)} />
                    <button type="button" className="btn btn-ghost" disabled={!puedeRevisar || tiene >= sol}
                      aria-label="Más" onClick={() => bor.fijar(s, idx, Math.min(sol, tiene + paso))}>＋</button>
                  </div>
                  <div className="compras">{falta > 0 ? <>🛒 A Compras: <b>{num(falta)} {it.unidad || 'und'}</b></> : <span className="muted">Los Pinos lo cubre completo</span>}</div>
                </div>
              );
            })}

            {puedeRevisar && (
              <>
                <div className="surt-campo">
                  <label htmlFor="spa-nota-movil">Nota</label>
                  <input id="spa-nota-movil" className="input surt-input" value={bor.nota(s.orden.id)}
                    onChange={(e) => bor.fijarNota(s.orden.id, e.target.value)} placeholder="Opcional" autoComplete="off" />
                </div>
                <div className="spa-vivo" aria-live="polite">
                  <span className="badge success">📦 Los Pinos entrega {resumen.disponibles.length}</span>
                  <span className={`badge ${resumen.aCompras.length ? 'warning' : 'neutral'}`}>🛒 Compras cotiza {resumen.aCompras.length}</span>
                </div>
                <button ref={btnRevisar} type="button" className={`btn btn-success surt-guardar${resaltar ? ' spa-resaltar' : ''}`} disabled={marcar.guardando}
                  onClick={() => marcar.pedir(s, revision, bor.nota(s.orden.id))}>✓ Marcar como revisada</button>
              </>
            )}
            <button type="button" className="btn btn-ghost btn-grande" onClick={() => setVerWsp((v) => !v)}>
              📲 {verWsp ? 'Ocultar WhatsApp de la solicitud' : 'WhatsApp de la solicitud'}
            </button>
            {verWsp && <CompartirWhatsapp texto={textoWhatsappSolicitud(s.orden)} />}
          </div>
        );
      })()}

      {marcar.dialogos}
      {wspRevision && <ModalWhatsapp titulo={wspRevision.titulo} texto={wspRevision.texto} onClose={() => setWspRevision(null)} />}
    </div>
  );
}
