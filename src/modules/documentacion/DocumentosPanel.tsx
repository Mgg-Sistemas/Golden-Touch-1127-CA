/* ============================================================
   Golden Touch · Documentación · Documentos de la empresa
   Archivo buscable (nombre, categoría, descripción) con el PDF o
   imagen de cada documento y su vencimiento opcional (avisa ≤ 30 días).
   Las categorías son un CATÁLOGO (taxonomias · documento.categoria): la
   que se escribe al cargar queda guardada, y se gestionan con «🏷».
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect, SearchCreateSelect } from '@/shared/ui/SearchSelect';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { GestionarCategoriasModal } from '@/shared/ui/GestionarCategoriasModal';
import { FechaInput } from '@/shared/ui/FechaInput';
import { toast } from '@/shared/ui/Toast';
import { previewArchivo } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { norm } from '@/shared/lib/texto';
import { estadoCarnet, fechaCarnet } from '@/modules/rrhh/vigenciaCarnet';
import {
  listDocumentos, guardarDocumento, eliminarDocumento, urlArchivoDocumentacion,
  listCategoriasDocumento, agregarCategoriaDocumento, renombrarCategoriaDocumento,
  eliminarCategoriaDocumento, contarDocumentosPorCategoria, type DocumentoEmpresa,
} from './documentacion.repository';

export function DocumentosPanel({ canWrite, actor }: { canWrite: boolean; actor: { email: string; nombre: string | null } }) {
  const [docs, setDocs] = useState<DocumentoEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editar, setEditar] = useState<DocumentoEmpresa | 'nuevo' | null>(null);
  const [borrar, setBorrar] = useState<DocumentoEmpresa | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [gestionarCats, setGestionarCats] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const ds = await listDocumentos();
      setDocs(ds);
      setCategorias(await listCategoriasDocumento(ds));
    }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudieron cargar los documentos', 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['documentos_empresa', 'taxonomias'], () => { void cargar(); });
  const conteoCats = useMemo(() => contarDocumentosPorCategoria(docs), [docs]);
  const filtrados = useMemo(() => {
    const t = norm(q);
    return docs.filter((d) => (!cat || d.categoria === cat)
      && (!t || norm(`${d.titulo} ${d.categoria} ${d.descripcion ?? ''} ${d.archivo_nombre ?? ''}`).includes(t)));
  }, [docs, q, cat]);
  const porVencer = docs.filter((d) => estadoCarnet(d.vence) === 'por_vencer').length;
  const vencidos = docs.filter((d) => estadoCarnet(d.vence) === 'vencido').length;

  async function ver(d: DocumentoEmpresa) {
    if (!d.archivo_path) return;
    try { previewArchivo(await urlArchivoDocumentacion(d.archivo_path), d.archivo_nombre ?? d.titulo); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo abrir el archivo', 'error'); }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    try { await eliminarDocumento(borrar); toast('Documento eliminado', 'success'); setBorrar(null); await cargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '.75rem' }}>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ margin: 0, flex: '1 1 220px' }}>
            <label htmlFor="doc-buscar">Buscar</label>
            <input id="doc-buscar" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, categoría o descripción…" />
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label htmlFor="doc-cat">Categoría</label>
            <SearchSelect id="doc-cat" value={cat} onChange={setCat} placeholder="🔍 Todas las categorías" style={{ minWidth: 220 }}
              options={[{ value: '', label: 'Todas las categorías' }, ...categorias.map((c) => ({ value: c, label: `${c}${conteoCats[c] ? ` (${conteoCats[c]})` : ''}` }))]} />
          </div>
          {canWrite && (
            <button type="button" className="btn btn-ghost" onClick={() => setGestionarCats(true)} title="Agregar, renombrar o eliminar categorías">🏷 Categorías</button>
          )}
          {(porVencer > 0 || vencidos > 0) && (
            <span style={{ fontSize: '.82rem' }}>
              {vencidos > 0 && <span className="badge" style={{ color: 'var(--danger)' }}>⚠ {vencidos} vencido(s)</span>}{' '}
              {porVencer > 0 && <span className="badge" style={{ color: 'var(--warning)' }}>⏳ {porVencer} por vencer</span>}
            </span>
          )}
          <span className="muted" style={{ fontSize: '.8rem', marginLeft: 'auto' }}>{filtrados.length} de {docs.length}</span>
          {canWrite && <button className="btn btn-primary" onClick={() => setEditar('nuevo')}>＋ Agregar documento</button>}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '.86rem' }}>
            <thead><tr><th>Documento</th><th>Categoría</th><th>Vence</th><th>Cargado por</th><th></th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
              {!loading && !filtrados.length && (
                <tr><td colSpan={5}><EmptyState icon="🗂" message={docs.length ? 'Ningún documento coincide con la búsqueda' : 'Aún no hay documentos cargados'} /></td></tr>
              )}
              {!loading && filtrados.map((d) => {
                const est = estadoCarnet(d.vence);
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.titulo}</strong>
                      {d.descripcion && <div className="muted" style={{ fontSize: '.76rem' }}>{d.descripcion}</div>}
                    </td>
                    <td><span className="badge">{d.categoria}</span></td>
                    <td>
                      {d.vence ? (
                        <span style={{ color: est === 'vencido' ? 'var(--danger)' : est === 'por_vencer' ? 'var(--warning)' : undefined }}>
                          {fechaCarnet(d.vence)}{est === 'vencido' ? ' · vencido' : est === 'por_vencer' ? ' · por vencer' : ''}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted" style={{ fontSize: '.8rem' }}>{d.created_by_name ?? d.created_by ?? '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.archivo_path && <button className="btn btn-sm btn-ghost" onClick={() => void ver(d)} title={d.archivo_nombre ?? ''}>📎 Ver</button>}
                      {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setEditar(d)}>✎ Editar</button>}
                      {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setBorrar(d)} title="Eliminar">🗑️</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editar && (
        <DocumentoForm
          doc={editar === 'nuevo' ? null : editar} categorias={categorias} actor={actor}
          onClose={() => setEditar(null)}
          onSaved={async () => { setEditar(null); await cargar(); }}
        />
      )}
      {borrar && (
        <ConfirmDialog
          title="Eliminar documento"
          message={<>Se borra el registro <strong>y su archivo</strong>. Esta acción no se puede deshacer.</>}
          confirmText="Sí, eliminar" danger
          preview={
            <VistaPrevia titulo="Se va a eliminar">
              <Dato label="Documento">{borrar.titulo}</Dato>
              <Dato label="Categoría">{borrar.categoria}</Dato>
              <Dato label="Descripción">{borrar.descripcion}</Dato>
              <Dato label="Vence">{borrar.vence ? fechaCarnet(borrar.vence) : null}</Dato>
              <Dato label="Archivo">{borrar.archivo_nombre}</Dato>
              <Dato label="Cargado por">{borrar.created_by_name ?? borrar.created_by}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void confirmarBorrar(); }} onCancel={() => setBorrar(null)}
        />
      )}
      {gestionarCats && (
        <GestionarCategoriasModal
          titulo="Categorías de documentos"
          categorias={categorias}
          conteoUso={conteoCats}
          entidadLabel="documento"
          onAgregar={(n) => agregarCategoriaDocumento(n, actor.email)}
          onRenombrar={(o, n) => renombrarCategoriaDocumento(o, n, actor.email)}
          onEliminar={(n) => eliminarCategoriaDocumento(n)}
          onCambioAplicado={cargar}
          onClose={() => setGestionarCats(false)}
        />
      )}
    </>
  );
}

function DocumentoForm({ doc, categorias, actor, onClose, onSaved }: {
  doc: DocumentoEmpresa | null; categorias: string[]; actor: { email: string; nombre: string | null };
  onClose: () => void; onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(doc?.titulo ?? '');
  const [categoria, setCategoria] = useState(doc?.categoria ?? 'General');
  const [descripcion, setDescripcion] = useState(doc?.descripcion ?? '');
  const [vence, setVence] = useState(doc?.vence ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setSaving(true);
    try {
      await guardarDocumento({ titulo, categoria, descripcion, vence: vence || null }, archivo, actor, doc);
      toast(doc ? 'Documento actualizado' : 'Documento agregado', 'success');
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); setSaving(false); }
  }

  return (
    <Modal
      title={doc ? `Editar · ${doc.titulo}` : 'Agregar documento'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="submit" form="doc-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}
    >
      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}><strong>Error:</strong> {error}</div>}
      <form id="doc-form" onSubmit={submit}>
        <div className="form-row">
          <label htmlFor="doc-titulo">Nombre del documento *</label>
          <input id="doc-titulo" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: RIF de la empresa, Registro mercantil…" autoFocus />
        </div>
        <div className="form-row">
          <label htmlFor="doc-categoria">Categoría</label>
          <SearchCreateSelect id="doc-categoria" value={categoria} onChange={setCategoria} options={categorias}
            placeholder="🔍 Busca una categoría o escribe una nueva…" emptyText="Sin coincidencias: escribe el nombre para crearla" />
          <small className="muted">Si escribes una nueva, queda guardada en el catálogo de categorías.</small>
        </div>
        <div className="form-row">
          <label htmlFor="doc-desc">Descripción</label>
          <textarea id="doc-desc" className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="doc-vence">Vence (opcional)</label>
          <FechaInput id="doc-vence" value={vence} onChange={setVence} />
          <small className="muted">Si tiene vencimiento, el sistema lo marca en naranja 30 días antes y en rojo al vencer.</small>
        </div>
        <div className="form-row">
          <label htmlFor="doc-archivo">Archivo (PDF o imagen){doc ? ' · déjalo vacío para mantener el actual' : ' *'}</label>
          <input id="doc-archivo" className="input" type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          {doc?.archivo_nombre && !archivo && <small className="muted">Actual: {doc.archivo_nombre}</small>}
        </div>
      </form>
    </Modal>
  );
}
