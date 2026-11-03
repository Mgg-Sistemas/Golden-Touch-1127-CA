/* ============================================================================
   Golden Touch · Administración · importación del histórico (parser puro)
   De un CSV (o texto pegado) arma movimientos sueltos del histórico, con una
   validación explícita por fila. No confía en el orden: mapea por el nombre de
   la columna del encabezado. Columnas: empresa, fecha, concepto, monto, moneda
   (obligatorias) · proveedor, periodo, categoria, estado, nota (opcionales).
   Sin React, sin base, determinista.
   ============================================================================ */
import { tokenPeriodo, type Moneda } from './administracionCalculo';
import type { MovimientoInput, OpcionRef } from './admin.repository';

export interface ContextoImport {
  empresas: { clave: string; nombre: string }[];
  categorias: OpcionRef[];
}
export interface ResultadoImport {
  filas: MovimientoInput[];
  errores: { fila: number; motivo: string }[];
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ALIAS: Record<string, string> = {
  empresa: 'empresa', razon: 'empresa', 'razon social': 'empresa',
  fecha: 'fecha', concepto: 'concepto', servicio: 'concepto', descripcion: 'concepto',
  monto: 'monto', importe: 'monto', total: 'monto', moneda: 'moneda',
  proveedor: 'proveedor', beneficiario: 'proveedor', periodo: 'periodo',
  categoria: 'categoria', estado: 'estado', 'estado de pago': 'estado', estado_pago: 'estado', nota: 'nota',
};

/** Parte una línea CSV respetando comillas dobles. */
function partirCsv(linea: string): string[] {
  const out: string[] = [];
  let cur = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') { cur += '"'; i += 1; } else enComillas = !enComillas;
    } else if ((c === ',' || c === ';' || c === '\t') && !enComillas) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseFecha(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s); // dd/mm/aaaa
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function parseMonto(v: string): number | null {
  if (!/\d/.test(v)) return null; // «abc» no es un monto
  // Acepta 1.800,00 (es) y 1800.00 (en).
  let s = v.replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function parseImportacion(texto: string, ctx: ContextoImport): ResultadoImport {
  const filas: MovimientoInput[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (lineas.length < 2) return { filas, errores: [{ fila: 0, motivo: 'El archivo no tiene datos (encabezado + al menos una fila).' }] };

  const cols = partirCsv(lineas[0]).map((h) => ALIAS[norm(h)] ?? norm(h));
  const idx = (nombre: string) => cols.indexOf(nombre);
  for (const req of ['empresa', 'fecha', 'concepto', 'monto', 'moneda']) {
    if (idx(req) < 0) return { filas, errores: [{ fila: 0, motivo: `Falta la columna obligatoria «${req}».` }] };
  }
  const empPorClave = new Map(ctx.empresas.map((e) => [norm(e.clave), e.clave]));
  const empPorNombre = new Map(ctx.empresas.map((e) => [norm(e.nombre), e.clave]));
  const catPorNombre = new Map(ctx.categorias.map((c) => [norm(c.nombre), c.id]));

  for (let i = 1; i < lineas.length; i += 1) {
    const f = partirCsv(lineas[i]);
    const val = (n: string) => (idx(n) >= 0 ? (f[idx(n)] ?? '').trim() : '');
    const fila = i + 1;
    const empRaw = val('empresa');
    const empresaClave = empPorClave.get(norm(empRaw)) ?? empPorNombre.get(norm(empRaw));
    if (!empresaClave) { errores.push({ fila, motivo: `Empresa «${empRaw}» no existe.` }); continue; }
    const fecha = parseFecha(val('fecha'));
    if (!fecha) { errores.push({ fila, motivo: `Fecha inválida «${val('fecha')}».` }); continue; }
    const concepto = val('concepto');
    if (!concepto) { errores.push({ fila, motivo: 'Concepto vacío.' }); continue; }
    const monto = parseMonto(val('monto'));
    if (monto == null) { errores.push({ fila, motivo: `Monto inválido «${val('monto')}».` }); continue; }
    const monedaRaw = norm(val('moneda'));
    const moneda: Moneda | null = monedaRaw === 'bs' || monedaRaw === 'bolivares' ? 'Bs' : monedaRaw === 'usd' || monedaRaw === '$' || monedaRaw === 'dolares' ? 'USD' : null;
    if (!moneda) { errores.push({ fila, motivo: `Moneda «${val('moneda')}» (usa Bs o USD).` }); continue; }

    const periodo = val('periodo') || tokenPeriodo(fecha, 'mensual');
    const estadoRaw = norm(val('estado'));
    const estadoPago = estadoRaw === 'pendiente' ? 'pendiente' : estadoRaw === 'anulado' ? 'anulado' : 'pagado';
    const categoriaGastoId = catPorNombre.get(norm(val('categoria'))) ?? null;

    filas.push({
      empresaClave, gastoFijoId: null, concepto, proveedorNombre: val('proveedor') || null,
      categoriaGastoId, periodo, fecha, monto, moneda, tasaRef: null, estadoPago, origen: 'importado', servicioDirectoId: null,
    });
  }
  return { filas, errores };
}
