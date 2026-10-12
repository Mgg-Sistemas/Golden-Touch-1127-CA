import { useEffect, useRef, useState } from 'react';
import type { AbcClass } from './restock';

export type StockFilter = '' | 'critico' | 'restock' | 'ok' | 'sin_mov';
export type FundicionFilter = '' | 'si' | 'no' | 'en_proceso';

/** Campos de filtrado del inventario general (único).
 *
 *  NO hay filtro de estado: el inventario muestra SOLO productos activos.
 *  Un producto inactivo se dio de baja o se unificó en otro, y verlo en la
 *  lista hacía parecer que había dos productos donde queda uno (el caso de
 *  «VINAGRE (unificado en GEN-183)», 09/09/2026). Para consultar los dados de
 *  baja está el filtro de estado del modal de Exportar. */
export interface FilterValues {
  filterText: string;
  /** Categorías marcadas; vacío = todas. */
  filterCat: string[];
  filterClass: '' | AbcClass;
  filterStock: StockFilter;
  filterFundicion: FundicionFilter;
}

interface InventarioFilterbarProps {
  values: FilterValues;
  categorias: string[];
  onChange: (key: keyof FilterValues, value: string | string[]) => void;
}

/** Barra de filtros del inventario (búsqueda + categoría/producción/ABC/stock/estado). */
export function InventarioFilterbar({ values, categorias, onChange }: InventarioFilterbarProps) {
  return (
    <div className="filterbar">
      <input
        className="search"
        placeholder="Buscar por SKU o nombre…"
        value={values.filterText}
        onChange={(e) => onChange('filterText', e.target.value)}
      />
      <CategoriasCheck categorias={categorias} marcadas={values.filterCat} onChange={(v) => onChange('filterCat', v)} />
      <select
        className="select"
        style={{ maxWidth: 180 }}
        value={values.filterFundicion}
        onChange={(e) => onChange('filterFundicion', e.target.value)}
      >
        <option value="">Todos</option>
        <option value="si">Con receta de producción</option>
        <option value="en_proceso">En proceso de producción</option>
        <option value="no">Sin receta</option>
      </select>
      <select
        className="select"
        style={{ maxWidth: 140 }}
        value={values.filterClass}
        onChange={(e) => onChange('filterClass', e.target.value)}
      >
        <option value="">Todas las clases</option>
        <option value="A">Clase A</option>
        <option value="B">Clase B</option>
        <option value="C">Clase C</option>
      </select>
      <select
        className="select"
        style={{ maxWidth: 200 }}
        value={values.filterStock}
        onChange={(e) => onChange('filterStock', e.target.value)}
      >
        <option value="">Todo el stock</option>
        <option value="critico">Crítico</option>
        <option value="restock">Reabastecer (no crítico)</option>
        <option value="ok">Stock óptimo</option>
        <option value="sin_mov">Sin existencias</option>
      </select>
    </div>
  );
}

/** Filtro de categorías con casillas: se pueden marcar varias. Ninguna marcada = todas. */
function CategoriasCheck({ categorias, marcadas, onChange }: { categorias: string[]; marcadas: string[]; onChange: (v: string[]) => void }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);
  const alternar = (c: string) => onChange(marcadas.includes(c) ? marcadas.filter((x) => x !== c) : [...marcadas, c]);
  const texto = marcadas.length === 0 ? 'Todas las categorías' : marcadas.length === 1 ? marcadas[0] : `${marcadas.length} categorías`;
  return (
    <div className="cat-check" ref={caja}>
      <button type="button" className={`select cat-check-btn${marcadas.length ? ' activo' : ''}`} aria-haspopup="true" aria-expanded={abierto}
        title={marcadas.length ? marcadas.join(', ') : undefined} onClick={() => setAbierto((v) => !v)}>
        {texto}
      </button>
      {abierto && (
        <div className="cat-check-panel" role="group" aria-label="Categorías">
          <label className="cat-check-op todas">
            <input type="checkbox" checked={marcadas.length === 0} onChange={() => onChange([])} />
            <span>Todas las categorías</span>
          </label>
          {categorias.map((c) => (
            <label key={c} className="cat-check-op">
              <input type="checkbox" checked={marcadas.includes(c)} onChange={() => alternar(c)} />
              <span>{c}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
