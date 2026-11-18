/* ============================================================
   Golden Touch · Control de Maquinaria · el rosetón · la medalla
   La medalla dorada con corona de la maqueta de Mgg-Sistemas: toda la
   flota. Su borde es el medidor del % de operativos (lo dibuja el SVG de
   la escena, alrededor). Quieta: una sola sombra, sin animación en reposo.
   ============================================================ */
import type { ConteoEstados } from './orbitaDatos';

export function MedallaGeneral({ general, elegido, onElegir }: { general: ConteoEstados; elegido: boolean; onElegir: () => void }) {
  return (
    <button type="button" className={`ros-medalla${elegido ? ' elegido' : ''}`} onClick={onElegir} aria-pressed={elegido}
      aria-label={`Toda la flota, ${general.total} equipos, ${general.operativos} operativos, ${general.pctSalud} por ciento`}>
      <span className="ros-medalla-corona" aria-hidden="true">👑</span>
      <span className="ros-medalla-tit">General</span>
      <span className="ros-medalla-cifra">{general.total}</span>
      <span className="ros-medalla-sub">{general.operativos} operativos</span>
      <span className="ros-medalla-pct">{general.pctSalud} %</span>
    </button>
  );
}
