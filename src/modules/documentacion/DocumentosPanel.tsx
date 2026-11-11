/* ============================================================
   Golden Touch · Documentación · Documentos de la empresa
   Archivo buscable (nombre, categoría, descripción) con el PDF o
   imagen de cada documento y su vencimiento opcional (avisa ≤ 30 días).
   Las categorías son un CATÁLOGO (taxonomias · documento.categoria): la
   que se escribe al cargar queda guardada, y se gestionan con «🏷».
   ============================================================ */
import { Quien } from '@/shared/ui/Quien';
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

/* Cómo se mira el archivo: agrupado por lo que apura (vigencia) o la tabla
   de siempre. Se recuerda, como el resto del sistema. */
type VistaDocs = 'archivo' | 'tabla';
const CLAVE_VISTA_DOCS = 'gt.documentacion.v1.docs';

function leerVistaDocs(): VistaDocs {
  try {
    const v = localStorage.getItem(CLAVE_VISTA_DOCS);
    if (v === 'tabla' || v === 'archivo') return v;
  } catch { /* sin almacenamiento: valor por defecto */ }
  return 'archivo';
}

/** Cuánto le queda al papel, en palabras. */
function plazoTexto(vence: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(vence);
  if (!m) return '';
  const v = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const h = new Date();
  const hoy = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  const dias = Math.round((v.getTime() - hoy.getTime()) / 86_400_000);
  if (dias < -1) return `venció hace ${Math.abs(dias)} días`;
  if (dias === -1) return 'venció ayer';
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias <= 60) return `vence en ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses < 24 ? `vence en ${meses} meses` : `vence en ${Math.round(dias / 365)} años`;
}

const BLOQUES = [
  { key: 'vencido', titulo: 'Vencidos', nota: 'Hay que renovarlos ya.' },
  { key: 'por_vencer', titulo: 'Por vencer', nota: 'Menos de 30 días.' },
  { key: 'vigente', titulo: 'Vigentes', nota: 'Al día.' },
  { key: 'sin', titulo: 'Sin vencimiento', nota: 'No caducan.' },
] as const;

export function DocumentosPanel({ canWrite, actor }: { canWrite: boolean; actor: { email: string; nombre: string | null } }) {
  const [docs, setDocs] = useState<DocumentoEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editar, setEditar] = useState<DocumentoEmpresa | 'nuevo' | null>(null);
  const [borrar, setBorrar] = useState<DocumentoEmpresa | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [gestionarCats, setGestionarCats] = useState(false);
  const [vista, setVista] = useState<VistaDocs>(leerVistaDocs);
  const cambiarVista = (v: VistaDocs) => {
    setVista(v);
    try { localStorage.setItem(CLAVE_VISTA_DOCS, v); } catch { /* no es crítico */ }
  };

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
      {/* Barra al estándar del sistema. Lo que no filtra, sale de aquí. */}
      <div className="filterbar">
        <input
          id="doc-buscar" className="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, categoría o descripción…" aria-label="Buscar documento"
        />
        {/* Con tope: sin él se comía la fila entera y la barra caía en tres líneas. */}
        <SearchSelect id="doc-cat" value={cat} onChange={setCat} placeholder="🔍 Todas las categorías" style={{ minWidth: 200, maxWidth: 260 }}
          options={[{ value: '', label: 'Todas las categorías' }, ...categorias.map((c) => ({ value: c, label: `${c}${conteoCats[c] ? ` (${conteoCats[c]})` : ''}` }))]} />
        {canWrite && (
          <button type="button" className="btn btn-ghost" onClick={() => setGestionarCats(true)} title="Agregar, renombrar o eliminar categorías">🏷 Categorías</button>
        )}
        <div className="view-toggle" role="tablist" aria-label="Cómo ver el archivo">
          <button type="button" role="tab" aria-selected={vista === 'archivo'}
            className={vista === 'archivo' ? 'active' : ''} onClick={() => cambiarVista('archivo')}
            title="Agrupados por lo que falta para vencer">Archivo</button>
          <button type="button" role="tab" aria-selected={vista === 'tabla'}
            className={vista === 'tabla' ? 'active' : ''} onClick={() => cambiarVista('tabla')}
            title="La lista completa con todas las columnas">Tabla</button>
        </div>
        <span className="muted" style={{ fontSize: '.8rem' }}>{filtrados.length} de {docs.length}</span>
        {canWrite && <button className="btn btn-primary" onClick={() => setEditar('nuevo')}>＋ Agregar documento</button>}
      </div>

      {/* Vencimientos: es un estado del archivo, no un control. Con el badge
          que le corresponde, no texto teñido sobre fondo neutro. */}
      {(porVencer > 0 || vencidos > 0) && (
        <div className="doc-avisos">
          <span className="doc-avisos-texto">Atención:</span>
          {vencidos > 0 && <span className="badge danger">⚠ {vencidos} vencido(s)</span>}
          {porVencer > 0 && <span className="badge warning">⏳ {porVencer} por vencer</span>}
        </div>
      )}

      {vista === 'archivo' ? (
        loading ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando…</p></div>
        ) : !filtrados.length ? (
          <div className="card">
            <EmptyState icon="🗂" message={docs.length ? 'Ningún documento coincide con la búsqueda' : 'Aún no hay documentos cargados'} />
          </div>
        ) : (
          /* Agrupado por lo único que apura. Los vencidos primero: en la
             tabla alfabética quedaban donde cayera su inicial. */
          BLOQUES.map((b) => {
            const grupo = filtrados.filter((d) => (estadoCarnet(d.vence) ?? 'sin') === b.key);
            if (!grupo.length) return null;
            return (
              <section key={b.key} className={`doc-bloque ${b.key}`}>
                <div className="doc-bloque-head">
                  <h3 className="doc-bloque-titulo">{b.titulo}</h3>
                  <span className="usr-depto-n">{grupo.length}</span>
                  <small className="muted" style={{ fontSize: '.76rem' }}>{b.nota}</small>
                </div>
                <div className="doc-cards">
                  {grupo.map((d) => (
                    <article key={d.id} className={`doc-card ${b.key}`}>
                      <div>
                        <div className="doc-card-titulo">{d.titulo}</div>
                        {d.descripcion && <p className="doc-card-desc">{d.descripcion}</p>}
                      </div>
                      <div className="doc-card-meta">
                        <span className="badge">{d.categoria}</span>
                        {d.vence ? (
                          <span className="doc-plazo">
                            {plazoTexto(d.vence)} <span className="doc-plazo-fecha">· {fechaCarnet(d.vence)}</span>
                          </span>
                        ) : <span className="muted" style={{ fontSize: '.78rem' }}>Sin fecha de vencimiento</span>}
                      </div>
                      <div className="doc-card-pie">
                        <span className="doc-card-quien">
                          <Quien nombre={d.created_by_name} correo={d.created_by} vacio="—" />
                        </span>
                        {d.archivo_path
                          ? <button className="btn btn-sm btn-ghost" onClick={() => void ver(d)} title={d.archivo_nombre ?? ''}>📎 Ver</button>
                          : <span className="doc-card-sin-archivo">Sin archivo</span>}
                        {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setEditar(d)}>✎ Editar</button>}
                        {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setBorrar(d)}>🗑</button>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        )
      ) : (
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
                          {fechaCarnet(d.vence)}
                          {/* El estado, con la pieza del sistema. */}
                          {est === 'vencido' && <span className="badge danger">Vencido</span>}
                          {est === 'por_vencer' && <span className="badge warning">Por vencer</span>}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted" style={{ fontSize: '.8rem' }}><Quien nombre={d.created_by_name} correo={d.created_by} vacio="—" /></td>
                    <td className="doc-acciones">
                      {d.archivo_path && <button className="btn btn-sm btn-ghost" onClick={() => void ver(d)} title={d.archivo_nombre ?? ''}>📎 Ver</button>}
                      {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setEditar(d)}>✎ Editar</button>}
                      {/* Era un icono mudo para la acción irreversible de la fila. */}
                      {canWrite && <button className="btn btn-sm btn-ghost" onClick={() => setBorrar(d)}>🗑 Eliminar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

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
              <Dato label="Cargado por">{borrar.created_by_name || borrar.created_by ? <Quien nombre={borrar.created_by_name} correo={borrar.created_by} /> : undefined}</Dato>
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
