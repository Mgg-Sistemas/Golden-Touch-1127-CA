/* ============================================================
   Golden Touch · Geodesta · logos del membrete del informe (12/10/2026)

   Golden Touch y CVM con su casilla, y hasta 4 logos más: se eligen de las
   imágenes del módulo de Documentos (con vista previa) o se suben desde el
   equipo. Cada logo se reduce y se guarda dentro del informe, así el PDF no
   depende de los permisos de Documentos.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { LogoExtra } from '@/shared/lib/types';
import { listDocumentos, urlArchivoDocumentacion, type DocumentoEmpresa } from '@/modules/documentacion/documentacion.repository';

export const MAX_LOGOS_EXTRA = 4;
const LADO_MAX = 480;
const ES_IMAGEN = /\.(png|jpe?g|webp|gif|bmp)$/i;

/** Reduce la imagen (lado mayor ≤ 480 px) y la devuelve lista para guardarse en el informe. */
export async function prepararLogo(blob: Blob, nombre: string): Promise<LogoExtra> {
  if (!blob.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen.');
    ctx.drawImage(img, 0, 0, w, h);
    // PNG conserva la transparencia de los logos; una foto JPG sigue en JPG (pesa menos).
    const png = blob.type === 'image/png' || blob.type === 'image/gif' || blob.type === 'image/webp';
    const data = png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
    return { id: crypto.randomUUID(), nombre: nombre.replace(/\.[a-z0-9]+$/i, '').trim() || 'Logo', data, w, h };
  } finally { URL.revokeObjectURL(url); }
}

const tarjeta: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'auto 64px minmax(0, 1fr) auto', alignItems: 'center', gap: '.6rem',
  padding: '.5rem .65rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)',
  cursor: 'pointer', minWidth: 0,
};
const miniatura: React.CSSProperties = {
  width: 64, height: 48, objectFit: 'contain', borderRadius: 6, background: '#fff', padding: 3, display: 'block',
};

