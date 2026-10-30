/* ============================================================
   Golden Touch · Inventario · Depósitos

   Depósitos independientes:
   - Inventario General: todo lo de siempre (compras, salidas, cocina…).
   - Depósito Mina: submódulo de Inventario con su propio catálogo y stock.
   - Depósito Reutilizables: depósito especializado dentro de Mina para materiales reutilizables.
   Un producto es de uno solo (productos.almacen) y la base no deja pasarlo
   al otro (trg_productos_deposito_fijo). Sus movimientos y existencias van al
   almacén del producto (registrar_movimiento_stock).
   ============================================================ */

export type Deposito = 'general' | 'mina' | 'reutilizables' | 'danados' | string;

export const ALMACEN_GENERAL = 'General';
export const ALMACEN_MINA = 'Depósito Mina';
export const ALMACEN_REUTILIZABLES = 'Depósito Reutilizables';
export const ALMACEN_DANADOS = 'Depósito Items Dañados';

export interface InfoDeposito {
  almacen: string;
  nombre: string;
  ruta: string;
  rutaTelefono: string;
  hash: string;
  icono: string;
  esFijo?: boolean;
}

export function normalizarSlug(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function iconoDeposito(almacenOrSlug: string): string {
  const s = normalizarSlug(almacenOrSlug);
  if (s.includes('reutilizable')) return '♻️';
  if (s.includes('danado') || s.includes('averia')) return '⚠️';
  if (s.includes('mina')) return '⛏';
  if (s.includes('herramienta') || s.includes('taller')) return '🛠️';
  if (s.includes('general') || s.includes('los-pinos')) return '📦';
  return '📦';
}

export const DEPOSITOS_FIJOS: Record<string, InfoDeposito> = {
  general: {
    almacen: ALMACEN_GENERAL,
    nombre: 'Inventario General',
    ruta: '/app/inventario',
    rutaTelefono: '/app/inventario/telefono',
    hash: '#/app/inventario',
    icono: '📦',
    esFijo: true,
  },
  mina: {
    almacen: ALMACEN_MINA,
    nombre: 'Depósito Mina',
    ruta: '/app/inventario/deposito-mina',
    rutaTelefono: '/app/inventario/deposito-mina/telefono',
    hash: '#/app/inventario/deposito-mina',
    icono: '⛏',
    esFijo: true,
  },
  reutilizables: {
    almacen: ALMACEN_REUTILIZABLES,
    nombre: 'Depósito Reutilizables',
    ruta: '/app/inventario/deposito-reutilizables',
    rutaTelefono: '/app/inventario/deposito-reutilizables/telefono',
    hash: '#/app/inventario/deposito-reutilizables',
    icono: '♻️',
    esFijo: true,
  },
  danados: {
    almacen: ALMACEN_DANADOS,
    nombre: 'Depósito Items Dañados',
    ruta: '/app/inventario/deposito-danados',
    rutaTelefono: '/app/inventario/deposito-danados/telefono',
    hash: '#/app/inventario/deposito-danados',
    icono: '⚠️',
    esFijo: true,
  },
};

export const DEPOSITOS: Record<string, InfoDeposito> = DEPOSITOS_FIJOS;

/** Resuelve la información de un depósito a partir de su clave, slug o nombre de almacén. */
export function resolverDeposito(keyOrSlugOrName?: string | null): InfoDeposito {
  if (!keyOrSlugOrName || keyOrSlugOrName === 'general') return DEPOSITOS_FIJOS.general;
  const slug = normalizarSlug(keyOrSlugOrName);
  if (slug === 'mina' || slug === 'deposito-mina') return DEPOSITOS_FIJOS.mina;
  if (slug === 'reutilizables' || slug === 'deposito-reutilizables') return DEPOSITOS_FIJOS.reutilizables;
  if (slug === 'danados' || slug === 'deposito-danados' || slug === 'items-danados' || slug === 'deposito-items-danados') {
    return DEPOSITOS_FIJOS.danados;
  }
  if (DEPOSITOS_FIJOS[keyOrSlugOrName]) return DEPOSITOS_FIJOS[keyOrSlugOrName];

  // Si nos pasaron el nombre exacto de un depósito fijo
  for (const f of Object.values(DEPOSITOS_FIJOS)) {
    if (f.almacen.toLowerCase() === keyOrSlugOrName.toLowerCase()) return f;
  }

  // Depósito dinámico creado por el usuario
  const nombreLimpio = keyOrSlugOrName.trim();
  return {
    almacen: nombreLimpio,
    nombre: nombreLimpio,
    ruta: `/app/inventario/deposito/${slug}`,
    rutaTelefono: `/app/inventario/deposito/${slug}/telefono`,
    hash: `#/app/inventario/deposito/${slug}`,
    icono: iconoDeposito(slug),
    esFijo: false,
  };
}

/** Depósito al que pertenece un producto (todo lo que no es de otro depósito es del General). */
export function depositoDe(p: { almacen?: string | null }): string {
  const alm = (p.almacen ?? '').trim();
  if (!alm || alm === ALMACEN_GENERAL) return 'general';
  if (alm === ALMACEN_MINA) return 'mina';
  if (alm === ALMACEN_REUTILIZABLES) return 'reutilizables';
  if (alm === ALMACEN_DANADOS) return 'danados';
  return normalizarSlug(alm);
}

export function esDelDeposito(p: { almacen?: string | null }, d: string): boolean {
  const alm = (p.almacen ?? '').trim();
  const dep = resolverDeposito(d);
  if (dep.almacen === ALMACEN_GENERAL) {
    return !alm || alm === ALMACEN_GENERAL;
  }
  return (
    alm.toLowerCase() === dep.almacen.toLowerCase() ||
    normalizarSlug(alm) === normalizarSlug(dep.almacen) ||
    normalizarSlug(alm) === normalizarSlug(d)
  );
}


