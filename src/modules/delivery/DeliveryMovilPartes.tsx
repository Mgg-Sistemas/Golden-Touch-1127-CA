/* ============================================================
   Golden Touch · Delivery · Piezas de la vista de teléfono (30/10/2026)

   · Listo: el aviso ya guardado con su WhatsApp y el botón para seguir.
   · ElegirFotos: hasta 4 fotos con vista previa y ✕ para quitar.
   · FotosPedido: las fotos ya subidas (URL firmada, se abren en otra pestaña).
   · ComprobantePago: «💰 Pagado el … · método» y «🧾 Ver comprobante de pago»
     (los archivos que Tesorería subió al pagar la OC, bucket de las OC).
   · useUbicacionDelivery: «Compartir mi ubicación» con watchPosition; manda
     la posición a la base como mucho cada 30 s, o antes si se movió > 50 m.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { Modal } from '@/shared/ui/Modal';
import { relTime } from '@/shared/lib/format';
import { MAX_FOTOS_DELIVERY, type FotoDelivery } from './delivery.types';
import { textoPagado, type PedidoDeliveryCompleto } from './delivery';
import { actualizarUbicacion, urlComprobantePago, urlFotoDelivery, type AdjuntoPago } from './delivery.repository';

export const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

/** Aviso ya guardado: el texto para WhatsApp y el botón para seguir. */
export function Listo({ titulo, texto, onListo }: { titulo: string; texto: string; onListo: () => void }) {
  return (
    <div className="surt-form">
      <div className="surt-form-titulo"><span className="icono" aria-hidden>✅</span><strong>{titulo}</strong></div>
      <CompartirWhatsapp texto={texto} />
      <button type="button" className="btn btn-primary surt-guardar" onClick={onListo}>Listo</button>
    </div>
  );
}

const esImagen = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);

