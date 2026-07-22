import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface SearchOption {
  value: string;
  label: string;
}

/** Normaliza para buscar: minúsculas y SIN acentos (así "peramanal" encuentra "Peramanál").
 *  Se usa \p{Diacritic} (propiedad Unicode) en vez de un rango con caracteres
 *  combinantes literales, para que ningún paso del bundler/encoding lo altere. */
const normBusqueda = (s: string): string => {
  try {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  } catch {
    return (s ?? '').toLowerCase().trim();
  }
};

/** Apariencia del panel (colores/borde/sombra). La POSICIÓN se calcula aparte
 *  porque el panel se monta en un portal (position: fixed) para que ningún
 *  contenedor con overflow (tablas, modales) lo recorte. */
const PANEL_LOOK: CSSProperties = {
  overflowY: 'auto',
  background: 'var(--bg-1, #11151c)', border: '1px solid var(--border, #2a3240)',
  borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.45)',
};
const optStyle = (activo: boolean, sel: boolean): CSSProperties => ({
  padding: '.45rem .7rem', cursor: 'pointer', fontSize: '.9rem',
  background: activo ? 'var(--primary-soft, rgba(255,138,0,.15))' : 'transparent',
  color: sel ? 'var(--primary-3, #ff8a00)' : 'var(--text, #e6e6e6)',
  fontWeight: sel ? 600 : 400,
});

/** Máximo de opciones que se PINTAN a la vez (se filtra sobre TODO el catálogo, pero
 *  solo se renderiza este tope para que el tecleo no se trabe con listas grandes). */
const MAX_OPCIONES = 80;

interface AnchorPos { left: number; width: number; top?: number; bottom?: number; maxHeight: number }

/** Calcula la posición fija del panel anclada al input, con flip hacia arriba si
 *  no hay espacio abajo. Se recalcula al hacer scroll (en cualquier contenedor) o
 *  al redimensionar, mientras el panel está abierto. */
function useAnchoredPos(anchorRef: RefObject<HTMLElement>, open: boolean): AnchorPos | null {
  const [pos, setPos] = useState<AnchorPos | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const flip = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(140, Math.min(260, (flip ? spaceAbove : spaceBelow) - 12));
      setPos(flip
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 2, maxHeight }
        : { left: r.left, width: r.width, top: r.bottom + 2, maxHeight });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, anchorRef]);
  return pos;
}

/** Panel desplegable montado en un portal (body) con posición fija anclada al input. */
function DropdownPortal({ anchorRef, panelRef, open, children }: {
  anchorRef: RefObject<HTMLElement>; panelRef: RefObject<HTMLDivElement>; open: boolean; children: ReactNode;
}) {
  const pos = useAnchoredPos(anchorRef, open);
  if (!open || !pos) return null;
  const style: CSSProperties = {
    // z-index por encima del modal (.modal-backdrop = 9000) y por debajo de los toasts (9999),
    // porque el panel vive en un portal en <body>: si quedara por debajo del modal, no se vería.
    ...PANEL_LOOK, position: 'fixed', zIndex: 9500,
    left: pos.left, width: pos.width, maxHeight: pos.maxHeight,
    ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
  };
  return createPortal(<div ref={panelRef} role="listbox" style={style}>{children}</div>, document.body);
}

