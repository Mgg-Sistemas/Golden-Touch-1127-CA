/* ============================================================
   Golden Touch · Tablas legibles en teléfono (sin tocar cada tabla)

   EL PROBLEMA
   El sistema tiene ~170 tablas. En un teléfono todas quedaban con scroll
   horizontal (`.table-wrap > table { min-width: 640px }`): para leer una fila
   había que arrastrar de lado y, al hacerlo, se perdía de vista el encabezado,
   así que no se sabía a qué columna correspondía cada número. En un ERP donde
   las columnas son «Kg», «Costo», «Total» eso no es un detalle estético.

   LA SOLUCIÓN
   En pantallas de teléfono cada FILA se muestra como una FICHA y cada celda
   como un par «Etiqueta: valor». La etiqueta sale del `<th>` de esa columna.

   El CSS solo no puede leer el texto del `<th>` para ponerlo delante del `<td>`,
   así que este instalador copia ese texto al atributo `data-col` de cada celda y
   el CSS lo pinta con `::before`. Se hace UNA vez, de forma central: no hay que
   editar las ~170 tablas ni mantener etiquetas duplicadas — si mañana cambia el
   nombre de una columna, la ficha lo refleja solo.

   POR QUÉ UN MutationObserver
   La app es una SPA: las tablas se montan, se filtran y se re-renderizan todo el
   tiempo (realtime incluido). Un barrido único al arrancar solo alcanzaría a las
   tablas que existan en ese instante. El observer mantiene las etiquetas al día
   y está acotado a `<table>` para que no cueste nada.

   TABLAS SIN ENCABEZADO
   Algunas tablas no son una grilla de datos sino una lista «valor · concepto»
   —el resumen de conciliación en Recepciones, por ejemplo— y no tienen `<thead>`.
   No hay etiqueta de columna que poner, pero apilarlas igual es lo correcto: si
   se dejan como tabla dentro de una tarjeta con `overflow:hidden` quedan
   RECORTADAS y sin forma de deslizarlas. Se marcan con `data-ficha-libre`, que
   el CSS apila sin etiquetas.

   OPT-OUT
   Una tabla marcada A MANO con `data-sin-ficha` se deja como está (sigue con
   scroll horizontal). Útil donde apilar sería peor que deslizar — por ejemplo
   una matriz de comparación donde importa ver las columnas enfrentadas. Este
   instalador nunca la pone: es una decisión de quien escribe la pantalla.
   ============================================================ */

/** Ancho a partir del cual dejamos de convertir en fichas (coincide con el CSS). */
const ANCHO_TELEFONO = 600;

/**
 * Copia el encabezado de cada columna al atributo `data-col` de sus celdas.
 * Es idempotente: si la etiqueta ya es la correcta no toca el DOM (así no se
 * dispara el propio observer en bucle).
 */
/**
 * Tabla que se apila sin rótulos (no tiene encabezados de los que sacarlos).
 * Se limpian los `data-col` por si la tabla tuvo encabezados antes y los perdió.
 */
function marcarLibre(tabla: HTMLTableElement): void {
  if (!tabla.hasAttribute('data-ficha-libre')) tabla.setAttribute('data-ficha-libre', '');
  for (const celda of Array.from(tabla.querySelectorAll<HTMLTableCellElement>('td[data-col]'))) {
    celda.removeAttribute('data-col');
  }
}

function etiquetarTabla(tabla: HTMLTableElement): void {
  // `data-sin-ficha` la pone la pantalla a mano: es un opt-out, no se toca.
  if (tabla.hasAttribute('data-sin-ficha')) return;
  // Si antes no tenía encabezados y ahora sí, deja de ser «libre».
  if (tabla.tHead?.rows[0] && tabla.hasAttribute('data-ficha-libre')) tabla.removeAttribute('data-ficha-libre');

  // Encabezados: la primera fila de <thead>. Sin encabezados no hay etiquetas
  // que poner, pero la ficha se arma igual: apilada y sin rótulos es legible, y
  // dejarla como tabla la deja recortada dentro de una tarjeta.
  const filaHead = tabla.tHead?.rows[0];
  if (!filaHead) { marcarLibre(tabla); return; }

  const titulos: string[] = [];
  for (const th of Array.from(filaHead.cells)) {
    // `colSpan` ocupa varias columnas: se repite el título para que los índices
    // de las celdas del cuerpo sigan alineados con los del encabezado.
    const texto = (th.textContent ?? '').trim();
    for (let i = 0; i < (th.colSpan || 1); i++) titulos.push(texto);
  }
  if (!titulos.some(Boolean)) { marcarLibre(tabla); return; }

  for (const cuerpo of Array.from(tabla.tBodies)) {
    for (const fila of Array.from(cuerpo.rows)) {
      // Una fila con una sola celda que abarca toda la tabla es un mensaje de
      // «no hay datos» o un subtotal: no se le pone etiqueta de columna.
      const celdas = Array.from(fila.cells);
      if (celdas.length === 1 && (celdas[0].colSpan || 1) > 1) {
        if (celdas[0].getAttribute('data-col') !== null) celdas[0].removeAttribute('data-col');
        fila.setAttribute('data-fila-ancha', '');
        continue;
      }
      if (fila.hasAttribute('data-fila-ancha')) fila.removeAttribute('data-fila-ancha');

      let col = 0;
      for (const celda of celdas) {
        const titulo = titulos[col] ?? '';
        if (celda.getAttribute('data-col') !== titulo) celda.setAttribute('data-col', titulo);
        col += celda.colSpan || 1;
      }
    }
  }
}

function etiquetarTodo(raiz: ParentNode): void {
  for (const t of Array.from(raiz.querySelectorAll<HTMLTableElement>('table'))) etiquetarTabla(t);
}

let instalado = false;

/**
 * Activa las fichas en teléfono. Idempotente.
 *
 * Solo trabaja por debajo de `ANCHO_TELEFONO`: en una laptop no se agenda ningún
 * observer ni se toca el DOM. Si la ventana se achica (o se gira el teléfono),
 * se activa; si se agranda, se apaga.
 */
export function instalarTablasResponsive(): void {
  if (instalado || typeof document === 'undefined') return;
  instalado = true;

  let observer: MutationObserver | null = null;
  // Las mutaciones llegan de a ráfagas (un re-render toca muchas filas). Se juntan
  // en un solo pase con rAF para no re-etiquetar una tabla decenas de veces.
  let pendiente = false;

  function reetiquetar(): void {
    pendiente = false;
    etiquetarTodo(document);
  }

  function agendar(): void {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(reetiquetar);
  }

  function activar(): void {
    if (observer) return;
    etiquetarTodo(document);
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        // Ignoramos nuestros propios cambios de atributo: solo reaccionamos a
        // filas/celdas que aparecen o desaparecen.
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) { agendar(); return; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function desactivar(): void {
    observer?.disconnect();
    observer = null;
  }

  const mq = window.matchMedia(`(max-width: ${ANCHO_TELEFONO}px)`);
  const sincronizar = () => { if (mq.matches) activar(); else desactivar(); };
  mq.addEventListener('change', sincronizar);
  sincronizar();
}
