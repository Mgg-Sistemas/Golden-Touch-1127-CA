/* Barra inferior con las pestañas de los modales minimizados (hasta 3).
   Vive en el AppShell: un clic en la pestaña restaura el modal; la ✕ lo cierra
   igual que la ✕ del propio modal. Ver `shared/lib/pestanasModal.ts`. */
import { useEffect } from 'react';
import {
  MAX_MINIMIZADAS, cerrarVentana, montarBarraPestanas, restaurarVentana, usePestanas,
} from '@/shared/lib/pestanasModal';

export function BarraPestanas() {
  const { minimizadas } = usePestanas();
  const hay = minimizadas.length > 0;

  // Mientras la barra monta, los modales ofrecen «—» (sin barra nadie podría restaurarlos).
  useEffect(() => montarBarraPestanas(), []);
  // La clase del <body> le deja a la barra su franja: los modales y la página no la tapan.
  useEffect(() => {
    document.body.classList.toggle('con-pestanas', hay);
    return () => document.body.classList.remove('con-pestanas');
  }, [hay]);

  if (!hay) return null;
  return (
    <div className="pestanas-barra" role="toolbar" aria-label="Ventanas minimizadas">
      <span className="pestanas-cuenta" title={`Máximo ${MAX_MINIMIZADAS} pestañas minimizadas`}>
        {minimizadas.length}/{MAX_MINIMIZADAS}
      </span>
      {minimizadas.map((p) => (
        <div className="pestana" key={p.id}>
          <button type="button" className="pestana-abrir" onClick={() => restaurarVentana(p.id)} title={`Abrir: ${p.titulo}`}>
            {p.titulo}
          </button>
          <button type="button" className="pestana-cerrar" onClick={() => cerrarVentana(p.id)} title="Cerrar esta ventana" aria-label={`Cerrar ${p.titulo}`}>✕</button>
        </div>
      ))}
    </div>
  );
}
