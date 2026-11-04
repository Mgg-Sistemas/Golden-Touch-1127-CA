/* ============================================================
   Golden Touch · Delivery · Mapa de los motorizados (31/10/2026 · traído de MGG)

   Leaflet a secas (sin react-leaflet), centrado en Puerto Ordaz, estado
   Bolívar. Dos capas: «Calles» (OpenStreetMap) y «Satelital» (Esri World
   Imagery). Un marcador por motorizado con su última ubicación; si tiene
   más de UBICACION_VIEJA_MS se pinta gris, «sin señal reciente». Se mueve
   solo con el tiempo real de `delivery_ubicaciones`.

   03/11/2026 (pedido de la usuaria, estilo Yummy / Ridery):
   · la RUTA PREVISTA de cada motorizado con pedido en curso (OSRM: de donde
     está → al proveedor / a Los Pinos → al Almacén Los Pinos), punteada, y
     su RECORRIDO real (delivery_rastro), continuo, con el color de cada uno;
   · los PROVEEDORES con OC pagadas por tomar (🏭) y el ALMACÉN LOS PINOS (🏬);
   · «📍 Marcar Almacén Los Pinos»: un clic en el mapa lo deja guardado
     (delivery_lugares; moverlo ya marcado: admin o Delivery completo);
   · leyenda debajo del mapa.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import {
  ALMACEN_RETIRO, PUERTO_ORDAZ, UBICACION_VIEJA_MS, esRetiroAlmacen, fechaHoraVE, montoTxt, ocDe, type PedidoDelivery, type UbicacionDelivery,
} from './delivery';
import {
  fijarLugarDelivery, listRastroDelivery, listUbicaciones, useUbicacionesRuta, type PuntoRastro,
} from './delivery.repository';
import { escaparHtml, ubicacionVieja } from './deliveryPanel';
import { distanciaMetros } from './deliveryMovil';
import {
  LUGAR_LOS_PINOS, RECALCULAR_RUTA_M, calcularRuta, claveRuta, distanciaTxt, duracionTxt, paradasRuta, puntoLugar,
  type ParadaRuta, type PuntoMapa, type RutaCalculada,
} from './deliveryRutas';

const ZOOM_INICIAL = 13;
/** Un color por motorizado (ruta, recorrido y borde del marcador). */
const COLORES = ['#2563eb', '#db2777', '#059669', '#7c3aed', '#d97706', '#0891b2', '#dc2626', '#4d7c0f'];

function icono(nombre: string, vieja: boolean, color: string): L.DivIcon {
  const fondo = vieja ? '#9ca3af' : '#ff8a00';
  const html = `<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 4px;border-radius:999px;`
    + `background:${fondo};color:#fff;font:600 12px/1.2 system-ui,sans-serif;white-space:nowrap;`
    + `box-shadow:0 2px 6px rgba(0,0,0,.35);border:3px solid ${vieja ? '#fff' : color};transform:translate(-50%,-50%);`
    + `${vieja ? 'opacity:.85;' : ''}"><span style="font-size:16px">🛵</span>${escaparHtml(nombre)}</div>`;
  // Tamaño 0: el contenido se centra solo con el translate, sea cual sea el largo del nombre.
  return L.divIcon({ html, className: 'dlv-marcador', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -14] });
}

function chip(html: string, fondo: string): L.DivIcon {
  const h = `<div style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px 2px 5px;border-radius:999px;background:${fondo};`
    + `color:#fff;font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);`
    + `border:2px solid #fff;transform:translate(-50%,-50%)">${html}</div>`;
  return L.divIcon({ html: h, className: 'dlv-marcador', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12] });
}

interface RutaPrevista { clave: string; ruta: RutaCalculada; paradas: ParadaRuta[] }

