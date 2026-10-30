/* ============================================================
   Golden Touch · Combustible · Opciones del buscador de equipos

   El catálogo de Combustible tiene ~164 nombres largos mezclados («PAYLOADER
   VOLVO L220G 2014») y el que surte no los conoce así: los llama L220G, EC240,
   A35F. Aquí se arma la lista del buscador (teléfono y PC) cruzando cada
   valor del catálogo con su ficha de Maquinaria (por `combustible_equipo`),
   agrupada por apartado (Maquinaria y Equipos / Vehículos / Motos / Lanchas /
   Herramientas) y ordenada por alias. Lo que se GUARDA en el movimiento sigue
   siendo el nombre del catálogo (`value`): solo cambia cómo se ve y se busca.
   Regla pura, sin Supabase: la carga de datos la hace quien la llama.

   Soporta filtrado por:
     1. "¿Puede surtir?" (activo === true vs false)
     2. Tanque específico o todos los tanques (tanqueActual + tanques_permitidos)
   ============================================================ */
import type { SearchOption } from '@/shared/ui/SearchSelect';
import { norm } from '@/shared/lib/texto';
import { aliasesDeEquipo, claseEquipo, listarApartados, nombreCortoEquipo, type ApartadoEquipo } from '@/modules/maquinaria/flota';

/** Lo que hace falta de la ficha de Maquinaria para armar la opción (subconjunto de MaquinariaEquipo). */
export interface FichaEquipoOpcion {
  equipo: string;
  combustible_equipo?: string | null;
  alias?: string | null;
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  serial?: string | null;
  tipo?: string | null;
  clase?: string | null;
  grupo_mantenimiento?: string | null;
  notas?: string | null;
}

export interface EntradaCatalogoEquipo {
  id?: string;
  valor: string;
  activo?: boolean;
  tanques_permitidos?: string[] | null;
}

export type CatalogoEquipoInput = string | EntradaCatalogoEquipo;

export interface TanqueRefOpcion {
  id: string;
  nombre: string;
}

export const GRUPO_OTROS = 'Otros equipos de Combustible';
export const GRUPO_BIDONES = 'Bidones';
const ICONO_OTROS = '⛽';
const ICONO_BIDON = '🪣';

/** Sin repetidos (sin acentos ni mayúsculas) ni vacíos, en el orden en que vienen. */
function unicos(valores: (string | null | undefined)[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of valores) {
    const t = (v ?? '').trim();
    const k = norm(t);
    if (!t || vistos.has(k)) continue;
    vistos.add(k); out.push(t);
  }
  return out;
}

/**
 * Comprueba si un equipo con cierta lista de tanques permitidos puede surtir desde el tanque dado.
 * Si el tanque no está especificado o el equipo no tiene restricciones (o incluye '*'), está permitido en todos.
 */
export function esTanquePermitidoParaEquipo(
  tanque: string | TanqueRefOpcion | null | undefined,
  tanquesPermitidos: string[] | null | undefined,
): boolean {
  if (!tanque) return true;
  if (!tanquesPermitidos || tanquesPermitidos.length === 0 || tanquesPermitidos.includes('*')) {
    return true;
  }
  const tId = typeof tanque === 'string' ? tanque : tanque.id;
  const tNombre = typeof tanque === 'string' ? tanque : tanque.nombre;
  const tNombreNorm = norm(tNombre);
  return tanquesPermitidos.some((p) => {
    const pTrim = (p ?? '').trim();
    if (!pTrim || pTrim === '*') return true;
    if (pTrim === tId) return true;
    if (norm(pTrim) === tNombreNorm) return true;
    return false;
  });
}

/**
 * Arma las opciones del buscador de equipos.
 *  - `catalogo`: valores del catálogo de Combustible (strings o filas de catálogo con activo y tanques_permitidos).
 *  - `fichas`: equipos de Maquinaria (activos). Se cruzan por `combustible_equipo` (o por el
 *    nombre del equipo) sin acentos ni mayúsculas.
 *  - `bidones`: nombres de los tanques bidón (salida directa); van al final, en su grupo.
 *  - `modo`: en el teléfono el `label` es el nombre corto (alias / modelo / placa) y el hint
 *    el nombre oficial; en la PC el `label` es el nombre oficial y el hint los alias.
 *  - `tanqueActual`: si se indica, solo incluye equipos autorizados para este tanque (o para todos).
 *  - `permisosTanques`: mapa auxiliar opcional de permisos por id o nombre de equipo.
 *  - `incluirValor`: si un movimiento existente ya tenía un equipo seleccionado, siempre se incluye.
 * Orden: grupos según `apartados` (listarApartados), luego Otros y Bidones; dentro de cada
 * grupo por `label`.
 */
