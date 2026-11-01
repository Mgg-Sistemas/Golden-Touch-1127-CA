/* ============================================================
   Golden Touch · Delivery · Vista de teléfono del motorizado (31/10/2026 · igual que MGG)

   La OC de productos que Tesorería pagó aparece «Por tomar» (en GT entra
   apenas queda pagada, sin esperar la retención, y solo las OC creadas desde
   que se encendió el interruptor compras_delivery). El motorizado la ACEPTA (solo uno: si otro se adelantó, la base
   lo rechaza con su nombre), sube fotos al recibirla del proveedor, la
   marca EN RUTA y la ENTREGA en el almacén con fotos. Si no puede buscarla
   la CANCELA con motivo y la OC vuelve a quedar libre. Cada paso termina en
   su mensaje de WhatsApp, que se copia o se envía con un botón (nada sale
   solo). Con el pedido tomado puede llamar al analista de Compras que armó
   la OC y al proveedor, y compartir su ubicación mientras va en curso.
   Antes de aceptar puede ver el comprobante de pago que adjuntó Tesorería.
   Mientras la administración no conecte Delivery a Compras, no llegan OC.
   GT (31/10): cada pedido tomado tiene su reporte en PDF (vista previa) y
   por WhatsApp.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { RUTA_TELEFONO } from '@/modules/auth/vistasTelefono';
import { listAlmacenes } from '@/modules/inventario/almacenes.repository';
import { useRealtime } from '@/shared/lib/useRealtime';
import { nombreYApellido, quienSync, useQuien } from '@/shared/lib/directorioUsuarios';
import type { Almacen } from '@/shared/lib/types';
import { toast } from '@/shared/ui/Toast';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { Quien } from '@/shared/ui/Quien';
import {
  ESTADO_DELIVERY, MAX_FOTOS_DELIVERY, MOTIVOS_CANCELACION, fechaHoraVE, mensajeAceptado, mensajeCancelado,
  mensajeEnRuta, mensajeEntregado, montoTxt, ocDe, type FotoDelivery, type PedidoDelivery,
} from './delivery';
import {
  cancelarPedido, compartirUbicacion, listPedidosDelivery, marcarEnRuta, marcarEntregado,
  subirFotosDelivery, tomarPedido, urlFotoDelivery, useDeliveryConectado,
} from './delivery.repository';
import { ComprobantePagoCuerpo } from './ComprobantePagoDelivery';
import { textoReportePedido } from './deliveryReporte';
import {
  armarFeed, debeEnviarUbicacion, enChip, errorUbicacion, mapaHref, mensajeDeEstado, telHref, trabajoEnCurso,
  type ChipDelivery, type EnvioGps, type PedidoFeed,
} from './deliveryMovil';
import './deliveryMovil.css';

/** GT no tiene sedes: el almacén se muestra con su nombre. */
const nombreAlmacenVisible = (a: string | null | undefined) => (a ?? '').trim() || '—';

export const RUTA_DELIVERY_TELEFONO = '/app/delivery/telefono';
const CLAVE_GPS = 'gt.deliveryMovil.compartirUbicacion';

const errMsg = (e: unknown, d: string) => {
  const m = String((e as { message?: string } | null)?.message ?? '').trim();
  return m || d;
};
const esImagen = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
const leerGps = () => { try { return localStorage.getItem(CLAVE_GPS) !== '0'; } catch { return true; } };
const guardarGps = (v: boolean) => { try { localStorage.setItem(CLAVE_GPS, v ? '1' : '0'); } catch { /* sin almacenamiento: vuelve a encendido */ } };
const cant = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 3 });

const CHIPS: Array<{ key: ChipDelivery; label: string }> = [
  { key: 'todos', label: 'Todos' },
  { key: 'por_tomar', label: '💰 Por tomar' },
  { key: 'en_ruta', label: '🚚 En ruta' },
  { key: 'entregados', label: '✅ Entregados' },
];

type Accion = { tipo: 'cancelar' | 'entregar'; ordenId: string };

