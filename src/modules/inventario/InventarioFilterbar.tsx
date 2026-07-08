import type { AbcClass } from './restock';

export type StockFilter = '' | 'critico' | 'restock' | 'ok' | 'sin_mov';
export type EstadoFilter = '' | 'activo' | 'inactivo';
export type FundicionFilter = '' | 'si' | 'no' | 'en_proceso';

/** Campos de filtrado compartidos por inventario general y por el detalle de almacén. */
export interface FilterValues {
  filterText: string;
  filterCat: string;
  filterClass: '' | AbcClass;
  filterStock: StockFilter;
  filterEstado: EstadoFilter;
  filterFundicion: FundicionFilter;
  /** Nombre del almacén por el que filtrar (vacío = todos). Solo en el inventario general. */
  filterAlmacen: string;
}

interface InventarioFilterbarProps {
  values: FilterValues;
  categorias: string[];
  onChange: (key: keyof FilterValues, value: string) => void;
  /** Nombres de almacenes para el filtro por almacén. Si se omite, no se muestra (ej. en el detalle de un almacén). */
  almacenes?: string[];
}

/** Barra de filtros reutilizable de inventario (búsqueda + categoría/producción/ABC/stock/estado/almacén). */
export function InventarioFilterbar({ values, categorias, onChange, almacenes }: InventarioFilterbarProps) {
  return (
    <div className="filterbar">
      <input
        className="search"
        placeholder="Buscar por SKU o nombre…"
        value={values.filterText}
        onChange={(e) => onChange('filterText', e.target.value)}
      />
      {almacenes && almacenes.length > 0 && (
        <select
          className="select"
          style={{ maxWidth: 200 }}
          value={values.filterAlmacen}
          onChange={(e) => onChange('filterAlmacen', e.target.value)}
          title="Filtrar por almacén"
        >
          <option value="">Todos los almacenes</option>
          {almacenes.map((a) => {
            // Los subalmacenes ("BASE / SUB") se muestran sangrados bajo su almacén base;
            // el almacén base (sin " / ") trae TODOS sus subalmacenes al elegirlo.
            const idx = a.indexOf(' / ');
            const esSub = idx >= 0;
            return (
              <option key={a} value={a}>{esSub ? `   ↳ ${a.slice(idx + 3)}` : a}</option>
            );
          })}
        </select>
      )}
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
      <select
        className="select"
        style={{ maxWidth: 140 }}
        value={values.filterEstado}
        onChange={(e) => onChange('filterEstado', e.target.value)}
      >
        <option value="">Todos</option>
        <option value="activo">Activos</option>
        <option value="inactivo">Inactivos</option>
      </select>
    </div>
  );
}
