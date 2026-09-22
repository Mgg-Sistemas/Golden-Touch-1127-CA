import { describe, it, expect } from 'vitest';
import { baseNetaDesdeTotal, impuestosDeOrden, recomponerImpuestos } from './impuestosOrden';

const soloIva = (pct: number, monto: number) => ({
  ivaAplicado: true, ivaPct: pct, ivaMonto: monto,
  igtfAplicado: false, igtfPct: 0, igtfMonto: 0,
});

describe('recomponerImpuestos · el caso real (SP-2026-0194)', () => {
  it('al pasar de 1 a 14 unidades, el IVA se recalcula sobre la base nueva', () => {
    // 1 × $110 con IVA 16% = 17,60 → total 127,60.
    // Se corrige a 14 × $110 = 1.540 → el IVA debe ser 246,40, no 17,60.
    const r = recomponerImpuestos(110, 1540, soloIva(16, 17.6));
    expect(r.ivaMonto).toBe(246.4);
    expect(r.total).toBe(1786.4);
  });

  it('antes del arreglo el total daba 1.557,60: ese numero ya no sale', () => {
    const r = recomponerImpuestos(110, 1540, soloIva(16, 17.6));
    expect(r.total).not.toBe(1557.6);
  });
});

describe('recomponerImpuestos · el porcentaje manda', () => {
  it('recalcula el IVA sobre la base nueva', () => {
    expect(recomponerImpuestos(1000, 1200, soloIva(16, 160)).ivaMonto).toBe(192);
  });

  it('tambien cuando la base BAJA', () => {
    const r = recomponerImpuestos(1000, 500, soloIva(16, 160));
    expect(r.ivaMonto).toBe(80);
    expect(r.total).toBe(580);
  });

  it('sin cambio de base devuelve lo mismo que habia', () => {
    const r = recomponerImpuestos(1000, 1000, soloIva(16, 160));
    expect(r.ivaMonto).toBe(160);
    expect(r.total).toBe(1160);
  });

  it('redondea a dos decimales', () => {
    expect(recomponerImpuestos(100, 333.33, soloIva(16, 16)).ivaMonto).toBe(53.33);
  });

  it('un porcentaje disparatado se acota a 100', () => {
    expect(recomponerImpuestos(100, 100, soloIva(500, 16)).ivaMonto).toBe(100);
  });
});

describe('recomponerImpuestos · monto escrito a mano (sin %)', () => {
  it('se escala en la misma proporcion que la base', () => {
    // 50 sobre 1.000 es un 5%; al duplicar la base debe dar 100.
    expect(recomponerImpuestos(1000, 2000, soloIva(0, 50)).ivaMonto).toBe(100);
  });

  it('desde base cero se conserva: no hay proporcion que aplicar', () => {
    // Borrarlo en silencio seria perder un impuesto que alguien cargo a mano.
    expect(recomponerImpuestos(0, 1540, soloIva(0, 25)).ivaMonto).toBe(25);
  });
});

describe('recomponerImpuestos · IGTF', () => {
  it('se calcula sobre BASE + IVA, que es lo que sale de la caja', () => {
    const r = recomponerImpuestos(1000, 1000, {
      ivaAplicado: true, ivaPct: 16, ivaMonto: 160,
      igtfAplicado: true, igtfPct: 3, igtfMonto: 30,
    });
    expect(r.ivaMonto).toBe(160);
    expect(r.igtfMonto).toBe(34.8); // 3% de 1.160, no de 1.000
    expect(r.total).toBe(1194.8);
  });

  it('acompaña el cambio de base junto con el IVA', () => {
    const r = recomponerImpuestos(1000, 2000, {
      ivaAplicado: true, ivaPct: 16, ivaMonto: 160,
      igtfAplicado: true, igtfPct: 3, igtfMonto: 34.8,
    });
    expect(r.ivaMonto).toBe(320);
    expect(r.igtfMonto).toBe(69.6);
    expect(r.total).toBe(2389.6);
  });

  it('un IGTF a mano se escala contra base + IVA, no contra la base sola', () => {
    const r = recomponerImpuestos(1000, 2000, {
      ivaAplicado: true, ivaPct: 16, ivaMonto: 160,
      igtfAplicado: false, igtfPct: 0, igtfMonto: 0,
    });
    expect(r.igtfMonto).toBe(0);
  });
});

