import { useEffect, useState } from 'react';
import type { TasaHoy } from '@/shared/lib/types';
import { getTasaHoy } from './tasas.repository';
import { HistorialTasasModal } from './HistorialTasasModal';

/** Tasa (Bs por unidad) con 2 decimales, es-VE. */
function r2(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fecha corta DD MMM (es-VE, Caracas). */
function fechaCorta(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', timeZone: 'America/Caracas' }).format(new Date(`${iso}T12:00:00`));
  } catch { return iso; }
}

/** Chip de tasas BCV (USD/EUR del día) en el navbar. Clic → Historial de Tasas. */
export function TasaChip() {
  const [tasa, setTasa] = useState<TasaHoy | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTasaHoy().then((t) => { if (!cancelled) setTasa(t); }).catch(() => { /* offline / sin desplegar */ });
    return () => { cancelled = true; };
  }, []);

  if (!tasa || tasa.usd == null) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Tasa BCV (Bs por unidad) · ${tasa.fecha ?? ''} · clic para ver el historial`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '.5rem',
          background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
          padding: '.35rem .6rem', borderRadius: 'var(--r-md)', cursor: 'pointer',
          fontSize: '.8rem', lineHeight: 1, whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: 'var(--brand, #ff8a00)', fontWeight: 700 }}>BCV</span>
        <span className="mono">$ {r2(tasa.usd)}</span>
        {tasa.eur != null && <span className="mono">€ {r2(tasa.eur)}</span>}
        <span className="muted" style={{ fontSize: '.7rem' }}>{fechaCorta(tasa.fecha)}</span>
      </button>
      {open && <HistorialTasasModal tasaHoy={tasa} onClose={() => setOpen(false)} onRefreshed={setTasa} />}
    </>
  );
}
