/* ============================================================
   Golden Touch · RRHH · Documentación del trabajador

   Los tres documentos que se le piden a una persona —RIF, cédula y CV— en
   PDF o en imagen. El mismo bloque sirve en dos lugares:

   · dentro del formulario de alta/edición (queda a mano al cargar la ficha), y
   · suelto, desde el botón 📎 de la lista, para consultarlo sin entrar a editar.

   En un registro que YA existe el archivo sube en el momento: es un archivo,
   no un campo del formulario, y esperar al «Guardar» solo sirve para perderlo.
   En un registro NUEVO todavía no hay a qué colgarlo, así que queda pendiente
   y viaja con el alta.
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { date } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { previewArchivo } from '@/shared/lib/reportePreview';
import type { PersonalDocumento, TipoDocumento } from '@/shared/lib/types';
import {
  ACEPTA_DOCUMENTO, TIPOS_DOCUMENTO, borrarDocumentoPersonal, errorArchivoDocumento,
  errorNombreDocumento, listDocumentosPersonal, nombreSugerido, renombrarDocumentoPersonal,
  subirDocumentoPersonal, urlDocumentoPersonal,
} from './documentos.repository';

/** Archivos elegidos antes de que la persona exista (alta). */
export type DocsPendientes = Partial<Record<TipoDocumento, File>>;

