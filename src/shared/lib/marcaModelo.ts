/* ============================================================
   Golden Touch · Marca y modelo de un renglón de compra

   La marca y el modelo se escriben en la SOLICITUD y tienen que
   llegar enteros hasta el inventario: el que pide sabe qué marca
   necesita, y esa es la que hay que cotizar y la que después se
   recibe. Antes se escribían recién en la oferta y al recibir se
   perdían: al producto solo se le tocaba stock y precio.

   Aquí vive el formato único de ese rótulo. Estaba repetido —con
   pequeñas diferencias— en la lista de la OC, en las recepciones
   pendientes y en el reparto entre proveedores.
   ============================================================ */

/** Un renglón del que se puede leer marca y modelo (ítem de orden, de oferta…). */
export interface ConMarcaModelo {
  marca?: string | null;
  modelo?: string | null;
}

const limpio = (v?: string | null) => (typeof v === 'string' ? v.trim() : '');

/** Para comparar sin que el acento o la mayúscula decidan si algo «ya está». */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/**
 * «Marca: DONALDSON · Modelo: P553771», o el trozo que haya.
 * Cadena vacía si el renglón no dice ninguno de los dos.
 */
export function rotuloMarcaModelo(it: ConMarcaModelo): string {
  const marca = limpio(it.marca);
  const modelo = limpio(it.modelo);
  return [marca && `Marca: ${marca}`, modelo && `Modelo: ${modelo}`].filter(Boolean).join(' · ');
}

/** ¿El renglón dice marca o modelo? */
export function tieneMarcaModelo(it: ConMarcaModelo): boolean {
  return !!rotuloMarcaModelo(it);
}

/**
 * Devuelve la descripción del producto con la marca y el modelo AGREGADOS al
 * final, o `null` si no hay nada que agregar (el renglón no trae marca/modelo,
 * o la descripción ya la nombra).
 *
 * Nunca pisa lo que la descripción ya decía: el texto viejo se conserva tal
 * cual y el rótulo se suma en una línea nueva. Un producto que se compra a
 * varias marcas termina con las dos, que es la verdad de lo que entró.
 */
export function descripcionConMarcaModelo(
  descripcionActual: string | null | undefined,
  it: ConMarcaModelo,
): string | null {
  const rotulo = rotuloMarcaModelo(it);
  if (!rotulo) return null;
  const actual = limpio(descripcionActual);
  if (!actual) return rotulo;
  // Ya la nombra (la cargó alguien a mano, o entró en una recepción anterior).
  if (norm(actual).includes(norm(rotulo))) return null;
  return `${actual}\n${rotulo}`;
}

/* ───────── Marca RECIBIDA (06/10/2026) ─────────
   Se pide una marca y a veces llega otra similar. Al recepcionar, cada
   renglón trae «Marca / Modelo recibido» llenos con lo pedido; si llegó
   otra, se corrige ahí. Lo que entra al inventario es lo RECIBIDO, y la
   orden queda marcada con el cambio para que Compras lo vea. */

/** Lo que llegó: lo escrito al recepcionar, o lo pedido si no se tocó. En mayúsculas. */
export function marcaRecibida(pedido: ConMarcaModelo, escrito?: ConMarcaModelo | null): ConMarcaModelo {
  const tomar = (v: string | null | undefined, porDefecto: string | null | undefined) =>
    (v === undefined ? limpio(porDefecto) : limpio(v)).toUpperCase() || null;
  return { marca: tomar(escrito?.marca, pedido.marca), modelo: tomar(escrito?.modelo, pedido.modelo) };
}

/**
 * «Marca pedida DONALDSON → recibida FLEETGUARD», o null si llegó lo mismo.
 * Acentos y mayúsculas no cuentan como cambio.
 */
export function cambioDeMarca(pedido: ConMarcaModelo, recibido: ConMarcaModelo): string | null {
  const partes: string[] = [];
  const comparar = (que: string, a?: string | null, b?: string | null) => {
    const pa = limpio(a); const pb = limpio(b);
    // Si no se pidió ninguna, anotar la que llegó no es «otra marca»: solo se completa el dato.
    if (pa && norm(pa) !== norm(pb)) partes.push(`${que} pedida ${pa} → recibida ${pb || '(sin indicar)'}`);
  };
  comparar('Marca', pedido.marca, recibido.marca);
  comparar('Modelo', pedido.modelo, recibido.modelo);
  return partes.length ? partes.join(' · ') : null;
}
