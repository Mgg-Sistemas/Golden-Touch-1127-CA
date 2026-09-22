import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ChangeEvent, type CSSProperties } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { FechaInput } from '@/shared/ui/FechaInput';
import { EmptyState } from '@/shared/ui/EmptyState';
import { toast } from '@/shared/ui/Toast';
import { money, date, dateTime } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import type { Personal, NominaRenglon } from '@/shared/lib/types';
import { formatearRif, normalizarRif, rifValido } from '@/shared/lib/rif';
import {
  listPersonal, crearPersonal, actualizarPersonal, setPersonalActivo, eliminarPersonal, type PersonalInput,
  subirFotoPersonal, borrarFotoPersonal, fotoPersonalDataUrl,
  resumenBorradoPersonal, type ResumenBorradoPersonal,
} from './personal.repository';
import { DocumentacionPersona, type DocsPendientes } from './DocumentacionPersona';
import { listDocumentosDeTodos, subirDocumentoPersonal, TIPOS_DOCUMENTO } from './documentos.repository';
import type { EmpresaRrhh, PersonalDocumento, PersonalFamiliar, TipoDocumento } from '@/shared/lib/types';
import { CargaFamiliarPersona } from './CargaFamiliarPersona';
import { FichaTecnicaPersonal } from './FichaTecnicaPersonal';
import { agregarFamiliar, listFamiliaresDeTodos, type FamiliarInput } from './familiares.repository';
import {
  CRITERIOS_GRUPO, ESTADOS_CIVILES, FILTROS_VACIOS, GENEROS, GRUPOS_SANGUINEOS, PARENTESCOS,
  labelParentesco,
  agruparPersonal, antiguedad, edad, filtrarPersonal, hayFiltros, labelEmpresa,
  opcionesDe, resumenPersonal, type CriterioGrupo, type FiltrosPersonal,
} from './fichaPersonal';
import { listHistoricoPersona } from './nomina.repository';
import {
  listCargos, listDepartamentos, listNacionalidades, addCargo, addDepartamento, addNacionalidad,
} from './catalogos';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { generarCarnetPersonalDataUrl, generarCarnetReversoDataUrl, nombreArchivoCarnet } from './carnetPersonal';
import { descargarConstanciaTrabajoPdf, type FirmanteConstancia } from './constanciaTrabajoPdf';
import { HistorialSueldoModal } from './HistorialSueldoModal';
import { usePermissions } from '@/modules/auth/PermissionsContext';

const VACIO: PersonalInput = {
  nombre: '', apellido: '', cedula: '', rif: '', cargo: '', departamento: '', sueldo_base: 0,
  fecha_ingreso: '', telefono: '', contacto_emergencia: '', telefono_emergencia: '',
  fecha_nacimiento: '', genero: null, estado_civil: null, grupo_sanguineo: null,
  nacionalidad: '', direccion: '', contacto_emergencia_parentesco: null,
};

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

/**
 * Pone en palabras lo que se va en cascada al borrar a una persona, y deja
 * afuera lo que está en cero: un renglón «0 documentos» no informa nada y tapa
 * a los tres que sí hay que leer antes de apretar el botón.
 */
function detalleCascada(r: ResumenBorradoPersonal): string[] {
  const linea = (n: number, uno: string, varios: string) => (n > 0 ? `${n} ${n === 1 ? uno : varios}` : null);
  return [
    linea(r.documentos, 'documento', 'documentos'),
    linea(r.familiares, 'familiar de la carga familiar', 'familiares de la carga familiar'),
    linea(r.sueldos, 'renglón del historial de sueldo', 'renglones del historial de sueldo'),
    linea(r.anticipos, 'anticipo/préstamo', 'anticipos/préstamos'),
    linea(r.eventos,
      'registro administrativo (vacaciones, permisos, utilidades, notas)',
      'registros administrativos (vacaciones, permisos, utilidades, notas)'),
  ].filter((x): x is string => x !== null);
}

