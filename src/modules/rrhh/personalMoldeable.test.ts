import { describe, expect, it } from 'vitest';
import type { Personal, PersonalFamiliar, PersonalSueldo } from '@/shared/lib/types';
import type { PersonalCargo } from './cargos';
import {
  CAMPOS_POR_DEFECTO_POR_AMBITO,
  CAMPOS_POR_DEFECTO_POR_MODO,
  CAMPOS_REPORTE_PERSONAL,
  calcularKpisCabeceraDinamicos,
  filtrarFilasPersonal,
  formatearDatosPagoPersonal,
  normalizarHistoricoCargos,
  normalizarHistoricoSalarial,
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

  it('normaliza histórico salarial calculando deltas en $ y % y motivos', () => {
    const personasMap = new Map<string, Personal>([
      ['p1', mockPersonal1],
      ['p2', mockPersonal2],
    ]);

    const cambiosSueldo: PersonalSueldo[] = [
      {
        id: 's1',
        personal_id: 'p1',
        sueldo_nuevo: 500,
        sueldo_anterior: 400,
        fecha: '2024-01-01',
        motivo: 'Ajuste anual',
        nota: null,
        created_by: 'Admin',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 's2',
        personal_id: 'p2',
        sueldo_nuevo: 400,
        sueldo_anterior: 350,
        fecha: '2024-02-01',
        motivo: 'Promoción',
        nota: null,
        created_by: 'RRHH',
        created_at: '2024-02-01T00:00:00Z',
      },
    ];

    const filas = normalizarHistoricoSalarial(cambiosSueldo, personasMap, mockFamiliaresMap);
    expect(filas.length).toBe(2);
    expect(filas[0].sueldo_base).toBe(500);
    expect(filas[0].sueldo_anterior).toBe(400);
    expect(filas[0].variacion_sueldo_usd).toBe(100);
    expect(filas[0].variacion_sueldo_pct).toBe(25);
    expect(filas[0].motivo_ultimo_aumento).toBe('Ajuste anual');
  });

  it('normaliza histórico de cargos reflejando cargo anterior, nuevo y motivo', () => {
    const personasMap = new Map<string, Personal>([
      ['p1', mockPersonal1],
    ]);

    const cambiosCargo: PersonalCargo[] = [
      {
        id: 'c1',
        personal_id: 'p1',
        cargo_anterior: 'AYUDANTE',
        cargo_nuevo: 'OPERADOR',
        departamento_anterior: 'MANTENIMIENTO',
        departamento_nuevo: 'OPERACIONES',
        fecha: '2024-03-01',
        motivo: 'Ascenso por desempeño',
        nota: null,
        actor_name: 'Gerencia',
        created_by: 'Gerencia',
        created_at: '2024-03-01T00:00:00Z',
      },
    ];

    const filas = normalizarHistoricoCargos(cambiosCargo, personasMap, mockFamiliaresMap);
    expect(filas.length).toBe(1);
    expect(filas[0].cargo).toBe('OPERADOR');
    expect(filas[0].cargo_anterior).toBe('AYUDANTE');
    expect(filas[0].departamento).toBe('OPERACIONES');
    expect(filas[0].departamento_anterior).toBe('MANTENIMIENTO');
    expect(filas[0].motivo_cambio_cargo).toBe('Ascenso por desempeño');
  });

  it('calcula KPIs dinámicos de cabecera respondiendo fielmente a las columnas marcadas', () => {
    const filas = [
      normalizarPersonal(mockPersonal1, mockFamiliaresMap),
      normalizarPersonal(mockPersonal2, mockFamiliaresMap),
    ];
    const { resumen } = procesarFilasReportePersonal(filas, 'departamento');

    // Con todas las columnas
    const kpisConSueldo = calcularKpisCabeceraDinamicos(filas, resumen, ['sueldo_base', 'antiguedad_texto', 'hijos_texto'], 'directorio');
    expect(kpisConSueldo.some((k) => k.id === 'masa_salarial')).toBe(true);

    // Sin columnas de sueldo: NO debe mostrar masa salarial, debe mostrar fallback o métricas alternativas
    const kpisSinSueldo = calcularKpisCabeceraDinamicos(filas, resumen, ['antiguedad_texto', 'hijos_texto', 'departamento'], 'directorio');
    expect(kpisSinSueldo.some((k) => k.id === 'masa_salarial')).toBe(false);
    expect(kpisSinSueldo.some((k) => k.id === 'antiguedad')).toBe(true);
    expect(kpisSinSueldo.some((k) => k.id === 'carga_familiar')).toBe(true);
  });

  it('incluye RIF y todos los campos del formulario (datos de pago, trabajo anterior, alergias, emergencia y carga familiar)', () => {
    expect(CAMPOS_POR_DEFECTO_POR_MODO.detallado).toContain('rif');
    expect(CAMPOS_POR_DEFECTO_POR_AMBITO.directorio).toContain('rif');

    const clavesCatalogo = new Set(CAMPOS_REPORTE_PERSONAL.map((c) => c.clave));
    for (const k of [
      'rif',
      'datos_pago',
      'carga_familiar_total',
      'detalle_familiares',
      'trabajo_anterior',
      'alergias',
      'enfermedades',
      'parentesco_emergencia',
    ]) {
      expect(clavesCatalogo.has(k)).toBe(true);
    }

    expect(formatearDatosPagoPersonal(null)).toBe('');
    expect(formatearDatosPagoPersonal({})).toBe('');

    const personaCompleta: Personal = {
      ...mockPersonal1,
      grado_instruccion: 'universitario',
      trabajo_anterior_empresa: 'SIDOR',
      trabajo_anterior_cargo: 'Operador',
      trabajo_anterior_duracion: '4 años',
      trabajo_anterior_sueldo: 320,
      tiene_alergias: true,
      alergias_detalle: 'Penicilina',
      tiene_enfermedad: false,
      contacto_emergencia: 'Elena Pérez',
      contacto_emergencia_parentesco: 'conyuge',
      telefono_emergencia: '0414-9998877',
      datos_pago: {
        cuentas: [
          { id: 'c1', tipo: 'pago_movil', banco: '0102', telefono: '0414-1112233', cedula: 'V-11223344', principal: true },
        ],
      },
    };

    const fila = normalizarPersonal(personaCompleta, mockFamiliaresMap);
    expect(fila.rif).toBe('V-11223344-0');
    expect(fila.grado_instruccion_texto).toBe('Universitario');
    expect(fila.trabajo_anterior).toBe('SIDOR · Operador · 4 años · $ 320');
    expect(fila.alergias).toBe('Sí · Penicilina');
    expect(fila.enfermedades).toBe('No');
    expect(fila.parentesco_emergencia).toBe('Cónyuge');
    expect(fila.detalle_familiares).toContain('Elena Pérez (Cónyuge)');
    expect(fila.datos_pago).toContain('Pago móvil (Bs):');

    const metricas = obtenerMetricasFichaPersonal(fila, ['rif', 'datos_pago', 'contacto_emergencia', 'trabajo_anterior']);
    expect(metricas.some((m) => m.clave === 'rif')).toBe(true);
    expect(metricas.some((m) => m.clave === 'datos_pago')).toBe(true);
    expect(metricas.some((m) => m.clave === 'emergencia')).toBe(true);
    expect(metricas.some((m) => m.clave === 'trabajo_anterior')).toBe(true);
  });
});
