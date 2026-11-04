import { describe, expect, it } from 'vitest';
import type { Personal, PersonalFamiliar } from '@/shared/lib/types';
import {
  filtrarFilasPersonal,
  normalizarPersonal,
  obtenerMetricasFichaPersonal,
  procesarFilasReportePersonal,
} from './personalMoldeable';

const mockPersonal1: Personal = {
  id: 'p1',
  empresa: 'GT',
  nombre: 'Carlos',
  apellido: 'García',
  cedula: 'V-11223344',
  rif: 'V-11223344-0',
  ficha_nro: '001',
  cargo: 'OPERADOR',
  departamento: 'OPERACIONES',
  activo: true,
  fecha_ingreso: '2023-01-15',
  fecha_nacimiento: '1990-05-20',
  genero: 'M',
  estado_civil: 'casado',
  grado_instruccion: 'bachiller',
  telefono: '0414-1112233',
  correo: 'carlos@goldentouch1127.com',
  sueldo_base: 500,
  created_at: '2023-01-15T00:00:00Z',
};

const mockPersonal2: Personal = {
  id: 'p2',
  empresa: 'MTO',
  nombre: 'María',
  apellido: 'Fernández',
  cedula: 'V-22334455',
  rif: 'V-22334455-1',
  ficha_nro: '002',
  cargo: 'COCINERO',
  departamento: 'ALIMENTACION',
  activo: true,
  fecha_ingreso: '2024-06-01',
  fecha_nacimiento: '1995-10-12',
  genero: 'F',
  estado_civil: 'soltero',
  grado_instruccion: 'universitario',
  sueldo_base: 400,
  created_at: '2024-06-01T00:00:00Z',
};

const mockPersonal3: Personal = {
  id: 'p3',
  empresa: 'GT',
  nombre: 'José',
  apellido: 'Rodríguez',
  cedula: 'V-33445566',
  rif: 'V-33445566-2',
  ficha_nro: '003',
  cargo: 'SOLDADOR',
  departamento: 'OPERACIONES',
  activo: false,
  fecha_ingreso: '2022-03-10',
  sueldo_base: 450,
  created_at: '2022-03-10T00:00:00Z',
};

const mockFamiliaresMap = new Map<string, PersonalFamiliar[]>([
  [
    'p1',
    [
      {
        id: 'f1',
        personal_id: 'p1',
        nombre: 'Carlitos García',
        parentesco: 'hijo',
        fecha_nacimiento: '2018-02-10',
        estudia: true,
        discapacidad: false,
        created_at: '2023-01-15T00:00:00Z',
      },
      {
        id: 'f2',
        personal_id: 'p1',
        nombre: 'Sofía García',
        parentesco: 'hijo',
        fecha_nacimiento: '2020-07-15',
        estudia: false,
        discapacidad: false,
        created_at: '2023-01-15T00:00:00Z',
      },
      {
        id: 'f3',
        personal_id: 'p1',
        nombre: 'Elena Pérez',
        parentesco: 'conyuge',
        estudia: false,
        discapacidad: false,
        created_at: '2023-01-15T00:00:00Z',
      },
    ],
  ],
]);

