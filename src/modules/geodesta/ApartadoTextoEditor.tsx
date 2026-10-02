/* ============================================================
   Golden Touch · Geodesta · apartado de tipo Texto

   Un párrafo y, debajo, una tira de imágenes con su pie. Componente controlado:
   no guarda copia de `apartado`, cada cambio sube por `onCambio`.
   Quitar una imagen solo borra la entrada del apartado: el archivo guardado se
   limpia cuando se borra el informe.
   ============================================================ */
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { ApartadoTexto } from '@/shared/lib/types';
import { repartirTanda } from '../rrhh/minutaVisor';
import {
  ACEPTA_IMAGEN, errorArchivoImagen, listImagenes, subirImagen, urlImagen,
} from './informeImagenes.repository';

interface ApartadoTextoEditorProps {
  apartado: ApartadoTexto;
  /** null hasta que el informe se guarda por primera vez: sin esto no se suben imágenes. */
  informeId: string | null;
  actor: string;
  onCambio: (a: ApartadoTexto) => void;
}

const TITULO_SIN_INFORME = 'Guardá el informe primero para poder subir imágenes';

export function ApartadoTextoEditor({ apartado, informeId, actor, onCambio }: ApartadoTextoEditorProps) {
  // Siempre la última versión, para que una subida que termina tarde no pise cambios posteriores.
  const ultimo = useRef(apartado);
  useEffect(() => { ultimo.current = apartado; }, [apartado]);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [apartado.texto]);

  const [subiendo, setSubiendo] = useState(false);
  const [encima, setEncima] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  // Solo UI efímera: miniaturas ya firmadas (id de imagen -> URL), para no firmar en cada render.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pedidas = useRef<Set<string>>(new Set());
  // Ids que no existen en el informe (borradas): se muestran como no disponibles, no como cargando.
  const [noDisponibles, setNoDisponibles] = useState<Set<string>>(new Set());

  const { imagenes } = apartado;
  const clave = imagenes.map((i) => i.imagen_id).join('|');

  useEffect(() => {
    if (!informeId) return;
    const faltan = clave.split('|').filter((id) => id && !pedidas.current.has(id));
    if (faltan.length === 0) return;
    faltan.forEach((id) => pedidas.current.add(id));
    let vivo = true;
    const resueltas = new Set<string>();
    const cache = pedidas.current;
    (async () => {
      try {
        const todas = await listImagenes(informeId);
        const nuevas: Record<string, string> = {};
        const sinImagen: string[] = [];
        for (const id of faltan) {
          const img = todas.find((i) => i.id === id);
          if (img) nuevas[id] = await urlImagen(img.path);
          else sinImagen.push(id);
          resueltas.add(id);
        }
        if (!vivo) return;
        setUrls((p) => ({ ...p, ...nuevas }));
        if (sinImagen.length > 0) setNoDisponibles((p) => new Set([...p, ...sinImagen]));
      } catch {
        if (vivo) toast('No se pudieron cargar algunas miniaturas.', 'error');
      }
    })();
    return () => {
      vivo = false;
      // Lo que esta pasada no alcanzó a resolver se vuelve a pedir en la próxima.
      faltan.forEach((id) => { if (!resueltas.has(id)) cache.delete(id); });
    };
  }, [clave, informeId]);

  const cambiarPie = (id: string, pie: string) =>
    onCambio({ ...apartado, imagenes: imagenes.map((i) => (i.imagen_id === id ? { ...i, pie } : i)) });

  const quitar = (id: string) =>
    onCambio({ ...apartado, imagenes: imagenes.filter((i) => i.imagen_id !== id) });

  const pedirQuitar = (id: string) => {
    const img = imagenes.find((i) => i.imagen_id === id);
    if (img && img.pie.trim() !== '') setPendiente(id);
    else quitar(id);
  };

  /** Camino único para el botón y para soltar archivos: misma validación en ambos. */
  async function subirTanda(archivos: File[]) {
    if (!informeId || subiendo || archivos.length === 0) return;
    const { validos, rechazados } = repartirTanda(archivos, errorArchivoImagen);
    rechazados.forEach((r) => toast(`${r.nombre}: ${r.motivo}`, 'error'));
    if (validos.length === 0) return;
    setSubiendo(true);
    try {
      for (const file of validos) {
        try {
          const img = await subirImagen(informeId, file, actor);
          const url = await urlImagen(img.path).catch(() => '');
          pedidas.current.add(img.id);
          if (url) setUrls((p) => ({ ...p, [img.id]: url }));
          const a = ultimo.current;
          const nuevo = { ...a, imagenes: [...a.imagenes, { imagen_id: img.id, pie: '' }] };
          // Se adelanta la referencia: la siguiente imagen de la tanda parte de esta, sin esperar el render.
          ultimo.current = nuevo;
          onCambio(nuevo);
        } catch (e) {
          toast(`${file.name}: ${e instanceof Error && e.message ? e.message : 'No se pudo subir la imagen.'}`, 'error');
        }
      }
    } finally {
      setSubiendo(false);
    }
  }

  const bloqueado = !informeId || subiendo;

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (informeId && !subiendo) setEncima(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    if (!informeId) { toast(TITULO_SIN_INFORME, 'error'); return; }
    void subirTanda(Array.from(e.dataTransfer.files));
  };

  return (
    <div>
      <textarea
        ref={areaRef} className="input" rows={3} value={apartado.texto}
        aria-label="Texto del apartado" placeholder="Escribí el texto del apartado"
        onChange={(e) => onCambio({ ...apartado, texto: e.target.value })}
        style={{ resize: 'none', overflow: 'hidden', width: '100%' }}
      />

      <div
        onDragOver={onDragOver}
        onDragLeave={() => setEncima(false)}
        onDrop={onDrop}
        title={informeId ? undefined : TITULO_SIN_INFORME}
        style={{
          marginTop: '.75rem', padding: '.75rem', borderRadius: 6,
          border: `2px dashed ${encima ? 'var(--primary, #3b82f6)' : 'var(--border, #8884)'}`,
          opacity: informeId ? 1 : 0.7,
        }}
      >
        {imagenes.length > 0 && (
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
            {imagenes.map((im) => (
              <div key={im.imagen_id} style={{ width: '11rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.25rem' }}>
                  {urls[im.imagen_id]
                    ? <img src={urls[im.imagen_id]} alt={im.pie || 'Imagen del apartado'}
                        style={{ maxWidth: '9rem', maxHeight: '7rem', borderRadius: 4 }} />
                    : <span style={{ opacity: 0.6 }}>{noDisponibles.has(im.imagen_id) ? 'Imagen no disponible' : 'Cargando…'}</span>}
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                    title="Quitar imagen" aria-label="Quitar imagen"
                    onClick={() => pedirQuitar(im.imagen_id)}>✕</button>
                </div>
                <input className="input" value={im.pie} placeholder="Pie de la imagen"
                  aria-label="Pie de la imagen"
                  onChange={(e) => cambiarPie(im.imagen_id, e.target.value)} />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <label
            className="btn btn-sm btn-ghost"
            title={informeId ? 'Elegir imágenes' : TITULO_SIN_INFORME}
            style={bloqueado ? { opacity: 0.5, cursor: 'not-allowed' } : { cursor: 'pointer' }}
          >
            {subiendo ? 'Subiendo…' : '+ Imágenes'}
            <input
              type="file" accept={ACEPTA_IMAGEN} multiple hidden
              disabled={bloqueado}
              title={informeId ? 'Elegir imágenes' : TITULO_SIN_INFORME}
              onChange={(e) => {
                const archivos = Array.from(e.target.files ?? []);
                e.target.value = '';
                void subirTanda(archivos);
              }}
            />
          </label>
          <span style={{ opacity: 0.6, fontSize: '.85rem' }}>
            {informeId ? 'o arrastrá las imágenes hasta acá' : TITULO_SIN_INFORME}
          </span>
        </div>
      </div>

      {pendiente && (
        <ConfirmDialog
          title="Quitar imagen" danger confirmText="Sí, quitar"
          message="Esta imagen tiene un pie escrito. Si la quitás, se pierde. ¿Seguro que querés quitarla?"
          onConfirm={() => { quitar(pendiente); setPendiente(null); }}
          onCancel={() => setPendiente(null)}
        />
      )}
    </div>
  );
}
