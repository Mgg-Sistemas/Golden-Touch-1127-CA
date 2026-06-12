/* ============================================================
   Golden Touch · Mayúscula automática global en campos de texto
   Un único listener en fase de CAPTURA transforma el valor a MAYÚSCULA
   antes de que React lea el evento, así el estado y lo que se guarda quedan
   en mayúscula sin tocar cada input.

   EXCLUSIONES (no se fuerzan a mayúscula):
   · correo, contraseña, números, fechas, búsquedas/filtros
   · comboboxes de selección (SearchSelect) y campos marcados data-no-upper
   ============================================================ */

const TIPOS_EXCLUIDOS = new Set([
  'email', 'password', 'number', 'search', 'tel', 'url', 'color', 'file',
  'range', 'checkbox', 'radio', 'hidden',
  'date', 'time', 'datetime-local', 'month', 'week',
]);

function debeMayuscular(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  // Opt-out explícito (en el campo o en un contenedor).
  if (el.dataset.noUpper !== undefined) return false;
  if (el.closest('[data-no-upper]')) return false;
  // Comboboxes de autocompletado: no tocar el texto de búsqueda.
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete')) return false;

  if (el instanceof HTMLInputElement) {
    if (TIPOS_EXCLUIDOS.has((el.type || 'text').toLowerCase())) return false;
    const im = (el.inputMode || '').toLowerCase();
    if (im === 'numeric' || im === 'decimal' || im === 'tel') return false;
    const ac = (el.autocomplete || '').toLowerCase();
    if (/email|username|password|cc-|tel/.test(ac)) return false;
  }
  // Heurística por nombre/id/placeholder/clase: correo, contraseña, búsqueda/filtro.
  const meta = `${el.name} ${el.id} ${el.placeholder} ${el.className}`.toLowerCase();
  if (/mail|correo|contrase|password|\bpass\b|buscar|búsqueda|busqueda|filtr|search|🔍/.test(meta)) return false;
  return true;
}

let instalado = false;

/** Activa la mayúscula automática global. Idempotente. */
export function instalarMayusculaAutomatica(): void {
  if (instalado || typeof document === 'undefined') return;
  instalado = true;
  document.addEventListener(
    'input',
    (e) => {
      if ((e as InputEvent).isComposing) return; // no interferir con acentos/IME
      const el = e.target;
      if (!debeMayuscular(el)) return;
      const up = el.value.toUpperCase();
      if (up === el.value) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = up;
      // La longitud no cambia al pasar a mayúscula → el cursor se conserva.
      try { if (start != null && end != null) el.setSelectionRange(start, end); } catch { /* type sin selección */ }
    },
    true, // captura: corre antes que el handler de React
  );
}
