/* ============================================================
   Golden Touch · Delivery · Panel central (31/10/2026 · igual que MGG)

   La OC de productos que Tesorería pagó la toma UN motorizado desde su
   teléfono, va en ruta y la entrega en el almacén. Acá se sigue todo desde
   la PC:
     Tablero      → por tomar / aceptados / en camino / entregados hoy, con
                    fotos, comprobante de pago, WhatsApp, reporte del pedido
                    (PDF y WhatsApp) y cancelar si se trabó
     Mapa         → dónde está cada motorizado (Calles / Satelital)
     Histórico    → lo tomado en un rango de fechas, filtrable por estado y
                    delivery, con el reporte en PDF (vista previa) y WhatsApp
     Por delivery → cuántos pedidos lleva cada uno y su tiempo promedio
   Construido pero DESCONECTADO hasta que la administración lo active
   (interruptor compras_delivery): mientras tanto las listas quedan vacías.
   Traído de MGG; en GT la OC entra apenas queda pagada (sin esperar la
   retención) y solo las creadas desde que se encendió.
   02/11/2026: también los RETIROS EN ALMACÉN LOS PINOS (📦, lo que la
   revisión de Almacén marcó como disponible: sin monto ni comprobante, se
   entrega A la unidad / persona); filtro por origen en Histórico; al aceptar
   queda directo «En camino»; los «No disponible» del motorizado se ven con
   su motivo en el Tablero.
   ============================================================ */
import { etiquetaSedeEntrega } from '@/shared/lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { listProveedores } from '@/modules/pedidos/pedidos.repository';
import { useRealtime } from '@/shared/lib/useRealtime';
import { CANALES_DELIVERY, tituloPantallaCanal, type CanalDelivery } from './delivery';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import { quienSync, useQuien } from '@/shared/lib/directorioUsuarios';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import {
  ALMACEN_RETIRO, ESTADO_DELIVERY, cerradoPorRecepcion, MOTIVOS_CANCELACION, ORIGEN_DELIVERY, claveDelivery, destinoRetiro, esRetiroAlmacen,
  etiquetaEstado, fechaHoraVE, mensajeCancelado, minutosEntre, montoTxt, ocDe, rechazosDe, rotuloFotos,
  type FotoDelivery, type PedidoDelivery, type RechazoDelivery,
} from './delivery';
import {
  cancelarPedido, listHistorialDelivery, listPedidosDelivery, listRechazosDelivery, urlFotoDelivery, useDeliveryConectado,
  type FilaHistorialCruda,
} from './delivery.repository';
import {
  RANGOS_DELIVERY, armarFilasHistorial, conteoPorEstado, duracionTxt, mensajeDelPedido, rangoDelivery,
  rangoDeliveryActivo, repartidoresDe, resumenHistorial, sePuedeCancelar, totalesResumen, type FilaHistorialDelivery,
} from './deliveryPanel';
import {
  ESTADOS_FILTRO, ORIGENES_FILTRO, filtrarHistorial, textoReporteGeneral, textoReportePedido,
  type FiltroEstadoDelivery, type FiltroOrigenDelivery,
} from './deliveryReporte';
import { DeliveryMapa } from './DeliveryMapa';
import { pdfHistorialDelivery, pdfPedidoDelivery, pdfPorDelivery } from './deliveryPdf';
import { WhatsappDeliveryModal } from './WhatsappDeliveryModal';
import { ComprobantePagoCuerpo } from './ComprobantePagoDelivery';
import { EditarFotosDeliveryModal, puedeEditarFotosDelivery } from './EditarFotosDelivery';

type Vista = 'tablero' | 'mapa' | 'historico' | 'por_delivery';

const TABS: { key: Vista; label: string; icon: string }[] = [
  { key: 'tablero', label: 'Tablero', icon: '📊' },
  { key: 'mapa', label: 'Mapa', icon: '🗺' },
  { key: 'historico', label: 'Histórico', icon: '📜' },
  { key: 'por_delivery', label: 'Por delivery', icon: '🛵' },
];

const msgError = (e: unknown, def: string) => (e instanceof Error ? e.message : def);

/** GT: el histórico muestra nombre y apellido aunque la toma solo guardara el correo. */
function filasConNombres(rows: FilaHistorialCruda[], proveedores: Map<string, string>): FilaHistorialDelivery[] {
  return armarFilasHistorial(rows, proveedores).map((f) => (f.repartidor.includes('@')
    ? { ...f, repartidor: quienSync(null, f.repartidor) || f.repartidor } : f));
}