export function DeliveryMovilView() {
  const { user } = useSession();
  const { can, appUser, soloTelefono, vistasTelefono } = usePermissions();
  const quienDe = useQuien();
  const canWrite = can('delivery', 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = nombreYApellido(appUser?.nombre, appUser?.apellido) || user?.email || null;
  const quien = quienDe(null, actor) || actorName || actor;
  const conectado = useDeliveryConectado();

  const [activos, setActivos] = useState<PedidoDelivery[]>([]);
  const [cerrados, setCerrados] = useState<PedidoDelivery[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [chip, setChip] = useState<ChipDelivery>('todos');
  const [accion, setAccion] = useState<Accion | null>(null);
  const [listo, setListo] = useState<{ titulo: string; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [comprobanteDe, setComprobanteDe] = useState<PedidoDelivery | null>(null);

  // Solo la última carga pinta (el realtime puede disparar varias seguidas).
  const turno = useRef(0);
  const reload = useCallback(async () => {
    const mio = ++turno.current;
    const [a, c] = await Promise.all([
      listPedidosDelivery(false),
      listPedidosDelivery(true).catch(() => [] as PedidoDelivery[]),
    ]);
    if (mio !== turno.current) return;
    setActivos(a);
    setCerrados(c);
  }, []);

  useEffect(() => {
    let vivo = true;
    reload().catch((e) => { if (vivo) toast(errMsg(e, 'No se pudieron cargar los pedidos'), 'error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [reload]);
  useRealtime(['delivery_pedidos', 'ordenes'], () => { void reload().catch(() => {}); });

  useEffect(() => {
    let vivo = true;
    // GT: el almacén principal (General · Peramanal) y los depósitos activos; sin subalmacenes.
    listAlmacenes()
      .then((as) => {
        if (!vivo) return;
        setAlmacenes(as.filter((a) => a.estado === 'activo' && !a.parent_id)
          .sort((a, b) => (a.sede ?? '').localeCompare(b.sede ?? '', 'es') || a.nombre.localeCompare(b.nombre, 'es')));
      })
      .catch(() => { /* sin lista: se entrega en el almacén de la OC */ });
    return () => { vivo = false; };
  }, []);

  const feed = useMemo(() => armarFeed(activos, cerrados), [activos, cerrados]);
  const visibles = useMemo(() => feed.filter((f) => enChip(f, chip)), [feed, chip]);
  const cuenta = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.key, feed.filter((f) => enChip(f, c.key)).length])) as Record<ChipDelivery, number>, [feed]);
  const enCurso = trabajoEnCurso(feed);
  const pedidoAccion = accion ? feed.find((f) => f.p.orden_id === accion.ordenId)?.p ?? null : null;

  // Si el pedido de la acción dejó de estar en curso (otra pestaña, la PC), se vuelve a la lista.
  useEffect(() => {
    if (accion && !loading && (!pedidoAccion || !pedidoAccion.es_mio || !['aceptado', 'en_ruta'].includes(pedidoAccion.estado))) setAccion(null);
  }, [accion, pedidoAccion, loading]);

  function hecho(titulo: string, texto: string) {
    setAccion(null);
    setListo({ titulo, texto });
    void reload().catch(() => {});
  }
  function volver() { setAccion(null); setListo(null); }

  async function tomar(p: PedidoDelivery) {
    setOcupado(p.orden_id);
    try {
      await tomarPedido(p.orden_id);
      toast(`Tomaste la orden ${ocDe(p)}.`, 'success');
      hecho('Pedido aceptado', mensajeAceptado(p, quien));
    } catch (e) {
      toast(errMsg(e, 'No se pudo tomar el pedido'), 'error');
      void reload().catch(() => {});
    } finally { setOcupado(null); }
  }

  async function enRuta(p: PedidoDelivery) {
    if (!p.pedido_id) return;
    setOcupado(p.orden_id);
    try {
      await marcarEnRuta(p.pedido_id);
      toast('Marcado en ruta.', 'success');
      hecho('En ruta', mensajeEnRuta(p, quien));
    } catch (e) {
      toast(errMsg(e, 'No se pudo marcar en ruta'), 'error');
    } finally { setOcupado(null); }
  }

  function verMensaje(p: PedidoDelivery) {
    const m = mensajeDeEstado(p, quien, nombreAlmacenVisible);
    if (m) { setAccion(null); setListo(m); }
  }

  const enPantallaPrincipal = !accion && !listo;

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>🛵 Delivery</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}><Quien nombre={null} correo={actor} vacio={actorName ?? actor} /></div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {!soloTelefono && <Link to="/app/delivery" className="btn btn-ghost">🖥 Módulo completo</Link>}
          {soloTelefono && vistasTelefono.length > 1 && <Link to={RUTA_TELEFONO} className="btn btn-ghost">📱 Mis pantallas</Link>}
        </div>
      </header>

      {conectado === false && (
        <div className="aviso info sm" style={{ margin: '.25rem 0 .85rem' }}>
          <span className="aviso-icono">ℹ</span>
          <div>Delivery todavía no está conectado a Compras: los pedidos aparecerán cuando la administración lo active.</div>
        </div>
      )}
      {!canWrite && (
        <div className="aviso warning sm" style={{ margin: '.25rem 0 .85rem' }}>
          <span className="aviso-icono">👁</span>
          <div>Tu rol solo puede ver. Para tomar y entregar pedidos hace falta escritura en Delivery.</div>
        </div>
      )}

      {canWrite && <CompartirUbicacion pedido={enCurso} />}

      {listo && (
        <div className="surt-form">
          <div className="surt-form-titulo"><span className="icono" aria-hidden>✅</span><strong>{listo.titulo}</strong></div>
          <CompartirWhatsapp texto={listo.texto} />
          <button type="button" className="btn btn-primary surt-guardar" onClick={volver}>← Volver a los pedidos</button>
        </div>
      )}

      {accion?.tipo === 'cancelar' && pedidoAccion && (
        <FormCancelar p={pedidoAccion} quien={quien} onCancel={volver} onHecho={hecho} />
      )}
      {accion?.tipo === 'entregar' && pedidoAccion && (
        <FormEntregar p={pedidoAccion} almacenes={almacenes} quien={quien} onCancel={volver} onHecho={hecho} />
      )}

      {enPantallaPrincipal && (
        <>
          <div className="dlv-chips" role="tablist" aria-label="Filtrar pedidos">
            {CHIPS.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={chip === c.key}
                className={`chip${chip === c.key ? ' chip-active' : ''}`} onClick={() => setChip(c.key)}>
                {c.label} <span className="dlv-chip-n">{cuenta[c.key]}</span>
              </button>
            ))}
          </div>

          {loading && <p className="muted">Cargando…</p>}
          {!loading && !visibles.length && (
            <p className="muted" style={{ textAlign: 'center', padding: '1.5rem .5rem' }}>
              {chip === 'por_tomar' ? 'No hay pedidos por tomar.'
                : chip === 'en_ruta' ? 'No hay pedidos en curso.'
                  : chip === 'entregados' ? 'Todavía no hay entregas.'
                    : 'No hay pedidos por ahora.'}
            </p>
          )}

          {visibles.map((f) => (
            <TarjetaPedido key={f.p.orden_id} f={f} canWrite={canWrite} ocupado={ocupado === f.p.orden_id} bloqueado={!!ocupado}
              onTomar={() => void tomar(f.p)}
              onEnRuta={() => void enRuta(f.p)}
              onCancelar={() => { setListo(null); setAccion({ tipo: 'cancelar', ordenId: f.p.orden_id }); }}
              onEntregar={() => { setListo(null); setAccion({ tipo: 'entregar', ordenId: f.p.orden_id }); }}
              onVerMensaje={() => verMensaje(f.p)}
              onComprobante={() => setComprobanteDe(f.p)}
              onReporte={() => { setAccion(null); setListo({ titulo: `Reporte del pedido ${ocDe(f.p)}`, texto: textoReportePedido(f.p, quienSync) }); }}
              onFotos={() => void reload().catch(() => {})}
            />
          ))}
        </>
      )}

      {comprobanteDe && <ComprobantePago p={comprobanteDe} onClose={() => setComprobanteDe(null)} />}
    </div>
  );
}