function globo(u: UbicacionDelivery, pedido: PedidoDelivery | undefined, vieja: boolean, prevista: RutaPrevista | undefined): string {
  const nombre = u.repartidor_nombre || u.repartidor_email || 'Delivery';
  const partes = [
    `<div style="color:#1f2937;font:13px/1.4 system-ui,sans-serif;min-width:180px">`,
    `<div style="font-weight:700;font-size:14px">🛵 ${escaparHtml(nombre)}</div>`,
    `<div>Última señal: ${escaparHtml(fechaHoraVE(u.actualizado_en))}</div>`,
  ];
  if (vieja) partes.push('<div style="color:#b45309;font-weight:600">Sin señal reciente</div>');
  if (u.precision_m != null) partes.push(`<div style="color:#6b7280">Precisión ± ${Math.round(u.precision_m)} m</div>`);
  if (pedido) {
    const retiro = esRetiroAlmacen(pedido);
    partes.push(
      `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #e5e7eb">`
      + `<b>${escaparHtml(retiro ? pedido.codigo : ocDe(pedido))}</b> · ${escaparHtml(retiro ? `Retiro en ${ALMACEN_RETIRO}` : (pedido.proveedor_nombre ?? '—'))}`
      + `${pedido.almacen_destino && !retiro ? `<br>Hacia: ${escaparHtml(pedido.almacen_destino)}` : ''}</div>`,
    );
  }
  if (prevista) {
    const destinos = prevista.paradas.filter((p) => p.tipo !== 'yo').map((p) => escaparHtml(p.nombre)).join(' → ');
    partes.push(
      `<div style="margin-top:4px;color:#1d4ed8"><b>🧭 Ruta prevista:</b> ${escaparHtml(distanciaTxt(prevista.ruta.metros))}`
      + `${prevista.ruta.segundos != null ? ` · ${escaparHtml(duracionTxt(prevista.ruta.segundos))}` : ' (línea recta)'}`
      + `${destinos ? `<br>${destinos}` : ''}</div>`,
    );
  }
  partes.push('</div>');
  return partes.join('');
}

const enCurso = (p: PedidoDelivery | undefined) => !!p && (p.estado === 'aceptado' || p.estado === 'en_ruta');

