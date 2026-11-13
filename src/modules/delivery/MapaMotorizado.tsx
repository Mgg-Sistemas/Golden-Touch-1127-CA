/* ============================================================
   Golden Touch · Delivery · Mapa Inmersivo Estilo Ridery / Yummy
   Lienzo nocturno a sangre total con CartoDB Dark Matter,
   posicionamiento en vivo del conductor y trazado de rutas.
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

function iconoConductor(icono = '🛵'): L.DivIcon {
  const html = `
    <div class="dlv-yo-wrap">
      <div class="dlv-yo-radar"></div>
      <div class="dlv-yo-pin">${icono}</div>
    </div>
  `;
  return L.divIcon({ html, className: 'dlv-yo-divicon', iconSize: [44, 44], iconAnchor: [22, 22] });
}

function chipDestino(html: string, fondo: string, borde: string): L.DivIcon {
  const h = `<div class="dlv-map-chip" style="background:${fondo};border-color:${borde};">${html}</div>`;
  return L.divIcon({ html: h, className: 'dlv-chip-wrap', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -16] });
}

const corto = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function MapaMotorizado({
  yo,
  destinos,
  losPinos,
  ruta,
  iconoVehiculo = '🛵',
  onElegir,
}: {
  yo: PosicionGps | null;
  destinos: DestinoMapa[];
  losPinos: PuntoMapa | null;
  ruta: { ruta: RutaCalculada | null; paradas: ParadaRuta[] } | null;
  iconoVehiculo?: string;
  onElegir?: (clave: string) => void;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaDestinos = useRef<L.LayerGroup | null>(null);
  const capaRuta = useRef<L.LayerGroup | null>(null);
  const yoMarker = useRef<L.Marker | null>(null);
  const yoCirculo = useRef<L.Circle | null>(null);
  const centrado = useRef(false);
  const elegir = useRef(onElegir);
  useEffect(() => { elegir.current = onElegir; }, [onElegir]);

  // Inicializar mapa nocturno con CartoDB Dark Matter
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, {
      center: PUERTO_ORDAZ,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    // Tiles oscuras tipo Ridery/Uber
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; CARTO &copy; OpenStreetMap',
    }).addTo(m);

    capaRuta.current = L.layerGroup().addTo(m);
    capaDestinos.current = L.layerGroup().addTo(m);
    mapa.current = m;

    const t = setTimeout(() => m.invalidateSize(), 200);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      capaDestinos.current = null;
      capaRuta.current = null;
      yoMarker.current = null;
      yoCirculo.current = null;
    };
  }, []);

  // Posición del conductor en vivo (se mueve suavemente con setLatLng)
  useEffect(() => {
    const m = mapa.current;
    if (!m || !yo) return;
    const ll = L.latLng(yo.lat, yo.lng);
    const radio = Math.min(Math.max(yo.precision ?? 0, 10), 1000);

    if (!yoMarker.current) {
      yoCirculo.current = L.circle(ll, {
        radius: radio,
        color: '#0284c7',
        weight: 1,
        fillColor: '#38bdf8',
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(m);

      yoMarker.current = L.marker(ll, {
        icon: iconoConductor(iconoVehiculo),
        zIndexOffset: 1200,
      }).addTo(m);
    } else {
      yoMarker.current.setLatLng(ll);
      yoCirculo.current?.setLatLng(ll).setRadius(radio);
    }

    if (!centrado.current && !ruta?.ruta) {
      centrado.current = true;
      m.setView(ll, 15, { animate: true });
    }
  }, [yo, ruta, iconoVehiculo]);

  // Proveedores por tomar y almacén Los Pinos
  const claveDestinos = destinos.map((d) => `${d.clave}:${d.punto.lat},${d.punto.lng}:${d.cercano ? 1 : 0}:${Math.round((d.metros ?? -1) / 50)}`).join('|')
    + `|pinos:${losPinos ? `${losPinos.lat},${losPinos.lng}` : '-'}`;
  const destinosRef = useRef(destinos);
  useEffect(() => { destinosRef.current = destinos; });

  useEffect(() => {
    const g = capaDestinos.current;
    if (!g) return;
    g.clearLayers();

    for (const d of destinosRef.current) {
      const dist = d.metros != null ? ` · ${distanciaTxt(d.metros)}` : '';
      const txt = `<span class="dlv-chip-icon">🏭</span><strong>${escaparHtml(corto(d.nombre))}</strong><span class="dlv-chip-dist">${escaparHtml(dist)}</span>`;
      const fondo = d.cercano ? 'rgba(5, 150, 105, 0.95)' : 'rgba(30, 41, 59, 0.92)';
      const borde = d.cercano ? '#10b981' : '#f59e0b';

      L.marker([d.punto.lat, d.punto.lng], {
        icon: chipDestino(txt, fondo, borde),
        zIndexOffset: d.cercano ? 950 : 800,
      })
        .on('click', () => elegir.current?.(d.clave))
        .addTo(g);
    }

    if (losPinos) {
      const txtPinos = `<span class="dlv-chip-icon">🏬</span><strong>Almacén Los Pinos</strong>`;
      L.marker([losPinos.lat, losPinos.lng], {
        icon: chipDestino(txtPinos, 'rgba(109, 40, 217, 0.92)', '#8b5cf6'),
        zIndexOffset: 700,
      }).addTo(g);
    }
  }, [claveDestinos, losPinos]);

  // Trazado de ruta en vivo (estilo OSRM)
  useEffect(() => {
    const g = capaRuta.current;
    const m = mapa.current;
    if (!g || !m) return;
    g.clearLayers();
    if (!ruta?.ruta || ruta.ruta.linea.length < 2) return;

    const recta = ruta.ruta.fuente === 'recta';
    const linea = L.polyline(ruta.ruta.linea, {
      color: '#f59e0b',
      weight: recta ? 4 : 5,
      opacity: 0.92,
      dashArray: recta ? '8 8' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }).addTo(g);

    ruta.paradas.forEach((p, i) => {
      if (p.tipo === 'yo') return;
      const esEntrega = p.tipo === 'entrega';
      const icono = esEntrega ? '🏬' : '📦';
      const colorBorde = esEntrega ? '#10b981' : '#38bdf8';
      const colorFondo = esEntrega ? 'rgba(6, 78, 59, 0.95)' : 'rgba(15, 23, 42, 0.95)';
      const rotulo = `<span class="dlv-chip-step">${i}</span><span>${icono} ${escaparHtml(corto(p.nombre))}</span>`;

      L.marker([p.punto.lat, p.punto.lng], {
        icon: chipDestino(rotulo, colorFondo, colorBorde),
        zIndexOffset: 1000,
      }).addTo(g);
    });

    m.fitBounds(linea.getBounds(), { padding: [60, 60], maxZoom: 16 });
  }, [ruta]);

  const centrarEnMi = () => {
    if (mapa.current && yo) {
      mapa.current.setView([yo.lat, yo.lng], Math.max(mapa.current.getZoom(), 16), { animate: true });
    }
  };

  const verTodo = () => {
    const m = mapa.current;
    if (!m) return;
    const pts: L.LatLngExpression[] = destinos.map((d) => [d.punto.lat, d.punto.lng]);
    if (yo) pts.push([yo.lat, yo.lng]);
    if (losPinos) pts.push([losPinos.lat, losPinos.lng]);
    if (ruta?.ruta) pts.push(...ruta.ruta.linea);
    if (pts.length) {
      m.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16 });
    }
  };

  return (
    <div className="dlv-mapa-canvas-root">
      <div ref={contenedor} className="dlv-mapa-lienzo-full" />
      <div className="dlv-mapa-flotantes">
        <button
          type="button"
          className="dlv-btn-mapa-flotante"
          onClick={centrarEnMi}
          title="Recentrar en mi ubicación"
          disabled={!yo}
        >
          🎯
        </button>
        <button
          type="button"
          className="dlv-btn-mapa-flotante"
          onClick={verTodo}
          title="Ver ruta completa"
        >
          🗺
        </button>
      </div>
    </div>
  );
}
