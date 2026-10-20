/* ============================================================
   Golden Touch · Retenciones · Valores con vigencia (R3)

   La UT, las alícuotas y los porcentajes, cada uno con su vigencia «desde»
   una fecha, su fuente y su motivo (retencion_parametros), sobre un catálogo
   de claves (retencion_parametro_claves: general o por impuesto, y el tipo
   del valor). Un valor nuevo se manda solo con «desde»: la base cierra el
   anterior. El vigente se puede corregir. Mientras conviva con el JSON de
   Parámetros, la base copia el valor de hoy al JSON.

   Para registrar, los valores son los de la FECHA DE LA FACTURA
   (configDeFecha): una retención de junio usa la UT de junio. Sin UT cargada
   para esa fecha no se registra. Sin R3, todo sigue con el JSON.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { ConfigRetencion, TipoImpuesto } from './retencionesCalculo';
import { errorRetencion } from './erroresRetencion';
import { tablaDisponible } from './disponibilidad';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';

const T_CLAVES = 'retencion_parametro_claves';
const T_VALORES = 'retencion_parametros';
const T_HISTORIAL = 'retencion_historial';

export type Ambito = 'general' | 'impuesto';
export type TipoValor = 'numero' | 'texto' | 'si_no';
export type Unidad = '%' | 'Bs' | 'UT' | 'dias';
export type Valor = number | string | boolean;

export interface ClaveParametro {
  clave: string;
  nombre: string;
  ambito: Ambito;
  tipoValor: TipoValor;
  unidad: Unidad | null;
  descripcion: string | null;
  orden: number;
  activo: boolean;
}

export interface ValorParametro {
  id: string;
  /** null = general. */
  impuestoClave: string | null;
  clave: string;
  valor: Valor;
  desde: string;
  hasta: string | null;
  fuente: string | null;
  motivo: string;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

const texto = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v));
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Hoy en Venezuela (no en UTC: después de las 20:00 ya sería mañana). */
const hoyIso = hoyVenezuela;

export const r3Disponible = () => tablaDisponible(T_VALORES);

/* ───────── Piezas puras ───────── */

export function aClave(r: Record<string, unknown>): ClaveParametro {
  return {
    clave: String(r.clave), nombre: String(r.nombre ?? r.clave), ambito: r.ambito === 'impuesto' ? 'impuesto' : 'general',
    tipoValor: (r.tipo_valor as TipoValor) ?? 'numero', unidad: (texto(r.unidad) as Unidad | null),
    descripcion: texto(r.descripcion), orden: Number(r.orden ?? 0) || 0, activo: r.activo !== false,
  };
}

export function aValor(r: Record<string, unknown>): ValorParametro {
  return {
    id: String(r.id), impuestoClave: texto(r.impuesto_clave), clave: String(r.clave), valor: r.valor as Valor,
    desde: String(r.desde ?? ''), hasta: texto(r.hasta), fuente: texto(r.fuente), motivo: String(r.motivo ?? ''),
    actualizadoEn: texto(r.actualizado_en), actualizadoPor: texto(r.actualizado_por),
  };
}

/** La clave de un renglón: «*:ut», «IVA:alicuota» (la misma que usa el historial de la base). */
export const claveRenglon = (impuesto: string | null, clave: string) => `${impuesto ?? '*'}:${clave}`;

/** El valor vigente en una fecha, de una lista de versiones. Igual que retencion_parametro. */
export function valorEnFecha(xs: ValorParametro[], impuesto: string | null, clave: string, fecha: string = hoyIso()): ValorParametro | null {
  return xs.filter((v) => v.impuestoClave === impuesto && v.clave === clave && v.desde <= fecha && (!v.hasta || v.hasta >= fecha))
    .sort((a, b) => b.desde.localeCompare(a.desde))[0] ?? null;
}

/** Lo que escribe la persona → el valor del tipo de la clave, o un error. */
export function leerValor(tipo: TipoValor, crudo: string | boolean): { valor: Valor } | { error: string } {
  if (tipo === 'si_no') return { valor: crudo === true || crudo === 'si' || crudo === 'true' };
  const s = String(crudo).trim();
  if (tipo === 'texto') return s ? { valor: s } : { error: 'Escribe el valor.' };
  const limpio = s.replace(/\s/g, '');
  const normal = /,\d{1,}$/.test(limpio) ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, '');
  const n = Number(normal);
  return s && Number.isFinite(n) ? { valor: n } : { error: 'El valor tiene que ser un número.' };
}

