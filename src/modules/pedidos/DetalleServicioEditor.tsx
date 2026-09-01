import type { DetalleServicioItem } from '@/shared/lib/types';

/** Suma de los precios de los renglones del detalle (los vacíos cuentan como 0). */
export function totalDetalleServicio(filas: DetalleServicioItem[] | null | undefined): number {
  const t = (filas ?? []).reduce((acc, f) => acc + (Number(f.precio) || 0), 0);
  return Math.round(t * 100) / 100;
}

/**
 * Editor del "detalle del servicio": una lista opcional de renglones (parte/pieza +
 * descripción de lo que se hará + precio opcional). Sirve, por ejemplo, para detallar
 * una reparación: qué piezas, qué se hace y cuánto cuesta cada una. Los precios van
 * sumando el "Total del detalle". Se puede agregar/quitar renglones. Reutilizado por
 * Servicio Directo y por la Solicitud/Orden de Servicio.
 */
export function DetalleServicioEditor({
  value,
  onChange,
  titulo = 'Detalle del servicio (opcional)',
  simboloMoneda = '$',
}: {
  value: DetalleServicioItem[];
  onChange: (next: DetalleServicioItem[]) => void;
  titulo?: string;
  simboloMoneda?: string;
}) {
  const filas = value ?? [];
  const set = (i: number, patch: Partial<DetalleServicioItem>) =>
    onChange(filas.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const agregar = () => onChange([...filas, { parte: '', descripcion: '', precio: null }]);
  const quitar = (i: number) => onChange(filas.filter((_, k) => k !== i));
  const total = totalDetalleServicio(filas);

  return (
    <div className="form-row">
      <label>{titulo}</label>
      <div className="muted" style={{ fontSize: '.72rem', marginTop: '-.15rem', marginBottom: '.4rem' }}>
        Ej.: si es una reparación, detallá cada pieza, qué se le hará y su precio (opcional). El precio va sumando. Aparece en el PDF.
      </div>
      {filas.length > 0 && (
        <div style={{ display: 'grid', gap: '.4rem', marginBottom: '.5rem' }}>
          {filas.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 120px auto', gap: '.4rem', alignItems: 'start' }}>
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
              <input
                className="input mono"
                inputMode="decimal"
                placeholder="Precio"
                value={f.precio == null ? '' : String(f.precio)}
                onChange={(e) => {
                  const raw = e.target.value.replace(',', '.').trim();
                  set(i, { precio: raw === '' ? null : (Number(raw) || 0) });
                }}
                style={{ textAlign: 'right' }}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={agregar} style={{ alignSelf: 'flex-start' }}>
          ＋ Agregar detalle
        </button>
        {total > 0 && (
          <div style={{ fontWeight: 700, fontSize: '.9rem' }}>
            Total del detalle: <span className="mono">{simboloMoneda}{total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Normaliza la lista: quita renglones totalmente vacíos, recorta espacios y
 *  conserva el precio (null cuando no se cargó). */
export function limpiarDetalleServicio(filas: DetalleServicioItem[] | null | undefined): DetalleServicioItem[] {
  return (filas ?? [])
    .map((f) => {
      const precio = f.precio == null || f.precio === undefined ? null : (Number(f.precio) || 0);
      return { parte: (f.parte ?? '').trim(), descripcion: (f.descripcion ?? '').trim(), precio };
    })
    .filter((f) => f.parte || f.descripcion || (f.precio ?? 0) > 0);
}
