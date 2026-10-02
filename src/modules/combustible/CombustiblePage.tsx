import { Link } from 'react-router-dom';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { TanquesView } from './TanquesView';

/**
 * Módulo Combustible. La sección «Solicitudes de salida» se retiró de la interfaz
 * por pedido del usuario; el módulo muestra el control de diésel por tanque
 * (libro mayor estilo Excel, con cubicación, retorno y conciliación). El backend
 * y los datos de solicitudes se conservan por si se reactivan más adelante.
 */
export function CombustiblePage() {
  // Un rol solo teléfono no llega aquí: RequireModule lo manda a su pantalla de teléfono.
  const { puedeVista } = usePermissions();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>⛽ Combustible</h1>
        </div>
        <div className="actions">
          {puedeVista('surtidor') && <Link to="/app/combustible/surtidor" className="btn btn-ghost" title="La pantalla del surtidor, con botones grandes para el teléfono">📱 Vista teléfono</Link>}
        </div>
      </div>

      <TanquesView />
    </div>
  );
}