/**
 * Combobox con buscador: input que filtra una lista desplegable y selecciona al
 * hacer clic / Enter. Reemplaza a un <select> cuando hay muchas opciones
 * (productos, proveedores…). El valor seleccionado se controla por `value`.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  emptyText = 'Sin resultados',
  style,
  id,
  disabled = false,
}: {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  style?: CSSProperties;
  id?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = normBusqueda(query);
    if (!q) return options;
    return options.filter((o) => normBusqueda(o.label).includes(q));
  }, [options, query]);
  // Solo se pintan las primeras MAX_OPCIONES (rendimiento con catálogos grandes).
  const visibles = filtered.length > MAX_OPCIONES ? filtered.slice(0, MAX_OPCIONES) : filtered;

  // Cerrar al hacer clic afuera (y limpiar el texto tecleado). El panel vive en un
  // portal, así que un clic dentro de él NO se considera «afuera».
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setQuery('');
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, visibles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && visibles[hi]) {
        e.preventDefault();
        pick(visibles[hi].value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        id={id}
        className="input"
        autoComplete="off"
        disabled={disabled}
        value={open ? query : (selected?.label ?? '')}
        placeholder={selected ? selected.label : placeholder}
        onFocus={() => { if (disabled) return; setOpen(true); setQuery(''); setHi(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={onKeyDown}
      />
      <DropdownPortal anchorRef={inputRef} panelRef={panelRef} open={open && !disabled}>
        {filtered.length === 0 && (
          <div className="muted" style={{ padding: '.5rem .7rem', fontSize: '.85rem' }}>{emptyText}</div>
        )}
        {visibles.map((o, i) => (
          <div
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
            onMouseEnter={() => setHi(i)}
            style={optStyle(i === hi, o.value === value)}
          >
            {o.label}
          </div>
        ))}
        {filtered.length > visibles.length && (
          <div className="muted" style={{ padding: '.4rem .7rem', fontSize: '.78rem', borderTop: '1px solid var(--border, #2a3240)' }}>
            …y {filtered.length - visibles.length} más · seguí escribiendo para afinar
          </div>
        )}
      </DropdownPortal>
    </div>
  );
}

/**
 * Combobox con buscador que ADEMÁS permite escribir un valor nuevo (creatable).
 * Para campos tipo «lugar de extracción / supervisor» donde el texto se guarda
 * en un catálogo si no existía. El `value` es texto libre (no un id).
 */
export function SearchCreateSelect({
  options,
  value,
  onChange,
  placeholder = 'Escribí o elegí…',
  emptyText = 'Sin coincidencias',
  style,
  id,
  disabled = false,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  style?: CSSProperties;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const norm = (s: string) => normBusqueda(s);

  // Texto LOCAL del input: manda mientras el campo está enfocado. Antes el input estaba
  // controlado 100% por `value` (estado del padre): cada tecla iba al padre y volvía, y si
  // el padre re-renderizaba pesado el estado quedaba 1-2 letras atrás. El input mostraba lo
  // tecleado (buffer del navegador) pero la opción «Usar «…» (nuevo)» — dibujada desde ese
  // estado atrasado — salía CORTADA ("MANTENIMIENTO DE " en vez de "…MOLINO"). Con estado
  // local, input y opción salen SIEMPRE del mismo texto y nunca se desfasan.
  const [text, setText] = useState(value);
  const focusedRef = useRef(false);
  // Resincroniza con el valor externo solo cuando el campo NO está enfocado (cambio
  // programático: precarga al editar, transformación del padre como mayúsculas, reset…).
  // Mientras se teclea, el estado local es la única fuente de verdad.
  useEffect(() => { if (!focusedRef.current) setText(value); }, [value]);

  const filtered = useMemo(() => {
    const q = norm(text);
    if (!q) return options;
    return options.filter((o) => norm(o).includes(q));
  }, [options, text]);
  const exact = options.some((o) => norm(o) === norm(text));
  const showCreate = text.trim() !== '' && !exact;
  // Lista navegable con teclado: primero la opción «crear» (si aplica), luego las coincidencias.
  const items = useMemo(
    () => [...(showCreate ? [{ create: true, val: text }] : []), ...filtered.map((o) => ({ create: false, val: o }))],
    [showCreate, text, filtered],
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(v: string) { setText(v); onChange(v); setOpen(false); }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { if (open && items[hi]) { e.preventDefault(); pick(items[hi].val); } }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        id={id}
        className="input"
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={() => { focusedRef.current = true; if (!disabled) { setOpen(true); setHi(-1); } }}
        onBlur={() => { focusedRef.current = false; }}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value); setOpen(true); setHi(-1); }}
        onKeyDown={onKeyDown}
      />
      <DropdownPortal anchorRef={inputRef} panelRef={panelRef} open={open && !disabled && (items.length > 0 || !text)}>
        {items.length === 0 && <div className="muted" style={{ padding: '.5rem .7rem', fontSize: '.85rem' }}>{emptyText}</div>}
        {items.map((it, i) => (
          <div
            key={(it.create ? '__new__' : '') + it.val}
            role="option"
            aria-selected={!it.create && norm(it.val) === norm(text)}
            onMouseDown={(e) => { e.preventDefault(); pick(it.val); }}
            onMouseEnter={() => setHi(i)}
            style={optStyle(i === hi, !it.create && norm(it.val) === norm(value))}
          >
            {it.create ? <span><span style={{ color: 'var(--primary-3, #ff8a00)' }}>➕ Usar</span> «{it.val}» <span className="muted">(nuevo)</span></span> : it.val}
          </div>
        ))}
      </DropdownPortal>
    </div>
  );
}
