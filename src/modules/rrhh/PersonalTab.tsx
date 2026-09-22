import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type CSSProperties } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal, NominaRenglon } from '@/shared/lib/types';
import { formatearRif, normalizarRif, rifValido } from '@/shared/lib/rif';
import {
  listPersonal, crearPersonal, actualizarPersonal, setPersonalActivo, eliminarPersonal, type PersonalInput,
  subirFotoPersonal, borrarFotoPersonal, fotoPersonalDataUrl,
} from './personal.repository';
import { DocumentacionPersona, type DocsPendientes } from './DocumentacionPersona';
import { listDocumentosDeTodos, subirDocumentoPersonal, TIPOS_DOCUMENTO } from './documentos.repository';
import type { PersonalDocumento, TipoDocumento } from '@/shared/lib/types';
import { listHistoricoPersona } from './nomina.repository';
import { listCargos, listDepartamentos, addCargo, addDepartamento } from './catalogos';
import { generarCarnetPersonalDataUrl, generarCarnetReversoDataUrl, nombreArchivoCarnet } from './carnetPersonal';
import { descargarConstanciaTrabajoPdf, type FirmanteConstancia } from './constanciaTrabajoPdf';
import { HistorialSueldoModal } from './HistorialSueldoModal';
import { usePermissions } from '@/modules/auth/PermissionsContext';

const VACIO: PersonalInput = { nombre: '', apellido: '', cedula: '', rif: '', cargo: '', departamento: '', sueldo_base: 0, fecha_ingreso: '', telefono: '', contacto_emergencia: '', telefono_emergencia: '' };

/** Limita la cédula a formato venezolano: prefijo opcional (V/E/J/G/P) + hasta 8 dígitos. */
function sanitizarCedula(v: string): string {
  const limpio = (v || '').toUpperCase().replace(/[^VEJGP0-9]/g, '');
  const letra = /^[VEJGP]/.test(limpio) ? limpio[0] : '';
  const digitos = limpio.replace(/[^0-9]/g, '').slice(0, 8);
  return letra && digitos ? `${letra}-${digitos}` : letra + digitos;
}

/** Da forma al RIF mientras se escribe: letra + 8 dígitos + verificador (V-12345678-9). */
function sanitizarRif(v: string): string {
  const limpio = normalizarRif(v).replace(/[^VEJGPC0-9]/g, '');
  const letra = /^[VEJGPC]/.test(limpio) ? limpio[0] : '';
  const digitos = limpio.replace(/[^0-9]/g, '').slice(0, 9);
  if (!letra) return digitos;
  if (digitos.length <= 8) return digitos ? `${letra}-${digitos}` : letra;
  return `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}`;
}

