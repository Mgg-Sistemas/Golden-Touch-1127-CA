import { useMemo } from 'react';

export interface ChartPoint {
  label: string;
  value: number;
  tooltip?: string;
}

interface BaseProps {
  data: ChartPoint[];
  height?: number;
  color?: string;
  yFormatter?: (v: number) => string;
  emptyMessage?: string;
}

const PAD = { top: 14, right: 12, bottom: 36, left: 64 };

/** Devuelve los ticks redondeados para el eje Y. */
function buildTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const step = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  const norm = step / mag;
  const niceStep = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let i = 0; i <= count + 1; i++) {
    const t = niceStep * i;
    ticks.push(t);
    if (t >= max) break;
  }
  return ticks;
}

export function LineChart({ data, height = 220, color = '#ff8a00', yFormatter = String, emptyMessage }: BaseProps) {
  const width = 720; // viewBox; el SVG escala vía 100% width
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const { path, points, ticks, max } = useMemo(() => {
    if (!data.length) return { path: '', points: [] as Array<{ x: number; y: number; pt: ChartPoint }>, ticks: [0], max: 0 };
    const maxV = Math.max(1, ...data.map((d) => d.value));
    const tk = buildTicks(maxV);
    const scaledMax = Math.max(maxV, tk[tk.length - 1]);
    const stepX = data.length === 1 ? 0 : innerW / (data.length - 1);
    const pts = data.map((pt, i) => ({
      x: PAD.left + (data.length === 1 ? innerW / 2 : i * stepX),
      y: PAD.top + innerH - (pt.value / scaledMax) * innerH,
      pt,
    }));
    const p = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { path: p, points: pts, ticks: tk, max: scaledMax };
  }, [data, innerW, innerH]);

  if (!data.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        {emptyMessage ?? 'Sin datos para el periodo seleccionado.'}
      </div>
    );
  }

  const showEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Gráfica de líneas">
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke="rgba(226,232,240,0.18)" strokeDasharray="3,3" />
            <text x={PAD.left - 8} y={y + 4} fontSize="11" fontWeight="600" textAnchor="end" fill="#e2e8f0">{yFormatter(t)}</text>
          </g>
        );
      })}

      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <path
        d={`${path} L ${points[points.length - 1].x.toFixed(1)} ${PAD.top + innerH} L ${points[0].x.toFixed(1)} ${PAD.top + innerH} Z`}
        fill={color}
        opacity={0.08}
      />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color} />
          <title>{p.pt.tooltip ?? `${p.pt.label}: ${yFormatter(p.pt.value)}`}</title>
        </g>
      ))}

      {points.map((p, i) => (
        (i % showEvery === 0 || i === points.length - 1) && (
          <text key={`x${i}`} x={p.x} y={height - PAD.bottom + 18} fontSize="11" fontWeight="600" textAnchor="middle" fill="#e2e8f0">
            {p.pt.label}
          </text>
        )
      ))}
    </svg>
  );
}

/** Color por nivel (0% → rojo, 100% → verde), estilo semáforo suave. */
function colorEscala(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  const hue = Math.round((p / 100) * 130); // 0 rojo → 130 verde
  return `hsl(${hue}, 66%, 46%)`;
}

/**
 * Gráfica de barras HORIZONTALES tipo "píldora": una fila por ítem con la
 * etiqueta a la izquierda (legible, sin rotar), una barra redondeada cuyo largo
 * es proporcional al valor y un color por nivel (verde = mayor, rojo = menor).
 * Ideal cuando hay MUCHAS categorías (p. ej. vehículos): la lista hace scroll y
 * nunca se solapan los nombres.
 */
