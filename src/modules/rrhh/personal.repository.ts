/* ============================================================
   Golden Touch · RRHH · Personal (ficha)
   "Usuarios" son los del login; "Personal" engloba a TODO el personal
   a pagar (tengan o no usuario). El sueldo base es MENSUAL (USD).

   OJO CON EL SUELDO: al dar de alta se carga acá, pero de ahí en adelante
   NO se toca desde esta pantalla. Cambiarlo va por `cambiarSueldo` (ver
   sueldos.repository.ts), que pide el motivo y deja el renglón en el
   histórico. Por eso el payload de actualización no lleva sueldo_base: si lo
   llevara, cualquier edición de un teléfono volvería a escribir el sueldo.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EmpresaRrhh, Personal } from '@/shared/lib/types';
import { errorFicha, normalizarFicha } from './fichaNro';
import { errorCorreo, normalizarCorreo } from './correoPersonal';
import { esNeutro, normalizarEncuadre, type Encuadre } from './encuadreFoto';

const TABLE = 'personal';

/**
 * Lista el personal, ordenado por departamento y nombre.
 * `empresa` separa las dos nóminas (GT y MTO), que son independientes: sin
 * filtrar se mezclarían dos plantillas que no tienen nada que ver.
 */
export async function listPersonal(soloActivos = false, empresa?: EmpresaRrhh): Promise<Personal[]> {
  let q = supabase.from(TABLE).select('*').order('departamento', { ascending: true, nullsFirst: false }).order('nombre', { ascending: true });
  if (soloActivos) q = q.eq('activo', true);
  if (empresa) q = q.eq('empresa', empresa);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Personal[];
}

export interface PersonalInput {
  nombre: string;
  apellido?: string;
  cedula?: string | null;
  rif?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  sueldo_base?: number;
  fecha_ingreso?: string | null;
  telefono?: string | null;
  correo?: string | null;
  contacto_emergencia?: string | null;
  contacto_emergencia_parentesco?: 'hijo' | 'conyuge' | 'padre' | 'madre' | 'hermano' | 'otro' | null;
  telefono_emergencia?: string | null;
  /** A qué nómina entra. Solo se define al dar de alta. */
  empresa?: EmpresaRrhh;
  /** Número de ficha. Igual que la empresa: solo se define al dar de alta.
   *  Vacío = que lo asigne la base. */
  ficha_nro?: string | null;
  fecha_nacimiento?: string | null;
  genero?: 'M' | 'F' | 'O' | null;
  estado_civil?: 'soltero' | 'casado' | 'divorciado' | 'viudo' | 'concubinato' | null;
  grupo_sanguineo?: string | null;
  nacionalidad?: string | null;
  direccion?: string | null;
}

function payload(input: PersonalInput) {
  return {
    ...baseSinSueldo(input),
    sueldo_base: Math.round((Number(input.sueldo_base) || 0) * 100) / 100,
    // Solo acá, que es el ALTA. A propósito NO está en `baseSinSueldo`, que es
    // lo que arma la EDICIÓN: la ficha no se cambia, y la base lo rechaza igual.
    ficha_nro: normalizarFicha(input.ficha_nro),
  };
}

/**
 * Todo lo de la ficha MENOS el sueldo (ver la nota de arriba).
 *
 * `soloDefinidos` es la diferencia entre un ALTA y una EDICIÓN. En el alta se
 * escribe la fila completa. En una edición NO: el update se arma solo con los
 * campos que vienen en `patch`, así lo que el formulario no recolectó queda
 * COMO ESTABA en vez de quedar en null.
 *
 * Esto último no es un detalle: mientras el update pisaba la fila entera,
 * cualquier campo que la pantalla no lograra juntar —porque su input no estaba
 * montado, porque se agregó una columna antes que su campo, porque alguien lo
 * envolvió en una condición— se borraba en la base sin ningún error y con el
 * aviso de «Personal actualizado» en verde. Un dato que desaparece en silencio
 * es peor que un guardado que falla.
 */
