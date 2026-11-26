/* ============================================================
   Golden Touch · RRHH · Catálogos oficiales (Banco del Tesoro 0163)

   Antes las listas estaban recortadas en el código (17 países, 8
   municipios, 24 parroquias, 69 profesiones, 49 cargos). Este panel
   muestra TODAS las filas del Excel con su código oficial, incluido
   Nivel de educación: 01 PRIMARIA, 02 BACHILLERATO, …
   ============================================================ */

import { useMemo, useState } from 'react';
import { CATALOGOS_OFICIALES } from './catalogosOficiales';

const LIMITE = 300;

function normaliza(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

export function CatalogosOficialesPanel() {
  const [clave, setClave] = useState('educacion');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(0);

  const catalogo = CATALOGOS_OFICIALES.find((c) => c.clave === clave) ?? CATALOGOS_OFICIALES[0];
  const filtrados = useMemo(() => {
    const q = normaliza(busqueda.trim());
    if (!q) return catalogo.items;
    return catalogo.items.filter((i) =>
      normaliza(i.codigo).includes(q) ||
      normaliza(i.descripcion).includes(q) ||
      normaliza(i.detalle ?? '').includes(q),
    );
  }, [catalogo, busqueda]);

  const visibles = filtrados.slice(desde, desde + LIMITE);

  return (
    <section className="card" style={{ marginTop: '1rem' }}>
      <div className="card-title">📚 Catálogos oficiales de Nómina (Banco del Tesoro 0163)</div>
      <small className="muted" style={{ display: 'block', marginBottom: '.9rem' }}>
        Cargados desde «1-FORMATO CARGA MASIVA-MONEDA NACIONAL.xls». Cada renglón muestra su código oficial; la
        búsqueda acepta código, descripción o estado/municipio. Los catálogos grandes se muestran por partes.
      </small>

      <div className="form-grid" style={{ gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 2fr)' }}>
        <div className="form-row">
          <label>Catálogo</label>
          <select
            className="input"
            value={clave}
            onChange={(e) => { setClave(e.target.value); setBusqueda(''); setDesde(0); }}
          >
            {CATALOGOS_OFICIALES.map((c) => (
              <option key={c.clave} value={c.clave}>{c.titulo} ({c.items.length})</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Buscar en {catalogo.titulo.toLowerCase()}</label>
          <input
            className="input"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setDesde(0); }}
            placeholder={catalogo.clave === 'educacion' ? '01 PRIMARIA · 02 BACHILLERATO…' : 'Código o descripción…'}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.85rem 0 .5rem', gap: '.5rem', flexWrap: 'wrap' }}>
        <strong>{catalogo.titulo}</strong>
        <span className="muted">
          {filtrados.length} de {catalogo.items.length} registros
          {desde > 0 ? ` · desde ${desde + 1}` : ''}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tabla" style={{ width: '100%' }}>
          <thead>
            <tr><th style={{ width: 110 }}>Código</th><th>Descripción</th><th style={{ width: 220 }}>Detalle</th></tr>
          </thead>
          <tbody>
            {visibles.map((item, i) => (
              <tr key={`${item.codigo}-${desde + i}`}>
                <td className="mono"><strong>{item.codigo}</strong></td>
                <td>{item.descripcion}</td>
                <td className="muted">{item.detalle ?? ''}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={3} className="muted">Sin resultados para «{busqueda}».</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.9rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-ghost" disabled={desde === 0} onClick={() => setDesde(Math.max(0, desde - LIMITE))}>
          ← Anterior
        </button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={desde + LIMITE >= filtrados.length} onClick={() => setDesde(desde + LIMITE)}>
          Siguiente →
        </button>
      </div>
    </section>
  );
}