/** «43,00 Bs», «75 %», «Sí». */
export function mostrarValor(v: Valor | null | undefined, unidad: Unidad | null): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') {
    const s = v.toLocaleString('es-VE', { maximumFractionDigits: 4 });
    return unidad === '%' ? `${s} %` : unidad === 'dias' ? `${s} días` : unidad ? `${s} ${unidad}` : s;
  }
  return v;
}

export function faltaEnValor(k: Pick<ClaveParametro, 'ambito' | 'clave'>, impuesto: string | null, desde: string, motivo: string): string | null {
  if (k.ambito === 'general' && impuesto) return `«${k.clave}» es general: va sin impuesto.`;
  if (k.ambito === 'impuesto' && !impuesto) return `«${k.clave}» es de un impuesto: indica cuál.`;
  if (!FECHA.test(desde)) return 'Indica desde qué fecha vale.';
  if (!motivo.trim()) return 'Indica el motivo: queda en el historial.';
  return null;
}

export function faltaEnClave(k: Pick<ClaveParametro, 'clave' | 'nombre'>): string | null {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(k.clave)) return 'La clave va en minúsculas, sin espacios (letras, números y _).';
  if (k.nombre.trim().length < 2) return 'El nombre necesita al menos 2 letras.';
  return null;
}

export interface Renglon { impuesto: string | null; clave: ClaveParametro; versiones: ValorParametro[] }

/** Un renglón por (impuesto, clave) con valores; los generales primero, luego por impuesto y por orden. */
export function renglones(claves: ClaveParametro[], valores: ValorParametro[]): Renglon[] {
  const porClave = new Map(claves.map((k) => [k.clave, k]));
  const grupos = new Map<string, Renglon>();
  for (const v of valores) {
    const k = porClave.get(v.clave);
    if (!k) continue;
    const id = claveRenglon(v.impuestoClave, v.clave);
    const g = grupos.get(id) ?? { impuesto: v.impuestoClave, clave: k, versiones: [] };
    g.versiones.push(v);
    grupos.set(id, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, versiones: g.versiones.sort((a, b) => b.desde.localeCompare(a.desde)) }))
    .sort((a, b) => Number(a.impuesto != null) - Number(b.impuesto != null)
      || (a.impuesto ?? '').localeCompare(b.impuesto ?? '') || a.clave.orden - b.clave.orden || a.clave.clave.localeCompare(b.clave.clave));
}

/** «16/10/2026». */
const ddmmaaaa = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

/* ───────── Lectura ───────── */

export async function listClavesParametro(): Promise<ClaveParametro[]> {
  const { data, error } = await supabase.from(T_CLAVES).select('*').order('orden').order('clave');
  if (error) throw errorRetencion(error, 'No se pudo leer el catálogo de valores.');
  return (data ?? []).map((r) => aClave(r as Record<string, unknown>));
}

/** Todos los valores, con su historia (el más nuevo primero). */
export async function listValores(): Promise<ValorParametro[]> {
  const { data, error } = await supabase.from(T_VALORES).select('*').order('desde', { ascending: false });
  if (error) throw errorRetencion(error, 'No se pudieron leer los valores.');
  return (data ?? []).map((r) => aValor(r as Record<string, unknown>));
}

/** Lo que dice la base para un valor en una fecha (null si no hay). */
export async function parametroEnFecha(impuesto: string | null, clave: string, fecha: string): Promise<Valor | null> {
  const { data, error } = await supabase.rpc('retencion_parametro', { p_impuesto: impuesto, p_clave: clave, p_fecha: fecha });
  if (error) throw errorRetencion(error, 'No se pudo leer el valor.');
  return (data ?? null) as Valor | null;
}

export async function historialValor(impuesto: string | null, clave: string, limite = 40) {
  const { data, error } = await supabase.from(T_HISTORIAL).select('*')
    .eq('tabla', T_VALORES).eq('clave', claveRenglon(impuesto, clave)).order('at', { ascending: false }).limit(limite);
  if (error) throw errorRetencion(error, 'No se pudo leer el historial.');
  return (data ?? []) as { id: number; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; motivo: string | null; actor: string | null; at: string }[];
}

/* ───────── Valores de una fecha, para registrar ───────── */

/**
 * La configuración con los valores vigentes en la fecha de la factura. Sin R3,
 * la de siempre. Sin UT para esa fecha, no se registra. Los % del IVA hacen
 * falta solo si se registra IVA; la alícuota del IGTF, solo si se registra IGTF.
 */
