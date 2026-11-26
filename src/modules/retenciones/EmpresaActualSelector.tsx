/* ============================================================
   Golden Touch · Retenciones · Selector Hero Protagónico de Empresa (Multi-Empresa N)
   
   Diseñado para escalar de forma robusta y elegante con N empresas:
   - Tarjeta protagonista fija para la Empresa Activa Seleccionada.
   - Carrusel / Tira horizontal de acceso rápido con scroll suave (no empuja verticalmente la pantalla).
   - Buscador rápido desplegable (SearchSelect) cuando hay múltiples empresas.
   - Indicador de origen diferenciado:
     * Golden Touch (GT): Compras / OCs + Buzón Móvil
     * Otras empresas (ej. MTO Motor): Solo Buzón Móvil (Recepción Externa)
   ============================================================ */
import { useMemo, useRef } from 'react';
import type { EmpresaReceptora } from './empresasReceptoras.repository';
import { esEmpresaGt } from './empresaActual';
import { SearchSelect, type SearchOption } from '@/shared/ui/SearchSelect';

export interface EmpresaActualSelectorProps {
  empresas: EmpresaReceptora[];
  empresaId: string | null;
  onChange: (id: string) => void;
  conteos?: Record<string, number>;
  onGestionarEmpresas?: () => void;
}

