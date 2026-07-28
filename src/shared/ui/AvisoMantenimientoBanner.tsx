import { useEffect, useMemo, useState } from 'react';
import { useRealtime } from '@/shared/lib/useRealtime';
import { getAvisoMantenimiento, type AvisoMantenimiento } from '@/modules/sistema/avisoMantenimiento.repository';

/** «faltan 4m 20s» a partir de milisegundos restantes. */
function formatRestante(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const seg = s % 60;
  if (m <= 0) return `${seg}s`;
  return `${m}m ${String(seg).padStart(2, '0')}s`;
}

/**
 * Banner global de mantenimiento. Cuando un admin activa el aviso, todas las
 * sesiones lo ven (vía Realtime) para guardar su progreso antes del despliegue.
 * Mantiene los estilos del sistema (clases/variables CSS existentes).
 */
export function AvisoMantenimientoBanner() {
  const [aviso, setAviso] = useState<AvisoMantenimiento | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = () => { getAvisoMantenimiento().then(setAviso).catch(() => { /* silencioso */ }); };
  useEffect(cargar, []);
  useRealtime(['aviso_mantenimiento'], cargar);

  // Tick de 1s mientras el banner esté activo: refresca la cuenta regresiva y,
  // sin cuenta regresiva, permite que el banner se auto-oculte al vencer la
  // ventana de mantenimiento sin necesidad de recargar.
  const programadoMs = aviso?.programado_at ? new Date(aviso.programado_at).getTime() : null;
  useEffect(() => {
    if (!aviso?.activo) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [aviso?.activo]);

  const restante = useMemo(() => (programadoMs ? programadoMs - ahora : null), [programadoMs, ahora]);

  // Auto-expiración: aunque `activo` quede en true (p.ej. un despliegue que no
  // alcanzó a apagarlo), el banner deja de mostrarse pasada la ventana de
  // mantenimiento + un margen amplio. Así un flag olvidado nunca atrapa a los
  // usuarios para siempre y «Actualizar ahora» sí lo quita al recargar.
  const inicioMs = programadoMs ?? (aviso?.updated_at ? new Date(aviso.updated_at).getTime() : null);
  const ventanaMin = aviso?.minutos && aviso.minutos > 0 ? aviso.minutos : 2;
  const MARGEN_MIN = 20; // holgura para builds/colas lentas
  const expiraMs = inicioMs != null ? inicioMs + (ventanaMin + MARGEN_MIN) * 60_000 : null;
  const expirado = expiraMs != null && ahora > expiraMs;

  if (!aviso?.activo || expirado) return null;

  const enCuentaRegresiva = restante != null && restante > 0;
  const mensaje = aviso.mensaje?.trim()
    || 'Se hará una actualización del sistema. Por favor, guardá tu progreso.';

  return (
    <div
      role="alert"
      className="alert-pulse-warn"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
        flexWrap: 'wrap',
        background: 'color-mix(in srgb, var(--warning) 16%, var(--surface))',
        border: '1px solid var(--warning)',
        borderRadius: 'var(--r-md)',
        padding: '.7rem .9rem',
        marginBottom: '1rem',
      }}
    >
      <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>🛠️</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <strong style={{ color: 'var(--warning)' }}>Mantenimiento del sistema</strong>
        <div style={{ fontSize: '.88rem', marginTop: '.15rem' }}>
          {mensaje}
          {aviso.minutos ? ` El sistema volverá a estar disponible en aproximadamente ${aviso.minutos} minuto${aviso.minutos === 1 ? '' : 's'}.` : ''}
        </div>
      </div>
      {enCuentaRegresiva && (
        <div
          className="mono"
          title="Tiempo restante para la actualización"
          style={{
            textAlign: 'center',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm, 8px)',
            padding: '.35rem .6rem',
            minWidth: 92,
          }}
        >
          <div style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.04em', opacity: .7 }}>faltan</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--warning)' }}>{formatRestante(restante!)}</div>
        </div>
      )}
      {/* Botón para forzar el refresco: recarga la página y trae la última versión. */}
      <button
        className="btn btn-primary"
        style={{ whiteSpace: 'nowrap' }}
        title="Recargar el sistema ahora para tomar la última versión"
        onClick={() => window.location.reload()}
      >
        🔄 Actualizar ahora
      </button>
    </div>
  );
}