/* ── Una orden en el listado ── */

function TarjetaPedido({ f, canWrite, ocupado, bloqueado, onTomar, onEnRuta, onCancelar, onEntregar, onVerMensaje, onComprobante, onReporte, onFotos }: {
  f: PedidoFeed; canWrite: boolean; ocupado: boolean; bloqueado: boolean;
  onTomar: () => void; onEnRuta: () => void; onCancelar: () => void; onEntregar: () => void;
  onVerMensaje: () => void; onComprobante: () => void; onReporte: () => void; onFotos: () => void;
}) {
  const [generandoPdf, setGenerandoPdf] = useState(false);
  function verPdf() {
    setGenerandoPdf(true);
    import('./deliveryPdf').then((m) => m.pdfPedidoDelivery(f.p))
      .catch((e) => toast(errMsg(e, 'No se pudo generar el PDF'), 'error'))
      .finally(() => setGenerandoPdf(false));
  }
  const { p, disponible } = f;
  const estado = disponible ? ESTADO_DELIVERY.por_tomar : ESTADO_DELIVERY[p.estado];
  const enCurso = !disponible && (p.estado === 'aceptado' || p.estado === 'en_ruta');
  const mioEnCurso = enCurso && p.es_mio;
  const items = (p.items ?? []).filter((i) => i.comprar !== false);
  const telProv = telHref(p.proveedor_telefono);
  const telAnalista = telHref(p.analista_telefono);
  const mapa = mapaHref(p.proveedor_direccion);
  // Lo mío, en cualquier paso (si está libre otra vez y es mío, es porque yo lo cancelé).
  const puedeVerMensaje = p.es_mio;

  return (
    <article className={`dlv-card${mioEnCurso ? ' mio' : ''}${p.urgente ? ' urgente' : ''}`}>
      <div className="dlv-card-cab">
        <div style={{ minWidth: 0 }}>
          <div className="dlv-oc">{ocDe(p)}</div>
          {p.pagada_en && <div className="dlv-sub">Pagada {fechaHoraVE(p.pagada_en)}</div>}
        </div>
        <div className="dlv-badges">
          {p.urgente && <span className="badge danger">🚨 Urgente</span>}
          <span className={`badge ${estado.badge}`}>{estado.emoji} {estado.label}</span>
        </div>
      </div>

      <div className="dlv-prov">
        <div className="nombre">🏭 {p.proveedor_nombre ?? 'Proveedor sin nombre'}</div>
        {p.proveedor_contacto && <div className="dlv-sub">Contacto: {p.proveedor_contacto}</div>}
        {p.proveedor_direccion && (mapa
          ? <a className="dir" href={mapa} target="_blank" rel="noopener noreferrer">📍 {p.proveedor_direccion}</a>
          : <div className="dlv-sub">📍 {p.proveedor_direccion}</div>)}
        {!p.proveedor_direccion && <div className="dlv-sub">Sin dirección cargada: pregúntale al analista.</div>}
      </div>

      {mioEnCurso && (
        <div className="dlv-llamar">
          {telProv
            ? <a className="btn btn-ghost btn-grande" href={telProv}>📞 Llamar proveedor<small>{p.proveedor_telefono}</small></a>
            : <span className="btn btn-ghost btn-grande" aria-disabled>📞 Proveedor<small>sin teléfono</small></span>}
          {telAnalista
            ? <a className="btn btn-ghost btn-grande" href={telAnalista}>📞 Llamar analista<small>{p.analista_nombre ?? p.analista_email ?? ''}</small></a>
            : <span className="btn btn-ghost btn-grande" aria-disabled>📞 {p.analista_nombre ?? 'Analista'}<small>sin teléfono</small></span>}
        </div>
      )}

      {!!items.length && (
        <ul className="dlv-items">
          {items.map((i, k) => (
            <li key={`${i.nombre}-${k}`}><span>{i.nombre}</span><span>{cant(i.cantidad)}{i.unidad ? ` ${i.unidad}` : ''}</span></li>
          ))}
        </ul>
      )}
      <div className="dlv-total"><span>Total</span><span>{montoTxt(p.total, p.moneda)}</span></div>
      {(p.almacen_entrega || p.almacen_destino) && (
        <div className="dlv-sub">🏬 {p.estado === 'entregado' ? 'Entregado en' : 'Entregar en'}: <strong>{nombreAlmacenVisible(p.almacen_entrega ?? p.almacen_destino)}</strong></div>
      )}
      {p.estado === 'entregado' && p.entregado_en && (
        <div className="dlv-sub">✅ {fechaHoraVE(p.entregado_en)}{p.repartidor_nombre ? ` · ${p.repartidor_nombre}` : ''}</div>
      )}
      {disponible && p.estado === 'cancelado' && (
        <div className="dlv-nota-cancel">
          ⛔ La canceló {p.repartidor_nombre ?? 'otro delivery'}{p.motivo_cancel ? `: ${p.motivo_cancel}` : ''}. Está libre otra vez.
        </div>
      )}
      {enCurso && !p.es_mio && <div className="dlv-tomado">🛵 Tomado por <strong>{p.repartidor_nombre ?? 'otro delivery'}</strong>{p.aceptado_en ? ` · ${fechaHoraVE(p.aceptado_en)}` : ''}</div>}

      {(p.fotos_recibo.length > 0 || (mioEnCurso && p.estado === 'aceptado')) && (
        <FotosPedido p={p} tipo="recibo" puedeSubir={canWrite && mioEnCurso && p.estado === 'aceptado'} onCambio={onFotos} />
      )}
      {(p.fotos_entrega.length > 0 || (mioEnCurso && p.estado === 'en_ruta')) && (
        <FotosPedido p={p} tipo="entrega" puedeSubir={canWrite && mioEnCurso && p.estado === 'en_ruta'} onCambio={onFotos} />
      )}

      <div className="dlv-acciones">
        <button type="button" className="btn btn-ghost" onClick={onComprobante}>🧾 Ver comprobante de pago</button>
        {canWrite && disponible && (
          <button type="button" className="btn btn-primary" disabled={bloqueado} onClick={onTomar}>
            {ocupado ? 'Tomando…' : '✓ Aceptar pedido'}
          </button>
        )}
        {canWrite && mioEnCurso && p.estado === 'aceptado' && (
          <button type="button" className="btn btn-primary" disabled={bloqueado} onClick={onEnRuta}>
            {ocupado ? 'Guardando…' : '🚚 Marcar en ruta'}
          </button>
        )}
        {canWrite && mioEnCurso && p.estado === 'en_ruta' && (
          <button type="button" className="btn btn-success" disabled={bloqueado} onClick={onEntregar}>📦 Entregado en almacén</button>
        )}
        {canWrite && mioEnCurso && (
          <button type="button" className="btn btn-ghost" disabled={bloqueado} onClick={onCancelar} style={{ color: 'var(--danger)' }}>
            ✕ No puedo buscarlo
          </button>
        )}
        {puedeVerMensaje && (
          <button type="button" className="btn btn-ghost" onClick={onVerMensaje}>💬 Ver mensaje de WhatsApp</button>
        )}
        {/* GT: reporte del pedido (PDF con vista previa y WhatsApp) en cuanto alguien lo tomó. */}
        {!!p.pedido_id && !disponible && (
          <div className="surt-grid2">
            <button type="button" className="btn btn-ghost" disabled={generandoPdf} onClick={verPdf}>{generandoPdf ? 'Generando…' : '📄 Ver PDF'}</button>
            <button type="button" className="btn btn-ghost" onClick={onReporte}>📋 Reporte WhatsApp</button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── Fotos al recibir / de la entrega ── */

function FotosPedido({ p, tipo, puedeSubir, onCambio }: {
  p: PedidoDelivery; tipo: 'recibo' | 'entrega'; puedeSubir: boolean; onCambio: () => void;
}) {
  const fotos = tipo === 'recibo' ? p.fotos_recibo : p.fotos_entrega;
  const [subiendo, setSubiendo] = useState(false);
  const faltan = MAX_FOTOS_DELIVERY - fotos.length;
  const titulo = tipo === 'recibo' ? '📷 Fotos al recibir' : '📷 Fotos de la entrega';
  const id = `dlv-fotos-${tipo}-${p.orden_id}`;

  async function agregar(lista: FileList | null) {
    const archivos = Array.from(lista ?? []);
    if (!archivos.length || !p.pedido_id) return;
    if (archivos.some((f) => !esImagen(f))) { toast('Solo se pueden subir fotos (imágenes).', 'error'); return; }
    if (archivos.length > faltan) { toast(`Se pueden adjuntar hasta ${MAX_FOTOS_DELIVERY} fotos; te quedan ${faltan}.`, 'error'); return; }
    setSubiendo(true);
    try {
      await subirFotosDelivery(p.pedido_id, tipo, fotos, archivos);
      toast(archivos.length === 1 ? 'Foto agregada.' : `${archivos.length} fotos agregadas.`, 'success');
      onCambio();
    } catch (e) {
      toast(errMsg(e, 'No se pudieron subir las fotos'), 'error');
    } finally { setSubiendo(false); }
  }

  return (
    <div className="surt-campo">
      <label htmlFor={puedeSubir ? id : undefined}>{titulo} ({fotos.length}/{MAX_FOTOS_DELIVERY})</label>
      <MiniaturasFotos fotos={fotos} />
      {puedeSubir && faltan > 0 && (
        <div className="dlv-subir" style={{ marginTop: fotos.length ? '.5rem' : 0 }}>
          <span className="btn btn-ghost" aria-hidden>{subiendo ? 'Subiendo…' : `${titulo}${fotos.length ? ' (agregar)' : ''}`}</span>
          <input id={id} type="file" accept="image/*" multiple disabled={subiendo}
            aria-label={titulo} onChange={(e) => { void agregar(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {puedeSubir && faltan <= 0 && <small className="muted">Ya tiene las {MAX_FOTOS_DELIVERY} fotos.</small>}
    </div>
  );
}

/** Miniaturas con enlace firmado (se abren en otra pestaña). */
function MiniaturasFotos({ fotos }: { fotos: FotoDelivery[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const clave = fotos.map((f) => f.path).join('|');
  useEffect(() => {
    let vivo = true;
    void Promise.all(fotos.map(async (f) => [f.path, await urlFotoDelivery(f.path).catch(() => '')] as const))
      .then((xs) => { if (vivo) setUrls(Object.fromEntries(xs)); });
    return () => { vivo = false; };
    // `clave` resume las rutas: el arreglo cambia de identidad en cada recarga aunque sean las mismas fotos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  if (!fotos.length) return null;
  return (
    <div className="rep-fotos">
      {fotos.map((f) => (
        <a key={f.path} className="rep-foto" href={urls[f.path] || undefined} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${f.filename}`}>
          {urls[f.path] ? <img src={urls[f.path]} alt={f.filename} /> : <span className="rep-foto-doc">📷</span>}
        </a>
      ))}
    </div>
  );
}

/* ── Cancelar (no puede buscarlo) ── */

function FormCancelar({ p, quien, onCancel, onHecho }: {
  p: PedidoDelivery; quien: string; onCancel: () => void; onHecho: (titulo: string, texto: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esOtro = motivo === MOTIVOS_CANCELACION[MOTIVOS_CANCELACION.length - 1];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p.pedido_id) return;
    if (!motivo) { toast('Elige el motivo.', 'error'); return; }
    if (esOtro && !detalle.trim()) { toast('Escribe cuál es el motivo.', 'error'); return; }
    setGuardando(true);
    try {
      await cancelarPedido(p.pedido_id, motivo, detalle.trim() || null);
      toast(`Cancelaste la orden ${ocDe(p)}. Queda libre para otro delivery.`, 'success');
      onHecho('Pedido cancelado', mensajeCancelado(p, quien, motivo, detalle));
    } catch (err) {
      toast(errMsg(err, 'No se pudo cancelar el pedido'), 'error');
    } finally { setGuardando(false); }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>⛔</span>
        <div><strong>No puedo buscarlo</strong><div className="muted" style={{ fontSize: '.85rem' }}>{ocDe(p)} · {p.proveedor_nombre ?? '—'}</div></div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>
        La orden vuelve a quedar libre para que la tome otro delivery. Elige el motivo:
      </p>
      <div className="dlv-motivos" role="radiogroup" aria-label="Motivo">
        {MOTIVOS_CANCELACION.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={motivo === m}
            className={`dlv-motivo${motivo === m ? ' sel' : ''}`} onClick={() => setMotivo(m)}>
            <span aria-hidden>{motivo === m ? '●' : '○'}</span> {m}
          </button>
        ))}
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-cancel-detalle">Detalle {esOtro ? '(obligatorio)' : '(opcional)'}</label>
        <textarea id="dlv-cancel-detalle" className="input surt-input" rows={3} value={detalle}
          placeholder="Ej.: el proveedor dice que lo tiene mañana a las 9" onChange={(e) => setDetalle(e.target.value)} />
      </div>
      <div className="surt-grid2">
        <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
        <button type="submit" className="btn btn-peligro btn-grande" disabled={guardando || !motivo}>
          {guardando ? 'Guardando…' : 'Confirmar cancelación'}
        </button>
      </div>
    </form>
  );
}

/* ── Entregado en almacén ── */

function FormEntregar({ p, almacenes, quien, onCancel, onHecho }: {
  p: PedidoDelivery; almacenes: Almacen[]; quien: string; onCancel: () => void; onHecho: (titulo: string, texto: string) => void;
}) {
  const [almacen, setAlmacen] = useState(p.almacen_destino ?? '');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  // La OC trae su almacén; si no está entre los activos, igual se ofrece.
  const opciones = useMemo(() => {
    const ns = almacenes.map((a) => a.nombre);
    return p.almacen_destino && !ns.includes(p.almacen_destino) ? [p.almacen_destino, ...ns] : ns;
  }, [almacenes, p.almacen_destino]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p.pedido_id) return;
    if (!almacen) { toast('Elige el almacén donde lo entregaste.', 'error'); return; }
    setGuardando(true);
    try {
      await marcarEntregado(p.pedido_id, almacen, nota.trim() || null);
      toast(`Orden ${ocDe(p)} entregada.`, 'success');
      onHecho('Entregado en almacén', mensajeEntregado(p, quien, nombreAlmacenVisible(almacen), nota));
    } catch (err) {
      toast(errMsg(err, 'No se pudo marcar la entrega'), 'error');
    } finally { setGuardando(false); }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>📦</span>
        <div><strong>Entregado en almacén</strong><div className="muted" style={{ fontSize: '.85rem' }}>{ocDe(p)} · {p.proveedor_nombre ?? '—'}</div></div>
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-ent-almacen">Almacén</label>
        <select id="dlv-ent-almacen" className="select input surt-input" value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
          {!almacen && <option value="">Elegir…</option>}
          {opciones.map((n) => <option key={n} value={n}>{nombreAlmacenVisible(n)}</option>)}
        </select>
        {p.almacen_destino && <small className="muted">La OC indica entregar en {nombreAlmacenVisible(p.almacen_destino)}.</small>}
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-ent-nota">Nota (opcional)</label>
        <textarea id="dlv-ent-nota" className="input surt-input" rows={3} value={nota}
          placeholder="Ej.: lo recibió el almacenista; faltó un renglón" onChange={(e) => setNota(e.target.value)} />
      </div>
      {!p.fotos_entrega.length && (
        <div className="aviso warning sm"><span className="aviso-icono">📷</span><div>Todavía no subiste fotos de la entrega. Puedes volver y agregarlas antes de confirmar.</div></div>
      )}
      <div className="surt-grid2">
        <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
        <button type="submit" className="btn btn-primary btn-grande" disabled={guardando || !almacen}>
          {guardando ? 'Guardando…' : '✅ Confirmar entrega'}
        </button>
      </div>
    </form>
  );
}

/* ── Comprobante de pago (Tesorería) ── */

function ComprobantePago({ p, onClose }: { p: PedidoDelivery; onClose: () => void }) {
  return (
    <Modal title={`🧾 Comprobante de pago · ${ocDe(p)}`} onClose={onClose} minimizable={false}
      footer={<button type="button" className="btn btn-ghost btn-grande" onClick={onClose}>Cerrar</button>}>
      <ComprobantePagoCuerpo pedido={p} />
    </Modal>
  );
}

/* ── Compartir mi ubicación ── */

function CompartirUbicacion({ pedido }: { pedido: PedidoDelivery | null }) {
  const [quiere, setQuiere] = useState(leerGps);
  const [enviado, setEnviado] = useState<{ t: number; precision: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activo = quiere && !!pedido;

  const pedidoId = useRef<string | null>(null);
  useEffect(() => { pedidoId.current = pedido?.pedido_id ?? null; }, [pedido?.pedido_id]);

  useEffect(() => {
    if (!activo) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Este teléfono o navegador no permite compartir la ubicación.');
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('La ubicación solo funciona cuando la página abre con https.');
      return;
    }
    let ultimo: EnvioGps | null = null;
    let enviando = false;
    const id = navigator.geolocation.watchPosition((pos) => {
      const punto: EnvioGps = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
      if (enviando || !debeEnviarUbicacion(ultimo, punto)) return;
      enviando = true;
      ultimo = punto;
      compartirUbicacion({
        lat: punto.lat, lng: punto.lng, precision: pos.coords.accuracy ?? null,
        velocidad: pos.coords.speed ?? null, rumbo: pos.coords.heading ?? null,
      }, pedidoId.current)
        .then(() => { setEnviado({ t: punto.t, precision: pos.coords.accuracy ?? null }); setError(null); })
        .catch((e) => setError(errMsg(e, 'No se pudo compartir la ubicación.')))
        .finally(() => { enviando = false; });
    }, (e) => setError(errorUbicacion(e.code)), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [activo]);

  function cambiar() {
    const v = !quiere;
    setQuiere(v); guardarGps(v);
    if (!v) setError(null);
  }

  const hora = enviado ? new Date(enviado.t).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  return (
    <section className={`dlv-gps${activo && !error ? ' on' : ''}`} aria-label="Compartir mi ubicación">
      <div className="dlv-gps-fila">
        <div>
          <strong>📍 Compartir mi ubicación</strong>
          <div className="muted" style={{ fontSize: '.8rem' }}>
            {!pedido ? 'Se comparte solo mientras tienes un pedido aceptado o en ruta.'
              : activo ? `Compartiendo con la oficina · ${ocDe(pedido)}` : 'Apagada: la oficina no ve dónde vas.'}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={quiere} aria-label="Compartir mi ubicación"
          className="dlv-switch" onClick={cambiar} />
      </div>
      {activo && hora && <small className="muted">Última enviada: {hora}{enviado?.precision != null ? ` (±${Math.round(enviado.precision)} m)` : ''}</small>}
      {activo && !hora && !error && <small className="muted">Buscando señal de GPS…</small>}
      {activo && error && <small className="error">{error}</small>}
    </section>
  );
}
