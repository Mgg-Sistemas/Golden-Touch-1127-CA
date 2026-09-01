import type { DetalleServicioItem } from '@/shared/lib/types';

/**
 * Editor del "detalle del servicio": una lista opcional de renglones (parte/pieza +
 * descripción de lo que se hará). Sirve, por ejemplo, para detallar una reparación:
 * qué piezas y qué se hace en cada una. Se puede agregar/quitar renglones. Reutilizado
 * por Servicio Directo y por la Solicitud/Orden de Servicio.
 */
export function DetalleServicioEditor({
  value,
  onChange,
  titulo = 'Detalle del servicio (opcional)',
}: {
  value: DetalleServicioItem[];
  onChange: (next: DetalleServicioItem[]) => void;
  titulo?: string;
}) {
  const filas = value ?? [];
  const set = (i: number, patch: Partial<DetalleServicioItem>) =>
    onChange(filas.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const agregar = () => onChange([...filas, { parte: '', descripcion: '' }]);
  const quitar = (i: number) => onChange(filas.filter((_, k) => k !== i));

  return (
    <div className="form-row">
      <label>{titulo}</label>
      <div className="muted" style={{ fontSize: '.72rem', marginTop: '-.15rem', marginBottom: '.4rem' }}>
        Ej.: si es una reparación, detallá cada pieza y qué se le hará. Aparece en el PDF.
      </div>
      {filas.length > 0 && (
        <div style={{ display: 'grid', gap: '.4rem', marginBottom: '.5rem' }}>
          {filas.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '.4rem', alignItems: 'start' }}>
              <input
                className="input"
                placeholder="Pieza / parte"
                value={f.parte}
                onChange={(e) => set(i, { parte: e.target.value })}
              />
              <input
                className="input"
                placeholder="Qué se hará (descripción)"
                value={f.descripcion}
                onChange={(e) => set(i, { descripcion: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => quitar(i)}
                title="Quitar renglón"
                style={{ color: 'var(--danger)' }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-sm btn-ghost" onClick={agregar} style={{ alignSelf: 'flex-start' }}>
        ＋ Agregar detalle
      </button>
    </div>
  );
}

/** Normaliza la lista: quita renglones totalmente vacíos y recorta espacios. */
export function limpiarDetalleServicio(filas: DetalleServicioItem[] | null | undefined): DetalleServicioItem[] {
  return (filas ?? [])
    .map((f) => ({ parte: (f.parte ?? '').trim(), descripcion: (f.descripcion ?? '').trim() }))
    .filter((f) => f.parte || f.descripcion);
}