export function opcionesEquipos(args: {
  catalogo: CatalogoEquipoInput[];
  fichas: FichaEquipoOpcion[];
  bidones?: string[];
  modo: 'telefono' | 'pc';
  apartados?: ApartadoEquipo[];
  tanqueActual?: string | TanqueRefOpcion | null;
  permisosTanques?: Record<string, string[] | null>;
  incluirValor?: string | null;
}): SearchOption[] {
  const apartados = args.apartados ?? listarApartados();
  const porNombre = new Map<string, FichaEquipoOpcion>();
  // Primero el vínculo explícito; el nombre del equipo solo si nadie lo reclamó.
  for (const f of args.fichas) {
    const k = norm(f.combustible_equipo);
    if (k && !porNombre.has(k)) porNombre.set(k, f);
  }
  for (const f of args.fichas) {
    const k = norm(f.equipo);
    if (k && !porNombre.has(k)) porNombre.set(k, f);
  }

  const bidonesNorm = new Set((args.bidones ?? []).map((b) => norm(b)));
  const opciones: (SearchOption & { _orden: number })[] = [];
  const ordenGrupo = (label: string) => {
    const i = apartados.findIndex((a) => a.label === label);
    return i >= 0 ? i : label === GRUPO_OTROS ? apartados.length : apartados.length + 1;
  };

  const vistosValores = new Set<string>();

  for (const item of args.catalogo) {
    const valor = typeof item === 'string' ? item.trim() : (item.valor ?? '').trim();
    if (!valor) continue;
    const kValor = norm(valor);
    if (vistosValores.has(kValor)) continue;

    const esSeleccionActual = !!args.incluirValor && norm(args.incluirValor) === kValor;

    // 1. Filtro de activo ("puede surtir")
    if (!esSeleccionActual && typeof item === 'object' && item.activo === false) {
      continue;
    }

    // 2. Filtro de tanque permitido
    if (!esSeleccionActual && args.tanqueActual) {
      let permitidos: string[] | null | undefined = null;
      if (typeof item === 'object') {
        permitidos = item.tanques_permitidos;
        if (!permitidos && item.id && args.permisosTanques) {
          permitidos = args.permisosTanques[item.id];
        }
      }
      if (!permitidos && args.permisosTanques) {
        permitidos = args.permisosTanques[kValor];
      }
      if (!esTanquePermitidoParaEquipo(args.tanqueActual, permitidos)) {
        continue;
      }
    }

    vistosValores.add(kValor);

    // Un bidón que además está en el catálogo se pinta como bidón (abajo), no dos veces.
    if (bidonesNorm.has(kValor)) continue;
    const ficha = porNombre.get(kValor);
    if (!ficha) {
      opciones.push({ value: valor, label: valor, group: GRUPO_OTROS, groupIcon: ICONO_OTROS, _orden: ordenGrupo(GRUPO_OTROS) });
      continue;
    }
    const clase = claseEquipo(ficha);
    const apartado = apartados.find((a) => a.id === clase) ?? apartados[0];
    const aliases = aliasesDeEquipo(ficha);
    const corto = nombreCortoEquipo(ficha);
    const keywords = unicos([...aliases, ficha.marca, ficha.modelo, ficha.placa, ficha.serial, ficha.tipo, ficha.equipo, valor]);
    const esTelefono = args.modo === 'telefono';
    const label = esTelefono ? corto : valor;
    // Si el corto es el mismo nombre oficial, el hint no repite nada.
    const hint = esTelefono
      ? (norm(corto) === norm(valor) ? undefined : valor)
      : (aliases.length ? aliases.join(', ') : undefined);
    opciones.push({
      value: valor, label, hint, keywords,
      group: apartado?.label ?? GRUPO_OTROS, groupIcon: apartado?.icon ?? ICONO_OTROS,
      _orden: apartado ? ordenGrupo(apartado.label) : ordenGrupo(GRUPO_OTROS),
    });
  }

  for (const nombre of unicos(args.bidones ?? [])) {
    opciones.push({
      value: nombre, label: `${ICONO_BIDON} ${nombre}`, hint: 'bidón · salida directa',
      keywords: ['bidon', nombre], group: GRUPO_BIDONES, groupIcon: ICONO_BIDON, _orden: ordenGrupo(GRUPO_BIDONES),
    });
  }

  opciones.sort((a, b) => a._orden - b._orden || a.label.localeCompare(b.label, 'es', { numeric: true }));
  return opciones.map(({ _orden: _o, ...o }) => o);
}
