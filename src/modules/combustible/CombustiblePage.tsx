import { Link } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { TanquesView } from './TanquesView';
import { useAlertaCombustiblePush } from './useAlertaCombustiblePush';

/**
 * Módulo Combustible. La sección «Solicitudes de salida» se retiró de la interfaz
 * por pedido del usuario; el módulo muestra el control de diésel por tanque
 * (libro mayor estilo Excel, con cubicación, retorno y conciliación). El backend
 * y los datos de solicitudes se conservan por si se reactivan más adelante.
 */
export function CombustiblePage() {
  // Un rol solo teléfono no llega aquí: RequireModule lo manda a su pantalla de teléfono.
  const { puedeVista } = usePermissions();

  // Notificación push al acceder al módulo si la alerta roja de poco combustible está activa
  useAlertaCombustiblePush('modulo');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0 }}>
            ⛽ Combustible
          </h1>
          <p className="muted" style={{ margin: '.2rem 0 0 0', fontSize: '.84rem' }}>
            Control ejecutivo de tanques, despachos a maquinaria, telemetría y conciliación
          </p>
        </div>
        <div className="actions">
          {puedeVista('surtidor') && (
            <Link
              to="/app/combustible/surtidor"
              className="btn btn-ghost"
              title="La pantalla del surtidor, con botones grandes para el teléfono"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontWeight: 600 }}
            >
              <span>📱</span> Vista teléfono
            </Link>
          )}
        </div>
      </div>

      <TanquesView />
    </div>
  );
}
