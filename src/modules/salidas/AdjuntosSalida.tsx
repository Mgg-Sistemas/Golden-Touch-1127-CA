/* ============================================================
   Golden Touch · Salidas · Adjuntos de una solicitud (pantalla)

   Dos piezas:

   · `AdjuntosSalida`: la lista VIVA de una solicitud que ya existe. Muestra,
     abre, sube y borra, con el contador «n de 4». En el detalle va en solo
     lectura; al editar, se puede cambiar.

   · `SelectorAdjuntos`: para el formulario de ALTA, cuando la solicitud
     todavía no tiene id y no hay dónde subir. Junta los archivos en memoria
     (con las mismas reglas) y el formulario los sube apenas crea la
     solicitud.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { ConfirmDialog } from '@/shared/ui/Modal';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { dateTime } from '@/shared/lib/format';
import {
  MAX_ADJUNTOS_SALIDA, cuposLibres, enMegas, errorArchivoAdjunto, errorCupo, esImagenAdjunto,
  type ModuloAdjuntoSalida, type ReglaAdjuntos,
} from './adjuntosSalidaReglas';
import { adjuntosSalidasRepo, type AdjuntoSalida, type RepoAdjuntos } from './adjuntosSalida.repository';
import { comprimirImagen } from '@/shared/lib/comprimirImagen';

const ACEPTA = 'application/pdf,image/*';

function Icono({ contentType, nombre }: { contentType?: string | null; nombre?: string | null }) {
  return <span aria-hidden>{esImagenAdjunto(contentType, nombre) ? '🖼' : '📄'}</span>;
}

/** Lista viva de adjuntos de una solicitud existente. */
export function AdjuntosSalida({ modulo, refId, actor, soloLectura = false, titulo = '📎 Fotos y documentos', repo = adjuntosSalidasRepo, grande = false, regla, miniaturas = false }: {
  modulo: ModuloAdjuntoSalida; refId: string; actor?: string | null; soloLectura?: boolean; titulo?: string;
  /** Otro bucket + tabla con la misma forma (p. ej. los movimientos de tanque). */
  repo?: RepoAdjuntos;
  /** Botones y letra grandes, para el teléfono. */
  grande?: boolean;
  /** Cupo propio (p. ej. 4 fotos o 1 PDF). Sin ella: hasta 4 de cualquier cosa. */
  regla?: ReglaAdjuntos;
  /** Muestra las fotos como miniaturas (tocar una la abre en grande), además de la lista. */
  miniaturas?: boolean;
}) {
  const [lista, setLista] = useState<AdjuntoSalida[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [borrar, setBorrar] = useState<AdjuntoSalida | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try { setLista(await repo.list(modulo, refId)); }
    catch { /* sin permiso de lectura o sin red: se queda como estaba */ }
    finally { setCargando(false); }
  }, [modulo, refId, repo]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtime([repo.tabla], () => { void reload(); });

  // Las miniaturas piden las URLs firmadas de todas las fotos de una vez.
  const imagenes = miniaturas ? lista.filter((a) => esImagenAdjunto(a.content_type, a.nombre)) : [];
  const clavesImagenes = imagenes.map((a) => a.path).join('|');
  useEffect(() => {
    if (!clavesImagenes) { setUrls(new Map()); return; }
    let vivo = true;
    repo.urls(clavesImagenes.split('|'))
      .then((m) => { if (vivo) setUrls(m); })
      .catch(() => { /* sin miniaturas: queda la lista de siempre */ });
    return () => { vivo = false; };
  }, [clavesImagenes, repo]);

  async function abrir(a: AdjuntoSalida) {
    try { previewArchivo(await repo.url(a.path), a.nombre); }
    catch { toast('No se pudo abrir el adjunto', 'error'); }
  }

  async function onPick(archivos: File[]) {
    if (!archivos.length) return;
    const sinCupo = regla
      ? regla.error(lista.map((a) => ({ tipo: a.content_type ?? '', nombre: a.nombre })), archivos.map((f) => ({ tipo: f.type, nombre: f.name })))
      : errorCupo(lista.length, archivos.length);
    if (sinCupo) { toast(sinCupo, 'error'); if (inputRef.current) inputRef.current.value = ''; return; }
    setSubiendo(true);
    try {
      // Optimización anticipada antes de subir
      const optimizados = await Promise.all(archivos.map(async (f) => {
        if (esImagenAdjunto(f.type, f.name)) {
          return await comprimirImagen(f, { maximo: 1400, calidad: 0.78 }).catch(() => f);
        }
        return f;
      }));
      const { subidos, fallos } = await repo.subir(modulo, refId, optimizados, actor);
      if (subidos) toast(subidos > 1 ? `${subidos} archivos cargados` : 'Archivo cargado', 'success');
      for (const f of fallos) toast(f, 'error');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      await reload();
      setSubiendo(false);
    }
  }

  async function confirmarBorrar() {
    const a = borrar; if (!a) return;
    try { await repo.eliminar(a); toast('Adjunto eliminado', 'success'); setBorrar(null); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  const libres = regla ? regla.libres(lista.map((a) => ({ tipo: a.content_type ?? '', nombre: a.nombre }))) : cuposLibres(lista.length);
  const max = regla?.max ?? MAX_ADJUNTOS_SALIDA;

  return (
    <div className="card" style={{ marginTop: '.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.9rem' }}>
          {titulo} <span className="badge">{lista.length} de {max}</span>
        </strong>
        {!soloLectura && (
          <>
            <input ref={inputRef} type="file" accept={ACEPTA} multiple style={{ display: 'none' }}
              onChange={(e) => void onPick(Array.from(e.target.files ?? []))} />
            <button type="button" className={grande ? 'btn btn-primary btn-grande' : 'btn btn-sm btn-primary'} disabled={subiendo || libres === 0}
              title={libres === 0 ? 'Está completo: borra uno para subir otro' : `Puedes subir ${libres} más`}
              onClick={() => inputRef.current?.click()}>
              {subiendo ? 'Subiendo…' : '📷 Agregar foto o PDF'}
            </button>
          </>
        )}
      </div>

      {cargando ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>Cargando…</div>
      ) : !lista.length ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>
          {soloLectura ? 'Sin fotos ni documentos.' : regla ? `Sin archivos. ${regla.ayuda} Hasta 10 MB cada uno.` : `Sin fotos ni documentos. Se admiten hasta ${MAX_ADJUNTOS_SALIDA} (imagen o PDF, hasta 10 MB cada uno).`}
        </div>
      ) : (
        <>
        {imagenes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: '.5rem', margin: '.1rem 0 .65rem' }}>
            {imagenes.map((a) => (
              <button key={a.id} type="button" onClick={() => abrir(a)} title={`Ver «${a.nombre}» en grande`}
                style={{ padding: 0, aspectRatio: '1 / 1', overflow: 'hidden', cursor: 'zoom-in', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)' }}>
                {urls.get(a.path)
                  ? <img src={urls.get(a.path)} alt={a.nombre} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <span className="muted" style={{ fontSize: '.72rem' }}>Cargando…</span>}
              </button>
            ))}
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
          {lista.map((a) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', minWidth: 0 }}>
                <Icono contentType={a.content_type} nombre={a.nombre} />
                <button type="button" className="btn btn-sm btn-ghost"
                  style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => abrir(a)} title="Ver">{a.nombre}</button>
                <small className="muted">{a.tamano ? enMegas(a.tamano) + ' · ' : ''}{dateTime(a.created_at)}</small>
              </span>
              {!soloLectura && (
                <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                  onClick={() => setBorrar(a)} title="Eliminar adjunto">🗑</button>
              )}
            </li>
          ))}
        </ul>
        </>
      )}

      {borrar && (
        <ConfirmDialog title="Eliminar adjunto" message={`¿Eliminar «${borrar.nombre}»? No se puede deshacer.`}
          confirmText="Eliminar" danger onConfirm={confirmarBorrar} onCancel={() => setBorrar(null)} />
      )}
    </div>
  );
}

