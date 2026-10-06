/* ============================================================
   Golden Touch · Recepción · «Marca / Modelo recibido» (06/10/2026)

   Debajo del producto, en cada renglón de la recepción: dos campos llenos
   con lo que se PIDIÓ. Si llegó otra marca similar, se corrige aquí y eso
   es lo que entra al inventario; la orden queda con «llegó otra marca».
   Lo usan las dos pantallas de recepción (Compras e Inventario).
   ============================================================ */
import { useState } from 'react';
import type { ItemOrden } from '@/shared/lib/types';
import { cambioDeMarca, marcaRecibida } from '@/shared/lib/marcaModelo';

export interface MarcaEscrita { marca: string; modelo: string }

/** Estado de las marcas recibidas por SKU, arrancando con lo pedido. */
export function useMarcasRecibidas(items: ItemOrden[]) {
  const [marcas, setMarcas] = useState<Record<string, MarcaEscrita>>(() => {
    const m: Record<string, MarcaEscrita> = {};
    items.forEach((it) => { m[it.sku] = { marca: it.marca ?? '', modelo: it.modelo ?? '' }; });
    return m;
  });
  const cambiar = (sku: string, v: MarcaEscrita) => setMarcas((m) => ({ ...m, [sku]: v }));
  return { marcas, cambiar };
}

export function MarcaRecibidaCampos({ item, valor, onChange }: {
  item: ItemOrden; valor: MarcaEscrita; onChange: (v: MarcaEscrita) => void;
}) {
  const cambio = cambioDeMarca(item, marcaRecibida(item, valor));
  const borde = cambio ? { borderColor: 'var(--warning)' } : undefined;
  return (
    <div style={{ marginTop: '.3rem' }}>
      <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
        <input className="input" name={`marca-rec-${item.sku}`} aria-label={`Marca recibida de ${item.nombre}`}
          value={valor.marca} onChange={(e) => onChange({ ...valor, marca: e.target.value })}
          placeholder="Marca recibida" style={{ flex: '1 1 110px', minWidth: 0, padding: '.25rem .45rem', fontSize: '.8rem', ...borde }} />
        <input className="input" name={`modelo-rec-${item.sku}`} aria-label={`Modelo recibido de ${item.nombre}`}
          value={valor.modelo} onChange={(e) => onChange({ ...valor, modelo: e.target.value })}
          placeholder="Modelo" style={{ flex: '1 1 90px', minWidth: 0, padding: '.25rem .45rem', fontSize: '.8rem', ...borde }} />
      </div>
      {cambio && (
        <small style={{ color: 'var(--warning)', display: 'block', marginTop: '.2rem', fontSize: '.74rem' }}>
          ⚠ Llegó otra marca · {cambio}. Se avisa a Compras.
        </small>
      )}
    </div>
  );
}