export function DeliveryMapa({ pedidos }: { pedidos: PedidoDelivery[] }) {
  const puedeMarcar = usePermissions().can('delivery', 'escritura');
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const capaLugares = useRef<L.LayerGroup | null>(null);
  const capaRutas = useRef<L.LayerGroup | null>(null);
  const [ubicaciones, setUbicaciones] = useState<UbicacionDelivery[]>([]);
  const [rastro, setRastro] = useState<Map<string, PuntoRastro[]>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [modoPinos, setModoPinos] = useState(false);
  const [pinosPendiente, setPinosPendiente] = useState<PuntoMapa | null>(null);

  const pedidoPorId = useMemo(() => {
    const mp = new Map<string, PedidoDelivery>();
    for (const p of pedidos) if (p.pedido_id) mp.set(p.pedido_id, p);
    return mp;
  }, [pedidos]);
  const idsEnCurso = useMemo(() => pedidos.filter((p) => enCurso(p)).map((p) => p.pedido_id as string).sort().join(','), [pedidos]);

  const { provs, lugares } = useUbicacionesRuta(pedidos.map((p) => p.proveedor_id));
  const losPinos = useMemo(() => puntoLugar(lugares, LUGAR_LOS_PINOS), [lugares]);

  const cargar = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([
        listUbicaciones(),
        listRastroDelivery(idsEnCurso ? idsEnCurso.split(',') : []).catch(() => new Map<string, PuntoRastro[]>()),
      ]);
      setUbicaciones(u);
      setRastro(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las ubicaciones.');
    }
  }, [idsEnCurso]);
  useEffect(() => { void cargar(); }, [cargar]);
  // El rastro se anota junto con cada ubicación: basta con escuchar delivery_ubicaciones.
  useRealtime(['delivery_ubicaciones'], () => { void cargar(); });

  // Cada 30 s se revisa quién quedó «sin señal reciente» aunque no llegue nada nuevo.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Clic en el mapa (solo en el modo «Marcar Almacén Los Pinos»).
  const alClic = useRef<((p: PuntoMapa) => void) | null>(null);
  useEffect(() => {
    alClic.current = modoPinos ? (p) => setPinosPendiente(p) : null;
  }, [modoPinos]);

  // El mapa se crea una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { center: PUERTO_ORDAZ, zoom: ZOOM_INICIAL });
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    });
    const satelital = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics y la comunidad GIS',
    });
    calles.addTo(m);
    L.control.layers({ Calles: calles, Satelital: satelital }, undefined, { position: 'topright' }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    capaRutas.current = L.layerGroup().addTo(m);
    capaLugares.current = L.layerGroup().addTo(m);
    capa.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => alClic.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapa.current = m;
    // El contenedor puede haber cambiado de tamaño al abrir la pestaña.
    const t = setTimeout(() => m.invalidateSize(), 120);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      capa.current = null;
      capaLugares.current = null;
      capaRutas.current = null;
    };
  }, []);

  useEffect(() => {
    const el = contenedor.current;
    if (el) el.style.cursor = modoPinos ? 'crosshair' : '';
  }, [modoPinos]);

  // Color fijo por motorizado (orden alfabético del id: no cambia al moverse).
  const colorDe = useMemo(() => {
    const ids = [...new Set(ubicaciones.map((u) => u.repartidor_id))].sort();
    return (id: string) => COLORES[Math.max(0, ids.indexOf(id)) % COLORES.length];
  }, [ubicaciones]);

  /* ── Ruta prevista de cada motorizado con pedido en curso ── */
  const [previstas, setPrevistas] = useState<Map<string, RutaPrevista>>(() => new Map());
  const origenes = useRef(new Map<string, PuntoMapa>());
  const previstasRef = useRef(previstas);
  useEffect(() => { previstasRef.current = previstas; }, [previstas]);
  useEffect(() => {
    let vivo = true;
    const activos = new Set<string>();
    const pendientes: Array<{ rep: string; clave: string; paradas: ParadaRuta[] }> = [];
    for (const u of ubicaciones) {
      const pedido = u.pedido_id ? pedidoPorId.get(u.pedido_id) : undefined;
      if (!enCurso(pedido) || ubicacionVieja(u.actualizado_en, ahora) || !Number.isFinite(u.lat) || !Number.isFinite(u.lng)) continue;
      activos.add(u.repartidor_id);
      const aqui = { lat: u.lat, lng: u.lng };
      const antes = origenes.current.get(u.repartidor_id);
      const origen = antes && distanciaMetros(antes, aqui) <= RECALCULAR_RUTA_M ? antes : aqui;
      origenes.current.set(u.repartidor_id, origen);
      const paradas = paradasRuta(pedido as PedidoDelivery, origen, provs, losPinos);
      if (paradas.length < 2) continue;
      const clave = claveRuta(paradas.map((p) => p.punto));
      if (previstasRef.current.get(u.repartidor_id)?.clave !== clave) pendientes.push({ rep: u.repartidor_id, clave, paradas });
    }
    // Quien ya no tiene pedido en curso pierde su ruta.
    const sobran = [...previstasRef.current.keys()].filter((k) => !activos.has(k));
    if (sobran.length) {
      setPrevistas((prev) => { const n = new Map(prev); sobran.forEach((k) => n.delete(k)); return n; });
    }
    for (const x of pendientes) {
      void calcularRuta(x.paradas.map((p) => p.punto)).then((ruta) => {
        if (!vivo) return;
        setPrevistas((prev) => new Map(prev).set(x.rep, { clave: x.clave, ruta, paradas: x.paradas }));
      });
    }
    return () => { vivo = false; };
  }, [ubicaciones, pedidoPorId, provs, losPinos, ahora]);

  // Motorizados: se rehacen con cada cambio (son pocos).
  useEffect(() => {
    const g = capa.current;
    if (!g) return;
    g.clearLayers();
    for (const u of ubicaciones) {
      if (!Number.isFinite(u.lat) || !Number.isFinite(u.lng)) continue;
      const vieja = ubicacionVieja(u.actualizado_en, ahora);
      const nombre = u.repartidor_nombre || u.repartidor_email || 'Delivery';
      const pedido = u.pedido_id ? pedidoPorId.get(u.pedido_id) : undefined;
      L.marker([u.lat, u.lng], { icon: icono(nombre, vieja, colorDe(u.repartidor_id)), title: nombre, zIndexOffset: vieja ? 0 : 1000 })
        .bindPopup(globo(u, pedido, vieja, previstas.get(u.repartidor_id)))
        .addTo(g);
    }
  }, [ubicaciones, pedidoPorId, ahora, previstas, colorDe]);

  // Rutas previstas (punteadas) y recorridos (continuos).
  useEffect(() => {
    const g = capaRutas.current;
    if (!g) return;
    g.clearLayers();
    for (const u of ubicaciones) {
      const color = colorDe(u.repartidor_id);
      const r = u.pedido_id ? rastro.get(u.pedido_id) : undefined;
      if (r && r.length >= 2 && enCurso(pedidoPorId.get(u.pedido_id as string))) {
        L.polyline(r.map((x) => [x.lat, x.lng] as [number, number]), { color, weight: 4, opacity: 0.55, interactive: false }).addTo(g);
      }
      const prev = previstas.get(u.repartidor_id);
      if (prev) {
        L.polyline(prev.ruta.linea, { color, weight: 5, opacity: 0.85, dashArray: '10 8' })
          .bindTooltip(`${u.repartidor_nombre || 'Delivery'} · ${distanciaTxt(prev.ruta.metros)}${prev.ruta.segundos != null ? ` · ${duracionTxt(prev.ruta.segundos)}` : ''}`, { sticky: true })
          .addTo(g);
        for (const p of prev.paradas) {
          if (p.tipo === 'recogida' && !esRetiroAlmacen({ origen: pedidoPorId.get(u.pedido_id as string)?.origen })) {
            L.circleMarker([p.punto.lat, p.punto.lng], { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, interactive: false }).addTo(g);
          }
        }
      }
    }
  }, [ubicaciones, rastro, previstas, pedidoPorId, colorDe]);

  // Proveedores con OC por tomar (uno por proveedor) y el Almacén Los Pinos.
  const porTomar = useMemo(() => pedidos.filter((p) => p.estado === 'por_tomar'), [pedidos]);
  const { gruposProv, sinUbicacion } = useMemo(() => {
    const grupos = new Map<string, { nombre: string; punto: PuntoMapa; ocs: PedidoDelivery[] }>();
    const sin = new Set<string>();
    for (const p of porTomar) {
      if (esRetiroAlmacen(p) || !p.proveedor_id) continue;
      const punto = provs.get(p.proveedor_id);
      if (!punto) { sin.add(p.proveedor_id); continue; }
      const g = grupos.get(p.proveedor_id) ?? { nombre: p.proveedor_nombre ?? 'Proveedor', punto, ocs: [] };
      g.ocs.push(p);
      grupos.set(p.proveedor_id, g);
    }
    return { gruposProv: [...grupos.values()], sinUbicacion: sin.size };
  }, [porTomar, provs]);
  const retirosPorTomar = porTomar.filter((p) => esRetiroAlmacen(p)).length;

  useEffect(() => {
    const g = capaLugares.current;
    if (!g) return;
    g.clearLayers();
    for (const x of gruposProv) {
      const urgente = x.ocs.some((p) => p.urgente);
      const lista = x.ocs.map((p) => `<li><b>${escaparHtml(ocDe(p))}</b> · ${escaparHtml(montoTxt(p.total, p.moneda))}${p.urgente ? ' · 🚨 Urgente' : ''}</li>`).join('');
      L.marker([x.punto.lat, x.punto.lng], {
        icon: chip(`🏭 ${escaparHtml(x.nombre.length > 26 ? `${x.nombre.slice(0, 25)}…` : x.nombre)}${x.ocs.length > 1 ? ` (${x.ocs.length})` : ''}`, urgente ? '#dc2626' : '#ea580c'),
        zIndexOffset: 400,
      }).bindPopup(`<div style="color:#1f2937;font:13px/1.4 system-ui,sans-serif;min-width:180px"><div style="font-weight:700">🏭 ${escaparHtml(x.nombre)}</div>`
        + `<div>OC pagadas por tomar:</div><ul style="margin:.2rem 0 0;padding-left:1rem">${lista}</ul></div>`).addTo(g);
    }
    if (losPinos) {
      L.marker([losPinos.lat, losPinos.lng], {
        icon: chip(`🏬 ${escaparHtml(ALMACEN_RETIRO)}${retirosPorTomar ? ` · ${retirosPorTomar} retiro${retirosPorTomar === 1 ? '' : 's'}` : ''}`, '#7c3aed'),
        zIndexOffset: 600,
      }).addTo(g);
    }
    if (pinosPendiente) {
      L.circleMarker([pinosPendiente.lat, pinosPendiente.lng], { radius: 9, color: '#7c3aed', weight: 3, fillColor: '#c4b5fd', fillOpacity: 0.9 }).addTo(g);
    }
  }, [gruposProv, losPinos, retirosPorTomar, pinosPendiente]);

  async function guardarPinos() {
    if (!pinosPendiente) return;
    try {
      await fijarLugarDelivery(LUGAR_LOS_PINOS, pinosPendiente);
      toast(`${ALMACEN_RETIRO} quedó marcado en el mapa.`, 'success');
      setModoPinos(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo marcar el almacén.', 'error');
    } finally {
      setPinosPendiente(null);
    }
  }

  function verATodos() {
    const m = mapa.current;
    if (!m) return;
    const puntos: L.LatLng[] = ubicaciones.filter((u) => Number.isFinite(u.lat) && Number.isFinite(u.lng)).map((u) => L.latLng(u.lat, u.lng));
    gruposProv.forEach((x) => puntos.push(L.latLng(x.punto.lat, x.punto.lng)));
    if (losPinos) puntos.push(L.latLng(losPinos.lat, losPinos.lng));
    if (!puntos.length) { m.setView(PUERTO_ORDAZ, ZOOM_INICIAL); return; }
    m.fitBounds(L.latLngBounds(puntos), { padding: [48, 48], maxZoom: 16 });
  }

  const conSenal = ubicaciones.filter((u) => !ubicacionVieja(u.actualizado_en, ahora)).length;
  const enRutaConMapa = previstas.size;

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <span>🗺 Motorizados en el mapa</span>
        <span className="badge success">{conSenal} con señal</span>
        {ubicaciones.length - conSenal > 0 && <span className="badge warning">{ubicaciones.length - conSenal} sin señal reciente</span>}
        {enRutaConMapa > 0 && <span className="badge info">🧭 {enRutaConMapa} en ruta</span>}
        {gruposProv.length > 0 && <span className="badge">🏭 {gruposProv.length} proveedor{gruposProv.length === 1 ? '' : 'es'} por buscar</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {puedeMarcar && (
            <button type="button" className={`btn btn-sm ${modoPinos ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setModoPinos((v) => !v); setPinosPendiente(null); }}>
              {modoPinos ? '✕ Cancelar marcado' : losPinos ? '📍 Mover Almacén Los Pinos' : '📍 Marcar Almacén Los Pinos'}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={verATodos}>🎯 Ver a todos</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => mapa.current?.setView(PUERTO_ORDAZ, ZOOM_INICIAL)}>📍 Puerto Ordaz</button>
        </span>
      </div>
      {error && <div className="aviso warning" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">⚠</span><div>{error}</div></div>}
      {modoPinos && (
        <div className="aviso info sm" style={{ marginBottom: '.6rem' }}>
          <span className="aviso-icono">📍</span><div>Haz clic en el mapa donde queda el {ALMACEN_RETIRO} (usa «Satelital» para ubicarlo mejor).</div>
        </div>
      )}
      {!losPinos && !modoPinos && (
        <div className="aviso warning sm" style={{ marginBottom: '.6rem' }}>
          <span className="aviso-icono">🏬</span>
          <div>El {ALMACEN_RETIRO} todavía no está marcado en el mapa: sin él, las rutas terminan en el proveedor.{puedeMarcar ? ' Usa «📍 Marcar Almacén Los Pinos».' : ''}</div>
        </div>
      )}
      {/* isolation: los paneles de Leaflet (z-index 400–1000) no se montan sobre las ventanas del sistema. */}
      <div ref={contenedor} style={{ height: 'min(70vh, 560px)', minHeight: 320, borderRadius: 10, overflow: 'hidden', isolation: 'isolate', position: 'relative' }} />
      <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem 1.1rem', margin: '.55rem 0 0', fontSize: '.8rem' }} aria-label="Leyenda">
        <span><span style={{ color: '#ff8a00' }}>●</span> 🛵 Motorizado (borde de su color)</span>
        <span><span style={{ color: '#9ca3af' }}>●</span> Sin señal reciente</span>
        <span><span style={{ color: '#ea580c' }}>●</span> 🏭 Proveedor con OC por tomar (<span style={{ color: '#dc2626' }}>rojo</span> = urgente)</span>
        <span><span style={{ color: '#7c3aed' }}>●</span> 🏬 {ALMACEN_RETIRO}</span>
        <span>┄ Ruta prevista</span>
        <span>━ Recorrido hecho</span>
      </div>
      <p className="hint muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
        Cada motorizado comparte su ubicación desde la vista de teléfono. En gris, los que no mandan señal hace más de {Math.round(UBICACION_VIEJA_MS / 60000)} minutos.
        {!ubicaciones.length && !error && ' Todavía no hay ubicaciones compartidas.'}
        {sinUbicacion > 0 && ` ${sinUbicacion} proveedor${sinUbicacion === 1 ? '' : 'es'} con OC por tomar no está${sinUbicacion === 1 ? '' : 'n'} en el mapa: márcalo${sinUbicacion === 1 ? '' : 's'} en Proveedores › ficha › «Ubicación en el mapa».`}
      </p>

      {pinosPendiente && (
        <ConfirmDialog
          title={losPinos ? `Mover ${ALMACEN_RETIRO}` : `Marcar ${ALMACEN_RETIRO}`}
          message={`¿Guardar este punto (${pinosPendiente.lat.toFixed(5)}, ${pinosPendiente.lng.toFixed(5)}) como el ${ALMACEN_RETIRO}? Las rutas de Delivery terminan ahí.`}
          confirmText="Guardar"
          onConfirm={() => void guardarPinos()}
          onCancel={() => setPinosPendiente(null)}
        />
      )}
    </div>
  );
}
