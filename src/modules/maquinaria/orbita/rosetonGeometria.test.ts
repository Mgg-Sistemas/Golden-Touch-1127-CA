import { describe, expect, it } from 'vitest';
import {
  ANILLO, CAJA_TARJETA, CENTRO, ESCENA, MEDIDOR, SEPARACION,
  arcoMedidor, arcosRoseton, bordeTarjeta, enPorcentaje, limitarCentro, lineaTarjeta, marcasMedidor, posicionesTarjetas, sePisan,
  type PorcionEntrada,
} from './rosetonGeometria';

/** n propietarios, del más grande al más chico, como los ordena armarOrbita. */
const propietarios = (n: number, cantidades?: number[]): PorcionEntrada[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `emp:empresa-${String.fromCharCode(97 + i)}`,
    cantidad: cantidades?.[i] ?? Math.max(1, 40 - i * 5),
    estados: { success: 3, warning: 1, danger: 1 },
  }));

const ancho = (a: { desde: number; hasta: number }) => a.hasta - a.desde;

describe('el Rosetón · el anillo', () => {
  it('los arcos suman 360° menos las muescas, en orden y sin cruzarse', () => {
    for (let n = 1; n <= 9; n += 1) {
      const arcos = arcosRoseton(propietarios(n));
      const suma = arcos.reduce((s, a) => s + ancho(a), 0);
      expect(suma).toBeCloseTo(360 - ANILLO.muesca * n, 0);
      for (let i = 1; i < arcos.length; i += 1) {
        expect(arcos[i].desde).toBeCloseTo(arcos[i - 1].hasta + ANILLO.muesca, 1);
      }
    }
  });

  it('el primero (el más grande) queda centrado arriba', () => {
    const [primero] = arcosRoseton(propietarios(5));
    expect(primero.medio).toBeCloseTo(0, 5);
  });

  it('ningún arco baja del mínimo legible, aunque el propietario tenga 1 equipo', () => {
    const arcos = arcosRoseton(propietarios(8, [80, 40, 20, 10, 3, 1, 1, 1]));
    for (const a of arcos) expect(ancho(a)).toBeGreaterThanOrEqual(ANILLO.arcoMin - 0.01);
    expect(ancho(arcos[0])).toBeGreaterThan(ancho(arcos[1]));
  });

  it('sin equipos no hay arcos, y los propietarios con 0 se saltan', () => {
    expect(arcosRoseton([])).toEqual([]);
    expect(arcosRoseton([{ id: 'emp:a', cantidad: 0 }, { id: 'emp:b', cantidad: 3 }]).map((a) => a.id)).toEqual(['emp:b']);
  });

  it('la franja de estados: un tramo por tono que haya, en orden verde, ámbar, rojo', () => {
    const [a] = arcosRoseton([{ id: 'emp:a', cantidad: 10, estados: { danger: 2, success: 7 } }]);
    expect(a.franjas.map((f) => f.tono)).toEqual(['success', 'danger']);
    expect(arcosRoseton([{ id: 'emp:b', cantidad: 4 }])[0].franjas).toEqual([]);
  });

  it('separarse: 4 unidades hacia afuera, en la dirección del medio del arco', () => {
    for (const a of arcosRoseton(propietarios(7))) {
      expect(Math.hypot(a.separar.dx, a.separar.dy)).toBeCloseTo(SEPARACION, 1);
      const haciaSalida = { x: a.salida.x - CENTRO.x, y: a.salida.y - CENTRO.y };
      expect(a.separar.dx * haciaSalida.x + a.separar.dy * haciaSalida.y).toBeGreaterThan(0);
    }
  });

  it('es determinista: dos llamadas dan lo mismo', () => {
    expect(arcosRoseton(propietarios(6))).toEqual(arcosRoseton(propietarios(6)));
  });
});

describe('el Rosetón · el medidor', () => {
  it('11 marcas de 0 a 100, mayores en 0, 50 y 100', () => {
    const m = marcasMedidor();
    expect(m).toHaveLength(MEDIDOR.marcas + 1);
    expect(m.filter((x) => x.mayor).map((x) => x.valor)).toEqual([0, 50, 100]);
  });

  it('el arco del % se recorta a 0–100 y en 0 no dibuja nada', () => {
    expect(arcoMedidor(0)).toBe('');
    expect(arcoMedidor(-5)).toBe('');
    expect(arcoMedidor(Number.NaN)).toBe('');
    expect(arcoMedidor(150)).toBe(arcoMedidor(100));
    expect(arcoMedidor(82)).toMatch(/^M[\d.]+ [\d.]+A134 134 0 1 1 /);
  });
});

