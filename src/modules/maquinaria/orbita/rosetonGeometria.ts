/* ============================================================
   Golden Touch · Control de Maquinaria · el Rosetón de mando · geometría
   Cuentas puras de la escena (sin React), en unidades de su viewBox
   cuadrada (920 × 920, GENERAL en el centro); las tarjetas se pasan a % de
   esa misma caja con `enPorcentaje`. Guía: informes/maquinaria-roseton-diseno.md.
   · Ángulos en grados, 0 arriba y creciendo en el sentido del reloj.
   · El anillo: un arco por propietario, del tamaño de su flota, separados
     por muescas; por dentro, una franja fina con la mezcla de estados.
   · El medidor: el borde de la medalla marca el % de operativos (270°,
     como un tacómetro), con una marca cada 10 %.
   · Cada tarjeta va afuera del medio de SU arco, sin pisarse con otra.
   Todo se calcula una vez por cambio de datos: nada por cuadro.
   ============================================================ */

export const ESCENA = { w: 920, h: 920 } as const;
export const CENTRO = { x: 460, y: 460 } as const;
/** La medalla dorada de GENERAL. */
export const MEDALLA = { r: 118 } as const;
/** El medidor sobre el borde de la medalla: 270° que abren hacia abajo. */
export const MEDIDOR = { r: 134, desde: 225, barrido: 270, marcas: 10 } as const;
/** El anillo de propietarios. `muesca` y `arcoMin` en grados. */
export const ANILLO = { rInterior: 152, rExterior: 190, franja: 7, muesca: 4, arcoMin: 10 } as const;
/**
 * Caja de una tarjeta de propietario, en unidades de la escena. La tarjeta
 * en pantalla mide ESTO en proporción de la escena (ancho y alto), para que
 * el anti-choque valga a cualquier tamaño; por eso no lleva un `min-width`
 * en px, que la ensancharía más de lo reservado en las escenas chicas.
 */
export const CAJA_TARJETA = { w: 208, h: 150 } as const;
/**
 * La elipse base donde viven las tarjetas. Las de arriba y abajo —donde se
 * empaquetan de lado— se alejan un poco (ESCALON) para que no se toquen;
 * las de los lados se quedan. Así entran hasta 9 sin pisarse.
 */
export const ORBITA_TARJETAS = { rx: 316, ry: 316 } as const;
/** Todas un poco más lejos del anillo; las de arriba/abajo, además, otro tanto. */
const SEPARA_ANILLO = 0.09;
const ESCALON = 0.11;
/** Cuánto se lleva cada tarjeta hacia un reparto parejo alrededor del centro
 *  (0 = justo sobre su arco; 1 = repartidas iguales). Evita que los dueños
 *  chicos, con arcos pegados, amontonen sus tarjetas de un lado. */
const REPARTO = 0.5;
/** Cuánto se separa un arco al marcarlo (en unidades de la escena). */
export const SEPARACION = 4;
/** Aire mínimo entre dos tarjetas. */
const AIRE = 12;

export type Punto = { x: number; y: number };
export type TonoEstado = 'success' | 'warning' | 'danger';

export interface PorcionEntrada {
  id: string;
  /** Cuántos equipos tiene el propietario. */
  cantidad: number;
  /** Cuántos de esos están en cada tono (los que falten no se pintan). */
  estados?: Partial<Record<TonoEstado, number>>;
}

export interface FranjaEstado {
  tono: TonoEstado;
  d: string;
}

export interface ArcoRoseton {
  id: string;
  desde: number;
  hasta: number;
  /** Ángulo del medio del arco: ahí sale la línea y hacia ahí va la tarjeta. */
  medio: number;
  /** El sector del anillo, para un `<path>` relleno. */
  d: string;
  franjas: FranjaEstado[];
  /** Punto del borde exterior, en el medio del arco. */
  salida: Punto;
  /** Desplazamiento hacia afuera al marcarlo, para un `transform: translate()`. */
  separar: { dx: number; dy: number };
}

export interface MarcaMedidor {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0, 50 y 100 son marcas mayores. */
  mayor: boolean;
  valor: number;
}

const rad = (g: number) => (g * Math.PI) / 180;
const red = (n: number) => Math.round(n * 100) / 100;

/** Punto a `r` del centro con el ángulo de la escena (0 arriba, sentido del reloj). */
export function polar(r: number, grados: number): Punto {
  return { x: red(CENTRO.x + r * Math.sin(rad(grados))), y: red(CENTRO.y - r * Math.cos(rad(grados))) };
}

