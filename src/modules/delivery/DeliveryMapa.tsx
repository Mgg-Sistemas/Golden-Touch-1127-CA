/* ============================================================
   Golden Touch · Delivery · Mapa de motorizados (PC) (30/10/2026)

   Leaflet puro (sin react-leaflet): un mapa centrado en Puerto Ordaz con
   un marcador por motorizado (su última posición de `delivery_ubicaciones`).
   Conmutador Calles (OpenStreetMap) / Satélite (Esri World Imagery).

   - El marcador es un `L.divIcon` con 🛵 y el nombre: los PNG de marcador
     de Leaflet no resuelven con Vite y así no hace falta copiarlos.
   - Gris si la posición tiene más de 15 min (el teléfono dejó de mandar).
   - La lista de la derecha centra el mapa en el motorizado al tocarlo.
   - Este archivo se carga con `lazy()` SOLO al abrir la pestaña Mapa, así
     Leaflet (≈150 kB) no engorda el resto del sistema.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { relTime } from '@/shared/lib/format';
import { PUERTO_ORDAZ, type PedidoDeliveryVista, type UbicacionDelivery } from './delivery.types';

/** Minutos sin actualizar a partir de los cuales la posición se ve gris. */
export const MINUTOS_UBICACION_VIEJA = 15;

type Capa = 'calles' | 'satelite';

const CAPAS: Record<Capa, { url: string; attribution: string; maxZoom: number }> = {
  calles: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
};

const escaparHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function esVieja(u: UbicacionDelivery, ahora: number): boolean {
  return ahora - new Date(u.updated_at).getTime() > MINUTOS_UBICACION_VIEJA * 60_000;
}

function nombreDe(u: UbicacionDelivery): string {
  return u.repartidor_nombre?.trim() || u.repartidor_email.split('@')[0];
}

