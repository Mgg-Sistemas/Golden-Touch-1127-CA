/* ============================================================
   Golden Touch · Geodesta · Informes · detalle

   El informe en solo lectura, apartado por apartado y en orden, con el visor de
   imágenes (zoom y rotación, el mismo de Minutas) y los botones de imprimir,
   editar y borrar. Acá no se cambia ningún campo: Editar abre el editor.
   ============================================================ */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { date } from '@/shared/lib/format';
import type { Apartado, ImagenGeodesta, InformeGeodesta } from '@/shared/lib/types';
import {
  dimensionesVisor, escalaSiguiente, giroSiguiente,
} from '../rrhh/minutaVisor';
import { listImagenes, urlImagen } from './informeImagenes.repository';
import { generarInformePdf } from './informePdf';
import { borrarInforme } from './informes.repository';

interface InformeDetalleModalProps {
  informe: InformeGeodesta;
  canWrite: boolean;
  actor: string;
  onClose: () => void;
  onEditar: () => void;
  onBorrado: () => void;
}

const msg = (e: unknown, def: string) => (e instanceof Error ? e.message : def);

/** Ids de las imágenes que el informe realmente usa (celdas de imagen y tiras de texto). */
function idsImagenesDelInforme(apartados: Apartado[]): string[] {
  const ids = new Set<string>();
  for (const a of apartados) {
    if (a.tipo === 'texto') {
      for (const im of a.imagenes) if (im.imagen_id) ids.add(im.imagen_id);
    } else {
      const colsImg = a.columnas.filter((c) => c.tipo === 'imagen');
      for (const f of a.filas) {
        for (const c of colsImg) {
          const v = f.celdas[c.id];
          if (v) ids.add(v);
        }
      }
    }
  }
  return [...ids];
}

function aDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: '1rem' }}>
      {titulo.trim() && <h4 style={{ margin: '0 0 .4rem' }}>{titulo}</h4>}
      {children}
    </section>
  );
}

const Vacio = () => <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>—</p>;

/** Visor de una imagen con zoom y rotación. */
function VisorImagen({ url, nombre, onClose }: { url: string; nombre: string; onClose: () => void }) {
  const [escala, setEscala] = useState(1);
  const [giro, setGiro] = useState(0);
  const [medida, setMedida] = useState<{ nw: number; nh: number; base: number } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const dim = medida ? dimensionesVisor(giro, escala, medida.base, medida.nw, medida.nh) : null;
  return (
    <Modal
      title={nombre} size="xl" onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" title="Alejar" aria-label="Alejar"
            onClick={() => setEscala((e) => escalaSiguiente(e, -1))}>−</button>
          <span className="muted" style={{ minWidth: '3.5rem', textAlign: 'center' }}>{Math.round(escala * 100)} %</span>
          <button type="button" className="btn btn-ghost" title="Acercar" aria-label="Acercar"
            onClick={() => setEscala((e) => escalaSiguiente(e, 1))}>+</button>
          <button type="button" className="btn btn-ghost" title="Rotar" aria-label="Rotar"
            onClick={() => setGiro(giroSiguiente)}>⟳</button>
          <button type="button" className="btn btn-ghost"
            onClick={() => { setEscala(1); setGiro(0); }}>Restablecer</button>
        </>
      }
    >
      <div ref={contenedor} style={{ overflow: 'auto', maxHeight: '70vh', padding: '1rem' }}>
        <div style={dim ? { position: 'relative', width: dim.caja.w, height: dim.caja.h, margin: '0 auto' } : undefined}>
          <img src={url} alt={nombre}
            onLoad={(e) => {
              const im = e.currentTarget;
              const ancho = (contenedor.current?.clientWidth ?? im.naturalWidth) - 32;
              setMedida({ nw: im.naturalWidth, nh: im.naturalHeight, base: Math.max(1, ancho) });
            }}
            style={dim
              ? {
                  position: 'absolute', left: '50%', top: '50%', width: dim.img.w, height: dim.img.h,
                  maxWidth: 'none', transform: `translate(-50%, -50%) rotate(${giro}deg)`, transition: 'transform .15s',
                }
              : { maxWidth: '100%' }} />
        </div>
      </div>
    </Modal>
  );
}