/** Sector de corona circular entre dos radios y dos ángulos. */
export function sector(rIn: number, rOut: number, desde: number, hasta: number): string {
  const grande = hasta - desde > 180 ? 1 : 0;
  const a = polar(rOut, desde);
  const b = polar(rOut, hasta);
  const c = polar(rIn, hasta);
  const e = polar(rIn, desde);
  return `M${a.x} ${a.y}A${rOut} ${rOut} 0 ${grande} 1 ${b.x} ${b.y}L${c.x} ${c.y}A${rIn} ${rIn} 0 ${grande} 0 ${e.x} ${e.y}Z`;
}

/** Arco abierto (solo trazo) de radio `r`. */
export function trazo(r: number, desde: number, hasta: number): string {
  const grande = hasta - desde > 180 ? 1 : 0;
  const a = polar(r, desde);
  const b = polar(r, hasta);
  return `M${a.x} ${a.y}A${r} ${r} 0 ${grande} 1 ${b.x} ${b.y}`;
}

/**
 * Reparte 360° (menos las muescas) entre los propietarios, en el orden en
 * que llegan. El primero queda centrado arriba. Ningún arco baja de
 * `ANILLO.arcoMin`: lo que les falta a los chicos se descuenta, en
 * proporción, de los grandes.
 */
export function arcosRoseton(porciones: readonly PorcionEntrada[]): ArcoRoseton[] {
  const lista = porciones.filter((p) => p.cantidad > 0);
  if (lista.length === 0) return [];
  const libre = 360 - ANILLO.muesca * lista.length;
  const total = lista.reduce((s, p) => s + p.cantidad, 0);
  const min = Math.min(ANILLO.arcoMin, libre / lista.length);

  const anchos = lista.map((p) => (p.cantidad / total) * libre);
  const chicos = anchos.map((a) => a < min);
  const faltan = anchos.reduce((s, a, i) => (chicos[i] ? s + (min - a) : s), 0);
  const sobranGrandes = anchos.reduce((s, a, i) => (chicos[i] ? s : s + (a - min)), 0);
  const finales = anchos.map((a, i) => (chicos[i] ? min : a - (sobranGrandes > 0 ? ((a - min) / sobranGrandes) * faltan : 0)));

  let cursor = -finales[0] / 2;
  return lista.map((p, i) => {
    const desde = cursor;
    const hasta = cursor + finales[i];
    cursor = hasta + ANILLO.muesca;
    const medio = (desde + hasta) / 2;
    return {
      id: p.id,
      desde: red(desde),
      hasta: red(hasta),
      medio: red(medio),
      d: sector(ANILLO.rInterior, ANILLO.rExterior, desde, hasta),
      franjas: franjasEstado(p, desde, hasta),
      salida: polar(ANILLO.rExterior, medio),
      separar: { dx: red(SEPARACION * Math.sin(rad(medio))), dy: red(-SEPARACION * Math.cos(rad(medio))) },
    };
  });
}

const ORDEN_TONOS: TonoEstado[] = ['success', 'warning', 'danger'];

function franjasEstado(p: PorcionEntrada, desde: number, hasta: number): FranjaEstado[] {
  const e = p.estados ?? {};
  const contados = ORDEN_TONOS.reduce((s, t) => s + (e[t] ?? 0), 0);
  if (contados === 0) return [];
  const ancho = hasta - desde;
  let cursor = desde;
  const out: FranjaEstado[] = [];
  for (const tono of ORDEN_TONOS) {
    const n = e[tono] ?? 0;
    if (n <= 0) continue;
    const tramo = (n / Math.max(contados, p.cantidad)) * ancho;
    out.push({ tono, d: sector(ANILLO.rInterior, ANILLO.rInterior + ANILLO.franja, cursor, cursor + tramo) });
    cursor += tramo;
  }
  return out;
}

/** Las marcas del medidor, de 0 a 100 cada 10 %. */
export function marcasMedidor(): MarcaMedidor[] {
  return Array.from({ length: MEDIDOR.marcas + 1 }, (_, i) => {
    const valor = (i * 100) / MEDIDOR.marcas;
    const mayor = valor === 0 || valor === 50 || valor === 100;
    const g = MEDIDOR.desde + (MEDIDOR.barrido * valor) / 100;
    const a = polar(MEDIDOR.r - (mayor ? 9 : 5), g);
    const b = polar(MEDIDOR.r + 4, g);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, mayor, valor };
  });
}