const peso = (b: number | null | undefined) => {
  const n = Number(b) || 0;
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

const labelDocumento = (tipo: TipoDocumento) => TIPOS_DOCUMENTO.find((t) => t.tipo === tipo)?.label ?? tipo;

/** Si se puede mirar como imagen. El `mime` es lo que informó el navegador al
 *  subir; cuando falta, la extensión del nombre alcanza para decidirlo. */
const esImagen = (doc: PersonalDocumento) =>
  (doc.mime ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(doc.nombre ?? '');

/** Abre un documento en la vista previa del sistema (enlace firmado, 10 min). */
async function verDocumento(doc: PersonalDocumento): Promise<void> {
  const url = await urlDocumentoPersonal(doc.path);
  previewArchivo(url, doc.nombre);
}

export function DocumentacionPersona({
  personalId, canWrite, pendientes, onPendiente, onCambio, compacto,
}: {
  /** `null` = la persona todavía no existe (alta). */
  personalId: string | null;
  canWrite: boolean;
  pendientes?: DocsPendientes;
  onPendiente?: (tipo: TipoDocumento, file: File | null) => void;
  onCambio?: () => void;
  /** Dentro del formulario se muestra más apretado. */
  compacto?: boolean;
}) {
  const [docs, setDocs] = useState<PersonalDocumento[]>([]);
  const [cargando, setCargando] = useState(!!personalId);
  // La clave del "ocupado" ya no puede ser el tipo: de los libres hay varios y
  // todos son 'otro'. Para esos se usa el id del documento.
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** Archivo elegido para un documento libre, esperando que le pongan nombre. */
  const [nuevoArchivo, setNuevoArchivo] = useState<File | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  /** Documento al que se le está cambiando el nombre. */
  const [renombrando, setRenombrando] = useState<PersonalDocumento | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [porQuitar, setPorQuitar] = useState<PersonalDocumento | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<TipoDocumento, HTMLInputElement | null>>>({});
  const inputNuevo = useRef<HTMLInputElement | null>(null);

  const recargar = useCallback(async () => {
    if (!personalId) { setDocs([]); setCargando(false); return; }
    try {
      setDocs(await listDocumentosPersonal(personalId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la documentación');
    } finally { setCargando(false); }
  }, [personalId]);

  useEffect(() => { void recargar(); }, [recargar]);
  useRealtime(['personal_documentos'], () => { void recargar(); });

  // El enlace firmado se pide recién al abrir la confirmación: dura diez
  // minutos y no tiene sentido gastar uno por cada documento que nadie va a
  // borrar. Si no se puede firmar, se confirma sin miniatura antes que trabar
  // el borrado por no poder mostrar una foto.
  useEffect(() => {
    if (!porQuitar || !esImagen(porQuitar)) { setMiniatura(null); return; }
    let vigente = true;
    setMiniatura(null);
    urlDocumentoPersonal(porQuitar.path)
      .then((url) => { if (vigente) setMiniatura(url); })
      .catch(() => { if (vigente) setMiniatura(null); });
    return () => { vigente = false; };
  }, [porQuitar]);

  async function elegir(tipo: TipoDocumento, file: File) {
    setError(null);
    const problema = errorArchivoDocumento(file);
    if (problema) { setError(problema); return; }

    if (!personalId) { onPendiente?.(tipo, file); return; }

    setOcupado(tipo);
    try {
      await subirDocumentoPersonal(personalId, tipo, file, docs.find((d) => d.tipo === tipo) ?? null);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el documento');
    } finally { setOcupado(null); }
  }

  // Sacar un pendiente no borra nada —todavía no subió a ningún lado—, así que
  // no se pregunta; el que ya está en el servidor sí pasa por la confirmación.
  function pedirQuitar(tipo: TipoDocumento) {
    setError(null);
    const doc = docs.find((d) => d.tipo === tipo);
    if (!doc) { onPendiente?.(tipo, null); return; }
    setPorQuitar(doc);
  }

  async function quitar(doc: PersonalDocumento) {
    setPorQuitar(null);
    setError(null);
    setOcupado(doc.tipo === 'otro' ? doc.id : doc.tipo);
    try {
      await borrarDocumentoPersonal(doc);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el documento');
    } finally { setOcupado(null); }
  }

  /** Paso 1 del documento libre: se elige el archivo y se propone un nombre. */
  function elegirNuevo(file: File) {
    setError(null);
    const problema = errorArchivoDocumento(file);
    if (problema) { setError(problema); return; }
    setNuevoArchivo(file);
    setNuevoNombre(nombreSugerido(file.name));
  }

  /** Paso 2: con el nombre puesto, se sube. */
  async function guardarNuevo() {
    if (!nuevoArchivo || !personalId) return;
    const malNombre = errorNombreDocumento(nuevoNombre);
    if (malNombre) { setError(malNombre); return; }
    setOcupado('nuevo');
    try {
      // `anterior` va en null a propósito: un documento libre NO reemplaza a
      // otro, se suma. Por eso pueden convivir varios.
      await subirDocumentoPersonal(personalId, 'otro', nuevoArchivo, null, nuevoNombre);
      setNuevoArchivo(null);
      setNuevoNombre('');
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el documento');
    } finally { setOcupado(null); }
  }

  async function guardarNombre() {
    if (!renombrando) return;
    const malNombre = errorNombreDocumento(nombreEdit);
    if (malNombre) { setError(malNombre); return; }
    const doc = renombrando;
    setOcupado(doc.tipo === 'otro' ? doc.id : doc.tipo);
    try {
      await renombrarDocumentoPersonal(doc, nombreEdit);
      setRenombrando(null);
      await recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el nombre');
    } finally { setOcupado(null); }
  }

  function pedirRenombrar(doc: PersonalDocumento) {
    setError(null);
    setRenombrando(doc);
    setNombreEdit(doc.nombre ?? '');
  }

  async function ver(doc: PersonalDocumento) {
    try { await verDocumento(doc); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir el documento', 'error'); }
  }

  // La miniatura de la confirmación: la imagen de verdad cuando el enlace se
  // pudo firmar, el ícono cuando el documento es un PDF, y nada cuando era una
  // imagen que no cargó (se borra igual, solo que a ciegas).
  // Los tres fijos se buscan por tipo; los libres son todos los 'otro'.
  const otros = docs.filter((d) => d.tipo === 'otro');

  const fotoPorQuitar = !porQuitar
    ? undefined
    : miniatura
      ? <img className="confirm-preview-foto" src={miniatura} alt={porQuitar.nombre} onError={() => setMiniatura(null)} />
      : esImagen(porQuitar)
        ? undefined
        : <div className="confirm-preview-foto" style={{ display: 'grid', placeItems: 'center', fontSize: '2rem' }}>📄</div>;

  return (
    <div>
      {error && (
        <div className="aviso danger sm" style={{ marginBottom: '.5rem' }}>
          <span className="aviso-icono">⛔</span><div>{error}</div>
        </div>
      )}

      {cargando && <p className="muted" style={{ fontSize: '.85rem' }}>Cargando documentación…</p>}

      <div style={{
        display: 'grid',
        gridTemplateColumns: compacto ? 'repeat(auto-fit, minmax(210px, 1fr))' : 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '.5rem',
      }}>
        {TIPOS_DOCUMENTO.map(({ tipo, label, icono, ayuda }) => {
          const doc = docs.find((d) => d.tipo === tipo) ?? null;
          const pend = pendientes?.[tipo] ?? null;
          const hay = !!doc || !!pend;
          const trabajando = ocupado === tipo;
          return (
            <div key={tipo} className="tira" style={{ padding: '.6rem .7rem .65rem .95rem' }}>
              <div className="tira-titulo" style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem' }}>
                <span>{icono} {label}</span>
                <span style={{ color: hay ? 'var(--success)' : 'var(--text-dim)' }}>{hay ? '✓ cargado' : 'falta'}</span>
              </div>

              <div style={{ fontSize: '.78rem', margin: '.25rem 0 .4rem', wordBreak: 'break-word' }}>
                {doc
                  ? <>{doc.nombre}{doc.tamano ? <span className="muted"> · {peso(doc.tamano)}</span> : null}</>
                  : pend
                    ? <>{pend.name} <span className="muted">· se sube al guardar</span></>
                    : <span className="muted">{ayuda}</span>}
              </div>

              <input ref={(el) => { inputs.current[tipo] = el; }} type="file" accept={ACEPTA_DOCUMENTO}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void elegir(tipo, file);
                }} />

              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {doc && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void ver(doc)}>👁 Ver</button>
                )}
                {canWrite && (
                  <button type="button" className="btn btn-sm btn-ghost" disabled={trabajando}
                    onClick={() => inputs.current[tipo]?.click()}>
                    {trabajando ? 'Subiendo…' : hay ? '📎 Cambiar' : '📎 Cargar'}
                  </button>
                )}
                {canWrite && doc && (
                  <button type="button" className="btn btn-sm btn-ghost" disabled={trabajando}
                    title="Cambiar el nombre con el que se ve"
                    onClick={() => pedirRenombrar(doc)}>✎ Nombre</button>
                )}
                {canWrite && hay && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                    disabled={trabajando} onClick={() => pedirQuitar(tipo)}>🗑</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Documentos libres: título, certificado médico, referencia laboral, lo
          que aparezca. A diferencia de los tres de arriba, de estos puede haber
          varios y cada uno lleva el nombre que se le ponga. */}
      <div style={{ marginTop: '.7rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.8rem' }}>
            Otros documentos
            {otros.length > 0 && <span className="muted" style={{ fontWeight: 400 }}> · {otros.length}</span>}
          </strong>
          {canWrite && (
            <>
              <input ref={inputNuevo} type="file" accept={ACEPTA_DOCUMENTO} style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) elegirNuevo(file);
                }} />
              <button type="button" className="btn btn-sm btn-ghost" disabled={!personalId || ocupado === 'nuevo'}
                title={personalId ? 'Cargar un documento que no esté en la lista' : 'Primero guardá el registro'}
                onClick={() => inputNuevo.current?.click()}>
                {ocupado === 'nuevo' ? 'Subiendo…' : '➕ Añadir documento'}
              </button>
            </>
          )}
        </div>

        {otros.length === 0
          ? (
            <p className="muted" style={{ fontSize: '.78rem', margin: '.3rem 0 0' }}>
              {personalId
                ? 'Sin documentos adicionales. Con ➕ se carga cualquier otro: título, certificado médico, referencia laboral…'
                : 'Los documentos adicionales se cargan una vez guardado el registro.'}
            </p>
          )
          : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: compacto ? 'repeat(auto-fit, minmax(210px, 1fr))' : 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '.5rem', marginTop: '.4rem',
            }}>
              {otros.map((doc) => {
                const trabajando = ocupado === doc.id;
                return (
                  <div key={doc.id} className="tira" style={{ padding: '.6rem .7rem .65rem .95rem' }}>
                    <div className="tira-titulo" style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem' }}>
                      <span style={{ wordBreak: 'break-word' }}>📎 {doc.nombre}</span>
                      <span style={{ color: 'var(--success)' }}>✓</span>
                    </div>
                    <div className="muted" style={{ fontSize: '.72rem', margin: '.25rem 0 .4rem' }}>
                      {peso(doc.tamano)}{doc.tamano && doc.created_at ? ' · ' : ''}{date(doc.created_at)}
                    </div>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => void ver(doc)}>👁 Ver</button>
                      {canWrite && (
                        <button type="button" className="btn btn-sm btn-ghost" disabled={trabajando}
                          onClick={() => pedirRenombrar(doc)}>✎ Nombre</button>
                      )}
                      {canWrite && (
                        <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                          disabled={trabajando} onClick={() => { setError(null); setPorQuitar(doc); }}>🗑</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>

      <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>
        <strong>PDF o imagen</strong> (foto del documento), hasta <strong>10 MB</strong> cada uno. Se guardan en un
        almacén <strong>privado</strong>: los ve quien puede leer RRHH y los carga o borra quien tiene escritura.
        {!personalId && ' Como la persona todavía no existe, los archivos se suben al guardar el registro.'}
      </small>

      {porQuitar && (
        <ConfirmDialog
          title={`Quitar ${labelDocumento(porQuitar.tipo)}`}
          danger
          confirmText="Sí, borrar"
          message={<>El archivo <strong>se borra del servidor</strong> y no se puede recuperar.
            Si más adelante hace falta, hay que volver a cargarlo.</>}
          preview={
            <VistaPrevia titulo="Se va a borrar" foto={fotoPorQuitar}>
              <Dato label="Documento">{labelDocumento(porQuitar.tipo)}</Dato>
              <Dato label="Archivo">{porQuitar.nombre}</Dato>
              <Dato label="Peso">{peso(porQuitar.tamano) || undefined}</Dato>
              <Dato label="Cargado">{date(porQuitar.created_at) || undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void quitar(porQuitar); }}
          onCancel={() => setPorQuitar(null)}
        />
      )}

      {/* Nombre del documento libre que se está cargando. Se pide ANTES de subir:
          un documento sin nombre no se distingue de otro en la lista. */}
      {nuevoArchivo && (
        <Modal
          title="Nombre del documento"
          onClose={() => { setNuevoArchivo(null); setNuevoNombre(''); }}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => { setNuevoArchivo(null); setNuevoNombre(''); }}>Cancelar</button>
              <button className="btn btn-primary" disabled={!!errorNombreDocumento(nuevoNombre) || ocupado === 'nuevo'}
                onClick={() => { void guardarNuevo(); }}>
                {ocupado === 'nuevo' ? 'Subiendo…' : 'Cargar documento'}
              </button>
            </>
          }
        >
          <div className="form-row">
            <label>¿Qué documento es? *</label>
            <input className="input" autoFocus value={nuevoNombre} maxLength={80}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej. Título universitario, Certificado médico" />
            {errorNombreDocumento(nuevoNombre)
              ? <small style={{ color: 'var(--danger)' }}>{errorNombreDocumento(nuevoNombre)}</small>
              : <small className="muted">Es el nombre con el que se va a ver en la lista.</small>}
          </div>
          <p className="muted" style={{ fontSize: '.78rem', marginTop: '.5rem' }}>
            Archivo: <strong>{nuevoArchivo.name}</strong> · {peso(nuevoArchivo.size)}
          </p>
        </Modal>
      )}

      {renombrando && (
        <Modal
          title="Cambiar el nombre"
          onClose={() => setRenombrando(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRenombrando(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!!errorNombreDocumento(nombreEdit)}
                onClick={() => { void guardarNombre(); }}>Guardar</button>
            </>
          }
        >
          <div className="form-row">
            <label>Nombre *</label>
            <input className="input" autoFocus value={nombreEdit} maxLength={80}
              onChange={(e) => setNombreEdit(e.target.value)} />
            {errorNombreDocumento(nombreEdit)
              ? <small style={{ color: 'var(--danger)' }}>{errorNombreDocumento(nombreEdit)}</small>
              : <small className="muted">Cambia cómo se ve en la lista. El archivo no se toca.</small>}
          </div>
        </Modal>
      )}
    </div>
  );
}
