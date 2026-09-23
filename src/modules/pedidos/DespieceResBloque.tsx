/* ============================================================
   Golden Touch · Despiece de la res en canal, al confirmar la recepción

   Se compra «RES EN CANAL» pero al almacén no entra una res: entran los cortes.
   Este bloque aparece solo, dentro del modal de recepción, cuando uno de los
   renglones de la orden es una res en canal, y pregunta lo único que el sistema
   no puede adivinar: en qué se convirtió.

   La cuenta que vigila la pantalla es una sola —cortes + merma = kilos de canal
   recibidos— y hasta que no cuadre no deja confirmar. El precio no se pregunta:
   sale de lo que se pagó por la res (ver `despieceRes.ts`).
   ============================================================ */
import { useMemo } from 'react';
import type { ItemOrden, Producto } from '@/shared/lib/types';
import { money, num } from '@/shared/lib/format';
import { norm } from '@/shared/lib/texto';
import {
  CORTES_SUGERIDOS, calcularDespiece, cortesListos, erroresDespiece,
  mermaQueCuadra, nombreCorte, type EstadoDespiece, type RenglonCorte,
} from './despieceRes';

export function DespieceResBloque({ item, kgRecibidos, productos, valor, onChange }: {
  item: ItemOrden;
  kgRecibidos: number;
  productos: Producto[];
  valor: EstadoDespiece;
  onChange: (v: EstadoDespiece) => void;
}) {
  // Sugerencias del desplegable: los productos de la MISMA categoría que la res
  // (los víveres, no todo el inventario) más los tres cortes de siempre. Se puede
  // escribir cualquier otro: el que se escriba se crea al confirmar.
  const sugerencias = useMemo(() => {
    const canal = productos.find((p) => p.id === item.productoId);
    const mismos = productos
      .filter((p) => p.estado === 'activo' && p.id !== item.productoId && (!canal || p.categoria === canal.categoria))
      .map((p) => p.nombre);
    return [...new Set([...CORTES_SUGERIDOS, ...mismos])].sort((a, b) => a.localeCompare(b, 'es'));
  }, [productos, item.productoId]);

  // Nombre normalizado → producto, para casar lo tecleado con el inventario y no
  // crear un duplicado de algo que ya existe.
  const porNombre = useMemo(() => {
    const m = new Map<string, Producto>();
    productos.forEach((p) => { if (!m.has(norm(p.nombre))) m.set(norm(p.nombre), p); });
    return m;
  }, [productos]);

  const cortes = cortesListos(valor.cortes);
  const calc = calcularDespiece({
    kgCanal: kgRecibidos, precioCanal: Number(item.precio) || 0,
    cortes, merma: Number(valor.merma) || 0,
  });
  const problemas = erroresDespiece({
    kgCanal: kgRecibidos, precioCanal: Number(item.precio) || 0,
    cortes, merma: Number(valor.merma) || 0,
  });

  function setCorte(key: number, patch: Partial<RenglonCorte>) {
    onChange({ ...valor, cortes: valor.cortes.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  }
  function setNombre(key: number, nombre: string) {
    const p = porNombre.get(norm(nombre));
    setCorte(key, { nombre, productoId: p?.id ?? null });
  }
  function agregar() {
    const key = Math.max(0, ...valor.cortes.map((c) => c.key)) + 1;
    onChange({ ...valor, cortes: [...valor.cortes, { key, nombre: '', kg: '' }] });
  }
  function quitar(key: number) {
    onChange({ ...valor, cortes: valor.cortes.filter((c) => c.key !== key) });
  }
  function cuadrarMerma() {
    onChange({ ...valor, merma: String(mermaQueCuadra(kgRecibidos, cortes)) });
  }

  const listaId = `cortes-${item.sku}`;

  return (
    <div className="card" style={{ marginTop: '.75rem', borderColor: 'var(--primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '.4rem' }}>
        <strong style={{ fontSize: '.92rem' }}>🥩 Despiece de {item.nombre}</strong>
        <span className="muted mono" style={{ fontSize: '.8rem' }}>
          {num(kgRecibidos)} kg recibidos · {money(Number(item.precio) || 0)}/kg
        </span>
      </div>
      <p className="muted" style={{ margin: '.3rem 0 .6rem', fontSize: '.82rem' }}>
        La res <strong>no queda en el inventario</strong>: entra cada corte por su nombre y su peso.
        Los kilos de los cortes más la <strong>merma</strong> tienen que dar los {num(kgRecibidos)} kg recibidos.
        Si el corte no existe todavía, escribilo: <strong>se crea con ese nombre</strong>.
      </p>

      <datalist id={listaId}>
        {sugerencias.map((s) => <option key={s} value={s} />)}
      </datalist>

      <div className="table-wrap">
        <table className="table" style={{ fontSize: '.85rem' }}>
          <thead>
            <tr>
              <th>Corte (entra al inventario con este nombre)</th>
              <th style={{ textAlign: 'right', width: 110 }}>Kg</th>
              <th style={{ width: 90 }}>En inventario</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {valor.cortes.map((c) => {
              const existe = !!porNombre.get(norm(c.nombre));
              return (
                <tr key={c.key}>
                  <td>
                    <input className="input" list={listaId} value={c.nombre}
                      onChange={(e) => setNombre(c.key, e.target.value)}
                      placeholder="CARNE MECHADA, COSTILLA, HUESO BLANCO…"
                      onBlur={(e) => setNombre(c.key, nombreCorte(e.target.value))} />
                  </td>
                  <td>
                    <input className="input mono" type="number" min={0} step="any" value={c.kg}
                      onChange={(e) => setCorte(c.key, { kg: e.target.value })}
                      style={{ textAlign: 'right' }} />
                  </td>
                  <td>
                    {!nombreCorte(c.nombre) ? <span className="muted">—</span>
                      : existe ? <span className="badge success">Ya existe</span>
                      : <span className="badge warning">Nuevo</span>}
                  </td>
                  <td className="actions">
                    {valor.cortes.length > 1 && (
                      <button type="button" className="btn btn-sm btn-ghost" title="Quitar este corte"
                        onClick={() => quitar(c.key)}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '.5rem' }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={agregar}>+ Añadir corte</button>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ fontSize: '.72rem' }}>Merma (kg) · hueso, grasa, recorte</label>
          <input className="input mono" type="number" min={0} step="any" value={valor.merma}
            onChange={(e) => onChange({ ...valor, merma: e.target.value })}
            style={{ width: 120, textAlign: 'right' }} />
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={cuadrarMerma}
          title="Pone en la merma los kilos que faltan para llegar a la canal">⚖ Cuadrar merma</button>
      </div>

      <div className="card" style={{ margin: '.6rem 0 0', padding: '.55rem .75rem', background: 'var(--bg-1)' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.82rem' }}>
          <span>Cortes <strong className="mono">{num(calc.kgCortes)} kg</strong></span>
          <span>Merma <strong className="mono">{num(calc.merma)} kg</strong></span>
          <span style={{ color: calc.cuadra ? 'var(--success)' : 'var(--warning)' }}>
            Sin asignar <strong className="mono">{num(calc.sinAsignar)} kg</strong>
          </span>
          <span>Rendimiento <strong className="mono">{num(calc.rendimientoPct)} %</strong></span>
          <span style={{ marginLeft: 'auto' }}>
            Cada kg de corte entra a <strong className="mono">{money(calc.costoPorKgCorte)}</strong>
          </span>
        </div>
        <small className="muted" style={{ display: 'block', marginTop: '.3rem' }}>
          La merma no entra al inventario, pero <strong>lo que costó lo pagan los cortes</strong>: los {money(calc.costoTotal)} de
          la res se reparten entre los {num(calc.kgCortes)} kg que sí quedan.
        </small>
      </div>

      {problemas.length > 0 && (
        <div className="card" style={{ margin: '.5rem 0 0', borderColor: 'var(--warning)', padding: '.55rem .75rem' }}>
          {problemas.map((p) => <div key={p} style={{ fontSize: '.82rem' }}>⚠ {p}</div>)}
        </div>
      )}
    </div>
  );
}