describe('recomponerImpuestos · impuesto apagado', () => {
  it('sin IVA aplicado no suma nada, aunque haya monto guardado', () => {
    const r = recomponerImpuestos(1000, 1200, {
      ivaAplicado: false, ivaPct: 16, ivaMonto: 160,
      igtfAplicado: false, igtfPct: 0, igtfMonto: 0,
    });
    expect(r.ivaMonto).toBe(0);
    expect(r.total).toBe(1200);
  });

  it('una orden sin impuestos: el total es la base', () => {
    const r = recomponerImpuestos(500, 800, {
      ivaAplicado: false, ivaPct: 0, ivaMonto: 0,
      igtfAplicado: false, igtfPct: 0, igtfMonto: 0,
    });
    expect(r.total).toBe(800);
    expect(r.impuestos).toBe(0);
  });
});

describe('recomponerImpuestos · bordes', () => {
  it('base nueva en cero deja todo en cero', () => {
    const r = recomponerImpuestos(1000, 0, soloIva(16, 160));
    expect(r.ivaMonto).toBe(0);
    expect(r.total).toBe(0);
  });

  it('una base negativa se lee como cero', () => {
    expect(recomponerImpuestos(1000, -50, soloIva(16, 160)).total).toBe(0);
  });

  it('un monto negativo guardado no resta', () => {
    expect(recomponerImpuestos(1000, 1000, soloIva(0, -40)).ivaMonto).toBe(0);
  });

  it('valores no numericos se leen como cero', () => {
    const r = recomponerImpuestos(
      'x' as unknown as number, 1000, soloIva(16, 'y' as unknown as number),
    );
    expect(r.ivaMonto).toBe(160);
  });
});

describe('baseNetaDesdeTotal', () => {
  it('le saca los impuestos al total', () => {
    expect(baseNetaDesdeTotal(1160, {
      ivaAplicado: true, ivaMonto: 160, igtfAplicado: false, igtfMonto: 0,
    })).toBe(1000);
  });

  it('no resta lo que no esta aplicado', () => {
    expect(baseNetaDesdeTotal(1160, {
      ivaAplicado: false, ivaMonto: 160, igtfAplicado: false, igtfMonto: 0,
    })).toBe(1160);
  });

  it('resta IVA e IGTF juntos', () => {
    expect(baseNetaDesdeTotal(1194.8, {
      ivaAplicado: true, ivaMonto: 160, igtfAplicado: true, igtfMonto: 34.8,
    })).toBe(1000);
  });

  it('nunca da negativo', () => {
    expect(baseNetaDesdeTotal(10, {
      ivaAplicado: true, ivaMonto: 160, igtfAplicado: false, igtfMonto: 0,
    })).toBe(0);
  });

  it('la ida y vuelta cierra: base → total → base', () => {
    const prev = { ivaAplicado: true, ivaPct: 16, ivaMonto: 0, igtfAplicado: false, igtfPct: 0, igtfMonto: 0 };
    const r = recomponerImpuestos(0, 1540, { ...prev, ivaMonto: 0 });
    expect(baseNetaDesdeTotal(r.total, { ivaAplicado: true, ivaMonto: r.ivaMonto, igtfAplicado: false, igtfMonto: 0 }))
      .toBe(1540);
  });
});

describe('impuestosDeOrden', () => {
  it('lee la orden tal como viene de la base', () => {
    expect(impuestosDeOrden({ iva_aplicado: true, iva_pct: 16, iva_monto: 17.6 })).toEqual({
      ivaAplicado: true, ivaPct: 16, ivaMonto: 17.6,
      igtfAplicado: false, igtfPct: 0, igtfMonto: 0,
    });
  });

  it('los nulos no rompen nada', () => {
    expect(impuestosDeOrden({ iva_aplicado: null, iva_pct: null, iva_monto: null })).toEqual({
      ivaAplicado: false, ivaPct: 0, ivaMonto: 0,
      igtfAplicado: false, igtfPct: 0, igtfMonto: 0,
    });
  });
});
