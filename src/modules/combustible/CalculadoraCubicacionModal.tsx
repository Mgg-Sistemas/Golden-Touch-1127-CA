/* ============================================================
   Golden Touch · Combustible · Modal Calculadora de Cubicación
   Réplica funcional e interactiva de calculadora.xlsx:
     · Selecciona el tanque (TANQUE #1, TANQUE #2, TANQUE #3, GEP-150).
     · Coloca la altura leída en cm (varilla).
     · Muestra al instante el volumen en Litros, m³, % de capacidad,
       barra de nivel visual, estado y tabulador de varilla.
     · Optimizado tanto para PC como para la vista de teléfono.
   ============================================================ */

import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import type { TanqueCombustible } from '@/shared/lib/types';
import {
  calcularCubicacionTanque,
  detectarClaveTanque,
  generarTablaVarilla,
  LISTA_CLAVES_CALCULADORA,
  TANQUES_CALCULADORA,
  type ClaveTanqueCalculadora,
} from './calculadoraCubicacion';

function fmtNum(n: number | null | undefined, dec = 2): string {
  return (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function CalculadoraCubicacionModal({
  tanqueInicial,
  tanques = [],
  onClose,
}: {
  tanqueInicial?: string | null;
  tanques?: TanqueCombustible[];
  onClose: () => void;
}) {
  const claveDefecto = useMemo(() => detectarClaveTanque(tanqueInicial), [tanqueInicial]);
  const [tanqueClave, setTanqueClave] = useState<ClaveTanqueCalculadora>(claveDefecto);
  const [alturaStr, setAlturaStr] = useState<string>('10');
  const [verTabulador, setVerTabulador] = useState(false);
  const [filtroTabulador, setFiltroTabulador] = useState('');

  const alturaNum = Math.max(0, Number(alturaStr) || 0);

  // Tanque activo en DB si coincide por nombre/clave
  const tanqueDb = useMemo(() => {
    return tanques.find((t) => detectarClaveTanque(t.nombre) === tanqueClave) ?? null;
  }, [tanques, tanqueClave]);

  // Cálculo en tiempo real
  const res = useMemo(() => {
    return calcularCubicacionTanque(tanqueClave, alturaNum, tanqueDb);
  }, [tanqueClave, alturaNum, tanqueDb]);

  // Tabulador de varilla para el tanque elegido
  const tablaVarilla = useMemo(() => {
    if (!verTabulador) return [];
    return generarTablaVarilla(tanqueClave, res.altura200Cm);
  }, [tanqueClave, verTabulador, res.altura200Cm]);

  const tablaFiltrada = useMemo(() => {
    if (!filtroTabulador.trim()) return tablaVarilla;
    const f = filtroTabulador.trim();
    return tablaVarilla.filter((row) => String(row.cm).includes(f) || fmtNum(row.litros).includes(f));
  }, [tablaVarilla, filtroTabulador]);

  // Atajos para modificar altura con un toque (ideal para teléfono)
  function sumarCm(delta: number) {
    setAlturaStr((prev) => {
      const v = Math.max(0, Math.round(((Number(prev) || 0) + delta) * 10) / 10);
      return String(v);
    });
  }

  async function copiarResumen() {
    const texto = `${res.tanqueNombre} · Altura: ${fmtNum(res.alturaCm, 1)} cm (${fmtNum(res.alturaM, 2)} m) · Volumen: ${fmtNum(res.volumenLitros)} L (${fmtNum(res.nivelPct * 100, 1)}%) · Estado: ${res.estado}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
      } else {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast('Cubicación copiada al portapapeles', 'success');
    } catch {
      toast('No se pudo copiar automáticamente', 'error');
    }
  }

  const pctVisual = Math.min(100, Math.max(0, res.nivelPct * 100));
  const colorNivel = res.nivelPct > 1
    ? 'var(--danger, #ef4444)'
    : res.nivelPct >= 0.9
      ? 'var(--warning, #f59e0b)'
      : 'var(--primary-3, #38bdf8)';

  return (
    <Modal
      title="📐 Calculadora de cubicación"
      size="lg"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => void copiarResumen()} title="Copiar resumen en texto para WhatsApp o notas">
            📋 Copiar resultado
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Selector de tanque */}
        <div>
          <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, marginBottom: '.4rem', color: 'var(--text-muted)' }}>
            1. SELECCIONA EL TANQUE
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '.5rem',
            }}
          >
            {LISTA_CLAVES_CALCULADORA.map((k) => {
              const info = TANQUES_CALCULADORA[k];
              const activo = tanqueClave === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTanqueClave(k)}
                  style={{
                    padding: '.65rem .75rem',
                    textAlign: 'left',
                    borderRadius: '8px',
                    border: activo ? '2px solid var(--primary-3, #38bdf8)' : '1px solid var(--border, #334155)',
                    background: activo ? 'rgba(56, 189, 248, 0.12)' : 'var(--card-bg, #1e293b)',
                    color: activo ? 'var(--primary-3, #38bdf8)' : 'inherit',
                    cursor: 'pointer',
                    transition: 'all .15s ease',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{info.nombre}</div>
                  <div style={{ fontSize: '.75rem', opacity: 0.8, marginTop: '.2rem' }}>
                    {fmtNum(info.capacidad100Litros, 0)} L al 100%
                  </div>
                  <div style={{ fontSize: '.72rem', opacity: 0.65 }}>
                    h máx: {info.altura100Cm} cm
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.4rem' }}>
            ℹ️ {res.tanqueDescripcion}
          </div>
        </div>

        {/* Input de altura en cm */}
        <div
          style={{
            background: 'var(--card-bg, #1e293b)',
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid var(--border, #334155)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.4rem' }}>
            <label htmlFor="input-altura-cm" style={{ fontSize: '.88rem', fontWeight: 700 }}>
              2. ALTURA LEÍDA EN VARILLA (CM)
            </label>
            <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
              Equivale a: <strong style={{ color: 'var(--text-main, #f1f5f9)' }}>{fmtNum(res.alturaM, 2)} m</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '.75rem' }}>
            <input
              id="input-altura-cm"
              type="number"
              min={0}
              max={res.altura200Cm}
              step="any"
              className="input mono"
              value={alturaStr}
              onChange={(e) => setAlturaStr(e.target.value)}
              placeholder="Ej: 85"
              autoFocus
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                padding: '.6rem .8rem',
                textAlign: 'center',
                flex: 1,
                border: '2px solid var(--primary-3, #38bdf8)',
                background: 'rgba(0,0,0,0.25)',
              }}
            />
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-muted)' }}>cm</span>
          </div>

          {/* Atajos numéricos para uso rápido en teléfono o PC */}
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sumarCm(-10)} title="Restar 10 cm">-10</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sumarCm(-5)} title="Restar 5 cm">-5</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sumarCm(-1)} title="Restar 1 cm">-1</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sumarCm(1)} title="Sumar 1 cm">+1</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sumarCm(5)} title="Sumar 5 cm">+5</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sumarCm(10)} title="Sumar 10 cm">+10</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlturaStr('0')} title="Poner en 0 cm" style={{ marginLeft: 'auto' }}>
              Limpiar
            </button>
          </div>
        </div>

        {/* Tarjeta principal con el resultado de cubicación */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
            borderRadius: '12px',
            border: `2px solid ${colorNivel}`,
            padding: '1.2rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.5rem' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              VOLUMEN CALCULADO (CUBICACIÓN)
            </span>
            <span
              style={{
                fontSize: '.75rem',
                fontWeight: 800,
                padding: '.25rem .6rem',
                borderRadius: '999px',
                background: res.nivelPct > 1 ? 'rgba(239,68,68,0.2)' : res.nivelPct >= 1 ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.15)',
                color: colorNivel,
                border: `1px solid ${colorNivel}`,
              }}
            >
              {res.estado}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: '2.4rem', fontWeight: 900, color: colorNivel, lineHeight: 1 }}>
              {fmtNum(res.volumenLitros)}
            </span>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-muted)' }}>LITROS</span>
            <span className="muted" style={{ fontSize: '1rem', marginLeft: 'auto' }}>
              ≈ {fmtNum(res.volumenM3, 3)} m³
            </span>
          </div>

          {/* Barra de progreso de nivel */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.3rem' }}>
              <span>Nivel de llenado: <strong>{fmtNum(res.nivelPct * 100, 1)} %</strong></span>
              <span>Capacidad 100%: <strong>{fmtNum(res.capacidad100Litros, 0)} L</strong></span>
            </div>
            <div
              style={{
                width: '100%',
                height: '14px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '7px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${pctVisual}%`,
                  height: '100%',
                  background: colorNivel,
                  transition: 'width .2s ease, background .2s ease',
                  borderRadius: '7px',
                }}
              />
            </div>
          </div>

          {/* Ficha técnica compacta */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '.5rem',
              marginTop: '1rem',
              paddingTop: '.75rem',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: '.78rem',
            }}
          >
            <div>
              <span className="muted">Altura 100%:</span>{' '}
              <strong>{res.altura100Cm} cm ({fmtNum(res.altura100Cm / 100, 2)} m)</strong>
            </div>
            <div>
              <span className="muted">Altura máx (200%):</span>{' '}
              <strong>{res.altura200Cm} cm ({fmtNum(res.altura200Cm / 100, 2)} m)</strong>
            </div>
            <div>
              <span className="muted">Geometría:</span>{' '}
              <strong>{TANQUES_CALCULADORA[tanqueClave].tipoGeometria === 'cilindrico_horizontal' ? 'Cilíndrico' : 'Rectangular'}</strong>
            </div>
          </div>
        </div>

        {/* Tabulador desplegable (varilla cm a litros) */}
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setVerTabulador(!verTabulador)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {verTabulador ? '▲ Ocultar tabulador de varilla' : '▼ 📋 Ver tabulador de varilla (cm → Litros)'}
          </button>

          {verTabulador && (
            <div
              style={{
                marginTop: '.5rem',
                background: 'var(--card-bg, #1e293b)',
                borderRadius: '8px',
                border: '1px solid var(--border, #334155)',
                padding: '.75rem',
              }}
            >
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input input-sm"
                  placeholder="Buscar cm o litros en la tabla…"
                  value={filtroTabulador}
                  onChange={(e) => setFiltroTabulador(e.target.value)}
                  style={{ flex: 1 }}
                />
                {filtroTabulador && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltroTabulador('')}>
                    ✕
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '.8rem', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>CM</th>
                      <th style={{ textAlign: 'right' }}>Litros</th>
                      <th style={{ textAlign: 'right' }}>% Lleno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaFiltrada.slice(0, 200).map((fila) => {
                      const esActual = fila.cm === Math.round(alturaNum);
                      return (
                        <tr
                          key={fila.cm}
                          onClick={() => setAlturaStr(String(fila.cm))}
                          style={{
                            cursor: 'pointer',
                            background: esActual ? 'rgba(56, 189, 248, 0.2)' : undefined,
                            fontWeight: esActual ? 700 : undefined,
                          }}
                        >
                          <td style={{ textAlign: 'center' }} className="mono">{fila.cm}</td>
                          <td style={{ textAlign: 'right' }} className="mono">{fmtNum(fila.litros, 1)} L</td>
                          <td style={{ textAlign: 'right' }} className="mono">{fmtNum(fila.pct * 100, 1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