describe('el Rosetón · las tarjetas', () => {
  it('de 1 a 9 propietarios (y con tamaños muy desparejos): ninguna se pisa, ni pisa el anillo, ni se sale', () => {
    const casos: PorcionEntrada[][] = [];
    for (let n = 1; n <= 9; n += 1) casos.push(propietarios(n));
    casos.push(propietarios(9, [200, 2, 2, 2, 2, 2, 2, 2, 2]), propietarios(8, [30, 30, 30, 1, 1, 1, 1, 1]));
    const fallas: string[] = [];
    for (const caso of casos) {
      const arcos = arcosRoseton(caso);
      const pos = [...posicionesTarjetas(arcos).values()];
      pos.forEach((p, i) => {
        const donde = `n=${caso.length} t${i}`;
        if (p.x - CAJA_TARJETA.w / 2 < 0 || p.x + CAJA_TARJETA.w / 2 > ESCENA.w || p.y - CAJA_TARJETA.h / 2 < 0 || p.y + CAJA_TARJETA.h / 2 > ESCENA.h) fallas.push(`${donde} se sale`);
        // La esquina más cercana al centro tiene que quedar fuera del anillo (con aire).
        const cx = Math.max(Math.abs(p.x - CENTRO.x) - CAJA_TARJETA.w / 2, 0);
        const cy = Math.max(Math.abs(p.y - CENTRO.y) - CAJA_TARJETA.h / 2, 0);
        if (Math.hypot(cx, cy) < ANILLO.rExterior + 16) fallas.push(`${donde} pisa el anillo`);
        for (let j = i + 1; j < pos.length; j += 1) if (sePisan(p, pos[j])) fallas.push(`${donde}/t${j} se pisan`);
      });
    }
    expect(fallas).toEqual([]);
  });

  it('la línea va del borde de la tarjeta a la salida de su arco', () => {
    const arcos = arcosRoseton(propietarios(4));
    const pos = posicionesTarjetas(arcos);
    const a = arcos[0];
    const b = bordeTarjeta(pos.get(a.id)!, a.salida);
    expect(lineaTarjeta(a, pos.get(a.id)!)).toBe(`M${b.x} ${b.y}L${a.salida.x} ${a.salida.y}`);
    // La tarjeta de arriba: la línea sale por su borde de abajo.
    expect(b.y).toBeCloseTo(pos.get(a.id)!.y + CAJA_TARJETA.h / 2, 0);
  });

  it('en % de la misma caja', () => {
    expect(enPorcentaje(CENTRO)).toEqual({ left: '50%', top: '50%' });
  });

  it('al arrastrar, el centro se queda adentro: la tarjeta nunca se sale', () => {
    const casos = [{ x: -500, y: -500 }, { x: 5000, y: 5000 }, { x: 460, y: 460 }];
    for (const p of casos) {
      const d = limitarCentro(p);
      expect(d.x - CAJA_TARJETA.w / 2).toBeGreaterThanOrEqual(-0.01);
      expect(d.x + CAJA_TARJETA.w / 2).toBeLessThanOrEqual(ESCENA.w + 0.01);
      expect(d.y - CAJA_TARJETA.h / 2).toBeGreaterThanOrEqual(-0.01);
      expect(d.y + CAJA_TARJETA.h / 2).toBeLessThanOrEqual(ESCENA.h + 0.01);
    }
    expect(limitarCentro(CENTRO)).toEqual(CENTRO);
  });
});

describe('el Rosetón · peso', () => {
  it('con 9 propietarios, el SVG tiene menos de 150 elementos', () => {
    const arcos = arcosRoseton(propietarios(9));
    const elementos = arcos.length /* arcos */ + arcos.reduce((s, a) => s + a.franjas.length, 0) /* franjas */
      + arcos.length /* líneas */ + marcasMedidor().length + 2 /* pista y % del medidor */;
    expect(elementos).toBeLessThan(150);
  });
});