export function DeliveryMapa({ ubicaciones, pedidos }: { ubicaciones: UbicacionDelivery[]; pedidos: PedidoDeliveryVista[] }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaTiles = useRef<L.TileLayer | null>(null);
  const grupo = useRef<L.LayerGroup | null>(null);
  const marcadores = useRef(new Map<string, L.Marker>());
  const [capa, setCapa] = useState<Capa>('calles');
  // Reloj de 1 min: el «hace X min» y el gris se actualizan aunque no llegue nada nuevo.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const pedidoPorId = useMemo(() => new Map(pedidos.map((p) => [p.id, p])), [pedidos]);
  const lista = useMemo(
    () => [...ubicaciones].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [ubicaciones],
  );

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: true })
      .setView([PUERTO_ORDAZ.lat, PUERTO_ORDAZ.lng], PUERTO_ORDAZ.zoom);
    grupo.current = L.layerGroup().addTo(m);
    mapa.current = m;
    // El contenedor puede medirse tarde (pestaña recién abierta): recalcular el tamaño.
    const t = window.setTimeout(() => m.invalidateSize(), 120);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize()) : null;
    ro?.observe(contenedor.current);
    const marcas = marcadores.current;
    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
      m.remove();
      mapa.current = null;
      grupo.current = null;
      capaTiles.current = null;
      marcas.clear();
    };
  }, []);

  // Capa de fondo: calles o satélite.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    capaTiles.current?.remove();
    const c = CAPAS[capa];
    capaTiles.current = L.tileLayer(c.url, { attribution: c.attribution, maxZoom: c.maxZoom }).addTo(m);
  }, [capa]);

  // Marcadores: uno por motorizado; se actualizan en su sitio con cada cambio (realtime).
  useEffect(() => {
    const g = grupo.current;
    if (!g) return;
    const vistos = new Set<string>();
    for (const u of ubicaciones) {
      vistos.add(u.repartidor_email);
      const vieja = esVieja(u, ahora);
      const pedido = u.pedido_id ? pedidoPorId.get(u.pedido_id) : undefined;
      const nombre = escaparHtml(nombreDe(u));
      const icono = L.divIcon({
        className: 'dlv-marcador-wrap',
        html: `<div class="dlv-marcador${vieja ? ' vieja' : ''}${pedido ? ' con-pedido' : ''}"><span class="dlv-moto" aria-hidden="true">🛵</span><span class="dlv-nombre">${nombre}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [18, 18],
      });
      const popup = [
        `<strong>${nombre}</strong>`,
        `Actualizado ${escaparHtml(relTime(u.updated_at))}${vieja ? ' (sin señal reciente)' : ''}`,
        pedido ? `En curso: ${escaparHtml(pedido.codigo)}${pedido.orden.oc_codigo ? ` · ${escaparHtml(pedido.orden.oc_codigo)}` : ''}` : 'Sin pedido en curso',
        u.precision_m != null ? `Precisión ± ${Math.round(u.precision_m)} m` : '',
      ].filter(Boolean).join('<br>');
      const existente = marcadores.current.get(u.repartidor_email);
      if (existente) {
        existente.setLatLng([u.lat, u.lng]).setIcon(icono);
        existente.setPopupContent(popup);
      } else {
        const mk = L.marker([u.lat, u.lng], { icon: icono, title: nombreDe(u), keyboard: true }).bindPopup(popup);
        mk.addTo(g);
        marcadores.current.set(u.repartidor_email, mk);
      }
    }
    for (const [email, mk] of marcadores.current) {
      if (!vistos.has(email)) { mk.remove(); marcadores.current.delete(email); }
    }
  }, [ubicaciones, pedidoPorId, ahora]);

  function centrar(u: UbicacionDelivery) {
    const m = mapa.current;
    if (!m) return;
    m.setView([u.lat, u.lng], Math.max(m.getZoom(), 16));
    marcadores.current.get(u.repartidor_email)?.openPopup();
  }

  function verTodos() {
    const m = mapa.current;
    if (!m) return;
    if (!ubicaciones.length) { m.setView([PUERTO_ORDAZ.lat, PUERTO_ORDAZ.lng], PUERTO_ORDAZ.zoom); return; }
    m.fitBounds(L.latLngBounds(ubicaciones.map((u) => [u.lat, u.lng] as [number, number])), { padding: [40, 40], maxZoom: 16 });
  }

  return (
    <div className="dlv-mapa-layout">
      <div className="dlv-mapa-caja">
        <div className="dlv-mapa-barra">
          <div className="dlv-seg" role="radiogroup" aria-label="Fondo del mapa">
            {(['calles', 'satelite'] as Capa[]).map((c) => (
              <button key={c} type="button" role="radio" className="dlv-seg-btn" aria-checked={capa === c}
                onClick={() => setCapa(c)}>
                {c === 'calles' ? '🗺 Calles' : '🛰 Satélite'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={verTodos}>🎯 Ver a todos</button>
        </div>
        <div ref={contenedor} className="dlv-mapa" role="application" aria-label="Mapa de Puerto Ordaz con la ubicación de los motorizados" />
      </div>

      <aside className="card dlv-mapa-lista" aria-label="Motorizados">
        <h3>🛵 Motorizados ({lista.length})</h3>
        {lista.length === 0 && (
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Ningún motorizado ha compartido su ubicación todavía. Aparecen aquí cuando abren la vista de teléfono de Delivery con la ubicación permitida.
          </p>
        )}
        <ul>
          {lista.map((u) => {
            const vieja = esVieja(u, ahora);
            const pedido = u.pedido_id ? pedidoPorId.get(u.pedido_id) : undefined;
            return (
              <li key={u.repartidor_email}>
                <button type="button" className={`dlv-moto-item${vieja ? ' vieja' : ''}`} onClick={() => centrar(u)}
                  aria-label={`Centrar el mapa en ${nombreDe(u)}`}>
                  <span className={`dlv-punto${vieja ? ' vieja' : ''}`} aria-hidden="true" />
                  <span className="dlv-moto-datos">
                    <strong>{nombreDe(u)}</strong>
                    <span className="muted">{relTime(u.updated_at)}{vieja ? ' · sin señal reciente' : ''}</span>
                    {pedido
                      ? <span className="badge info" style={{ justifySelf: 'start' }}>{pedido.codigo}{pedido.orden.oc_codigo ? ` · ${pedido.orden.oc_codigo}` : ''}</span>
                      : <span className="muted" style={{ fontSize: '.75rem' }}>Sin pedido en curso</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="muted" style={{ fontSize: '.75rem', marginTop: '.6rem' }}>
          Gris = sin actualizar hace más de {MINUTOS_UBICACION_VIEJA} min.
        </p>
      </aside>
    </div>
  );
}

export default DeliveryMapa;
