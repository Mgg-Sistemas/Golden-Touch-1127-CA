/* ============================================================
   Golden Touch · Retenciones · Selector Hero Protagónico de Empresa
   
   Permite al usuario conmutar de forma muy visual y protagonista la
   empresa agente de retención activa.
   
   - Golden Touch 1127, C.A.: Ciclo completo de Compras (OCs) + Buzón Móvil
   - Otras empresas (ej. MTO Motor): Solo Buzón Móvil (externo a compras)
   ============================================================ */
import type { EmpresaReceptora } from './empresasReceptoras.repository';
import { esEmpresaGt } from './empresaActual';

export interface EmpresaActualSelectorProps {
  empresas: EmpresaReceptora[];
  empresaId: string | null;
  onChange: (id: string) => void;
  conteos?: Record<string, number>;
}

export function EmpresaActualSelector({
  empresas,
  empresaId,
  onChange,
  conteos,
}: EmpresaActualSelectorProps) {
  const activas = empresas.filter((e) => e.activo);
  const lista = activas.length ? activas : empresas;

  if (lista.length === 0) return null;

  return (
    <section
      aria-label="Selector de empresa agente de retención"
      style={{
        margin: '0 0 1rem 0',
        padding: '.75rem .9rem',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '.4rem',
          marginBottom: '.65rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🏢</span>
          <div>
            <strong style={{ fontSize: '.88rem', color: 'var(--text-normal)' }}>
              Empresa Agente de Retención Activa
            </strong>
            <small className="muted" style={{ display: 'block', fontSize: '.74rem' }}>
              Los libros fiscales, comprobantes emitidos y facturas por retener corresponden a la empresa seleccionada:
            </small>
          </div>
        </div>
        {lista.length > 1 && (
          <span
            style={{
              fontSize: '.72rem',
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            {lista.length} empresas disponibles
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '.65rem',
        }}
      >
        {lista.map((e) => {
          const esActiva = e.id === empresaId;
          const esGt = esEmpresaGt(e);
          const cantidad = conteos?.[e.id];

          return (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                if (!esActiva) onChange(e.id);
              }}
              aria-pressed={esActiva}
              style={{
                textAlign: 'left',
                padding: '.75rem .85rem',
                borderRadius: '10px',
                cursor: esActiva ? 'default' : 'pointer',
                transition: 'all 0.18s ease-in-out',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: '.45rem',
                border: esActiva
                  ? '2px solid var(--primary, #f59e0b)'
                  : '1px solid var(--border)',
                background: esActiva
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(255, 255, 255, 0.02) 100%)'
                  : 'rgba(255, 255, 255, 0.02)',
                boxShadow: esActiva
                  ? '0 0 14px rgba(245, 158, 11, 0.18)'
                  : 'none',
              }}
            >
              {/* Cabecera de la tarjeta: Nombre y Badge de estado */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '.4rem',
                  width: '100%',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '.9rem',
                      color: esActiva ? 'var(--primary, #f59e0b)' : 'var(--text-normal)',
                      lineHeight: 1.25,
                    }}
                  >
                    {e.nombreCorto?.trim() || e.nombre}
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <code style={{ fontSize: '.74rem', padding: '1px 4px' }}>{e.rif}</code>
                    {e.municipio && ` · ${e.municipio}`}
                  </div>
                </div>

                {esActiva ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '.72rem',
                      fontWeight: 700,
                      color: '#22c55e',
                      background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: '.6rem' }}>●</span> ACTIVA
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '.72rem',
                      color: 'var(--text-muted)',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--border)',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Hacer clic para activar
                  </span>
                )}
              </div>

              {/* Vía de origen de las facturas */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '.35rem',
                  fontSize: '.74rem',
                  paddingTop: '.35rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  marginTop: 'auto',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: esGt ? 'var(--text-normal)' : 'var(--info, #38bdf8)',
                    fontWeight: 600,
                  }}
                >
                  {esGt ? '🛒 Compras / OCs + 📱 Buzón Móvil' : '📱 Solo Buzón Móvil (Recepción Externa)'}
                </span>

                {cantidad !== undefined && (
                  <span
                    style={{
                      fontSize: '.72rem',
                      fontWeight: 700,
                      color: cantidad > 0 ? 'var(--warning, #eab308)' : 'var(--text-muted)',
                      background: cantidad > 0 ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
                      padding: cantidad > 0 ? '1px 6px' : '0',
                      borderRadius: '4px',
                    }}
                  >
                    {cantidad > 0 ? `⚡ ${cantidad} por retener` : 'Al día'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