export function DeliveryPage({ canal: canalInicial = 'delivery' }: { canal?: CanalDelivery } = {}) {
  // 05/11/2026 (como MGG): Delivery y Carga pesada son dos segmentos de esta misma
  // página; cada quien ve las flotas que su rol tiene.
  const { can, isAdmin, vistasTelefono } = usePermissions();
  const flotas = (Object.keys(CANALES_DELIVERY) as CanalDelivery[]).filter((f) => isAdmin || can(CANALES_DELIVERY[f].modulo));
  const [canal, setCanal] = useState<CanalDelivery>(() => (flotas.includes(canalInicial) ? canalInicial : (flotas[0] ?? 'delivery')));
  const cfgCanal = CANALES_DELIVERY[canal];
  const conectado = useDeliveryConectado();
  const supervisor = isAdmin || can(cfgCanal.modulo, 'full');
  const tieneTelefono = vistasTelefono.some((v) => v.key === canal);
  const puedeAmbos = flotas.length > 1;
  const [vista, setVista] = useState<Vista>('tablero');

  /* ── Tablero: pedidos actuales (y cerrados si se piden) + lo de hoy ── */
  const hoy = useMemo(hoyVenezuela, []);
  const [verCerrados, setVerCerrados] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoDelivery[]>([]);
  const [rechazos, setRechazos] = useState<RechazoDelivery[]>([]);
  const [deHoy, setDeHoy] = useState<FilaHistorialDelivery[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  /* ── Histórico / Por delivery: rango compartido ── */
  const [desde, setDesde] = useState(() => rangoDelivery('semana', hoy).desde);
  const [hasta, setHasta] = useState(hoy);
  const [historial, setHistorial] = useState<FilaHistorialDelivery[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [proveedores, setProveedores] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    listProveedores()
      .then((ps) => setProveedores(new Map(ps.map((p) => [p.id, p.razon_social]))))
      .catch(() => { /* sin nombres: el histórico muestra «—» */ });
  }, []);

  const recargarTablero = useCallback(async () => {
    try {
      const [ps, hh] = await Promise.all([listPedidosDelivery(verCerrados, canal), listHistorialDelivery(hoy, hoy, canal)]);
      // Los «No disponible» de lo que se ve (no frenan el tablero si fallan).
      setRechazos(await listRechazosDelivery(ps.map((p) => p.orden_id)).catch(() => []));
      setPedidos(ps);
      setDeHoy(filasConNombres(hh, proveedores));
      setErrorCarga(null);
    } catch (e) {
      setErrorCarga(msgError(e, 'No se pudieron leer los pedidos de Delivery.'));
    } finally { setCargando(false); }
  }, [verCerrados, hoy, proveedores, canal]);
  useEffect(() => { void recargarTablero(); }, [recargarTablero]);

  const enHistorico = vista === 'historico' || vista === 'por_delivery';
  const recargarHistorial = useCallback(async () => {
    if (!desde || !hasta || desde > hasta) return;
    setCargandoHist(true);
    try {
      setHistorial(filasConNombres(await listHistorialDelivery(desde, hasta, canal), proveedores));
    } catch (e) {
      toast(msgError(e, 'No se pudo leer el histórico.'), 'error');
    } finally { setCargandoHist(false); }
  }, [desde, hasta, proveedores, canal]);
  useEffect(() => { if (enHistorico) void recargarHistorial(); }, [enHistorico, recargarHistorial]);

  // Tiempo real: lo que hace el motorizado en su teléfono (o Tesorería al pagar) se ve sin recargar.
  // Las ubicaciones las escucha el propio mapa: llegan seguido y no cambian las listas.
  useRealtime(['delivery_pedidos', 'delivery_rechazos', 'ordenes', 'solicitudes_revision_almacen'], () => {
    void recargarTablero();
    if (enHistorico) void recargarHistorial();
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.8rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 320px' }}>
          <h1 style={{ margin: 0 }}>{cfgCanal.icono} {tituloPantallaCanal(canal)}</h1>
          {puedeAmbos && (
            <div className="view-toggle canal-toggle" role="tablist" aria-label="Delivery o Carga pesada" style={{ marginTop: '.4rem' }}>
              {flotas.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={k === canal} onClick={() => setCanal(k)}
                  className={k === canal ? 'active' : ''}>{CANALES_DELIVERY[k].icono} {CANALES_DELIVERY[k].titulo}</button>
              ))}
            </div>
          )}
          <p className="hint muted" style={{ margin: '.25rem 0 0' }}>
            Órdenes de productos pagadas por Tesorería que un motorizado acepta, busca donde el proveedor y entrega en el almacén, y retiros en {ALMACEN_RETIRO} de lo que
            Almacén tiene para una solicitud, con fotos y aviso por WhatsApp.
          </p>
        </div>
        {tieneTelefono && <Link to={cfgCanal.rutaTelefono} className="btn btn-ghost btn-sm">📱 Vista de teléfono</Link>}
      </div>

      {conectado === false && (
        <div className="aviso info" style={{ marginBottom: '1rem' }}>
          <span className="aviso-icono">ℹ</span>
          <div>
            <strong>Delivery todavía no está conectado a Compras.</strong> Cuando la administración lo active, acá llegarán las órdenes
            de productos que Tesorería pague desde ese momento (sin esperar la retención). Mientras tanto las listas quedan vacías.
          </div>
        </div>
      )}
      {errorCarga && conectado !== false && (
        <div className="aviso warning" style={{ marginBottom: '1rem' }}>
          <span className="aviso-icono">⚠</span><div>{errorCarga}</div>
        </div>
      )}

      <div className="view-toggle" role="tablist" aria-label="Vista de Delivery" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={vista === t.key} className={vista === t.key ? 'active' : ''} onClick={() => setVista(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {vista === 'tablero' && (
        <TableroTab pedidos={pedidos} rechazos={rechazos} deHoy={deHoy} cargando={cargando} supervisor={supervisor}
          verCerrados={verCerrados} setVerCerrados={setVerCerrados} onCambio={() => void recargarTablero()} />
      )}
      {vista === 'mapa' && <DeliveryMapa pedidos={pedidos} canal={canal} />}
      {enHistorico && (
        <BarraRango hoy={hoy} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} cargando={cargandoHist} />
      )}
      {vista === 'historico' && <HistoricoTab filas={historial} desde={desde} hasta={hasta} />}
      {vista === 'por_delivery' && <PorDeliveryTab filas={historial} desde={desde} hasta={hasta} />}
    </div>
  );
}