export async function configDeFecha(base: ConfigRetencion, fecha: string, tipos: TipoImpuesto[] = []): Promise<ConfigRetencion> {
  if (!FECHA.test(fecha) || !(await r3Disponible())) return base;
  const [ut, pctIva, pctArt5, igtf] = await Promise.all([
    parametroEnFecha(null, 'ut', fecha),
    parametroEnFecha('IVA', 'pct_retencion', fecha),
    parametroEnFecha('IVA', 'pct_retencion_art5', fecha),
    parametroEnFecha('IGTF', 'alicuota', fecha),
  ]);
  const dia = ddmmaaaa(fecha);
  if (typeof ut !== 'number' || !(ut > 0)) {
    throw new Error(`No hay UT cargada para el ${dia}. Cárguela en Parámetros → Valores (con su fecha y fuente) antes de registrar.`);
  }
  if (tipos.includes('iva') && (typeof pctIva !== 'number' || typeof pctArt5 !== 'number')) {
    throw new Error(`No hay % de retención de IVA cargado para el ${dia}. Cárguelo en Parámetros → Valores (con su fecha y fuente) antes de registrar.`);
  }
  if (tipos.includes('igtf') && typeof igtf !== 'number') {
    throw new Error(`No hay alícuota de IGTF cargada para el ${dia}. Cárguela en Parámetros → Valores (con su fecha y fuente) antes de registrar.`);
  }
  return {
    ...base,
    valorUt: ut,
    pctIvaGeneral: typeof pctIva === 'number' ? pctIva : base.pctIvaGeneral,
    pctIvaEspecial: typeof pctArt5 === 'number' ? pctArt5 : base.pctIvaEspecial,
    pctIgtf: typeof igtf === 'number' ? igtf : base.pctIgtf,
  };
}

/* ───────── Escritura ───────── */

const TEXTOS = {
  unico: 'Ya hay un valor que empieza en esa fecha: elige otra fecha o corrige ese.',
  regla: 'Revisa el valor: la fecha «hasta» no puede ser anterior a «desde».',
};

export interface ValorNuevo {
  impuestoClave: string | null;
  clave: string;
  valor: Valor;
  desde: string;
  fuente?: string | null;
  motivo: string;
}

/** Un valor nuevo desde una fecha (la base cierra el anterior el día antes). */
export async function nuevoValor(k: Pick<ClaveParametro, 'ambito' | 'clave'>, v: ValorNuevo): Promise<string> {
  const falta = faltaEnValor(k, v.impuestoClave, v.desde, v.motivo);
  if (falta) throw new Error(falta);
  const { data, error } = await supabase.from(T_VALORES).insert({
    impuesto_clave: v.impuestoClave, clave: v.clave, valor: v.valor, desde: v.desde,
    fuente: v.fuente?.trim() || null, motivo: v.motivo.trim(),
  }).select('id');
  if (error) throw errorRetencion(error, 'No se pudo guardar el valor.', TEXTOS);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (!id) throw new Error('No se guardó el valor: sin permiso de escritura en Retenciones.');
  return id;
}

/** Corrige un valor ya cargado (sin cambiar su «desde»): lo que se escribió mal. */
export async function corregirValor(id: string, valor: Valor, fuente: string | null, motivo: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Indica el motivo de la corrección: queda en el historial.');
  const { data, error } = await supabase.from(T_VALORES)
    .update({ valor, fuente: fuente?.trim() || null, motivo: motivo.trim() }).eq('id', id).select('id');
  if (error) throw errorRetencion(error, 'No se pudo corregir el valor.', TEXTOS);
  if (!data?.length) throw new Error('No se corrigió el valor: sin permiso de escritura en Retenciones, o el valor ya no existe.');
}

/** Alta de una clave nueva en el catálogo. */
export async function crearClaveParametro(k: Omit<ClaveParametro, 'activo'>): Promise<void> {
  const falta = faltaEnClave(k);
  if (falta) throw new Error(falta);
  const { data, error } = await supabase.from(T_CLAVES).insert({
    clave: k.clave, nombre: k.nombre.trim(), ambito: k.ambito, tipo_valor: k.tipoValor, unidad: k.unidad,
    descripcion: k.descripcion?.trim() || null, orden: k.orden,
  }).select('clave');
  if (error) throw errorRetencion(error, 'No se pudo crear la clave.', { unico: 'Ya hay una clave con ese nombre.' });
  if (!data?.length) throw new Error('No se creó la clave: sin permiso de escritura en Retenciones.');
}
