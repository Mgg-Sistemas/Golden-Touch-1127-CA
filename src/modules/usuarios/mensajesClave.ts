/* ============================================================
   Golden Touch · Mensajes de clave en español

   Supabase Auth rechaza las claves que aparecen en filtraciones públicas
   («Password is known to be weak and easy to guess…») y las que no cumplen
   el largo mínimo. Llegan en inglés; aquí se traducen para mostrarlas.
   ============================================================ */

export function mensajeClaveEnEspanol(mensaje: string): string {
  const m = mensaje ?? '';
  if (/weak|easy to guess|pwned|leaked|compromised/i.test(m)) {
    return 'Esa clave es demasiado conocida (aparece en listas de claves filtradas) y no se acepta. Elige otra que no sea una secuencia ni una palabra común, por ejemplo mezclando letras, números y un símbolo.';
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

const COMUNES = ['password', 'contrasena', 'clave', 'admin', 'golden', 'goldentouch', 'qwerty', 'asdf', 'zxcv', 'abc', 'iloveyou', 'teamo', 'venezuela', 'mina'];

/**
 * Aviso EN VIVO, antes de mandar la clave (06/10/2026): Auth rechaza las claves
 * filtradas recién al tocar «Aceptar», y eso resultaba molesto — se escribía la
 * clave dos veces para enterarse al final. Esto no consulta ninguna lista: solo
 * detecta los patrones que casi siempre están filtrados (todo números, cortas,
 * secuencias, un mismo carácter repetido, palabras comunes). Devuelve null si
 * no ve nada raro; la palabra final la sigue teniendo Auth.
 */
export function pistaClaveDebil(clave: string): string | null {
  const c = (clave ?? '').trim();
  if (!c) return null;
  const min = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^(.)\1+$/.test(min)) return 'Es un mismo carácter repetido: casi seguro está en las listas de claves filtradas.';
  if (/^\d+$/.test(min)) return 'Solo números: esas claves casi siempre están filtradas. Agrega letras y un símbolo.';
  const secuencia = '0123456789abcdefghijklmnopqrstuvwxyz';
  const alReves = [...secuencia].reverse().join('');
  if (min.length >= 4 && (secuencia.includes(min) || alReves.includes(min))) return 'Es una secuencia (como 123456 o abcdef): está filtrada. Elige otra.';
  if (COMUNES.some((p) => min.replace(/[^a-z]/g, '') === p)) return 'Es una palabra muy común con algún número: suele estar filtrada. Mézclala con otra palabra y un símbolo.';
  if (c.length < 8) return 'Es corta: con 8 caracteres o más, mezclando letras, números y un símbolo, casi nunca la rechaza.';
  return null;
}
