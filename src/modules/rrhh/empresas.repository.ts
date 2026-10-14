/* ============================================================
   Golden Touch · RRHH · Empresas (nóminas)

   Lo que hay que preguntarle a la base SOBRE las nóminas en sí, no sobre una
   persona: cuánta gente activa tiene cada una (el número entre paréntesis del
   switch), crear y editar empresas (14/10/2026: ya no son solo GT y MTO) y
   transferir a una persona de una empresa a otra.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import { claveEmpresaValida } from '@/shared/lib/empresa';
import { BUCKET_LOGOS_EMPRESAS, cargarEmpresasRrhh } from '@/shared/lib/empresasRrhh';
import type { EmpresaRrhh } from '@/shared/lib/types';

const TABLE = 'personal';
const T_EMPRESAS = 'rrhh_empresas';
const T_TRANSF = 'rrhh_transferencias_empresa';

export type ConteoPorEmpresa = Record<EmpresaRrhh, number>;

/**
 * Cuánta gente ACTIVA tiene cada nómina. Se trae solo la columna `empresa` de
 * los activos (unas decenas de filas) y se cuenta aquí: con N empresas sale una
 * sola consulta en vez de una por empresa. Los inactivos no se cuentan.
 */
export async function contarPersonalPorEmpresa(): Promise<ConteoPorEmpresa> {
  const { data, error } = await supabase.from(TABLE).select('empresa').eq('activo', true);
  if (error) throw error;
  const conteo: ConteoPorEmpresa = {};
  for (const f of (data ?? []) as { empresa: string | null }[]) {
    const e = f.empresa || 'GT';
    conteo[e] = (conteo[e] ?? 0) + 1;
  }
  return conteo;
}

/* ───────── Crear / editar empresas ───────── */

export interface EmpresaInput {
  clave: string;
  nombre: string;
  rif?: string | null;
  domicilio?: string | null;
  ciudad?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  icono?: string | null;
  activa?: boolean;
}

const limpio = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim() || null;

function filaEmpresa(i: EmpresaInput) {
  const nombre = limpio(i.nombre)?.toUpperCase() ?? '';
  if (nombre.length < 3) throw new Error('Escribe la razón social de la empresa.');
  return {
    nombre,
    rif: limpio(i.rif)?.toUpperCase() ?? null,
    domicilio: limpio(i.domicilio),
    ciudad: limpio(i.ciudad),
    email: limpio(i.email)?.toLowerCase() ?? null,
    whatsapp: limpio(i.whatsapp),
    icono: limpio(i.icono) ?? '🏢',
    ...(i.activa !== undefined ? { activa: i.activa } : {}),
  };
}

export async function crearEmpresa(i: EmpresaInput, actor: string): Promise<void> {
  const clave = (i.clave ?? '').trim().toUpperCase();
  if (!claveEmpresaValida(clave)) throw new Error('La clave lleva de 2 a 8 letras o números, sin espacios (ej.: MTO, GT2, SERV).');
  const { data: ult } = await supabase.from(T_EMPRESAS).select('orden').order('orden', { ascending: false }).limit(1);
  const orden = (Number(ult?.[0]?.orden) || 0) + 1;
  const { error } = await supabase.from(T_EMPRESAS).insert({ clave, ...filaEmpresa(i), orden, created_by: actor, updated_by: actor });
  if (error) {
    if (error.code === '23505') throw new Error(`Ya existe una empresa con la clave ${clave}.`);
    throw new Error(error.message || 'No se pudo crear la empresa.');
  }
  await cargarEmpresasRrhh(true);
}

export async function editarEmpresa(clave: string, i: EmpresaInput, actor: string): Promise<void> {
  const { error } = await supabase.from(T_EMPRESAS).update({ ...filaEmpresa(i), updated_by: actor }).eq('clave', clave);
  if (error) throw new Error(error.message || 'No se pudo guardar la empresa.');
  await cargarEmpresasRrhh(true);
}

/** Sube el logo (PNG, JPG o WEBP, hasta 2 MB) y borra el anterior. */
export async function subirLogoEmpresa(clave: string, file: File, actor: string): Promise<void> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('El logo tiene que ser PNG, JPG o WEBP.');
  if (file.size > 2 * 1024 * 1024) throw new Error('El logo pesa más de 2 MB.');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${clave}/${Date.now()}.${ext}`;
  const { data: antes } = await supabase.from(T_EMPRESAS).select('logo_path').eq('clave', clave).maybeSingle();
  const { error: e1 } = await supabase.storage.from(BUCKET_LOGOS_EMPRESAS).upload(path, file, { contentType: file.type, upsert: false });
  if (e1) throw new Error(e1.message || 'No se pudo subir el logo.');
  const { error: e2 } = await supabase.from(T_EMPRESAS).update({ logo_path: path, updated_by: actor }).eq('clave', clave);
  if (e2) {
    await supabase.storage.from(BUCKET_LOGOS_EMPRESAS).remove([path]).catch(() => undefined);
    throw new Error(e2.message || 'No se pudo guardar el logo.');
  }
  const viejo = (antes as { logo_path: string | null } | null)?.logo_path;
  if (viejo && viejo !== path) await supabase.storage.from(BUCKET_LOGOS_EMPRESAS).remove([viejo]).catch(() => undefined);
  await cargarEmpresasRrhh(true);
}

/* ───────── Transferir personal entre empresas ───────── */

export interface TransferenciaEmpresa {
  id: string;
  personal_id: string;
  desde: string;
  hacia: string;
  fecha: string;
  ficha_anterior: string | null;
  ficha_nueva: string | null;
  motivo: string | null;
  actor: string | null;
  actor_name: string | null;
  created_at: string;
}

/**
 * Pasa a la persona a otra empresa (otra nómina): su ficha queda en la nómina
 * nueva y la transferencia queda en el historial. Lo de antes (nóminas ya
 * cargadas, recibos, préstamos) no se mueve. Si su número de ficha ya está
 * usado en la nómina de destino, hay que indicar otro.
 */
export async function transferirEmpresa(o: {
  personalId: string; empresa: string; fecha?: string | null; fichaNro?: string | null; motivo: string; actorName?: string | null;
}): Promise<{ desde: string; hacia: string; ficha: string | null }> {
  const { data, error } = await supabase.rpc('rrhh_transferir_empresa', {
    p_personal_id: o.personalId, p_empresa: o.empresa, p_fecha: o.fecha || null,
    p_ficha_nro: o.fichaNro?.trim() || null, p_motivo: o.motivo, p_actor_name: o.actorName ?? null,
  });
  if (error) throw new Error(error.message || 'No se pudo transferir.');
  return data as { desde: string; hacia: string; ficha: string | null };
}

export async function listTransferencias(personalId: string): Promise<TransferenciaEmpresa[]> {
  const { data, error } = await supabase.from(T_TRANSF).select('*').eq('personal_id', personalId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransferenciaEmpresa[];
}
