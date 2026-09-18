/* ============================================================
   Golden Touch · Mensajes de clave en español

   Supabase Auth rechaza las claves que aparecen en filtraciones públicas
   («Password is known to be weak and easy to guess…») y las que no cumplen
   el largo mínimo. Llegan en inglés; acá se traducen para mostrarlas.
   ============================================================ */

export function mensajeClaveEnEspanol(mensaje: string): string {
  const m = mensaje ?? '';
  if (/weak|easy to guess|pwned|leaked|compromised/i.test(m)) {
    return 'Esa clave es demasiado conocida (aparece en listas de claves filtradas) y no se acepta. Elegí otra que no sea una secuencia ni una palabra común, por ejemplo mezclando letras, números y un símbolo.';
  }
  if (/should be at least|at least \d+ characters/i.test(m)) {
    const n = m.match(/(\d+)/)?.[1];
    return `La clave es muy corta${n ? `: debe tener al menos ${n} caracteres` : ''}.`;
  }
  if (/should be different from the old password|same password/i.test(m)) {
    return 'La clave nueva tiene que ser distinta de la anterior.';
  }
  return m;
}
