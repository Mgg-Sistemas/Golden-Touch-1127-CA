/* ============================================================
   Golden Touch · Proveedores · selector de ubicación en el mapa (03/11/2026)

   En la ficha del proveedor (PC): un mapa (Leaflet, calles de OpenStreetMap)
   para marcar dónde queda el local. Se marca con un clic o arrastrando el
   pin, buscando la dirección (Nominatim de OSM, sin clave), pegando
   coordenadas / un enlace de Google Maps, o con «usar mi ubicación». Delivery
   usa el punto para la ruta del motorizado y el «proveedor más cercano».
   El mapa se crea una sola vez; el pin se mueve, no se recrea.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EMPRESA_EMAIL } from '@/shared/lib/empresa';
import { toast } from '@/shared/ui/Toast';
import { buscarDireccion, coordsTxt, parsearCoordenadas, puntoValido, type PuntoMapa, type ResultadoGeo } from './ubicacionProveedor';

/** Centro de Puerto Ordaz (el mismo que usa Delivery). */
const CENTRO: [number, number] = [8.2869, -62.7467];

const PIN = L.divIcon({
  html: '<div style="font-size:30px;line-height:1;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))">📍</div>',
  className: 'prov-pin', iconSize: [0, 0], iconAnchor: [0, 0],
});

export function SelectorUbicacionMapa({ value, onChange, direccion }: {
  value: PuntoMapa | null;
  onChange: (p: PuntoMapa | null) => void;
  /** La dirección escrita en la ficha: se ofrece como texto a buscar. */
  direccion?: string | null;
}) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const cambiar = useRef(onChange);
  useEffect(() => { cambiar.current = onChange; }, [onChange]);

  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoGeo[]>([]);
  const [gpsOcupado, setGpsOcupado] = useState(false);

  // El mapa se crea una sola vez (el modal puede abrirse con el contenedor aún sin tamaño: invalidateSize).
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { center: value ? [value.lat, value.lng] : CENTRO, zoom: value ? 16 : 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cambiar.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapa.current = m;
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      pin.current = null;
    };
    // Solo al montar: el valor inicial centra; después manda el efecto del pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El pin sigue al valor (se arrastra para afinar).
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!value) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    const ll = L.latLng(value.lat, value.lng);
    if (!pin.current) {
      pin.current = L.marker(ll, { icon: PIN, draggable: true, title: 'Arrastra para afinar' })
        .on('dragend', (e) => { const p = (e.target as L.Marker).getLatLng(); cambiar.current({ lat: p.lat, lng: p.lng }); })
        .addTo(m);
    } else {
      pin.current.setLatLng(ll);
    }
    if (!m.getBounds().contains(ll)) m.setView(ll, Math.max(m.getZoom(), 15));
  }, [value]);

  async function buscar() {
    const texto = q.trim() || (direccion ?? '').trim();
    if (!texto) { toast('Escribe la dirección o pega las coordenadas.', 'error'); return; }
    const coords = parsearCoordenadas(texto);
    if (coords) { elegir({ nombre: coordsTxt(coords), ...coords }); return; }
    setBuscando(true);
    try {
      const r = await buscarDireccion(texto, EMPRESA_EMAIL);
      setResultados(r);
      if (!r.length) toast('No se encontró esa dirección. Prueba con menos palabras (sector y ciudad) o marca el punto en el mapa.', 'error');
      else if (r.length === 1) elegir(r[0]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo buscar la dirección.', 'error');
    } finally { setBuscando(false); }
  }

  function elegir(r: ResultadoGeo) {
    setResultados([]);
    cambiar.current({ lat: r.lat, lng: r.lng });
    mapa.current?.setView([r.lat, r.lng], 16);
  }

  function usarMiUbicacion() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { toast('Este navegador no permite leer la ubicación.', 'error'); return; }
    setGpsOcupado(true);
    navigator.geolocation.getCurrentPosition((g) => {
      setGpsOcupado(false);
      const p = puntoValido(g.coords.latitude, g.coords.longitude);
      if (!p) { toast('No se pudo leer la ubicación.', 'error'); return; }
      cambiar.current(p);
      mapa.current?.setView([p.lat, p.lng], 16);
      if (g.coords.accuracy > 100) toast(`Ubicación con poca precisión (± ${Math.round(g.coords.accuracy)} m): afina el pin en el mapa.`, 'info');
    }, (e) => {
      setGpsOcupado(false);
      toast(e.code === 1 ? 'El navegador no dio permiso de ubicación.' : 'No se pudo leer la ubicación de este equipo.', 'error');
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
  }

  return (
    <div style={{ display: 'grid', gap: '.5rem' }}>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: '1 1 240px' }} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={direccion?.trim() ? `Buscar: ${direccion.trim()}` : 'Dirección, sector y ciudad · o coordenadas / enlace de Google Maps'}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }} aria-label="Buscar dirección" />
        <button type="button" className="btn btn-ghost" onClick={() => void buscar()} disabled={buscando}>{buscando ? 'Buscando…' : '🔍 Buscar'}</button>
        <button type="button" className="btn btn-ghost" onClick={usarMiUbicacion} disabled={gpsOcupado} title="Si estás en el local del proveedor">
          {gpsOcupado ? 'Leyendo GPS…' : '📡 Usar mi ubicación'}
        </button>
      </div>
      {resultados.length > 1 && (
        <div style={{ display: 'grid', gap: '.25rem' }}>
          {resultados.map((r) => (
            <button key={`${r.lat},${r.lng}`} type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal' }} onClick={() => elegir(r)}>
              📍 {r.nombre}
            </button>
          ))}
        </div>
      )}
      {/* isolation: los paneles de Leaflet (z-index 400–1000) no se montan sobre el modal. */}
      <div ref={contenedor} style={{ height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', isolation: 'isolate', position: 'relative', background: 'var(--surface-3)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', fontSize: '.82rem' }}>
        {value ? (
          <>
            <span className="mono">📍 {coordsTxt(value)}</span>
            <a href={`https://www.google.com/maps/search/?api=1&query=${value.lat.toFixed(6)},${value.lng.toFixed(6)}`} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar.current(null)} style={{ color: 'var(--danger)' }}>✕ Quitar</button>
          </>
        ) : (
          <span className="muted">Sin ubicación. Haz clic en el mapa, busca la dirección o usa tu ubicación. Delivery la usa para la ruta y el «proveedor más cercano».</span>
        )}
      </div>
    </div>
  );
}