export function InformeDetalleModal({
  informe, canWrite, onClose, onEditar, onBorrado,
}: InformeDetalleModalProps) {
  /** Imágenes del informe por id, y enlaces firmados de sus miniaturas. */
  const [imagenes, setImagenes] = useState<Record<string, ImagenGeodesta>>({});
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [visor, setVisor] = useState<{ url: string; nombre: string } | null>(null);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [borrando, setBorrando] = useState(false);
  /** Cierra la puerta antes de que React pinte el botón deshabilitado: un doble clic no arranca dos armados. */
  const ocupado = useRef(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const lista = await listImagenes(informe.id);
        if (!vivo) return;
        setImagenes(Object.fromEntries(lista.map((i) => [i.id, i])));
        const usadas = new Set(idsImagenesDelInforme(informe.apartados));
        // Si una miniatura no se puede firmar, queda con el ícono; no tumba el detalle.
        const pares = await Promise.all(lista.filter((i) => usadas.has(i.id)).map(async (i) => {
          try { return [i.id, await urlImagen(i.path)] as const; } catch { return null; }
        }));
        if (!vivo) return;
        setMiniaturas(Object.fromEntries(pares.filter((p): p is readonly [string, string] => p !== null)));
      } catch (e) {
        if (vivo) toast(msg(e, 'No se pudieron cargar las imágenes'), 'error');
      }
    })();
    return () => { vivo = false; };
  }, [informe.id, informe.apartados]);

  /** El enlace se pide al abrir: dura 10 min y el modal puede llevar abierto más. */
  async function abrir(id: string) {
    const img = imagenes[id];
    if (!img) return;
    try {
      setVisor({ url: await urlImagen(img.path), nombre: img.nombre });
    } catch (e) {
      toast(msg(e, 'No se pudo abrir la imagen'), 'error');
    }
  }

  async function imprimir() {
    if (ocupado.current) return;
    ocupado.current = true;
    setImprimiendo(true);
    try {
      const lista = await listImagenes(informe.id);
      const porId = new Map(lista.map((i) => [i.id, i]));
      const imgs: Record<string, string> = {};
      let fallidas = 0;
      for (const id of idsImagenesDelInforme(informe.apartados)) {
        const img = porId.get(id);
        if (!img) { fallidas += 1; continue; }
        try {
          const res = await fetch(await urlImagen(img.path));
          // Un enlace vencido devuelve un cuerpo de error: sin este control acabaría como dataUrl corrupto.
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          imgs[id] = await aDataUrl(await res.blob());
        } catch { fallidas += 1; }
      }
      if (fallidas > 0) {
        toast(`${fallidas} ${fallidas === 1 ? 'imagen no entró' : 'imágenes no entraron'} en el PDF`, 'error');
      }
      await generarInformePdf(informe, imgs);
    } catch (e) {
      toast(msg(e, 'No se pudo generar el PDF'), 'error');
    } finally {
      ocupado.current = false;
      setImprimiendo(false);
    }
  }

  async function borrar() {
    setConfirmaBorrar(false);
    setBorrando(true);
    try {
      await borrarInforme(informe.id);
      toast('Informe borrado', 'success');
      onBorrado();
    } catch (e) {
      toast(msg(e, 'No se pudo borrar el informe'), 'error');
      setBorrando(false);
    }
  }

  const miniatura = (id: string, alto: number) => {
    const thumb = miniaturas[id];
    const nombre = imagenes[id]?.nombre ?? 'Imagen';
    if (!thumb) return <span className="muted" title={nombre}>🖼</span>;
    return (
      <button type="button" title="Ampliar" onClick={() => void abrir(id)}
        style={{ all: 'unset', cursor: 'zoom-in', display: 'inline-block' }}>
        <img src={thumb} alt={nombre} loading="lazy"
          style={{ maxHeight: alto, maxWidth: '100%', objectFit: 'contain' }}
          onError={() => setMiniaturas((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)))} />
      </button>
    );
  };

  return (
    <>
      <Modal
        title={`Informe ${informe.codigo}`} size="xl" onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn-ghost" disabled={imprimiendo} onClick={() => void imprimir()}>
              {imprimiendo ? 'Generando…' : '🖨 Imprimir'}
            </button>
            {canWrite && (
              <button type="button" className="btn btn-ghost" onClick={onEditar}>✎ Editar</button>
            )}
            {canWrite && (
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }}
                disabled={borrando} onClick={() => setConfirmaBorrar(true)}>🗑 Borrar</button>
            )}
          </>
        }
      >
        <Seccion titulo="Datos del informe">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.5rem' }}>
            <div><small className="muted">Código</small><div>{informe.codigo}</div></div>
            <div><small className="muted">Fecha</small><div>{date(informe.fecha)}</div></div>
            <div><small className="muted">Ciudad</small><div>{informe.ciudad || '—'}</div></div>
            <div><small className="muted">Estado</small><div>{informe.estado === 'finalizado' ? 'Finalizado' : 'Borrador'}</div></div>
            <div>
              <small className="muted">Para</small>
              <div>{informe.para_nombre || '—'}{informe.para_cargo ? ` · ${informe.para_cargo}` : ''}</div>
            </div>
            <div>
              <small className="muted">De</small>
              <div>{informe.de_nombre || '—'}{informe.de_cargo ? ` · ${informe.de_cargo}` : ''}</div>
            </div>
          </div>
        </Seccion>

        {informe.apartados.length === 0 && <Seccion titulo="Apartados"><Vacio /></Seccion>}

        {informe.apartados.map((a) => (
          <Seccion key={a.id} titulo={a.titulo}>
            {a.tipo === 'cuadro' ? (
              <div className="table-wrap"><table className="table">
                <thead><tr>{a.columnas.map((c) => <th key={c.id}>{c.nombre || '—'}</th>)}</tr></thead>
                <tbody>{a.filas.map((f) => (
                  <tr key={f.id}>{a.columnas.map((c) => {
                    const v = f.celdas[c.id] ?? '';
                    return (
                      <td key={c.id} style={{ whiteSpace: 'pre-wrap' }}>
                        {c.tipo === 'imagen' ? (v ? miniatura(v, 80) : '—') : (v || '—')}
                      </td>
                    );
                  })}</tr>
                ))}</tbody>
              </table></div>
            ) : (
              <>
                {a.texto.trim() ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.texto}</p> : <Vacio />}
                {a.imagenes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.8rem', marginTop: '.6rem' }}>
                    {a.imagenes.map((im, i) => (
                      <figure key={`${im.imagen_id}-${i}`} style={{ margin: 0, maxWidth: 220 }}>
                        {miniatura(im.imagen_id, 140)}
                        {im.pie.trim() && (
                          <figcaption className="muted" style={{ fontSize: '.75rem', fontStyle: 'italic' }}>{im.pie}</figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </>
            )}
          </Seccion>
        ))}
      </Modal>

      {visor && <VisorImagen url={visor.url} nombre={visor.nombre} onClose={() => setVisor(null)} />}

      {confirmaBorrar && (
        <ConfirmDialog
          title="Borrar informe" danger confirmText="Sí, borrar"
          message={<>Vas a borrar el informe <strong>{informe.codigo}</strong>. Se borra el informe y sus imágenes. No se puede deshacer.</>}
          onConfirm={() => { void borrar(); }}
          onCancel={() => setConfirmaBorrar(false)}
        />
      )}
    </>
  );
}
