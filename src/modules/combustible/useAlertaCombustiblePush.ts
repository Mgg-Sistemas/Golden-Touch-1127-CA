import { useEffect, useRef } from 'react';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  notificarCombustibleBajoSiAplica,
  tienePermisoCombustible,
  type TipoAccesoCombustible,
} from './alertaCombustiblePush';

/**
 * Hook para disparar la notificación push de poco combustible en los tanques
 * cuando el usuario accede al sistema o al módulo correspondiente.
 *
 * Anti-saturación: solo se envía UNA vez por acceso si la alerta roja está activa.
 */
export function useAlertaCombustiblePush(tipoAcceso: TipoAccesoCombustible) {
  const perms = usePermissions();
  const evaluadoRef = useRef(false);

  useEffect(() => {
    // Si aún está cargando la sesión/permisos, esperar
    if (perms.loading) return;

    // Verificar si el usuario tiene algún permiso sobre combustible
    if (!tienePermisoCombustible(perms)) return;

    // Evitar múltiples llamadas síncronas en el mismo montaje
    if (evaluadoRef.current) return;
    evaluadoRef.current = true;

    // Evaluar y emitir si la alerta roja está activa
    void notificarCombustibleBajoSiAplica({
      tipoAcceso,
      perms,
    });
  }, [tipoAcceso, perms]);

  // Si en tiempo real entran compras o salidas de combustible, permitir reevaluación suave
  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos'], () => {
    if (!perms.loading && tienePermisoCombustible(perms)) {
      void notificarCombustibleBajoSiAplica({
        tipoAcceso,
        perms,
      });
    }
  });
}
