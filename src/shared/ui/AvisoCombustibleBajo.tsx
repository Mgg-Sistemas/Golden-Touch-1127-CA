import { useCallback, useEffect, useRef, useState } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { num } from '@/shared/lib/format';
import { combustibleDisponibleGeneral, UMBRAL_COMBUSTIBLE_BAJO } from '@/modules/combustible/tanques.repository';
import { push as pushNotif, markReadByDedup } from '@/modules/notificaciones/notif.repository';
import { emitNotifRefresh } from '@/shared/lib/notify';

/** Cada cuánto reaparece el aviso tras cerrarlo (2 horas). */
const SNOOZE_MS = 2 * 60 * 60 * 1000;
/** Clave de «pospuesto hasta» en localStorage (por usuario/navegador). */
const SNOOZE_KEY = 'gt.combustible.aviso.snoozeUntil';
/** dedup_key de la notificación de campana (una sola mientras dure el combustible bajo). */
const DEDUP = 'combustible:bajo';

function leerSnooze(): number {
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) || 0; } catch { return 0; }
}

/**
 * Banner global «hay que comprar combustible». Aparece cuando el combustible del
 * grupo GENERAL (primera tarjeta, sin los Brasileros) baja a {@link UMBRAL_COMBUSTIBLE_BAJO}
 * o menos. Solo lo ven los usuarios con permiso en Tesorería, Combustible o Inventario,
 * y los administradores. Tiene un botón para cerrarlo y reaparece cada 2 h hasta que se
 * compre el combustible y entre en los totales. Además deja una notificación en la campana.
 */
export function AvisoCombustibleBajo() {
  const { isAdmin, can } = usePermissions();
  const audiencia = isAdmin || can('tesoreria') || can('combustible') || can('inventario');

  const [litros, setLitros] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [snoozeUntil, setSnoozeUntil] = useState<number>(() => leerSnooze());
  const pushedRef = useRef(false);   // ya empujamos la notif en este episodio de bajo
  const clearedRef = useRef(false);  // ya apagamos la notif en este episodio de repuesto

  const cargar = useCallback(() => {
    if (!audiencia) return;
    combustibleDisponibleGeneral().then(setLitros).catch(() => { /* RLS/offline: se reintenta */ });
  }, [audiencia]);

  useEffect(() => { cargar(); }, [cargar]);
  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos'], cargar);

  // Refresco de respaldo cada 10 min (por si Realtime no llega) y tick de 1 min para
  // re-evaluar el «pospuesto hasta» (así reaparece a las 2 h sin recargar la página).
  useEffect(() => {
    if (!audiencia) return;
    const t = setInterval(cargar, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [audiencia, cargar]);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const bajo = litros != null && litros <= UMBRAL_COMBUSTIBLE_BAJO;

  // Campana: una notif mientras el combustible esté bajo; se apaga al reponerse.
  useEffect(() => {
    if (litros == null || !audiencia) return;
    if (bajo) {
      clearedRef.current = false;
      if (!pushedRef.current) {
        pushedRef.current = true;
        pushNotif({
          destino: 'all', kind: 'warning',
          title: '⛽ Hay que comprar combustible',
          message: `El combustible disponible bajó a ${num(litros)} ltrs (umbral ${num(UMBRAL_COMBUSTIBLE_BAJO)}). Se debe reponer.`,
          link: '#/app/combustible',
          dedup_key: DEDUP,
        }).then((creada) => { if (creada) emitNotifRefresh(); }).catch(() => { /* best-effort */ });
      }
    } else {
      pushedRef.current = false;
      if (!clearedRef.current) {
        clearedRef.current = true;
        markReadByDedup(DEDUP).then(() => emitNotifRefresh()).catch(() => { /* best-effort */ });
      }
      // Repuesto el combustible: limpiamos el «pospuesto» para un futuro bajón fresco.
      try { localStorage.removeItem(SNOOZE_KEY); } catch { /* sin storage */ }
      if (snoozeUntil) setSnoozeUntil(0);
    }
  }, [litros, bajo, audiencia, snoozeUntil]);

  function cerrar() {
    const until = Date.now() + SNOOZE_MS;
    try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* sin storage */ }
    setSnoozeUntil(until);
  }

  if (!audiencia || !bajo || ahora < snoozeUntil) return null;

  return (
    <div
      role="alert"
      className="alert-pulse-warn"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
        flexWrap: 'wrap',
        background: 'color-mix(in srgb, var(--danger) 14%, var(--surface))',
        border: '1px solid var(--danger)',
        borderRadius: 'var(--r-md)',
        padding: '.7rem .9rem',
        marginBottom: '1rem',
      }}
    >
      <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>⛽</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <strong style={{ color: 'var(--danger)' }}>Hay que comprar combustible</strong>
        <div style={{ fontSize: '.88rem', marginTop: '.15rem' }}>
          El combustible disponible bajó a <strong className="mono">{num(litros ?? 0)} ltrs</strong>, en o por debajo
          del mínimo de <strong className="mono">{num(UMBRAL_COMBUSTIBLE_BAJO)} ltrs</strong>. Se debe reponer; este
          aviso volverá a aparecer cada 2 horas hasta que la compra entre en los totales.
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={cerrar}
        title="Cerrar (vuelve a aparecer en 2 horas si el combustible sigue bajo)"
      >
        ✕ Cerrar
      </button>
    </div>
  );
}
