/* ============================================================
   Golden Touch · Campo de fecha en formato venezolano

   Se escribe a mano en DD/MM/AAAA —con las barras puestas solas— y el
   botón 📅 abre el calendario del navegador. Las dos formas terminan en
   el mismo dato: `AAAA-MM-DD`, que es lo que guarda la base.

   Por qué no alcanza con el `<input type="date">` pelado: muestra y pide
   la fecha en el formato del IDIOMA DEL SISTEMA. En una máquina en inglés,
   el 21 de octubre se escribe 10/21/1973, y quien carga fichas todo el día
   termina metiendo el mes en el día sin darse cuenta.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { errorFechaVe, formatearMientrasEscribe, isoAVe, veAIso } from '@/shared/lib/fechaVE';

export function FechaInput({
  value, onChange, name, id, placeholder, disabled, autoFocus, className, style, max, min,
}: {
  /** La fecha guardada, `AAAA-MM-DD`, o cadena vacía. */
  value: string | null | undefined;
  /** Devuelve `AAAA-MM-DD`, o cadena vacía cuando el campo queda en blanco. */
  onChange: (iso: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Topes opcionales para el calendario, en `AAAA-MM-DD`. */
  max?: string;
  min?: string;
}) {
  // Lo tecleado vive aparte de la fecha guardada: mientras se escribe
  // «21/1» todavía no hay fecha, y no por eso hay que borrar lo escrito.
  const [texto, setTexto] = useState(() => isoAVe(value));
  const [tocado, setTocado] = useState(false);
  const calendario = useRef<HTMLInputElement>(null);

  // Si la fecha cambia desde afuera (se abre otra ficha, se limpia el
  // formulario), el texto la sigue — salvo que sea el mismo dato que ya
  // se está escribiendo, para no pisarle el cursor a quien teclea.
  useEffect(() => {
    const iso = veAIso(texto);
    if ((value ?? '') !== (iso ?? '')) setTexto(isoAVe(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function escribir(v: string) {
    const formateado = formatearMientrasEscribe(v);
    setTexto(formateado);
    const iso = veAIso(formateado);
    if (iso) onChange(iso);
    else if (!formateado.trim()) onChange('');   // vaciar el campo limpia la fecha
  }

  function abrirCalendario() {
    const el = calendario.current;
    if (!el) return;
    // showPicker() es lo que abre el calendario sin mostrar el campo nativo.
    // Donde no exista (navegador viejo), un click sobre el input hace lo mismo.
    try {
      const conPicker = el as HTMLInputElement & { showPicker?: () => void };
      if (typeof conPicker.showPicker === 'function') conPicker.showPicker();
      else el.click();
    } catch { el.click(); }
  }

  const problema = tocado ? errorFechaVe(texto) : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
        <input
          className={className ?? 'input mono'}
          style={{ flex: 1, minWidth: 0, ...(problema ? { borderColor: 'var(--danger)' } : null), ...style }}
          name={name}
          id={id}
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          onBlur={() => setTocado(true)}
          placeholder={placeholder ?? 'DD/MM/AAAA'}
          inputMode="numeric"
          maxLength={10}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label="Fecha en formato día/mes/año"
        />
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={abrirCalendario}
          disabled={disabled}
          title="Elegir en el calendario"
          aria-label="Elegir en el calendario"
        >📅</button>
        {/* El campo nativo queda fuera de la vista: solo aporta el calendario. */}
        <input
          ref={calendario}
          type="date"
          value={value ?? ''}
          max={max}
          min={min}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { setTexto(isoAVe(e.target.value)); setTocado(false); onChange(e.target.value); }}
          style={{
            position: 'absolute', width: 1, height: 1, opacity: 0,
            pointerEvents: 'none', border: 0, padding: 0,
          }}
        />
      </div>
      {problema && <small style={{ color: 'var(--danger)' }}>{problema}</small>}
    </div>
  );
}
