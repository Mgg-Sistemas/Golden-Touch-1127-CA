import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { HBarChart, type ChartPoint } from '@/shared/ui/Chart';
import { money, num } from '@/shared/lib/format';
import { useRealtime } from '@/shared/lib/useRealtime';
import { norm } from '@/shared/lib/texto';

/** Una fila de consumo: un producto/combustible consumido en el período. */
export interface ConsumoRow {
  id: string;
  label: string;        // nombre visible
  sub?: string;         // sub-etiqueta (SKU, etc.)
  unidad: string;       // und / Lt / KG…
  cantidad: number;     // cantidad consumida (en su unidad)
  valor: number;        // equivalente en $ (cantidad × costo)
  horas?: number;       // horas trabajadas (opcional)
}

type Preset = 'hoy' | '7d' | '15d' | 'mes' | 'rango';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '15d', label: '15 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'rango', label: 'Rango' },
];

function isoDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
}

/** Rango [desde, hasta] de un preset (hasta = ahora). */
function rangoDePreset(preset: Preset, desdeStr: string, hastaStr: string): { desde: Date; hasta: Date } {
  const ahora = new Date();
  if (preset === 'rango') {
    return {
      desde: new Date(`${desdeStr}T00:00:00`),
      hasta: new Date(`${hastaStr}T23:59:59`),
    };
  }
  const desde = new Date();
  if (preset === 'hoy') desde.setHours(0, 0, 0, 0);
  else if (preset === '7d') desde.setDate(desde.getDate() - 7);
  else if (preset === '15d') desde.setDate(desde.getDate() - 15);
  else if (preset === 'mes') { desde.setDate(1); desde.setHours(0, 0, 0, 0); }
  return { desde, hasta: ahora };
}

/**
 * Modal genérico de "Consumo": filtra por período (día, 7/15 días, mes o rango),
 * muestra una barra por cada producto/combustible consumido y una tabla con la
 * cantidad y su equivalente en $. Lo usan Inventario (por almacén) y Combustible.
 */
