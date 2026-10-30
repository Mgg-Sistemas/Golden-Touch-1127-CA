/* ============================================================
   Golden Touch · Delivery · Vista de teléfono del motorizado (30/10/2026)
   Ruta: /app/delivery/telefono

   El motorizado, con el teléfono en la mano y en la moto:
   · Pedidos: «Por tomar» (OC pagadas que nadie tomó), «Mis pedidos»
     (aceptados / en ruta por él) y «Entregados» (los suyos, últimos 7 días).
     Cada tarjeta trae DEL + OC, proveedor (dirección y teléfono), lo que hay
     que buscar y los botones según el estado:
       por tomar → ✋ Aceptar
       aceptado  → 📷 Recibí el pedido · En ruta | ⚠ No puedo buscarlo
       en ruta   → ✅ Entregado en almacén | ⚠ No puedo… | 📷 Agregar fotos
     y siempre que lo tenga: 📞 / 💬 al analista que montó la OC.
     Cada acción deja su aviso listo para WhatsApp (delivery.ts).
   · Ruta GPS: «Compartir mi ubicación» (la PC lo ve en el mapa).
   · Mi perfil: cuántos aceptó, entregó y canceló.
   La base pone las reglas: si otro motorizado ya lo tomó, el RPC lo rechaza.
   ============================================================ */
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { nombreYApellido } from '@/shared/lib/directorioUsuarios';
import { toast } from '@/shared/ui/Toast';
import { dateTime, num } from '@/shared/lib/format';
import { MAX_FOTOS_DELIVERY, MOTIVOS_CANCELACION, type FotoDelivery } from './delivery.types';
import { mensajeAceptado, mensajeCancelado, mensajeEnRuta, mensajeEntregado, telLink, type PedidoDeliveryCompleto } from './delivery';
import {
  adjuntarFotos, aceptarPedido, cancelarPedido, marcarEnRuta, marcarEntregado, subirFotosDelivery,
} from './delivery.repository';
import { useDelivery } from './useDelivery';
import {
  ComprobantePago, ElegirFotos, FotosPedido, Listo, errMsg, useUbicacionDelivery, type EstadoGps, type GpsDelivery,
} from './DeliveryMovilPartes';
import './deliveryMovil.css';

