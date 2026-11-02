/* ============================================================
   Golden Touch · Administración · datos de prueba (SOLO LOCAL)
   Empresas, gastos fijos, categorías y proveedores FICTICIOS para ver la
   vista sin base (D27). Nombres inventados a propósito (repo público): la
   única clave real es «GT» (el propio sistema); el resto es «Demo». No usar
   para nada que no sea la maqueta.
   `crearRepoDemo()` implementa AdminRepo en memoria: las altas y ediciones
   quedan mientras dure la página (no tocan ninguna base).
   ============================================================ */
import type { AdminRepo, Empresa, EmpresaInput, GastoFijo, GastoFijoInput, OpcionRef } from '../admin.repository';

const uid = (): string => {
  try { return crypto.randomUUID(); } catch { return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`; }
};

const EMPRESAS_DEMO: Empresa[] = [
  { id: uid(), clave: 'GT', nombre: 'Golden Touch 1127, C.A.', rif: 'J-00000000-0', moneda: 'USD', logoPath: null, activa: true, orden: 1 },
  { id: uid(), clave: 'DEMO1', nombre: 'Minera Demo Norte, C.A.', rif: 'J-11111111-1', moneda: 'Bs', logoPath: null, activa: true, orden: 2 },
  { id: uid(), clave: 'DEMO2', nombre: 'Servicios Demo del Sur, C.A.', rif: 'J-22222222-2', moneda: 'USD', logoPath: null, activa: true, orden: 3 },
];

const CATEGORIAS_DEMO: OpcionRef[] = [
  { id: 'cat-serv', nombre: 'Servicios públicos' },
  { id: 'cat-alq', nombre: 'Alquiler' },
  { id: 'cat-hon', nombre: 'Honorarios profesionales' },
  { id: 'cat-otros', nombre: 'Otros gastos fijos' },
];

const PROVEEDORES_DEMO: OpcionRef[] = [
  { id: 'prov-agua', nombre: 'Hidro Demo, C.A.' },
  { id: 'prov-luz', nombre: 'Energía Demo del Centro' },
  { id: 'prov-cont', nombre: 'Contadores Demo & Asociados' },
  { id: 'prov-abo', nombre: 'Bufete Demo Legal' },
];

function gastosSemilla(): GastoFijo[] {
  const base = (g: Omit<GastoFijo, 'id'>): GastoFijo => ({ id: uid(), ...g });
  return [
    base({ empresaClave: 'GT', concepto: 'Agua', proveedorId: 'prov-agua', proveedorNombre: 'Hidro Demo, C.A.', categoriaGastoId: 'cat-serv', monto: 1800, moneda: 'Bs', tasaRef: null, periodicidad: 'mensual', diaVencimiento: 5, vigenteDesde: '2026-01-01', estado: 'activo' }),
    base({ empresaClave: 'GT', concepto: 'Alquiler de oficina', proveedorId: null, proveedorNombre: 'Inmobiliaria Demo', categoriaGastoId: 'cat-alq', monto: 800, moneda: 'USD', tasaRef: 40, periodicidad: 'mensual', diaVencimiento: 1, vigenteDesde: '2026-01-01', estado: 'activo' }),
    base({ empresaClave: 'GT', concepto: 'Honorarios del contador', proveedorId: 'prov-cont', proveedorNombre: 'Contadores Demo & Asociados', categoriaGastoId: 'cat-hon', monto: 150, moneda: 'USD', tasaRef: 40, periodicidad: 'mensual', diaVencimiento: 10, vigenteDesde: '2026-01-01', estado: 'activo' }),
    base({ empresaClave: 'DEMO1', concepto: 'Internet y telefonía', proveedorId: 'prov-luz', proveedorNombre: 'Energía Demo del Centro', categoriaGastoId: 'cat-serv', monto: 95, moneda: 'USD', tasaRef: 40, periodicidad: 'mensual', diaVencimiento: 15, vigenteDesde: '2026-02-01', estado: 'activo' }),
    base({ empresaClave: 'DEMO1', concepto: 'Alquiler de galpón', proveedorId: null, proveedorNombre: 'Inmobiliaria Demo', categoriaGastoId: 'cat-alq', monto: 2400, moneda: 'USD', tasaRef: 40, periodicidad: 'trimestral', diaVencimiento: 1, vigenteDesde: '2026-01-01', estado: 'suspendido' }),
    base({ empresaClave: 'DEMO2', concepto: 'Honorarios del abogado', proveedorId: 'prov-abo', proveedorNombre: 'Bufete Demo Legal', categoriaGastoId: 'cat-hon', monto: 300, moneda: 'USD', tasaRef: 40, periodicidad: 'bimensual', diaVencimiento: 20, vigenteDesde: '2026-01-01', estado: 'activo' }),
  ];
}

/** Repo en memoria para la página de prueba: implementa AdminRepo sin tocar base. */
export function crearRepoDemo(): AdminRepo {
  const empresas: Empresa[] = EMPRESAS_DEMO.map((e) => ({ ...e }));
  const gastos: GastoFijo[] = gastosSemilla();
  const claveDe = (id: string) => empresas.find((e) => e.id === id)?.clave;

  return {
    listEmpresas: () => Promise.resolve(empresas.map((e) => ({ ...e })).sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave, 'es'))),
    crearEmpresa: (e: EmpresaInput) => {
      const nueva: Empresa = { id: uid(), ...e };
      empresas.push(nueva);
      return Promise.resolve({ ...nueva });
    },
    editarEmpresa: (id, cambios) => {
      const i = empresas.findIndex((e) => e.id === id);
      if (i >= 0) empresas[i] = { ...empresas[i], ...cambios };
      return Promise.resolve();
    },
    contarGastosDeEmpresa: (clave) => Promise.resolve(gastos.filter((g) => g.empresaClave === clave).length),
    desactivarEmpresa: (id) => {
      const i = empresas.findIndex((e) => e.id === id);
      if (i >= 0) empresas[i] = { ...empresas[i], activa: false };
      return Promise.resolve();
    },
    borrarEmpresa: (id) => {
      const clave = claveDe(id);
      const i = empresas.findIndex((e) => e.id === id);
      if (i >= 0 && !(clave && gastos.some((g) => g.empresaClave === clave))) empresas.splice(i, 1);
      return Promise.resolve();
    },
    listGastosFijos: (empresaClave) => Promise.resolve(
      gastos.filter((g) => !empresaClave || g.empresaClave === empresaClave).map((g) => ({ ...g }))
        .sort((a, b) => a.concepto.localeCompare(b.concepto, 'es')),
    ),
    crearGastoFijo: (g: GastoFijoInput) => {
      const nuevo: GastoFijo = { id: uid(), ...g };
      gastos.push(nuevo);
      return Promise.resolve({ ...nuevo });
    },
    editarGastoFijo: (id, cambios) => {
      const i = gastos.findIndex((g) => g.id === id);
      if (i >= 0) gastos[i] = { ...gastos[i], ...cambios };
      return Promise.resolve();
    },
    setEstadoGastoFijo: (id, estado) => {
      const i = gastos.findIndex((g) => g.id === id);
      if (i >= 0) gastos[i] = { ...gastos[i], estado };
      return Promise.resolve();
    },
    listCategorias: () => Promise.resolve(CATEGORIAS_DEMO.map((c) => ({ ...c }))),
    listProveedores: () => Promise.resolve(PROVEEDORES_DEMO.map((p) => ({ ...p }))),
  };
}
