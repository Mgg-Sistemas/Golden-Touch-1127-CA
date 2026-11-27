/* ============================================================
   Golden Touch · Libro Fiscal · Comparador de Factura Ensamblada vs Original

   Permite visualizar y cotejar lado a lado:
   1. La Factura Ensamblada digital (renglones, cantidades, precios unitarios, alícuotas y bases calculadas).
   2. El soporte físico original adjunto (imagen o PDF de la factura del proveedor).

   Asegura que el operador pueda auditar y comparar número a número antes y después de guardar.
   ============================================================ */

import { useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import type { RenglonValery } from './RegistrarFacturaRetencion';

export interface FacturaEnsambladaModalProps {
  facturaNro: string;
  facturaControl?: string | null;
  facturaFecha?: string | null;
  proveedorNombre?: string | null;
  proveedorRif?: string | null;
  moneda?: string;
  renglones: RenglonValery[];
  calculoValery?: {
    base16: number;
    iva16: number;
    base8: number;
    iva8: number;
    exento: number;
    totalIva: number;
    totalFactura: number;
  };
  archivoUrl?: string | null;
  archivoNombre?: string | null;
  onClose: () => void;
}

const money = (n: number | null | undefined, moneda = 'Bs') => {
  const v = Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === 'Bs' ? `Bs ${v}` : `$ ${v}`;
};

export function FacturaEnsambladaModal({
  facturaNro,
  facturaControl,
  facturaFecha,
  proveedorNombre,
  proveedorRif,
  moneda = 'Bs',
  renglones,
  calculoValery,
  archivoUrl,
  archivoNombre,
  onClose,
}: FacturaEnsambladaModalProps) {
  const [vistaModo, setVistaModo] = useState<'dividida' | 'ensamblada' | 'soporte'>('dividida');
  const [zoom, setZoom] = useState(1);

  // Calcular totales si no vienen provistos
  const calc = calculoValery ?? (() => {
    let b16 = 0;
    let b8 = 0;
    let ex = 0;
    for (const r of renglones) {
      const tot = (Number(r.cantidad) || 0) * (Number(r.precioUnitario) || 0);
      if (r.alicuota === 16) b16 += tot;
      else if (r.alicuota === 8) b8 += tot;
      else ex += tot;
    }
    const iv16 = Math.round(b16 * 0.16 * 100) / 100;
    const iv8 = Math.round(b8 * 0.08 * 100) / 100;
    const totIv = iv16 + iv8;
    return {
      base16: b16,
      iva16: iv16,
      base8: b8,
      iva8: iv8,
      exento: ex,
      totalIva: totIv,
      totalFactura: b16 + b8 + ex + totIv,
    };
  })();

  const esPdf = archivoNombre?.toLowerCase().endsWith('.pdf') || (archivoUrl?.includes('.pdf') ?? false);

  const imprimir = () => {
    window.print();
  };

  return (
    <Modal
      title={`📄 Factura Ensamblada N° ${facturaNro || 'S/N'} · Cotejo con Soporte Original`}
      onClose={onClose}
      size="xl"
    >
      <div style={{ display: 'grid', gap: '.85rem' }}>
        {/* Barra superior de controles */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '.6rem',
            padding: '.55rem .85rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-muted)' }}>Modo de visualización:</span>
            <div className="view-toggle" style={{ margin: 0 }}>
              <button
                type="button"
                className={vistaModo === 'dividida' ? 'active' : ''}
                onClick={() => setVistaModo('dividida')}
              >
                ⚖️ Comparativa lado a lado
              </button>
              <button
                type="button"
                className={vistaModo === 'ensamblada' ? 'active' : ''}
                onClick={() => setVistaModo('ensamblada')}
              >
                📋 Factura Ensamblada
              </button>
              {archivoUrl && (
                <button
                  type="button"
                  className={vistaModo === 'soporte' ? 'active' : ''}
                  onClick={() => setVistaModo('soporte')}
                >
                  📎 Soporte Original
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={imprimir}
              title="Imprimir desglose de factura ensamblada"
            >
              🖨️ Imprimir
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onClose}
            >
              Listo
            </button>
          </div>
        </div>

        {/* ── Grid Principal de Comparación ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: vistaModo === 'dividida' ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : '1fr',
            gap: '1rem',
            alignItems: 'start',
          }}
        >
          {/* LADO IZQUIERDO: Hoja de Factura Ensamblada */}
          {(vistaModo === 'dividida' || vistaModo === 'ensamblada') && (
            <div
              className="card"
              style={{
                padding: '1.25rem',
                background: '#0f172a',
                border: '1.5px solid var(--border)',
                borderRadius: '10px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
              }}
            >
              {/* Cabecera de la factura */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
                  paddingBottom: '.85rem',
                  marginBottom: '1rem',
                  gap: '.7rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: '.76rem', textTransform: 'uppercase', color: 'var(--primary, #f59e0b)', fontWeight: 700 }}>
                    Factura Fiscal Ensamblada
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginTop: '.15rem' }}>
                    {proveedorNombre || 'Proveedor sin nombre'}
                  </div>
                  {proveedorRif && (
                    <div className="mono muted" style={{ fontSize: '.84rem', marginTop: '.15rem' }}>
                      RIF: <strong>{proveedorRif}</strong>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary, #f59e0b)' }} className="mono">
                    N° FACTURA: {facturaNro || 'S/N'}
                  </div>
                  {facturaControl && (
                    <div style={{ fontSize: '.78rem', color: '#94a3b8' }} className="mono">
                      N° Control: {facturaControl}
                    </div>
                  )}
                  {facturaFecha && (
                    <div style={{ fontSize: '.78rem', color: '#94a3b8', marginTop: '.2rem' }}>
                      Fecha: {facturaFecha}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabla de Renglones */}
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '30px', color: '#94a3b8' }}>#</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: '#94a3b8' }}>Descripción / Concepto</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '60px', color: '#94a3b8' }}>Cant.</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px', color: '#94a3b8' }}>P.U. ({moneda})</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '75px', color: '#94a3b8' }}>Alíc.</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '110px', color: '#94a3b8' }}>Total ({moneda})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renglones.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                          No hay renglones cargados en esta factura ensamblada.
                        </td>
                      </tr>
                    ) : (
                      renglones.map((r, i) => {
                        const cant = Number(r.cantidad) || 0;
                        const pu = Number(r.precioUnitario) || 0;
                        const sub = cant * pu;
                        return (
                          <tr key={r.id || i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <td style={{ padding: '6px 8px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                            <td style={{ padding: '6px 8px', color: '#f1f5f9' }}>{r.descripcion || 'Sin descripción'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }} className="mono">{cant}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }} className="mono">{money(pu, moneda)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '.72rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: r.alicuota === 16 ? 'rgba(245, 158, 11, 0.15)' : r.alicuota === 8 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                                  color: r.alicuota === 16 ? '#fbbf24' : r.alicuota === 8 ? '#38bdf8' : '#cbd5e1',
                                  fontWeight: 600,
                                }}
                              >
                                {r.alicuota === 0 ? 'Exento' : `${r.alicuota}%`}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }} className="mono">
                              {money(sub, moneda)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Resumen de Liquidación Fiscal */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '.85rem 1rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '.6rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Base Gravada 16%</div>
                  <div className="mono" style={{ fontSize: '.9rem', fontWeight: 700, color: '#f1f5f9', marginTop: '.2rem' }}>
                    {money(calc.base16, moneda)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>IVA 16% Calculado</div>
                  <div className="mono" style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--primary, #f59e0b)', marginTop: '.2rem' }}>
                    {money(calc.iva16, moneda)}
                  </div>
                </div>

                {calc.base8 > 0 && (
                  <div>
                    <div style={{ fontSize: '.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Base 8% / IVA 8%</div>
                    <div className="mono" style={{ fontSize: '.9rem', fontWeight: 700, color: '#38bdf8', marginTop: '.2rem' }}>
                      {money(calc.base8, moneda)} / {money(calc.iva8, moneda)}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Monto Exento</div>
                  <div className="mono" style={{ fontSize: '.9rem', fontWeight: 700, color: '#94a3b8', marginTop: '.2rem' }}>
                    {money(calc.exento, moneda)}
                  </div>
                </div>

                <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: '.75rem' }}>
                  <div style={{ fontSize: '.72rem', color: '#22c55e', textTransform: 'uppercase', fontWeight: 800 }}>Total Factura</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#22c55e', marginTop: '.2rem' }}>
                    {money(calc.totalFactura, moneda)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LADO DERECHO: Visor del Soporte Físico Original */}
          {(vistaModo === 'dividida' || vistaModo === 'soporte') && (
            <div
              className="card"
              style={{
                padding: '1rem',
                background: '#090d16',
                border: '1.5px solid var(--border)',
                borderRadius: '10px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: '.6rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  marginBottom: '.75rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '.84rem', fontWeight: 700, color: '#f8fafc' }}>
                    📎 Soporte Físico Original
                  </span>
                  {archivoNombre && (
                    <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                      {archivoNombre}
                    </div>
                  )}
                </div>

                {!esPdf && archivoUrl && (
                  <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{Math.round(zoom * 100)}%</span>
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => setZoom(1)}
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {archivoUrl ? (
                <div
                  style={{
                    flex: 1,
                    minHeight: '480px',
                    maxHeight: '75vh',
                    overflow: 'auto',
                    background: '#000',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {esPdf ? (
                    <iframe
                      src={archivoUrl}
                      title="Soporte original de factura"
                      style={{ width: '100%', height: '580px', border: 'none' }}
                    />
                  ) : (
                    <img
                      src={archivoUrl}
                      alt="Factura original"
                      style={{
                        maxWidth: '100%',
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  )}
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    minHeight: '350px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    color: '#94a3b8',
                    border: '1.5px dashed rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '2rem',
                  }}
                >
                  <div style={{ fontSize: '2.5rem', marginBottom: '.6rem' }}>📄</div>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', color: '#cbd5e1' }}>
                    Sin soporte digital adjunto cargado
                  </div>
                  <p style={{ fontSize: '.76rem', maxWidth: '320px', margin: '.3rem auto 0' }}>
                    Cuando se adjunta el PDF o imagen de la factura física, se proyecta aquí automáticamente para cotejarlo frente al desglose ensamblado.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Función auxiliar para extraer renglones guardados a partir del texto de la observación/nota
 */
export function extraerRenglonesDeTexto(textoObservacion?: string | null): RenglonValery[] {
  if (!textoObservacion) return [];
  const lineas = textoObservacion.split('\n');
  const inicio = lineas.findIndex((l) => l.includes('--- Desglose de Renglones de Factura (Modo Avanzado) ---'));
  if (inicio === -1) return [];

  const renglones: RenglonValery[] = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (!l || l.startsWith('Totales calculados:')) break;
    // Formato: "1. Tornillos 3/8 | Cant: 10 | P.U: Bs 50,00 | Alícuota: 16% | Total: Bs 500,00"
    const partes = l.split('|').map((p) => p.trim());
    if (partes.length >= 4) {
      const descPart = partes[0].replace(/^\d+\.\s*/, '');
      const cantPart = partes[1].replace(/^Cant:\s*/i, '');
      const puPart = partes[2].replace(/^P\.U:\s*Bs\s*/i, '').replace(/^P\.U:\s*\$\s*/i, '').replace(/\./g, '').replace(',', '.');
      const alicPart = partes[3].replace(/^Alícuota:\s*/i, '').replace(/%/g, '').trim();

      const alicuota = alicPart.toLowerCase().includes('exento') ? 0 : Number(alicPart) === 8 ? 8 : 16;
      renglones.push({
        id: `renglon-${renglones.length + 1}`,
        descripcion: descPart,
        cantidad: parseFloat(cantPart) || 1,
        precioUnitario: parseFloat(puPart) || 0,
        alicuota: alicuota as 16 | 8 | 0,
      });
    }
  }
  return renglones;
}
