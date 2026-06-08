/* ============================================================
   Golden Touch · UX global de inputs de dinero/numéricos
   Al enfocar (click o tab) un input numérico cuyo valor es 0
   (0, 0.00, 0,00), selecciona su contenido para que el primer
   carácter que escriba el usuario REEMPLACE el 0 — así no hay
   que borrarlo manualmente. No molesta cuando el campo ya tiene
   un monto real (no se selecciona). Permite decimales.
   Se instala una sola vez a nivel de documento (cubre modales).
   ============================================================ */

function esInputNumerico(el: HTMLInputElement): boolean {
  return el.type === 'number' || el.inputMode === 'decimal' || el.inputMode === 'numeric';
}

/** ¿El valor mostrado equivale a cero? ("0", "0.00", "0,00", "0,0"…). */
function valeCero(valor: string): boolean {
  const v = valor.trim();
  if (v === '') return false;
  const n = Number(v.replace(',', '.'));
  return !isNaN(n) && n === 0;
}

export function instalarSelectOnFocusMonto(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.readOnly || el.disabled) return;
    if (!esInputNumerico(el)) return;
    if (!valeCero(el.value)) return;
    // Tras el focus, seleccionamos el contenido para que se reemplace al escribir.
    requestAnimationFrame(() => {
      try { el.select(); } catch { /* algunos navegadores no permiten select en number */ }
    });
  });
}
