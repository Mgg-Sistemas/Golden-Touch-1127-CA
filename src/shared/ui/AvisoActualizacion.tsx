import { useVersionCheck } from '@/shared/lib/useVersionCheck';

/**
 * Banner global que aparece SOLO cuando se detecta un despliegue real (cambio en
 * main ya publicado). NO se puede ocultar: persiste hasta que el usuario pulsa
 * «Actualizar ahora» (recarga la página y trae la última versión). Así se fuerza
 * a todos los usuarios a refrescar el sistema tras cada actualización.
 */
export function AvisoActualizacion() {
  const { hayActualizacion } = useVersionCheck();
  if (!hayActualizacion) return null;

  return (
    <div className="update-banner" role="alert" aria-live="assertive">
      <span className="update-banner__icon" aria-hidden="true">🔄</span>
      <div className="update-banner__text">
        <strong>El sistema se actualizó.</strong>{' '}
        Recargá para usar la última versión (guardá lo que estés escribiendo).
      </div>
      <button className="btn btn-primary update-banner__btn" onClick={() => window.location.reload()}>
        Actualizar ahora
      </button>
    </div>
  );
}