type Seccion = 'pedidos' | 'gps' | 'perfil';
type Pestana = 'por_tomar' | 'mios' | 'entregados';
type Accion = 'aceptar' | 'en_ruta' | 'entregar' | 'cancelar' | 'fotos';

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const mismo = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function DeliveryMovilView() {
  const { user } = useSession();
  const { can, appUser, soloTelefono, vistasTelefono } = usePermissions();
  const canWrite = can('delivery', 'escritura');
  const yo = user?.email ?? '';
  const quien = nombreYApellido(appUser?.nombre, appUser?.apellido) || yo || 'Motorizado';

  const datos = useDelivery();
  const [seccion, setSeccion] = useState<Seccion>('pedidos');
  const [pestana, setPestana] = useState<Pestana>('por_tomar');
  const [accion, setAccion] = useState<{ tipo: Accion; id: string; foto: PedidoDeliveryCompleto } | null>(null);
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null);

  const pedidos = useMemo(() => datos.pedidos ?? [], [datos.pedidos]);
  const porTomar = useMemo(() => pedidos.filter((p) => p.estado === 'por_tomar'), [pedidos]);
  const tomadosPorOtro = useMemo(
    () => pedidos.filter((p) => (p.estado === 'aceptado' || p.estado === 'en_ruta') && !mismo(p.repartidor_email, yo)),
    [pedidos, yo],
  );
  const mios = useMemo(
    () => pedidos.filter((p) => (p.estado === 'aceptado' || p.estado === 'en_ruta') && mismo(p.repartidor_email, yo))
      // Primero el que va en ruta, luego por fecha de aceptado.
      .sort((a, b) => (a.estado === b.estado ? (a.aceptado_en ?? '').localeCompare(b.aceptado_en ?? '') : a.estado === 'en_ruta' ? -1 : 1)),
    [pedidos, yo],
  );
  const entregados = useMemo(() => {
    const desde = Date.now() - SIETE_DIAS_MS;
    return pedidos
      .filter((p) => p.estado === 'entregado' && mismo(p.repartidor_email, yo) && p.entregado_en && new Date(p.entregado_en).getTime() >= desde)
      .sort((a, b) => (b.entregado_en ?? '').localeCompare(a.entregado_en ?? ''));
  }, [pedidos, yo]);
  const enRuta = mios.find((p) => p.estado === 'en_ruta') ?? null;

  const gps = useUbicacionDelivery(enRuta?.id ?? null);

  /** El pedido de la acción en curso, fresco del realtime (o la copia si ya no está en la lista). */
  const pedidoAccion = accion ? (pedidos.find((p) => p.id === accion.id) ?? accion.foto) : null;
  const abrir = (tipo: Accion, p: PedidoDeliveryCompleto) => { setAviso(null); setAccion({ tipo, id: p.id, foto: p }); };
  const cerrar = () => setAccion(null);
  const terminado = (titulo: string, texto: string) => { setAccion(null); setAviso({ titulo, texto }); void datos.reload(); };
  const fallo = (e: unknown, d: string) => { toast(errMsg(e, d), 'error'); void datos.reload(); };
  const posicion = gps.ultima ? { lat: gps.ultima.lat, lng: gps.ultima.lng } : null;

  return (
    <div className="surtidor delivery-movil">
      <header className="surt-head">
        <div>
          <h1>🛵 Delivery</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{quien}</div>
          <EstadoMotorizado estado={gps.estado} />
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {!soloTelefono && <Link to="/app/delivery" className="btn btn-ghost">🖥 Módulo completo</Link>}
          {soloTelefono && vistasTelefono.length > 1 && <Link to="/app/telefono" className="btn btn-ghost">📱 Mis pantallas</Link>}
        </div>
      </header>

      {datos.loading && datos.activo == null && <p className="muted">Cargando…</p>}
      {datos.activo === false && (
        <div className="aviso info sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">🕒</span>
          <div>
            <strong>Delivery todavía no está activo.</strong> Se enciende cuando la gerencia arranque el nuevo flujo de Compras.
            Mientras tanto puedes probar el GPS en «Ruta GPS».
          </div>
        </div>
      )}
      {datos.error && (
        <div className="aviso danger sm" style={{ margin: '.5rem 0' }}><span className="aviso-icono">⚠</span><div>{datos.error}</div></div>
      )}
      {datos.activo && !canWrite && (
        <div className="aviso warning sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">👁</span>
          <div>Tu rol solo puede ver. Para tomar y entregar pedidos hace falta escritura en Delivery.</div>
        </div>
      )}

      {seccion === 'pedidos' && datos.activo && (
        <>
          {aviso && <Listo titulo={aviso.titulo} texto={aviso.texto} onListo={() => setAviso(null)} />}

          {!aviso && accion && pedidoAccion && (
            <>
              {accion.tipo === 'aceptar' && (
                <AccionAceptar p={pedidoAccion} quien={quien} posicion={posicion} onCancel={cerrar}
                  onHecho={terminado} onError={fallo} />
              )}
              {accion.tipo === 'en_ruta' && (
                <AccionEnRuta p={pedidoAccion} quien={quien} posicion={posicion} onCancel={cerrar}
                  onHecho={(t, x) => { terminado(t, x); if (!gps.activo) toast('Ya vas en ruta: activa «Compartir mi ubicación» en Ruta GPS.', 'info'); }}
                  onError={fallo} />
              )}
              {accion.tipo === 'entregar' && (
                <AccionEntregar p={pedidoAccion} quien={quien} posicion={posicion} onCancel={cerrar}
                  onHecho={terminado} onError={fallo} />
              )}
              {accion.tipo === 'cancelar' && (
                <AccionCancelar p={pedidoAccion} quien={quien} onCancel={cerrar} onHecho={terminado} onError={fallo} />
              )}
              {accion.tipo === 'fotos' && (
                <AccionFotos p={pedidoAccion} onCancel={cerrar}
                  onHecho={() => { cerrar(); toast('Fotos agregadas al pedido', 'success'); void datos.reload(); }}
                  onError={fallo} />
              )}
            </>
          )}

          {!aviso && !accion && (
            <>
              {enRuta && !gps.activo && (
                <button type="button" className="surt-btn primario dlv-gps-btn" style={{ marginBottom: '.75rem' }}
                  onClick={() => { gps.iniciar(); setSeccion('gps'); }}>
                  <span>📍 Compartir mi ubicación</span>
                  <small>Vas en ruta con {enRuta.codigo}: que la oficina te vea en el mapa</small>
                </button>
              )}

              <div className="dlv-tabs" role="tablist" aria-label="Pedidos">
                <BotonPestana sel={pestana === 'por_tomar'} onClick={() => setPestana('por_tomar')} texto={`Por tomar (${porTomar.length})`} />
                <BotonPestana sel={pestana === 'mios'} onClick={() => setPestana('mios')} texto={`Mis pedidos (${mios.length})`} />
                <BotonPestana sel={pestana === 'entregados'} onClick={() => setPestana('entregados')} texto="Entregados" sub="últimos 7 días" />
              </div>

              <section className="surt-lista" role="tabpanel">
                {pestana === 'por_tomar' && (
                  <>
                    {!datos.loading && !porTomar.length && <p className="muted">No hay pedidos por tomar. Los nuevos aparecen aquí solos apenas Tesorería los paga.</p>}
                    {porTomar.map((p) => (
                      <Tarjeta key={p.id} p={p} mio={false} canWrite={canWrite} onAccion={abrir} />
                    ))}
                    {tomadosPorOtro.length > 0 && (
                      <>
                        <h2>Ya tomados por otro motorizado ({tomadosPorOtro.length})</h2>
                        {tomadosPorOtro.map((p) => <Tarjeta key={p.id} p={p} mio={false} canWrite={false} onAccion={abrir} ajeno />)}
                      </>
                    )}
                  </>
                )}
                {pestana === 'mios' && (
                  <>
                    {!datos.loading && !mios.length && <p className="muted">No tienes pedidos tomados. Busca uno en «Por tomar».</p>}
                    {mios.map((p) => <Tarjeta key={p.id} p={p} mio canWrite={canWrite} onAccion={abrir} />)}
                  </>
                )}
                {pestana === 'entregados' && (
                  <>
                    {!datos.loading && !entregados.length && <p className="muted">No has entregado pedidos en los últimos 7 días.</p>}
                    {entregados.map((p) => <Tarjeta key={p.id} p={p} mio canWrite={false} onAccion={abrir} />)}
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}

      {seccion === 'gps' && <PanelGps gps={gps} enRuta={enRuta} />}
      {seccion === 'perfil' && <PanelPerfil datos={datos} yo={yo} quien={quien} />}

      <nav className="dlv-nav" aria-label="Secciones de Delivery">
        <button type="button" className={seccion === 'pedidos' ? 'sel' : ''} aria-current={seccion === 'pedidos' ? 'page' : undefined}
          onClick={() => setSeccion('pedidos')}>
          <span className="icono" aria-hidden>📦</span><span>Pedidos</span>
        </button>
        <button type="button" className={seccion === 'gps' ? 'sel' : ''} aria-current={seccion === 'gps' ? 'page' : undefined}
          onClick={() => setSeccion('gps')}>
          <span className="icono" aria-hidden>📍</span><span>Ruta GPS</span>
          {gps.estado === 'compartiendo' && <span className="punto" aria-label="Compartiendo ubicación" />}
        </button>
        <button type="button" className={seccion === 'perfil' ? 'sel' : ''} aria-current={seccion === 'perfil' ? 'page' : undefined}
          onClick={() => setSeccion('perfil')}>
          <span className="icono" aria-hidden>👤</span><span>Mi perfil</span>
        </button>
      </nav>
    </div>
  );
}

/* ─────────────── Encabezado y pestañas ─────────────── */

function EstadoMotorizado({ estado }: { estado: EstadoGps }) {
  if (estado === 'compartiendo') return <span className="dlv-estado activo">● Activo · compartiendo ubicación</span>;
  if (estado === 'pidiendo') return <span className="dlv-estado">◌ Buscando GPS…</span>;
  return <span className="dlv-estado">○ Sin compartir ubicación</span>;
}

function BotonPestana({ sel, onClick, texto, sub }: { sel: boolean; onClick: () => void; texto: string; sub?: string }) {
  return (
    <button type="button" role="tab" aria-selected={sel} className={`dlv-tab${sel ? ' sel' : ''}`} onClick={onClick}>
      {texto}
      {sub && <small>{sub}</small>}
    </button>
  );
}

/* ─────────────── Tarjeta de pedido ─────────────── */

function Tarjeta({ p, mio, canWrite, onAccion, ajeno }: {
  p: PedidoDeliveryCompleto; mio: boolean; canWrite: boolean; ajeno?: boolean;
  onAccion: (tipo: Accion, p: PedidoDeliveryCompleto) => void;
}) {
  const urgente = !!p.orden?.urgente;
  const oc = p.orden?.oc_codigo || p.orden?.codigo;
  const items = (p.orden?.items ?? []).filter((it) => it.comprar !== false);
  const telProv = p.proveedor?.telefono ? telLink(p.proveedor.telefono) : null;
  const telAnalista = p.analista?.telefono ? telLink(p.analista.telefono) : null;
  const nombreAnalista = p.analista?.nombre?.trim() || 'el analista';
  const fotosRecibido = p.fotos_recibido ?? [];
  const fotosEntrega = p.fotos_entrega ?? [];

  return (
    <article className={`dlv-card ${p.estado}${urgente ? ' urgente' : ''}${ajeno ? ' ajeno' : ''}`} aria-label={`Pedido ${p.codigo}`}>
      <div className="dlv-card-cab">
        <div style={{ minWidth: 0 }}>
          <div className="codigo">{urgente && <span aria-label="Urgente">🚨 </span>}{p.codigo}</div>
          {oc && <div className="oc">OC {oc}{p.orden?.unidad_solicitante ? ` · ${p.orden.unidad_solicitante}` : ''}</div>}
        </div>
        <EstadoBadge p={p} />
      </div>

      {p.proveedor && (
        <div className="dlv-prov">
          <div className="nombre">🏪 {p.proveedor.razon_social || 'Proveedor sin nombre'}</div>
          {p.proveedor.direccion && <div className="dir">📍 {p.proveedor.direccion}</div>}
          {p.proveedor.telefono && <div className="dir">📞 {p.proveedor.telefono}</div>}
        </div>
      )}

      {items.length > 0 && (
        <ul className="dlv-items" aria-label="Productos a buscar">
          {items.map((it, i) => (
            <li key={i}><span>{it.nombre}</span><strong>{num(Number(it.cantidad) || 0)} {it.unidad || 'und'}</strong></li>
          ))}
        </ul>
      )}
      {p.orden?.notas && <div className="sub">📝 {p.orden.notas}</div>}

      <ComprobantePago p={p} />
      {(p.repartidor_nombre || p.repartidor_email || (p.estado === 'entregado' && p.entregado_en)) && (
        <div className="sub">
          {p.repartidor_nombre || p.repartidor_email ? `🛵 ${p.repartidor_nombre || p.repartidor_email}` : ''}
          {p.estado === 'entregado' && p.entregado_en ? ` · ✅ Entregado ${dateTime(p.entregado_en)}` : ''}
        </div>
      )}
      {p.cancelaciones > 0 && p.ultima_cancelacion_motivo && (
        <div className="sub">⚠ Cancelado {p.cancelaciones} {p.cancelaciones === 1 ? 'vez' : 'veces'} · último: {p.ultima_cancelacion_motivo}</div>
      )}
      {p.nota_entrega && <div className="sub">🗒 {p.nota_entrega}</div>}

      <FotosPedido titulo="📷 Al recibir del proveedor" fotos={fotosRecibido} />
      <FotosPedido titulo="📷 Al entregar en almacén" fotos={fotosEntrega} />

      {!ajeno && (
        <div className="dlv-acciones">
          {p.estado === 'por_tomar' && canWrite && (
            <button type="button" className="btn btn-primary ancho" onClick={() => onAccion('aceptar', p)}>✋ Aceptar pedido</button>
          )}
          {p.estado === 'por_tomar' && telProv && (
            <a className="btn btn-ghost ancho" href={telProv.tel} aria-label={`Llamar al proveedor ${p.proveedor?.razon_social ?? ''}`}>📞 Llamar al proveedor</a>
          )}

          {mio && p.estado === 'aceptado' && canWrite && (
            <>
              <button type="button" className="btn btn-primary ancho" onClick={() => onAccion('en_ruta', p)}>📷 Recibí el pedido · En ruta</button>
              <button type="button" className="btn btn-danger" onClick={() => onAccion('cancelar', p)}>⚠ No puedo buscarlo</button>
              <button type="button" className="btn btn-ghost" onClick={() => onAccion('fotos', p)}>📷 Agregar fotos</button>
            </>
          )}
          {mio && p.estado === 'en_ruta' && canWrite && (
            <>
              <button type="button" className="btn btn-success ancho" onClick={() => onAccion('entregar', p)}>✅ Entregado en almacén</button>
              <button type="button" className="btn btn-danger" onClick={() => onAccion('cancelar', p)}>⚠ No puedo…</button>
              <button type="button" className="btn btn-ghost" onClick={() => onAccion('fotos', p)}>📷 Agregar fotos</button>
            </>
          )}

          {mio && (p.estado === 'aceptado' || p.estado === 'en_ruta') && (
            <>
              {telProv && <a className="btn btn-ghost" href={telProv.tel} aria-label="Llamar al proveedor">📞 Proveedor</a>}
              {telAnalista ? (
                <>
                  <a className="btn btn-ghost" href={telAnalista.tel} aria-label={`Llamar a ${nombreAnalista}`}>📞 Llamar al analista</a>
                  <a className="btn btn-wsp" href={telAnalista.wa} target="_blank" rel="noopener noreferrer"
                    aria-label={`WhatsApp a ${nombreAnalista}`}>💬 WhatsApp al analista</a>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost" disabled aria-disabled="true">📞 Llamar al analista</button>
                  <button type="button" className="btn btn-ghost" disabled aria-disabled="true">💬 WhatsApp al analista</button>
                  <div className="dlv-nota-tel">El analista no tiene teléfono cargado</div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

function EstadoBadge({ p }: { p: PedidoDeliveryCompleto }) {
  switch (p.estado) {
    case 'por_tomar': return <span className="badge primary">💰 Por tomar</span>;
    case 'aceptado': return <span className="badge warning">⚡ Aceptado</span>;
    case 'en_ruta': return <span className="badge info">🚚 En ruta</span>;
    case 'entregado': return <span className="badge success">✅ Entregado</span>;
    default: return null;
  }
}

/* ─────────────── Acciones ─────────────── */

interface PropsAccion {
  p: PedidoDeliveryCompleto;
  onCancel: () => void;
  onHecho: (titulo: string, texto: string) => void;
  onError: (e: unknown, d: string) => void;
}

/** Sube las fotos (si hay) y devuelve lo guardado. Si fallan, se avisa y no se sigue. */
async function subir(pedidoId: string, momento: 'recibido' | 'entrega', fotos: File[]): Promise<FotoDelivery[]> {
  if (!fotos.length) return [];
  try {
    return await subirFotosDelivery(pedidoId, momento, fotos);
  } catch (e) {
    throw new Error(`Las fotos no subieron (${errMsg(e, 'sin conexión')}). Reintenta o quítalas para seguir sin fotos.`);
  }
}

function Cabecera({ icono, titulo, p }: { icono: string; titulo: string; p: PedidoDeliveryCompleto }) {
  return (
    <>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>{icono}</span><strong>{titulo}</strong></div>
      <div className="surt-detalle">
        <div className="surt-fila"><span>Pedido</span><span className="mono">{p.codigo}{p.orden?.oc_codigo ? ` · OC ${p.orden.oc_codigo}` : ''}</span></div>
        {p.proveedor?.razon_social && <div className="surt-fila"><span>Proveedor</span><span>{p.proveedor.razon_social}</span></div>}
        {p.proveedor?.direccion && <div className="surt-fila"><span>Dirección</span><span>{p.proveedor.direccion}</span></div>}
        {p.orden?.urgente && <div className="surt-fila"><span>Prioridad</span><span style={{ color: 'var(--danger)' }}>🚨 URGENTE</span></div>}
      </div>
    </>
  );
}

function AccionAceptar({ p, quien, posicion, onCancel, onHecho, onError }: PropsAccion & {
  quien: string; posicion: { lat: number; lng: number } | null;
}) {
  const [guardando, setGuardando] = useState(false);
  async function aceptar() {
    setGuardando(true);
    try {
      await aceptarPedido(p.id, posicion?.lat, posicion?.lng);
      toast(`Pedido ${p.codigo} aceptado`, 'success');
      onHecho(`Aceptaste ${p.codigo}`, mensajeAceptado({ ...p, aceptado_en: new Date().toISOString() }, quien));
    } catch (e) {
      onError(e, 'No se pudo aceptar el pedido');
      onCancel();
    } finally { setGuardando(false); }
  }
  return (
    <div className="surt-form">
      <Cabecera icono="✋" titulo="¿Aceptar este pedido?" p={p} />
      <div className="aviso info sm">
        <span className="aviso-icono">🛵</span>
        <div>Al aceptarlo queda a tu nombre y los demás motorizados ya no lo pueden tomar. Ve a buscarlo al proveedor.</div>
      </div>
      <button type="button" className="btn btn-primary surt-guardar" disabled={guardando} onClick={() => void aceptar()}>
        {guardando ? 'Aceptando…' : '✋ Sí, acepto el pedido'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
    </div>
  );
}

function AccionEnRuta({ p, quien, posicion, onCancel, onHecho, onError }: PropsAccion & {
  quien: string; posicion: { lat: number; lng: number } | null;
}) {
  const libres = Math.max(0, MAX_FOTOS_DELIVERY - (p.fotos_recibido?.length ?? 0));
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const subidas = await subir(p.id, 'recibido', fotos);
      await marcarEnRuta(p.id, subidas, posicion?.lat, posicion?.lng);
      toast(`${p.codigo} en ruta`, 'success');
      const ahora = { ...p, en_ruta_en: new Date().toISOString(), fotos_recibido: [...(p.fotos_recibido ?? []), ...subidas] };
      onHecho(`${p.codigo} va en ruta al almacén`, mensajeEnRuta(ahora, quien));
    } catch (err) {
      onError(err, 'No se pudo marcar en ruta');
    } finally { setGuardando(false); }
  }
  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <Cabecera icono="📷" titulo="Recibí el pedido · En ruta" p={p} />
      <ElegirFotos id="dlv-fotos-recibido" rotulo="📷 Fotos al recibir del proveedor" fotos={fotos} onChange={setFotos}
        max={libres} disabled={guardando} />
      <small className="muted">Foto de la mercancía y de la factura o nota de entrega del proveedor.</small>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>
        {guardando ? (fotos.length ? 'Subiendo fotos…' : 'Guardando…') : '🚚 Salgo en ruta al almacén'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
    </form>
  );
}

function AccionEntregar({ p, quien, posicion, onCancel, onHecho, onError }: PropsAccion & {
  quien: string; posicion: { lat: number; lng: number } | null;
}) {
  const libres = Math.max(0, MAX_FOTOS_DELIVERY - (p.fotos_entrega?.length ?? 0));
  const [fotos, setFotos] = useState<File[]>([]);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const subidas = await subir(p.id, 'entrega', fotos);
      const n = nota.trim();
      await marcarEntregado(p.id, subidas, n, posicion?.lat, posicion?.lng);
      toast(`${p.codigo} entregado`, 'success');
      const ahora = { ...p, entregado_en: new Date().toISOString(), fotos_entrega: [...(p.fotos_entrega ?? []), ...subidas] };
      onHecho(`${p.codigo} entregado en almacén`, mensajeEntregado(ahora, quien, n));
    } catch (err) {
      onError(err, 'No se pudo marcar como entregado');
    } finally { setGuardando(false); }
  }
  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <Cabecera icono="✅" titulo="Entregado en almacén" p={p} />
      <ElegirFotos id="dlv-fotos-entrega" rotulo="📷 Fotos al entregar" fotos={fotos} onChange={setFotos}
        max={libres} disabled={guardando} />
      <div className="surt-campo">
        <label htmlFor="dlv-nota-entrega">Nota</label>
        <input id="dlv-nota-entrega" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: quién recibió, si faltó algo…" autoComplete="off" disabled={guardando} />
      </div>
      <button type="submit" className="btn btn-success surt-guardar" disabled={guardando}>
        {guardando ? (fotos.length ? 'Subiendo fotos…' : 'Guardando…') : '✅ Confirmar entrega'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
    </form>
  );
}

function AccionCancelar({ p, quien, onCancel, onHecho, onError }: PropsAccion & { quien: string }) {
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esOtro = /otro motivo/i.test(motivo);
  const falta = !motivo ? 'Elige el motivo.' : esOtro && !detalle.trim() ? 'Cuenta qué pasó en el detalle.' : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (falta) return toast(falta, 'error');
    setGuardando(true);
    try {
      const d = detalle.trim();
      await cancelarPedido(p.id, motivo, d);
      toast(`${p.codigo} vuelve a «Por tomar»`, 'warning');
      onHecho(`${p.codigo}: avisaste que no puedes`, mensajeCancelado(p, motivo, d, quien));
    } catch (err) {
      onError(err, 'No se pudo cancelar');
    } finally { setGuardando(false); }
  }
  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <Cabecera icono="⚠" titulo="No puedo buscar el pedido" p={p} />
      <div className="aviso warning sm">
        <span className="aviso-icono">↩</span>
        <div>El pedido vuelve a «Por tomar» para que otro motorizado lo busque. El motivo es obligatorio.</div>
      </div>
      <div className="surt-campo">
        <span className="surt-rotulo" id="dlv-motivo-rotulo">¿Por qué?</span>
        <div className="dlv-motivos" role="radiogroup" aria-labelledby="dlv-motivo-rotulo">
          {MOTIVOS_CANCELACION.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={motivo === m}
              className={`dlv-motivo${motivo === m ? ' sel' : ''}`} onClick={() => setMotivo(m)} disabled={guardando}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="surt-campo">
        <label htmlFor="dlv-cancel-detalle">Detalle{esOtro ? ' (obligatorio)' : ''}</label>
        <textarea id="dlv-cancel-detalle" className="input surt-input" value={detalle} onChange={(e) => setDetalle(e.target.value)}
          placeholder="Opcional: qué pasó, con quién hablaste…" disabled={guardando} />
      </div>
      <button type="submit" className="btn btn-danger surt-guardar" disabled={guardando || !!falta}>
        {guardando ? 'Guardando…' : '⚠ Confirmar: no puedo'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
    </form>
  );
}

function AccionFotos({ p, onCancel, onHecho, onError }: Omit<PropsAccion, 'onHecho'> & { onHecho: () => void }) {
  // Antes de entregar, las fotos son de lo que recibió del proveedor.
  const momento: 'recibido' | 'entrega' = 'recibido';
  const libres = Math.max(0, MAX_FOTOS_DELIVERY - (p.fotos_recibido?.length ?? 0));
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!fotos.length) return toast('Elige al menos una foto.', 'error');
    setGuardando(true);
    try {
      const subidas = await subir(p.id, momento, fotos);
      await adjuntarFotos(p.id, momento, subidas);
      onHecho();
    } catch (err) {
      onError(err, 'No se pudieron agregar las fotos');
    } finally { setGuardando(false); }
  }
  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <Cabecera icono="📷" titulo="Agregar fotos del pedido" p={p} />
      <FotosPedido titulo="Ya cargadas" fotos={p.fotos_recibido} />
      <ElegirFotos id="dlv-fotos-extra" rotulo="📷 Fotos del pedido recibido" fotos={fotos} onChange={setFotos}
        max={libres} disabled={guardando} />
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || !fotos.length}>
        {guardando ? 'Subiendo fotos…' : '📷 Guardar fotos'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Volver</button>
    </form>
  );
}

/* ─────────────── Ruta GPS ─────────────── */

const TEXTO_GPS: Record<EstadoGps, string> = {
  apagado: 'Sin compartir',
  pidiendo: 'Buscando señal de GPS…',
  compartiendo: 'Compartiendo tu ubicación',
  pausado: 'En pausa: no se está compartiendo',
  sin_permiso: 'Sin permiso de ubicación',
  error: 'GPS con problemas (se sigue intentando)',
  no_soportado: 'Este navegador no tiene GPS',
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function PanelGps({ gps, enRuta }: { gps: GpsDelivery; enRuta: PedidoDeliveryCompleto | null }) {
  const p = gps.enviada ?? gps.ultima;
  return (
    <div className="surt-form">
      <div className="surt-form-titulo"><span className="icono" aria-hidden>📍</span><strong>Ruta GPS</strong></div>
      <div className="dlv-gps-estado" role="status" aria-live="polite">
        <span className={`dlv-gps-punto ${gps.estado}`} aria-hidden />
        {TEXTO_GPS[gps.estado]}
      </div>
      {enRuta && <div className="muted">🚚 Vas en ruta con <strong>{enRuta.codigo}</strong>: la oficina lo ve en el mapa.</div>}

      {gps.estado === 'no_soportado' ? (
        <div className="aviso danger sm"><span className="aviso-icono">⚠</span><div>Abre esta pantalla en Chrome o Safari del teléfono para compartir la ubicación.</div></div>
      ) : gps.activo ? (
        <button type="button" className="surt-btn dlv-gps-btn" style={{ borderColor: 'var(--danger)' }} onClick={gps.detener}>
          <span>⏸ Dejar de compartir</span>
          <small>La oficina deja de ver dónde estás</small>
        </button>
      ) : (
        <button type="button" className="surt-btn primario dlv-gps-btn" onClick={gps.iniciar}>
          <span className="icono" aria-hidden>📍</span>
          <span>Compartir mi ubicación</span>
          <small>Se envía cada 30 s, o antes si te moviste más de 50 m</small>
        </button>
      )}

      {gps.error && <div className="aviso warning sm"><span className="aviso-icono">⚠</span><div>{gps.error}</div></div>}

      {p && (
        <div className="surt-detalle">
          <div className="surt-fila"><span>Latitud</span><span className="mono">{p.lat.toFixed(6)}</span></div>
          <div className="surt-fila"><span>Longitud</span><span className="mono">{p.lng.toFixed(6)}</span></div>
          <div className="surt-fila"><span>Precisión</span><span>{p.precision != null ? `± ${num(p.precision)} m` : '—'}</span></div>
          <div className="surt-fila"><span>Último envío</span><span>{gps.enviada ? hora(gps.enviada.at) : 'todavía no'}</span></div>
          <a className="btn btn-ghost btn-grande" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
            style={{ marginTop: '.6rem', justifyContent: 'center' }}>🗺 Ver en el mapa</a>
        </div>
      )}

      <small className="muted">
        Deja esta pantalla abierta mientras vas en la moto: si bloqueas el teléfono o cambias de aplicación,
        el navegador puede pausar el GPS.
      </small>
    </div>
  );
}

/* ─────────────── Mi perfil ─────────────── */

function PanelPerfil({ datos, yo, quien }: { datos: ReturnType<typeof useDelivery>; yo: string; quien: string }) {
  const stats = useMemo(() => {
    const eventos = (datos.eventos ?? []).filter((e) => mismo(e.actor_email, yo));
    const cuenta = (ev: string) => eventos.filter((e) => e.evento === ev).length;
    const pedidos = datos.pedidos ?? [];
    const mios = pedidos.filter((p) => mismo(p.repartidor_email, yo));
    return {
      // Si el historial no trae eventos (o trae menos), al menos lo que se ve en los pedidos.
      aceptados: Math.max(cuenta('aceptado'), mios.length),
      entregados: Math.max(cuenta('entregado'), mios.filter((p) => p.estado === 'entregado').length),
      cancelados: cuenta('cancelado'),
      ultimasCancelaciones: eventos.filter((e) => e.evento === 'cancelado')
        .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
        .map((e) => ({ ...e, codigo: pedidos.find((p) => p.id === e.pedido_id)?.codigo ?? '' })),
    };
  }, [datos.eventos, datos.pedidos, yo]);

  return (
    <div className="surt-form">
      <div className="surt-form-titulo"><span className="icono" aria-hidden>👤</span><strong>{quien}</strong></div>
      {yo && <div className="muted">{yo}</div>}
      <div className="dlv-stats">
        <div className="dlv-stat"><div className="valor">{stats.aceptados}</div><div className="rotulo">✋ Aceptados</div></div>
        <div className="dlv-stat"><div className="valor" style={{ color: 'var(--success)' }}>{stats.entregados}</div><div className="rotulo">✅ Entregados</div></div>
        <div className="dlv-stat"><div className="valor" style={{ color: 'var(--danger)' }}>{stats.cancelados}</div><div className="rotulo">⚠ Cancelados</div></div>
      </div>
      {stats.ultimasCancelaciones.length > 0 && (
        <section className="surt-lista">
          <h2>Últimas veces que no pudiste</h2>
          {stats.ultimasCancelaciones.map((e) => (
            <div key={e.id} className="surt-mov" style={{ cursor: 'default' }}>
              <span className="icono" aria-hidden>⚠</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{e.codigo || 'Pedido'} · {e.motivo || 'Sin motivo'}</div>
                <div className="sub">{dateTime(e.at)}{e.detalle ? ` · ${e.detalle}` : ''}</div>
              </span>
              <span />
            </div>
          ))}
        </section>
      )}
      <small className="muted">Cuenta lo que hay en el historial de Delivery.</small>
    </div>
  );
}
