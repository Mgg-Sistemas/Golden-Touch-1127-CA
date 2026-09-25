import { Link, Navigate } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { TanquesView } from './TanquesView';
import { ROL_SURTIDOR } from './SurtidorMovilView';

/**
 * Módulo Combustible. La sección «Solicitudes de salida» se retiró de la interfaz
 * por pedido del usuario; el módulo muestra el control de diésel por tanque
 * (libro mayor estilo Excel, con cubicación, retorno y conciliación). El backend
 * y los datos de solicitudes se conservan por si se reactivan más adelante.
 */
export function CombustiblePage() {
  const { role, loading } = usePermissions();
  // El rol COMBUSTIBLE (surtidor) trabaja desde el teléfono: no ve el módulo de PC.
  if (!loading && role === ROL_SURTIDOR) return <Navigate to="/app/combustible/surtidor" replace />;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>⛽ Combustible</h1>
        </div>
        <div className="actions">
          <Link to="/app/combustible/surtidor" className="btn btn-ghost" title="La pantalla del surtidor, con botones grandes para el teléfono">📱 Vista teléfono</Link>
        </div>
      </div>

      <TanquesView />
    </div>
  );
}