export function PersonalTab({ empresa, canWrite, actor }: { empresa: EmpresaRrhh; canWrite: boolean; actor: string }) {
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
  const [nacionalidades, setNacionalidades] = useState<string[]>([]);
  // El contacto de emergencia se elige de la carga familiar; si es alguien de
  // afuera, este interruptor pasa a un campo libre.
  const [contactoLibre, setContactoLibre] = useState(false);
  // Foto dentro del formulario. En un registro que YA existe se sube y se borra
  // en el momento (es un archivo, no un campo del formulario). En uno nuevo
  // todavía no hay a qué asociarla, así que queda pendiente y sube al guardar.
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoPendiente, setFotoPendiente] = useState<File | null>(null);
  const [fotoOcupada, setFotoOcupada] = useState(false);
  // Quitar la foto del formulario borra el archivo del servidor: se pregunta antes.
  const [confirmarQuitarFoto, setConfirmarQuitarFoto] = useState(false);
  // A quién se está por eliminar, y el conteo de lo que se va en cascada con esa
  // persona. `estadoResumen` separa «todavía no llegó» de «no se pudo contar»:
  // son dos avisos distintos, y decir 0 cuando no se sabe sería mentir.
  const [porBorrar, setPorBorrar] = useState<Personal | null>(null);
  const [resumenBorrado, setResumenBorrado] = useState<ResumenBorradoPersonal | null>(null);
  const [estadoResumen, setEstadoResumen] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [fotoPorBorrar, setFotoPorBorrar] = useState<string | null>(null);
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
  const [fichaPersona, setFichaPersona] = useState<Personal | null>(null);
  // Carga familiar: de acá sale poder agrupar por «con hijos / sin hijos».
  const [familiares, setFamiliares] = useState<Map<string, PersonalFamiliar[]>>(new Map());
  const [famPendientes, setFamPendientes] = useState<FamiliarInput[]>([]);
  // Filtros y agrupación de la lista.
  const [filtros, setFiltros] = useState<FiltrosPersonal>(FILTROS_VACIOS);
  const [grupo, setGrupo] = useState<CriterioGrupo>('ninguno');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Campos de texto NO controlados (DOM = fuente de verdad): inmunes a re-renders
  // que de otro modo "cortan" lo tecleado. Se leen del DOM al guardar.
  const formRef = useRef<HTMLFormElement>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    try { setLista(await listPersonal(false, empresa)); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo cargar el personal', 'error'); }
    finally { setLoading(false); }
  }, [empresa]);
  const cargarCatalogos = useCallback(() => {
    listCargos().then(setCargos).catch(() => { /* catálogo opcional */ });
    listNacionalidades().then(setNacionalidades).catch(() => { /* catálogo opcional */ });
    listDepartamentos().then(setDepartamentos).catch(() => { /* catálogo opcional */ });
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  const cargarFamiliares = useCallback(() => {
    // Si falla, la lista se muestra igual: la carga familiar enriquece, no condiciona.
    listFamiliaresDeTodos().then(setFamiliares).catch(() => setFamiliares(new Map()));
  }, []);
  useEffect(() => { cargarFamiliares(); }, [cargarFamiliares]);
  useRealtime(['personal_familiares'], () => { cargarFamiliares(); });

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
  function limpiarDocs() { setDocsPendientes({}); setFamPendientes([]); }

  // Lo que se ve: primero el recorte de los filtros, después la agrupación.
  // Las tarjetas cuentan sobre lo FILTRADO, así dicen lo mismo que se está viendo.
  const visibles = useMemo(
    () => filtrarPersonal(lista, filtros, familiares),
    [lista, filtros, familiares],
  );
  const resumen = useMemo(() => resumenPersonal(visibles, familiares), [visibles, familiares]);
  const grupos = useMemo(() => agruparPersonal(visibles, grupo, familiares), [visibles, grupo, familiares]);
  const deptos = useMemo(() => opcionesDe(lista, 'departamento'), [lista]);
  const cargosLista = useMemo(() => opcionesDe(lista, 'cargo'), [lista]);
  const filtrando = hayFiltros(filtros);

  /** ¿Otra persona ya tiene esa cédula? Se mira sobre la lista ya cargada. */
  const cedulaRepetida = useMemo(() => {
    const c = claveCedula(cedula);
    if (!c) return null;
    return lista.find((p) => p.id !== editId && claveCedula(p.cedula) === c) ?? null;
  }, [cedula, lista, editId]);

  const rifMalEscrito = !!rif.trim() && !rifValido(rif);

  // A quién se puede elegir como contacto de emergencia: la carga familiar de
  // esta persona (la ya guardada y, en el alta, la que todavía no se guardó).
  const familiaDeEste = useMemo(() => [
    ...(editId ? familiares.get(editId) ?? [] : []).map((x) => ({ nombre: x.nombre, parentesco: x.parentesco })),
    ...famPendientes.map((x) => ({ nombre: x.nombre, parentesco: x.parentesco })),
  ], [editId, familiares, famPendientes]);

  const opcionesContacto = useMemo(() => {
    const opts = familiaDeEste
      .filter((x) => x.nombre.trim())
      .map((x) => ({ value: x.nombre, label: `${x.nombre} · ${labelParentesco(x.parentesco)}` }));
    // El contacto guardado que NO está en la carga familiar (alguien de afuera)
    // igual tiene que aparecer elegido, o se perdería al abrir la ficha.
    const actual = (form.contacto_emergencia ?? '').trim();
    if (actual && !opts.some((o) => o.value === actual)) {
      opts.unshift({ value: actual, label: `${actual} · fuera de la carga familiar` });
    }
    return opts;
  }, [familiaDeEste, form.contacto_emergencia]);

  const parentescoDe = (nombre: string) =>
    familiaDeEste.find((x) => x.nombre === nombre)?.parentesco ?? null;

  function abrirNuevo() { setEditId(null); setForm(VACIO); setCedula(''); setRif(''); setError(null); limpiarFoto(); limpiarDocs(); setFormOpen(true); }
  function editar(p: Personal) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, apellido: p.apellido, cedula: p.cedula ?? '', rif: p.rif ?? '',
      cargo: p.cargo ?? '', departamento: p.departamento ?? '', sueldo_base: Number(p.sueldo_base) || 0,
      fecha_ingreso: p.fecha_ingreso ?? '', telefono: p.telefono ?? '',
      contacto_emergencia: p.contacto_emergencia ?? '', telefono_emergencia: p.telefono_emergencia ?? '',
      fecha_nacimiento: p.fecha_nacimiento ?? '', genero: p.genero ?? null,
      estado_civil: p.estado_civil ?? null, grupo_sanguineo: p.grupo_sanguineo ?? null,
      nacionalidad: p.nacionalidad ?? '', direccion: p.direccion ?? '',
      contacto_emergencia_parentesco: p.contacto_emergencia_parentesco ?? null,
    });
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

  /** El botón 🗑 de la foto. Si la foto todavía no subió, no hay nada que confirmar. */
  function pedirQuitarFoto() {
    setError(null);
    if (!editId || !fotoPath) { setFotoPendiente(null); setFotoPreview(null); return; }
    setConfirmarQuitarFoto(true);
  }

  async function quitarFotoForm() {
    setConfirmarQuitarFoto(false);
    setError(null);
    if (!editId || !fotoPath) { setFotoPendiente(null); setFotoPreview(null); return; }
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
    // Si el input NO está en el DOM, esto devolvía '' y el campo terminaba
    // borrado en la base sin que nadie se enterara. Ahora se rompe acá, que es
    // donde se puede ver, en vez de romper el dato del trabajador.
    const faltantes: string[] = [];
    const val = (name: string) => {
      const el = root?.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
      if (!el) { faltantes.push(name); return ''; }
      return el.value;
    };
    const datos: PersonalInput = {
      ...form,
      nombre: val('p-nombre').trim(),
      apellido: val('p-apellido').trim(),
      cedula: sanitizarCedula(cedula),
      rif: rif.trim() ? sanitizarRif(rif) : null,
      sueldo_base: Number(val('p-sueldo')) || 0,
      // Nacionalidad y contacto ya no son inputs sueltos (lista agregable y
      // lista buscable): su valor vive en el estado, no en el DOM.
      nacionalidad: (form.nacionalidad ?? '').trim().toUpperCase() || null,
      direccion: val('p-direccion').trim().toUpperCase() || null,
      telefono: val('p-telefono').trim(),
      contacto_emergencia: (form.contacto_emergencia ?? '').trim(),
      telefono_emergencia: val('p-telefono-emergencia').trim(),
    };
    if (faltantes.length) {
      // No se guarda nada: es preferible un error raro a un borrado silencioso.
      setError(`No se pudo leer ${faltantes.join(', ')} del formulario. No se guardó nada; avisá al equipo del sistema.`);
      return;
    }
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
        const creada = await crearPersonal({ ...datos, empresa }, actor);
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
        // La carga familiar elegida antes de que el registro existiera.
        for (const fam of famPendientes) {
          try { await agregarFamiliar(creada.id, fam, actor); }
          catch { toast(`Se guardó el registro, pero ${fam.nombre} no se pudo agregar a la carga familiar.`, 'error'); }
        }
        cargarFamiliares();
      }
      // Si el cargo/departamento es nuevo, lo agregamos al catálogo compartido.
      const cargo = (datos.cargo ?? '').trim();
      const depto = (datos.departamento ?? '').trim();
      const nac = (datos.nacionalidad ?? '').trim();
      if (nac && !nacionalidades.includes(nac)) await addNacionalidad(nac, actor).catch(() => {});
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
    setPorBorrar(null);
    try { await eliminarPersonal(p.id); await recargar(); toast('Eliminado', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error'); }
  }

  // Lo que hay que tipear para habilitar el borrado: el apellido, y si no lo
  // tiene cargado, el nombre completo. Nunca vacío: una caja vacía habilitaría
  // el botón sola y el paso dejaría de frenar nada.
  const textoParaBorrar = porBorrar
    ? (porBorrar.apellido ?? '').trim() || `${porBorrar.nombre} ${porBorrar.apellido ?? ''}`.trim()
    : '';
  const cascada = resumenBorrado ? detalleCascada(resumenBorrado) : [];

  // El conteo de lo que se borra en cascada se pide recién al abrir la
  // confirmación: es una consulta por persona, no tiene por qué correr para
  // toda la lista solo por si acaso.
  useEffect(() => {
    if (!porBorrar) return;
    let cancel = false;
    setResumenBorrado(null);
    setEstadoResumen('cargando');
    setFotoPorBorrar(null);
    resumenBorradoPersonal(porBorrar.id).then((r) => {
      if (cancel) return;
      if (r) { setResumenBorrado(r); setEstadoResumen('listo'); }
      else setEstadoResumen('error');
    });
    // La foto es de ayuda para reconocer a la persona; si no se puede bajar, el
    // recuadro se muestra igual con los datos.
    if (porBorrar.foto_path) {
      fotoPersonalDataUrl(porBorrar.foto_path)
        .then((d) => { if (!cancel) setFotoPorBorrar(d); })
        .catch(() => { /* sin foto en la vista previa */ });
    }
    return () => { cancel = true; };
  }, [porBorrar]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.7rem' }}>
        <div className="card-title" style={{ margin: 0 }}>
          {labelEmpresa(empresa)}
          <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            {' '}· {filtrando ? `${visibles.length} de ${lista.length}` : `${lista.length}`} persona(s)
          </span>
        </div>
        {canWrite && <button className="btn btn-primary" onClick={abrirNuevo}>+ Ingresar Registro de Personal</button>}
      </div>

      {/* Las tarjetas cuentan sobre lo que se está VIENDO: si hay un filtro puesto,
          acompañan. Tocar una es otra forma de filtrar. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', marginBottom: '.7rem' }}>
        <TarjetaRrhh titulo="Personal" valor={resumen.total}
          marcada={!filtrando} onClick={() => setFiltros(FILTROS_VACIOS)} ayuda="Ver todo el personal" />
        <TarjetaRrhh titulo="👨 Hombres" valor={resumen.hombres}
          marcada={filtros.genero === 'M'} onClick={() => setFiltros((x) => ({ ...x, genero: x.genero === 'M' ? '' : 'M' }))}
          ayuda="Ver solo los hombres" />
        <TarjetaRrhh titulo="👩 Mujeres" valor={resumen.mujeres}
          marcada={filtros.genero === 'F'} onClick={() => setFiltros((x) => ({ ...x, genero: x.genero === 'F' ? '' : 'F' }))}
          ayuda="Ver solo las mujeres" />
        <TarjetaRrhh titulo="✅ Activos" valor={resumen.activos} tono={resumen.activos ? 'ok' : undefined}
          marcada={filtros.estado === 'activos'}
          onClick={() => setFiltros((x) => ({ ...x, estado: x.estado === 'activos' ? 'todos' : 'activos' }))}
          ayuda="Ver solo los activos" />
        <TarjetaRrhh titulo="⏸ Inactivos" valor={resumen.inactivos} tono={resumen.inactivos ? 'alerta' : undefined}
          marcada={filtros.estado === 'inactivos'}
          onClick={() => setFiltros((x) => ({ ...x, estado: x.estado === 'inactivos' ? 'todos' : 'inactivos' }))}
          ayuda="Ver solo los inactivos" />
        <TarjetaRrhh titulo="👨‍👩‍👦 Con hijos" valor={resumen.conHijos}
          marcada={filtros.conHijos === 'si'}
          onClick={() => setFiltros((x) => ({ ...x, conHijos: x.conHijos === 'si' ? 'todos' : 'si' }))}
          ayuda="Ver solo quienes tienen hijos cargados" />
        <TarjetaRrhh titulo="Solteros" valor={resumen.solteros}
          marcada={filtros.estadoCivil === 'soltero'}
          onClick={() => setFiltros((x) => ({ ...x, estadoCivil: x.estadoCivil === 'soltero' ? '' : 'soltero' }))}
          ayuda="Ver solo los solteros" />
        <TarjetaRrhh titulo="Sin género cargado" valor={resumen.sinGenero}
          ayuda="A esta gente le falta el dato de género en su ficha" />
      </div>

      {/* Búsqueda y agrupación siempre a mano; el resto de los filtros, plegados. */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar por nombre, cédula, cargo, ficha…"
          value={filtros.texto ?? ''} onChange={(e) => setFiltros((x) => ({ ...x, texto: e.target.value }))} />
        <select className="input" style={{ maxWidth: 200 }} value={grupo}
          onChange={(e) => setGrupo(e.target.value as CriterioGrupo)} title="Agrupar la lista">
          {CRITERIOS_GRUPO.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
        </select>
        <button className="btn btn-sm btn-ghost" onClick={() => setFiltrosAbiertos((v) => !v)}>
          {filtrosAbiertos ? '▴ Menos filtros' : '▾ Más filtros'}
        </button>
        {filtrando && (
          <button className="btn btn-sm btn-ghost" onClick={() => setFiltros(FILTROS_VACIOS)}
            title="Sacar todos los filtros">✕ Limpiar</button>
        )}
      </div>

      {filtrosAbiertos && (
        <div className="card" style={{ padding: '.7rem', marginBottom: '.6rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.5rem' }}>
            <div className="form-row">
              <label>Departamento</label>
              <select className="input" value={filtros.departamento ?? ''}
                onChange={(e) => setFiltros((x) => ({ ...x, departamento: e.target.value }))}>
                <option value="">Todos</option>
                {deptos.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Cargo</label>
              <select className="input" value={filtros.cargo ?? ''}
                onChange={(e) => setFiltros((x) => ({ ...x, cargo: e.target.value }))}>
                <option value="">Todos</option>
                {cargosLista.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Género</label>
              <select className="input" value={filtros.genero ?? ''}
                onChange={(e) => setFiltros((x) => ({ ...x, genero: e.target.value }))}>
                <option value="">Todos</option>
                {GENEROS.map((g) => <option key={g.valor} value={g.valor}>{g.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Estado civil</label>
              <select className="input" value={filtros.estadoCivil ?? ''}
                onChange={(e) => setFiltros((x) => ({ ...x, estadoCivil: e.target.value }))}>
                <option value="">Todos</option>
                {ESTADOS_CIVILES.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Estado</label>
              <select className="input" value={filtros.estado ?? 'todos'}
                onChange={(e) => setFiltros((x) => ({ ...x, estado: e.target.value as FiltrosPersonal['estado'] }))}>
                <option value="todos">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </div>
            <div className="form-row">
              <label>Hijos</label>
              <select className="input" value={filtros.conHijos ?? 'todos'}
                onChange={(e) => setFiltros((x) => ({ ...x, conHijos: e.target.value as FiltrosPersonal['conHijos'] }))}>
                <option value="todos">Todos</option>
                <option value="si">Con hijos</option>
                <option value="no">Sin hijos</option>
              </select>
            </div>
            <div className="form-row">
              <label>Foto</label>
              <select className="input" value={filtros.conFoto ?? 'todos'}
                onChange={(e) => setFiltros((x) => ({ ...x, conFoto: e.target.value as FiltrosPersonal['conFoto'] }))}>
                <option value="todos">Todos</option>
                <option value="si">Con foto</option>
                <option value="no">Sin foto</option>
              </select>
            </div>
            <div className="form-row">
              <label>Edad (años)</label>
              <div style={{ display: 'flex', gap: '.35rem' }}>
                <input className="input mono" type="number" min={0} max={110} placeholder="desde"
                  value={filtros.edadMin ?? ''} style={{ width: '50%' }}
                  onChange={(e) => setFiltros((x) => ({ ...x, edadMin: e.target.value === '' ? null : Number(e.target.value) }))} />
                <input className="input mono" type="number" min={0} max={110} placeholder="hasta"
                  value={filtros.edadMax ?? ''} style={{ width: '50%' }}
                  onChange={(e) => setFiltros((x) => ({ ...x, edadMax: e.target.value === '' ? null : Number(e.target.value) }))} />
              </div>
              <small className="muted">Quien no tenga fecha de nacimiento queda afuera del rango.</small>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead><tr><th>Persona</th><th>Departamento</th><th>Cargo</th><th style={{ textAlign: 'right' }}>Edad</th><th style={{ textAlign: 'right' }}>Sueldo base</th><th style={{ textAlign: 'center' }}>Estado</th><th style={{ textAlign: 'center' }}>Acciones</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center' }}>Cargando…</td></tr>}
            {!loading && !lista.length && <tr><td colSpan={7}><EmptyState message={`Sin personal en ${labelEmpresa(empresa)}. Usá “+ Ingresar Registro de Personal”.`} icon="👥" /></td></tr>}
            {!loading && !!lista.length && !visibles.length && (
              <tr><td colSpan={7}><EmptyState message="Ninguna persona entra en ese recorte." icon="🔍" /></td></tr>
            )}
            {!loading && grupos.map((g) => (
              <Fragment key={g.clave}>
                {/* Con la lista agrupada, cada grupo se anuncia con su nombre y
                    cuánta gente tiene: si no, se pierde de vista dónde empieza. */}
                {g.titulo && (
                  <tr>
                    <td colSpan={7} style={{
                      background: 'var(--surface-2)', fontWeight: 700, fontSize: '.78rem',
                      textTransform: 'uppercase', letterSpacing: '.05em',
                    }}>
                      {g.titulo} <span className="muted" style={{ fontWeight: 400 }}>· {g.gente.length}</span>
                    </td>
                  </tr>
                )}
                {g.gente.map((p) => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.55 }}>
                <td>
                  {/* El nombre abre la ficha para EDITARLA, que es a lo que se
                      entra el 90% de las veces. A quien solo tiene lectura no se
                      le abre un formulario que no va a poder guardar: se le
                      muestra la ficha técnica, que es la misma información. */}
                  <button className="btn-link"
                    title={canWrite ? 'Editar esta ficha' : 'Ver la ficha técnica'}
                    onClick={() => (canWrite ? editar(p) : setFichaPersona(p))}>
                    {p.nombre} {p.apellido}
                  </button>
                  {p.cedula ? <span className="muted"> · {p.cedula}</span> : null}
                  <div className="muted mono" style={{ fontSize: '.72rem' }}>
                    {p.ficha_nro ? `Ficha ${String(p.ficha_nro).padStart(4, '0')}` : ''}
                    {p.rif ? `${p.ficha_nro ? ' · ' : ''}RIF ${formatearRif(p.rif)}` : ''}
                  </div>
                </td>
                <td className="muted">{p.departamento || '—'}</td>
                <td className="muted">{p.cargo || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }} title={antiguedad(p.fecha_ingreso)?.texto ? `${antiguedad(p.fecha_ingreso)?.texto} en la empresa` : undefined}>
                  {edad(p.fecha_nacimiento) ?? '—'}
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{Number(p.sueldo_base) > 0 ? money(p.sueldo_base) : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge" style={{ color: p.activo ? 'var(--success)' : 'var(--muted)' }}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setDocsPersona(p)}
                    title="Documentación: RIF, cédula y CV"
                    style={(docsPorPersona.get(p.id) ?? 0) === TIPOS_DOCUMENTO.length ? { color: 'var(--success)' } : undefined}>
                    📎 {docsPorPersona.get(p.id) ?? 0}/{TIPOS_DOCUMENTO.length}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setFichaPersona(p)}
                    title="Ficha técnica (con PDF)">🗂</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setSueldoPersona(p)}
                    title="Historial de sueldo: de cuánto a cuánto, cuándo y por qué">💵</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setHistPersona(p)} title="Histórico de pagos">🧾</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setCarnetPersona(p)} title="Generar carnet con QR">🪪</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setConstanciaPersona(p)} title="Constancia de trabajo (PDF)">📄</button>
                  {canWrite && <>
                    <button className="btn btn-sm btn-ghost" onClick={() => editar(p)} title="Editar">✎</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}>{p.activo ? '⏸' : '▶'}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setPorBorrar(p)} title="Eliminar" style={{ color: 'var(--danger)' }}>🗑</button>
                  </>}
                </td>
              </tr>
                ))}
              </Fragment>
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
              onQuitar={pedirQuitarFoto}
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
              <div className="form-row">
                <label>Fecha de ingreso</label>
                <FechaInput value={form.fecha_ingreso ?? ''}
                  onChange={(iso) => setForm((f) => ({ ...f, fecha_ingreso: iso }))} />
              </div>
              <div className="form-row">
                <label>Fecha de nacimiento</label>
                {/* Nadie nació mañana: el calendario no deja pasar de hoy. */}
                <FechaInput value={form.fecha_nacimiento ?? ''} max={new Date().toISOString().slice(0, 10)}
                  onChange={(iso) => setForm((f) => ({ ...f, fecha_nacimiento: iso }))} />
                <small className="muted">
                  {form.fecha_nacimiento && edad(form.fecha_nacimiento) !== null
                    ? `${edad(form.fecha_nacimiento)} años. La edad se calcula: no se guarda un número que envejece.`
                    : 'Se escribe DD-MM-AAAA o se elige con 📅. De acá sale la edad en la ficha y en los filtros.'}
                </small>
              </div>
              <div className="form-row">
                <label>Género</label>
                <select className="input" value={form.genero ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, genero: (e.target.value || null) as PersonalInput['genero'] }))}>
                  <option value="">Sin indicar</option>
                  {GENEROS.map((g) => <option key={g.valor} value={g.valor}>{g.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Estado civil</label>
                <select className="input" value={form.estado_civil ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, estado_civil: (e.target.value || null) as PersonalInput['estado_civil'] }))}>
                  <option value="">Sin indicar</option>
                  {ESTADOS_CIVILES.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Grupo sanguíneo</label>
                <select className="input" value={form.grupo_sanguineo ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, grupo_sanguineo: e.target.value || null }))}>
                  <option value="">Sin indicar</option>
                  {GRUPOS_SANGUINEOS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <small className="muted">Va en la ficha y sirve en una emergencia.</small>
              </div>
              <ComboConAgregar
                label="Nacionalidad" valor={form.nacionalidad ?? ''} opciones={nacionalidades}
                onChange={(v) => setForm((f) => ({ ...f, nacionalidad: v.toUpperCase() }))}
                hint="Elegí de la lista o agregá una nueva: queda guardada para la próxima." />
              <div className="form-row"><label>Teléfono</label><input className="input" name="p-telefono" defaultValue={form.telefono ?? ''} placeholder="0412-1234567" inputMode="tel" /></div>
              <div className="form-row">
                <label>Contacto de emergencia (nombre)</label>
                {/* La lista sale de la CARGA FAMILIAR de esta misma persona: a
                    quien se llama en una emergencia casi siempre ya está ahí.
                    Para alguien de afuera se pasa a escribirlo a mano. */}
                {contactoLibre || !opcionesContacto.length ? (
                  <input className="input" value={form.contacto_emergencia ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, contacto_emergencia: e.target.value.toUpperCase() }))}
                    placeholder="Ej. MARÍA PÉREZ" />
                ) : (
                  <SearchSelect
                    options={opcionesContacto}
                    value={form.contacto_emergencia ?? ''}
                    onChange={(v) => setForm((f) => ({
                      ...f,
                      contacto_emergencia: v,
                      // Si vino de la carga familiar, el parentesco viene con él.
                      contacto_emergencia_parentesco: parentescoDe(v) ?? f.contacto_emergencia_parentesco ?? null,
                    }))}
                    placeholder="Buscar en la carga familiar…"
                    emptyText="No está en la carga familiar" />
                )}
                {!!opcionesContacto.length && (
                  <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: '.3rem' }}
                    onClick={() => setContactoLibre((v) => !v)}>
                    {contactoLibre ? '↩ Elegir de la carga familiar' : '✎ Es alguien de afuera'}
                  </button>
                )}
                <small className="muted">
                  {opcionesContacto.length
                    ? 'Se busca en la carga familiar de esta persona.'
                    : 'Cargá la carga familiar más abajo y aparecen acá para elegir.'}
                </small>
              </div>
              <div className="form-row">
                <label>Parentesco del contacto</label>
                <select className="input" value={form.contacto_emergencia_parentesco ?? ''}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    contacto_emergencia_parentesco: (e.target.value || null) as PersonalInput['contacto_emergencia_parentesco'],
                  }))}>
                  <option value="">Sin indicar</option>
                  {PARENTESCOS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
                </select>
                <small className="muted">Se completa solo al elegir a alguien de la carga familiar.</small>
              </div>
              <div className="form-row"><label>Teléfono de emergencia</label><input className="input" name="p-telefono-emergencia" defaultValue={form.telefono_emergencia ?? ''} placeholder="0414-7654321" inputMode="tel" /></div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label>Dirección</label>
                <input className="input" name="p-direccion" defaultValue={form.direccion ?? ''}
                  placeholder="Ciudad, sector, calle…" />
              </div>
            </div>
            <small className="muted" style={{ display: 'block', marginTop: '.35rem' }}>📇 El <strong>teléfono</strong> y el <strong>contacto de emergencia</strong> se incluyen en el <strong>QR del carnet</strong> (botón 🪪 en la lista).</small>

            <div className="divider" />
            <div className="card-title" style={{ marginBottom: '.5rem' }}>👨‍👩‍👦 Carga familiar</div>
            <CargaFamiliarPersona
              personalId={editId}
              canWrite={canWrite}
              pendientes={editId ? undefined : famPendientes}
              onPendientes={setFamPendientes}
              onCambio={cargarFamiliares}
            />

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

      {fichaPersona && (
        <FichaTecnicaPersonal
          persona={fichaPersona}
          onClose={() => setFichaPersona(null)}
          onEditar={canWrite ? () => { const p = fichaPersona; setFichaPersona(null); editar(p); } : undefined}
        />
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

      {confirmarQuitarFoto && (
        <ConfirmDialog
          title="Quitar la foto"
          danger
          confirmText="Sí, quitar la foto"
          message={<>La foto se <strong>borra del servidor</strong>. Si después hace falta para el carnet o la ficha, hay que volver a subirla.</>}
          preview={
            <VistaPrevia
              titulo="Se va a borrar esta foto"
              foto={fotoPreview ? <img className="confirm-preview-foto" src={fotoPreview} alt="Foto que se va a borrar" /> : undefined}
            >
              <Dato label="Persona">{`${form.nombre} ${form.apellido ?? ''}`.trim() || undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void quitarFotoForm(); }}
          onCancel={() => setConfirmarQuitarFoto(false)}
        />
      )}

      {porBorrar && (
        <ConfirmDialog
          title="Eliminar a esta persona"
          danger
          confirmText="Eliminar definitivamente"
          requireText={textoParaBorrar}
          message={<>
            Esto <strong>no se puede deshacer</strong>: la ficha se borra de la base junto con todo lo que cuelga de ella.
            Si lo que querés es que deje de aparecer en la nómina, <strong>desactivala</strong> (botón ⏸) en vez de borrarla.
          </>}
          preview={
            <VistaPrevia
              titulo="Se va a eliminar"
              foto={fotoPorBorrar ? <img className="confirm-preview-foto" src={fotoPorBorrar} alt={`Foto de ${porBorrar.nombre}`} /> : undefined}
              pie={
                <div className="aviso danger" style={{ marginTop: '.6rem' }}>
                  <span className="aviso-icono">⚠</span>
                  <div>
                    {estadoResumen === 'cargando' && <>Calculando…</>}
                    {estadoResumen === 'error' && (
                      <>No se pudo contar el detalle. De todos modos, junto con la persona se borran <strong>sus documentos, su carga familiar, su historial de sueldo, sus anticipos y sus registros administrativos</strong>.</>
                    )}
                    {estadoResumen === 'listo' && (cascada.length > 0 ? (
                      <>
                        <strong>Se borra también:</strong>
                        <ul style={{ margin: '.25rem 0 0', paddingLeft: '1.1rem' }}>
                          {cascada.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      </>
                    ) : (
                      <>No tiene documentos, carga familiar, historial de sueldo, anticipos ni registros administrativos: se borra solo la ficha.</>
                    ))}
                    {/* Lo único que NO se va: es la garantía que el usuario ya conocía, así que se dice siempre. */}
                    <div style={{ marginTop: '.4rem' }}>
                      Los <strong>renglones de nómina no se borran</strong>
                      {resumenBorrado && resumenBorrado.renglones_nomina > 0 ? ` (${resumenBorrado.renglones_nomina})` : ''}:
                      {' '}los pagos ya hechos quedan, solo dejan de estar ligados a la persona.
                    </div>
                  </div>
                </div>
              }
            >
              <Dato label="Nombre">{`${porBorrar.nombre} ${porBorrar.apellido ?? ''}`.trim() || undefined}</Dato>
              <Dato label="Cédula">{porBorrar.cedula || undefined}</Dato>
              <Dato label="Cargo">{porBorrar.cargo || undefined}</Dato>
              <Dato label="Departamento">{porBorrar.departamento || undefined}</Dato>
              <Dato label="Fecha de ingreso">{porBorrar.fecha_ingreso ? date(porBorrar.fecha_ingreso) : undefined}</Dato>
              <Dato label="Sueldo base">{Number(porBorrar.sueldo_base) > 0 ? <strong className="mono">{money(porBorrar.sueldo_base)}</strong> : undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void borrar(porBorrar); }}
          onCancel={() => setPorBorrar(null)}
        />
      )}
    </div>
  );
}

/**
 * Una tarjeta del resumen de RRHH. Con `onClick` se vuelve un filtro: al
 * tocarla la lista se queda con esa gente, y al tocarla de nuevo vuelve todo.
 */
function TarjetaRrhh({ titulo, valor, tono, marcada, onClick, ayuda }: {
  titulo: string;
  valor: number;
  tono?: 'ok' | 'alerta';
  marcada?: boolean;
  onClick?: () => void;
  ayuda?: string;
}) {
  const clase = `tira${tono === 'alerta' ? ' warning' : ''}${marcada ? ' marcada' : ''}`;
  const cuerpo = (
    <>
      <div className="tira-titulo">{titulo}</div>
      <div className="tira-valor mono" style={tono === 'ok' ? { color: 'var(--success)' } : undefined}>{valor}</div>
    </>
  );
  if (!onClick) return <div className={clase} title={ayuda}>{cuerpo}</div>;
  return (
    <button type="button" className={clase} aria-pressed={!!marcada} title={ayuda} onClick={onClick}>
      {cuerpo}
    </button>
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
  // La foto cruda (no el carnet ya armado): es la que se muestra al confirmar
  // que se la borra, para que se vea cuál es la que se pierde.
  const [fotoData, setFotoData] = useState<string | null>(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Regenera frente (con la foto actual) y reverso cada vez que cambia la foto.
  useEffect(() => {
    let cancel = false;
    setFrente(null); setReverso(null); setError(null); setFotoData(null);
    (async () => {
      try {
        const foto = fotoPath ? await fotoPersonalDataUrl(fotoPath).catch(() => null) : null;
        if (!cancel) setFotoData(foto);
        const [f, r] = await Promise.all([
          generarCarnetPersonalDataUrl({ ...persona, foto_path: fotoPath }, foto),
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
    setConfirmarQuitar(false);
    if (!fotoPath) return;
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
          {fotoPath && <button className="btn btn-sm btn-danger" disabled={subiendo} onClick={() => setConfirmarQuitar(true)}>🗑 Quitar foto</button>}
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

      {confirmarQuitar && (
        <ConfirmDialog
          title="Quitar la foto"
          danger
          confirmText="Sí, quitar la foto"
          message={<>La foto se <strong>borra del servidor</strong> y el carnet pasa a generarse sin ella. Si después hace falta, hay que volver a subirla.</>}
          preview={
            <VistaPrevia
              titulo="Se va a borrar esta foto"
              foto={fotoData ? <img className="confirm-preview-foto" src={fotoData} alt="Foto que se va a borrar" /> : undefined}
            >
              <Dato label="Persona">{`${persona.nombre} ${persona.apellido ?? ''}`.trim() || undefined}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void quitarFoto(); }}
          onCancel={() => setConfirmarQuitar(false)}
        />
      )}
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
          {/* También confirma al salir del campo: quien escribe el cargo nuevo
              y va directo a «Guardar cambios» sin tocar ✓ perdía lo tecleado y
              se guardaba el valor anterior, con aviso de éxito. */}
          <input className="input" autoFocus name="combo-nuevo" ref={nuevoRef} defaultValue="" autoComplete="off"
            placeholder={`Nuevo ${label.toLowerCase()}…`}
            onBlur={confirmar}
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