export function EmpresaActualSelector({
  empresas,
  empresaId,
  onChange,
  conteos,
  onGestionarEmpresas,
}: EmpresaActualSelectorProps) {
  const activas = empresas.filter((e) => e.activo);
  const lista = activas.length ? activas : empresas;
  const railRef = useRef<HTMLDivElement>(null);

  // Identificar la empresa activa actual
  const empresaActiva = useMemo(() => {
    return lista.find((e) => e.id === empresaId) ?? lista[0];
  }, [lista, empresaId]);

  // Opciones para el buscador rápido de N empresas
  const opcionesSearch: SearchOption[] = useMemo(() => {
    return lista.map((e) => ({
      value: e.id,
      label: e.nombreCorto?.trim() || e.nombre,
      hint: `${e.rif}${conteos?.[e.id] ? ` · ⚡ ${conteos[e.id]} pendientes` : ''}`,
      keywords: [e.rif, e.nombre, e.municipio ?? '', esEmpresaGt(e) ? 'compras' : 'buzon'],
    }));
  }, [lista, conteos]);

  if (lista.length === 0) return null;

  const esGtActiva = esEmpresaGt(empresaActiva);
  const cantidadActiva = empresaActiva ? conteos?.[empresaActiva.id] : undefined;

  const scrollRail = (delta: number) => {
    if (railRef.current) {
      railRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    }
  };

  return (
    <section
      aria-label="Selector multi-empresa agente de retención"
      style={{
        margin: '0 0 1rem 0',
        padding: '.75rem .95rem',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid var(--border)',
      }}
    >
      {/* ── 1. Cabecera con título y Buscador para N Empresas ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '.6rem',
          marginBottom: '.65rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🏢</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '.9rem', color: 'var(--text-normal)' }}>
                Empresa Agente de Retención Activa
              </strong>
              <span
                style={{
                  fontSize: '.7rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  padding: '1px 7px',
                  borderRadius: '999px',
                }}
              >
                {lista.length} {lista.length === 1 ? 'empresa' : 'empresas registradas'}
              </span>
              {onGestionarEmpresas && (
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={onGestionarEmpresas}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '.3rem',
                    padding: '2px 9px',
                    fontSize: '.72rem',
                    fontWeight: 700,
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: 'var(--primary, #f59e0b)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  title="Gestionar empresas receptoras, sincronizar con Administración o editar datos fiscales"
                >
                  ⚙️ Gestionar empresas
                </button>
              )}
            </div>
            <small className="muted" style={{ display: 'block', fontSize: '.74rem', marginTop: '1px' }}>
              Los libros fiscales, comprobantes emitidos y facturas en cola corresponden a la empresa seleccionada:
            </small>
          </div>
        </div>

        {/* Buscador de acceso directo para saltar a cualquiera de las N empresas */}
        {lista.length > 2 && (
          <div style={{ minWidth: 240, maxWidth: 300, flex: '1 1 auto' }}>
            <SearchSelect
              value={empresaId ?? ''}
              onChange={(id) => { if (id) onChange(id); }}
              options={opcionesSearch}
              placeholder="🔍 Buscar o saltar a otra empresa…"
            />
          </div>
        )}
      </div>

      {/* ── 2. Hero Spotlight de la Empresa Activa ── */}
      {empresaActiva && (
        <div
          style={{
            padding: '.75rem .95rem',
            borderRadius: '10px',
            border: '2px solid var(--primary, #f59e0b)',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(255, 255, 255, 0.02) 100%)',
            boxShadow: '0 0 16px rgba(245, 158, 11, 0.18)',
            marginBottom: lista.length > 1 ? '.75rem' : 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '.6rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                flexShrink: 0,
              }}
            >
              🏢
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--primary, #f59e0b)' }}>
                  {empresaActiva.nombreCorto?.trim() || empresaActiva.nombre}
                </span>
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
                  }}
                >
                  <span style={{ fontSize: '.6rem' }}>●</span> ACTIVA
                </span>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: '.74rem', padding: '1px 5px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
                  {empresaActiva.rif}
                </code>
                {empresaActiva.municipio && <span>· Municipio {empresaActiva.municipio}</span>}
                <span style={{ color: 'var(--border)' }}>|</span>
                <span style={{ color: esGtActiva ? 'var(--text-normal)' : 'var(--info, #38bdf8)', fontWeight: 600 }}>
                  {esGtActiva ? '🛒 Compras / OCs + 📱 Buzón Móvil' : '📱 Solo Buzón Móvil (Recepción Externa)'}
                </span>
              </div>
            </div>
          </div>

          {/* Conteo de la empresa activa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            {cantidadActiva !== undefined && (
              <span
                style={{
                  fontSize: '.8rem',
                  fontWeight: 700,
                  color: cantidadActiva > 0 ? 'var(--warning, #eab308)' : 'var(--success, #22c55e)',
                  background: cantidadActiva > 0 ? 'rgba(234, 179, 8, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                  border: `1px solid ${cantidadActiva > 0 ? 'rgba(234, 179, 8, 0.35)' : 'rgba(34, 197, 94, 0.3)'}`,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {cantidadActiva > 0 ? `⚡ ${cantidadActiva} por retener` : '✓ Al día (sin pendientes)'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Carrusel / Tira Horizontal Deslizable para N Empresas ── */}
      {lista.length > 1 && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '.4rem',
            }}
          >
            <span style={{ fontSize: '.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Cambiar a otra empresa receptora ({lista.length}):
            </span>
            {lista.length > 3 && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '1px 7px', fontSize: '.75rem', lineHeight: 1 }}
                  onClick={() => scrollRail(-280)}
                  title="Desplazar a la izquierda"
                  aria-label="Desplazar izquierda"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '1px 7px', fontSize: '.75rem', lineHeight: 1 }}
                  onClick={() => scrollRail(280)}
                  title="Desplazar a la derecha"
                  aria-label="Desplazar derecha"
                >
                  ▶
                </button>
              </div>
            )}
          </div>

          <div
            ref={railRef}
            style={{
              display: 'flex',
              gap: '.55rem',
              overflowX: 'auto',
              paddingBottom: '4px',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
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
                    flex: '0 0 auto',
                    minWidth: '240px',
                    maxWidth: '280px',
                    textAlign: 'left',
                    padding: '.55rem .75rem',
                    borderRadius: '8px',
                    cursor: esActiva ? 'default' : 'pointer',
                    transition: 'all 0.15s ease-in-out',
                    scrollSnapAlign: 'start',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '.3rem',
                    border: esActiva
                      ? '1.5px solid var(--primary, #f59e0b)'
                      : '1px solid var(--border)',
                    background: esActiva
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '.4rem',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '.84rem',
                        color: esActiva ? 'var(--primary, #f59e0b)' : 'var(--text-normal)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '170px',
                      }}
                      title={e.nombre}
                    >
                      {e.nombreCorto?.trim() || e.nombre}
                    </div>
                    {esActiva ? (
                      <span
                        style={{
                          fontSize: '.68rem',
                          fontWeight: 700,
                          color: '#22c55e',
                          background: 'rgba(34, 197, 94, 0.12)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        ✓ Activa
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '.68rem',
                          color: 'var(--text-muted)',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        Activar
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    <code style={{ fontSize: '.71rem' }}>{e.rif}</code>
                    <span style={{ color: esGt ? 'var(--text-muted)' : 'var(--info, #38bdf8)' }}>
                      {esGt ? 'Compras + Buzón' : 'Solo Buzón'}
                    </span>
                  </div>

                  {cantidad !== undefined && (
                    <div style={{ fontSize: '.71rem', fontWeight: 600, color: cantidad > 0 ? 'var(--warning, #eab308)' : 'var(--text-muted)' }}>
                      {cantidad > 0 ? `⚡ ${cantidad} por retener` : '✓ Sin pendientes'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
