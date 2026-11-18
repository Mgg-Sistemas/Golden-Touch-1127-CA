import { describe, expect, it } from 'vitest';
import { armarOrbita, type ModeloOrbita } from '../orbitaDatos';
import { datosDemoOrbita } from '../demo/datosDemoOrbita';
import { protagonistas } from './vitrinaDatos';

const modelo: ModeloOrbita = (() => {
  const d = datosDemoOrbita();
  return armarOrbita({ equipos: d.equipos, lecturas: d.lecturas, avisos: d.avisos, categorias: d.categorias });
})();

describe('la Vitrina · protagonistas', () => {
  it('máquina: una por equipo de la flota, con sus datos esenciales', () => {
    const p = protagonistas(modelo, 'maquina');
    expect(p).toHaveLength(modelo.flota.length);
    const etiquetas = p[0].datos.map((d) => d.etiqueta);
    expect(etiquetas).toContain('Estado');
    expect(etiquetas).toContain('Horómetro');
    expect(p.every((x) => x.grafico.modo === 'maquina')).toBe(true);
    expect(p.every((x) => x.accion?.tipo === 'ficha')).toBe(true);
  });

  it('el estado lleva su tono (operativa = ok, averiada = bad)', () => {
    const porEstado = new Map(modelo.flota.map((f) => [f.id, f.estado]));
    const p = protagonistas(modelo, 'maquina');
    const unaOperativa = p.find((x) => porEstado.get(x.id) === 'operativa');
    const unaAveriada = p.find((x) => porEstado.get(x.id) === 'averiada');
    expect(unaOperativa?.datos.find((d) => d.etiqueta === 'Estado')?.tono).toBe('ok');
    expect(unaAveriada?.datos.find((d) => d.etiqueta === 'Estado')?.tono).toBe('bad');
  });

  it('propietario: uno por tarjeta, con inicial y acción de elegir', () => {
    const p = protagonistas(modelo, 'propietario');
    expect(p).toHaveLength(modelo.propietarios.length);
    expect(p[0].grafico.inicial).toMatch(/^[A-ZÑ0-9]{1,2}$/);
    expect(p.every((x) => x.accion?.tipo === 'elegir')).toBe(true);
    expect(p[0].datos.map((d) => d.etiqueta)).toContain('Operativos');
  });

  it('ubicación: una por sitio (incluye «Sin ubicación»), ordenadas por cantidad', () => {
    const p = protagonistas(modelo, 'ubicacion');
    const sitios = new Set(modelo.flota.map((f) => f.ubicacion || 'Sin ubicación'));
    expect(p).toHaveLength(sitios.size);
    const cantidades = p.map((x) => Number(x.datos.find((d) => d.etiqueta === 'Equipos')!.valor));
    expect([...cantidades]).toEqual([...cantidades].sort((a, b) => b - a));
    expect(p.every((x) => x.grafico.modo === 'ubicacion')).toBe(true);
  });

  it('el texto de búsqueda trae marca/dueño: una máquina VOLVO se encuentra por «volvo»', () => {
    const p = protagonistas(modelo, 'maquina');
    const volvo = modelo.flota.find((f) => /volvo/i.test(`${f.marca ?? ''} ${f.modelo ?? ''}`));
    expect(volvo, 'la demo tiene equipos VOLVO').toBeTruthy();
    const prot = p.find((x) => x.id === volvo!.id)!;
    expect(prot.buscar).toContain('volvo');
    expect(prot.buscar).toBe(prot.buscar.toLowerCase());
  });

  it('es determinista: dos llamadas dan lo mismo', () => {
    expect(protagonistas(modelo, 'maquina')).toEqual(protagonistas(modelo, 'maquina'));
  });
});
