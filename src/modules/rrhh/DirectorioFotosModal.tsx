/* ============================================================
   Golden Touch · RRHH · Directorio de fotos (14/10/2026, traído de La Cantera)

   Ventana con las fotos de la gente que está en la lista (con los filtros que
   tenga puestos), una al lado de la otra, con nombre y cargo. «🖨 Imprimir»
   saca la misma lista una debajo de la otra (ver directorioFotos.ts).

   Las fotos se bajan de una en una (como en los carnets: muchas descargas a la
   vez contra el almacén se rechazan a medias) y se recortan con el encuadre
   que se le puso a cada una en su ficha.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { identidadEmpresa } from '@/shared/lib/empresa';
import type { Personal } from '@/shared/lib/types';
import { fotoPersonalDataUrl } from './personal.repository';
import { recorteDeEncuadre } from './encuadreFoto';
import { htmlDirectorioImpresion, personasDirectorio, type PersonaDirectorio } from './directorioFotos';

const FOTO_W = 300;
const FOTO_H = 360;

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** La foto de la persona, recortada a 5:6 con su encuadre. Null si no tiene o no cargó. */
async function fotoRecortada(p: Personal): Promise<string | null> {
  if (!p.foto_path) return null;
  try {
    const img = await cargarImagen(await fotoPersonalDataUrl(p.foto_path));
    const canvas = document.createElement('canvas');
    canvas.width = FOTO_W; canvas.height = FOTO_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const { sx, sy, sw, sh } = recorteDeEncuadre(img.width, img.height, FOTO_W, FOTO_H, p.foto_encuadre);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, FOTO_W, FOTO_H);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch { return null; }
}

/** Imprime el HTML en un iframe oculto: sale completo, en varias hojas, sin la interfaz. */
function imprimirHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const quitar = () => setTimeout(() => iframe.remove(), 1000);
  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) { iframe.remove(); return; }
    // Las imágenes del membrete tienen que estar cargadas antes de imprimir.
    const imgs = Array.from(w.document.images);
    void Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; }))))
      .then(() => { w.focus(); w.print(); quitar(); });
  };
  iframe.srcdoc = html;
}

export function DirectorioFotosModal({ personas, empresa, filtro, onClose }: {
  personas: Personal[]; empresa: string; filtro?: string | null; onClose: () => void;
}) {
  const base = useMemo(() => personasDirectorio(personas), [personas]);
  const [fotos, setFotos] = useState<Record<string, string | null>>({});
  const [hechas, setHechas] = useState(0);
  const [busca, setBusca] = useState('');
  const conFoto = useMemo(() => personas.filter((p) => p.foto_path).length, [personas]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const porId = new Map(personas.map((p) => [p.id, p]));
      let n = 0;
      for (const b of base) {
        const p = porId.get(b.id);
        const foto = p ? await fotoRecortada(p) : null;
        if (!vivo) return;
        n += 1;
        setFotos((x) => ({ ...x, [b.id]: foto }));
        setHechas(n);
      }
    })();
    return () => { vivo = false; };
  }, [base, personas]);

  const cargando = hechas < base.length;
  const lista: PersonaDirectorio[] = useMemo(() => {
    const t = normal(busca.trim());
    return base
      .filter((b) => !t || normal(`${b.nombre} ${b.cargo} ${b.departamento ?? ''} ${b.ficha ?? ''} ${b.cedula ?? ''}`).includes(t))
      .map((b) => ({ ...b, foto: fotos[b.id] ?? null }));
  }, [base, fotos, busca]);

  function imprimir() {
    const e = identidadEmpresa(empresa);
    const logo = /^https?:/i.test(e.logoPantalla) ? e.logoPantalla : `${window.location.origin}/${encodeURI(e.logoPantalla)}`;
    const fecha = new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const filtroTxt = [filtro, busca.trim() ? `búsqueda «${busca.trim()}»` : null].filter(Boolean).join(' · ');
    try { imprimirHtml(htmlDirectorioImpresion(lista, { empresa: e.nombre, rif: e.rif, logoUrl: logo, filtro: filtroTxt || null, fecha })); }
    catch { toast('No se pudo preparar la impresión', 'error'); }
  }

  return (
    <Modal title="📸 Directorio de fotos" size="lg" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      <button className="btn btn-primary" onClick={imprimir} disabled={cargando || !lista.length}
        title={cargando ? 'Esperando a que carguen las fotos' : 'Imprime una persona debajo de la otra'}>
        {cargando ? `Cargando fotos… ${hechas}/${base.length}` : '🖨 Imprimir'}
      </button>
    </>}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.75rem' }}>
        <input id="dir-fotos-busca" className="input" style={{ flex: '1 1 220px', maxWidth: 320 }} value={busca}
          onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar por nombre, cargo, ficha…" aria-label="Buscar en el directorio" />
        <span className="chip">{lista.length} de {base.length} · {conFoto} con foto</span>
        {filtro && <span className="muted" style={{ fontSize: '.8rem' }}>Filtro de la lista: {filtro}</span>}
      </div>
      {!lista.length ? (
        <p className="muted" style={{ textAlign: 'center', margin: '1rem 0' }}>Nadie coincide con la búsqueda.</p>
      ) : (
        <div className="dir-fotos">
          {lista.map((p) => (
            <figure key={p.id} className="dir-fotos-item">
              {p.foto
                ? <img src={p.foto} alt={`Foto de ${p.nombre}`} className="dir-fotos-img" />
                : <div className="dir-fotos-img dir-fotos-sin">{p.id in fotos ? 'Sin foto' : 'Cargando…'}</div>}
              <figcaption>
                <strong>{p.nombre}</strong>
                <span>{p.cargo}</span>
                {p.departamento && <span className="muted">{p.departamento}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Modal>
  );
}
