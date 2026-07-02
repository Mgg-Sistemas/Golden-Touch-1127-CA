import { useEffect, useState, type ElementType, type ReactNode } from 'react';

/* ============================================================
   Golden Touch · Toggle global de "Hints" (textos de ayuda)
   Muchos módulos tienen textos explicativos (intros, ayudas de
   formulario) que a veces saturan el visual. Con el botón (?) de
   la barra superior se pueden MOSTRAR/OCULTAR de golpe en todo el
   sistema. El ocultado es puro CSS (clase `hints-off` en <body>),
   así que no re-renderiza nada: cualquier elemento con la clase
   `hint` (o el componente <Hint>) desaparece cuando está apagado.
   La preferencia se recuerda por navegador (localStorage).
   ============================================================ */

const KEY = 'mgg.hints.hidden';

function leerPref(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Aplica/retira la clase que oculta los hints en todo el documento. */
export function aplicarHints(hidden: boolean): void {
  if (typeof document !== 'undefined') document.body.classList.toggle('hints-off', hidden);
}

/** Aplica la preferencia guardada al arrancar la app (evita el parpadeo). */
export function initHints(): void {
  aplicarHints(leerPref());
}

/** Botón (?) de la barra superior: alterna la visibilidad de los textos de ayuda. */
export function HintsToggle() {
  const [hidden, setHidden] = useState<boolean>(leerPref);

  useEffect(() => { aplicarHints(hidden); }, [hidden]);

  function toggle() {
    setHidden((h) => {
      const next = !h;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* quota */ }
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      title={hidden ? 'Mostrar textos de ayuda' : 'Ocultar textos de ayuda'}
      aria-label={hidden ? 'Mostrar textos de ayuda' : 'Ocultar textos de ayuda'}
      style={{
        background: hidden ? 'transparent' : 'var(--brand, #ff8a00)',
        color: hidden ? 'var(--muted, #94a3b8)' : '#1a1a1a',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '.45rem .65rem',
        cursor: 'pointer',
        fontSize: '1.02rem',
        lineHeight: 1,
        fontWeight: 700,
      }}
    >
      ?
    </button>
  );
}

/**
 * Texto de ayuda ocultable. Envuelve un hint para que respete el toggle global.
 * Por defecto se pinta como `<p className="muted hint">`; con `as` se cambia la
 * etiqueta (p. ej. `as="small"`). Cualquier className extra se conserva.
 */
export function Hint({ children, as, className }: { children: ReactNode; as?: ElementType; className?: string }) {
  const Tag = (as ?? 'p') as ElementType;
  return <Tag className={`muted hint${className ? ` ${className}` : ''}`}>{children}</Tag>;
}
