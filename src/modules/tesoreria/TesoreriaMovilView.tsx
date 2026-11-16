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
        <h1>🏦 Tesorería</h1>
        {volver && <Link className="btn btn-ghost" to={volver}>{volver === '/app/telefono' ? 'Mis pantallas' : 'Vista PC'}</Link>}
      </div>
      <div className="tesoreria-movil-acciones">
        {canWrite && (
          <>
            <button type="button" className="btn btn-primary" disabled={loading} onClick={onPagar}>🧾 Pagar OC y servicios</button>
            <button type="button" className="btn btn-ghost" disabled={loading} onClick={onConvertir}>💱 Convertir</button>
          </>
        )}
        <button type="button" className={`btn ${movimientos ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={movimientos} onClick={onMovimientos}>📒 Movimientos</button>
      </div>
    </header>
  );
}
