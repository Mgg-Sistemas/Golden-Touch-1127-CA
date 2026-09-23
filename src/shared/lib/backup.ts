/* ============================================================
   Golden Touch · Respaldo de la base de datos (.sql)
   - Manual: botón "Respaldo de Data" en el menú (admin/analista).
   - Automático: cada 30 días, al entrar un admin/analista.
   La generación corre en la función SQL `dump_database_sql()`
   (SECURITY DEFINER) que valida el rol del solicitante por dentro.
   ============================================================ */
import { strToU8, zipSync } from 'fflate';
import { supabase } from '@/shared/lib/supabase';
import { avisoSiNoEntraEnCorreo, nombreSqlRespaldo, nombreZipRespaldo } from '@/shared/lib/respaldoAdjunto';
import { motivoDeEdgeFunction } from '@/shared/lib/errores';

const CONFIG_KEY = 'backup.ultimo';
const DIAS = 30;
const MS_30D = DIAS * 24 * 60 * 60 * 1000;

/**
 * Correos destino del respaldo (automático y opción "Enviar por correo").
 *
 * Acá viaja la base ENTERA de Golden Touch, así que la lista se cambia solo
 * a pedido expreso. El 23/09/2026 se sacó `sistemas@mineralgroupguayana.com`
 * y entró `sistemamgg1@gmail.com`.
 */
export const BACKUP_EMAILS = ['sistemamgg1@gmail.com', 'mineralgroupsistemas@gmail.com'];
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
    '-- GOLDEN TOUCH 1127 C.A. · Respaldo de base de datos',
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
  descargarTexto(sql, `gt-respaldo${automatico ? '-auto' : ''}-${fecha}.sql`);
  await registrarUltimoRespaldo(actorEmail, automatico);
}

/**
 * Base64 de bytes crudos. Se va de a pedazos porque `String.fromCharCode(...)`
 * con un arreglo de millones de elementos revienta la pila del navegador.
 */
function bytesABase64(bytes: Uint8Array): string {
  const PEDAZO = 0x8000;
  let texto = '';
  for (let i = 0; i < bytes.length; i += PEDAZO) {
    texto += String.fromCharCode(...bytes.subarray(i, i + PEDAZO));
  }
  return btoa(texto);
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

  // El volcado sin comprimir son ~15 MB, que en base64 pasan a ~20 y el envío
  // moría con un 413 antes de llegar a nuestro código. Se comprime en ZIP
  // (Brevo filtra por extensión y acepta `.zip`) y baja alrededor de diez veces.
  const nombre = nombreZipRespaldo(fecha, automatico);
  const zip = zipSync({ [nombreSqlRespaldo(fecha, automatico)]: strToU8(sql) }, { level: 9 });

  // Si algún día ni comprimido entra, se corta acá con un mensaje que dice el
  // tamaño y la salida, en vez de volver a fallar con un 413 indescifrable.
  const aviso = avisoSiNoEntraEnCorreo(zip.length);
  if (aviso) throw new Error(aviso);

  const { data, error } = await supabase.functions.invoke<
    { ok: true; destinatarios: string[] } | { error: string }
  >('enviar-reporte', {
    body: {
      modulo: 'ajustes',
      pdf_base64: bytesABase64(zip),
      nombre_archivo: nombre,
      asunto: `Respaldo de base de datos · GOLDEN TOUCH 1127 C.A. · ${fecha}`,
      mensaje: `${automatico ? 'Respaldo automático (cada 30 días)' : 'Respaldo manual'} · Generado por ${actorEmail || 'sistema'} · ${cuando} (America/Caracas).`,
      to_emails: toEmails,
    },
  });
  if (error) throw new Error(await motivoDeEdgeFunction(error, 'No se pudo enviar el respaldo por correo.'));
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