/** Selector de fotos (cámara o galería), con tope y vista previa. */
export function ElegirFotos({ id, rotulo, fotos, onChange, max = MAX_FOTOS_DELIVERY, disabled }: {
  id: string; rotulo: string; fotos: File[]; onChange: (fotos: File[]) => void; max?: number; disabled?: boolean;
}) {
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => { previas.forEach((u) => URL.revokeObjectURL(u)); }, [previas]);

  function agregar(lista: FileList | null) {
    const nuevas = Array.from(lista ?? []);
    const buenas = nuevas.filter(esImagen);
    if (buenas.length < nuevas.length) toast('Solo se aceptan fotos (jpg, png, webp, heic).', 'warning');
    if (fotos.length + buenas.length > max) toast(`Máximo ${max} fotos: se tomaron las primeras.`, 'warning');
    onChange([...fotos, ...buenas].slice(0, max));
  }

  return (
    <div className="surt-campo">
      <label htmlFor={id}>{rotulo} ({fotos.length}/{max}) · opcional</label>
      {fotos.length < max && (
        <input id={id} className="input surt-input" type="file" accept="image/*" multiple disabled={disabled}
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      )}
      {max <= 0 && <small className="muted">Este pedido ya tiene las {MAX_FOTOS_DELIVERY} fotos de este momento.</small>}
      {!!fotos.length && (
        <div className="rep-fotos">
          {fotos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="rep-foto surt-foto-quitar">
              <img src={previas[i]} alt={f.name} />
              <button type="button" aria-label={`Quitar ${f.name}`} disabled={disabled}
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Las fotos ya cargadas de un pedido (miniaturas con URL firmada). */
export function FotosPedido({ titulo, fotos }: { titulo: string; fotos: FotoDelivery[] | null | undefined }) {
  const lista = useMemo(() => fotos ?? [], [fotos]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void Promise.all(lista.map(async (f) => [f.path, await Promise.resolve(urlFotoDelivery(f.path)).catch(() => '')] as const))
      .then((xs) => { if (vivo) setUrls(Object.fromEntries(xs)); });
    return () => { vivo = false; };
  }, [lista]);
  if (!lista.length) return null;
  return (
    <div>
      <div className="sub">{titulo} ({lista.length})</div>
      <div className="rep-fotos">
        {lista.map((f) => (
          <a key={f.path} className="rep-foto" href={urls[f.path] || undefined} target="_blank" rel="noopener noreferrer"
            aria-label={`Ver foto ${f.nombre}`}>
            {urls[f.path] ? <img src={urls[f.path]} alt={f.nombre} /> : <span className="rep-foto-doc">📷</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Comprobante de pago ─────────────── */

const esImagenPath = (path: string, nombre?: string) => /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(nombre || path);

/**
 * «💰 Pagado el … · método» y «🧾 Ver comprobante de pago»: para que el
 * motorizado compruebe que Tesorería de verdad pagó antes de ir al proveedor.
 * Las imágenes se ven en una ventana; los PDF se abren en otra pestaña.
 */
export function ComprobantePago({ p }: { p: PedidoDeliveryCompleto }) {
  const comprobantes = (p.comprobantesPago ?? []).filter((c) => c?.path);
  const pagado = p.orden ? textoPagado(p.orden) : '';
  const pagadaEn = p.orden?.pagada_en ?? null;
  const [abierto, setAbierto] = useState(false);
  const [imagen, setImagen] = useState<{ url: string; titulo: string } | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);

  async function ver(c: AdjuntoPago) {
    const img = esImagenPath(c.path, c.nombre);
    // La pestaña se abre ya (con el toque), si no el teléfono la bloquea al esperar la URL.
    const pestana = img ? null : window.open('', '_blank');
    setCargando(c.path);
    try {
      const url = await urlComprobantePago(c.path);
      if (img) setImagen({ url, titulo: `${c.etiqueta} · ${p.codigo}` });
      else if (pestana) pestana.location.href = url;
      else window.location.href = url;
    } catch (e) {
      pestana?.close();
      toast(errMsg(e, 'No se pudo abrir el comprobante'), 'error');
    } finally { setCargando(null); }
  }

  return (
    <div className="dlv-pago">
      <div className="sub">
        💰 {pagado || 'Pagado'}{pagadaEn ? ` (${relTime(pagadaEn)})` : ''}
      </div>
      {!comprobantes.length ? (
        <div className="dlv-sin-comprobante">⚠ Tesorería no adjuntó comprobante</div>
      ) : comprobantes.length === 1 ? (
        <button type="button" className="btn btn-ghost dlv-btn-pago" disabled={!!cargando} onClick={() => void ver(comprobantes[0])}>
          {cargando ? 'Abriendo…' : '🧾 Ver comprobante de pago'}
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-ghost dlv-btn-pago" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            🧾 Ver comprobante de pago ({comprobantes.length})
          </button>
          {abierto && comprobantes.map((c) => (
            <button key={c.path} type="button" className="btn btn-ghost dlv-btn-pago" disabled={!!cargando} onClick={() => void ver(c)}>
              {cargando === c.path ? 'Abriendo…' : `📎 ${c.etiqueta}`}
            </button>
          ))}
        </>
      )}
      {imagen && (
        <Modal title={imagen.titulo} onClose={() => setImagen(null)} minimizable={false}
          footer={<a className="btn btn-ghost" href={imagen.url} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>}>
          <img src={imagen.url} alt={imagen.titulo} style={{ width: '100%', height: 'auto', borderRadius: 'var(--r-md)' }} />
        </Modal>
      )}
    </div>
  );
}

/* ─────────────── GPS ─────────────── */

export type EstadoGps = 'apagado' | 'pidiendo' | 'compartiendo' | 'pausado' | 'sin_permiso' | 'error' | 'no_soportado';

export interface PosicionGps { lat: number; lng: number; precision: number | null; at: number }

/** Como mucho un envío cada 30 s… */
const INTERVALO_MS = 30_000;
/** …salvo que se haya movido más de 50 m… */
const DISTANCIA_M = 50;
/** …y aun así nunca más de uno cada 10 s (en la moto, a 40 km/h, serían 50 m cada 4 s). */
const MINIMO_MS = 10_000;

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ¿Toca mandar esta posición a la base? */
export function tocaEnviar(prev: PosicionGps | null, p: PosicionGps): boolean {
  if (!prev) return true;
  const pasaron = p.at - prev.at;
  if (pasaron < MINIMO_MS) return false;
  return pasaron >= INTERVALO_MS || distanciaM(prev, p) > DISTANCIA_M;
}

const hayGeo = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

/**
 * Compartir la ubicación del motorizado. El watch vive mientras la pantalla
 * esté abierta (se limpia al salir). `pedidoEnRutaId` viaja con cada envío
 * para que la PC sepa qué pedido lleva.
 */
export function useUbicacionDelivery(pedidoEnRutaId: string | null) {
  const [estado, setEstado] = useState<EstadoGps>(() => (hayGeo() ? 'apagado' : 'no_soportado'));
  const [ultima, setUltima] = useState<PosicionGps | null>(null);
  const [enviada, setEnviada] = useState<PosicionGps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const ultimaRef = useRef<PosicionGps | null>(null);
  const enviadaRef = useRef<PosicionGps | null>(null);
  const enviandoRef = useRef(false);
  const pedidoRef = useRef<string | null>(pedidoEnRutaId);

  const enviar = useCallback(async (p: PosicionGps, forzar = false) => {
    if (enviandoRef.current) return;
    if (!forzar && !tocaEnviar(enviadaRef.current, p)) return;
    enviandoRef.current = true;
    try {
      await actualizarUbicacion(p.lat, p.lng, p.precision, pedidoRef.current ?? undefined);
      enviadaRef.current = p;
      setEnviada(p);
      setError(null);
    } catch (e) {
      setError(`No se pudo enviar la ubicación: ${errMsg(e, 'error de conexión')}`);
    } finally {
      enviandoRef.current = false;
    }
  }, []);

  // Si cambia el pedido en ruta mientras comparte, se avisa de una vez a la PC.
  useEffect(() => {
    const cambio = pedidoRef.current !== pedidoEnRutaId;
    pedidoRef.current = pedidoEnRutaId;
    if (cambio && watchRef.current != null && ultimaRef.current) {
      void enviar({ ...ultimaRef.current, at: Date.now() }, true);
    }
  }, [pedidoEnRutaId, enviar]);

  const limpiar = useCallback(() => {
    if (watchRef.current != null && hayGeo()) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);

  const detener = useCallback(() => { limpiar(); setEstado('pausado'); }, [limpiar]);

  const iniciar = useCallback(() => {
    if (!hayGeo()) { setEstado('no_soportado'); return; }
    if (watchRef.current != null) return;
    setEstado('pidiendo');
    setError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p: PosicionGps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          at: Date.now(),
        };
        ultimaRef.current = p;
        setUltima(p);
        setEstado('compartiendo');
        void enviar(p);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          limpiar();
          setEstado('sin_permiso');
          setError('El teléfono no dio permiso de ubicación. Actívalo en los ajustes del navegador (candado ▸ Ubicación ▸ Permitir) y vuelve a tocar el botón.');
          return;
        }
        // Sin señal o tardó: el watch sigue vivo y se recupera solo cuando vuelva el GPS.
        setEstado('error');
        setError(err.code === err.TIMEOUT
          ? 'El GPS está tardando en responder. Sal a cielo abierto; se sigue intentando.'
          : 'No se pudo leer el GPS. Revisa que la ubicación del teléfono esté encendida; se sigue intentando.');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  }, [enviar, limpiar]);

  // Al salir de la pantalla se deja de vigilar el GPS.
  useEffect(() => limpiar, [limpiar]);

  return { estado, ultima, enviada, error, iniciar, detener, activo: estado === 'compartiendo' || estado === 'pidiendo' || estado === 'error' };
}

export type GpsDelivery = ReturnType<typeof useUbicacionDelivery>;
