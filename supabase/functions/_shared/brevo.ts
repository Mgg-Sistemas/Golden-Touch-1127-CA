// Golden Touch · Envío de correo centralizado (Brevo Transactional Email API).
//
// POR QUÉ EXISTE: las seis funciones enviar-* repetían el mismo fetch a Brevo,
// cada una con su propia (y laxa) validación. Eso las volvía un relay de
// phishing: cualquier usuario activo podía mandar, desde el remitente
// verificado de la empresa (SPF/DKIM válidos), cualquier adjunto a cualquier
// lista de correos. Acá se concentra TODO lo que protege el envío:
//
//   · destinatarios: regex anclada (no acepta "a@b.c,d@e.f"), sin duplicados, máx. 10
//   · asunto: sin saltos de línea, máx. 150 caracteres, siempre con «[Golden Touch] »
//   · adjunto: nombre saneado y con extensión permitida (.pdf / .sql.txt),
//     base64 válido, PDF que empieza con %PDF, máx. ~8 MB decodificado
//   · límite por usuario: 30 correos por hora (tabla public.correos_enviados)
//   · fetch con timeout de 15 s; al cliente solo le llegan errores genéricos,
//     el detalle (sin destinatarios) queda en console.error
//
// Secrets: BREVO_API_KEY · BREVO_FROM_EMAIL · BREVO_FROM_NAME

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

import { json, type Sesion } from './auth.ts';

export const MAX_DESTINATARIOS = 10;
export const MAX_ASUNTO = 150;
export const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024;
export const MAX_CORREOS_POR_HORA = 30;
const PREFIJO_ASUNTO = '[Golden Touch] ';
const REMITENTE_POR_DEFECTO = 'Golden Touch Inventario';
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** Correo individual: nada de espacios, comas ni punto y coma (evita listas coladas). */
const RX_CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** Nombre de adjunto permitido: solo las extensiones que hoy usa el front. */
const RX_NOMBRE_PDF = /^[\w.\- ]{1,120}\.pdf$/;
const RX_NOMBRE_TEXTO = /^[\w.\- ]{1,120}\.sql\.txt$/;
const RX_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Error de validación: el mensaje es nuestro (seguro de mostrar al usuario). */
export class ErrorCorreo extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Normaliza y valida una lista de destinatarios. Acepta string o array.
 * Lanza ErrorCorreo si alguno es inválido o si son más de 10.
 */
export function validarDestinatarios(entrada: unknown): string[] {
  const crudos = Array.isArray(entrada) ? entrada : entrada == null || entrada === '' ? [] : [entrada];
  const lista: string[] = [];
  for (const e of crudos) {
    if (typeof e !== 'string') throw new ErrorCorreo('Destinatario inválido');
    const limpio = e.trim().toLowerCase();
    if (!limpio) continue;
    if (limpio.length > 254 || !RX_CORREO.test(limpio)) throw new ErrorCorreo('Hay un correo de destino inválido');
    if (!lista.includes(limpio)) lista.push(limpio);
  }
  if (lista.length > MAX_DESTINATARIOS) {
    throw new ErrorCorreo(`Máximo ${MAX_DESTINATARIOS} destinatarios por envío`);
  }
  return lista;
}

/** Asunto de una línea, con prefijo de la empresa y largo acotado. */
export function normalizarAsunto(asunto: string): string {
  let s = String(asunto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!s) s = 'Reporte';
  if (!s.startsWith(PREFIJO_ASUNTO.trim())) s = PREFIJO_ASUNTO + s;
  return s.length > MAX_ASUNTO ? `${s.slice(0, MAX_ASUNTO - 1)}…` : s;
}

/**
 * Sanea el nombre del adjunto (sin acentos ni símbolos raros) y exige una de
 * las extensiones permitidas. `.sql.txt` solo si el llamador lo habilita.
 */
export function normalizarNombreAdjunto(nombre: string, permitirTexto: boolean): string {
  const limpio = String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\- ]+/, '')
    .trim();
  if (RX_NOMBRE_PDF.test(limpio)) return limpio;
  if (permitirTexto && RX_NOMBRE_TEXTO.test(limpio)) return limpio;
  throw new ErrorCorreo('Tipo de adjunto no permitido');
}

/** Decodifica y valida el base64 del adjunto (formato, tamaño y firma PDF). */
function validarContenido(base64: string, esPdf: boolean): void {
  const b64 = String(base64 ?? '').replace(/\s+/g, '');
  if (!b64 || b64.length % 4 !== 0 || !RX_BASE64.test(b64)) throw new ErrorCorreo('Adjunto inválido');
  const bytes = (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_ADJUNTO_BYTES) throw new ErrorCorreo('El adjunto supera el tamaño máximo (8 MB)', 413);
  let cabecera: string;
  try {
    cabecera = atob(b64.slice(0, 8));
  } catch {
    throw new ErrorCorreo('Adjunto inválido');
  }
  if (esPdf && !cabecera.startsWith('%PDF')) throw new ErrorCorreo('El adjunto no es un PDF válido');
}

