/* ============================================================
   Selector de actividad económica (CIIU · SENIAT) con buscador. Si la
   actividad no está, «➕ Agregar» la crea en el catálogo y la deja elegida.
   ============================================================ */
import { useState } from 'react';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { etiquetaActividad, validarActividadNueva, normalizarCodigoActividad, type ActividadEconomica } from './actividadesEconomicas';
import { crearActividad } from './actividadesEconomicas.repository';

export function ActividadEconomicaSelect({ id, value, onChange, actividades, onCreada, disabled = false }: {
  id?: string;
  value: string;
  onChange: (codigo: string) => void;
  actividades: ActividadEconomica[];
  /** Tras agregar una nueva (para recargar el catálogo sin esperar a Realtime). */
  onCreada?: () => void;
  disabled?: boolean;
}) {
  const [agregando, setAgregando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const visibles = actividades.filter((a) => a.activa || a.codigo === value);

  async function guardar() {
    const err = validarActividadNueva(codigo, descripcion, actividades);
    if (err) { setError(err); return; }
    setGuardando(true);
    try {
      const nueva = await crearActividad(codigo, descripcion);
      onCreada?.();
      onChange(nueva.codigo);
      setAgregando(false); setCodigo(''); setDescripcion(''); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar la actividad.');
    } finally { setGuardando(false); }
  }

  return (
    <div style={{ display: 'grid', gap: '.35rem' }}>
      <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SearchSelect id={id} value={value} onChange={onChange} disabled={disabled}
            options={visibles.map((a) => ({ value: a.codigo, label: etiquetaActividad(a) }))}
            placeholder="🔍 Buscar por código o actividad (ej. 5110, comercio, software)…"
            emptyText="No está en el catálogo: agrégala con ➕" />
        </div>
        {!disabled && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setAgregando((v) => !v); setError(null); }}
            title="Agregar una actividad que no está en la lista">{agregando ? 'Cerrar' : '➕ Agregar'}</button>
        )}
      </div>
      {agregando && (
        <div className="card" style={{ padding: '.6rem .7rem', background: 'var(--bg-1)', display: 'grid', gap: '.45rem' }}>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <input id={id ? `${id}-codigo` : undefined} className="input mono" style={{ width: 130 }} value={codigo}
              onChange={(e) => setCodigo(e.target.value)} placeholder="Código (5110)" aria-label="Código CIIU" />
            <input id={id ? `${id}-desc` : undefined} className="input" style={{ flex: 1, minWidth: 200 }} value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción de la actividad" aria-label="Descripción"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardar(); } }} />
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {error
            ? <small style={{ color: 'var(--danger)' }}>{error}</small>
            : <small className="muted">Código CIIU del SENIAT{normalizarCodigoActividad(codigo)?.includes('-') ? ' (rango: queda como sección)' : ''}. Queda disponible para todos los proveedores.</small>}
        </div>
      )}
    </div>
  );
}
