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
   02/11/2026 (pedidos de la usuaria):
   · RETIRO EN ALMACÉN LOS PINOS: lo que la revisión de Almacén marcó como
     disponible también llega «Por tomar» (📦, sin comprobante de pago); se
     retira en Los Pinos (fotos «al retirar en Almacén») y se entrega A la
     unidad / persona que lo pidió («Entregado a»).
   · «✓ Aceptar pedido» lo deja directo EN CAMINO y ya no le sale a ningún
     otro motorizado (solo a quien lo aceptó y en la PC).
   · «✕ No disponible» pide un motivo, queda guardado, sale su WhatsApp y el
     pedido sigue libre para los demás (al que lo marcó ya no le sale).
   · La tarjeta ya no trae la lista de renglones: dice «📦 N productos» y
     «📋 Ver orden» la despliega (y «Ocultar orden» la pliega).
   · «Entregado» de una OC la deja RECIBIDA en Inventario (Almacén Los Pinos /
     General): ya no se elige almacén. Si Almacén la recibió antes por su
     cuenta, el pedido se cierra («Recibida por Almacén») y sale del teléfono.
   ============================================================ */
import { etiquetaSedeEntrega } from '@/shared/lib/types';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { RUTA_TELEFONO } from '@/modules/auth/vistasTelefono';
import { useRealtime } from '@/shared/lib/useRealtime';
import { CANALES_DELIVERY, tituloPantallaCanal, type CanalDelivery } from './delivery';
import { nombreYApellido, quienSync, useQuien } from '@/shared/lib/directorioUsuarios';
import { toast } from '@/shared/ui/Toast';
import { Modal } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { Quien } from '@/shared/ui/Quien';
import {
  ALMACEN_RETIRO, ESTADO_DELIVERY, MAX_FOTOS_DELIVERY, almacenRecepcion, almacenVisible, MOTIVOS_CANCELACION, MOTIVOS_NO_DISPONIBLE, claveDelivery, destinoRetiro,
  esRetiroAlmacen, etiquetaEstado, fechaHoraVE, mensajeAceptado, mensajeCancelado, mensajeEnRuta, mensajeEntregado,
  mensajeNoDisponible, montoTxt, motivoNoDisponible, ocDe, type FotoDelivery, type PedidoDelivery, type RechazoDelivery,
} from './delivery';
import {
  cancelarPedido, compartirUbicacion, fijarLugarDelivery, listPedidosDelivery, listRechazosDelivery, marcarEnRuta, marcarEntregado,
  rechazarPedido, subirFotosDelivery, tomarPedido, ubicarProveedorDesdeDelivery, urlFotoDelivery, useDeliveryConectado, useUbicacionesRuta,
} from './delivery.repository';
import { ComprobantePagoCuerpo } from './ComprobantePagoDelivery';
import { EditarFotosDeliveryModal, puedeEditarFotosDelivery } from './EditarFotosDelivery';
import { parsearCoordenadas } from '@/modules/proveedores/ubicacionProveedor';
import { textoReportePedido } from './deliveryReporte';
import {
  armarFeed, debeEnviarUbicacion, distanciaMetros, enChip, mapaHref, mensajeDeEstado, productosTxt, rechazadosPor, telHref, trabajoEnCurso,
  type ChipDelivery, type EnvioGps, type PedidoFeed,
} from './deliveryMovil';
import {
  LUGAR_LOS_PINOS, RECALCULAR_RUTA_M, calcularRuta, claveRuta, distanciaTxt, duracionTxt, masCercano, ordenarDisponibles, paradasRuta,
  entregaEnLosPinos, puntoLugar, puntoRecogida, urlGoogleMapsRuta, yaRecogido, type ParadaRuta, type PuntoMapa, type RutaCalculada,
} from './deliveryRutas';
import { MapaMotorizado, type DestinoMapa } from './MapaMotorizado';
import { usePosicionGps, type PosicionGps } from './usePosicionGps';
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
  { key: 'en_ruta', label: '🚚 En camino' },
  { key: 'entregados', label: '✅ Entregados' },
];

/** `clave` = orden + origen (la misma SP puede traer su retiro de Almacén y su OC). */
type Accion = { tipo: 'cancelar' | 'entregar' | 'no_disponible'; clave: string };