/** Plantilla común del cuerpo: título + contenido + pie de Golden Touch. */
export function plantillaHtml(titulo: string, cuerpoHtml: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a">
      <h2 style="border-bottom:3px solid #ff8a00;padding-bottom:8px;margin-top:0">${escapeHtml(titulo)}</h2>
      ${cuerpoHtml}
      <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #ddd;padding-top:12px">
        GOLDEN TOUCH 1127 C.A. · Sistema de Gestión de Inventarios · Generado automáticamente
      </p>
    </div>`;
}

/**
 * Cliente que respeta RLS: usa la anon key con el Authorization del usuario.
 * Para leer registros "por id" sin saltarse los permisos de la base.
 */
export function clienteUsuario(req: Request): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!url || !anonKey || !authHeader) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Admin/jefe activos (máx. 10): destino por defecto cuando el usuario no indicó ninguno. */
export async function destinatariosPorDefecto(s: Sesion): Promise<string[]> {
  const { data, error } = await s.admin
    .from('usuarios')
    .select('email, estado')
    .in('role', ['admin', 'jefe'])
    .limit(50);
  if (error) {
    console.error('[brevo] no se pudo leer admin/jefe:', error.message);
    return [];
  }
  const correos = (data ?? [])
    .filter((u: { email: string | null; estado: string | null }) => !u.estado || u.estado === 'activo')
    .map((u: { email: string | null }) => String(u.email ?? '').trim().toLowerCase())
    .filter((e: string) => RX_CORREO.test(e));
  return [...new Set(correos)].slice(0, MAX_DESTINATARIOS);
}

export type Adjunto = { nombre: string; base64: string };

export type OpcionesCorreo = {
  sesion: Sesion;
  /** Nombre de la Edge Function (queda en correos_enviados). */
  funcion: string;
  to: string[];
  subject: string;
  html: string;
  adjunto?: Adjunto;
  /** Habilita adjuntos `.sql.txt` (solo el respaldo de la base). */
  permitirTexto?: boolean;
};

export type ResultadoCorreo = { destinatarios: string[]; id: string | null };

/**
 * Único punto de salida de correo. Valida todo, aplica el límite por usuario,
 * llama a Brevo con timeout y registra el envío. Lanza ErrorCorreo con un
 * mensaje apto para el usuario; nunca propaga el texto crudo de Brevo/Postgres.
 */
export async function enviarCorreo(o: OpcionesCorreo): Promise<ResultadoCorreo> {
  const destinatarios = validarDestinatarios(o.to);
  if (!destinatarios.length) throw new ErrorCorreo('Indicá al menos un correo de destino');
  const subject = normalizarAsunto(o.subject);

  let attachment: { name: string; content: string }[] | undefined;
  if (o.adjunto) {
    const nombre = normalizarNombreAdjunto(o.adjunto.nombre, Boolean(o.permitirTexto));
    const content = String(o.adjunto.base64 ?? '').replace(/\s+/g, '');
    validarContenido(content, nombre.endsWith('.pdf'));
    attachment = [{ name: nombre, content }];
  }

  // Límite por usuario: 30 correos en la última hora.
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: ce } = await o.sesion.admin
    .from('correos_enviados')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', o.sesion.userId)
    .gte('at', desde);
  if (ce) {
    console.error(`[${o.funcion}] no se pudo leer correos_enviados:`, ce.message);
    throw new ErrorCorreo('No se pudo enviar el correo. Intentá de nuevo más tarde.', 500);
  }
  if ((count ?? 0) >= MAX_CORREOS_POR_HORA) {
    throw new ErrorCorreo(`Alcanzaste el límite de ${MAX_CORREOS_POR_HORA} correos por hora. Intentá más tarde.`, 429);
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL');
  const fromName = Deno.env.get('BREVO_FROM_NAME') || REMITENTE_POR_DEFECTO;
  if (!brevoKey || !fromEmail) {
    console.error(`[${o.funcion}] faltan secrets de Brevo`);
    throw new ErrorCorreo('El envío de correo no está configurado.', 500);
  }

  let resp: Response;
  try {
    resp = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: destinatarios.map((email) => ({ email })),
        subject,
        htmlContent: o.html,
        ...(attachment ? { attachment } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error(`[${o.funcion}] fetch a Brevo falló (${destinatarios.length} destinatario/s):`, e instanceof Error ? e.name : String(e));
    throw new ErrorCorreo('No se pudo contactar al servicio de correo. Intentá de nuevo.', 502);
  }

  const respText = await resp.text();
  let respJson: { messageId?: string; message?: string; code?: string } | null = null;
  try { respJson = respText ? JSON.parse(respText) : null; } catch { /* texto plano */ }
  if (!resp.ok) {
    console.error(`[${o.funcion}] Brevo HTTP ${resp.status} code=${respJson?.code ?? '-'}:`, (respJson?.message ?? respText).slice(0, 300));
    throw new ErrorCorreo('El servicio de correo rechazó el envío.', 502);
  }

  const { error: ie } = await o.sesion.admin.from('correos_enviados').insert({
    user_id: o.sesion.userId,
    funcion: o.funcion,
    destinatarios: destinatarios.length,
    asunto: subject,
  });
  if (ie) console.error(`[${o.funcion}] no se pudo registrar el envío:`, ie.message);

  return { destinatarios, id: respJson?.messageId ?? null };
}

/** Convierte cualquier error en una respuesta JSON segura para el cliente. */
export function respuestaDeError(funcion: string, e: unknown): Response {
  if (e instanceof ErrorCorreo) return json({ error: e.message }, e.status);
  console.error(`[${funcion}] error inesperado:`, e instanceof Error ? e.message : String(e));
  return json({ error: 'No se pudo enviar el correo.' }, 500);
}

const RX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida un id uuid recibido del cliente (evita que Postgres devuelva su error crudo). */
export function exigirUuid(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !RX_UUID.test(v)) throw new ErrorCorreo(`${campo} inválido`);
  return v;
}

/** Lee el body JSON o lanza ErrorCorreo 400. */
export async function leerJson<T>(req: Request): Promise<T> {
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object') throw new Error('no-object');
    return b as T;
  } catch {
    throw new ErrorCorreo('Body JSON inválido');
  }
}