/** La cédula sin guiones ni mayúsculas, que es como la compara la base de datos. */
const claveCedula = (v: string | null | undefined) =>
  String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function PersonalTab({ canWrite, actor }: { canWrite: boolean; actor: string }) {
  // Solo un admin puede borrar un renglón del historial de sueldo.
  const { isAdmin } = usePermissions();
  const [lista, setLista] = useState<Personal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonalInput>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [histPersona, setHistPersona] = useState<Personal | null>(null);
  const [sueldoPersona, setSueldoPersona] = useState<Personal | null>(null);
  const [carnetPersona, setCarnetPersona] = useState<Personal | null>(null);
  const [constanciaPersona, setConstanciaPersona] = useState<Personal | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [cargos, setCargos] = useState<string[]>([]);
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  // Foto dentro del formulario. En un registro que YA existe se sube y se borra
  // en el momento (es un archivo, no un campo del formulario). En uno nuevo
  // todavía no hay a qué asociarla, así que queda pendiente y sube al guardar.
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoPendiente, setFotoPendiente] = useState<File | null>(null);
  const [fotoOcupada, setFotoOcupada] = useState(false);
  // Cédula y RIF sí son controlados (a diferencia del resto de los textos):
  // hacen falta en el render para avisar de un duplicado o de un RIF mal escrito
  // ANTES de guardar, no después del rechazo de la base.
  const [cedula, setCedula] = useState('');
  const [rif, setRif] = useState('');
  // Documentación (RIF, cédula, CV). En un registro nuevo todavía no hay id al
  // que colgar los archivos, así que quedan acá y suben con el alta.
  const [docsPendientes, setDocsPendientes] = useState<DocsPendientes>({});
  // Qué papeles tiene cada persona, para marcarlo en la lista sin abrir nada.
  const [docsTodos, setDocsTodos] = useState<PersonalDocumento[]>([]);
  const [docsPersona, setDocsPersona] = useState<Personal | null>(null);
  // Campos de texto NO controlados (DOM = fuente de verdad): inmunes a re-renders
  // que de otro modo "cortan" lo tecleado. Se leen del DOM al guardar.
  const formRef = useRef<HTMLFormElement>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    try { setLista(await listPersonal(false)); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar el personal', 'error'); }
    finally { setLoading(false); }
  }, []);
  const cargarCatalogos = useCallback(() => {
    listCargos().then(setCargos).catch(() => { /* catálogo opcional */ });
    listDepartamentos().then(setDepartamentos).catch(() => { /* catálogo opcional */ });
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  const cargarDocs = useCallback(() => {
    // Si falla (permisos, red), la lista se muestra igual: la marca de papeles
    // es información de más, no un requisito para ver al personal.
    listDocumentosDeTodos().then(setDocsTodos).catch(() => setDocsTodos([]));
  }, []);
  useEffect(() => { cargarDocs(); }, [cargarDocs]);

  useEffect(() => { cargarCatalogos(); }, [cargarCatalogos]);
  useRealtime(['personal'], () => { void recargar(); });
  useRealtime(['personal_documentos'], () => { cargarDocs(); });

  /** Cuántos de los tres documentos tiene cargados cada persona. */
  const docsPorPersona = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docsTodos) m.set(d.personal_id, (m.get(d.personal_id) ?? 0) + 1);
    return m;
  }, [docsTodos]);

  function limpiarFoto() { setFotoPath(null); setFotoPreview(null); setFotoPendiente(null); setFotoOcupada(false); }
  function limpiarDocs() { setDocsPendientes({}); }

  /** ¿Otra persona ya tiene esa cédula? Se mira sobre la lista ya cargada. */
  const cedulaRepetida = useMemo(() => {
    const c = claveCedula(cedula);
    if (!c) return null;
    return lista.find((p) => p.id !== editId && claveCedula(p.cedula) === c) ?? null;
  }, [cedula, lista, editId]);

  const rifMalEscrito = !!rif.trim() && !rifValido(rif);

  function abrirNuevo() { setEditId(null); setForm(VACIO); setCedula(''); setRif(''); setError(null); limpiarFoto(); limpiarDocs(); setFormOpen(true); }
  function editar(p: Personal) {
    setEditId(p.id);
    setForm({ nombre: p.nombre, apellido: p.apellido, cedula: p.cedula ?? '', rif: p.rif ?? '', cargo: p.cargo ?? '', departamento: p.departamento ?? '', sueldo_base: Number(p.sueldo_base) || 0, fecha_ingreso: p.fecha_ingreso ?? '', telefono: p.telefono ?? '', contacto_emergencia: p.contacto_emergencia ?? '', telefono_emergencia: p.telefono_emergencia ?? '' });
    setCedula(p.cedula ?? '');
    setRif(p.rif ?? '');
    limpiarFoto();
    limpiarDocs();
    setFotoPath(p.foto_path ?? null);
    setError(null); setFormOpen(true);
  }
  function cerrarForm() { setEditId(null); setForm(VACIO); setCedula(''); setRif(''); setError(null); limpiarFoto(); limpiarDocs(); setFormOpen(false); }

  /** Un archivo elegido en el ALTA: espera a que la persona exista. */
  function elegirDocPendiente(tipo: TipoDocumento, file: File | null) {
    setDocsPendientes((d) => {
      const copia = { ...d };
      if (file) copia[tipo] = file; else delete copia[tipo];
      return copia;
    });
  }

  // La vista previa de la foto guardada se baja una sola vez al abrir el formulario.
  useEffect(() => {
    if (!formOpen || !fotoPath || fotoPreview) return;
    let cancel = false;
    fotoPersonalDataUrl(fotoPath)
      .then((d) => { if (!cancel) setFotoPreview(d); })
      .catch(() => { /* si no se puede bajar, se muestra el marco vacío */ });
    return () => { cancel = true; };
  }, [formOpen, fotoPath, fotoPreview]);

  /** Lee el archivo elegido para mostrarlo al instante, sin esperar al servidor. */
  function leerPreview(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function elegirFotoForm(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) { setError('La foto debe ser una imagen.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('La foto no puede superar 5 MB.'); return; }
    setFotoOcupada(true);
    try {
      const preview = await leerPreview(file);
      if (editId) {
        // Registro existente: sube ya. Así el carnet y la ficha quedan al día
        // aunque después se cierre el formulario sin guardar el resto.
        const nuevo = await subirFotoPersonal(editId, file, fotoPath);
        setFotoPath(nuevo); setFotoPendiente(null); setFotoPreview(preview);
        await recargar();
      } else {
        setFotoPendiente(file); setFotoPreview(preview);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la foto');
    } finally { setFotoOcupada(false); }
  }

  async function quitarFotoForm() {
    setError(null);
    if (!editId || !fotoPath) { setFotoPendiente(null); setFotoPreview(null); return; }
    if (!window.confirm('¿Quitar la foto de esta persona? Se borra del servidor.')) return;
    setFotoOcupada(true);
    try {
      await borrarFotoPersonal(editId, fotoPath);
      setFotoPath(null); setFotoPreview(null); setFotoPendiente(null);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la foto');
    } finally { setFotoOcupada(false); }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault(); setError(null);
    // Campos de texto: se leen del DOM (no controlados). Cargo/Departamento/Fecha vienen del estado.
    const root = formRef.current;
    const val = (name: string) => (root?.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? '';
    const datos: PersonalInput = {
      ...form,
      nombre: val('p-nombre').trim(),
      apellido: val('p-apellido').trim(),
      cedula: sanitizarCedula(cedula),
      rif: rif.trim() ? sanitizarRif(rif) : null,
      sueldo_base: Number(val('p-sueldo')) || 0,
      telefono: val('p-telefono').trim(),
      contacto_emergencia: val('p-contacto-emergencia').trim(),
      telefono_emergencia: val('p-telefono-emergencia').trim(),
    };
    if (!datos.nombre) { setError('Indicá el nombre.'); return; }
    if (cedulaRepetida) {
      setError(`${cedulaRepetida.nombre} ${cedulaRepetida.apellido ?? ''} ya está registrada con esa cédula.`.trim());
      return;
    }
    setGuardando(true);
    try {
      if (editId) {
        await actualizarPersonal(editId, datos);
      } else {
        const creada = await crearPersonal(datos, actor);
        // Recién ahora hay un id al que colgarle la foto. Si falla, el registro
        // ya quedó guardado: se avisa y la foto se carga después.
        if (fotoPendiente) {
          try { await subirFotoPersonal(creada.id, fotoPendiente); }
          catch { toast('Se guardó el registro, pero la foto no se pudo subir. Cargala con ✎ Editar.', 'error'); }
        }
        // Los documentos elegidos antes de que existiera el registro. Si alguno
        // falla, el registro YA quedó guardado: se avisa cuál y se carga después.
        for (const { tipo, label } of TIPOS_DOCUMENTO) {
          const file = docsPendientes[tipo];
          if (!file) continue;
          try { await subirDocumentoPersonal(creada.id, tipo, file); }
          catch { toast(`Se guardó el registro, pero el ${label} no se pudo subir. Cargalo con 📎.`, 'error'); }
        }
        cargarDocs();
      }
      // Si el cargo/departamento es nuevo, lo agregamos al catálogo compartido.
      const cargo = (datos.cargo ?? '').trim();
      const depto = (datos.departamento ?? '').trim();
      if (cargo && !cargos.includes(cargo)) await addCargo(cargo, actor).catch(() => {});
      if (depto && !departamentos.includes(depto)) await addDepartamento(depto, actor).catch(() => {});
      cargarCatalogos();
      toast(editId ? 'Personal actualizado' : 'Personal agregado', 'success');
      cerrarForm();
      await recargar();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  async function toggleActivo(p: Personal) {
    try { await setPersonalActivo(p.id, !p.activo); await recargar(); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cambiar', 'error'); }
  }
  async function borrar(p: Personal) {
    if (!window.confirm(`¿Eliminar a ${p.nombre} ${p.apellido} de la nómina? (no afecta los pagos ya hechos)`)) return;
    try { await eliminarPersonal(p.id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  return (
    <div>
      {canWrite && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.75rem' }}>
          <button className="btn btn-primary" onClick={abrirNuevo}>+ Ingresar Registro de Personal</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>Persona</th><th>Departamento</th><th>Cargo</th><th style={{ textAlign: 'right' }}>Sueldo base</th><th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>Acciones</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !lista.length && <tr><td colSpan={6}><EmptyState message="Sin personal. Usá “+ Ingresar Registro de Personal”." icon="👥" /></td></tr>}
            {!loading && lista.map((p) => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.55 }}>
                <td>{p.nombre} {p.apellido}{p.cedula ? <span className="muted"> · {p.cedula}</span> : null}
                  {p.rif && <div className="muted mono" style={{ fontSize: '.72rem' }}>RIF {formatearRif(p.rif)}</div>}
                </td>
                <td className="muted">{p.departamento || '—'}</td>
                <td className="muted">{p.cargo || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{Number(p.sueldo_base) > 0 ? money(p.sueldo_base) : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge" style={{ color: p.activo ? 'var(--success)' : 'var(--muted)' }}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDocsPersona(p)}
                    title="Documentación: RIF, cédula y CV"
                    style={(docsPorPersona.get(p.id) ?? 0) === TIPOS_DOCUMENTO.length ? { color: 'var(--success)' } : undefined}>
                    📎 {docsPorPersona.get(p.id) ?? 0}/{TIPOS_DOCUMENTO.length}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setSueldoPersona(p)}
                    title="Historial de sueldo: de cuánto a cuánto, cuándo y por qué">💵</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setHistPersona(p)} title="Histórico de pagos">🧾</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setCarnetPersona(p)} title="Generar carnet con QR">🪪</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setConstanciaPersona(p)} title="Constancia de trabajo (PDF)">📄</button>
                  {canWrite && <>
                    <button className="btn btn-sm btn-ghost" onClick={() => editar(p)} title="Editar">✎</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}>{p.activo ? '⏸' : '▶'}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => borrar(p)} title="Eliminar" style={{ color: 'var(--danger)' }}>🗑</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <Modal
          title={editId ? 'Editar registro de personal' : 'Ingresar registro de personal'}
          size="lg"
          onClose={() => { if (!guardando) cerrarForm(); }}
          footer={
            <>
              <button className="btn btn-ghost" onClick={cerrarForm} disabled={guardando}>Cancelar</button>
              <button type="submit" form="rrhh-personal-form" className="btn btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : '+ Agregar'}
              </button>
            </>
          }
        >
          <form id="rrhh-personal-form" ref={formRef} onSubmit={guardar}>
            {error && <div className="aviso danger" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">⛔</span><div><strong>Error:</strong> {error}</div></div>}

            <FotoPersonaCard
              preview={fotoPreview}
              tieneFoto={!!fotoPath || !!fotoPendiente}
              ocupada={fotoOcupada}
              pendiente={!editId && !!fotoPendiente}
              onElegir={elegirFotoForm}
              onQuitar={quitarFotoForm}
            />

            <div className="form-grid">
              <div className="form-row"><label>Nombre *</label><input className="input" name="p-nombre" autoFocus defaultValue={form.nombre} required /></div>
              <div className="form-row"><label>Apellido</label><input className="input" name="p-apellido" defaultValue={form.apellido ?? ''} /></div>
              <div className="form-row">
                <label>Cédula</label>
                <input className="input" name="p-cedula" value={cedula}
                  onChange={(e) => setCedula(sanitizarCedula(e.target.value))}
                  placeholder="V-12345678" maxLength={11} inputMode="numeric"
                  style={cedulaRepetida ? { borderColor: 'var(--danger)' } : undefined} />
                {cedulaRepetida
                  ? <small style={{ color: 'var(--danger)' }}>
                      Esa cédula ya es de <strong>{cedulaRepetida.nombre} {cedulaRepetida.apellido}</strong>
                      {cedulaRepetida.activo ? '' : ' (inactiva)'}. No se puede repetir.
                    </small>
                  : <small className="muted">No se puede repetir: identifica a la persona.</small>}
              </div>
              <div className="form-row">
                <label>RIF</label>
                <input className="input mono" name="p-rif" value={rif}
                  onChange={(e) => setRif(sanitizarRif(e.target.value))}
                  placeholder="V-12345678-9" maxLength={13}
                  style={rifMalEscrito ? { borderColor: 'var(--warning)' } : undefined} />
                {rifMalEscrito
                  ? <small style={{ color: 'var(--warning)' }}>Ese RIF no pasa el dígito verificador: revisalo. Igual se guarda.</small>
                  : <small className="muted">Es otro dato que la cédula. Va en la constancia y en la nómina.</small>}
              </div>
              <ComboConAgregar
                label="Cargo" valor={form.cargo ?? ''} opciones={cargos}
                onChange={(v) => setForm((f) => ({ ...f, cargo: v }))}
                hint="Elegí de la lista o agregá uno nuevo (queda guardado)." />
              <ComboConAgregar
                label="Departamento" valor={form.departamento ?? ''} opciones={departamentos}
                onChange={(v) => setForm((f) => ({ ...f, departamento: v }))}
                hint="Toma los de Usuarios; podés agregar uno nuevo." />
              <div className="form-row">
                <label>Sueldo base mensual (USD)</label>
                {editId ? (
                  /* En un registro que ya existe el sueldo NO se toca acá: cambiarlo
                     lleva motivo y queda en el historial, y eso vive en 💵. Si fuera
                     editable, el campo mentiría: lo que se escriba no se guarda. */
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="input mono" name="p-sueldo" readOnly tabIndex={-1}
                      value={Number(form.sueldo_base) || 0} style={{ maxWidth: 140, opacity: .75 }} />
                    {canWrite && (
                      <button type="button" className="btn btn-sm btn-ghost"
                        onClick={() => { const p = lista.find((x) => x.id === editId); if (p) { cerrarForm(); setSueldoPersona(p); } }}>
                        💵 Cambiar sueldo
                      </button>
                    )}
                  </div>
                ) : (
                  <input className="input mono" name="p-sueldo" type="number" min={0} step="any"
                    defaultValue={form.sueldo_base ?? 0} placeholder="0,00" />
                )}
                <small className="muted">
                  {editId
                    ? 'Se cambia desde 💵, con motivo, y queda en el historial.'
                    : 'Es el sueldo de alta: abre el historial de esta persona.'}
                </small>
              </div>
              <div className="form-row"><label>Fecha de ingreso</label><input className="input" type="date" value={form.fecha_ingreso ?? ''} onChange={(e) => setForm((f) => ({ ...f, fecha_ingreso: e.target.value }))} /></div>
              <div className="form-row"><label>Teléfono</label><input className="input" name="p-telefono" defaultValue={form.telefono ?? ''} placeholder="0412-1234567" inputMode="tel" /></div>
              <div className="form-row"><label>Contacto de emergencia (nombre)</label><input className="input" name="p-contacto-emergencia" defaultValue={form.contacto_emergencia ?? ''} placeholder="Ej. María Pérez (madre)" /></div>
              <div className="form-row"><label>Teléfono de emergencia</label><input className="input" name="p-telefono-emergencia" defaultValue={form.telefono_emergencia ?? ''} placeholder="0414-7654321" inputMode="tel" /></div>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.35rem' }}>📇 El <strong>teléfono</strong> y el <strong>contacto de emergencia</strong> se incluyen en el <strong>QR del carnet</strong> (botón 🪪 en la lista).</small>

            <div className="divider" />
            <div className="card-title" style={{ marginBottom: '.5rem' }}>📎 Documentación</div>
            <DocumentacionPersona
              personalId={editId}
              canWrite={canWrite}
              pendientes={docsPendientes}
              onPendiente={elegirDocPendiente}
              onCambio={cargarDocs}
              compacto
            />
            <small className="muted" style={{ display: 'block', marginTop: '.5rem' }}>El sueldo base es <strong>mensual</strong>; la quincena = 15 días (mitad). Queda guardado para precargar la nómina. Cada cambio posterior <strong>lleva motivo</strong> y queda en el <strong>historial de sueldo</strong> (botón 💵 en la lista).</small>
          </form>
        </Modal>
      )}

      {docsPersona && (
        <Modal title={`Documentación · ${docsPersona.nombre} ${docsPersona.apellido ?? ''}`.trim()} size="md"
          onClose={() => setDocsPersona(null)}
          footer={<button className="btn btn-ghost" onClick={() => setDocsPersona(null)}>Cerrar</button>}>
          <DocumentacionPersona personalId={docsPersona.id} canWrite={canWrite} onCambio={cargarDocs} />
        </Modal>
      )}
      {sueldoPersona && (
        <HistorialSueldoModal
          persona={sueldoPersona}
          canWrite={canWrite}
          isAdmin={isAdmin}
          onClose={() => setSueldoPersona(null)}
          onCambio={() => { void recargar(); }}
        />
      )}
      {histPersona && <HistoricoPersonaModal persona={histPersona} onClose={() => setHistPersona(null)} />}
      {carnetPersona && <CarnetModal persona={carnetPersona} canWrite={canWrite} onClose={() => setCarnetPersona(null)} onFotoCambio={() => void recargar()} />}
      {constanciaPersona && <ConstanciaModal persona={constanciaPersona} onClose={() => setConstanciaPersona(null)} />}
    </div>
  );
}

/* ───────── Constancia de trabajo (PDF · vista previa) ───────── */
function ConstanciaModal({ persona, onClose }: { persona: Personal; onClose: () => void }) {
  const [dirigidoA, setDirigidoA] = useState('A quien pueda interesar:');
  const [lugar, setLugar] = useState('Puerto Ordaz, Estado Bolívar');
  const [incluirSalario, setIncluirSalario] = useState(Number(persona.sueldo_base) > 0);
  const [firmante, setFirmante] = useState<FirmanteConstancia>('rrhh');
  const [generando, setGenerando] = useState(false);

  const faltan = [
    !persona.cedula ? 'cédula' : '',
    !persona.cargo ? 'cargo' : '',
    !persona.fecha_ingreso ? 'fecha de ingreso' : '',
  ].filter(Boolean);

  async function generar() {
    setGenerando(true);
    try {
      await descargarConstanciaTrabajoPdf({ persona, dirigidoA, lugar, incluirSalario, firmante });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo generar la constancia', 'error');
    } finally { setGenerando(false); }
  }

  return (
    <Modal
      title={`Constancia de trabajo · ${persona.nombre} ${persona.apellido ?? ''}`.trim()}
      size="md"
      onClose={() => { if (!generando) onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={generando}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void generar()} disabled={generando}>
            {generando ? 'Generando…' : '📄 Generar (vista previa)'}
          </button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.7rem' }}>
        Carta formal que hace constar que <strong>{persona.nombre} {persona.apellido}</strong> presta servicios en la
        empresa: cargo{persona.departamento ? ', departamento' : ''}, fecha de ingreso y (opcional) el salario.
      </div>

      {faltan.length > 0 && (
        <div className="aviso warning" style={{ marginBottom: '.7rem' }}>
          <span className="aviso-icono">⚠️</span>
          <div>
            A esta persona le falta cargar: <strong>{faltan.join(', ')}</strong>. La constancia se genera igual (con «—»),
            pero conviene completarla en <strong>✎ Editar</strong> para que quede formal.
          </div>
        </div>
      )}

      <div className="form-row">
        <label>Dirigida a</label>
        <input className="input" value={dirigidoA} onChange={(e) => setDirigidoA(e.target.value)} placeholder="A quien pueda interesar:" />
      </div>
      <div className="form-row">
        <label>Lugar de expedición</label>
        <input className="input" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Puerto Ordaz, Estado Bolívar" />
      </div>
      <div className="form-row">
        <label>Firma al pie</label>
        <select className="select" value={firmante} onChange={(e) => setFirmante(e.target.value as FirmanteConstancia)}>
          <option value="rrhh">Jefa de Recursos Humanos · firma y sello a mano</option>
          <option value="leydis">LEYDIS RENGEL · Jefa de Administración</option>
          <option value="gerente">JESÚS LOZADA · Gerente General</option>
          <option value="ninguna">Sin firma (línea para firmar a mano)</option>
        </select>
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', cursor: 'pointer', marginTop: '.3rem' }}>
        <input type="checkbox" checked={incluirSalario} onChange={(e) => setIncluirSalario(e.target.checked)} />
        Incluir el salario mensual {Number(persona.sueldo_base) > 0 ? `(${money(persona.sueldo_base)} USD)` : '(sin sueldo cargado)'}
      </label>
    </Modal>
  );
}

/* ───────── Foto de la persona dentro del formulario ─────────
   Hasta ahora la foto solo se podía tocar desde el carnet (🪪), que es el lugar
   donde se VE pero no donde se edita la ficha: quien entraba a ✎ Editar a
   completar los datos no tenía cómo ponerle la cara a la persona. */
function FotoPersonaCard({ preview, tieneFoto, ocupada, pendiente, onElegir, onQuitar }: {
  preview: string | null;
  tieneFoto: boolean;
  ocupada: boolean;
  /** La foto todavía no subió: sube al guardar el registro nuevo. */
  pendiente: boolean;
  onElegir: (file: File) => void;
  onQuitar: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="card" style={{ marginBottom: '.7rem', display: 'flex', gap: '.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{
        width: 84, height: 104, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        border: '2px solid var(--brand, #ff8a00)', background: 'var(--bg-soft, rgba(127,127,127,.08))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {preview
          ? <img src={preview} alt="Foto de la persona" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span className="muted" style={{ fontSize: '1.8rem' }}>👤</span>}
      </div>
      <div style={{ flex: '1 1 220px' }}>
        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>Foto</div>
        <div className="muted" style={{ fontSize: '.76rem', marginBottom: '.45rem' }}>
          Va en el frente del carnet. Imagen de hasta 5 MB; conviene vertical, tipo carnet.
          {pendiente && <> <strong>Se sube al guardar el registro.</strong></>}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onElegir(file);
            }} />
          <button type="button" className="btn btn-sm btn-primary" disabled={ocupada} onClick={() => fileRef.current?.click()}>
            {ocupada ? 'Cargando…' : tieneFoto ? '🖼 Cambiar foto' : '🖼 Cargar foto'}
          </button>
          {tieneFoto && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
              disabled={ocupada} onClick={onQuitar}>🗑 Quitar</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── Carnet con QR + foto (imagen PNG, 54×86 mm @ 300 DPI) ───────── */
function CarnetModal({ persona, canWrite, onClose, onFotoCambio }: {
  persona: Personal; canWrite: boolean; onClose: () => void; onFotoCambio: () => void;
}) {
  const [fotoPath, setFotoPath] = useState<string | null>(persona.foto_path ?? null);
  const [frente, setFrente] = useState<string | null>(null);
  const [reverso, setReverso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Regenera frente (con la foto actual) y reverso cada vez que cambia la foto.
  useEffect(() => {
    let cancel = false;
    setFrente(null); setReverso(null); setError(null);
    (async () => {
      try {
        const fotoData = fotoPath ? await fotoPersonalDataUrl(fotoPath).catch(() => null) : null;
        const [f, r] = await Promise.all([
          generarCarnetPersonalDataUrl({ ...persona, foto_path: fotoPath }, fotoData),
          generarCarnetReversoDataUrl(),
        ]);
        if (!cancel) { setFrente(f); setReverso(r); }
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : 'No se pudo generar el carnet');
      }
    })();
    return () => { cancel = true; };
  }, [persona, fotoPath]);

  function descargar(dataUrl: string | null, cara: 'frente' | 'reverso') {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = nombreArchivoCarnet(persona, cara);
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function onElegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file) return;
    setSubiendo(true); setError(null);
    try {
      const nuevo = await subirFotoPersonal(persona.id, file, fotoPath);
      setFotoPath(nuevo);
      onFotoCambio();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir la foto'); }
    finally { setSubiendo(false); }
  }

  async function quitarFoto() {
    if (!fotoPath) return;
    if (!window.confirm('¿Quitar la foto de esta persona?')) return;
    setSubiendo(true); setError(null);
    try {
      await borrarFotoPersonal(persona.id, fotoPath);
      setFotoPath(null);
      onFotoCambio();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo quitar la foto'); }
    finally { setSubiendo(false); }
  }

  const imgStyle: CSSProperties = { width: 240, maxWidth: '100%', height: 'auto', borderRadius: 12, boxShadow: 'var(--shadow-md)' };

  return (
    <Modal
      title={`Carnet · ${persona.nombre} ${persona.apellido}`}
      size="lg"
      onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      {error && <div className="aviso danger" style={{ marginBottom: '.6rem' }}><span className="aviso-icono">⛔</span><div><strong>Error:</strong> {error}</div></div>}

      {canWrite && (
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onElegirFoto} />
          <button className="btn btn-sm btn-primary" disabled={subiendo} onClick={() => fileRef.current?.click()}>
            {subiendo ? 'Subiendo…' : fotoPath ? '🖼 Cambiar foto' : '🖼 Añadir foto'}
          </button>
          {fotoPath && <button className="btn btn-sm btn-danger" disabled={subiendo} onClick={quitarFoto}>🗑 Quitar foto</button>}
          <span className="muted" style={{ fontSize: '.76rem' }}>La foto va en el frente del carnet. Máx. 5 MB.</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.3rem', fontWeight: 700 }}>FRENTE</div>
          {frente ? <img src={frente} alt="Frente del carnet" style={imgStyle} /> : <p className="muted">Generando…</p>}
          <div style={{ marginTop: '.4rem' }}>
            <button className="btn btn-sm btn-ghost" disabled={!frente} onClick={() => descargar(frente, 'frente')}>⬇ Frente (PNG)</button>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="muted" style={{ fontSize: '.75rem', marginBottom: '.3rem', fontWeight: 700 }}>REVERSO</div>
          {reverso ? <img src={reverso} alt="Reverso del carnet" style={imgStyle} /> : <p className="muted">Generando…</p>}
          <div style={{ marginTop: '.4rem' }}>
            <button className="btn btn-sm btn-ghost" disabled={!reverso} onClick={() => descargar(reverso, 'reverso')}>⬇ Reverso (PNG)</button>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '.78rem', marginTop: '.8rem', textAlign: 'center' }}>
        54 × 86 mm · 300 DPI (638 × 1016 px) · imágenes PNG listas para imprimir.
        {!persona.telefono && !persona.contacto_emergencia && ' Cargá el teléfono y el contacto de emergencia (✎ Editar) para que el QR los incluya.'}
      </p>
    </Modal>
  );
}

/* ───────── Combo estilizado (select del sistema) con opción de agregar nuevo ───────── */
function ComboConAgregar({ label, valor, opciones, onChange, hint }: {
  label: string; valor: string; opciones: string[]; onChange: (v: string) => void; hint?: string;
}) {
  const [agregando, setAgregando] = useState(false);
  // Input NO controlado: el valor se lee del DOM (ref) al confirmar, nunca del estado.
  // Así un re-render del realtime no puede "cortar" lo que se está tecleando.
  const nuevoRef = useRef<HTMLInputElement>(null);
  // Si el valor actual no está en el catálogo (p. ej. al editar), lo incluimos.
  const opts = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones;
  function confirmar() {
    const v = (nuevoRef.current?.value ?? '').trim();
    if (v) onChange(v);
    setAgregando(false);
  }
  return (
    <div className="form-row">
      <label>{label}</label>
      {agregando ? (
        <div style={{ display: 'flex', gap: '.3rem' }}>
          <input className="input" autoFocus name="combo-nuevo" ref={nuevoRef} defaultValue="" autoComplete="off"
            placeholder={`Nuevo ${label.toLowerCase()}…`}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } if (e.key === 'Escape') setAgregando(false); }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={confirmar} title="Agregar">✓</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAgregando(false)} title="Cancelar">✕</button>
        </div>
      ) : (
        <select className="select" value={valor}
          onChange={(e) => { if (e.target.value === '__nuevo__') setAgregando(true); else onChange(e.target.value); }}>
          <option value="">— elegir —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__nuevo__">+ Agregar nuevo…</option>
        </select>
      )}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

/* ───────── Histórico de pagos individuales de una persona ───────── */
function HistoricoPersonaModal({ persona, onClose }: { persona: Personal; onClose: () => void }) {
  const [rows, setRows] = useState<NominaRenglon[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listHistoricoPersona(persona.id).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [persona.id]);

  const pagados = rows.filter((r) => r.estado === 'pagada');
  const totalPagado = pagados.reduce((a, r) => a + (Number(r.neto_usd) || 0), 0);

  return (
    <Modal title={`Histórico de pagos · ${persona.nombre} ${persona.apellido}`} size="lg" onClose={onClose} footer={
      <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
    }>
      <div className="muted" style={{ marginBottom: '.5rem', fontSize: '.85rem' }}>
        {pagados.length} pago(s) · Total pagado <strong className="mono">{money(totalPagado)}</strong>
      </div>
      <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.82rem' }}>
          <thead><tr><th>Nómina</th><th>Período</th><th style={{ textAlign: 'right' }}>Días</th><th style={{ textAlign: 'right' }}>Neto</th><th style={{ textAlign: 'center' }}>Estado</th><th>Pagada</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={6}><EmptyState message="Sin pagos registrados" /></td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.periodo?.codigo ?? '—'}</td>
                <td className="muted">{r.periodo?.periodo_desde ? `${date(r.periodo.periodo_desde)} → ${date(r.periodo.periodo_hasta)}` : '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.dias_trabajados}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{money(r.neto_usd)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge" style={{ color: r.estado === 'pagada' ? 'var(--success)' : 'var(--warning)' }}>{r.estado === 'pagada' ? 'Pagada' : 'Por pagar'}</span>
                </td>
                <td className="muted">{r.pagada_en ? dateTime(r.pagada_en) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