export function HBarChart({ data, color, yFormatter = String, emptyMessage }: BaseProps) {
  if (!data.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        {emptyMessage ?? 'Sin datos para el periodo seleccionado.'}
      </div>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  const BAR_H = 16;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem', maxHeight: 360, overflowY: 'auto', paddingRight: '.25rem' }}>
      {data.map((d, i) => {
        const pct = Math.max(0, Math.min(100, (d.value / max) * 100));
        const fondo = color ?? colorEscala(pct);
        return (
          <div
            key={i}
            title={d.tooltip ?? `${d.label}: ${yFormatter(d.value)}`}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 150px) 1fr auto', gap: '.55rem', alignItems: 'center' }}
          >
            <span style={{ fontSize: '.78rem', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.label}
            </span>
            <div style={{ height: BAR_H, borderRadius: 999, background: 'rgba(226,232,240,0.07)', border: '1px solid rgba(226,232,240,0.14)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${pct}%`,
                  minWidth: BAR_H,
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 55%), ${fondo}`,
                  boxShadow: 'inset 0 -1px 2px rgba(0,0,0,.2)',
                  transition: 'width .3s ease',
                }}
              />
            </div>
            <span className="mono" style={{ fontSize: '.78rem', fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
              {yFormatter(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BarChart({ data, height = 220, color = '#10b981', yFormatter = String, emptyMessage }: BaseProps) {
  const width = 720;

  // Cuando hay muchas barras o nombres largos, las etiquetas horizontales se
  // solapan: las rotamos a -35° y reservamos más espacio abajo. Así caben todas
  // y se leen sin encimarse.
  const rotar = data.length > 6 || data.some((d) => d.label.length > 6);
  const padBottom = rotar ? 80 : PAD.bottom;
  const H = rotar ? height + 48 : height;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - padBottom;

  const { bars, ticks, max } = useMemo(() => {
    if (!data.length) return { bars: [] as Array<{ x: number; y: number; w: number; h: number; pt: ChartPoint }>, ticks: [0], max: 0 };
    const maxV = Math.max(1, ...data.map((d) => d.value));
    const tk = buildTicks(maxV);
    const scaledMax = Math.max(maxV, tk[tk.length - 1]);
    const slot = innerW / data.length;
    const w = Math.max(8, slot * 0.7);
    const bs = data.map((pt, i) => {
      const x = PAD.left + slot * i + (slot - w) / 2;
      const h = (pt.value / scaledMax) * innerH;
      return {
        x,
        y: PAD.top + innerH - h,
        w,
        h,
        pt,
      };
    });
    return { bars: bs, ticks: tk, max: scaledMax };
  }, [data, innerW, innerH]);

  if (!data.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
        {emptyMessage ?? 'Sin datos para el periodo seleccionado.'}
      </div>
    );
  }

  // Rotadas caben todas; horizontales saltamos algunas para no encimarlas.
  const showEvery = rotar ? 1 : Math.max(1, Math.ceil(data.length / 10));
  const labelY = H - padBottom + (rotar ? 12 : 18);
  const labelSize = rotar ? 9.5 : 11;

  return (
    <svg viewBox={`0 0 ${width} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Gráfica de barras">
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={width - PAD.right} y2={y} stroke="rgba(226,232,240,0.18)" strokeDasharray="3,3" />
            <text x={PAD.left - 8} y={y + 4} fontSize="11" fontWeight="600" textAnchor="end" fill="#e2e8f0">{yFormatter(t)}</text>
          </g>
        );
      })}

      {bars.map((b, i) => {
        const cx = b.x + b.w / 2;
        const mostrar = i % showEvery === 0 || i === bars.length - 1;
        return (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={color} rx={3} />
            <title>{b.pt.tooltip ?? `${b.pt.label}: ${yFormatter(b.pt.value)}`}</title>
            {mostrar && (
              <text
                x={cx}
                y={labelY}
                fontSize={labelSize}
                fontWeight="600"
                textAnchor={rotar ? 'end' : 'middle'}
                fill="#e2e8f0"
                transform={rotar ? `rotate(-35 ${cx} ${labelY})` : undefined}
              >
                {b.pt.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
