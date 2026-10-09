/* ============================================================
   Golden Touch · RRHH · Sueldos históricos (cálculo puro)

   Para cargar los sueldos VIEJOS que están en Excel y ver en qué año cambió
   el sueldo de cada quien. Un sueldo histórico va siempre ANTES del sueldo
   vigente: entra al historial, pero no toca lo que hoy se paga. La base
   (`registrar_sueldo_historico` / `cargar_sueldos_historicos`) repite estas
   reglas; aquí se avisan antes de mandar nada.
   ============================================================ */
import type { PersonalSueldo } from '@/shared/lib/types';

/** Motivo por defecto de un sueldo viejo cargado a posteriori. */
export const MOTIVO_HISTORICO = 'Registro histórico';

/**
 * Hasta qué fecha (excluida) se puede cargar un sueldo histórico: la del
 * sueldo vigente, que es el último renglón que no es histórico. `null` si la
 * persona todavía no tiene renglones (entonces vale hasta hoy).
 */
export function topeHistorico(filas: Pick<PersonalSueldo, 'fecha' | 'historico'>[]): string | null {
  let tope: string | null = null;
  for (const f of filas) {
    if (f.historico) continue;
    const d = String(f.fecha).slice(0, 10);
    if (!tope || d > tope) tope = d;
  }
  return tope;
}

/** Lo que impide guardar un sueldo histórico, en palabras. `null` = se puede. */
export function errorSueldoHistorico(
  sueldo: number | null | undefined,
  fecha: string,
  motivo: string,
  tope: string | null,
  hoy: string,
  fechasUsadas: string[] = [],
): string | null {
  if (sueldo === null || sueldo === undefined || !Number.isFinite(Number(sueldo))) return 'Escribe el sueldo que ganaba.';
  if (Number(sueldo) < 0) return 'El sueldo no puede ser negativo.';
  const f = String(fecha ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return 'Indica desde qué fecha regía ese sueldo.';
  if (f > hoy) return 'Un sueldo histórico no puede tener fecha futura.';
  if (tope && f >= tope) return `Tiene que ser anterior al sueldo vigente (desde ${dmy(tope)}). Para un cambio de hoy en adelante usa «Cambiar sueldo».`;
  if (fechasUsadas.some((u) => String(u).slice(0, 10) === f)) return `Ya hay un sueldo registrado con fecha ${dmy(f)}.`;
  if (!String(motivo ?? '').trim()) return 'Indica el motivo.';
  return null;
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Cédula comparable: solo los dígitos («V-12.345.678» → «12345678»). */
export function normCedula(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Fecha del Excel a ISO. Acepta: fecha de Excel (Date o número de serie),
 * «dd/mm/aaaa», «aaaa-mm-dd», «mm/aaaa» (día 1) y solo el año «2021» (1 de enero).
 */
export function parseFechaExcel(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 1900 && v <= 2200 && Number.isInteger(v)) return `${v}-01-01`;
    // Número de serie de Excel (días desde 1899-12-30).
    const d = new Date(Math.round((v - 25569) * 86400000));
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return valida(+m[2], +m[1], 1);
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
function valida(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

/** Monto del Excel: número, o texto con coma o punto decimal («1.250,50», «1250.5», «$300»). */
export function parseMontoExcel(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface PersonaRef { id: string; cedula?: string | null; nombre: string; apellido?: string | null }

export interface FilaHistoricoExcel {
  /** Número de fila en la hoja (para que el usuario la encuentre). */
  fila: number;
  cedula: string;
  persona: PersonaRef | null;
  fecha: string | null;
  sueldo: number | null;
  motivo: string;
  nota: string;
  error: string | null;
}

/** Busca la columna por nombre, sin importar mayúsculas, tildes ni espacios. */
function col(row: Record<string, unknown>, ...nombres: string[]): unknown {
  const clave = (k: string) => k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const buscadas = nombres.map(clave);
  for (const k of Object.keys(row)) if (buscadas.includes(clave(k))) return row[k];
  return undefined;
}

/**
 * Revisa las filas leídas del Excel (una por sueldo) contra el personal.
 * Columnas: Cédula, Fecha (o Año), Sueldo, Motivo (opcional), Nota (opcional).
 * Las reglas contra el historial ya cargado (tope y fechas repetidas) las
 * aplica la base al guardar.
 */
export function analizarFilasHistorico(
  rows: Record<string, unknown>[],
  personas: PersonaRef[],
  hoy: string,
): FilaHistoricoExcel[] {
  const porCedula = new Map(personas.filter((p) => normCedula(p.cedula)).map((p) => [normCedula(p.cedula), p]));
  const vistas = new Set<string>();
  const out: FilaHistoricoExcel[] = [];
  rows.forEach((row, i) => {
    const cedRaw = col(row, 'cedula', 'ci', 'c.i.', 'cedula de identidad');
    const fechaRaw = col(row, 'fecha', 'desde', 'ano', 'año', 'anio');
    const sueldoRaw = col(row, 'sueldo', 'monto', 'salario', 'sueldo usd', 'sueldo mensual');
    // Fila totalmente vacía: se ignora.
    if ([cedRaw, fechaRaw, sueldoRaw].every((v) => v == null || String(v).trim() === '')) return;
    const cedula = normCedula(cedRaw);
    const persona = porCedula.get(cedula) ?? null;
    const fecha = parseFechaExcel(fechaRaw);
    const sueldo = parseMontoExcel(sueldoRaw);
    const motivo = String(col(row, 'motivo') ?? '').trim() || MOTIVO_HISTORICO;
    const nota = String(col(row, 'nota', 'observacion', 'observaciones') ?? '').trim();
    let error: string | null = null;
    if (!cedula) error = 'Falta la cédula.';
    else if (!persona) error = `No hay nadie en el personal con la cédula ${cedula}.`;
    else if (!fecha) error = 'La fecha no se entiende (usa dd/mm/aaaa o el año).';
    else if (fecha > hoy) error = 'La fecha es futura.';
    else if (sueldo == null) error = 'Falta el sueldo o no es un número.';
    else if (sueldo < 0) error = 'El sueldo no puede ser negativo.';
    else {
      const k = `${persona.id}|${fecha}`;
      if (vistas.has(k)) error = 'Fecha repetida para la misma persona en el archivo.';
      vistas.add(k);
    }
    out.push({ fila: i + 2, cedula, persona, fecha, sueldo, motivo, nota, error });
  });
  return out;
}