export function DeliveryMovilView({ canal = 'delivery' }: { canal?: CanalDelivery } = {}) {
  // 04/11/2026: la misma pantalla sirve a Carga pesada (su rol solo ve sus pedidos).
  const cfgCanal = CANALES_DELIVERY[canal];
  const { user } = useSession();
  const { can, appUser, soloTelefono, vistasTelefono } = usePermissions();
  const quienDe = useQuien();
  const canWrite = can(cfgCanal.modulo, 'escritura');
  const actor = user?.email ?? 'sistema';
  const actorName = nombreYApellido(appUser?.nombre, appUser?.apellido) || user?.email || null;
  const quien = quienDe(null, actor) || actorName || actor;
  const conectado = useDeliveryConectado();

  const [activos, setActivos] = useState<PedidoDelivery[]>([]);
  const [cerrados, setCerrados] = useState<PedidoDelivery[]>([]);
  const [rechazos, setRechazos] = useState<RechazoDelivery[]>([]);
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
      listPedidosDelivery(false, canal),
      listPedidosDelivery(true, canal).catch(() => [] as PedidoDelivery[]),
    ]);
    // Los «No disponible» de lo que está por tomar (lo que yo marqué ya no me sale).
    const r = await listRechazosDelivery(a.filter((p) => p.estado === 'por_tomar' || p.estado === 'cancelado').map((p) => p.orden_id))
      .catch(() => [] as RechazoDelivery[]);
    if (mio !== turno.current) return;
    setActivos(a);
    setCerrados(c);
    setRechazos(r);
  }, [canal]);

  useEffect(() => {
    let vivo = true;
    reload().catch((e) => { if (vivo) toast(errMsg(e, 'No se pudieron cargar los pedidos'), 'error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [reload]);
  useRealtime(['delivery_pedidos', 'delivery_rechazos', 'ordenes', 'solicitudes_revision_almacen'], () => { void reload().catch(() => {}); });


  const uid = user?.id ?? null;
  const feedBase = useMemo(() => armarFeed(activos, cerrados, rechazadosPor(rechazos, uid)), [activos, cerrados, rechazos, uid]);

  /* 03/11/2026 · Mi ubicación, proveedor más cercano y ruta. */
  const gps = usePosicionGps(true);
  const yo = gps.pos;
  const idsProveedores = useMemo(() => activos.map((p) => p.proveedor_id), [activos]);
  const { provs, lugares } = useUbicacionesRuta(idsProveedores);
  const losPinos = useMemo(() => puntoLugar(lugares, LUGAR_LOS_PINOS), [lugares]);
  // Distancia de donde estoy a donde se busca cada pedido (proveedor o Los Pinos).
  const distancias = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const f of feedBase) {
      const punto = puntoRecogida(f.p, provs, losPinos);
      m.set(claveDelivery(f.p), yo && punto ? distanciaMetros(yo, punto) : null);
    }
    return m;
  }, [feedBase, provs, losPinos, yo]);
  const distDe = useCallback((p: PedidoDelivery) => distancias.get(claveDelivery(p)) ?? null, [distancias]);
  // «Por tomar»: urgentes primero y, dentro, del más cercano al más lejano (los disponibles van seguidos en el feed).
  const feed = useMemo(() => {
    const orden = ordenarDisponibles(feedBase.filter((f) => f.disponible), (f) => distDe(f.p));
    let i = 0;
    return feedBase.map((f) => (f.disponible ? orden[i++] : f));
  }, [feedBase, distDe]);
  const cercano = useMemo(() => masCercano(feed.filter((f) => f.disponible).map((f) => ({ item: f, metros: distDe(f.p) }))), [feed, distDe]);
  // Proveedores con OC por tomar en el mapa (uno por proveedor; los retiros van en Los Pinos).
  const destinosMapa = useMemo<DestinoMapa[]>(() => {
    const porProv = new Map<string, DestinoMapa>();
    for (const f of feed) {
      if (!f.disponible || esRetiroAlmacen(f.p) || !f.p.proveedor_id || porProv.has(f.p.proveedor_id)) continue;
      const punto = provs.get(f.p.proveedor_id);
      if (!punto) continue;
      porProv.set(f.p.proveedor_id, {
        clave: claveDelivery(f.p), nombre: f.p.proveedor_nombre ?? 'Proveedor', punto, metros: distDe(f.p),
        cercano: !!cercano && cercano.item.p.proveedor_id === f.p.proveedor_id && !esRetiroAlmacen(cercano.item.p),
      });
    }
    return [...porProv.values()];
  }, [feed, provs, distDe, cercano]);

  const visibles = useMemo(() => feed.filter((f) => enChip(f, chip)), [feed, chip]);
  const cuenta = useMemo(() => Object.fromEntries(CHIPS.map((c) => [c.key, feed.filter((f) => enChip(f, c.key)).length])) as Record<ChipDelivery, number>, [feed]);
  const enCurso = trabajoEnCurso(feed);

  // Ruta: la que se eligió con «🧭 Ver ruta» o, si no, la del pedido en curso.
  const [rutaClave, setRutaClave] = useState<string | null>(null);
  const [rutaOculta, setRutaOculta] = useState(false);
  const claveRutaActiva = rutaClave ?? (!rutaOculta && enCurso ? claveDelivery(enCurso) : null);
  const feedRuta = claveRutaActiva ? feed.find((f) => claveDelivery(f.p) === claveRutaActiva) ?? null : null;
  // Lo entregado o cancelado ya no lleva ruta.
  const pedidoRuta = feedRuta && (feedRuta.disponible || feedRuta.p.estado === 'aceptado' || feedRuta.p.estado === 'en_ruta') ? feedRuta.p : null;
  // El punto de partida solo se mueve al andar más de 400 m (no se le pide a OSRM a cada paso).
  const [yoRuta, setYoRuta] = useState<PuntoMapa | null>(null);
  useEffect(() => {
    if (!yo) return;
    setYoRuta((prev) => (!prev || distanciaMetros(prev, yo) > RECALCULAR_RUTA_M ? { lat: yo.lat, lng: yo.lng } : prev));
  }, [yo]);
  const paradas = useMemo(() => (pedidoRuta ? paradasRuta(pedidoRuta, yoRuta, provs, losPinos) : []), [pedidoRuta, yoRuta, provs, losPinos]);
  const claveParadas = claveRuta(paradas.map((x) => x.punto));
  const paradasRef = useRef(paradas);
  useEffect(() => { paradasRef.current = paradas; });
  const [rutaCalc, setRutaCalc] = useState<{ clave: string; ruta: RutaCalculada } | null>(null);
  useEffect(() => {
    const ps = paradasRef.current;
    if (ps.length < 2) return;
    let vivo = true;
    void calcularRuta(ps.map((x) => x.punto)).then((r) => { if (vivo) setRutaCalc({ clave: claveParadas, ruta: r }); });
    return () => { vivo = false; };
  }, [claveParadas]);
  const rutaVigente = rutaCalc && rutaCalc.clave === claveParadas && paradas.length >= 2 ? rutaCalc.ruta : null;
  const rutaMapa = useMemo(() => (pedidoRuta ? { ruta: rutaVigente, paradas } : null), [pedidoRuta, rutaVigente, paradas]);

  function verRuta(p: PedidoDelivery) {
    setRutaClave(claveDelivery(p));
    setRutaOculta(false);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* navegador viejo */ }
  }
  function quitarRuta() { setRutaClave(null); setRutaOculta(true); }
  const accionFeed = accion ? feed.find((f) => claveDelivery(f.p) === accion.clave) ?? null : null;
  const pedidoAccion = accionFeed?.p ?? null;

  // Si el pedido de la acción cambió (otra pestaña, otro motorizado, la PC), se vuelve a la lista.
  useEffect(() => {
    if (!accion || loading) return;
    const sigue = accion.tipo === 'no_disponible'
      ? !!accionFeed?.disponible
      : !!pedidoAccion && pedidoAccion.es_mio && ['aceptado', 'en_ruta'].includes(pedidoAccion.estado);
    if (!sigue) setAccion(null);
  }, [accion, accionFeed, pedidoAccion, loading]);

  function hecho(titulo: string, texto: string) {
    setAccion(null);
    setListo({ titulo, texto });
    void reload().catch(() => {});
  }
  function volver() { setAccion(null); setListo(null); }

  // Aceptar: queda directo EN CAMINO (si otro se adelantó, la base dice quién).
  async function tomar(p: PedidoDelivery) {
    setOcupado(claveDelivery(p));
    try {
      await tomarPedido(p.orden_id, p.origen ?? 'compra');
      toast(`Aceptaste ${esRetiroAlmacen(p) ? `el retiro ${p.codigo}` : `la orden ${ocDe(p)}`}: va en camino.`, 'success');
      // 03/11/2026: tras aceptarlo, el mapa muestra su ruta.
      setRutaClave(claveDelivery(p));
      setRutaOculta(false);
      hecho('En camino', mensajeAceptado(p, quien));
    } catch (e) {
      toast(errMsg(e, 'No se pudo aceptar el pedido'), 'error');
      void reload().catch(() => {});
    } finally { setOcupado(null); }
  }

  // Pedidos viejos que quedaron «Aceptado» (antes del 02/11/2026) todavía se pueden pasar a «En camino».
  async function enRuta(p: PedidoDelivery) {
    if (!p.pedido_id) return;
    setOcupado(claveDelivery(p));
    try {
      await marcarEnRuta(p.pedido_id);
      toast('Marcado en camino.', 'success');
      hecho('En camino', mensajeEnRuta(p, quien));
    } catch (e) {
      toast(errMsg(e, 'No se pudo marcar en camino'), 'error');
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
          <h1>{cfgCanal.icono} {tituloPantallaCanal(canal)}</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}><Quien nombre={null} correo={actor} vacio={actorName ?? actor} /></div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {!soloTelefono && <Link to={cfgCanal.ruta} className="btn btn-ghost">🖥 Módulo completo</Link>}
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

      {/* 03/11/2026: mapa con mi ubicación, los proveedores por tomar y la ruta. */}
      <MapaMotorizado yo={yo} destinos={destinosMapa} losPinos={losPinos} ruta={rutaMapa}
        onElegir={(k) => { const f = feed.find((x) => claveDelivery(x.p) === k); if (f) verRuta(f.p); }} />
      {gps.error && !yo && (
        <div className="aviso warning sm dlv-gps-aviso">
          <span className="aviso-icono">📍</span>
          <div>{gps.error} <span className="muted">Puedes seguir trabajando: los pedidos salen igual, sin distancias ni «más cercano».</span></div>
        </div>
      )}
      {pedidoRuta && (
        <PanelRuta p={pedidoRuta} paradas={paradas} ruta={rutaVigente} yo={yo} losPinos={losPinos}
          puedeMarcarPinos={canWrite} onQuitar={quitarRuta} />
      )}

      {canWrite && <CompartirUbicacion pedido={enCurso} gps={gps} />}

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
        <FormEntregar p={pedidoAccion} quien={quien} onCancel={volver} onHecho={hecho} />
      )}
      {accion?.tipo === 'no_disponible' && pedidoAccion && (
        <NoDisponibleModal p={pedidoAccion} quien={quien} onCancel={volver} onHecho={hecho} />
      )}

      {(enPantallaPrincipal || accion?.tipo === 'no_disponible') && (
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

          {/* 03/11/2026: el más cercano de lo que está por tomar, como en las apps de delivery. */}
          {cercano && (chip === 'todos' || chip === 'por_tomar') && (
            <button type="button" className="dlv-cercano" onClick={() => verRuta(cercano.item.p)}>
              <span className="grande" aria-hidden>📍</span>
              <span style={{ minWidth: 0 }}>
                <small>Más cercano a ti</small>
                <strong>
                  {esRetiroAlmacen(cercano.item.p) ? `📦 Retiro en ${ALMACEN_RETIRO}` : (cercano.item.p.proveedor_nombre ?? 'Proveedor')} · {distanciaTxt(cercano.metros)}
                </strong>
                <small>{esRetiroAlmacen(cercano.item.p) ? cercano.item.p.codigo : ocDe(cercano.item.p)} · toca para ver la ruta</small>
              </span>
            </button>
          )}

          {visibles.map((f) => {
            const k = claveDelivery(f.p);
            const sinPunto = !esRetiroAlmacen(f.p) && !!f.p.proveedor_id && !provs.has(f.p.proveedor_id);
            return (
              <TarjetaPedido key={k} f={f} canWrite={canWrite} ocupado={ocupado === k} bloqueado={!!ocupado}
                metros={distDe(f.p)} sinPunto={sinPunto} yo={yo} rutaActiva={claveRutaActiva === k && !!pedidoRuta}
                onRuta={() => verRuta(f.p)}
                onTomar={() => void tomar(f.p)}
                onNoDisponible={() => { setListo(null); setAccion({ tipo: 'no_disponible', clave: k }); }}
                onEnRuta={() => void enRuta(f.p)}
                onCancelar={() => { setListo(null); setAccion({ tipo: 'cancelar', clave: k }); }}
                onEntregar={() => { setListo(null); setAccion({ tipo: 'entregar', clave: k }); }}
                onVerMensaje={() => verMensaje(f.p)}
                onComprobante={() => setComprobanteDe(f.p)}
                onReporte={() => {
                  setAccion(null);
                  setListo({ titulo: `Reporte del pedido ${esRetiroAlmacen(f.p) ? f.p.codigo : ocDe(f.p)}`, texto: textoReportePedido(f.p, quienSync) });
                }}
                onFotos={() => void reload().catch(() => {})}
              />
            );
          })}
        </>
      )}

      {comprobanteDe && <ComprobantePago p={comprobanteDe} onClose={() => setComprobanteDe(null)} />}
    </div>
  );
}

