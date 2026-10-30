/* ============================================================
   Golden Touch · Delivery · Pantalla de PC (30/10/2026)

   Las OC de productos ya PAGADAS por Tesorería pasan a Delivery (la
   retención es solo un dato, no las frena): un motorizado las acepta, las busca al proveedor y las
   entrega en el almacén. Acá se supervisa todo eso:
     Tablero   → una columna por estado (por tomar · aceptado · en ruta · entregado hoy)
     Mapa      → la última posición de cada motorizado (Leaflet, carga diferida)
     Histórico → filtros, tabla, resumen por motorizado y los PDF

   Con el interruptor `compras_delivery` apagado se muestra el aviso; el Mapa
   y el Histórico (vacío) se dejan ver para probar la ubicación.
   ============================================================ */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { nombreYApellido } from '@/shared/lib/directorioUsuarios';
import { Quien } from '@/shared/ui/Quien';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FechaInput } from '@/shared/ui/FechaInput';
import { toast } from '@/shared/ui/Toast';
import { dateTime, money, num } from '@/shared/lib/format';
import { mensajeError } from '@/shared/lib/errores';
import { hoyVenezuela, RANGOS_RAPIDOS, rangoActivo, rangoRapido } from '@/shared/lib/rangosFecha';
import {
  ESTADOS_DELIVERY, INTERRUPTOR_DELIVERY,
  type EstadoDelivery, type EventoDeliveryRow, type FotoDelivery,
} from './delivery.types';
import {
  diaVE, etiquetaEstado, filtrarHistorico, itemsABuscar, mensajeAceptado, mensajeCancelado, mensajeEnRuta, mensajeEntregado,
  resumenPorRepartidor, textoDuracion, ETIQUETA_RETENCION, type PedidoDeliveryConRetencion,
} from './delivery';
import { reabrirPedido, urlFotoDelivery } from './delivery.repository';
import { useDelivery } from './useDelivery';
import { pdfHistoricoDelivery, pdfPedidosPorRepartidor } from './deliveryPdf';
import './deliveryPc.css';

/** El pedido tal como lo entrega useDelivery (con el estado de la retención de su OC). */
type Pedido = PedidoDeliveryConRetencion;

// Leaflet solo se descarga al abrir la pestaña Mapa.
const DeliveryMapa = lazy(() => import('./DeliveryMapa').then((m) => ({ default: m.DeliveryMapa })));

type Pestana = 'tablero' | 'mapa' | 'historico';

const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'tablero', label: '📋 Tablero' },
  { key: 'mapa', label: '🗺 Mapa' },
  { key: 'historico', label: '📚 Histórico' },
];

/** «Cemento ×10 · Cabilla ×20 · y 3 más». */
function resumenItems(p: Pedido, max = 3): string {
  const items = itemsABuscar(p);
  if (!items.length) return 'Sin renglones';
  const partes = items.slice(0, max).map((i) => `${i.nombre} ×${num(i.cantidad)}${i.unidad ? ` ${i.unidad}` : ''}`);
  return partes.join(' · ') + (items.length > max ? ` · y ${items.length - max} más` : '');
}

/** El WhatsApp que corresponde al estado actual del pedido (null si no hay qué avisar). */
function mensajeDelEstado(p: Pedido): string | null {
  const quien = p.repartidor_nombre || p.repartidor_email || '';
  switch (p.estado) {
    case 'aceptado': return mensajeAceptado(p, quien);
    case 'en_ruta': return mensajeEnRuta(p, quien);
    case 'entregado': return mensajeEntregado(p, quien, p.nota_entrega);
    case 'por_tomar':
      return p.cancelaciones > 0 && p.ultima_cancelacion_motivo
        ? mensajeCancelado(p, p.ultima_cancelacion_motivo, null, p.ultima_cancelacion_por || '')
        : null;
  }
}

