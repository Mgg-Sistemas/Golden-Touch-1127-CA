import { describe, it, expect } from 'vitest';
import { crearRepoDemo } from './demo/datosDemoAdministracion';

describe('AdminRepo · centros de acopio', () => {
  it('CRUD por empresa, ordenados por orden y con activo', async () => {
    const repo = crearRepoDemo();
    const a = await repo.crearCentro({ empresaClave: 'GT', nombre: 'Acopio 1', orden: 1, activo: true });
    await repo.crearCentro({ empresaClave: 'GT', nombre: 'Acopio 2', orden: 2, activo: true });
    await repo.crearCentro({ empresaClave: 'MTO', nombre: 'Otro centro', orden: 1, activo: true });

    expect((await repo.listCentros('GT')).map((c) => c.nombre)).toEqual(['Acopio 1', 'Acopio 2']);

    await repo.editarCentro(a.id, { nombre: 'Acopio Principal' });
    await repo.setActivoCentro(a.id, false);

    const gt = await repo.listCentros('GT');
    expect(gt.find((c) => c.id === a.id)).toMatchObject({ nombre: 'Acopio Principal', activo: false });
    // sin filtro de empresa, lista todos
    expect(await repo.listCentros()).toHaveLength(3);
  });
});