/* ── Una orden en el listado ── */

function TarjetaPedido({ f, canWrite, ocupado, bloqueado, metros, sinPunto, yo, rutaActiva, onRuta, onTomar, onNoDisponible, onEnRuta, onCancelar, onEntregar, onVerMensaje, onComprobante, onReporte, onFotos }: {
  f: PedidoFeed; canWrite: boolean; ocupado: boolean; bloqueado: boolean;
  /** 03/11/2026: distancia de donde estoy a donde se busca (null = sin GPS o sin punto). */
  metros: number | null; sinPunto: boolean; yo: PosicionGps | null; rutaActiva: boolean; onRuta: () => void;
  onTomar: () => void; onNoDisponible: () => void; onEnRuta: () => void; onCancelar: () => void; onEntregar: () => void;
  onVerMensaje: () => void; onComprobante: () => void; onReporte: () => void; onFotos: () => void;
}) {
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [verOrden, setVerOrden] = useState(false);
  const [editarFotos, setEditarFotos] = useState(false);
  const { isAdmin } = usePermissions();
  function verPdf() {
    setGenerandoPdf(true);
    import('./deliveryPdf').then((m) => m.pdfPedidoDelivery(f.p))
      .catch((e) => toast(errMsg(e, 'No se pudo generar el PDF'), 'error'))
      .finally(() => setGenerandoPdf(false));
  }
  const { p, disponible } = f;
  const retiro = esRetiroAlmacen(p);
  const estado = disponible ? ESTADO_DELIVERY.por_tomar : ESTADO_DELIVERY[p.estado];
  const enCurso = !disponible && (p.estado === 'aceptado' || p.estado === 'en_ruta');
  const mioEnCurso = enCurso && p.es_mio;
  const items = (p.items ?? []).filter((i) => i.comprar !== false);
  const telProv = telHref(p.proveedor_telefono);
  const telAnalista = telHref(p.analista_telefono);
  const telSolicitante = telHref(p.solicitante_telefono);
  const mapa = mapaHref(p.proveedor_direccion);
  const destino = destinoRetiro(p);
  // Lo mío, en cualquier paso (si está libre otra vez y es mío, es porque yo lo cancelé).
  const puedeVerMensaje = p.es_mio;

  return (
    <article className={`dlv-card${mioEnCurso ? ' mio' : ''}${p.urgente ? ' urgente' : ''}`}>
      <div className="dlv-card-cab">
        <div style={{ minWidth: 0 }}>
          <div className="dlv-oc">{retiro ? p.codigo : ocDe(p)}</div>
          {!retiro && p.pagada_en && <div className="dlv-sub">Pagada {fechaHoraVE(p.pagada_en)}</div>}
          {retiro && p.revisada_en && <div className="dlv-sub">Revisada en Almacén {fechaHoraVE(p.revisada_en)}</div>}
        </div>
        <div className="dlv-badges">
          {p.urgente && <span className="badge danger">🚨 Urgente</span>}
          <span className={`badge ${estado.badge}`}>{estado.emoji} {disponible ? estado.label : etiquetaEstado(p.estado, p.origen, p.motivo_cancel)}</span>
        </div>
      </div>

      {retiro ? (
        <div className="dlv-prov">
          <div className="nombre">📦 Retiro en {ALMACEN_RETIRO}</div>
          {p.analista_nombre && <div className="dlv-sub">Revisó: {p.analista_nombre}</div>}
          <div className="dlv-sub">🏬 Entregar a: <strong>{destino || '—'}</strong></div>
        </div>
      ) : (
        <div className="dlv-prov">
          <div className="nombre">🏭 {p.proveedor_nombre ?? 'Proveedor sin nombre'}</div>
          {p.proveedor_contacto && <div className="dlv-sub">Contacto: {p.proveedor_contacto}</div>}
          {p.proveedor_direccion && (mapa
            ? <a className="dir" href={mapa} target="_blank" rel="noopener noreferrer">📍 {p.proveedor_direccion}</a>
            : <div className="dlv-sub">📍 {p.proveedor_direccion}</div>)}
          {!p.proveedor_direccion && <div className="dlv-sub">Sin dirección cargada: pregúntale al analista.</div>}
        </div>
      )}
      {/* 03/11/2026: a cuánto está (proveedor o Los Pinos) y, si el proveedor no está en el mapa, marcarlo al llegar. */}
      {(disponible || enCurso) && (
        metros != null
          ? <div className="dlv-dist">📍 a {distanciaTxt(metros)}{retiro ? ` de ${ALMACEN_RETIRO}` : ''}</div>
          : sinPunto ? <div className="dlv-dist sin">📍 Proveedor sin ubicación en el mapa</div> : null
      )}
      {mioEnCurso && !retiro && sinPunto && canWrite && p.proveedor_id && (
        <MarcarProveedorAqui proveedorId={p.proveedor_id} nombre={p.proveedor_nombre ?? 'el proveedor'} yo={yo} />
      )}

      {mioEnCurso && !retiro && (
        <div className="dlv-llamar">
          {telProv
            ? <a className="btn btn-ghost btn-grande" href={telProv}>📞 Llamar proveedor<small>{p.proveedor_telefono}</small></a>
            : <span className="btn btn-ghost btn-grande" aria-disabled>📞 Proveedor<small>sin teléfono</small></span>}
          {telAnalista
            ? <a className="btn btn-ghost btn-grande" href={telAnalista}>📞 Llamar analista<small>{p.analista_nombre ?? p.analista_email ?? ''}</small></a>
            : <span className="btn btn-ghost btn-grande" aria-disabled>📞 {p.analista_nombre ?? 'Analista'}<small>sin teléfono</small></span>}
        </div>
      )}
      {mioEnCurso && retiro && (
        <div className="dlv-llamar">
          {telAnalista
            ? <a className="btn btn-ghost btn-grande" href={telAnalista}>📞 Llamar almacenista<small>{p.analista_nombre ?? p.analista_email ?? ''}</small></a>
            : <span className="btn btn-ghost btn-grande" aria-disabled>📞 {p.analista_nombre ?? 'Almacenista'}<small>sin teléfono</small></span>}
          {telSolicitante
            ? <a className="btn btn-ghost btn-grande" href={telSolicitante}>📞 Llamar a quien lo pidió<small>{p.solicitante_nombre ?? ''}</small></a>
            : <span className="btn btn-ghost btn-grande" aria-disabled>📞 {p.solicitante_nombre ?? 'Solicitante'}<small>sin teléfono</small></span>}
        </div>
      )}

      {/* 02/11/2026: la tarjeta solo dice cuántos productos trae; la lista se despliega con «Ver orden». */}
      <div className="dlv-sub" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>{productosTxt(items.length)}</strong>
        {!!items.length && (
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={verOrden} onClick={() => setVerOrden((v) => !v)}>
            {verOrden ? '📋 Ocultar orden' : '📋 Ver orden'}
          </button>
        )}
      </div>
      {verOrden && !!items.length && (
        <ul className="dlv-items">
          {items.map((i, k) => (
            <li key={`${i.nombre}-${k}`}><span>{i.nombre}</span><span>{cant(i.cantidad)}{i.unidad ? ` ${i.unidad}` : ''}</span></li>
          ))}
        </ul>
      )}
      {!retiro && <div className="dlv-total"><span>Total</span><span>{montoTxt(p.total, p.moneda)}</span></div>}
      {!retiro && (p.almacen_entrega || p.almacen_destino) && (
        <div className="dlv-sub">🏬 {p.estado === 'entregado' ? 'Entregado en' : 'Entregar en'}: <strong>{nombreAlmacenVisible(p.almacen_entrega ?? p.almacen_destino)}</strong></div>
      )}
      {!retiro && etiquetaSedeEntrega(p.sede_entrega) && (
        <div className="dlv-sub">📍 Dirección de recepción: <strong>Almacén {etiquetaSedeEntrega(p.sede_entrega)}</strong></div>
      )}
      {retiro && p.estado === 'entregado' && p.almacen_entrega && (
        <div className="dlv-sub">🏬 Entregado a: <strong>{p.almacen_entrega}</strong></div>
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

      {/* 02/11/2026: al aceptar queda «En camino»: ahí se suben las fotos al recibir / retirar y las de la entrega. */}
      {(p.fotos_recibo.length > 0 || mioEnCurso) && (
        <FotosPedido p={p} tipo="recibo" puedeSubir={canWrite && mioEnCurso} onCambio={onFotos} />
      )}
      {(p.fotos_entrega.length > 0 || (mioEnCurso && p.estado === 'en_ruta')) && (
        <FotosPedido p={p} tipo="entrega" puedeSubir={canWrite && mioEnCurso && p.estado === 'en_ruta'} onCambio={onFotos} />
      )}

      <div className="dlv-acciones">
        {(disponible || mioEnCurso) && (
          <button type="button" className={`btn ${rutaActiva ? 'btn-primary' : 'btn-ghost'}`} onClick={onRuta}>
            {rutaActiva ? '🧭 Ruta en el mapa ↑' : '🧭 Ver ruta'}
          </button>
        )}
        {!retiro && <button type="button" className="btn btn-ghost" onClick={onComprobante}>🧾 Ver comprobante de pago</button>}
        {canWrite && disponible && (
          <div className="surt-grid2">
            <button type="button" className="btn btn-primary" disabled={bloqueado} onClick={onTomar}>
              {ocupado ? 'Aceptando…' : '✓ Aceptar pedido'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={bloqueado} onClick={onNoDisponible} style={{ color: 'var(--danger)' }}>
              ✕ No disponible
            </button>
          </div>
        )}
        {canWrite && mioEnCurso && p.estado === 'aceptado' && (
          <button type="button" className="btn btn-primary" disabled={bloqueado} onClick={onEnRuta}>
            {ocupado ? 'Guardando…' : '🚚 Marcar en camino'}
          </button>
        )}
        {canWrite && mioEnCurso && p.estado === 'en_ruta' && (
          <button type="button" className="btn btn-success" disabled={bloqueado} onClick={onEntregar}>
            {retiro ? '📦 Entregado' : '📦 Entregado en almacén'}
          </button>
        )}
        {canWrite && mioEnCurso && (
          <button type="button" className="btn btn-ghost" disabled={bloqueado} onClick={onCancelar} style={{ color: 'var(--danger)' }}>
            ✕ No puedo buscarlo
          </button>
        )}
        {puedeVerMensaje && (
          <button type="button" className="btn btn-ghost" onClick={onVerMensaje}>💬 Ver mensaje de WhatsApp</button>
        )}
        {/* 03/11/2026: el motorizado que lo entregó (o admin) corrige las fotos de un pedido entregado. */}
        {!disponible && puedeEditarFotosDelivery(p, isAdmin, false) && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditarFotos(true)}>✏ Editar fotos</button>
        )}
        {/* GT: reporte del pedido (PDF con vista previa y WhatsApp) en cuanto alguien lo tomó. */}
        {!!p.pedido_id && !disponible && (
          <div className="surt-grid2">
            <button type="button" className="btn btn-ghost" disabled={generandoPdf} onClick={verPdf}>{generandoPdf ? 'Generando…' : '📄 Ver PDF'}</button>
            <button type="button" className="btn btn-ghost" onClick={onReporte}>📋 Reporte WhatsApp</button>
          </div>
        )}
      </div>
      {editarFotos && p.pedido_id && (
        <EditarFotosDeliveryModal pedidoId={p.pedido_id} origen={p.origen} titulo={retiro ? p.codigo : ocDe(p)}
          fotosRecibo={p.fotos_recibo} fotosEntrega={p.fotos_entrega}
          onClose={() => setEditarFotos(false)} onGuardado={onFotos} />
      )}
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
  const titulo = tipo === 'recibo'
    ? (esRetiroAlmacen(p) ? '📷 Fotos al retirar en Almacén' : '📷 Fotos al recibir')
    : '📷 Fotos de la entrega';
  const id = `dlv-fotos-${tipo}-${claveDelivery(p).replace(':', '-')}`;

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
      toast(`Cancelaste ${esRetiroAlmacen(p) ? `el retiro ${p.codigo}` : `la orden ${ocDe(p)}`}. Queda libre para otro delivery.`, 'success');
      onHecho(esRetiroAlmacen(p) ? 'Retiro cancelado' : 'Pedido cancelado', mensajeCancelado(p, quien, motivo, detalle));
    } catch (err) {
      toast(errMsg(err, 'No se pudo cancelar el pedido'), 'error');
    } finally { setGuardando(false); }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>⛔</span>
        <div><strong>No puedo buscarlo</strong><div className="muted" style={{ fontSize: '.85rem' }}>{esRetiroAlmacen(p) ? p.codigo : ocDe(p)} · {esRetiroAlmacen(p) ? ALMACEN_RETIRO : (p.proveedor_nombre ?? '—')}</div></div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>
        {esRetiroAlmacen(p) ? 'El retiro' : 'La orden'} vuelve a quedar libre para que lo tome otro delivery. Elige el motivo:
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

function FormEntregar({ p, quien, onCancel, onHecho }: {
  p: PedidoDelivery; quien: string; onCancel: () => void; onHecho: (titulo: string, texto: string) => void;
}) {
  // 02/11/2026: el retiro de Almacén se entrega A una unidad / persona, no en un almacén.
  if (esRetiroAlmacen(p)) return <FormEntregarRetiro p={p} quien={quien} onCancel={onCancel} onHecho={onHecho} />;
  return <FormEntregarAlmacen p={p} quien={quien} onCancel={onCancel} onHecho={onHecho} />;
}

function FormEntregarRetiro({ p, quien, onCancel, onHecho }: {
  p: PedidoDelivery; quien: string; onCancel: () => void; onHecho: (titulo: string, texto: string) => void;
}) {
  const [entregadoA, setEntregadoA] = useState(destinoRetiro(p));
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const falta = entregadoA.trim().length < 2;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p.pedido_id) return;
    if (falta) { toast('Escribe a quién se lo entregaste (unidad o persona).', 'error'); return; }
    setGuardando(true);
    try {
      await marcarEntregado(p.pedido_id, entregadoA.trim(), nota.trim() || null);
      toast(`Retiro ${p.codigo} entregado.`, 'success');
      onHecho('Retiro entregado', mensajeEntregado(p, quien, entregadoA.trim(), nota));
    } catch (err) {
      toast(errMsg(err, 'No se pudo marcar la entrega'), 'error');
    } finally { setGuardando(false); }
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>📦</span>
        <div><strong>Entregado</strong><div className="muted" style={{ fontSize: '.85rem' }}>{p.codigo} · Retiro en {ALMACEN_RETIRO}</div></div>
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-ent-a">Entregado a (unidad o persona)</label>
        <input id="dlv-ent-a" className="input surt-input" value={entregadoA} onChange={(e) => setEntregadoA(e.target.value)}
          placeholder="Ej.: PRODUCCION · Ender Mejía" />
        {destinoRetiro(p) && <small className="muted">La solicitud la pidió {destinoRetiro(p)}.</small>}
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-ent-nota-r">Nota (opcional)</label>
        <textarea id="dlv-ent-nota-r" className="input surt-input" rows={3} value={nota}
          placeholder="Ej.: lo recibió el jefe de turno" onChange={(e) => setNota(e.target.value)} />
      </div>
      {!p.fotos_entrega.length && (
        <div className="aviso warning sm"><span className="aviso-icono">📷</span><div>Todavía no subiste fotos de la entrega. Puedes volver y agregarlas antes de confirmar.</div></div>
      )}
      <div className="surt-grid2">
        <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
        <button type="submit" className="btn btn-primary btn-grande" disabled={guardando || falta}>
          {guardando ? 'Guardando…' : '✅ Confirmar entrega'}
        </button>
      </div>
    </form>
  );
}

