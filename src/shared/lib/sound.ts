/**
 * Golden Touch · Notification sound (Web Audio API, sin archivos externos).
 * - Sonido base: doble-beep (~360 ms) volumen medio.
 * - Modo patrón: doble-beep cada 1.5 s durante N segundos (configurable).
 * Respeta preferencias de Ajustes vía localStorage.
 */

const PREF_ENABLED = 'mgg.pref.notifEnabled';
const PREF_SOUND = 'mgg.pref.notifSound';
const PREF_DURATION = 'mgg.pref.notifDuration';

let ctx: AudioContext | null = null;
let userInteracted = false;
let activePatternTimer: number | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const W = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext || W.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
}

function tone(freq: number, durationMs: number, gain: number, startOffsetMs = 0) {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffsetMs / 1000;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

function doubleBeep() {
  tone(880, 160, 0.12, 0);
  tone(660, 180, 0.12, 170);
}

/** Preferencias persistidas en localStorage (con defaults sensatos). */
export function getNotifPrefs(): { enabled: boolean; sound: boolean; duration: number } {
  if (typeof window === 'undefined') return { enabled: true, sound: true, duration: 10 };
  const enabled = localStorage.getItem(PREF_ENABLED);
  const sound = localStorage.getItem(PREF_SOUND);
  const duration = Number(localStorage.getItem(PREF_DURATION) ?? '10');
  return {
    enabled: enabled === null ? true : enabled === '1',
    sound: sound === null ? true : sound === '1',
    duration: Number.isFinite(duration) && duration >= 3 && duration <= 30 ? duration : 10,
  };
}

export function setNotifPrefs(patch: Partial<{ enabled: boolean; sound: boolean; duration: number }>) {
  if (typeof window === 'undefined') return;
  if (typeof patch.enabled === 'boolean') localStorage.setItem(PREF_ENABLED, patch.enabled ? '1' : '0');
  if (typeof patch.sound === 'boolean') localStorage.setItem(PREF_SOUND, patch.sound ? '1' : '0');
  if (typeof patch.duration === 'number') localStorage.setItem(PREF_DURATION, String(Math.max(3, Math.min(30, patch.duration))));
}

/**
 * Toca un doble-beep simple si las preferencias lo permiten. Sin repetición.
 * Usado automáticamente por `toast()` / `notify()`.
 */
export function playNotificationSound() {
  if (!userInteracted) return;
  const { enabled, sound } = getNotifPrefs();
  if (!enabled || !sound) return;
  doubleBeep();
}

/**
 * Toca el patrón (doble-beep cada 1.5 s) durante `durationSec` segundos.
 * Si no se pasa duración, usa la de preferencias.
 */
export function playNotificationPattern(durationSec?: number) {
  stopNotificationPattern();
  const c = ensureCtx();
  if (!c) return;
  const { duration } = getNotifPrefs();
  const totalSec = Math.max(1, Math.min(30, durationSec ?? duration));
  const start = Date.now();
  function tick() {
    doubleBeep();
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed >= totalSec) { activePatternTimer = null; return; }
    activePatternTimer = window.setTimeout(tick, 1500);
  }
  tick();
}

export function stopNotificationPattern() {
  if (activePatternTimer != null) {
    clearTimeout(activePatternTimer);
    activePatternTimer = null;
  }
}

function markInteracted() {
  if (userInteracted) return;
  userInteracted = true;
  ensureCtx();
}

export function initSound() {
  if (typeof window === 'undefined') return;
  const handler = () => {
    markInteracted();
    window.removeEventListener('click', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('touchstart', handler);
  };
  window.addEventListener('click', handler);
  window.addEventListener('keydown', handler);
  window.addEventListener('touchstart', handler);
}
