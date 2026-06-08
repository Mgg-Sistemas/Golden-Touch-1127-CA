import { TanquesView } from './TanquesView';

/**
 * Módulo Combustible. La sección «Solicitudes de salida» se retiró de la interfaz
 * por pedido del usuario; el módulo muestra el control de diésel por tanque
 * (libro mayor estilo Excel, con cubicación, retorno y conciliación). El backend
 * y los datos de solicitudes se conservan por si se reactivan más adelante.
 */
export function CombustiblePage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>⛽ Combustible</h1>
        </div>
      </div>

      <TanquesView />
    </div>
  );
}
