import { useQuien } from '@/shared/lib/directorioUsuarios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { mensajeError } from '@/shared/lib/errores';
import { dateTime } from '@/shared/lib/format';
import { listActivosMaquinaria } from './maquinaria.repository';
import { MaquinariaCatalogoModal } from './MaquinariaCatalogoModal';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import {
  listDocumentosEquipo, subirDocumentoEquipo, cambiarArchivoDocumento, renombrarDocumento,
  eliminarDocumentoEquipo, urlDocumentoEquipo, subirDocumentosLote, type DocumentoEquipo,
} from './maquinariaDocumentos.repository';
import {
  ACCEPT_DOCUMENTO, MAX_DOCUMENTOS_EQUIPO, MAX_MB_DOCUMENTO, espaciosVisibles,
  nombreDescargaDocumento, normalizarNombreDocumento, tamanoLegible, validarArchivoDocumento,
  espaciosLibres, asignarArchivosAEspacios, sugerirNombreDesdeArchivo, type ArchivoEnLote,
} from './maquinariaDocumentos';

interface Props {
  equipo: MaquinariaEquipo;
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onClose: () => void;
}

/**
 * Documentos de un equipo (contrato, catálogo, póliza…): hasta 20 espacios independientes.
 * Admite Drag & Drop masivo (hasta 10 documentos a la vez) y por espacio individual.
 * Cada uno se sube, se ve/descarga, se renombra, se le cambia el archivo y se elimina
 * por separado. Los nombres salen del catálogo (y uno nuevo se guarda solo). En vivo.
 */
