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
  filterCat: string;
  filterClass: '' | AbcClass;
  filterStock: StockFilter;
  filterFundicion: FundicionFilter;
}

interface InventarioFilterbarProps {
  values: FilterValues;
  categorias: string[];
  onChange: (key: keyof FilterValues, value: string) => void;
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
      <select
        className="select"
        style={{ maxWidth: 180 }}
        value={values.filterCat}
        onChange={(e) => onChange('filterCat', e.target.value)}
      >
        <option value="">Todas las categorías</option>
        {categorias.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
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
