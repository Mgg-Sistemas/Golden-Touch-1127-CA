/* ============================================================
   Golden Touch · Control de Maquinaria · el «Rosetón de mando»
   (D26, guía informes/maquinaria-roseton-diseno.md)
   · Centro: la medalla dorada de Mgg-Sistemas; su borde es un medidor del
     % de operativos, con marcas cada 10 %.
   · Alrededor: un anillo de arcos de acero, uno por propietario, del tamaño
     de su flota y separados por muescas de engranaje; por dentro, una
     franja fina de estados.
   · Afuera: las tarjetas, cada una unida a su arco.
   Peso (§5): un solo SVG; en reposo nada se mueve (solo un dibujo al
   cargar); el hover NO pasa por React: marca con data-on la tarjeta y su
   arco (mismo data-id) y el CSS hace el resto con transform. Sin grafo
   (D21): no se atenúa nada.
   La geometría es pura: rosetonGeometria.ts (Master).
   ============================================================ */
import { useMemo, useRef, type CSSProperties, type FocusEvent, type KeyboardEvent as KE, type PointerEvent as PE } from 'react';
import { ID_GENERAL, type ConteoEstados, type PropietarioOrbita } from './orbitaDatos';
import type { DesplazamientoTarjeta } from './orbitaPreferencias';
import {
  CAJA_TARJETA, ESCENA, PISTA_MEDIDOR, arcoMedidor, arcosRoseton, enPorcentaje, limitarCentro, lineaTarjeta, marcasMedidor, posicionesTarjetas, type Punto,
} from './rosetonGeometria';
import { MedallaGeneral } from './MedallaGeneral';
import { TarjetaPropietario } from './TarjetaPropietario';

const MARCAS = marcasMedidor();