/**
 * Selector para el ALTA: junta hasta 4 archivos en memoria.
 * Optimiza las fotos de inmediato en el cliente para que al presionar guardar la subida sea instantánea.
 */
export function SelectorAdjuntos({ archivos, onChange, titulo = '📎 Fotos y documentos', grande = false, regla }: {
  archivos: File[]; onChange: (files: File[]) => void; titulo?: string;
  /** Botón y letra grandes, para el teléfono. */
  grande?: boolean;
  /** Cupo propio (p. ej. 4 fotos o 1 PDF). Sin ella: hasta 4 de cualquier cosa. */
  regla?: ReglaAdjuntos;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [optimizando, setOptimizando] = useState(false);
  const comoRegla = (fs: File[]) => fs.map((f) => ({ tipo: f.type, nombre: f.name }));

  // URLs de previsualización para mostrar miniaturas inmediatas
  const [previas, setPrevias] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    const mapa = new Map<number, string>();
    archivos.forEach((f, i) => {
      if (esImagenAdjunto(f.type, f.name)) {
        mapa.set(i, URL.createObjectURL(f));
      }
    });
    setPrevias(mapa);
    return () => {
      mapa.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [archivos]);

  async function elegir(nuevos: File[]) {
    if (!nuevos.length) return;
    const sinCupo = regla ? regla.error(comoRegla(archivos), comoRegla(nuevos)) : errorCupo(archivos.length, nuevos.length);
    if (sinCupo) { toast(sinCupo, 'error'); if (inputRef.current) inputRef.current.value = ''; return; }

    setOptimizando(true);
    try {
      // Optimización anticipada inmediata: comprime en milisegundos en memoria antes de guardar.
      const optimizados = await Promise.all(nuevos.map(async (f) => {
        if (esImagenAdjunto(f.type, f.name)) {
          return await comprimirImagen(f, { maximo: 1400, calidad: 0.78 }).catch(() => f);
        }
        return f;
      }));

      const buenos: File[] = [];
      for (const f of optimizados) {
        const malo = errorArchivoAdjunto(f);
        if (malo) toast(malo, 'error'); else buenos.push(f);
      }
      if (buenos.length) onChange([...archivos, ...buenos]);
    } finally {
      setOptimizando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const libres = regla ? regla.libres(comoRegla(archivos)) : cuposLibres(archivos.length);
  const max = regla?.max ?? MAX_ADJUNTOS_SALIDA;

  return (
    <div className="card" style={{ marginTop: '.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.9rem' }}>
          {titulo} <span className="badge">{archivos.length} de {max}</span>
        </strong>
        <input ref={inputRef} type="file" accept={ACEPTA} multiple style={{ display: 'none' }}
          onChange={(e) => void elegir(Array.from(e.target.files ?? []))} />
        <button type="button" className={grande ? 'btn btn-primary btn-grande' : 'btn btn-sm btn-ghost'} disabled={libres === 0 || optimizando}
          title={libres === 0 ? 'Está completo' : `Puedes elegir ${libres} más`}
          onClick={() => inputRef.current?.click()}>
          {optimizando ? '⏳ Optimizando…' : grande ? '📷 Tomar foto o elegir archivo' : '＋ Agregar foto o PDF'}
        </button>
      </div>

      {optimizando && (
        <div className="muted" style={{ fontSize: '.8rem', marginBottom: '.4rem' }}>
          ⏳ Preparando y optimizando imagen…
        </div>
      )}

      {!archivos.length ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>
          {regla ? `Opcional. ${regla.ayuda} Se optimizan y suben al guardar.` : `Opcional. Hasta ${MAX_ADJUNTOS_SALIDA} fotos o documentos. Se optimizan automáticamente.`}
        </div>
      ) : (
        <>
          {previas.size > 0 && (
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', margin: '.2rem 0 .5rem' }}>
              {archivos.map((f, i) => {
                const url = previas.get(i);
                if (!url) return null;
                return (
                  <div key={`${f.name}-${i}`} style={{ position: 'relative', width: 68, height: 68, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button" onClick={() => onChange(archivos.filter((_, j) => j !== i))}
                      aria-label="Quitar foto"
                      style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {archivos.map((f, i) => (
              <li key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', minWidth: 0 }}>
                  <Icono contentType={f.type} nombre={f.name} />
                  <span style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</span>
                  <small className="muted">{enMegas(f.size)}</small>
                </span>
                <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                  onClick={() => onChange(archivos.filter((_, j) => j !== i))} title="Quitar">🗑</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