export function LogosInforme({ raiz, logoGt, logoCvm, extras, onCambio }: {
  raiz: string;
  logoGt: boolean; logoCvm: boolean; extras: LogoExtra[];
  onCambio: (p: { logo_gt?: boolean; logo_cvm?: boolean; logos_extra?: LogoExtra[] }) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const caben = extras.length < MAX_LOGOS_EXTRA;
  return (
    <div style={{ display: 'grid', gap: '.5rem', marginTop: '.6rem' }}>
      <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Logos del membrete</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.5rem' }}>
        <label style={tarjeta}>
          <input type="checkbox" checked={logoGt} onChange={(e) => onCambio({ logo_gt: e.target.checked })} />
          <img src={`${raiz}LOGO.jpg`} alt="" style={{ ...miniatura, opacity: logoGt ? 1 : 0.35 }} />
          <span>Golden Touch <small className="muted">· a la izquierda</small></span>
          <span />
        </label>
        <label style={tarjeta}>
          <input type="checkbox" checked={logoCvm} onChange={(e) => onCambio({ logo_cvm: e.target.checked })} />
          <img src={`${raiz}cvm.jpg`} alt="" style={{ ...miniatura, opacity: logoCvm ? 1 : 0.35 }} />
          <span>CVM <small className="muted">· a la derecha</small></span>
          <span />
        </label>
        {extras.map((l) => (
          <div key={l.id} style={{ ...tarjeta, cursor: 'default' }}>
            <span aria-hidden="true">🏷</span>
            <img src={l.data} alt="" style={miniatura} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.nombre}>{l.nombre}</span>
            <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar el logo ${l.nombre}`}
              onClick={() => onCambio({ logos_extra: extras.filter((x) => x.id !== l.id) })}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} disabled={!caben} onClick={() => setEligiendo(true)}>
        ➕ Agregar logo {caben ? '' : `(máximo ${MAX_LOGOS_EXTRA})`}
      </button>
      {eligiendo && (
        <ElegirLogoModal onClose={() => setEligiendo(false)}
          onElegido={(l) => { onCambio({ logos_extra: [...extras, l].slice(0, MAX_LOGOS_EXTRA) }); setEligiendo(false); }} />
      )}
    </div>
  );
}

/** Imágenes del módulo de Documentos (con vista previa) o una subida desde el equipo. */
function ElegirLogoModal({ onClose, onElegido }: { onClose: () => void; onElegido: (l: LogoExtra) => void }) {
  const [docs, setDocs] = useState<(DocumentoEmpresa & { url: string | null })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visto, setVisto] = useState<(DocumentoEmpresa & { url: string | null }) | null>(null);
  const [preparando, setPreparando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const todos = (await listDocumentos()).filter((d) => d.archivo_path && ES_IMAGEN.test(d.archivo_nombre ?? d.archivo_path ?? ''));
        // Primero los de una categoría «logo…», luego el resto.
        todos.sort((a, b) => Number(/logo/i.test(b.categoria + b.titulo)) - Number(/logo/i.test(a.categoria + a.titulo)) || a.titulo.localeCompare(b.titulo, 'es'));
        const conUrl = await Promise.all(todos.map(async (d) => ({ ...d, url: await urlArchivoDocumentacion(d.archivo_path as string).catch(() => null) })));
        if (vivo) setDocs(conUrl);
      } catch (e) {
        if (vivo) { setDocs([]); setError(e instanceof Error ? e.message : 'No se pudieron leer los documentos.'); }
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function usar(blob: Blob, nombre: string) {
    setPreparando(true);
    try { onElegido(await prepararLogo(blob, nombre)); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo usar esa imagen', 'error'); }
    finally { setPreparando(false); }
  }
  async function usarDocumento(d: DocumentoEmpresa & { url: string | null }) {
    if (!d.url) { toast('No se pudo abrir esa imagen.', 'error'); return; }
    setPreparando(true);
    try {
      const blob = await (await fetch(d.url)).blob();
      // Storage a veces la sirve como octet-stream: se le pone el tipo por la extensión.
      const ext = (d.archivo_nombre ?? d.archivo_path ?? '').split('.').pop()?.toLowerCase() ?? 'png';
      const tipo = blob.type.startsWith('image/') ? blob.type : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      await usar(blob.type === tipo ? blob : new Blob([blob], { type: tipo }), d.titulo);
    } catch { toast('No se pudo bajar la imagen. Revisa la conexión.', 'error'); setPreparando(false); }
  }

  return (
    <Modal title={visto ? `Vista previa · ${visto.titulo}` : '➕ Agregar logo'} size="lg" onClose={onClose}
      footer={visto
        ? <>
            <button className="btn btn-ghost" onClick={() => setVisto(null)} disabled={preparando}>← Volver</button>
            <button className="btn btn-primary" onClick={() => void usarDocumento(visto)} disabled={preparando}>{preparando ? 'Preparando…' : 'Usar este logo'}</button>
          </>
        : <>
            <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void usar(f, f.name); }} />
            <button className="btn" onClick={() => archivo.current?.click()} disabled={preparando}>📁 Subir desde el equipo</button>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          </>}>
      {visto ? (
        <div style={{ display: 'grid', placeItems: 'center', gap: '.6rem' }}>
          {visto.url
            ? <img src={visto.url} alt={visto.titulo} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 8 }} />
            : <p className="muted">No se pudo abrir la imagen.</p>}
          <small className="muted">{visto.categoria} · {visto.archivo_nombre}</small>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.6rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '.84rem' }}>
            Imágenes cargadas en <strong>Documentos</strong>. Toca una para verla en grande y usarla. También puedes subir una imagen (PNG o JPG) desde el equipo.
          </p>
          {docs === null && <p className="muted">Cargando imágenes…</p>}
          {error && <div className="aviso warning sm"><span className="aviso-icono">⚠️</span><div>{error} Si no tienes acceso a Documentos, sube el logo desde el equipo.</div></div>}
          {docs && docs.length === 0 && !error && <p className="muted">No hay imágenes en Documentos. Sube el logo desde el equipo.</p>}
          {docs && docs.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '.5rem' }}>
              {docs.map((d) => (
                <button key={d.id} type="button" onClick={() => setVisto(d)}
                  style={{ display: 'grid', gap: '.3rem', padding: '.5rem', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface)', color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
                  {d.url
                    ? <img src={d.url} alt="" style={{ width: '100%', height: 90, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 4 }} />
                    : <span style={{ height: 90, display: 'grid', placeItems: 'center' }}>🖼</span>}
                  <strong style={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.titulo}</strong>
                  <small className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.categoria}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