describe('personalMoldeable · Motor Puro', () => {
  it('normaliza correctamente personas con su carga familiar y métricas', () => {
    const f1 = normalizarPersonal(mockPersonal1, mockFamiliaresMap);
    expect(f1.nombre_completo).toBe('García, Carlos');
    expect(f1.sueldo_base).toBe(500);
    expect(f1.tiene_hijos).toBe(true);
    expect(f1.cantidad_hijos).toBe(2);
    expect(f1.carga_familiar_total).toBe(3);
    expect(f1.hijos_texto).toBe('2 hijo(s)');
    expect(f1.empresa).toBe('GT');

    const f2 = normalizarPersonal(mockPersonal2, mockFamiliaresMap);
    expect(f2.tiene_hijos).toBe(false);
    expect(f2.cantidad_hijos).toBe(0);
    expect(f2.hijos_texto).toBe('Sin hijos');
    expect(f2.empresa).toBe('MTO');
  });

  it('filtra correctamente por multi-empresa con checks', () => {
    const filas = [
      normalizarPersonal(mockPersonal1, mockFamiliaresMap),
      normalizarPersonal(mockPersonal2, mockFamiliaresMap),
      normalizarPersonal(mockPersonal3, mockFamiliaresMap),
    ];

    // Solo GT
    const soloGt = filtrarFilasPersonal(filas, { empresasSel: ['GT'] });
    expect(soloGt.length).toBe(2);
    expect(soloGt.every((f) => f.empresa === 'GT')).toBe(true);

    // Solo MTO
    const soloMto = filtrarFilasPersonal(filas, { empresasSel: ['MTO'] });
    expect(soloMto.length).toBe(1);
    expect(soloMto[0].id).toBe('p2');

    // Ninguna empresa
    const ninguna = filtrarFilasPersonal(filas, { empresasSel: ['__ninguno__'] });
    expect(ninguna.length).toBe(0);
  });

  it('filtra por carga familiar / hijos (con hijos vs sin hijos)', () => {
    const filas = [
      normalizarPersonal(mockPersonal1, mockFamiliaresMap),
      normalizarPersonal(mockPersonal2, mockFamiliaresMap),
      normalizarPersonal(mockPersonal3, mockFamiliaresMap),
    ];

    const conHijos = filtrarFilasPersonal(filas, { hijosFiltro: 'si' });
    expect(conHijos.length).toBe(1);
    expect(conHijos[0].id).toBe('p1');

    const sinHijos = filtrarFilasPersonal(filas, { hijosFiltro: 'no' });
    expect(sinHijos.length).toBe(2);
  });

  it('procesa y agrupa calculando KPIs, masa salarial y promedios', () => {
    const filas = [
      normalizarPersonal(mockPersonal1, mockFamiliaresMap),
      normalizarPersonal(mockPersonal2, mockFamiliaresMap),
      normalizarPersonal(mockPersonal3, mockFamiliaresMap),
    ];

    const resultado = procesarFilasReportePersonal(filas, 'departamento', 'sueldo_desc');

    expect(resultado.resumen.totalPersonal).toBe(3);
    expect(resultado.resumen.totalActivos).toBe(2);
    expect(resultado.resumen.totalInactivos).toBe(1);
    expect(resultado.resumen.masaSalarialTotalUsd).toBe(1350); // 500 + 400 + 450
    // Promedio sobre activos: (500 + 400 + 450) / 2 activos = 675
    expect(resultado.resumen.sueldoPromedioUsd).toBe(675);
    expect(resultado.resumen.conHijos).toBe(1);
    expect(resultado.resumen.sinHijos).toBe(2);
    expect(resultado.resumen.totalHijosRegistrados).toBe(2);

    // Grupos por departamento
    expect(resultado.grupos.length).toBe(2); // OPERACIONES (2 personas) y ALIMENTACION (1 persona)
    const grupoOps = resultado.grupos.find((g) => g.clave === 'OPERACIONES');
    expect(grupoOps).toBeDefined();
    expect(grupoOps?.totalPersonas).toBe(2);
    expect(grupoOps?.masaSalarialUsd).toBe(950);
  });

  it('genera métricas visuales dinámicas para fichas ejecutivas respetando los checks', () => {
    const f1 = normalizarPersonal(mockPersonal1, mockFamiliaresMap);

    // Con todas las columnas de métrica
    const metricasCompletas = obtenerMetricasFichaPersonal(f1, [
      'sueldo_base',
      'antiguedad_texto',
      'hijos_texto',
      'edad',
    ]);
    expect(metricasCompletas.length).toBe(4);
    expect(metricasCompletas[0].clave).toBe('sueldo_base');
    expect(metricasCompletas[0].valor).toContain('500');
    expect(metricasCompletas[2].clave).toBe('hijos');
    expect(metricasCompletas[2].valor).toBe('2 hijo(s)');

    // Si el usuario desmarca sueldo_base
    const metricasSinSueldo = obtenerMetricasFichaPersonal(f1, [
      'antiguedad_texto',
      'hijos_texto',
      'edad',
      'telefono',
    ]);
    expect(metricasSinSueldo.some((m) => m.clave === 'sueldo_base')).toBe(false);
    expect(metricasSinSueldo.some((m) => m.clave === 'antiguedad')).toBe(true);
    expect(metricasSinSueldo.some((m) => m.clave === 'contacto')).toBe(true);
  });
});
