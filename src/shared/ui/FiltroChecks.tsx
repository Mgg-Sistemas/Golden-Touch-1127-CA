/* ============================================================
   Filtro desplegable con CASILLAS (12/11/2026).
   Reemplaza al <select> de un solo valor: se marcan varias opciones y la lista
   se queda abierta mientras se marca. Ninguna marcada = «Todos».
   Se cierra al hacer clic afuera o con Escape.
   ============================================================ */
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface OpcionCheck { value: string; label: string }

function textoSeleccion(opciones: OpcionCheck[], seleccion: string[], todos = 'Todos'): string {
  const marcadas = opciones.filter((o) => seleccion.includes(o.value));
  if (!marcadas.length || marcadas.length === opciones.length) return todos;
  if (marcadas.length === 1) return marcadas[0].label;
  return `${marcadas.length} seleccionados`;
}

export function FiltroChecks({ opciones, seleccion, onChange, todos = 'Todos', ariaLabel }: {
  opciones: OpcionCheck[];
  seleccion: string[];
  onChange: (next: string[]) => void;
  todos?: string;
  ariaLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const marcado = (v: string) => seleccion.includes(v);
  const alternar = (v: string) => onChange(marcado(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);
  const ninguna = seleccion.length === 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="select" aria-label={ariaLabel} aria-expanded={abierto} aria-haspopup="listbox"
        onClick={() => setAbierto((x) => !x)}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {textoSeleccion(opciones, seleccion, todos)}
      </button>
      {abierto && (
        <div role="listbox" aria-multiselectable="true" style={{
          position: 'absolute', zIndex: 60, top: '100%', left: 0, minWidth: '100%', marginTop: 2,
          maxHeight: 320, overflowY: 'auto', padding: '.3rem 0',
          background: 'var(--bg-1, #11151c)', border: '1px solid var(--border, #2a3240)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        }}>
          <label style={fila}>
            <input type="checkbox" checked={ninguna} onChange={() => onChange([])} />
            <strong>{todos}</strong>
          </label>
          <div style={{ borderTop: '1px solid var(--border, #2a3240)', margin: '.2rem 0' }} />
          {opciones.map((o) => (
            <label key={o.value} style={fila}>
              <input type="checkbox" checked={marcado(o.value)} onChange={() => alternar(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const fila: CSSProperties = {
  display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.32rem .75rem',
  cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '.88rem',
};
