import { Link } from 'react-router-dom';
import './tesoreriaMovil.css';

interface Props {
  canWrite: boolean;
  loading: boolean;
  movimientos: boolean;
  volver?: string;
  onPagar: () => void;
  onConvertir: () => void;
  onMovimientos: () => void;
}

export function TesoreriaMovilView({ canWrite, loading, movimientos, volver, onPagar, onConvertir, onMovimientos }: Props) {
  return (
    <header className="tesoreria-movil-inicio">
      <div className="tesoreria-movil-titulo">
        <h1>Tesorería</h1>
        {volver && <Link className="btn btn-ghost" to={volver}>{volver === '/app/telefono' ? 'Mis pantallas' : 'Vista PC'}</Link>}
      </div>
      <div className="tesoreria-movil-acciones">
        {canWrite && (
          <>
            <button type="button" className="btn tesoreria-movil-pagar" disabled={loading} onClick={onPagar}>
              <span className="tesoreria-movil-icono" aria-hidden="true">🧾</span>
              <span>Pagar OC y servicios</span>
              <span className="tesoreria-movil-flecha" aria-hidden="true">›</span>
            </button>
            <button type="button" className="btn tesoreria-movil-acceso" disabled={loading} onClick={onConvertir}>
              <span className="tesoreria-movil-icono" aria-hidden="true">⇄</span>
              <span>Convertir</span>
            </button>
          </>
        )}
        <button type="button" className="btn tesoreria-movil-acceso" aria-pressed={movimientos} onClick={onMovimientos}>
          <span className="tesoreria-movil-icono" aria-hidden="true">☷</span>
          <span>Movimientos</span>
        </button>
      </div>
    </header>
  );
}