function baseSinSueldo(input: PersonalInput, soloDefinidos = false) {
  const todo = {
    nombre: input.nombre.trim(),
    apellido: (input.apellido ?? '').trim(),
    cedula: input.cedula?.trim() || null,
    rif: input.rif?.trim() || null,
    cargo: input.cargo?.trim() || null,
    departamento: input.departamento?.trim() || null,
    fecha_ingreso: input.fecha_ingreso || null,
    telefono: input.telefono?.trim() || null,
    correo: normalizarCorreo(input.correo),
    contacto_emergencia: input.contacto_emergencia?.trim() || null,
    contacto_emergencia_parentesco: input.contacto_emergencia_parentesco || null,
    telefono_emergencia: input.telefono_emergencia?.trim() || null,
    fecha_nacimiento: input.fecha_nacimiento || null,
    genero: input.genero || null,
    estado_civil: input.estado_civil || null,
    grupo_sanguineo: input.grupo_sanguineo?.trim() || null,
    nacionalidad: input.nacionalidad?.trim() || null,
    direccion: input.direccion?.trim() || null,
  };
  if (!soloDefinidos) return todo;
  // Las claves de `todo` y las de PersonalInput son las mismas, así que se
  // puede preguntar por cada una si el formulario la mandó.
  const dado = input as unknown as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(todo)) {
    if (dado[clave] !== undefined) row[clave] = valor;
  }
  return row;
}

/**
 * Traduce el rechazo de la base cuando la cédula o el RIF ya están cargados en
 * otra persona. La regla vive en la BASE (índices únicos sobre el valor
 * normalizado), no solo en la pantalla: así no hay camino por el que se cuele
 * un duplicado, ni siquiera dos usuarios guardando al mismo tiempo. Pero el
 * mensaje de Postgres no le dice nada a nadie, así que se reemplaza.
 */
function errorDuplicado(error: { code?: string; message?: string } | null): Error | null {
  if (!error || error.code !== '23505') return null;
  const m = String(error.message ?? '');
  if (m.includes('personal_cedula_uk')) {
    return new Error('Ya hay una persona registrada con esa cédula. Buscala en la lista en vez de cargarla de nuevo (si está inactiva, activala).');
  }
  if (m.includes('personal_rif_uk')) {
    return new Error('Ya hay una persona registrada con ese RIF.');
  }
  return null;
}

export async function crearPersonal(input: PersonalInput, actorEmail?: string): Promise<Personal> {
  if (!input.nombre.trim()) throw new Error('Indicá el nombre.');
  const malaFicha = errorFicha(input.ficha_nro);
  if (malaFicha) throw new Error(malaFicha);
  const malCorreo = errorCorreo(input.correo);
  if (malCorreo) throw new Error(malCorreo);
  // La empresa se fija en el alta y no se toca después: mover a alguien de
  // nómina es una baja y un alta, no un campo que se edita.
  const { data, error } = await supabase.from(TABLE)
    .insert({ ...payload(input), empresa: input.empresa ?? 'GT', created_by: actorEmail ?? null })
    .select('*').single();
  if (error) throw errorDuplicado(error) ?? error;
  return data as Personal;
}

export async function actualizarPersonal(id: string, patch: PersonalInput): Promise<Personal> {
  if (!patch.nombre.trim()) throw new Error('Indicá el nombre.');
  const malCorreo = errorCorreo(patch.correo);
  if (malCorreo) throw new Error(malCorreo);
  // Sin el sueldo, a propósito: ese cambio va por cambiarSueldo(), con motivo.
  // Y solo con los campos que vinieron: un campo ausente NO se borra.
  const { data, error } = await supabase.from(TABLE).update(baseSinSueldo(patch, true)).eq('id', id).select('*').single();
  if (error) throw errorDuplicado(error) ?? error;
  return data as Personal;
}

/** Activa o desactiva (no borra: conserva el histórico de pagos). */
export async function setPersonalActivo(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ activo }).eq('id', id);
  if (error) throw error;
}

/** Cuántas filas se van a ir en cascada junto con la persona. */
export interface ResumenBorradoPersonal {
  documentos: number;
  familiares: number;
  /** Renglones del historial de sueldo. */
  sueldos: number;
  /** Vacaciones, permisos, utilidades y notas (rrhh_eventos). */
  eventos: number;
  anticipos: number;
  /** Estos NO se borran: quedan, pero sin quedar ligados a la persona (SET NULL). */
  renglones_nomina: number;
}

