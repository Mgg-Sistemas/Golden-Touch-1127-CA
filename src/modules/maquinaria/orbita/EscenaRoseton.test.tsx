/* El rosetón sin navegador (render de servidor): peso del SVG y nombres accesibles (guía §5 y §7). */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MaquinariaEquipo } from '../maquinariaEquipos.repository';
import { armarOrbita, ID_GENERAL } from './orbitaDatos';
import { EscenaRoseton } from './EscenaRoseton';
import { datosDemoOrbita } from './demo/datosDemoOrbita';

/** 100 equipos de 12 empresas genéricas: 7 tarjetas, «Otros» y «Sin propietario» compiten. */
function cien(): MaquinariaEquipo[] {
  const d = datosDemoOrbita().equipos;
  return Array.from({ length: 100 }, (_, i) => ({ ...d[i % d.length], id: `x${i}`, propietario: i % 9 === 0 ? null : `EMPRESA ${'ABCDEFGHIJKL'[i % 12]}` }));
}

function render(equipos: MaquinariaEquipo[]) {
  const m = armarOrbita({ equipos });
  const html = renderToStaticMarkup(<EscenaRoseton general={m.general} propietarios={m.propietarios} elegido={ID_GENERAL} onElegir={() => {}} />);
  return { m, html };
}

describe('el rosetón', () => {
  it('con 100 equipos, el SVG tiene menos de 150 elementos', () => {
    const { html } = render(cien());
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    const elementos = (svg.match(/<(path|line|g|circle|rect)\b/g) ?? []).length;
    expect(elementos).toBeGreaterThan(0);
    expect(elementos).toBeLessThan(150);
  });

  it('cada tarjeta es un botón con su nombre accesible, en el orden del anillo', () => {
    const { m, html } = render(cien());
    const etiquetas = [...html.matchAll(/class="ros-tarjeta[^"]*"[^>]*aria-label="([^"]+)"/g)].map((x) => x[1]);
    expect(etiquetas).toHaveLength(m.propietarios.length);
    for (const e of etiquetas) expect(e).toMatch(/^[^,]+, \d+ equipos, \d+ operativos, \d+ por ciento/);
  });

  it('el anillo es aria-hidden y la medalla dice toda la flota', () => {
    const { m, html } = render(cien());
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain(`aria-label="Toda la flota, ${m.general.total} equipos`);
  });

  it('tarjeta y arco comparten data-id (así el hover marca los dos sin React)', () => {
    const { m, html } = render(cien());
    for (const p of m.propietarios) {
      expect((html.match(new RegExp(`data-id="${p.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });
});
