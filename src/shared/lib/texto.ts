/* ============================================================
   Golden Touch · Comparar texto sin que el acento importe

   EL PROBLEMA
   La gente escribe sin acentos —sobre todo desde el teléfono— y el sistema le
   respondía que no existía: buscar «camion» no encontraba «CAMIÓN», «MARIA» no
   encontraba «MARÍA», «PERFORACION» no encontraba «PERFORACIÓN».

   LA REGLA
   Para BUSCAR y COMPARAR, «camión» y «camion» son la misma palabra.
   Para GUARDAR y MOSTRAR, no: el dato conserva su acento. Estas funciones se
   usan solo del lado de la comparación; nunca para escribir en la base.

   POR QUÉ ACÁ
   Este helper estaba copiado y pegado en 18 archivos, cada copia con una
   variante distinta (una recortaba espacios, otra no; una bajaba a minúscula
   antes de quitar acentos, otra después). Resultado: el mismo buscador se
   comportaba distinto según la pantalla. Ahora hay una sola definición.

   El equivalente en la base es `public.sin_acentos(text)`, que usa la extensión
   `unaccent` (ver supabase/2026-09-04-busqueda-sin-acentos.sql). Los dos lados
   tienen que dar el mismo resultado para el mismo texto.
   ============================================================ */

/**
 * Deja el texto listo para comparar: sin espacios de sobra, en minúscula y sin
 * acentos ni diacríticos. La «ñ» se convierte en «n», igual que en la base.
 *
 *   norm('  CAMIÓN Ñandú ') === 'camion nandu'
 *
 * Acepta null/undefined y devuelve '' — así se puede llamar directo sobre
 * campos opcionales sin repetir `?? ''` en cada uso.
 */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')            // separa la letra de su acento
    .replace(/\p{Diacritic}/gu, '') // y descarta el acento
    .toLowerCase()
    .trim();
}

/**
 * ¿El campo contiene lo buscado, sin importar acentos ni mayúsculas?
 * Pensada para los filtros de las listas:
 *
 *   items.filter((i) => contiene(i.nombre, q))
 *
 * Con `q` vacío devuelve true: un buscador en blanco no filtra nada.
 */
export function contiene(campo: string | null | undefined, buscado: string): boolean {
  const q = norm(buscado);
  if (!q) return true;
  return norm(campo).includes(q);
}

/**
 * ¿Son la misma palabra ignorando acentos y mayúsculas?
 * Para detectar duplicados: «MARÍA» y «MARIA» no deberían convivir como dos
 * unidades solicitantes distintas.
 */
export function igual(a: string | null | undefined, b: string | null | undefined): boolean {
  return norm(a) === norm(b);
}
