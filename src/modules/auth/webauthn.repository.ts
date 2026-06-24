/* ============================================================
   Golden Touch · Login con huella (WebAuthn / passkeys)
   Login rápido por dispositivo (opt-in). La contraseña sigue
   como respaldo. El navegador nunca expone la huella en crudo:
   el sistema operativo firma un reto y acá solo manejamos esa
   firma vía las Edge Functions webauthn-register / webauthn-login.
   ============================================================ */
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { supabase } from '@/shared/lib/supabase';

/** Email enrolado en ESTE dispositivo (pista local para ofrecer la huella en el login). */
const HINT_KEY = 'gt.webauthn.email';

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}
export function huellaHint(): string | null {
  try { return localStorage.getItem(HINT_KEY); } catch { return null; }
}
function setHuellaHint(email: string) { try { localStorage.setItem(HINT_KEY, email); } catch { /* ignore */ } }
export function limpiarHuellaHint() { try { localStorage.removeItem(HINT_KEY); } catch { /* ignore */ } }

/** Nombre legible del equipo, a partir del navegador/SO. */
export function etiquetaDispositivo(): string {
  const ua = navigator.userAgent;
  let so = 'Equipo';
  if (/Windows/i.test(ua)) so = 'Windows';
  else if (/Android/i.test(ua)) so = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) so = 'iPhone/iPad';
  else if (/Mac OS X/i.test(ua)) so = 'Mac';
  else if (/Linux/i.test(ua)) so = 'Linux';
  let nav = 'navegador';
  if (/Edg\//i.test(ua)) nav = 'Edge';
  else if (/Chrome\//i.test(ua)) nav = 'Chrome';
  else if (/Firefox\//i.test(ua)) nav = 'Firefox';
  else if (/Safari\//i.test(ua)) nav = 'Safari';
  return `${so} · ${nav}`;
}

/** Invoca una Edge Function y normaliza el error (lee el JSON del cuerpo si lo hay). */
async function invocar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      if (ctx?.json) { const j = await ctx.json(); if (j?.error) msg = j.error; }
    } catch { /* sin cuerpo JSON */ }
    throw new Error(msg);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** Registra la huella del usuario AUTENTICADO en el dispositivo actual. */
export async function enrolarHuella(deviceLabel?: string): Promise<void> {
  if (!isWebAuthnSupported()) throw new Error('Este equipo/navegador no soporta huella.');
  const opciones = await invocar<PublicKeyCredentialCreationOptionsJSON>('webauthn-register', { action: 'options' });
  // El SO pide la huella y devuelve la credencial firmada.
  const attResp = await startRegistration({ optionsJSON: opciones });
  await invocar('webauthn-register', {
    action: 'verify',
    response: attResp,
    deviceLabel: (deviceLabel || etiquetaDispositivo()).slice(0, 80),
  });
  const { data: u } = await supabase.auth.getUser();
  if (u?.user?.email) setHuellaHint(u.user.email);
}

/** Entra con huella (sin contraseña). Abre sesión de Supabase al verificar. */
export async function loginConHuella(email: string): Promise<void> {
  if (!isWebAuthnSupported()) throw new Error('Este equipo/navegador no soporta huella.');
  const correo = email.trim().toLowerCase();
  if (!correo) throw new Error('Indicá el correo.');
  const opciones = await invocar<PublicKeyCredentialRequestOptionsJSON>('webauthn-login', { action: 'options', email: correo });
  const authResp = await startAuthentication({ optionsJSON: opciones });
  const res = await invocar<{ token_hash: string; email: string }>('webauthn-login', { action: 'verify', email: correo, response: authResp });
  if (!res?.token_hash) throw new Error('No se pudo iniciar sesión.');
  const { error } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' });
  if (error) throw error;
  setHuellaHint(res.email || correo);
}

/* ── Gestión de dispositivos del propio usuario ── */
export interface DispositivoHuella {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}
export async function listarDispositivos(): Promise<DispositivoHuella[]> {
  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select('id, device_label, created_at, last_used_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DispositivoHuella[];
}
export async function eliminarDispositivo(id: string): Promise<void> {
  const { error } = await supabase.from('webauthn_credentials').delete().eq('id', id);
  if (error) throw error;
}