/**
 * Qué se lleva por delante borrar a una persona.
 *
 * La fila de `personal` cuelga de un ON DELETE CASCADE: al borrarla se van con
 * ella sus documentos, su carga familiar, su historial de sueldo, sus anticipos
 * y sus registros administrativos. Eso no se puede deshacer, así que el usuario
 * tiene que verlo ANTES, con las cantidades reales, no enterarse después.
 *
 * Devuelve null si el conteo falla (permisos, red, función ausente): perder el
 * detalle no puede tumbar la pantalla —la confirmación avisa igual, en general—
 * porque el aviso vale más que el número exacto.
 */
export async function resumenBorradoPersonal(id: string): Promise<ResumenBorradoPersonal | null> {
  const { data, error } = await supabase.rpc('personal_resumen_borrado', { p_id: id });
  if (error) return null;
  // La función devuelve TABLE(...), así que llega como arreglo de una fila.
  const fila = (Array.isArray(data) ? data[0] : data) as Partial<ResumenBorradoPersonal> | null | undefined;
  if (!fila) return null;
  const n = (v: unknown) => Number(v) || 0;
  return {
    documentos: n(fila.documentos),
    familiares: n(fila.familiares),
    sueldos: n(fila.sueldos),
    eventos: n(fila.eventos),
    anticipos: n(fila.anticipos),
    renglones_nomina: n(fila.renglones_nomina),
  };
}

/** Elimina definitivamente una persona del personal. */
export async function eliminarPersonal(id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo eliminar: sin permiso o ya no existía.');
}

/* ───────── Foto de la persona (para el carnet) ───────── */
const FOTOS_BUCKET = 'personal-fotos';
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/** Sube (o reemplaza) la foto de una persona y guarda su path en `personal.foto_path`.
 *  Borra la foto anterior si existía. Devuelve el nuevo path. */
export async function subirFotoPersonal(id: string, file: File, fotoAnterior?: string | null): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('La foto debe ser una imagen.');
  if (file.size > MAX_FOTO_BYTES) throw new Error('La foto no puede superar 5 MB.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(FOTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  // El encuadre vuelve a cero: el de la foto anterior no tiene nada que ver con
  // esta, y dejarlo puesto mostraría un recorte al azar de la cara de alguien.
  const { error: updErr } = await supabase.from(TABLE)
    .update({ foto_path: path, foto_encuadre: null }).eq('id', id);
  if (updErr) throw updErr;
  if (fotoAnterior) await supabase.storage.from(FOTOS_BUCKET).remove([fotoAnterior]).catch(() => {});
  return path;
}

/** Quita la foto de una persona (borra el archivo y limpia `foto_path`). */
export async function borrarFotoPersonal(id: string, fotoPath: string): Promise<void> {
  const { error } = await supabase.from(TABLE)
    .update({ foto_path: null, foto_encuadre: null }).eq('id', id);
  if (error) throw error;
  if (fotoPath) await supabase.storage.from(FOTOS_BUCKET).remove([fotoPath]).catch(() => {});
}

/**
 * Guarda cómo queda encuadrada la foto (zoom y centro). El archivo no se toca.
 *
 * Un encuadre neutro se guarda como `null` en vez de {zoom:1,x:.5,y:.5}: son
 * lo mismo al dibujar, y `null` deja claro que a esa foto nadie la ajustó.
 */
export async function guardarEncuadreFoto(id: string, encuadre: Encuadre | null): Promise<void> {
  const valor = !encuadre || esNeutro(encuadre) ? null : normalizarEncuadre(encuadre);
  const { error } = await supabase.from(TABLE).update({ foto_encuadre: valor }).eq('id', id);
  if (error) throw error;
}

/** URL firmada (5 min) para ver/descargar la foto de una persona. */
export async function getFotoPersonalUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FOTOS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error('No se pudo generar el enlace de la foto');
  return data.signedUrl;
}

/* Los ARCHIVOS del trabajador (RIF, cédula, CV) viven en su propio
   repositorio: documentos.repository.ts. Acá quedó solo la foto, que es
   parte de la ficha (va en el carnet) y no documentación. */

/** Descarga la foto y la convierte a data URL (para dibujarla en el carnet sin CORS). */
export async function fotoPersonalDataUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(FOTOS_BUCKET).download(path);
  if (error || !data) throw error ?? new Error('No se pudo descargar la foto');
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(data);
  });
}