export function EscenaRoseton({ general, propietarios, elegido, onElegir, desplazamientos = {}, onMover }: {
  general: ConteoEstados;
  propietarios: readonly PropietarioOrbita[];
  /** ID_GENERAL o el id de un propietario. */
  elegido: string;
  onElegir: (id: string) => void;
  /** Dónde dejó el usuario cada tarjeta (puntos de % de la escena). */
  desplazamientos?: Record<string, DesplazamientoTarjeta>;
  /** Guarda el nuevo desplazamiento de una tarjeta al arrastrarla o empujarla. */
  onMover?: (id: string, d: DesplazamientoTarjeta) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const marcado = useRef<string | null>(null);

  // Todo se calcula una vez por conjunto de datos, no por cuadro.
  const arcos = useMemo(() => arcosRoseton(propietarios.map((p) => ({
    id: p.id,
    cantidad: p.total,
    estados: { success: p.operativos, warning: p.enTaller + p.enEspera, danger: p.averiados },
  }))), [propietarios]);
  const posiciones = useMemo(() => posicionesTarjetas(arcos), [arcos]);
  const porId = useMemo(() => new Map(propietarios.map((p) => [p.id, p])), [propietarios]);
  const arcoPorId = useMemo(() => new Map(arcos.map((a) => [a.id, a])), [arcos]);

  // Centro de una tarjeta ya con el desplazamiento del usuario. No se recorta
  // aquí: el valor guardado ya quedó limitado al marco al soltarla (y así
  // puede vivir en los márgenes del panel, fuera del cuadrado de la escena).
  const centroDe = (id: string): Punto | undefined => {
    const base = posiciones.get(id);
    if (!base) return undefined;
    const d = desplazamientos[id];
    return d ? { x: base.x + (d.dx / 100) * ESCENA.w, y: base.y + (d.dy / 100) * ESCENA.h } : base;
  };

  // El marco donde se puede arrastrar es el PANEL entero (no el cuadrado de la
  // escena), medido en vivo y pasado a unidades de escena. Deja los márgenes
  // laterales usables. Si no se puede medir, cae al cuadrado (limitarCentro).
  const limitarAlMarco = (p: Punto): Punto => {
    const esc = caja.current;
    const panel = esc?.closest('.orb-mapa') as HTMLElement | null;
    if (!esc || !panel) return limitarCentro(p);
    const sr = esc.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const cab = panel.querySelector('.orb-mapa-cab');
    const topPx = cab ? (cab as HTMLElement).getBoundingClientRect().bottom + 8 : pr.top + 8;
    const u = ESCENA.w / sr.width; // unidades de escena por px
    const hw = CAJA_TARJETA.w / 2;
    const hh = CAJA_TARJETA.h / 2;
    const xmin = (pr.left + 8 - sr.left) * u + hw;
    const xmax = (pr.right - 8 - sr.left) * u - hw;
    const ymin = (topPx - sr.top) * u + hh;
    const ymax = (pr.bottom - 8 - sr.top) * u - hh;
    return {
      x: Math.min(Math.max(p.x, Math.min(xmin, xmax)), Math.max(xmin, xmax)),
      y: Math.min(Math.max(p.y, Math.min(ymin, ymax)), Math.max(ymin, ymax)),
    };
  };
  // Guarda un centro (en unidades de escena) como desplazamiento respecto de su base.
  const guardarCentro = (id: string, centro: Punto) => {
    const base = posiciones.get(id);
    if (!base || !onMover) return;
    const r = (n: number) => Math.round(n * 100) / 100;
    onMover(id, { dx: r(((centro.x - base.x) / ESCENA.w) * 100), dy: r(((centro.y - base.y) / ESCENA.h) * 100) });
  };

  // --- Arrastre: mueve la tarjeta y su línea en el DOM; solo al soltar, un setState. ---
  const arrastre = useRef<{ id: string; el: HTMLElement; linea: Element | null; x0: number; y0: number; centro0: Punto; movio: boolean } | null>(null);
  const recienArrastrado = useRef(false);
  const unidadesPorPx = () => (caja.current ? ESCENA.w / caja.current.getBoundingClientRect().width : 1);
  const tarjetaDe = (t: EventTarget | null) => (t as Element | null)?.closest?.('.ros-tarjeta.en-escena') as HTMLElement | null;

  const alBajar = (e: PE) => {
    const el = tarjetaDe(e.target);
    recienArrastrado.current = false;
    if (!el || e.button !== 0 || !onMover) return;
    const id = el.dataset.id;
    const centro0 = id ? centroDe(id) : undefined;
    if (!id || !centro0) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* da igual */ }
    const linea = caja.current?.querySelector(`path.ros-linea[data-id="${CSS.escape(id)}"]`) ?? null;
    arrastre.current = { id, el, linea, x0: e.clientX, y0: e.clientY, centro0, movio: false };
  };
  const alMover = (e: PE) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.movio && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) <= 3) return;
    a.movio = true;
    e.preventDefault();
    const s = unidadesPorPx();
    const centro = limitarAlMarco({ x: a.centro0.x + (e.clientX - a.x0) * s, y: a.centro0.y + (e.clientY - a.y0) * s });
    const p = enPorcentaje(centro);
    a.el.style.left = p.left;
    a.el.style.top = p.top;
    const arco = arcoPorId.get(a.id);
    if (a.linea && arco) a.linea.setAttribute('d', lineaTarjeta(arco, centro));
  };
  const alSoltar = (e: PE) => {
    const a = arrastre.current;
    if (!a) return;
    arrastre.current = null;
    try { a.el.releasePointerCapture(e.pointerId); } catch { /* da igual */ }
    if (!a.movio) return;
    recienArrastrado.current = true; // el clic que sigue no debe elegir
    const s = unidadesPorPx();
    guardarCentro(a.id, limitarAlMarco({ x: a.centro0.x + (e.clientX - a.x0) * s, y: a.centro0.y + (e.clientY - a.y0) * s }));
  };
  // Teclado: con la tarjeta enfocada, las flechas la empujan (sin arrastre, WCAG 2.5.7).
  const PASOS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const alTeclear = (e: KE) => {
    const el = tarjetaDe(e.target);
    const dir = PASOS[e.key];
    if (!el || !dir || !onMover) return;
    const id = el.dataset.id;
    const centro = id ? centroDe(id) : undefined;
    if (!id || !centro) return;
    e.preventDefault();
    const paso = e.shiftKey ? 4 : 1.5; // puntos de %
    guardarCentro(id, limitarAlMarco({ x: centro.x + (dir[0] * paso / 100) * ESCENA.w, y: centro.y + (dir[1] * paso / 100) * ESCENA.h }));
  };
  const elegirTarjeta = (id: string) => {
    if (recienArrastrado.current) { recienArrastrado.current = false; return; }
    onElegir(id);
  };

  /** Marca (o desmarca) la tarjeta y el arco de un propietario, directo en el DOM. */
  const marcar = (id: string | null) => {
    if (marcado.current === id || !caja.current) return;
    caja.current.querySelectorAll('[data-on]').forEach((el) => el.removeAttribute('data-on'));
    marcado.current = id;
    if (id) caja.current.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((el) => el.setAttribute('data-on', ''));
  };
  const idDe = (t: EventTarget | null) => ((t as Element | null)?.closest?.('[data-id]') as HTMLElement | SVGElement | null)?.dataset.id ?? null;

  return (
    <div ref={caja} className="ros-escena" style={{ aspectRatio: `${ESCENA.w} / ${ESCENA.h}` }}
      onPointerOver={(e: PE) => marcar(idDe(e.target))} onPointerLeave={() => marcar(null)}
      onFocus={(e: FocusEvent) => marcar(idDe(e.target))} onBlur={() => marcar(null)}
      onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onKeyDown={alTeclear}>
      <svg className="ros-svg" viewBox={`0 0 ${ESCENA.w} ${ESCENA.h}`} aria-hidden="true">
        {/* Las líneas van primero, debajo del anillo. */}
        {arcos.map((a) => {
          const c = centroDe(a.id);
          return c ? <path key={`l-${a.id}`} data-id={a.id} className={`ros-linea${elegido === a.id ? ' elegido' : ''}`} d={lineaTarjeta(a, c)} /> : null;
        })}

        {/* El medidor: pista, valor (se dibuja una vez al cargar) y marcas cada 10 %. */}
        <path className="ros-medidor-pista" d={PISTA_MEDIDOR} />
        <path className="ros-medidor-valor" d={arcoMedidor(general.pctSalud)} pathLength={100} />
        {MARCAS.map((m) => (
          <line key={m.valor} className={`ros-marca${m.mayor ? ' mayor' : ''}`} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} />
        ))}

        {/* El anillo: un arco de acero por propietario, con su franja de estados por dentro. */}
        {arcos.map((a) => (
          <g key={a.id} data-id={a.id} className={`ros-arco${elegido === a.id ? ' elegido' : ''}`}
            style={{ '--dx': `${a.separar.dx}px`, '--dy': `${a.separar.dy}px` } as CSSProperties}
            onClick={() => onElegir(a.id)}>
            <path className="ros-arco-cuerpo" d={a.d} />
            {a.franjas.map((f) => <path key={f.tono} className={`ros-franja ${f.tono}`} d={f.d} />)}
          </g>
        ))}
      </svg>

      <MedallaGeneral general={general} elegido={elegido === ID_GENERAL} onElegir={() => onElegir(ID_GENERAL)} />

      {arcos.map((a) => {
        const p = porId.get(a.id);
        const c = centroDe(a.id);
        return p && c ? (
          <TarjetaPropietario key={a.id} p={p} posicion={enPorcentaje(c)} elegido={elegido === a.id} onElegir={() => elegirTarjeta(a.id)} />
        ) : null;
      })}
    </div>
  );
}
