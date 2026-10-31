import { useRef, useState } from 'react';
import { toast } from '@/shared/ui/Toast';
import { SearchSelect, type SearchOption } from '@/shared/ui/SearchSelect';
import type { ItemOrden } from '@/shared/lib/types';
import { createProducto, nextSku, buscarProductosParecidos, type ProductoParecido } from '@/modules/inventario/inventario.repository';
import { ProductoParecidoModal } from '@/modules/inventario/ProductoParecidoModal';
import { esCategoriaReal, MENSAJE_CATEGORIA_OBLIGATORIA } from '@/modules/inventario/categoriaReal';
import { CategoriaProductoSelect, asegurarCategoria } from '@/modules/inventario/CategoriaProductoSelect';
import type { ProductoAsignable } from './piezasMaquinaria';

/**
 * Celda de la cotización para un repuesto pedido desde Control de Maquinaria (30/10/2026):
 * la pieza llega con un nombre general y el analista le pone el producto del inventario
 * (buscador) o da de alta uno nuevo con el nombre que corresponde (stock 0, Inventario
 * General). Devuelve el producto con `onAsignar`; la regla de no repetir producto la
 * decide quien llama. Desde el 31/10/2026 también se usa para los renglones de una
 * Solicitud de Pedido con nombres genéricos (`etiqueta` lo distingue).
 */
