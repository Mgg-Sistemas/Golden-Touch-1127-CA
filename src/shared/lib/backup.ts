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

/** Genera y descarga el respaldo .sql. Registra la fecha en `config`. */
export async function descargarRespaldoSql(actorEmail: string, automatico = false): Promise<void> {
  const sql = await generarRespaldoSql();
  const fecha = new Date().toISOString().slice(0, 10);
  descargarTexto(sql, `mgg-respaldo${automatico ? '-auto' : ''}-${fecha}.sql`);
  await registrarUltimoRespaldo(actorEmail, automatico);
}

/** Fecha del último respaldo (o null si nunca se hizo). */
export async function ultimoRespaldo(): Promise<string | null> {
  const { data } = await supabase.from('config').select('value').eq('key', CONFIG_KEY).maybeSingle();
  return (data?.value as { at?: string } | undefined)?.at ?? null;
}

/**
 * Respaldo AUTOMÁTICO: si el usuario es admin/analista y pasaron ≥30 días
 * (o nunca se hizo), descarga el respaldo y registra la fecha. Devuelve true
 * si se ejecutó. Pensado para llamarse una vez al entrar a la app.
 */
export async function chequearRespaldoAutomatico(role: string | null, actorEmail: string): Promise<boolean> {
  if (!puedeRespaldar(role)) return false;
  const last = await ultimoRespaldo();
  if (last && Date.now() - new Date(last).getTime() < MS_30D) return false;
  await descargarRespaldoSql(actorEmail, true);
  return true;
}
