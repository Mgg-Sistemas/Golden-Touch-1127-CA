/* ============================================================
   Golden Touch · Inventario · Productos dados de baja
   ------------------------------------------------------------
   El inventario muestra SOLO productos activos: uno dado de baja
   no aparece en la lista, ni en los almacenes, ni en el buscador
   global. Mientras siga inactivo, para el sistema no existe.

   Esta pantalla es la única puerta que queda, y sirve para dos
   cosas: consultar qué se dio de baja (con la fecha y el autor,
   que sella un trigger de la base) y volver a activarlo.
   ============================================================ */
import { useMemo, useState } from 'react';
import { ConfirmDialog, Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { dateTime, num } from '@/shared/lib/format';
import { norm } from '@/shared/lib/texto';
import type { Producto } from '@/shared/lib/types';

interface Props {
  /** TODOS los productos de la página; acá se quedan solo los inactivos. */
  productos: Producto[];
  canWrite: boolean;
  /** Reactivar. La página se encarga de recargar y avisar. */
  onActivar: (p: Producto) => Promise<void> | void;
  onClose: () => void;
}

/** Todas las características del producto en un solo texto, para buscar sobre
 *  cualquiera de ellas: código, nombre, alias, marca, modelo, serial, número,
 *  medida, categoría, descripción, ubicación y el correo de quien lo dio de baja. */
function caracteristicas(p: Producto): string {
  return [
    p.sku, p.nombre, p.nombre_busqueda, p.marca, p.modelo, p.serial, p.codigo,
    p.numero, p.unidad, p.categoria, p.descripcion, p.ubicacion, p.desactivado_por,
  ].map((c) => norm(String(c ?? ''))).join(' ');
}

const SIN_DATO = '—';

export function ProductosInactivosModal({ productos, canWrite, onActivar, onClose }: Props) {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidad, setUnidad] = useState('');
  const [autor, setAutor] = useState('');
  const [conStock, setConStock] = useState(false);
  const [confirmar, setConfirmar] = useState<Producto | null>(null);
  const [activando, setActivando] = useState<string | null>(null);

  const inactivos = useMemo(
    () => productos
      .filter((p) => p.estado === 'inactivo')
      .sort((a, b) => (b.desactivado_at ?? '').localeCompare(a.desactivado_at ?? '')),
    [productos],
  );

  // Las opciones salen de los propios inactivos: no tiene sentido ofrecer una
  // categoría en la que no hay ninguno dado de baja.
  const categorias = useMemo(
    () => [...new Set(inactivos.map((p) => p.categoria).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [inactivos],
  );
  const unidades = useMemo(
    () => [...new Set(inactivos.map((p) => p.unidad).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [inactivos],
  );
  const autores = useMemo(
    () => [...new Set(inactivos.map((p) => p.desactivado_por).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [inactivos],
  );

  const filtrados = useMemo(() => {
    const q = norm(texto);
    const tokens = q.split(/\s+/).filter(Boolean);
    return inactivos.filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      if (unidad && p.unidad !== unidad) return false;
      if (autor === '__sin__' ? !!p.desactivado_por : autor && p.desactivado_por !== autor) return false;
      if (conStock && (Number(p.stock) || 0) <= 0) return false;
      if (!tokens.length) return true;
      const heno = caracteristicas(p);
      return tokens.every((t) => heno.includes(t));
    });
  }, [inactivos, texto, categoria, unidad, autor, conStock]);

  // Un producto de baja CON stock es el caso delicado: el kardex sigue diciendo
  // que hay material, pero ninguna pantalla lo muestra. Conviene verlo de una.
  const conSaldo = useMemo(
    () => inactivos.filter((p) => (Number(p.stock) || 0) > 0).length,
    [inactivos],
  );

  const hayFiltro = !!(texto.trim() || categoria || unidad || autor || conStock);

  async function activar(p: Producto) {
    setConfirmar(null);
    setActivando(p.id);
    try {
      await onActivar(p);
    } finally {
      setActivando(null);
    }
  }

  return (
    <>
      <Modal title="Productos inactivos" size="xl" onClose={onClose}>
        <p className="muted" style={{ marginTop: 0, fontSize: '.84rem' }}>
          Estos productos <strong>no existen para el sistema</strong> mientras sigan de baja: no salen
          en el inventario, ni en los almacenes, ni en el buscador, ni en ninguna solicitud. Su historial
          y sus movimientos quedan intactos. Al activarlos vuelven a aparecer en todas partes.
        </p>

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.6rem' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="🔎 Buscar por código, nombre, marca, modelo, serial, medida, ubicación…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <select className="select" style={{ maxWidth: 200 }} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 150 }} value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            <option value="">Toda medida</option>
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 220 }} value={autor} onChange={(e) => setAutor(e.target.value)}>
            <option value="">Cualquiera lo dio de baja</option>
            {autores.map((a) => <option key={a} value={a}>{a}</option>)}
            <option value="__sin__">Sin registro de quién</option>
          </select>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.8rem', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={conStock} onChange={(e) => setConStock(e.target.checked)} />
            Solo con saldo
          </label>
          {hayFiltro && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => { setTexto(''); setCategoria(''); setUnidad(''); setAutor(''); setConStock(false); }}
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        <div className="muted" style={{ fontSize: '.78rem', marginBottom: '.5rem' }}>
          {filtrados.length} de {inactivos.length} dado(s) de baja
          {conSaldo > 0 && (
            <> · <strong style={{ color: 'var(--warning, #f59e0b)' }}>{conSaldo} todavía con saldo en el kardex</strong></>
          )}
        </div>

        {!inactivos.length ? (
          <EmptyState message="No hay productos dados de baja." icon="✓" />
        ) : !filtrados.length ? (
          <EmptyState message="Ningún producto de baja coincide con lo que buscás." icon="◇" />
        ) : (
          <div style={{ maxHeight: 'min(52vh, 460px)', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th>Dado de baja</th>
                  <th>Por</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const saldo = Number(p.stock) || 0;
                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.sku}</td>
                      <td>
                        <div>{p.nombre}</div>
                        {(p.marca || p.modelo || p.ubicacion) && (
                          <div className="muted" style={{ fontSize: '.74rem' }}>
                            {[p.marca, p.modelo, p.ubicacion].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="muted">{p.categoria}</td>
                      <td className="mono" style={{ textAlign: 'right', color: saldo > 0 ? 'var(--warning, #f59e0b)' : undefined }}>
                        {num(saldo)} {p.unidad}
                      </td>
                      <td className="muted" style={{ fontSize: '.8rem' }}>
                        {p.desactivado_at ? dateTime(p.desactivado_at) : SIN_DATO}
                      </td>
                      <td className="muted" style={{ fontSize: '.8rem' }}>
                        {p.desactivado_por ?? (
                          <span title="Antes del 09/09/2026 el sistema no guardaba quién daba de baja un producto.">
                            sin registro
                          </span>
                        )}
                      </td>
                      {canWrite && (
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={activando === p.id}
                            onClick={() => setConfirmar(p)}
                            title="Volver a poner este producto en el inventario"
                          >
                            {activando === p.id ? 'Activando…' : '↺ Activar'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {confirmar && (
        <ConfirmDialog
          title="Activar producto"
          message={`¿Confirmas activar "${confirmar.nombre}" (${confirmar.sku})? Vuelve al inventario, a los almacenes y al buscador${(Number(confirmar.stock) || 0) > 0 ? `, con su saldo de ${num(Number(confirmar.stock) || 0)} ${confirmar.unidad}` : ''}.`}
          confirmText="Activar"
          onCancel={() => setConfirmar(null)}
          onConfirm={() => void activar(confirmar)}
        />
      )}
    </>
  );
}