export function PiezaProductoCelda({ item, opciones, porId, unidades, actorEmail, onAsignar, etiqueta }: {
  item: Pick<ItemOrden, 'nombre' | 'productoId' | 'nombre_solicitado' | 'unidad' | 'orden_servicio' | 'pieza_maquinaria'>;
  /** Rótulo de origen del renglón (por defecto «🚜 Repuesto de Maquinaria»). Sirve para
   *  reusar la celda en otras solicitudes con nombres generales (p. ej. SP de productos). */
  etiqueta?: string;
  opciones: SearchOption[];
  porId: Map<string, ProductoAsignable>;
  unidades: string[];
  actorEmail: string;
  /** Devuelve false si no se pudo poner (p. ej. el producto ya está en otro renglón). */
  onAsignar: (p: ProductoAsignable) => boolean;
}) {
  const sinProducto = !item.productoId;
  const [abierto, setAbierto] = useState(sinProducto);
  const [nuevo, setNuevo] = useState(false);
  // Un repuesto de Maquinaria arranca en REPUESTOS; un nombre genérico de una SP puede
  // ser cualquier cosa: la categoría se elige (no se adivina).
  const [categoria, setCategoria] = useState(item.pieza_maquinaria === true ? 'REPUESTOS' : '');
  const [unidad, setUnidad] = useState((item.unidad ?? '').trim() || 'und');
  const [creando, setCreando] = useState(false);
  const [parecidos, setParecidos] = useState<{ nombre: string; categoria: string; lista: ProductoParecido[] } | null>(null);
  // No controlado: un refresco en vivo del modal no corta lo que se está tecleando.
  const nombreRef = useRef<HTMLInputElement>(null);

  function elegir(id: string) {
    const p = porId.get(id);
    if (!p) return;
    if (onAsignar(p)) { setAbierto(false); setNuevo(false); }
  }

  async function crear() {
    const nombre = (nombreRef.current?.value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!nombre) { toast('Escribe el nombre del producto nuevo', 'error'); return; }
    const cat = categoria.trim().toUpperCase();
    if (!esCategoriaReal(cat)) { toast(MENSAJE_CATEGORIA_OBLIGATORIA, 'error'); return; }
    setCreando(true);
    try {
      const lista = await buscarProductosParecidos(nombre, cat);
      if (lista.length) { setParecidos({ nombre, categoria: cat, lista }); return; }
    } catch { /* si el buscador falla, se sigue con el alta */ } finally {
      setCreando(false);
    }
    await crearAhora(nombre, cat);
  }

  async function crearAhora(nombre: string, cat: string) {
    setCreando(true);
    try {
      const categoriaFinal = await asegurarCategoria(cat, actorEmail);
      const sku = await nextSku(categoriaFinal);
      const creado = await createProducto({
        sku, nombre, categoria: categoriaFinal, unidad: unidad.trim() || 'und',
        stock: 0, stock_min: 0, precio: 0, almacen: 'General', estado: 'activo',
      });
      toast(`Producto «${creado.nombre}» (${creado.sku}) dado de alta en el inventario`, 'success');
      setParecidos(null);
      if (onAsignar({ id: creado.id, sku: creado.sku, nombre: creado.nombre, unidad: creado.unidad })) { setAbierto(false); setNuevo(false); }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el producto', 'error');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div style={{ marginTop: '.25rem', display: 'grid', gap: '.25rem', minWidth: 220 }}>
      <div className="muted" style={{ fontSize: '.7rem' }}>
        {etiqueta ?? '🚜 Repuesto de Maquinaria'}{item.orden_servicio ? ` · ${item.orden_servicio}` : ''}
        {item.nombre_solicitado ? <> · pedido como «{item.nombre_solicitado}»</> : null}
      </div>
      {!abierto ? (
        <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center', fontSize: '.72rem' }}>
          <span style={{ color: 'var(--success)' }}>📦 Producto del inventario</span>
          <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .35rem', fontSize: '.7rem' }} onClick={() => setAbierto(true)}>Cambiar</button>
        </div>
      ) : (
        <>
          {sinProducto && (
            <div style={{ fontSize: '.72rem', color: 'var(--warning, #f59e0b)' }}>⚠️ Ponle el producto del inventario o crea uno nuevo</div>
          )}
          <SearchSelect value="" onChange={elegir} options={opciones}
            placeholder={opciones.length ? '🔍 Buscar en el inventario…' : '— sin productos —'} emptyText="No está: créalo con «+ Producto nuevo»" />
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .4rem', fontSize: '.72rem' }} onClick={() => setNuevo((v) => !v)}>
              {nuevo ? '× Cerrar' : '+ Producto nuevo'}
            </button>
            {!sinProducto && (
              <button type="button" className="btn btn-sm btn-ghost" style={{ padding: '0 .4rem', fontSize: '.72rem' }} onClick={() => { setAbierto(false); setNuevo(false); }}>Dejar como está</button>
            )}
          </div>
          {nuevo && (
            <div style={{ display: 'grid', gap: '.25rem', padding: '.35rem', border: '1px dashed var(--border, #2a3240)', borderRadius: 6 }}>
              <input ref={nombreRef} className="input" aria-label="Nombre del producto nuevo" placeholder="Nombre del producto"
                defaultValue={(item.nombre_solicitado ?? item.nombre ?? '').toUpperCase()} style={{ fontSize: '.78rem' }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crear(); } }} />
              <CategoriaProductoSelect value={categoria} onChange={setCategoria} />
              <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                <select className="input" aria-label="Unidad del producto nuevo" value={unidad} onChange={(e) => setUnidad(e.target.value)} style={{ fontSize: '.76rem', maxWidth: 110 }}>
                  {[...new Set([unidad, ...unidades])].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void crear()} disabled={creando}>
                  {creando ? 'Creando…' : 'Crear y usar'}
                </button>
              </div>
              <small className="muted" style={{ fontSize: '.66rem' }}>Entra al Inventario General con stock 0.</small>
            </div>
          )}
        </>
      )}
      {parecidos && (
        <ProductoParecidoModal
          nombreNuevo={parecidos.nombre}
          categoriaNueva={parecidos.categoria}
          unidadNueva={unidad}
          parecidos={parecidos.lista}
          creando={creando}
          onUsarExistente={(p) => { setParecidos(null); if (onAsignar({ id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad })) { setAbierto(false); setNuevo(false); } }}
          onCrearIgual={() => { void crearAhora(parecidos.nombre, parecidos.categoria); }}
          onClose={() => setParecidos(null)}
        />
      )}
    </div>
  );
}