export function DeliveryPage() {
  const { isAdmin, puedeVista, appUser } = usePermissions();
  const { user } = useSession();
  const quien = nombreYApellido(appUser?.nombre, appUser?.apellido) || user?.email || null;
  const datos = useDelivery();
  const [pestana, setPestana] = useState<Pestana>('tablero');
  const [detalle, setDetalle] = useState<Pedido | null>(null);
  const [wsp, setWsp] = useState<{ titulo: string; texto: string } | null>(null);
  const [reabrir, setReabrir] = useState<Pedido | null>(null);
  const hoy = hoyVenezuela();

  const cuenta = useMemo(() => {
    const c: Record<EstadoDelivery, number> = { por_tomar: 0, aceptado: 0, en_ruta: 0, entregado: 0 };
    let entregadosHoy = 0;
    for (const p of datos.pedidos) {
      c[p.estado]++;
      if (p.estado === 'entregado' && diaVE(p.entregado_en) === hoy) entregadosHoy++;
    }
    return { ...c, entregadosHoy };
  }, [datos.pedidos, hoy]);

  // Si el pedido abierto en el detalle cambió (realtime), se muestra la versión nueva.
  const detalleVivo = detalle ? (datos.pedidos.find((p) => p.id === detalle.id) ?? detalle) : null;

  async function confirmarReabrir() {
    if (!reabrir) return;
    const p = reabrir;
    setReabrir(null);
    try {
      await reabrirPedido(p.id);
      toast(`${p.codigo} volvió a «Por tomar».`, 'success');
      void datos.reload();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo reabrir el pedido.'), 'error');
    }
  }

  const abrirWsp = (p: Pedido) => {
    const texto = mensajeDelEstado(p);
    if (texto) setWsp({ titulo: `💬 ${p.codigo} · ${etiquetaEstado(p.estado)}`, texto });
  };

  return (
    <div>
      <div className="dlv-head">
        <div>
          <h1>🛵 Delivery</h1>
          <p className="hint muted">
            Pedidos ya pagados por Tesorería: los motorizados los buscan al proveedor y los entregan en el almacén.
          </p>
        </div>
        {puedeVista('delivery') && (
          <Link to="/app/delivery/telefono" className="btn btn-ghost">📱 Vista de teléfono</Link>
        )}
      </div>

      {datos.loading && datos.activo === null && <p className="muted">Cargando…</p>}
      {!datos.loading && datos.activo === false && <AvisoApagado isAdmin={isAdmin} />}
      {datos.error && (
        <div className="aviso danger" style={{ marginBottom: '1rem' }}><span className="aviso-icono">⚠</span><div>{datos.error}</div></div>
      )}

      <div className="lt-kpis" role="group" aria-label="Resumen de Delivery">
        <Kpi color="azul" icono="💰" label="Por tomar" valor={cuenta.por_tomar} sub="Pagados, esperando motorizado" />
        <Kpi color="ambar" icono="⚡" label="Aceptados" valor={cuenta.aceptado} sub="Van a buscarlo al proveedor" />
        <Kpi color="naranja" icono="🚚" label="En ruta" valor={cuenta.en_ruta} sub="Camino al almacén" />
        <Kpi color="verde" icono="✅" label="Entregados hoy" valor={cuenta.entregadosHoy} sub={`${cuenta.entregado} en total`} />
      </div>

      <div className="dlv-tabs" role="tablist" aria-label="Vistas de Delivery">
        {PESTANAS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`dlv-tab-${t.key}`} aria-controls={`dlv-panel-${t.key}`}
            className="dlv-tab" aria-selected={pestana === t.key} onClick={() => setPestana(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`dlv-panel-${pestana}`} aria-labelledby={`dlv-tab-${pestana}`}>
        {pestana === 'tablero' && (
          datos.activo === false
            ? <EmptyState icon="🕒" message="El tablero se llena cuando se encienda Delivery." />
            : <Tablero pedidos={datos.pedidos} hoy={hoy} isAdmin={isAdmin}
                onDetalle={setDetalle} onWhatsapp={abrirWsp} onReabrir={setReabrir} irHistorico={() => setPestana('historico')} />
        )}
        {pestana === 'mapa' && (
          <Suspense fallback={<p className="muted">Cargando el mapa…</p>}>
            <DeliveryMapa ubicaciones={datos.ubicaciones} pedidos={datos.pedidos} />
          </Suspense>
        )}
        {pestana === 'historico' && (
          <Historico pedidos={datos.pedidos} eventos={datos.eventos} quien={quien} onDetalle={setDetalle} />
        )}
      </div>

      {detalleVivo && (
        <DetallePedido p={detalleVivo} eventos={datos.eventos.filter((e) => e.pedido_id === detalleVivo.id)}
          isAdmin={isAdmin} onClose={() => setDetalle(null)}
          onWhatsapp={() => abrirWsp(detalleVivo)} onReabrir={() => setReabrir(detalleVivo)} />
      )}
      {wsp && (
        <Modal title={wsp.titulo} compact onClose={() => setWsp(null)}
          footer={<button type="button" className="btn btn-ghost" onClick={() => setWsp(null)}>Cerrar</button>}>
          <CompartirWhatsapp texto={wsp.texto} />
        </Modal>
      )}
      {reabrir && (
        <ConfirmDialog title={`Reabrir ${reabrir.codigo}`} danger confirmText="↩ Reabrir"
          message={`El pedido vuelve a «Por tomar» y queda libre para que otro motorizado lo acepte.${reabrir.repartidor_nombre ? ` Se le quita a ${reabrir.repartidor_nombre}.` : ''} Queda registrado en su historial.`}
          onConfirm={() => void confirmarReabrir()} onCancel={() => setReabrir(null)} />
      )}
    </div>
  );
}

/* ───────────── Aviso del interruptor ───────────── */

function AvisoApagado({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '.6rem', maxWidth: 760, marginBottom: '1rem' }}>
      <div className="aviso warning sm">
        <span className="aviso-icono">🕒</span>
        <div>Delivery todavía no está activo: se enciende junto con el nuevo flujo de Compras.</div>
      </div>
      {isAdmin && (
        <div className="aviso sm">
          <span className="aviso-icono">🔌</span>
          <div>
            Interruptor <code>{INTERRUPTOR_DELIVERY}</code>: <strong>apagado</strong> (o todavía no creado en la base).
            Se enciende en <code>sistema_interruptores</code> cuando la gerencia lo indique. Mientras tanto puedes probar el Mapa.
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ color, icono, label, valor, sub }: { color: string; icono: string; label: string; valor: number; sub: string }) {
  return (
    <div className={`lt-kpi ${color}`}>
      <span className="lt-kpi-label"><span aria-hidden="true">{icono}</span> {label}</span>
      <span className="lt-kpi-valor">{valor}</span>
      <span className="lt-kpi-sub">{sub}</span>
    </div>
  );
}

/* ───────────── Tablero ───────────── */

function Tablero({ pedidos, hoy, isAdmin, onDetalle, onWhatsapp, onReabrir, irHistorico }: {
  pedidos: Pedido[]; hoy: string; isAdmin: boolean;
  onDetalle: (p: Pedido) => void; onWhatsapp: (p: Pedido) => void;
  onReabrir: (p: Pedido) => void; irHistorico: () => void;
}) {
  const columnas = useMemo(() => {
    const m: Record<EstadoDelivery, Pedido[]> = { por_tomar: [], aceptado: [], en_ruta: [], entregado: [] };
    for (const p of pedidos) {
      // Los entregados de días anteriores viven en el Histórico.
      if (p.estado === 'entregado' && diaVE(p.entregado_en) !== hoy) continue;
      m[p.estado].push(p);
    }
    const clave = (p: Pedido) => p.entregado_en ?? p.en_ruta_en ?? p.aceptado_en ?? p.created_at;
    for (const k of Object.keys(m) as EstadoDelivery[]) {
      m[k].sort((a, b) => (k === 'por_tomar'
        ? Number(!!b.orden.urgente) - Number(!!a.orden.urgente) || a.created_at.localeCompare(b.created_at)
        : clave(b).localeCompare(clave(a))));
    }
    return m;
  }, [pedidos, hoy]);

  return (
    <div className="dlv-tablero">
      {ESTADOS_DELIVERY.map((e) => (
        <section key={e.key} className={`dlv-col ${e.key}`} aria-label={`${e.label}: ${columnas[e.key].length}`}>
          <div className="dlv-col-cab">
            <span>{e.icono} {e.key === 'entregado' ? 'Entregados hoy' : e.label}</span>
            <span className="badge">{columnas[e.key].length}</span>
          </div>
          <div className="dlv-col-cuerpo">
            {columnas[e.key].length === 0 && (
              <div className="dlv-col-vacia">
                {e.key === 'entregado'
                  ? <>Nada entregado hoy. <button type="button" className="btn btn-ghost btn-sm" onClick={irHistorico}>Ver histórico</button></>
                  : 'Sin pedidos'}
              </div>
            )}
            {columnas[e.key].map((p) => (
              <TarjetaPedido key={p.id} p={p} isAdmin={isAdmin}
                onDetalle={() => onDetalle(p)} onWhatsapp={() => onWhatsapp(p)} onReabrir={() => onReabrir(p)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TarjetaPedido({ p, isAdmin, onDetalle, onWhatsapp, onReabrir }: {
  p: Pedido; isAdmin: boolean; onDetalle: () => void; onWhatsapp: () => void; onReabrir: () => void;
}) {
  const fotos = p.fotos_recibido.length + p.fotos_entrega.length;
  const hayWsp = mensajeDelEstado(p) != null;
  return (
    <article className={`dlv-card${p.orden.urgente ? ' urgente' : ''}`} aria-label={`Pedido ${p.codigo}`}>
      <div className="dlv-card-cab">
        <span className="dlv-codigo">{p.codigo}</span>
        <span className="dlv-oc">{p.orden.oc_codigo || p.orden.codigo}</span>
      </div>
      {(p.orden.urgente || p.orden.retencion === 'pendiente') && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
          {p.orden.urgente && <span className="badge danger">🚨 Urgente</span>}
          {p.orden.retencion === 'pendiente' && <span className="badge warning" title="La OC está pagada; la retención todavía no se ha hecho">{ETIQUETA_RETENCION.pendiente}</span>}
        </div>
      )}
      <div className="dlv-prov">{p.proveedor?.razon_social || 'Proveedor sin nombre'}</div>
      <div className="dlv-items">{resumenItems(p)}</div>
      {p.repartidor_email && (
        <div className="dlv-linea">🛵 <b><Quien nombre={p.repartidor_nombre} correo={p.repartidor_email} vacio="—" /></b></div>
      )}
      <Horas p={p} />
      {p.analista?.nombre && <div className="dlv-linea">Analista: <b>{p.analista.nombre}</b></div>}
      {p.cancelaciones > 0 && (
        <div className="dlv-cancel" title={p.ultima_cancelacion_en ? dateTime(p.ultima_cancelacion_en) : undefined}>
          ⚠ {p.cancelaciones} cancelación{p.cancelaciones === 1 ? '' : 'es'}
          {p.ultima_cancelacion_motivo && <> · última: {p.ultima_cancelacion_motivo}</>}
          {p.ultima_cancelacion_por && <> (<Quien nombre={null} correo={p.ultima_cancelacion_por} vacio={p.ultima_cancelacion_por} />)</>}
        </div>
      )}
      <div className="dlv-acciones">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDetalle}>
          🔎 Detalle{fotos ? ` · 📷 ${fotos}` : ''}
        </button>
        {hayWsp && <button type="button" className="btn btn-ghost btn-sm" onClick={onWhatsapp}>💬 WhatsApp</button>}
        {isAdmin && p.estado !== 'por_tomar' && (
          <button type="button" className="btn btn-danger btn-sm" onClick={onReabrir}>↩ Reabrir</button>
        )}
      </div>
    </article>
  );
}

function Horas({ p }: { p: Pedido }) {
  const hora = (iso: string | null) => (iso ? dateTime(iso) : null);
  const partes: [string, string | null][] = [
    ['Aceptado', hora(p.aceptado_en)],
    ['En ruta', hora(p.en_ruta_en)],
    ['Entregado', hora(p.entregado_en)],
  ];
  const visibles = partes.filter(([, v]) => v);
  if (!visibles.length) return <div className="dlv-linea">Pagado {dateTime(p.orden.pagada_en ?? p.created_at)}</div>;
  return (
    <div className="dlv-linea">
      {visibles.map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}
    </div>
  );
}

/* ───────────── Detalle (fotos con URL firmada al abrir) ───────────── */

const NOMBRE_EVENTO: Record<string, string> = {
  creado: '🆕 Entró a Delivery', aceptado: '⚡ Aceptado', cancelado: '⚠ Cancelado', en_ruta: '🚚 En ruta',
  entregado: '✅ Entregado', fotos: '📷 Fotos', reabierto: '↩ Reabierto',
};

function DetallePedido({ p, eventos, isAdmin, onClose, onWhatsapp, onReabrir }: {
  p: Pedido; eventos: EventoDeliveryRow[]; isAdmin: boolean;
  onClose: () => void; onWhatsapp: () => void; onReabrir: () => void;
}) {
  const hayWsp = mensajeDelEstado(p) != null;
  const historial = [...eventos].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Modal title={`${p.codigo} · ${p.orden.oc_codigo || p.orden.codigo}`} size="lg" onClose={onClose}
      footer={(
        <>
          {isAdmin && p.estado !== 'por_tomar' && <button type="button" className="btn btn-danger" onClick={onReabrir}>↩ Reabrir</button>}
          {hayWsp && <button type="button" className="btn btn-ghost" onClick={onWhatsapp}>💬 WhatsApp</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </>
      )}>
      <div className="dlv-detalle">
        <div className="dlv-detalle-grid">
          <Dato k="Estado" v={<span className={`badge ${claseEstado(p.estado)}`}>{etiquetaEstado(p.estado)}</span>} />
          <Dato k="Proveedor" v={<>{p.proveedor?.razon_social || '—'}{p.proveedor?.rif ? <span className="muted"> · {p.proveedor.rif}</span> : null}</>} />
          <Dato k="Teléfono del proveedor" v={p.proveedor?.telefono || '—'} />
          <Dato k="Dirección del proveedor" v={p.proveedor?.direccion || '—'} />
          <Dato k="Motorizado" v={<Quien nombre={p.repartidor_nombre} correo={p.repartidor_email} vacio="Sin asignar" />} />
          <Dato k="Analista de compras" v={p.analista?.nombre || <Quien correo={p.orden.analista_email} vacio="—" />} />
          <Dato k="Unidad solicitante" v={p.orden.unidad_solicitante || '—'} />
          <Dato k="Total OC" v={money(p.orden.total, p.orden.total_moneda)} />
          <Dato k="Retención" v={<span className={`badge ${p.orden.retencion === 'pendiente' ? 'warning' : p.orden.retencion === 'hecha' ? 'success' : ''}`}>{ETIQUETA_RETENCION[p.orden.retencion] ?? '—'}</span>} />
          <Dato k="Pagada" v={dateTime(p.orden.pagada_en)} />
          <Dato k="Aceptado" v={dateTime(p.aceptado_en)} />
          <Dato k="En ruta" v={dateTime(p.en_ruta_en)} />
          <Dato k="Entregado" v={dateTime(p.entregado_en)} />
        </div>

        {p.orden.notas && <div className="aviso sm"><span className="aviso-icono">📝</span><div>{p.orden.notas}</div></div>}
        {p.nota_entrega && <div className="aviso sm"><span className="aviso-icono">📦</span><div>Nota de entrega: {p.nota_entrega}</div></div>}

        <div>
          <h3>Productos</h3>
          <div className="table-wrap">
            <table className="table dlv-tabla">
              <thead><tr><th>Producto</th><th className="num">Cantidad</th><th>Unidad</th></tr></thead>
              <tbody>
                {itemsABuscar(p).map((i, idx) => (
                  <tr key={idx}>
                    <td data-col="Producto">{i.nombre}</td>
                    <td data-col="Cantidad" className="num mono">{num(i.cantidad)}</td>
                    <td data-col="Unidad">{i.unidad || 'und'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3>📷 Al recibir del proveedor ({p.fotos_recibido.length})</h3>
          <Fotos fotos={p.fotos_recibido} />
        </div>
        <div>
          <h3>📷 Al entregar en el almacén ({p.fotos_entrega.length})</h3>
          <Fotos fotos={p.fotos_entrega} />
        </div>

        {p.cancelaciones > 0 && (
          <div className="dlv-cancel">
            ⚠ {p.cancelaciones} cancelación{p.cancelaciones === 1 ? '' : 'es'} · última: {p.ultima_cancelacion_motivo || '—'}
            {p.ultima_cancelacion_por && <> · <Quien correo={p.ultima_cancelacion_por} vacio={p.ultima_cancelacion_por} /></>}
            {p.ultima_cancelacion_en && <> · {dateTime(p.ultima_cancelacion_en)}</>}
          </div>
        )}

        <div>
          <h3>Historial</h3>
          {historial.length === 0
            ? <p className="muted" style={{ fontSize: '.85rem' }}>Sin movimientos registrados.</p>
            : (
              <ul className="dlv-eventos">
                {historial.map((ev) => (
                  <li key={ev.id} className={ev.evento}>
                    <strong>{NOMBRE_EVENTO[ev.evento] ?? ev.evento}</strong>
                    <span className="muted">{dateTime(ev.at)}</span>
                    {(ev.actor_nombre || ev.actor_email) && <span><Quien nombre={ev.actor_nombre} correo={ev.actor_email} /></span>}
                    {ev.motivo && <span>· {ev.motivo}</span>}
                    {ev.detalle && <span className="muted">· {ev.detalle}</span>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </Modal>
  );
}

function Dato({ k, v }: { k: string; v: ReactNode }) {
  return <div className="dlv-dato"><span>{k}</span><span>{v}</span></div>;
}

function claseEstado(e: EstadoDelivery): string {
  return e === 'por_tomar' ? 'info' : e === 'aceptado' ? 'warning' : e === 'en_ruta' ? 'primary' : 'success';
}

/** Miniaturas: la URL firmada se pide recién al abrir el detalle (el bucket es privado). */
function Fotos({ fotos }: { fotos: FotoDelivery[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const clave = fotos.map((f) => f.path).join('|');
  useEffect(() => {
    let vivo = true;
    void Promise.all(fotos.map(async (f) => [f.path, await urlFotoDelivery(f.path).catch(() => '')] as const))
      .then((pares) => { if (vivo) setUrls(Object.fromEntries(pares.filter(([, u]) => !!u))); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  if (!fotos.length) return <p className="muted" style={{ fontSize: '.85rem' }}>Sin fotos.</p>;
  return (
    <div className="dlv-fotos">
      {fotos.map((f) => (urls[f.path]
        ? (
          <a key={f.path} className="dlv-foto" href={urls[f.path]} target="_blank" rel="noopener noreferrer" title={`Abrir ${f.nombre}`}>
            <img src={urls[f.path]} alt={f.nombre} loading="lazy" />
          </a>
        )
        : <span key={f.path} className="dlv-foto cargando">Cargando…</span>))}
    </div>
  );
}

/* ───────────── Histórico ───────────── */

interface FiltrosHistorico { desde: string; hasta: string; repartidor: string; estado: EstadoDelivery | '' }

function Historico({ pedidos, eventos, quien, onDetalle }: {
  pedidos: Pedido[]; eventos: EventoDeliveryRow[]; quien: string | null; onDetalle: (p: Pedido) => void;
}) {
  const hoy = hoyVenezuela();
  const [f, setF] = useState<FiltrosHistorico>(() => ({ ...rangoRapido('mes', hoy), repartidor: '', estado: '' }));
  const set = <K extends keyof FiltrosHistorico>(k: K, v: FiltrosHistorico[K]) => setF((x) => ({ ...x, [k]: v }));
  const activo = rangoActivo(f.desde, f.hasta, hoy);

  const repartidores = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pedidos) if (p.repartidor_email) m.set(p.repartidor_email, p.repartidor_nombre || p.repartidor_email);
    for (const e of eventos) if (e.actor_email && e.evento === 'aceptado' && !m.has(e.actor_email)) m.set(e.actor_email, e.actor_nombre || e.actor_email);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pedidos, eventos]);

  const filtrados = useMemo(() => filtrarHistorico(pedidos, {
    desde: f.desde || null, hasta: f.hasta || null, repartidor: f.repartidor || null, estado: f.estado || null,
  }), [pedidos, f]);
  const idsFiltrados = useMemo(() => new Set(filtrados.map((p) => p.id)), [filtrados]);
  const eventosFiltrados = useMemo(() => eventos.filter((e) => idsFiltrados.has(e.pedido_id)), [eventos, idsFiltrados]);
  const resumen = useMemo(() => resumenPorRepartidor(filtrados, eventosFiltrados), [filtrados, eventosFiltrados]);

  const filtrosPdf = { desde: f.desde || null, hasta: f.hasta || null, repartidor: f.repartidor || null, estado: f.estado || null };

  return (
    <div>
      <div className="lt-filtros">
        <div className="lt-fila">
          <div className="lt-campo">
            <label htmlFor="dlv-desde">Desde</label>
            <FechaInput id="dlv-desde" className="input" value={f.desde} onChange={(v) => set('desde', v)} />
          </div>
          <div className="lt-campo">
            <label htmlFor="dlv-hasta">Hasta</label>
            <FechaInput id="dlv-hasta" className="input" value={f.hasta} onChange={(v) => set('hasta', v)} />
          </div>
          <div className="lt-campo">
            <label htmlFor="dlv-rep">Motorizado</label>
            <select id="dlv-rep" className="select" value={f.repartidor} onChange={(e) => set('repartidor', e.target.value)}>
              <option value="">Todos</option>
              {repartidores.map(([email, nombre]) => <option key={email} value={email}>{nombre}</option>)}
            </select>
          </div>
          <div className="lt-campo">
            <label htmlFor="dlv-estado">Estado</label>
            <select id="dlv-estado" className="select" value={f.estado} onChange={(e) => set('estado', e.target.value as FiltrosHistorico['estado'])}>
              <option value="">Todos</option>
              {ESTADOS_DELIVERY.map((e) => <option key={e.key} value={e.key}>{e.icono} {e.label}</option>)}
            </select>
          </div>
        </div>
        <div className="lt-pie">
          {RANGOS_RAPIDOS.filter((x) => x.valor === 'mes' || x.valor === 'mesPasado').map((x) => (
            <button key={x.valor} type="button" className={`lt-chip${activo === x.valor ? ' activo' : ''}`} aria-pressed={activo === x.valor}
              onClick={() => { const r = rangoRapido(x.valor, hoy); setF((v) => ({ ...v, desde: r.desde, hasta: r.hasta })); }}>
              {x.label}
            </button>
          ))}
          {(f.desde || f.hasta || f.repartidor || f.estado) && (
            <button type="button" className="lt-chip" onClick={() => setF({ desde: '', hasta: '', repartidor: '', estado: '' })}>✕ Limpiar</button>
          )}
          <span className="lt-contador">{filtrados.length} de {pedidos.length} pedidos</span>
        </div>
      </div>

      <div className="dlv-hist-acciones">
        <button type="button" className="btn btn-ghost" disabled={!filtrados.length}
          onClick={() => void Promise.resolve(pdfHistoricoDelivery(filtrados, filtrosPdf, quien))
            .catch((e: unknown) => toast(mensajeError(e, 'No se pudo armar el PDF.'), 'error'))}>
          📄 PDF histórico
        </button>
        <button type="button" className="btn btn-ghost" disabled={!filtrados.length}
          onClick={() => void Promise.resolve(pdfPedidosPorRepartidor(resumen, filtrosPdf, quien))
            .catch((e: unknown) => toast(mensajeError(e, 'No se pudo armar el PDF.'), 'error'))}>
          📄 PDF por motorizado
        </button>
      </div>

      {filtrados.length === 0
        ? <EmptyState icon="📚" message="No hay pedidos de Delivery en ese rango." />
        : (
          <div className="table-wrap">
            <table className="table dlv-tabla">
              <thead>
                <tr>
                  <th>DEL</th><th>OC</th><th>Proveedor</th><th>Productos</th><th>Motorizado</th><th>Estado</th>
                  <th>Aceptado</th><th>Entregado</th><th className="num">Cancel.</th><th className="num">Fotos</th><th />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id}>
                    <td data-col="DEL" className="mono"><strong>{p.codigo}</strong></td>
                    <td data-col="OC" className="mono">{p.orden.oc_codigo || p.orden.codigo}</td>
                    <td data-col="Proveedor">{p.proveedor?.razon_social || '—'}</td>
                    <td data-col="Productos" style={{ maxWidth: 280 }}>{resumenItems(p, 2)}</td>
                    <td data-col="Motorizado"><Quien nombre={p.repartidor_nombre} correo={p.repartidor_email} vacio="—" /></td>
                    <td data-col="Estado"><span className={`badge ${claseEstado(p.estado)}`}>{etiquetaEstado(p.estado)}</span></td>
                    <td data-col="Aceptado">{dateTime(p.aceptado_en)}</td>
                    <td data-col="Entregado">{dateTime(p.entregado_en)}</td>
                    <td data-col="Cancel." className="num mono" title={p.ultima_cancelacion_motivo ?? undefined}>{p.cancelaciones || '—'}</td>
                    <td data-col="Fotos" className="num mono">{p.fotos_recibido.length + p.fotos_entrega.length || '—'}</td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onDetalle(p)} aria-label={`Ver detalle de ${p.codigo}`}>🔎</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <h2 className="dlv-seccion-titulo">🛵 Pedidos por motorizado</h2>
      {resumen.length === 0
        ? <p className="muted">Sin motorizados en el rango.</p>
        : (
          <div className="table-wrap">
            <table className="table dlv-tabla">
              <thead>
                <tr><th>Motorizado</th><th className="num">Entregados</th><th className="num">En curso</th><th className="num">Cancelaciones</th><th className="num">Tiempo promedio</th></tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.repartidor_email}>
                    <td data-col="Motorizado"><Quien nombre={r.repartidor_nombre} correo={r.repartidor_email} vacio={r.repartidor_email} /></td>
                    <td data-col="Entregados" className="num mono">{r.entregados}</td>
                    <td data-col="En curso" className="num mono">{r.en_curso}</td>
                    <td data-col="Cancelaciones" className="num mono">{r.cancelaciones}</td>
                    <td data-col="Tiempo promedio" className="num mono">{textoDuracion(r.minutos_promedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