export function ConsumoChartModal({ title, subtitle, cargar, onClose, realtimeTables, permitirHoras, onAbrirReporte }: {
  title: string;
  subtitle?: string;
  cargar: (desde: Date, hasta: Date) => Promise<ConsumoRow[]>;
  onClose: () => void;
  /** Tablas a vigilar en vivo: si cambian (alta/edición/baja), se recarga el consumo. */
  realtimeTables?: string[];
  /** Si es true, añade la métrica "Horas trabajadas", KPI de horas y columna en tabla. */
  permitirHoras?: boolean;
  /** Acción para abrir el reporte de combustible desde este modal. */
  onAbrirReporte?: (rango: { desde: Date; hasta: Date }) => void;
}) {
  const hoy = isoDay(new Date());
  const [preset, setPreset] = useState<Preset>('15d');
  const [desdeStr, setDesdeStr] = useState(hoy);
  const [hastaStr, setHastaStr] = useState(hoy);
  const [metrica, setMetrica] = useState<'valor' | 'cantidad' | 'horas'>('valor');
  const [rows, setRows] = useState<ConsumoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  // `cargar` suele llegar como arrow inline (nueva referencia en cada render).
  // Lo guardamos en un ref para que NO entre en las deps del efecto y evitar un
  // loop infinito de recargas (el modal quedaba en blanco / cargando sin fin).
  const cargarRef = useRef(cargar);
  useEffect(() => { cargarRef.current = cargar; });

  const recargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { desde, hasta } = rangoDePreset(preset, desdeStr, hastaStr);
      const data = await cargarRef.current(desde, hasta);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el consumo');
      setRows([]);
    } finally { setLoading(false); }
  }, [preset, desdeStr, hastaStr]);
  useEffect(() => { void recargar(); }, [recargar]);
  // En vivo: si cambian las tablas indicadas (p. ej. movimientos de combustible),
  // se recarga el consumo para que eliminar/editar se refleje sin cerrar el modal.
  useRealtime(realtimeTables ?? [], () => { void recargar(); }, { enabled: !!realtimeTables?.length });

  // Buscador y ordenamiento según la métrica activa
  const sorted = useMemo(() => {
    const s = norm(q);
    const base = !s
      ? rows
      : rows.filter((r) => norm(r.label).includes(s) || norm(r.sub).includes(s));

    return base.slice().sort((a, b) => {
      if (metrica === 'horas') return (b.horas ?? 0) - (a.horas ?? 0);
      if (metrica === 'cantidad') return b.cantidad - a.cantidad;
      return b.valor - a.valor;
    });
  }, [rows, q, metrica]);

  const totalCantidad = sorted.reduce((a, r) => a + r.cantidad, 0);
  const totalValor = sorted.reduce((a, r) => a + r.valor, 0);
  const totalHoras = sorted.reduce((a, r) => a + (r.horas ?? 0), 0);

  const data: ChartPoint[] = useMemo(
    () => sorted.map((r) => {
      let val = 0;
      if (metrica === 'valor') val = Math.round(r.valor * 100) / 100;
      else if (metrica === 'cantidad') val = r.cantidad;
      else val = Math.round((r.horas ?? 0) * 10) / 10;

      const horasTxt = r.horas != null && r.horas > 0 ? ` · ${num(r.horas)} h` : '';
      return {
        label: r.label,
        value: val,
        tooltip: `${r.label}: ${num(r.cantidad)} ${r.unidad} · ${money(r.valor)}${horasTxt}`,
      };
    }),
    [sorted, metrica],
  );

  return (
    <Modal
      title={title}
      size="xl"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
          {onAbrirReporte ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const { desde, hasta } = rangoDePreset(preset, desdeStr, hastaStr);
                onAbrirReporte({ desde, hasta });
              }}
              title="Descargar reporte de combustible (PDF, Excel, CSV) con filtros avanzados"
            >
              📄 Descargar reporte (PDF / Excel / CSV)
            </button>
          ) : <span />}
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      }
    >
      {subtitle && <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>{subtitle}</p>}

      {/* Filtros de período y selector de métricas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center', marginBottom: '.6rem' }}>
        {PRESETS.map((p) => (
          <button key={p.key} className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPreset(p.key)}>{p.label}</button>
        ))}
        {preset === 'rango' && (
          <span style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
            <input className="input" type="date" value={desdeStr} max={hastaStr} onChange={(e) => setDesdeStr(e.target.value)} style={{ width: 150 }} />
            <span className="muted">→</span>
            <input className="input" type="date" value={hastaStr} min={desdeStr} max={hoy} onChange={(e) => setHastaStr(e.target.value)} style={{ width: 150 }} />
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '.3rem', alignItems: 'center' }}>
          {onAbrirReporte && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{
                borderColor: 'var(--primary, #f97316)',
                color: 'var(--primary, #f97316)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.3rem',
                marginRight: '.3rem',
              }}
              onClick={() => {
                const { desde, hasta } = rangoDePreset(preset, desdeStr, hastaStr);
                onAbrirReporte({ desde, hasta });
              }}
              title="Descargar reporte institucional de combustible en PDF, Excel o CSV"
            >
              📄 Descargar reporte
            </button>
          )}
          <button
            className={`btn btn-sm ${metrica === 'valor' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMetrica('valor')}
          >
            Valor ($)
          </button>
          {permitirHoras && (
            <button
              className={`btn btn-sm ${metrica === 'horas' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMetrica('horas')}
              title="Cantidad de horas trabajadas por máquina"
            >
              Horas trabajadas
            </button>
          )}
          <button
            className={`btn btn-sm ${metrica === 'cantidad' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMetrica('cantidad')}
          >
            Cantidad
          </button>
        </span>
      </div>

      {/* Buscador por nombre */}
      <div style={{ position: 'relative', marginBottom: '.6rem' }}>
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Buscar…" style={{ width: '100%', paddingRight: q ? '1.8rem' : undefined }} />
        {q && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQ('')} title="Limpiar búsqueda"
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '0 .3rem', lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Totales */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${permitirHoras ? '120px' : '140px'}, 1fr))`, gap: '.6rem', marginBottom: '.75rem' }}>
        <div className="card" style={{ margin: 0, padding: '.55rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.68rem' }}>{permitirHoras ? 'EQUIPOS' : 'PRODUCTOS CONSUMIDOS'}</div>
          <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{num(sorted.length)}</div>
        </div>
        <div className="card" style={{ margin: 0, padding: '.55rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.68rem' }}>CANTIDAD TOTAL</div>
          <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{num(totalCantidad)} {sorted[0]?.unidad || ''}</div>
        </div>
        <div className="card" style={{ margin: 0, padding: '.55rem .8rem' }}>
          <div className="muted" style={{ fontSize: '.68rem' }}>VALOR TOTAL ($)</div>
          <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-3)' }}>{money(totalValor)}</div>
        </div>
        {permitirHoras && (
          <div className="card" style={{ margin: 0, padding: '.55rem .8rem' }}>
            <div className="muted" style={{ fontSize: '.68rem' }}>HORAS TRABAJADAS TOTAL</div>
            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>{num(totalHoras)} h</div>
          </div>
        )}
      </div>

      {error && <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.6rem' }}><strong>Error:</strong> {error}</div>}

      {/* Gráfica por producto / equipo */}
      <div className="card" style={{ padding: '.8rem', marginBottom: '.75rem' }}>
        <div className="card-title" style={{ marginBottom: '.4rem' }}>
          <span>
            Consumo por {permitirHoras ? 'equipo' : 'producto'}{' '}
            {metrica === 'valor' ? '(en $)' : metrica === 'horas' ? '(en horas trabajadas)' : '(en cantidad)'}
          </span>
          <span className="muted mono" style={{ fontSize: '.78rem' }}>{loading ? 'cargando…' : `${sorted.length} ${permitirHoras ? 'equipo(s)' : 'producto(s)'}`}</span>
        </div>
        <HBarChart
          data={data}
          yFormatter={(v) => (metrica === 'valor' ? money(v) : metrica === 'horas' ? `${num(v)} h` : num(v))}
          emptyMessage={loading ? 'Cargando…' : 'Sin consumo en el período seleccionado.'}
        />
      </div>

      {/* Tabla detalle */}
      <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
        <table className="table" style={{ fontSize: '.84rem' }}>
          <thead>
            <tr>
              <th>{permitirHoras ? 'Equipo' : 'Producto'}</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              {permitirHoras && <th style={{ textAlign: 'right' }}>Horas Trab.</th>}
              <th style={{ textAlign: 'right' }}>Valor ($)</th>
            </tr>
          </thead>
          <tbody>
            {!sorted.length && (
              <tr>
                <td colSpan={permitirHoras ? 4 : 3} className="muted" style={{ textAlign: 'center' }}>
                  {loading ? 'Cargando…' : 'Sin consumo en el período.'}
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{r.label}{r.sub ? <span className="muted mono" style={{ fontSize: '.72rem' }}> · {r.sub}</span> : null}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(r.cantidad)} {r.unidad}</td>
                {permitirHoras && (
                  <td className="mono" style={{ textAlign: 'right', color: r.horas ? '#38bdf8' : undefined }}>
                    {r.horas != null && r.horas > 0 ? `${num(r.horas)} h` : '-'}
                  </td>
                )}
                <td className="mono" style={{ textAlign: 'right' }}>{money(r.valor)}</td>
              </tr>
            ))}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>TOTAL</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(totalCantidad)}</td>
                {permitirHoras && (
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>{num(totalHoras)} h</td>
                )}
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-3)' }}>{money(totalValor)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}
