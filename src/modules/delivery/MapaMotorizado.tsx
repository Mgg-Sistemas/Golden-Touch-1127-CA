/* ============================================================
   Golden Touch · Delivery · mapa del teléfono del motorizado (03/11/2026)

   Arriba de la lista: dónde estoy (punto azul con su precisión), los
   proveedores con OC por tomar (🏭, el más cercano resaltado), el Almacén
   Los Pinos (🏬) y la ruta elegida (OSRM; si falla, línea recta punteada).
   Leaflet a secas: el mapa se crea UNA vez y cada capa se actualiza sola
   (el punto propio se mueve con setLatLng, sin recrear nada).
   ============================================================ */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PUERTO_ORDAZ } from './delivery';
import { escaparHtml } from './deliveryPanel';
import { distanciaTxt, type ParadaRuta, type PuntoMapa, type RutaCalculada } from './deliveryRutas';
import type { PosicionGps } from './usePosicionGps';

export interface DestinoMapa {
  clave: string;
  nombre: string;
  punto: PuntoMapa;
  metros: number | null;
  cercano: boolean;
}

function chip(html: string, fondo: string, borde = '#fff'): L.DivIcon {
  const h = `<div style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px 2px 4px;border-radius:999px;background:${fondo};`
    + `color:#fff;font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35);`
    + `border:2px solid ${borde};transform:translate(-50%,-50%)">${html}</div>`;
  return L.divIcon({ html: h, className: 'dlv-marcador', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12] });
}

const corto = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function MapaMotorizado({ yo, destinos, losPinos, ruta, onElegir }: {
  yo: PosicionGps | null;
  destinos: DestinoMapa[];
  losPinos: PuntoMapa | null;
  ruta: { ruta: RutaCalculada | null; paradas: ParadaRuta[] } | null;
  onElegir?: (clave: string) => void;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaDestinos = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);
  const yoMarca = useRef<L.CircleMarker | null>(null);
  const yoCirculo = useRef<L.Circle | null>(null);
  const centrado = useRef(false);
  const elegir = useRef(onElegir);
  useEffect(() => { elegir.current = onElegir; }, [onElegir]);

  // El mapa se crea una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { center: PUERTO_ORDAZ, zoom: 13, zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    capaRuta.current = L.layerGroup().addTo(m);
    capaDestinos.current = L.layerGroup().addTo(m);
    mapa.current = m;
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null; capaDestinos.current = null; capaRuta.current = null; yoMarca.current = null; yoCirculo.current = null;
    };
  }, []);

  // Mi punto: se mueve, no se recrea.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !yo) return;
    const ll = L.latLng(yo.lat, yo.lng);
    const radio = Math.min(Math.max(yo.precision ?? 0, 5), 2000);
    if (!yoMarca.current) {
      yoCirculo.current = L.circle(ll, { radius: radio, color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12, interactive: false }).addTo(m);
      yoMarca.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
        .bindTooltip('Tú estás aquí', { direction: 'top', offset: [0, -8] }).addTo(m);
    } else {
      yoMarca.current.setLatLng(ll);
      yoCirculo.current?.setLatLng(ll).setRadius(radio);
    }
    if (!centrado.current && !ruta?.ruta) {
      centrado.current = true;
      m.setView(ll, 14);
    }
  }, [yo, ruta]);

  // Proveedores por tomar y Los Pinos (se repintan solo si cambia la lista).
  const claveDestinos = destinos.map((d) => `${d.clave}:${d.punto.lat},${d.punto.lng}:${d.cercano ? 1 : 0}:${Math.round((d.metros ?? -1) / 50)}`).join('|')
    + `|pinos:${losPinos ? `${losPinos.lat},${losPinos.lng}` : '-'}`;
  const destinosRef = useRef(destinos);
  useEffect(() => { destinosRef.current = destinos; });
  useEffect(() => {
    const g = capaDestinos.current;
    if (!g) return;
    g.clearLayers();
    for (const d of destinosRef.current) {
      const txt = `🏭 ${escaparHtml(corto(d.nombre))}${d.metros != null ? ` · ${escaparHtml(distanciaTxt(d.metros))}` : ''}`;
      L.marker([d.punto.lat, d.punto.lng], { icon: chip(txt, d.cercano ? '#16a34a' : '#ea580c', d.cercano ? '#bbf7d0' : '#fff'), zIndexOffset: d.cercano ? 800 : 0 })
        .on('click', () => elegir.current?.(d.clave))
        .addTo(g);
    }
    if (losPinos) {
      L.marker([losPinos.lat, losPinos.lng], { icon: chip('🏬 Almacén Los Pinos', '#7c3aed'), zIndexOffset: 500 }).addTo(g);
    }
  }, [claveDestinos, losPinos]);

  // La ruta elegida.
  useEffect(() => {
    const g = capaRuta.current;
    const m = mapa.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!ruta?.ruta || ruta.ruta.linea.length < 2) return;
    const recta = ruta.ruta.fuente === 'recta';
    const linea = L.polyline(ruta.ruta.linea, {
      color: '#2563eb', weight: recta ? 4 : 6, opacity: 0.85, dashArray: recta ? '8 8' : undefined, interactive: false,
    }).addTo(g);
    ruta.paradas.forEach((p, i) => {
      if (p.tipo === 'yo') return;
      L.marker([p.punto.lat, p.punto.lng], {
        icon: chip(`${i}. ${p.tipo === 'entrega' ? '🏬' : '📦'} ${escaparHtml(corto(p.nombre))}`, '#1d4ed8'), zIndexOffset: 900,
      }).addTo(g);
    });
    m.fitBounds(linea.getBounds(), { padding: [36, 36], maxZoom: 16 });
  }, [ruta]);

  function centrarEnMi() {
    if (mapa.current && yo) mapa.current.setView([yo.lat, yo.lng], Math.max(mapa.current.getZoom(), 15));
  }
  function verTodo() {
    const m = mapa.current;
    if (!m) return;
    const pts: L.LatLngExpression[] = destinos.map((d) => [d.punto.lat, d.punto.lng]);
    if (yo) pts.push([yo.lat, yo.lng]);
    if (losPinos) pts.push([losPinos.lat, losPinos.lng]);
    if (ruta?.ruta) pts.push(...ruta.ruta.linea);
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
  }

  return (
    <div className="dlv-mapa">
      {/* isolation: los paneles de Leaflet (z-index 400–1000) no se montan sobre las ventanas. */}
      <div ref={contenedor} className="dlv-mapa-lienzo" />
      <div className="dlv-mapa-botones">
        <button type="button" className="btn btn-ghost btn-sm" onClick={centrarEnMi} disabled={!yo}>🎯 Yo</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={verTodo}>🗺 Ver todo</button>
      </div>
    </div>
  );
}
