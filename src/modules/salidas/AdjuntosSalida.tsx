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

const ACEPTA = 'application/pdf,image/*';

function Icono({ contentType, nombre }: { contentType?: string | null; nombre?: string | null }) {
  return <span aria-hidden>{esImagenAdjunto(contentType, nombre) ? '🖼' : '📄'}</span>;
}

/** Lista viva de adjuntos de una solicitud existente. */
export function AdjuntosSalida({ modulo, refId, actor, soloLectura = false, titulo = '📎 Fotos y documentos', repo = adjuntosSalidasRepo, grande = false, regla }: {
  modulo: ModuloAdjuntoSalida; refId: string; actor?: string | null; soloLectura?: boolean; titulo?: string;
  /** Otro bucket + tabla con la misma forma (p. ej. los movimientos de tanque). */
  repo?: RepoAdjuntos;
  /** Botones y letra grandes, para el teléfono. */
  grande?: boolean;
  /** Cupo propio (p. ej. 4 fotos o 1 PDF). Sin ella: hasta 4 de cualquier cosa. */
  regla?: ReglaAdjuntos;
}) {
  const [lista, setLista] = useState<AdjuntoSalida[]>([]);
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
    const { subidos, fallos } = await repo.subir(modulo, refId, archivos, actor);
    if (subidos) toast(subidos > 1 ? `${subidos} archivos cargados` : 'Archivo cargado', 'success');
    for (const f of fallos) toast(f, 'error');
    if (inputRef.current) inputRef.current.value = '';
    await reload();
    setSubiendo(false);
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
              onChange={(e) => onPick(Array.from(e.target.files ?? []))} />
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
      )}

      {borrar && (
        <ConfirmDialog title="Eliminar adjunto" message={`¿Eliminar «${borrar.nombre}»? No se puede deshacer.`}
          confirmText="Eliminar" danger onConfirm={confirmarBorrar} onCancel={() => setBorrar(null)} />
      )}
    </div>
  );
}

/**
 * Selector para el ALTA: junta hasta 4 archivos en memoria. El formulario los
 * sube al crear la solicitud (`subirAdjuntosSalida`).
 */
export function SelectorAdjuntos({ archivos, onChange, titulo = '📎 Fotos y documentos', grande = false, regla }: {
  archivos: File[]; onChange: (files: File[]) => void; titulo?: string;
  /** Botón y letra grandes, para el teléfono. */
  grande?: boolean;
  /** Cupo propio (p. ej. 4 fotos o 1 PDF). Sin ella: hasta 4 de cualquier cosa. */
  regla?: ReglaAdjuntos;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const comoRegla = (fs: File[]) => fs.map((f) => ({ tipo: f.type, nombre: f.name }));

  function elegir(nuevos: File[]) {
    if (!nuevos.length) return;
    const sinCupo = regla ? regla.error(comoRegla(archivos), comoRegla(nuevos)) : errorCupo(archivos.length, nuevos.length);
    if (sinCupo) { toast(sinCupo, 'error'); if (inputRef.current) inputRef.current.value = ''; return; }
    const buenos: File[] = [];
    for (const f of nuevos) {
      const malo = errorArchivoAdjunto(f);
      if (malo) toast(malo, 'error'); else buenos.push(f);
    }
    if (buenos.length) onChange([...archivos, ...buenos]);
    if (inputRef.current) inputRef.current.value = '';
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
          onChange={(e) => elegir(Array.from(e.target.files ?? []))} />
        <button type="button" className={grande ? 'btn btn-primary btn-grande' : 'btn btn-sm btn-ghost'} disabled={libres === 0}
          title={libres === 0 ? 'Está completo' : `Puedes elegir ${libres} más`}
          onClick={() => inputRef.current?.click()}>
          {grande ? '📷 Tomar foto o elegir archivo' : '＋ Agregar foto o PDF'}
        </button>
      </div>
      {!archivos.length ? (
        <div className="muted" style={{ fontSize: '.8rem' }}>
          {regla ? `Opcional. ${regla.ayuda} Hasta 10 MB cada uno. Se suben al guardar.` : `Opcional. Hasta ${MAX_ADJUNTOS_SALIDA} archivos (imagen o PDF, hasta 10 MB cada uno). Se suben al guardar.`}
        </div>
      ) : (
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
      )}
    </div>
  );
}
