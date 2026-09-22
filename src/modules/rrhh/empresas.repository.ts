/* ============================================================
   Golden Touch · RRHH · Empresas (nóminas GT y MTO)

   Acá vive lo poco que hay que preguntarle a la base SOBRE las nóminas en sí,
   no sobre una persona: hoy, cuánta gente activa tiene cada una. Ese número
   va entre paréntesis en el switch del encabezado («Nómina GT (12)»), así se
   ve de un vistazo dónde está la plantilla sin entrar a la pestaña.

   Está separado de personal.repository.ts a propósito: aquello devuelve
   fichas; esto devuelve un número del servidor y nada más.
   ============================================================ */
import { supabase } from '@/shared/lib/supabase';
import type { EmpresaRrhh } from '@/shared/lib/types';

const TABLE = 'personal';

/** Las dos nóminas, en el orden en que se muestran. */
const EMPRESAS_VALORES: EmpresaRrhh[] = ['GT', 'MTO'];

export type ConteoPorEmpresa = Record<EmpresaRrhh, number>;

/**
 * Cuánta gente ACTIVA tiene cada nómina.
 *
 * Se cuenta en el servidor (`head: true` + `count: 'exact'`): la respuesta es
 * el número pelado, sin traer una sola fila. Importa porque esto se recarga
 * con cada evento de tiempo real de `personal`, y bajar la plantilla entera
 * dos veces por un par de números sería tirar ancho de banda a la basura.
 *
 * Los inactivos no se cuentan: el encabezado dice cuánta gente está
 * trabajando, no cuántas fichas hay guardadas.
 */
export async function contarPersonalPorEmpresa(): Promise<ConteoPorEmpresa> {
  const head = { count: 'exact' as const, head: true };
  const resultados = await Promise.all(
    EMPRESAS_VALORES.map((empresa) =>
      supabase.from(TABLE).select('id', head).eq('activo', true).eq('empresa', empresa),
    ),
  );
  // Si una de las dos consultas falla, se corta acá: quien llama decide qué
  // hacer (el encabezado, por ejemplo, muestra el switch sin números).
  const errores = resultados.find((r) => r.error);
  if (errores?.error) throw errores.error;

  const conteo = { GT: 0, MTO: 0 } as ConteoPorEmpresa;
  EMPRESAS_VALORES.forEach((empresa, i) => { conteo[empresa] = resultados[i].count ?? 0; });
  return conteo;
}
