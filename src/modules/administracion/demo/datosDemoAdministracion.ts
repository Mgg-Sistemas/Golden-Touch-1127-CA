/* ============================================================
   Golden Touch · Administración · datos de prueba (SOLO LOCAL)
   Empresas, gastos fijos, categorías y proveedores FICTICIOS para ver la
   vista sin base (D27). Nombres inventados a propósito (repo público): la
   única clave real es «GT» (el propio sistema); el resto es «Demo». No usar
   para nada que no sea la maqueta.
   `crearRepoDemo()` implementa AdminRepo en memoria: las altas y ediciones
   quedan mientras dure la página (no tocan ninguna base).
   ============================================================ */
import type { AdminCategoria, AdminRepo, CentroAcopio, CentroAcopioInput, DocumentoEmpresa, DocumentoEmpresaInput, Empresa, EmpresaInput, GastoFijo, GastoFijoInput, Movimiento, MovimientoInput, OpcionRef, Profesional, ProfesionalInput, TipoDocumento } from '../admin.repository';
import { calcularStatusVencimiento } from '../admin.repository';
import { generarPendientes as calcularPendientes } from '../administracionGenerar';

const uid = (): string => {
  try { return crypto.randomUUID(); } catch { return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`; }
};

const EMPRESAS_DEMO: Empresa[] = [
  { id: uid(), clave: 'GT', nombre: 'Golden Touch 1127, C.A.', rif: 'J-00000000-0', moneda: 'USD', logoPath: null, activa: true, orden: 1 },
  { id: uid(), clave: 'DEMO1', nombre: 'Minera Demo Norte, C.A.', rif: 'J-11111111-1', moneda: 'Bs', logoPath: null, activa: true, orden: 2 },
  { id: uid(), clave: 'DEMO2', nombre: 'Servicios Demo del Sur, C.A.', rif: 'J-22222222-2', moneda: 'USD', logoPath: null, activa: true, orden: 3 },
];

// Plan de cuentas curado de gasto fijo (propio del módulo, no el catálogo compartido).
const CATEGORIAS_DEMO: AdminCategoria[] = [
  { id: 'cat-serv', nombre: 'Servicios públicos', orden: 1, activa: true },
  { id: 'cat-alq', nombre: 'Alquileres', orden: 2, activa: true },
  { id: 'cat-hon', nombre: 'Honorarios profesionales', orden: 3, activa: true },
  { id: 'cat-para', nombre: 'Parafiscales', orden: 4, activa: true },
  { id: 'cat-imp', nombre: 'Impuestos y tasas', orden: 5, activa: true },
  { id: 'cat-seg', nombre: 'Seguros', orden: 6, activa: true },
  { id: 'cat-mant', nombre: 'Mantenimiento', orden: 7, activa: true },
  { id: 'cat-fin', nombre: 'Financieros', orden: 8, activa: true },
  { id: 'cat-otros', nombre: 'Otros', orden: 9, activa: true },
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
    base({ empresaClave: 'GT', concepto: 'Parafiscales (INCES)', proveedorId: null, proveedorNombre: 'INCES', categoriaGastoId: 'cat-para', monto: 1200, moneda: 'Bs', tasaRef: null, periodicidad: 'trimestral', diaVencimiento: 5, vigenteDesde: '2026-01-01', estado: 'activo' }),
  ];
}

/** Algo de histórico ya cargado (importado), para que Movimientos y Reporte no estén vacíos. */
function movimientosSemilla(): Movimiento[] {
  const m = (p: Omit<Movimiento, 'id'>): Movimiento => ({ id: uid(), ...p });
  return [
    m({ empresaClave: 'GT', gastoFijoId: null, concepto: 'Agua', proveedorNombre: 'Hidro Demo, C.A.', categoriaGastoId: 'cat-serv', periodo: '2026-09', fecha: '2026-09-05', monto: 1750, moneda: 'Bs', tasaRef: null, estadoPago: 'pagado', origen: 'importado', servicioDirectoId: null }),
    m({ empresaClave: 'GT', gastoFijoId: null, concepto: 'Agua', proveedorNombre: 'Hidro Demo, C.A.', categoriaGastoId: 'cat-serv', periodo: '2026-10', fecha: '2026-10-05', monto: 1800, moneda: 'Bs', tasaRef: null, estadoPago: 'pagado', origen: 'importado', servicioDirectoId: null }),
    m({ empresaClave: 'GT', gastoFijoId: null, concepto: 'Alquiler de oficina', proveedorNombre: 'Inmobiliaria Demo', categoriaGastoId: 'cat-alq', periodo: '2026-10', fecha: '2026-10-01', monto: 800, moneda: 'USD', tasaRef: 40, estadoPago: 'pagado', origen: 'importado', servicioDirectoId: null }),
    m({ empresaClave: 'DEMO1', gastoFijoId: null, concepto: 'Internet y telefonía', proveedorNombre: 'Energía Demo del Centro', categoriaGastoId: 'cat-serv', periodo: '2026-10', fecha: '2026-10-15', monto: 95, moneda: 'USD', tasaRef: 40, estadoPago: 'pagado', origen: 'importado', servicioDirectoId: null }),
  ];
}

/** Repo en memoria para la página de prueba: implementa AdminRepo sin tocar base. */
export function crearRepoDemo(): AdminRepo {
  const empresas: Empresa[] = EMPRESAS_DEMO.map((e) => ({ ...e }));
  const gastos: GastoFijo[] = gastosSemilla();
  const movimientos: Movimiento[] = movimientosSemilla();
  const documentos: DocumentoEmpresa[] = [];
  const categorias: AdminCategoria[] = CATEGORIAS_DEMO.map((c) => ({ ...c }));
  const centros: CentroAcopio[] = [];
  const profesionales: Profesional[] = [];
  const urlsDemo = new Map<string, string>(); // path → object URL (solo en memoria)
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
    listCentros: (empresaClave) => Promise.resolve(
      centros.filter((c) => !empresaClave || c.empresaClave === empresaClave)
        .map((c) => ({ ...c }))
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
    ),
    crearCentro: (c: CentroAcopioInput) => {
      const nuevo: CentroAcopio = { id: uid(), ...c };
      centros.push(nuevo);
      return Promise.resolve({ ...nuevo });
    },
    editarCentro: (id, cambios) => {
      const i = centros.findIndex((c) => c.id === id);
      if (i >= 0) centros[i] = { ...centros[i], ...cambios };
      return Promise.resolve();
    },
    setActivoCentro: (id, activo) => {
      const i = centros.findIndex((c) => c.id === id);
      if (i >= 0) centros[i] = { ...centros[i], activo };
      return Promise.resolve();
    },
    listProfesionales: () => Promise.resolve(
      profesionales.map((p) => ({ ...p })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    ),
    crearProfesional: (p: ProfesionalInput) => {
      const nuevo: Profesional = { id: uid(), ...p };
      profesionales.push(nuevo);
      return Promise.resolve({ ...nuevo });
    },
    editarProfesional: (id, cambios) => {
      const i = profesionales.findIndex((p) => p.id === id);
      if (i >= 0) profesionales[i] = { ...profesionales[i], ...cambios };
      return Promise.resolve();
    },
    setActivoProfesional: (id, activo) => {
      const i = profesionales.findIndex((p) => p.id === id);
      if (i >= 0) profesionales[i] = { ...profesionales[i], activo };
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
    listCategorias: () => Promise.resolve(
      categorias.filter((c) => c.activa).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')).map((c) => ({ id: c.id, nombre: c.nombre })),
    ),
    listAdminCategorias: () => Promise.resolve(
      categorias.map((c) => ({ ...c })).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')),
    ),
    crearAdminCategoria: (nombre) => {
      const nueva: AdminCategoria = { id: uid(), nombre: nombre.trim(), orden: (categorias.reduce((m, c) => Math.max(m, c.orden), 0) + 1), activa: true };
      categorias.push(nueva);
      return Promise.resolve({ ...nueva });
    },
    renombrarAdminCategoria: (id, nombre) => {
      const i = categorias.findIndex((c) => c.id === id);
      if (i >= 0) categorias[i] = { ...categorias[i], nombre: nombre.trim() };
      return Promise.resolve();
    },
    setActivaAdminCategoria: (id, activa) => {
      const i = categorias.findIndex((c) => c.id === id);
      if (i >= 0) categorias[i] = { ...categorias[i], activa };
      return Promise.resolve();
    },
    listProveedores: () => Promise.resolve(PROVEEDORES_DEMO.map((p) => ({ ...p }))),
    listMovimientos: (empresaClave) => Promise.resolve(
      movimientos.filter((m) => !empresaClave || m.empresaClave === empresaClave).map((m) => ({ ...m }))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)),
    ),
    crearMovimiento: (m: MovimientoInput) => {
      const nuevo: Movimiento = { id: uid(), ...m };
      movimientos.push(nuevo);
      return Promise.resolve({ ...nuevo });
    },
    editarMovimiento: (id, cambios) => {
      const i = movimientos.findIndex((m) => m.id === id);
      if (i >= 0) movimientos[i] = { ...movimientos[i], ...cambios };
      return Promise.resolve();
    },
    anularMovimiento: (id) => {
      const i = movimientos.findIndex((m) => m.id === id);
      if (i >= 0) movimientos[i] = { ...movimientos[i], estadoPago: 'anulado' };
      return Promise.resolve();
    },
    generarPendientes: (empresaClave, hasta = new Date()) => {
      const gs = gastos.filter((g) => !empresaClave || g.empresaClave === empresaClave);
      const existentes = movimientos.filter((m) => m.gastoFijoId).map((m) => ({ gastoFijoId: m.gastoFijoId as string, periodo: m.periodo }));
      const nuevos = calcularPendientes(gs, existentes, hasta);
      for (const n of nuevos) {
        movimientos.push({
          id: uid(), empresaClave: n.empresaClave, gastoFijoId: n.gastoFijoId, concepto: n.concepto, proveedorNombre: null,
          categoriaGastoId: n.categoriaGastoId, periodo: n.periodo, fecha: n.fecha, monto: n.monto, moneda: n.moneda, tasaRef: null,
          estadoPago: 'pendiente', origen: 'generado', servicioDirectoId: `demo-sd-${n.periodo}-${(n.gastoFijoId ?? '').slice(0, 6)}`,
        });
      }
      return Promise.resolve({ creados: nuevos.length });
    },
    marcarPagado: (id) => {
      const i = movimientos.findIndex((m) => m.id === id);
      if (i >= 0) movimientos[i] = { ...movimientos[i], estadoPago: 'pagado' };
      return Promise.resolve();
    },
    listDocumentos: (empresaClave) => Promise.resolve(
      documentos
        .filter((d) => !empresaClave || d.empresaClave === empresaClave)
        .map((d) => ({ ...d }))
        .sort((a, b) => (a.createdAt && b.createdAt && a.createdAt < b.createdAt ? 1 : -1)),
    ),
    subirDocumento: (empresaClave, tipo: TipoDocumento, file: File, meta?: Partial<DocumentoEmpresaInput>, actor?: string) => {
      const path = `demo/${empresaClave}/${uid()}-${file.name}`;
      try { urlsDemo.set(path, URL.createObjectURL(file)); } catch { /* sin createObjectURL: la previsualización queda vacía */ }
      const nowIso = new Date().toISOString();
      const status = calcularStatusVencimiento(meta?.fechaVencimiento, meta?.statusVencimiento);
      const nuevo: DocumentoEmpresa = {
        id: uid(),
        empresaClave,
        carpeta: meta?.carpeta || 'otros',
        centroAcopioId: meta?.centroAcopioId || null,
        responsable: meta?.responsable || null,
        tipo,
        nombre: meta?.nombre || file.name,
        path,
        contentType: file.type || null,
        tamano: file.size,
        fechaEmision: meta?.fechaEmision || null,
        fechaVencimiento: meta?.fechaVencimiento || null,
        statusVencimiento: status,
        socioNombre: meta?.socioNombre || null,
        entidadEmisora: meta?.entidadEmisora || null,
        numeroRegistro: meta?.numeroRegistro || null,
        notaTramite: meta?.notaTramite || null,
        historial: [
          {
            id: uid(),
            fecha: nowIso,
            actor: actor || 'demo@goldentouch.com',
            accion: 'creacion',
            detalle: 'Documento subido en modo demo',
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      documentos.push(nuevo);
      return Promise.resolve({ ...nuevo });
    },
    editarDocumento: (id: string, cambios: Partial<DocumentoEmpresaInput>, actor?: string, detalle?: string) => {
      const idx = documentos.findIndex((d) => d.id === id);
      if (idx < 0) return Promise.reject(new Error('Documento demo no encontrado.'));
      const d = documentos[idx];
      const nowIso = new Date().toISOString();
      const nuevoStatus = calcularStatusVencimiento(
        cambios.fechaVencimiento !== undefined ? cambios.fechaVencimiento : d.fechaVencimiento,
        cambios.statusVencimiento !== undefined ? cambios.statusVencimiento : d.statusVencimiento,
      );
      const histItem = {
        id: uid(),
        fecha: nowIso,
        actor: actor || 'demo@goldentouch.com',
        accion: cambios.statusVencimiento ? ('cambio_status' as const) : ('modificacion' as const),
        detalle: detalle || 'Metadatos actualizados en demo',
      };
      const actualizado: DocumentoEmpresa = {
        ...d,
        ...cambios,
        statusVencimiento: nuevoStatus,
        historial: [...d.historial, histItem],
        updatedAt: nowIso,
      };
      documentos[idx] = actualizado;
      return Promise.resolve({ ...actualizado });
    },
    urlDocumento: (path) => Promise.resolve(urlsDemo.get(path) ?? ''),
    borrarDocumento: (doc) => {
      const i = documentos.findIndex((d) => d.id === doc.id);
      if (i >= 0) documentos.splice(i, 1);
      const u = urlsDemo.get(doc.path);
      if (u) { try { URL.revokeObjectURL(u); } catch { /* ya revocada */ } urlsDemo.delete(doc.path); }
      return Promise.resolve();
    },
  };
}