/** El arco del medidor hasta `pct` (0–100); vacío si no hay nada que marcar. */
export function arcoMedidor(pct: number): string {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  if (p === 0) return '';
  return trazo(MEDIDOR.r, MEDIDOR.desde, MEDIDOR.desde + (MEDIDOR.barrido * p) / 100);
}

/** La pista completa del medidor (el 100 %). */
export const PISTA_MEDIDOR = trazo(MEDIDOR.r, MEDIDOR.desde, MEDIDOR.desde + MEDIDOR.barrido);

/** Radio de la elipse en un ángulo: se abre hacia arriba/abajo (cos²) y se
 *  queda en los lados, donde las tarjetas se apilan y hay sitio de sobra. */
function radioElipse(grados: number): { rx: number; ry: number } {
  const k = 1 + SEPARA_ANILLO + ESCALON * Math.cos(rad(grados)) ** 2;
  return { rx: ORBITA_TARJETAS.rx * k, ry: ORBITA_TARJETAS.ry * k };
}

function enElipse(grados: number): Punto {
  const { rx, ry } = radioElipse(grados);
  return {
    x: red(CENTRO.x + rx * Math.sin(rad(grados))),
    y: red(CENTRO.y - ry * Math.cos(rad(grados))),
  };
}

export function sePisan(a: Punto, b: Punto): boolean {
  return Math.abs(a.x - b.x) < CAJA_TARJETA.w + AIRE && Math.abs(a.y - b.y) < CAJA_TARJETA.h + AIRE;
}

/**
 * Centro de cada tarjeta: sobre la elipse, en el ángulo del medio de su
 * arco. Si dos se pisan, se abren de a 1° hacia los lados hasta que
 * entren (determinista; tope de 360 pasadas).
 */
export function posicionesTarjetas(arcos: readonly ArcoRoseton[]): Map<string, Punto> {
  const n = arcos.length;
  // El ángulo de cada tarjeta: el de su arco, llevado a medias hacia un
  // reparto parejo (misma vuelta, 0 arriba y en el orden de los arcos).
  const angulos = arcos.map((a, i) => a.medio * (1 - REPARTO) + ((i * 360) / n) * REPARTO);
  for (let pasada = 0; pasada < 360 && n > 1; pasada += 1) {
    let movio = false;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      if (sePisan(enElipse(angulos[i]), enElipse(angulos[j]))) {
        angulos[i] -= 0.5;
        angulos[j] += 0.5;
        movio = true;
      }
    }
    if (!movio) break;
  }
  return new Map(arcos.map((a, i) => [a.id, enElipse(angulos[i])]));
}

/** Punto del borde de la caja de una tarjeta mirando hacia `desde`. */
export function bordeTarjeta(centro: Punto, desde: Punto): Punto {
  const dx = desde.x - centro.x;
  const dy = desde.y - centro.y;
  if (dx === 0 && dy === 0) return centro;
  const fx = Math.abs(dx) > 0 ? CAJA_TARJETA.w / 2 / Math.abs(dx) : Infinity;
  const fy = Math.abs(dy) > 0 ? CAJA_TARJETA.h / 2 / Math.abs(dy) : Infinity;
  const f = Math.min(fx, fy, 1);
  return { x: red(centro.x + dx * f), y: red(centro.y + dy * f) };
}

/** La línea de una tarjeta a su arco: del borde de la caja a la salida del arco. */
export function lineaTarjeta(arco: ArcoRoseton, centroTarjeta: Punto): string {
  const b = bordeTarjeta(centroTarjeta, arco.salida);
  return `M${b.x} ${b.y}L${arco.salida.x} ${arco.salida.y}`;
}

/** Un punto de la escena en % de su caja (para ubicar tarjetas HTML encima del SVG). */
export function enPorcentaje(p: Punto): { left: string; top: string } {
  return { left: `${red((p.x / ESCENA.w) * 100)}%`, top: `${red((p.y / ESCENA.h) * 100)}%` };
}

/** Lleva el centro de una tarjeta adentro de la escena, que no se salga al arrastrarla. */
export function limitarCentro(p: Punto): Punto {
  const hw = CAJA_TARJETA.w / 2;
  const hh = CAJA_TARJETA.h / 2;
  return {
    x: red(Math.min(Math.max(p.x, hw), ESCENA.w - hw)),
    y: red(Math.min(Math.max(p.y, hh), ESCENA.h - hh)),
  };
}
