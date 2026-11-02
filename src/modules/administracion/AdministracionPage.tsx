import { useState } from 'react';

/**
 * Módulo Administración — «Gastos fijos por servicio».
 * Andamiaje (Fase 0): las tres pestañas, SIN lógica todavía. El estilo sigue a
 * Tesorería (cabecera + `view-toggle`, tarjetas y tokens del sistema); nada de
 * estética nueva. La lógica (plantillas, histórico, reporte) llega en fases.
 */
type Vista = 'gastos' | 'movimientos' | 'reporte';

const PESTANAS: { id: Vista; label: string; prepara: string }[] = [
  { id: 'gastos', label: '📌 Gastos fijos', prepara: 'Plantillas de gasto fijo por servicio: servicio, proveedor, monto, periodicidad y próximo vencimiento.' },
  { id: 'movimientos', label: '📒 Movimientos / Histórico', prepara: 'Histórico de movimientos y su carga: importación de archivo para el inicial y alta manual para el día a día.' },
  { id: 'reporte', label: '📊 Reporte', prepara: 'Reporte con filtros, totales por categoría y moneda, exportación a PDF y Excel, y mensaje de WhatsApp para pegar.' },
];

export function AdministracionPage() {
  const [vista, setVista] = useState<Vista>('gastos');
  const activa = PESTANAS.find((p) => p.id === vista) ?? PESTANAS[0];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>💼 Administración</h1>
          <p className="muted hint" style={{ margin: '.25rem 0 0' }}>Gastos fijos por servicio: plantillas, histórico y reporte.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          {/* Multi-empresa: toda la vista se filtrará por empresa. Placeholder de layout
              reservado en la cabecera; el selector real (registro de empresas y scoping)
              llega en la Fase 1. Por eso va deshabilitado y sin lógica todavía. */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <span className="muted hint">Empresa</span>
            <select disabled defaultValue="todas" title="Multi-empresa: el selector de empresa se activa en la Fase 1"
              aria-label="Empresa (multi-empresa, se activa en la Fase 1)">
              <option value="todas">Todas las empresas</option>
            </select>
          </label>
          <div className="view-toggle" role="tablist" aria-label="Vista de administración">
            {PESTANAS.map((p) => (
              <button key={p.id} className={vista === p.id ? 'active' : ''} onClick={() => setVista(p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{activa.label}</div>
        <p className="muted hint" style={{ margin: '.35rem 0 0' }}>En preparación · {activa.prepara}</p>
      </div>
    </div>
  );
}
