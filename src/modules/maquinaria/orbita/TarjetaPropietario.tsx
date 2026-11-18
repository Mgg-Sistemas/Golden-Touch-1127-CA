/* ============================================================
   Golden Touch · Control de Maquinaria · el rosetón · un propietario
   Como en la maqueta de Mgg-Sistemas: la categoría con su color, el
   nombre y las cifras. Además, la barra de salud (andando / activos) y la
   MEZCLA de categorías de sus equipos (D22: la categoría es de cada equipo).
   Tipo de oración, cifras con tabular-nums, el color de categoría como
   punto (no el color solo: va con su nombre).
   ============================================================ */
import { ETIQUETA_CATEGORIA, ID_OTROS, type PropietarioOrbita } from './orbitaDatos';

export function BarraMezcla({ p }: { p: Pick<PropietarioOrbita, 'mezcla' | 'total'> }) {
  return (
    <span className="ros-mezcla" role="img"
      aria-label={`Categorías: ${p.mezcla.map((m) => `${ETIQUETA_CATEGORIA[m.id]} ${m.cantidad}`).join(', ')}`}>
      {p.mezcla.map((m) => <span key={m.id} className={`orb-cat-bg-${m.id}`} style={{ flexGrow: m.cantidad }} />)}
    </span>
  );
}

/** Las categorías con más equipos, como puntos con su nombre (en el mapa, la principal). */
function Categorias({ p, max = 2 }: { p: PropietarioOrbita; max?: number }) {
  const top = [...p.mezcla].sort((a, b) => b.cantidad - a.cantidad).slice(0, max);
  return (
    <span className="ros-tarjeta-cats">
      {top.map((m) => <span key={m.id} className={`ros-cat orb-cat-${m.id}`}>{ETIQUETA_CATEGORIA[m.id]}</span>)}
    </span>
  );
}

export function TarjetaPropietario({ p, posicion, elegido, onElegir }: {
  p: PropietarioOrbita;
  /** Centro de la tarjeta, en % de la escena. Si no viene, la tarjeta va en la lista (teléfono). */
  posicion?: { left: string; top: string };
  elegido: boolean;
  onElegir: () => void;
}) {
  const enEscena = !!posicion;
  const nDuenos = p.agrupa?.length ?? 0;
  // En el mapa el mosaico es liviano (la categoría principal, el nombre y la
  // cifra); el texto envuelve por palabras completas y escala con la tarjeta,
  // así nunca recorta. El detalle completo queda en la flota de abajo.
  const nombre = p.id === ID_OTROS ? `Otros · ${nDuenos} dueños` : p.nombre;
  const problemas = p.averiados + p.enTaller;
  return (
    <button type="button" data-id={p.id}
      className={`ros-tarjeta${elegido ? ' elegido' : ''}${enEscena ? ' en-escena' : ''}`}
      style={posicion}
      aria-pressed={elegido} onClick={onElegir}
      aria-label={`${nombre}, ${p.total} equipos, ${p.operativos} andando, ${p.pctSalud} por ciento${problemas ? `, ${problemas} averiados o en taller` : ''}`}
      title={p.agrupa ? p.agrupa.map((a) => `${a.nombre} (${a.cantidad})`).join(' · ') : undefined}>
      {enEscena && problemas > 0 && <span className="ros-tarjeta-badge" aria-hidden="true">⚠ {problemas}</span>}
      <Categorias p={p} max={enEscena ? 1 : 2} />
      <span className="ros-tarjeta-nom">{nombre}</span>
      <span className="ros-tarjeta-fila">
        <span className="ros-tarjeta-total">{p.total}</span>
        <span className={`ros-salud ${p.pctSalud >= 90 ? 'ok' : p.pctSalud >= 70 ? 'medio' : 'bajo'}`} aria-hidden="true">
          <span style={{ width: `${p.total - p.retirados ? p.pctSalud : 0}%` }} />
        </span>
        <span className="ros-tarjeta-pct">{p.pctSalud} %</span>
      </span>
      {/* En la lista (teléfono) va el detalle completo; en el mapa, no. */}
      {!enEscena && problemas > 0 && <span className="ros-tarjeta-alerta">⚠ {problemas} averiados o en taller</span>}
      {!enEscena && <BarraMezcla p={p} />}
    </button>
  );
}
