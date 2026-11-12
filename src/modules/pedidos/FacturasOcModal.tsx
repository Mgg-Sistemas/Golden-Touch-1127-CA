/* ============================================================
   Golden Touch · Compras · «🧾 Factura» de la OC (11/11/2026)

   Junta en una sola ventana las facturas de una OC:
   · FACTURAS DELIVERY: las fotos que subió el motorizado con «CARGAR FACTURA»
     (delivery_pedidos.fotos_factura, vía orden_facturas_delivery).
   · FACTURAS ALMACÉN: las que cargó el almacenista al recepcionar (y las que Compras
     sumó al finalizar): adjuntos_directos 'orden_factura' + la factura de recepción vieja.
   Cada archivo se ve en la vista previa del sistema, se descarga o se imprime directo.
   Ver supabase/2026-11-11-facturas-delivery-y-almacen.sql.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { supabase } from '@/shared/lib/supabase';
import { previewArchivo, previewGaleria } from '@/shared/lib/reportePreview';
import { listAdjuntosDirectos, urlAdjuntoDirecto } from './adjuntosDirectos.repository';
import { urlAdjuntoOc } from './pedidos.repository';
import { urlFotoDelivery } from '@/modules/delivery/delivery.repository';
import type { Orden } from '@/shared/lib/types';

export interface ArchivoFactura {
  key: string;
  nombre: string;
  url: string;
  esImagen: boolean;
  detalle?: string | null;
}

const esImagenNombre = (n: string) => /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(n);
const fechaVE = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' }) : '';

type FotoD = { path: string; filename: string };
interface TomaDelivery {
  repartidor?: string | null; entregado_en?: string | null;
  fotos?: FotoD[]; fotos_recibo?: FotoD[]; fotos_entrega?: FotoD[];
}

/** ¿El delivery cargó alguna foto para esta OC? (para mostrar el botón «🧾 Factura»). */
export async function ordenTieneFotosDelivery(ordenId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('orden_facturas_delivery', { p_orden_id: ordenId });
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Las fotos del delivery para una OC. 12/11/2026: además de las de «CARGAR FACTURA» van
 * las que ya había cargado «al recibir del proveedor» (ahí suele estar la factura) y,
 * aparte, las de la entrega en almacén.
 */
async function fotosDelivery(ordenId: string): Promise<{ facturas: ArchivoFactura[]; entrega: ArchivoFactura[] }> {
  const { data, error } = await supabase.rpc('orden_facturas_delivery', { p_orden_id: ordenId });
  if (error) throw error;
  const tomas = (Array.isArray(data) ? data : []) as TomaDelivery[];
  const facturas: ArchivoFactura[] = [];
  const entrega: ArchivoFactura[] = [];
  const pasar = async (fs: FotoD[] | undefined, t: TomaDelivery, rotulo: string, destino: ArchivoFactura[]) => {
    for (const f of fs ?? []) {
      const url = await urlFotoDelivery(f.path).catch(() => '');
      if (!url) continue;
      destino.push({
        key: f.path, nombre: f.filename || f.path.split('/').pop() || 'foto.jpg', url, esImagen: true,
        detalle: [rotulo, t.repartidor, fechaVE(t.entregado_en)].filter(Boolean).join(' · ') || null,
      });
    }
  };
  for (const t of tomas) {
    await pasar(t.fotos, t, 'Factura', facturas);
    await pasar(t.fotos_recibo, t, 'Al recibir del proveedor', facturas);
    await pasar(t.fotos_entrega, t, 'Entrega en almacén', entrega);
  }
  return { facturas, entrega };
}

/** Las facturas que cargó Almacén (y Compras) para la OC. */
async function facturasAlmacen(o: Orden): Promise<ArchivoFactura[]> {
  const adj = (await listAdjuntosDirectos('orden_factura', o.id)).filter((a) => a.es_factura !== false);
  const out: ArchivoFactura[] = [];
  for (const a of adj) {
    const url = await urlAdjuntoDirecto('orden_factura', a.path).catch(() => '');
    if (!url) continue;
    const nombre = a.nombre || a.path.split('/').pop() || 'factura';
    out.push({
      key: a.id, nombre, url,
      esImagen: (a.content_type ?? '').startsWith('image/') || esImagenNombre(nombre),
      detalle: fechaVE(a.created_at) || null,
    });
  }
  if (o.factura_recepcion_path) {
    const url = await urlAdjuntoOc(o.factura_recepcion_path).catch(() => '');
    const nombre = o.factura_recepcion_nombre || o.factura_recepcion_path.split('/').pop() || 'factura';
    if (url) out.push({ key: o.factura_recepcion_path, nombre, url, esImagen: esImagenNombre(nombre), detalle: 'Factura de recepción' });
  }
  return out;
}

async function blobDe(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo bajar el archivo.');
  return r.blob();
}

/** Descarga el archivo con su nombre. */
export async function descargarArchivo(a: Pick<ArchivoFactura, 'url' | 'nombre'>): Promise<void> {
  const b = await blobDe(a.url);
  const href = URL.createObjectURL(b);
  const el = document.createElement('a');
  el.href = href; el.download = a.nombre; document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** Imprime directo (PDF o imagen) desde un iframe del mismo origen. */
export async function imprimirArchivo(a: Pick<ArchivoFactura, 'url' | 'nombre' | 'esImagen'>): Promise<void> {
  const b = await blobDe(a.url);
  const href = URL.createObjectURL(b);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const limpiar = () => setTimeout(() => { iframe.remove(); URL.revokeObjectURL(href); }, 60_000);
  if (a.esImagen) {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('No se pudo preparar la impresión.');
    doc.open();
    doc.write(`<!doctype html><html><head><title>${a.nombre.replace(/[<>&"]/g, '')}</title><style>@page{margin:10mm}html,body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:0 auto}</style></head><body><img src="${href}"></body></html>`);
    doc.close();
    const img = doc.querySelector('img');
    const imprimir = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); limpiar(); };
    if (img && !img.complete) img.onload = imprimir; else imprimir();
  } else {
    iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); limpiar(); };
    iframe.src = href;
  }
}