export function EquipoDocumentosModal({ equipo, canWrite, actor, actorName, onClose }: Props) {
  const [docs, setDocs] = useState<DocumentoEquipo[]>([]);
  const [nombres, setNombres] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [catalogoOpen, setCatalogoOpen] = useState(false);

  // Estados para carga masiva y Drag & Drop
  const [lote, setLote] = useState<ArchivoEnLote[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [subiendoLote, setSubiendoLote] = useState(false);
  const [progresoLote, setProgresoLote] = useState<{ actual: number; total: number; nombre: string } | null>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  const recargar = useCallback(async () => {
    const [d, n] = await Promise.all([
      listDocumentosEquipo(equipo.id),
      listActivosMaquinaria('documento').catch(() => [] as string[]),
    ]);
    setDocs(d);
    setNombres(n);
  }, [equipo.id]);

  useEffect(() => {
    recargar()
      .catch((e) => toast(mensajeError(e, 'No se pudieron cargar los documentos'), 'error'))
      .finally(() => setCargando(false));
  }, [recargar]);
  useRealtime(['maquinaria_documentos', 'maquinaria_catalogos'], () => { void recargar().catch(() => {}); });

  const alCambiar = useCallback(async () => {
    try { await recargar(); } catch { /* el tiempo real lo trae igual */ }
  }, [recargar]);

  const listId = `maq-doc-nombres-${equipo.id}`;
  const libres = espaciosLibres(docs);

  // Manejadores para Drag & Drop masivo
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canWrite || subiendoLote) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const procesarArchivos = (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (!rawFiles.length) return;

    if (libres.length === 0) {
      toast(`Este equipo ya tiene ocupados los ${MAX_DOCUMENTOS_EQUIPO} espacios de documentos.`, 'warning');
      return;
    }

    const validos: File[] = [];
    for (const f of rawFiles) {
      const problema = validarArchivoDocumento(f);
      if (problema) {
        toast(problema, 'error');
        continue;
      }
      validos.push(f);
    }

    if (!validos.length) return;

    const maxPermitidos = Math.min(libres.length, 10);
    if (validos.length > maxPermitidos) {
      toast(
        `Seleccionaste ${validos.length} archivos. Se procesarán los primeros ${maxPermitidos} (hasta 10 por tanda según los espacios libres).`,
        'warning',
      );
    }

    const asignados = asignarArchivosAEspacios(validos, docs, 10);
    setLote(asignados);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!canWrite || subiendoLote) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      procesarArchivos(e.dataTransfer.files);
    }
  };

  const actualizarNombreLote = (id: string, nuevoNombre: string) => {
    setLote((prev) => prev.map((item) => (item.id === id ? { ...item, nombre: nuevoNombre.toUpperCase() } : item)));
  };

  const quitarDelLote = (id: string) => {
    setLote((prev) => {
      const restantes = prev.filter((item) => item.id !== id);
      return restantes.map((item, idx) => ({ ...item, espacio: libres[idx] ?? item.espacio }));
    });
  };

  const ejecutarSubidaLote = async () => {
    if (!lote.length) return;

    const sinNombre = lote.find((item) => !normalizarNombreDocumento(item.nombre));
    if (sinNombre) {
      toast(`El archivo «${sinNombre.file.name}» no tiene un nombre de documento asignado.`, 'error');
      return;
    }

    setSubiendoLote(true);
    try {
      const payload = lote.map((item) => ({
        equipoId: equipo.id,
        espacio: item.espacio,
        nombre: item.nombre,
        file: item.file,
        actor,
        actorNombre: actorName,
      }));

      const res = await subirDocumentosLote(payload, (p) => setProgresoLote(p));

      if (res.errores.length > 0) {
        for (const err of res.errores) {
          toast(`Error en «${err.archivo}»: ${err.error}`, 'error');
        }
      }

      if (res.exitosos.length > 0) {
        toast(`Se subieron con éxito ${res.exitosos.length} documento${res.exitosos.length > 1 ? 's' : ''}`, 'success');
        setLote([]);
        await alCambiar();
      }
    } catch (e) {
      toast(mensajeError(e, 'Error al subir los documentos en lote'), 'error');
    } finally {
      setSubiendoLote(false);
      setProgresoLote(null);
    }
  };

  return (
    <Modal
      title={`📎 Documentos · ${equipo.equipo}`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          {canWrite && (
            <button className="btn btn-ghost" onClick={() => setCatalogoOpen(true)} title="Editar, desactivar o eliminar los nombres guardados">
              🏷 Nombres guardados
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.65rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '.84rem' }}>
          Hasta <strong>{MAX_DOCUMENTOS_EQUIPO} documentos</strong> por equipo, en PDF o imagen de hasta {MAX_MB_DOCUMENTO} MB cada uno.
          Actualmente <strong>{docs.length} de {MAX_DOCUMENTOS_EQUIPO}</strong> cargados ({libres.length} espacios libres).
        </p>
      </div>

      <datalist id={listId}>
        {nombres.map((n) => <option key={n} value={n} />)}
      </datalist>

      {/* Zona de Drag & Drop y Carga Masiva (al menos 10 documentos por intento) */}
      {canWrite && libres.length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => { if (!subiendoLote) batchInputRef.current?.click(); }}
            style={{
              border: isDragging ? '2px dashed var(--primary, #3b82f6)' : '2px dashed var(--border, rgba(255,255,255,0.18))',
              background: isDragging ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
              cursor: subiendoLote ? 'not-allowed' : 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: '1.9rem', marginBottom: '.25rem' }}>📤</div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text)' }}>
              Arrastra y suelta aquí hasta {Math.min(libres.length, 10)} documentos a la vez (PDF o imágenes)
            </div>
            <div className="muted" style={{ fontSize: '.76rem', marginTop: '.25rem' }}>
              o haz clic para seleccionar varios archivos · hasta {MAX_MB_DOCUMENTO} MB cada uno · sin tener que cargar uno a uno
            </div>
            <input
              ref={batchInputRef}
              type="file"
              multiple
              accept={ACCEPT_DOCUMENTO}
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files) procesarArchivos(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Lote en Espera / Staging */}
          {lote.length > 0 && (
            <div
              className="card"
              style={{
                margin: 0,
                padding: '1rem',
                border: '1px solid var(--primary, #3b82f6)',
                background: 'var(--surface-2, rgba(255,255,255,0.04))',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
                <div>
                  <strong style={{ fontSize: '.95rem' }}>
                    📋 Documentos preparados para subir ({lote.length})
                  </strong>
                  <div className="muted" style={{ fontSize: '.75rem' }}>
                    Revisa o ajusta el nombre que tendrá cada documento en el catálogo antes de confirmar:
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={subiendoLote}
                    onClick={() => setLote([])}
                  >
                    Descartar lote
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={subiendoLote}
                    onClick={() => void ejecutarSubidaLote()}
                  >
                    {subiendoLote ? 'Subiendo…' : `⬆ Subir ${lote.length} documento${lote.length > 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>

              {subiendoLote && progresoLote && (
                <div style={{ padding: '.5rem .75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', fontSize: '.82rem' }}>
                  ⏳ Subiendo {progresoLote.actual} de {progresoLote.total}: <strong>{progresoLote.nombre}</strong>…
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.5rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '.25rem' }}>
                {lote.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '.35rem',
                      padding: '.6rem .75rem',
                      background: 'var(--surface-1, rgba(0,0,0,0.25))',
                      borderRadius: '6px',
                      border: '1px solid var(--border, rgba(255,255,255,0.08))',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
                      <span className="badge" style={{ fontSize: '.68rem', padding: '.15rem .45rem' }}>
                        Espacio {item.espacio}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ color: 'var(--danger, #ef4444)', padding: '0 .3rem' }}
                        disabled={subiendoLote}
                        onClick={() => quitarDelLote(item.id)}
                        title="Quitar de este lote"
                      >
                        ✕ Quitar
                      </button>
                    </div>

                    <div className="muted" style={{ fontSize: '.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.file.name}>
                      📁 {item.file.name} · {tamanoLegible(item.file.size)}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                      <label style={{ fontSize: '.7rem', margin: 0 }} className="muted">Nombre del documento</label>
                      <input
                        className="input input-sm"
                        list={listId}
                        autoComplete="off"
                        value={item.nombre}
                        disabled={subiendoLote}
                        style={{ fontSize: '.8rem', padding: '.3rem .5rem' }}
                        onChange={(e) => actualizarNombreLote(item.id, e.target.value)}
                        placeholder="Ej. CONTRATO DE COMPRA"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '.75rem' }}>
          {espaciosVisibles(docs).map(({ espacio, doc }) => (
            <EspacioDocumento
              // La key cambia al llenarse o vaciarse el espacio: la tarjeta arranca limpia.
              key={doc?.id ?? `libre-${espacio}`}
              espacio={espacio}
              doc={doc}
              equipoId={equipo.id}
              canWrite={canWrite}
              actor={actor}
              actorName={actorName}
              listId={listId}
              onCambio={alCambiar}
            />
          ))}
        </div>
      )}

      {catalogoOpen && (
        <MaquinariaCatalogoModal canWrite={canWrite} tabInicial="documento" onClose={() => setCatalogoOpen(false)} />
      )}
    </Modal>
  );
}

interface EspacioProps {
  espacio: number;
  doc: DocumentoEquipo | null;
  equipoId: string;
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  listId: string;
  onCambio: () => Promise<void>;
}

type Trabajo = '' | 'subir' | 'cambiar' | 'nombre' | 'eliminar';

function EspacioDocumento({ espacio, doc, equipoId, canWrite, actor, actorName, listId, onCambio }: EspacioProps) {
  const [trabajando, setTrabajando] = useState<Trabajo>('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [cardDragging, setCardDragging] = useState(false);

  // Campos no controlados (con ref): un refresco en vivo no borra lo que se está escribiendo.
  const nombreRef = useRef<HTMLInputElement>(null);
  const renombreRef = useRef<HTMLInputElement>(null);
  const cambiarRef = useRef<HTMLInputElement>(null);
  const ocupado = trabajando !== '';

  function aceptable(f: File | null): File | null {
    if (!f) return null;
    const problema = validarArchivoDocumento(f);
    if (problema) { toast(problema, 'error'); return null; }
    return f;
  }

  async function subir() {
    const nombre = normalizarNombreDocumento(nombreRef.current?.value);
    if (!nombre) {
      toast('Pon el nombre del documento: elígelo de la lista o escribe uno nuevo.', 'error');
      nombreRef.current?.focus();
      return;
    }
    if (!archivo) { toast('Elige el archivo (PDF o imagen).', 'error'); return; }
    setTrabajando('subir');
    try {
      await subirDocumentoEquipo({ equipoId, espacio, nombre, file: archivo, actor, actorNombre: actorName });
      toast(`«${nombre}» subido`, 'success');
      await onCambio();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo subir el documento'), 'error');
    } finally {
      setTrabajando('');
    }
  }

  async function ver() {
    if (!doc) return;
    try {
      previewArchivo(await urlDocumentoEquipo(doc.path), nombreDescargaDocumento(doc.nombre, doc.archivo));
    } catch (e) {
      toast(mensajeError(e, 'No se pudo abrir el documento'), 'error');
    }
  }

  async function cambiarArchivo(f: File | null) {
    if (cambiarRef.current) cambiarRef.current.value = '';
    const nuevo = aceptable(f);
    if (!nuevo || !doc) return;
    setTrabajando('cambiar');
    try {
      await cambiarArchivoDocumento(doc, nuevo, actor, actorName);
      toast(`Archivo de «${doc.nombre}» cambiado`, 'success');
      await onCambio();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cambiar el archivo'), 'error');
    } finally {
      setTrabajando('');
    }
  }

  async function guardarNombre() {
    if (!doc) return;
    const nombre = normalizarNombreDocumento(renombreRef.current?.value);
    if (!nombre) { toast('El nombre no puede quedar vacío.', 'error'); return; }
    if (nombre === doc.nombre) { setEditandoNombre(false); return; }
    setTrabajando('nombre');
    try {
      await renombrarDocumento(doc.id, nombre);
      toast('Nombre actualizado', 'success');
      setEditandoNombre(false);
      await onCambio();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo cambiar el nombre'), 'error');
    } finally {
      setTrabajando('');
    }
  }

  async function eliminar() {
    if (!doc) return;
    setConfirmarEliminar(false);
    setTrabajando('eliminar');
    try {
      await eliminarDocumentoEquipo(doc);
      toast(`«${doc.nombre}» eliminado`, 'success');
      await onCambio();
    } catch (e) {
      toast(mensajeError(e, 'No se pudo eliminar el documento'), 'error');
    } finally {
      setTrabajando('');
    }
  }

  const nombreQuien = useQuien();
  const quien = doc ? nombreQuien(doc.subido_por_nombre, doc.subido_por) : null;

  return (
    <div
      className="card"
      style={{
        padding: '.75rem',
        margin: 0,
        display: 'grid',
        gap: '.5rem',
        alignContent: 'start',
        border: cardDragging ? '2px dashed var(--primary, #3b82f6)' : undefined,
        background: cardDragging ? 'rgba(59, 130, 246, 0.08)' : undefined,
        transition: 'all 0.15s ease',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canWrite && !ocupado) setCardDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setCardDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setCardDragging(false);
        if (!canWrite || ocupado) return;
        const f = e.dataTransfer.files?.[0];
        if (f) {
          if (doc) {
            void cambiarArchivo(f);
          } else {
            const val = aceptable(f);
            if (val) {
              setArchivo(val);
              if (nombreRef.current && !nombreRef.current.value.trim()) {
                nombreRef.current.value = sugerirNombreDesdeArchivo(val.name);
              }
            }
          }
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Documento {espacio}</span>
        {doc ? <span className="badge success">Cargado</span> : <span className="badge">Libre</span>}
      </div>

      {doc ? (
        <>
          {editandoNombre ? (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              <input
                ref={renombreRef}
                className="input"
                list={listId}
                autoComplete="off"
                autoFocus
                defaultValue={doc.nombre}
                aria-label={`Nuevo nombre del documento ${espacio}`}
                style={{ flex: '1 1 150px', minWidth: 0 }}
                onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void guardarNombre(); if (e.key === 'Escape') setEditandoNombre(false); }}
              />
              <button className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => void guardarNombre()}>
                {trabajando === 'nombre' ? 'Guardando…' : 'Guardar'}
              </button>
              <button className="btn btn-sm btn-ghost" disabled={ocupado} onClick={() => setEditandoNombre(false)}>Cancelar</button>
            </div>
          ) : (
            <strong style={{ fontSize: '.95rem', overflowWrap: 'anywhere' }}>{doc.nombre}</strong>
          )}

          <div className="muted" style={{ fontSize: '.74rem', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
            {doc.archivo ?? 'archivo'} · {tamanoLegible(doc.tamano)}
            <br />
            {dateTime(doc.updated_at ?? doc.created_at)}{quien ? ` · ${quien}` : ''}
          </div>

          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => void ver()}>👁 Ver / descargar</button>
            {canWrite && (
              <>
                <button className="btn btn-sm btn-ghost" disabled={ocupado} title="Cambiar el nombre del documento" onClick={() => setEditandoNombre(true)}>✎ Nombre</button>
                <button className="btn btn-sm btn-ghost" disabled={ocupado} title="Reemplazar el archivo por otro (o arrastra un archivo aquí)" onClick={() => cambiarRef.current?.click()}>
                  {trabajando === 'cambiar' ? 'Subiendo…' : '⇄ Cambiar archivo'}
                </button>
                <button className="btn btn-sm btn-ghost" disabled={ocupado} style={{ color: 'var(--danger)' }} title="Eliminar este documento" onClick={() => setConfirmarEliminar(true)}>
                  {trabajando === 'eliminar' ? 'Eliminando…' : '🗑 Eliminar'}
                </button>
                <input
                  ref={cambiarRef}
                  type="file"
                  accept={ACCEPT_DOCUMENTO}
                  hidden
                  aria-label={`Nuevo archivo para ${doc.nombre}`}
                  onChange={(e) => void cambiarArchivo(e.target.files?.[0] ?? null)}
                />
              </>
            )}
          </div>
        </>
      ) : canWrite ? (
        <>
          <input
            ref={nombreRef}
            className="input"
            list={listId}
            autoComplete="off"
            placeholder="Nombre (ej. CONTRATO)"
            aria-label={`Nombre del documento ${espacio}`}
            onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }}
          />
          <input
            type="file"
            className="input"
            accept={ACCEPT_DOCUMENTO}
            aria-label={`Archivo del documento ${espacio}`}
            onChange={(e) => {
              const f = aceptable(e.target.files?.[0] ?? null);
              if (!f) e.target.value = '';
              setArchivo(f);
              if (f && nombreRef.current && !nombreRef.current.value.trim()) {
                nombreRef.current.value = sugerirNombreDesdeArchivo(f.name);
              }
            }}
          />
          <small className="muted" style={{ fontSize: '.72rem', marginTop: '-.25rem' }}>
            PDF o imagen · hasta {MAX_MB_DOCUMENTO} MB · también puedes arrastrarlo aquí
          </small>
          <button className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => void subir()}>
            {trabajando === 'subir' ? 'Subiendo…' : '⬆ Subir documento'}
          </button>
        </>
      ) : (
        <span className="muted" style={{ fontSize: '.82rem' }}>Sin documento.</span>
      )}

      {confirmarEliminar && doc && (
        <ConfirmDialog
          title="Eliminar documento"
          message={`¿Eliminar «${doc.nombre}» de este equipo? Se borra el archivo y el espacio queda libre para otro.`}
          confirmText="Eliminar"
          danger
          onCancel={() => setConfirmarEliminar(false)}
          onConfirm={() => void eliminar()}
        />
      )}
    </div>
  );
}
