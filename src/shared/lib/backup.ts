/* ============================================================
   Golden Touch · Respaldo de la base de datos (.sql)
   - Manual: botón "Respaldo de Data" en el menú (admin/analista).
   - Automático: cada 30 días, al entrar un admin/analista.
   La generación corre en la función SQL `dump_database_sql()`
   (SECURITY DEFINER) que valida el rol del solicitante por dentro.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';

const CONFIG_KEY = 'backup.ultimo';
const DIAS = 30;
const MS_30D = DIAS * 24 * 60 * 60 * 1000;

/** Correos destino del respaldo (automático y opción "Enviar por correo"). */
export const BACKUP_EMAILS = ['mineralgroupsistemas@gmail.com', 'sistemas@mineralgroupguayana.com'];
/** Compat: texto para mostrar a quién se envía (lista separada por coma). */
export const BACKUP_EMAIL = BACKUP_EMAILS.join(', ');

/** Fecha/hora legible de Venezuela (para el encabezado y el mensaje del correo). */
function ahoraVE(): string {
  return new Date().toLocaleString('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Encabezado del .sql: deja registrado quién hizo el respaldo y cuándo. */
function encabezadoRespaldo(actorEmail: string, automatico: boolean): string {
  return [
    '-- ============================================================',
    '-- MGG · Respaldo de base de datos',
    `-- Tipo:          ${automatico ? 'AUTOMÁTICO (cada 30 días)' : 'MANUAL'}`,
    `-- Generado por:  ${actorEmail || 'sistema'}`,
    `-- Fecha y hora:  ${ahoraVE()} (America/Caracas)`,
    '-- ============================================================',
    '', '',
  ].join('\n');
}

/** Roles autorizados a respaldar (el filtro fino se ajustará luego). */
export function puedeRespaldar(role?: string | null): boolean {
  return role === 'admin' || role === 'analista';
}

/** Genera el SQL del respaldo llamando a la función de la base. */
export async function generarRespaldoSql(): Promise<string> {
  const { data, error } = await supabase.rpc('dump_database_sql');
  if (error) throw new Error(error.message || 'No se pudo generar el respaldo.');
  return (data as string) ?? '';
}

/** Marca en `config` la fecha del último respaldo (no rompe si falla). */
async function registrarUltimoRespaldo(actorEmail: string, automatico: boolean): Promise<void> {
  try {
    await supabase.from('config').upsert(
      { key: CONFIG_KEY, value: { at: new Date().toISOString(), por: actorEmail, automatico }, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  } catch { /* el registro de fecha es best-effort */ }
}

/** Dispara la descarga de un texto como archivo. */
function descargarTexto(texto: string, nombre: string): void {
  const blob = new Blob([texto], { type: 'application/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Genera y descarga el respaldo .sql (con encabezado de autor/fecha). Registra la fecha. */
export async function descargarRespaldoSql(actorEmail: string, automatico = false): Promise<void> {
  const sql = encabezadoRespaldo(actorEmail, automatico) + await generarRespaldoSql();
  const fecha = new Date().toISOString().slice(0, 10);
  descargarTexto(sql, `mgg-respaldo${automatico ? '-auto' : ''}-${fecha}.sql`);
  await registrarUltimoRespaldo(actorEmail, automatico);
}

/** Base64 seguro para UTF-8 (btoa solo maneja latin1). */
function toBase64Utf8(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

/**
 * Genera el respaldo .sql y lo ENVÍA POR CORREO (adjunto) vía la Edge Function
 * `enviar-reporte` (Brevo). Por defecto al correo de respaldos. Registra la fecha.
 */
export async function enviarRespaldoPorCorreo(
  actorEmail: string,
  automatico = false,
  toEmails: string[] = BACKUP_EMAILS,
): Promise<{ destinatarios: string[] }> {
  const cuando = ahoraVE();
  const sql = encabezadoRespaldo(actorEmail, automatico) + await generarRespaldoSql();
  const fecha = new Date().toISOString().slice(0, 10);
  // Brevo no admite adjuntos `.sql`; se envía como `.sql.txt` (mismo contenido,
  // extensión aceptada). La descarga manual sí mantiene `.sql`.
  const nombre = `mgg-respaldo${automatico ? '-auto' : ''}-${fecha}.sql.txt`;
  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      pdf_base64: toBase64Utf8(sql),
      nombre_archivo: nombre,
      asunto: `Respaldo de base de datos · Golden Touch · ${fecha}`,
      mensaje: `${automatico ? 'Respaldo automático (cada 30 días)' : 'Respaldo manual'} · Generado por ${actorEmail || 'sistema'} · ${cuando} (America/Caracas).`,
      to_emails: toEmails,
    },
  });
  if (error) throw new Error(error.message ?? 'No se pudo enviar el respaldo por correo.');
  if (!data || 'error' in data) throw new Error((data as { error?: string })?.error || 'Respuesta inválida del envío.');
  await registrarUltimoRespaldo(actorEmail, automatico);
  return { destinatarios: data.destinatarios ?? toEmails };
}

/** Fecha del último respaldo (o null si nunca se hizo). */
export async function ultimoRespaldo(): Promise<string | null> {
  const { data } = await supabase.from('config').select('value').eq('key', CONFIG_KEY).maybeSingle();
  return (data?.value as { at?: string } | undefined)?.at ?? null;
}

/**
 * Respaldo AUTOMÁTICO: si el usuario es admin/analista y pasaron ≥30 días
 * (o nunca se hizo), ENVÍA el respaldo POR CORREO (al correo de respaldos) y
 * registra la fecha. Devuelve true si se ejecutó. Se llama una vez al entrar.
 */
export async function chequearRespaldoAutomatico(role: string | null, actorEmail: string): Promise<boolean> {
  if (!puedeRespaldar(role)) return false;
  const last = await ultimoRespaldo();
  if (last && Date.now() - new Date(last).getTime() < MS_30D) return false;
  await enviarRespaldoPorCorreo(actorEmail, true);
  return true;
}
