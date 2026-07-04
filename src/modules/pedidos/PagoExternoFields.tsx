/* ============================================================
   Golden Touch · Apartado "Pago a externo"
   Check reutilizable para Compra Directa y Servicio Directo: cuando
   una persona EXTERNA pagó de su bolsillo, se marca y se cargan sus
   datos para poder reintegrarle el dinero. Se muestra en el detalle
   y en Tesorería (movimiento del pago).
   ============================================================ */
import type { PagoExternoInput } from './compras.repository';

export interface PagoExternoState {
  activo: boolean;
  nombre: string;
  cedula: string;
  telefono: string;
  nota: string;
}

export const PAGO_EXTERNO_VACIO: PagoExternoState = { activo: false, nombre: '', cedula: '', telefono: '', nota: '' };

/** Reconstruye el estado del apartado desde una fila de compra/servicio directo. */
export function pagoExternoDesdeRow(row?: {
  pago_externo?: boolean | null;
  pago_externo_nombre?: string | null;
  pago_externo_cedula?: string | null;
  pago_externo_telefono?: string | null;
  pago_externo_nota?: string | null;
} | null): PagoExternoState {
  if (!row) return { ...PAGO_EXTERNO_VACIO };
  return {
    activo: !!row.pago_externo,
    nombre: row.pago_externo_nombre ?? '',
    cedula: row.pago_externo_cedula ?? '',
    telefono: row.pago_externo_telefono ?? '',
    nota: row.pago_externo_nota ?? '',
  };
}

/** Convierte el estado del apartado al input del repositorio. */
export function pagoExternoAInput(s: PagoExternoState): PagoExternoInput {
  return { activo: s.activo, nombre: s.nombre, cedula: s.cedula, telefono: s.telefono, nota: s.nota };
}

export function PagoExternoFields({ value, onChange }: {
  value: PagoExternoState;
  onChange: (v: PagoExternoState) => void;
}) {
  const set = (patch: Partial<PagoExternoState>) => onChange({ ...value, ...patch });
  return (
    <div className="card" style={{ marginTop: '.75rem', borderColor: value.activo ? 'var(--warning)' : undefined }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer', margin: 0 }}>
        <input type="checkbox" checked={value.activo} onChange={(e) => set({ activo: e.target.checked })} />
        <strong>💵 Pago a externo</strong>
        <span className="muted" style={{ fontSize: '.78rem' }}>(lo pagó otra persona · debe reintegrársele)</span>
      </label>

      {value.activo && (
        <div style={{ marginTop: '.6rem' }}>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: 0 }}>
            Ingresar datos de la persona externa que pagó:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.6rem' }}>
            <div className="form-row">
              <label>Nombre y apellido</label>
              <input className="input" value={value.nombre} onChange={(e) => set({ nombre: e.target.value })}
                placeholder="Ej. JUAN PÉREZ" />
            </div>
            <div className="form-row">
              <label>Cédula / RIF <span className="muted">(opcional)</span></label>
              <input className="input" value={value.cedula} onChange={(e) => set({ cedula: e.target.value })}
                placeholder="Ej. V-12.345.678" />
            </div>
            <div className="form-row">
              <label>Teléfono <span className="muted">(opcional)</span></label>
              <input className="input" value={value.telefono} onChange={(e) => set({ telefono: e.target.value })}
                placeholder="Ej. 0412-1234567" />
            </div>
            <div className="form-row">
              <label>Nota / forma de reintegro <span className="muted">(opcional)</span></label>
              <input className="input" value={value.nota} onChange={(e) => set({ nota: e.target.value })}
                placeholder="Ej. Reintegrar por Pago Móvil" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
