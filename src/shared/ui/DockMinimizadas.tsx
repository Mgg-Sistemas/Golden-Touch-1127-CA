import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MAX_MINIMIZADAS, descartarPestana, restaurarPestana, useMinimizadas } from '@/shared/lib/minimizadas';

/** Barra inferior con las pestañas minimizadas del módulo (máx. MAX_MINIMIZADAS). Vive en AppShell. */
export function DockMinimizadas() {
  const { items, salida } = useMinimizadas();
  // Con el aviso de salida abierto la barra se esconde: no se restaura nada a mitad de la pregunta.
  const hay = items.length > 0 && salida === null;

  // Deja libre el pie de las ventanas mientras la barra está a la vista (ver theme.css).
  useEffect(() => {
    if (!hay) return;
    document.body.classList.add('dock-activo');
    return () => document.body.classList.remove('dock-activo');
  }, [hay]);

  if (!hay) return null;
  return createPortal(
    <div className="dock-min" role="toolbar" aria-label="Pestañas minimizadas">
      <span className="dock-min-cuenta" title={`Hasta ${MAX_MINIMIZADAS} pestañas minimizadas`}>
        — {items.length}/{MAX_MINIMIZADAS}
      </span>
      {items.map((it) => (
        <span key={it.id} className="dock-min-pill">
          <button
            type="button"
            className="dock-min-abrir"
            onClick={() => restaurarPestana(it.id)}
            title={`Restaurar ${it.titulo}`}
          >
            {it.titulo}
          </button>
          <button
            type="button"
            className="dock-min-cerrar"
            onClick={() => descartarPestana(it.id)}
            title="Descartar esta pestaña minimizada"
            aria-label={`Descartar ${it.titulo}`}
          >
            ✕
          </button>
        </span>
      ))}
    </div>,
    document.body,
  );
}