/* ───────────── Tablero ───────────── */

function TableroTab({ pedidos, rechazos, deHoy, cargando, supervisor, verCerrados, setVerCerrados, onCambio }: {
  pedidos: PedidoDelivery[]; rechazos: RechazoDelivery[]; deHoy: FilaHistorialDelivery[]; cargando: boolean; supervisor: boolean;
  verCerrados: boolean; setVerCerrados: (v: boolean) => void; onCambio: () => void;
}) {
  const quien = useQuien();
  const c = conteoPorEstado(pedidos);
  const entregadosHoy = deHoy.filter((f) => f.estado === 'entregado').length;
  const canceladosHoy = deHoy.filter((f) => f.estado === 'cancelado').length;
  const urgentes = pedidos.filter((p) => p.estado === 'por_tomar' && p.urgente).length;
  const retirosPorTomar = pedidos.filter((p) => p.estado === 'por_tomar' && esRetiroAlmacen(p)).length;

  const [fotos, setFotos] = useState<PedidoDelivery | null>(null);
  const [whatsapp, setWhatsapp] = useState<{ titulo: string; texto: string } | null>(null);
  const [cancelar, setCancelar] = useState<PedidoDelivery | null>(null);
  const [comprobante, setComprobante] = useState<PedidoDelivery | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);

  // Primero lo urgente y lo más viejo por tomar; después lo en curso; al final lo cerrado.
  const orden: Record<string, number> = { por_tomar: 0, aceptado: 1, en_ruta: 2, entregado: 3, cancelado: 4 };
  const lista = [...pedidos].sort((a, b) => (orden[a.estado] - orden[b.estado])
    || (Number(b.urgente) - Number(a.urgente))
    || String(a.pagada_en ?? a.revisada_en ?? a.aceptado_en ?? '').localeCompare(String(b.pagada_en ?? b.revisada_en ?? b.aceptado_en ?? '')));

  function pdfPedido(p: PedidoDelivery) {
    const k = `${claveDelivery(p)}-${p.pedido_id ?? 'libre'}`;
    setGenerando(k);
    pdfPedidoDelivery(p)
      .catch((e) => toast(msgError(e, 'No se pudo generar el PDF.'), 'error'))
      .finally(() => setGenerando(null));
  }

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <div className="kpi">
          <div className="label">Por tomar</div>
          <div className="value">{c.por_tomar}</div>
          <div className="muted" style={{ fontSize: '.78rem' }}>
            {[urgentes ? `${urgentes} urgente(s)` : 'OC pagadas y retiros sin delivery', retirosPorTomar ? `📦 ${retirosPorTomar} en Almacén` : '']
              .filter(Boolean).join(' · ')}
          </div>
          <div className="icon" aria-hidden="true">💰</div>
        </div>
        <div className="kpi">
          <div className="label">En camino</div>
          {/* 02/11/2026: al aceptar queda directo «En camino» (los «Aceptado» son de antes). */}
          <div className="value">{c.en_ruta + c.aceptado}</div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Aceptados por un delivery, sin entregar</div>
          <div className="icon" aria-hidden="true">🚚</div>
        </div>
        <div className="kpi">
          <div className="label">No disponible</div>
          <div className="value">{rechazos.length}</div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Marcados por un delivery en lo que se ve</div>
          <div className="icon" aria-hidden="true">✕</div>
        </div>
        <div className="kpi">
          <div className="label">Entregados hoy</div>
          <div className="value">{entregadosHoy}</div>
          <div className="muted" style={{ fontSize: '.78rem' }}>{canceladosHoy ? `${canceladosHoy} cancelado(s) hoy` : 'Sin cancelaciones hoy'}</div>
          <div className="icon" aria-hidden="true">✅</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
          <span>📦 Pedidos</span>
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem', fontWeight: 400 }}>
            <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />
            Ver también entregados y cancelados
          </label>
        </div>
        {cargando ? <p className="muted">Cargando…</p> : !lista.length ? (
          <p className="muted" style={{ margin: '.4rem 0' }}>No hay pedidos {verCerrados ? '' : 'por tomar ni en curso '}por ahora.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '.85rem' }}>
              <thead>
                <tr>
                  <th>OC / SP</th><th>Proveedor / Origen</th><th>Delivery</th><th>Estado</th><th>Tiempos</th><th>Monto</th><th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const retiro = esRetiroAlmacen(p);
                  const est = ESTADO_DELIVERY[p.estado];
                  const nFotos = p.fotos_recibo.length + p.fotos_entrega.length;
                  const msg = mensajeDelPedido(p);
                  const fin = p.estado === 'cancelado' ? p.cancelado_en : p.entregado_en;
                  const clave = `${claveDelivery(p)}-${p.pedido_id ?? 'libre'}`;
                  const noDisp = rechazosDe(p, rechazos);
                  const destino = retiro ? (p.almacen_entrega || destinoRetiro(p)) : p.almacen_destino;
                  return (
                    <tr key={clave}>
                      <td>
                        <strong>{retiro ? p.codigo : ocDe(p)}</strong>
                        {p.urgente && <> <span className="badge danger">URGENTE</span></>}
                        {destino && <div className="muted" style={{ fontSize: '.75rem' }}>🏬 {retiro ? `Entregar a: ${destino}` : destino}</div>}
                        {!retiro && etiquetaSedeEntrega(p.sede_entrega) && <div className="muted" style={{ fontSize: '.75rem' }}>📍 Recepción: <strong>Almacén {etiquetaSedeEntrega(p.sede_entrega)}</strong></div>}
                      </td>
                      <td>
                        {retiro ? <span className="badge info">{ORIGEN_DELIVERY.almacen.emoji} Retiro en {ALMACEN_RETIRO}</span> : (p.proveedor_nombre ?? '—')}
                        {!retiro && p.proveedor_direccion && <div className="muted" style={{ fontSize: '.75rem' }}>📍 {p.proveedor_direccion}</div>}
                        {retiro && p.analista_nombre && <div className="muted" style={{ fontSize: '.75rem' }}>Revisó: {p.analista_nombre}</div>}
                      </td>
                      <td>
                        {p.repartidor_nombre ? quien(p.repartidor_nombre) : <span className="muted">—</span>}
                        {noDisp.map((r) => (
                          <div key={r.id} className="muted" style={{ fontSize: '.75rem', color: 'var(--danger)' }}
                            title={`${fechaHoraVE(r.created_at)} · ${r.motivo}`}>
                            ✕ No disponible: {r.repartidor_nombre ? quien(r.repartidor_nombre) : (r.repartidor_email ?? '—')} — {r.motivo}
                          </div>
                        ))}
                      </td>
                      <td>
                        <span className={`badge ${est?.badge ?? ''}`}>{cerradoPorRecepcion(p) ? '📥' : est?.emoji} {etiquetaEstado(p.estado, p.origen, p.motivo_cancel)}</span>
                        {p.estado === 'cancelado' && p.motivo_cancel && <div className="muted" style={{ fontSize: '.75rem' }}>{p.motivo_cancel}</div>}
                      </td>
                      <td style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                        {!retiro && p.pagada_en && <div>💰 Pagada {fechaHoraVE(p.pagada_en)}</div>}
                        {retiro && p.revisada_en && <div>📦 Revisada {fechaHoraVE(p.revisada_en)}</div>}
                        {p.aceptado_en && <div>🛵 Aceptada {fechaHoraVE(p.aceptado_en)}</div>}
                        {p.en_ruta_en && p.en_ruta_en !== p.aceptado_en && <div>🚚 En camino {fechaHoraVE(p.en_ruta_en)}</div>}
                        {fin && <div>{p.estado === 'cancelado' ? '⛔' : '✅'} {fechaHoraVE(fin)}</div>}
                        {p.estado === 'entregado' && <div className="muted">⏳ {duracionTxt(minutosEntre(p.aceptado_en, p.entregado_en))}</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{retiro ? <span className="muted">—</span> : montoTxt(p.total, p.moneda)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '.3rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {!retiro && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setComprobante(p)} title="Comprobante que adjuntó Tesorería al pagar">🧾 Comprobante de pago</button>}
                          <button type="button" className="btn btn-ghost btn-sm" disabled={!nFotos && p.estado !== 'entregado'} onClick={() => setFotos(p)} title={nFotos ? 'Ver fotos' : p.estado === 'entregado' ? 'Sin fotos: puedes agregarlas' : 'Sin fotos todavía'}>📷 {nFotos}</button>
                          {msg && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWhatsapp(msg)}>💬 WhatsApp</button>}
                          <button type="button" className="btn btn-ghost btn-sm" disabled={generando === clave} onClick={() => pdfPedido(p)}
                            title="Reporte del pedido en PDF (vista previa)">
                            {generando === clave ? 'Generando…' : '📄 PDF'}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" title="Reporte del pedido por WhatsApp"
                            onClick={() => setWhatsapp({ titulo: `Reporte del pedido ${retiro ? p.codigo : ocDe(p)}`, texto: textoReportePedido(p, quienSync) })}>
                            📋 Reporte
                          </button>
                          {supervisor && sePuedeCancelar(p) && (
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setCancelar(p)}>⛔ Cancelar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {fotos && <FotosModal pedido={fotos} onClose={() => setFotos(null)} onCambio={onCambio} />}
      {comprobante && <ComprobanteModal pedido={comprobante} onClose={() => setComprobante(null)} />}
      {whatsapp && <WhatsappDeliveryModal titulo={whatsapp.titulo} texto={whatsapp.texto} onClose={() => setWhatsapp(null)} />}
      {cancelar && (
        <CancelarModal pedido={cancelar} onClose={() => setCancelar(null)}
          onCancelado={(texto) => { setCancelar(null); onCambio(); setWhatsapp({ titulo: 'Pedido cancelado', texto }); }} />
      )}
    </>
  );
}

/* ───────────── Fotos del pedido ───────────── */

function FotosModal({ pedido, onClose, onCambio }: { pedido: PedidoDelivery; onClose: () => void; onCambio: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const { can, isAdmin } = usePermissions();
  const [editar, setEditar] = useState(false);
  const titulo = esRetiroAlmacen(pedido) ? pedido.codigo : ocDe(pedido);
  useEffect(() => {
    let vivo = true;
    const todas = [...pedido.fotos_recibo, ...pedido.fotos_entrega];
    void Promise.all(todas.map(async (f) => [f.path, await urlFotoDelivery(f.path).catch(() => '')] as const))
      .then((pares) => { if (vivo) setUrls(Object.fromEntries(pares)); });
    return () => { vivo = false; };
  }, [pedido]);

  const grupo = (titulo: string, fs: FotoDelivery[]) => (
    <div style={{ marginBottom: '1rem' }}>
      <div className="card-title" style={{ fontSize: '.9rem' }}>{titulo} ({fs.length})</div>
      {!fs.length ? <p className="muted" style={{ margin: 0 }}>Sin fotos.</p> : (
        <div style={{ display: 'grid', gap: '.6rem', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {fs.map((f) => (
            urls[f.path] ? (
              <a key={f.path} href={urls[f.path]} target="_blank" rel="noopener noreferrer" title={f.filename}>
                <img src={urls[f.path]} alt={f.filename} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
              </a>
            ) : (
              <div key={f.path} className="muted" style={{ height: 140, display: 'grid', placeItems: 'center', border: '1px dashed var(--border)', borderRadius: 8, fontSize: '.8rem' }}>
                {f.path in urls ? 'No se pudo abrir' : 'Cargando…'}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Modal title={`📷 Fotos · ${titulo}`} size="lg" onClose={onClose}
      footer={<>
        {/* 03/11/2026: pedido entregado → se pueden corregir las fotos (agregar / quitar). */}
        {puedeEditarFotosDelivery(pedido, isAdmin, can('delivery', 'escritura') || can('carga_pesada', 'escritura')) && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditar(true)}>✏ Editar fotos</button>
        )}
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </>}>
      {editar && pedido.pedido_id && (
        <EditarFotosDeliveryModal pedidoId={pedido.pedido_id} origen={pedido.origen} titulo={titulo}
          fotosRecibo={pedido.fotos_recibo} fotosEntrega={pedido.fotos_entrega}
          onClose={() => setEditar(false)} onGuardado={() => { onCambio(); onClose(); }} />
      )}
      {grupo(rotuloFotos(pedido.origen, 'recibo'), pedido.fotos_recibo)}
      {grupo(rotuloFotos(pedido.origen, 'entrega'), pedido.fotos_entrega)}
      {pedido.nota_entrega && <p><strong>Nota de entrega:</strong> {pedido.nota_entrega}</p>}
    </Modal>
  );
}

/* ───────────── Comprobante de pago (se lee al abrir) ───────────── */

function ComprobanteModal({ pedido, onClose }: { pedido: PedidoDelivery; onClose: () => void }) {
  return (
    <Modal title={`🧾 Comprobante de pago · ${ocDe(pedido)}`} size="lg" onClose={onClose} minimizable={false}
      footer={<button className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      <ComprobantePagoCuerpo pedido={pedido} />
    </Modal>
  );
}

/* ───────────── Cancelar un pedido trabado (supervisor) ───────────── */

function CancelarModal({ pedido, onClose, onCancelado }: {
  pedido: PedidoDelivery; onClose: () => void; onCancelado: (mensaje: string) => void;
}) {
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELACION[0]);
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esOtro = motivo === MOTIVOS_CANCELACION[MOTIVOS_CANCELACION.length - 1];
  const falta = esOtro && !detalle.trim();

  async function confirmar() {
    if (!pedido.pedido_id || falta) return;
    setGuardando(true);
    try {
      await cancelarPedido(pedido.pedido_id, motivo, detalle.trim() || null);
      toast(`${esRetiroAlmacen(pedido) ? `Retiro ${pedido.codigo}` : ocDe(pedido)} cancelado: queda libre para otro delivery.`, 'success');
      onCancelado(mensajeCancelado(pedido, pedido.repartidor_nombre || 'Delivery', motivo, detalle, new Date().toISOString()));
    } catch (e) {
      toast(msgError(e, 'No se pudo cancelar el pedido.'), 'error');
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={`⛔ Cancelar · ${esRetiroAlmacen(pedido) ? pedido.codigo : ocDe(pedido)}`} compact onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Volver</button>
          <button className="btn btn-danger" onClick={() => void confirmar()} disabled={guardando || falta}>{guardando ? 'Cancelando…' : 'Cancelar pedido'}</button>
        </>
      )}>
      <p style={{ marginTop: 0 }}>
        Lo tiene <strong>{pedido.repartidor_nombre ?? '—'}</strong> ({etiquetaEstado(pedido.estado, pedido.origen).toLowerCase()}).
        Al cancelarlo, {esRetiroAlmacen(pedido) ? `el retiro en ${ALMACEN_RETIRO}` : 'la orden'} queda disponible para otro delivery.
      </p>
      <div className="form-row">
        <label htmlFor="dlv-motivo">Motivo</label>
        <select id="dlv-motivo" className="select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS_CANCELACION.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="dlv-detalle">Detalle {esOtro ? '(obligatorio)' : '(opcional)'}</label>
        <textarea id="dlv-detalle" className="input" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)}
          placeholder="Qué pasó, con quién se habló…" />
      </div>
    </Modal>
  );
}

/* ───────────── Rango de fechas (Histórico y Por delivery) ───────────── */

function BarraRango({ hoy, desde, hasta, setDesde, setHasta, cargando }: {
  hoy: string; desde: string; hasta: string; setDesde: (v: string) => void; setHasta: (v: string) => void; cargando: boolean;
}) {
  const activo = rangoDeliveryActivo(desde, hasta, hoy);
  return (
    <div className="card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-end', gap: '.8rem', flexWrap: 'wrap' }}>
      <div className="form-row" style={{ margin: 0 }}>
        <label htmlFor="dlv-desde" style={{ fontSize: '.72rem' }}>Desde</label>
        <input id="dlv-desde" className="input" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div className="form-row" style={{ margin: 0 }}>
        <label htmlFor="dlv-hasta" style={{ fontSize: '.72rem' }}>Hasta</label>
        <input id="dlv-hasta" className="input" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {RANGOS_DELIVERY.map((r) => (
          <button key={r.valor} type="button" className={`chip${activo === r.valor ? ' chip-active' : ''}`} aria-pressed={activo === r.valor}
            onClick={() => { const x = rangoDelivery(r.valor, hoy); setDesde(x.desde); setHasta(x.hasta); }}>
            {r.label}
          </button>
        ))}
      </div>
      {cargando && <span className="muted" style={{ fontSize: '.85rem' }}>Cargando…</span>}
    </div>
  );
}

/* ───────────── Histórico ───────────── */

function HistoricoTab({ filas, desde, hasta }: { filas: FilaHistorialDelivery[]; desde: string; hasta: string }) {
  const [repartidor, setRepartidor] = useState('');
  const [estado, setEstado] = useState<FiltroEstadoDelivery>('');
  const [origen, setOrigen] = useState<FiltroOrigenDelivery>('');
  const repartidores = useMemo(() => repartidoresDe(filas), [filas]);
  const visibles = useMemo(() => filtrarHistorial(filas, { estado, repartidor, origen }), [filas, estado, repartidor, origen]);
  const [generando, setGenerando] = useState(false);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);

  function pdf() {
    setGenerando(true);
    pdfHistorialDelivery({ desde, hasta, repartidor: repartidor || null, estado: estado || null, origen: origen || null, filas: visibles })
      .catch((e) => toast(msgError(e, 'No se pudo generar el PDF.'), 'error'))
      .finally(() => setGenerando(false));
  }

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <span>📜 Histórico ({visibles.length})</span>
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={origen}
          onChange={(e) => setOrigen(e.target.value as FiltroOrigenDelivery)} aria-label="Filtrar por origen">
          {ORIGENES_FILTRO.map((x) => <option key={x.valor} value={x.valor}>{x.label}</option>)}
        </select>
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={estado}
          onChange={(e) => setEstado(e.target.value as FiltroEstadoDelivery)} aria-label="Filtrar por estado">
          {ESTADOS_FILTRO.map((x) => <option key={x.valor} value={x.valor}>{x.label}</option>)}
        </select>
        <select className="select" style={{ width: 'auto', minWidth: 200 }} value={repartidor} onChange={(e) => setRepartidor(e.target.value)} aria-label="Filtrar por delivery">
          <option value="">Todos los delivery</option>
          {repartidores.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={generando} onClick={pdf}>
            {generando ? 'Generando…' : '📄 PDF (vista previa)'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setWhatsapp(textoReporteGeneral({ desde, hasta, estado: estado || null, repartidor: repartidor || null, origen: origen || null, filas: visibles }))}>
            💬 WhatsApp
          </button>
        </span>
      </div>
      {!visibles.length ? <p className="muted" style={{ margin: '.4rem 0' }}>No hay pedidos tomados con esos filtros.</p> : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead>
              <tr>
                <th>Tomado</th><th>Origen</th><th>OC / SP</th><th>Proveedor</th><th>Delivery</th><th>Estado</th><th>En camino</th>
                <th>Entregado / Cancelado</th><th style={{ textAlign: 'right' }}>Tiempo</th><th>Almacén / Entregado a / Motivo</th>
                <th style={{ textAlign: 'right' }}>Fotos</th><th style={{ textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const est = ESTADO_DELIVERY[f.estado];
                return (
                  <tr key={f.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHoraVE(f.fecha)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{ORIGEN_DELIVERY[f.origen].emoji} {ORIGEN_DELIVERY[f.origen].corto}</td>
                    <td><strong>{f.oc}</strong></td>
                    <td>{f.proveedor}</td>
                    <td>{f.repartidor}</td>
                    <td><span className={`badge ${est?.badge ?? ''}`}>{cerradoPorRecepcion(f) ? '📥' : est?.emoji} {etiquetaEstado(f.estado, f.origen, f.motivo_cancel)}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHoraVE(f.en_ruta_en) || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHoraVE(f.estado === 'cancelado' ? f.cancelado_en : f.entregado_en) || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{duracionTxt(f.minutos)}</td>
                    <td>
                      {(f.estado === 'cancelado' ? f.motivo_cancel : f.almacen_entrega) || '—'}
                      {f.estado !== 'cancelado' && f.nota_entrega && <div className="muted" style={{ fontSize: '.75rem' }}>📝 {f.nota_entrega}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{f.fotos}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{f.origen === 'almacen' ? '—' : montoTxt(f.total, f.moneda)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {whatsapp && <WhatsappDeliveryModal titulo="Reporte de Delivery" texto={whatsapp} onClose={() => setWhatsapp(null)} />}
    </div>
  );
}

/* ───────────── Por delivery ───────────── */

function PorDeliveryTab({ filas, desde, hasta }: { filas: FilaHistorialDelivery[]; desde: string; hasta: string }) {
  const resumen = useMemo(() => resumenHistorial(filas), [filas]);
  const t = totalesResumen(resumen);
  const [generando, setGenerando] = useState(false);

  function pdf() {
    setGenerando(true);
    pdfPorDelivery({ desde, hasta, resumen })
      .catch((e) => toast(msgError(e, 'No se pudo generar el PDF.'), 'error'))
      .finally(() => setGenerando(false));
  }

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <span>🛵 Pedidos por delivery</span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} disabled={generando || !resumen.length} onClick={pdf}>
          📄 PDF (vista previa)
        </button>
      </div>
      {!resumen.length ? <p className="muted" style={{ margin: '.4rem 0' }}>Ningún delivery tomó pedidos en ese rango.</p> : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.88rem' }}>
            <thead>
              <tr>
                <th>Delivery</th><th style={{ textAlign: 'right' }}>Entregados</th><th style={{ textAlign: 'right' }}>Cancelados</th>
                <th style={{ textAlign: 'right' }}>En curso</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Tiempo promedio</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.repartidor}>
                  <td><strong>{r.repartidor}</strong></td>
                  <td style={{ textAlign: 'right' }}>{r.entregados}</td>
                  <td style={{ textAlign: 'right' }}>{r.cancelados}</td>
                  <td style={{ textAlign: 'right' }}>{r.enCurso}</td>
                  <td style={{ textAlign: 'right' }}>{r.entregados + r.cancelados + r.enCurso}</td>
                  <td style={{ textAlign: 'right' }}>{duracionTxt(r.minutosPromedio)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td style={{ textAlign: 'right' }}>{t.entregados}</td>
                <td style={{ textAlign: 'right' }}>{t.cancelados}</td>
                <td style={{ textAlign: 'right' }}>{t.enCurso}</td>
                <td style={{ textAlign: 'right' }}>{t.entregados + t.cancelados + t.enCurso}</td>
                <td style={{ textAlign: 'right' }}>{duracionTxt(t.minutosPromedio)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="hint muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
        Tiempo promedio = desde que el delivery toma el pedido hasta que lo entrega en el almacén. Cada cancelación cuenta, aunque la orden la haya retomado otro.
      </p>
    </div>
  );
}