/* ── No disponible (pedido por tomar): motivo obligatorio ── */

function NoDisponibleModal({ p, quien, onCancel, onHecho }: {
  p: PedidoDelivery; quien: string; onCancel: () => void; onHecho: (titulo: string, texto: string) => void;
}) {
  const [opcion, setOpcion] = useState('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esOtro = opcion === MOTIVOS_NO_DISPONIBLE[MOTIVOS_NO_DISPONIBLE.length - 1];
  const motivo = opcion ? motivoNoDisponible(opcion, detalle) : '';
  const falta = motivo.trim().length < 3;
  const retiro = esRetiroAlmacen(p);

  async function guardar() {
    if (falta) { toast(esOtro ? 'Escribe cuál es el motivo.' : 'Elige el motivo.', 'error'); return; }
    setGuardando(true);
    try {
      await rechazarPedido(p.orden_id, p.origen ?? 'compra', motivo);
      toast('Marcado como no disponible. Sigue libre para otro delivery.', 'success');
      onHecho('No disponible', mensajeNoDisponible(p, quien, motivo));
    } catch (err) {
      toast(errMsg(err, 'No se pudo guardar'), 'error');
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={`✕ No disponible · ${retiro ? p.codigo : ocDe(p)}`} onClose={onCancel} minimizable={false}
      footer={(
        <div className="surt-grid2" style={{ width: '100%' }}>
          <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
          <button type="button" className="btn btn-peligro btn-grande" onClick={() => void guardar()} disabled={guardando || falta}>
            {guardando ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      )}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        {retiro ? `Retiro en ${ALMACEN_RETIRO}` : (p.proveedor_nombre ?? '—')}. El pedido sigue disponible para los demás delivery;
        a ti ya no te saldrá en «Por tomar». Elige el motivo:
      </p>
      <div className="dlv-motivos" role="radiogroup" aria-label="Motivo">
        {MOTIVOS_NO_DISPONIBLE.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={opcion === m}
            className={`dlv-motivo${opcion === m ? ' sel' : ''}`} onClick={() => setOpcion(m)}>
            <span aria-hidden>{opcion === m ? '●' : '○'}</span> {m}
          </button>
        ))}
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-nodisp-detalle">Detalle {esOtro ? '(obligatorio)' : '(opcional)'}</label>
        <textarea id="dlv-nodisp-detalle" className="input surt-input" rows={3} value={detalle}
          placeholder="Ej.: estoy llevando otra orden a Los Pinos" onChange={(e) => setDetalle(e.target.value)} />
      </div>
    </Modal>
  );
}

/**
 * 02/11/2026: la OC entregada queda RECIBIDA en Inventario (la base hace la recepción completa:
 * stock, kardex y estado de la orden). Entra al almacén de la OC; sin almacén, al General
 * = Almacén Los Pinos. Por eso ya no se elige el almacén aquí.
 */
function FormEntregarAlmacen({ p, quien, onCancel, onHecho }: {
  p: PedidoDelivery; quien: string; onCancel: () => void; onHecho: (titulo: string, texto: string) => void;
}) {
  const almacen = almacenRecepcion(p);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!p.pedido_id) return;
    setGuardando(true);
    try {
      await marcarEntregado(p.pedido_id, almacen, nota.trim() || null);
      toast(`Orden ${ocDe(p)} entregada en ${almacenVisible(almacen)}: el almacenista la recepciona.`, 'success');
      onHecho('Entregado en almacén', mensajeEntregado(p, quien, almacenVisible(almacen), nota));
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
      <div className="aviso info sm">
        <span className="aviso-icono">📥</span>
        <div>Al confirmar, la orden queda <strong>entregada en {almacenVisible(almacen)}</strong> y le llega el aviso al almacenista, que la
          <strong> recepciona desde su teléfono</strong> (revisa lo que llegó y lo suma al inventario).</div>
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
        <button type="submit" className="btn btn-primary btn-grande" disabled={guardando}>
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

/** Una lectura del GPS más vieja que esto no se reenvía como «sigo aquí». */
const GPS_VIGENTE_MS = 2 * 60_000;

/**
 * 03/11/2026: el GPS ya lo lee usePosicionGps (uno solo para el mapa, la cercanía y esto);
 * acá solo se MANDA a la oficina mientras hay un pedido en curso: al moverse (50 m) o cada
 * 30 s. Quieto, el teléfono no manda lecturas nuevas: cada 30 s se reenvía la última (si
 * tiene menos de 2 min) para que la PC no lo vea «sin señal».
 */
function CompartirUbicacion({ pedido, gps }: { pedido: PedidoDelivery | null; gps: { pos: PosicionGps | null; error: string | null } }) {
  const [quiere, setQuiere] = useState(leerGps);
  const [enviado, setEnviado] = useState<{ t: number; precision: number | null } | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const activo = quiere && !!pedido;
  const error = errorEnvio ?? gps.error;

  const pedidoId = useRef<string | null>(null);
  useEffect(() => { pedidoId.current = pedido?.pedido_id ?? null; }, [pedido?.pedido_id]);
  const ultimo = useRef<EnvioGps | null>(null);
  const enviando = useRef(false);
  const posRef = useRef<PosicionGps | null>(gps.pos);
  useEffect(() => { posRef.current = gps.pos; }, [gps.pos]);

  const enviar = useCallback((pos: PosicionGps, forzarHora = false) => {
    const punto: EnvioGps = { lat: pos.lat, lng: pos.lng, t: forzarHora ? Date.now() : pos.t };
    if (enviando.current || !debeEnviarUbicacion(ultimo.current, punto)) return;
    enviando.current = true;
    ultimo.current = punto;
    compartirUbicacion({ lat: pos.lat, lng: pos.lng, precision: pos.precision, velocidad: pos.velocidad, rumbo: pos.rumbo }, pedidoId.current)
      .then(() => { setEnviado({ t: punto.t, precision: pos.precision }); setErrorEnvio(null); })
      .catch((e) => setErrorEnvio(errMsg(e, 'No se pudo compartir la ubicación.')))
      .finally(() => { enviando.current = false; });
  }, []);

  useEffect(() => {
    if (activo && gps.pos) enviar(gps.pos);
  }, [activo, gps.pos, enviar]);

  useEffect(() => {
    if (!activo) { ultimo.current = null; return; }
    const t = setInterval(() => {
      const p = posRef.current;
      if (p && Date.now() - p.t < GPS_VIGENTE_MS) enviar(p, true);
    }, 30_000);
    return () => clearInterval(t);
  }, [activo, enviar]);

  function setError(v: string | null) { setErrorEnvio(v); }

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

/* ── 03/11/2026 · La ruta elegida (debajo del mapa) ── */

function PanelRuta({ p, paradas, ruta, yo, losPinos, puedeMarcarPinos, onQuitar }: {
  p: PedidoDelivery; paradas: ParadaRuta[]; ruta: RutaCalculada | null; yo: PosicionGps | null; losPinos: PuntoMapa | null;
  puedeMarcarPinos: boolean; onQuitar: () => void;
}) {
  const retiro = esRetiroAlmacen(p);
  const destinos = paradas.filter((x) => x.tipo !== 'yo');
  const conYo = paradas[0]?.tipo === 'yo';
  const google = urlGoogleMapsRuta(paradas.map((x) => x.punto), conYo)
    ?? (!retiro && !yaRecogido(p) ? mapaHref(p.proveedor_direccion) : null);
  const faltaProveedor = !retiro && !yaRecogido(p) && !destinos.some((x) => x.tipo === 'recogida');
  const faltaPinos = !losPinos && (retiro ? !yaRecogido(p) : entregaEnLosPinos(p));
  const calculando = paradas.length >= 2 && !ruta;

  return (
    <section className="dlv-ruta" aria-label="Ruta">
      <div className="dlv-ruta-cab">
        <div style={{ minWidth: 0 }}>
          <strong>🧭 Ruta · {retiro ? p.codigo : ocDe(p)}</strong>
          {destinos.length > 0 && (
            <ol className="dlv-ruta-tramos">
              {!conYo && <li className="muted">Sin tu ubicación: arranca en la primera parada.</li>}
              {destinos.map((x) => <li key={`${x.tipo}-${x.nombre}`}>{x.tipo === 'entrega' ? '🏬 Entregar en' : retiro ? '📦 Retirar en' : '🏭 Buscar en'} {x.nombre}</li>)}
            </ol>
          )}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onQuitar} aria-label="Quitar la ruta" style={{ minHeight: 36 }}>✕</button>
      </div>
      {ruta && (
        <div className="dlv-ruta-total">
          {distanciaTxt(ruta.metros)}{ruta.segundos != null ? ` · ${duracionTxt(ruta.segundos)}` : ''}
          {ruta.fuente === 'recta' && <div className="muted" style={{ fontSize: '.8rem', fontWeight: 500 }}>Sin servicio de rutas: línea recta (por calle es más). Usa Google Maps para navegar.</div>}
        </div>
      )}
      {calculando && <div className="muted" style={{ fontSize: '.85rem' }}>Calculando la ruta…</div>}
      {paradas.length < 2 && destinos.length === 0 && (
        <div className="muted" style={{ fontSize: '.85rem' }}>Todavía no hay puntos en el mapa para trazar esta ruta.</div>
      )}
      {faltaProveedor && (
        <div className="dlv-sub">📍 Este proveedor no está ubicado en el mapa. Al llegar, márcalo desde su tarjeta («Marcar ubicación del proveedor aquí»).</div>
      )}
      {faltaPinos && (
        <div className="dlv-sub">🏬 El {ALMACEN_RETIRO} todavía no está marcado en el mapa.</div>
      )}
      {faltaPinos && puedeMarcarPinos && <MarcarLosPinosAqui yo={yo} />}
      {google && (
        <a className="btn btn-primary" href={google} target="_blank" rel="noopener noreferrer">🗺 Abrir en Google Maps (paso a paso)</a>
      )}
    </section>
  );
}

/** Precisión del GPS con la que ya no conviene marcar un local (se avisa, no se bloquea). */
const PRECISION_DUDOSA_M = 80;

/** El motorizado llegó donde el proveedor (que no estaba en el mapa) y lo marca con su GPS. */
function MarcarProveedorAqui({ proveedorId, nombre, yo }: { proveedorId: string; nombre: string; yo: PosicionGps | null }) {
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // 03/11/2026: también por coordenadas escritas o un enlace de Google Maps (sin estar en el local).
  const [porCoords, setPorCoords] = useState(false);
  const [coordsTexto, setCoordsTexto] = useState('');
  const punto = parsearCoordenadas(coordsTexto);
  async function guardarPunto(p: { lat: number; lng: number }) {
    setGuardando(true);
    try {
      await ubicarProveedorDesdeDelivery(proveedorId, p);
      toast(`Ubicación de ${nombre} guardada. Ya sale en el mapa para todos y queda para los próximos pedidos.`, 'success');
      setConfirmar(false); setPorCoords(false); setCoordsTexto('');
    } catch (e) {
      toast(errMsg(e, 'No se pudo guardar la ubicación del proveedor'), 'error');
    } finally { setGuardando(false); }
  }
  async function guardar() {
    if (!yo) return;
    await guardarPunto({ lat: yo.lat, lng: yo.lng });
  }
  if (porCoords) {
    return (
      <div className="dlv-marcar">
        <div>Coordenadas de <strong>{nombre}</strong> (ej. <span className="mono">8.2869, -62.7467</span>) o pega el enlace de Google Maps:</div>
        <input className="input surt-input mono" value={coordsTexto} onChange={(e) => setCoordsTexto(e.target.value)}
          placeholder="8.2869, -62.7467" autoComplete="off" inputMode="text" />
        {coordsTexto.trim() && !punto && <div style={{ color: 'var(--warning)' }}>No se entienden esas coordenadas: escribe «latitud, longitud».</div>}
        <div className="surt-grid2">
          <button type="button" className="btn btn-ghost" onClick={() => { setPorCoords(false); setCoordsTexto(''); }} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => punto && void guardarPunto(punto)} disabled={guardando || !punto}>{guardando ? 'Guardando…' : 'Guardar ubicación'}</button>
        </div>
      </div>
    );
  }
  if (!yo) {
    return (
      <div className="surt-grid2">
        <div className="dlv-sub">📍 Activa el GPS para marcarlo al llegar, o escribe sus coordenadas.</div>
        <button type="button" className="btn btn-ghost" onClick={() => setPorCoords(true)}>⌨ Escribir coordenadas</button>
      </div>
    );
  }
  if (!confirmar) {
    return (
      <div className="surt-grid2">
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(true)}>📍 Marcar ubicación del proveedor aquí</button>
        <button type="button" className="btn btn-ghost" onClick={() => setPorCoords(true)}>⌨ Escribir coordenadas</button>
      </div>
    );
  }
  return (
    <div className="dlv-marcar">
      <div>¿Estás en el local de <strong>{nombre}</strong>? Se guarda tu ubicación actual como la del proveedor
        {yo.precision != null ? ` (precisión ± ${Math.round(yo.precision)} m)` : ''}.</div>
      {yo.precision != null && yo.precision > PRECISION_DUDOSA_M && (
        <div style={{ color: 'var(--warning)' }}>La señal está imprecisa: si puedes, sal a un lugar abierto y espera unos segundos.</div>
      )}
      <div className="surt-grid2">
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(false)} disabled={guardando}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Sí, marcar aquí'}</button>
      </div>
    </div>
  );
}

/** Igual, para el Almacén Los Pinos (solo si todavía no está marcado). */
function MarcarLosPinosAqui({ yo }: { yo: PosicionGps | null }) {
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    if (!yo) return;
    setGuardando(true);
    try {
      await fijarLugarDelivery(LUGAR_LOS_PINOS, { lat: yo.lat, lng: yo.lng });
      toast(`${ALMACEN_RETIRO} marcado en el mapa.`, 'success');
      setConfirmar(false);
    } catch (e) {
      toast(errMsg(e, 'No se pudo marcar el almacén'), 'error');
    } finally { setGuardando(false); }
  }
  if (!yo) return null;
  if (!confirmar) return <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(true)}>📍 Estoy en {ALMACEN_RETIRO}: marcarlo aquí</button>;
  return (
    <div className="dlv-marcar">
      <div>¿Estás en el <strong>{ALMACEN_RETIRO}</strong>? Se guarda tu ubicación actual{yo.precision != null ? ` (± ${Math.round(yo.precision)} m)` : ''}.</div>
      <div className="surt-grid2">
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(false)} disabled={guardando}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Sí, marcar aquí'}</button>
      </div>
    </div>
  );
}