function ListaArchivos({ titulo, vacio, archivos }: { titulo: string; vacio: string; archivos: ArchivoFactura[] }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const imagenes = useMemo(() => archivos.filter((a) => a.esImagen), [archivos]);
  const galeria = useMemo(() => imagenes.map((a) => ({ url: a.url, filename: a.nombre, etiqueta: `${titulo} · ${a.nombre}` })), [imagenes, titulo]);
  function ver(a: ArchivoFactura) {
    if (a.esImagen) previewGaleria(galeria, Math.max(0, imagenes.findIndex((x) => x.key === a.key)));
    else previewArchivo(a.url, a.nombre);
  }
  async function correr(a: ArchivoFactura, fn: (a: ArchivoFactura) => Promise<void>, error: string) {
    setOcupado(a.key);
    try { await fn(a); } catch (e) { toast(e instanceof Error ? e.message : error, 'error'); } finally { setOcupado(null); }
  }
  return (
    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <div className="card-title" style={{ margin: 0 }}>{titulo} ({archivos.length})</div>
        {galeria.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => previewGaleria(galeria, 0)}>🖼 Ver todas</button>}
      </div>
      {!archivos.length ? <p className="muted" style={{ margin: 0 }}>{vacio}</p> : (
        <div style={{ display: 'grid', gap: '.7rem', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {archivos.map((a) => (
            <div key={a.key} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <button type="button" onClick={() => ver(a)} title={`Vista previa · ${a.nombre}`}
                style={{ padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in', display: 'block' }}>
                {a.esImagen
                  ? <img src={a.url} alt={a.nombre} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                  : <div style={{ height: 130, display: 'grid', placeItems: 'center', fontSize: '2.2rem' }}>📄</div>}
              </button>
              <div style={{ padding: '.35rem .45rem', fontSize: '.74rem' }}>
                <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{a.nombre}</div>
                {a.detalle && <div className="muted">{a.detalle}</div>}
              </div>
              <div style={{ display: 'flex', gap: '.25rem', padding: '0 .35rem .4rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => ver(a)}>👁 Ver</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={ocupado === a.key}
                  onClick={() => void correr(a, descargarArchivo, 'No se pudo descargar')}>⬇ Descargar</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={ocupado === a.key}
                  onClick={() => void correr(a, imprimirArchivo, 'No se pudo imprimir')}>🖨 Imprimir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FacturasOcModal({ orden, onClose }: { orden: Orden; onClose: () => void }) {
  const [delivery, setDelivery] = useState<ArchivoFactura[] | null>(null);
  const [entrega, setEntrega] = useState<ArchivoFactura[]>([]);
  const [almacen, setAlmacen] = useState<ArchivoFactura[] | null>(null);
  useEffect(() => {
    let vivo = true;
    fotosDelivery(orden.id).then((x) => { if (vivo) { setDelivery(x.facturas); setEntrega(x.entrega); } })
      .catch((e) => { if (vivo) { setDelivery([]); toast(e instanceof Error ? e.message : 'No se pudieron leer las facturas del delivery', 'error'); } });
    facturasAlmacen(orden).then((x) => { if (vivo) setAlmacen(x); })
      .catch((e) => { if (vivo) { setAlmacen([]); toast(e instanceof Error ? e.message : 'No se pudieron leer las facturas de almacén', 'error'); } });
    return () => { vivo = false; };
  }, [orden]);
  const codigo = orden.oc_codigo ?? orden.codigo;
  return (
    <Modal title={`🧾 Factura · ${codigo}`} size="lg" onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>}>
      {delivery === null ? <p className="muted">Cargando facturas del delivery…</p>
        : <ListaArchivos titulo="🛵 FACTURAS DELIVERY" vacio="El delivery no cargó fotos de la factura." archivos={delivery} />}
      {entrega.length > 0 && <ListaArchivos titulo="📷 FOTOS ENTREGA EN ALMACÉN (delivery)" vacio="" archivos={entrega} />}
      {almacen === null ? <p className="muted">Cargando facturas de almacén…</p>
        : <ListaArchivos titulo="🏬 FACTURAS ALMACÉN" vacio="Almacén todavía no cargó la factura." archivos={almacen} />}
    </Modal>
  );
}
