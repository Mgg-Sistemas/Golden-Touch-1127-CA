import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { dosDecimales } from '@/shared/lib/format';
import type { Producto, RecetaFundicion } from '@/shared/lib/types';
import { RECETAS_FUNDICION } from '@/shared/lib/types';
import {
  addCategoria,
  addUnidad,
  getCategorias,
  getUnidades,
  siguienteSku,
  peekSku,
  nextSku,
  type ProductoInput,
} from './inventario.repository';
import { getNombresAlmacenes, crearAlmacen } from './almacenes.repository';

interface ProductoFormProps {
  producto: Producto | null; // null => crear
  productos?: Producto[];
  onClose: () => void;
  onSubmit: (data: ProductoInput) => Promise<void>;
}

interface FormState {
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: string;
  stock_min: string;
  precio: string;
  precio_venta: string;
  almacen: string;
  estado: 'activo' | 'inactivo';
  restock_pct: string;
  esReceta: boolean;
  receta_fundicion: RecetaFundicion | '';
  // Detalle del producto (opcional).
  nombre_busqueda: string;
  marca: string;
  modelo: string;
  serial: string;
  codigo: string;
  numero: string;
  descripcion: string;
  ubicacion: string;
}

function initialState(p: Producto | null, cats: string[], unids: string[]): FormState {
  return {
    sku: p?.sku ?? '',
    nombre: p?.nombre ?? '',
    categoria: p?.categoria ?? cats[0] ?? '',
    unidad: p?.unidad ?? unids[0] ?? '',
    stock: String(p?.stock ?? 0),
    stock_min: String(p?.stock_min ?? 0),
    precio: String(p?.precio ?? 0),
    precio_venta: p?.precio_venta != null ? String(p.precio_venta) : '',
    almacen: p?.almacen ?? 'General',
    estado: p?.estado ?? 'activo',
    restock_pct: p?.restock_pct != null ? String(p.restock_pct) : '',
    esReceta: !!p?.receta_fundicion,
    receta_fundicion: (p?.receta_fundicion ?? '') as RecetaFundicion | '',
    nombre_busqueda: p?.nombre_busqueda ?? '',
    marca: p?.marca ?? '',
    modelo: p?.modelo ?? '',
    serial: p?.serial ?? '',
    codigo: p?.codigo ?? '',
    numero: p?.numero ?? '',
    descripcion: p?.descripcion ?? '',
    ubicacion: p?.ubicacion ?? '',
  };
}

export function ProductoForm({ producto, productos = [], onClose, onSubmit }: ProductoFormProps) {
  const isEdit = !!producto;
  const [categorias, setCategorias] = useState<string[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [almacenesList, setAlmacenesList] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCategorias(productos), getUnidades(productos), getNombresAlmacenes(productos)])
      .then(([cats, unids, alms]) => {
        if (cancelled) return;
        setCategorias(cats);
        setUnidades(unids);
        setAlmacenesList(alms);
        // Defaults para producto nuevo: almacén y categoría al primero disponible.
        setForm((prev) => ({
          ...prev,
          almacen: prev.almacen || (alms[0] ?? 'General'),
          categoria: prev.categoria || (cats[0] ?? ''),
        }));
      })
      .catch(() => { /* defaults ya vienen del fallback en repo */ });
    return () => { cancelled = true; };
  }, [productos]);
  const [form, setForm] = useState<FormState>(() => initialState(producto, categorias, unidades));
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaUnid, setNuevaUnid] = useState('');
  const [nuevoAlmacen, setNuevoAlmacen] = useState('');
  // Carga por CAJA/BULTO: si la unidad es caja o bulto, el stock inicial se ingresa
  // en cajas/bultos y se multiplica por las unidades por bulto → se guarda en UNIDADES.
  const [undPorBulto, setUndPorBulto] = useState('');
  const esBulto = /caja|bulto/i.test(form.unidad);
  const stockBultos = Number(form.stock) || 0;
  const undXBulto = Number(undPorBulto) || 0;
  const totalUnidades = stockBultos * undXBulto;

  // El SKU se deriva de la categoría. Para no contaminar el prefijo con el propio
  // SKU del producto que se edita, lo excluimos del cálculo.
  const otrosProductos = useMemo(() => productos.filter((p) => p.id !== producto?.id), [productos, producto?.id]);
  const skuOriginal = producto?.sku ?? '';
  const catOriginal = producto?.categoria ?? '';
  // SKU automático según la categoría:
  //  · Producto NUEVO → siempre el siguiente correlativo de la categoría.
  //  · EDICIÓN → si se cambia la categoría, se regenera el SKU con el prefijo de la
  //    nueva categoría; si se vuelve a la categoría original, se restaura el SKU original.
  useEffect(() => {
    if (!form.categoria) return;
    // En edición, si se mantiene la categoría original, se conserva el SKU original.
    if (isEdit && form.categoria === catOriginal) {
      setForm((prev) => (prev.sku === skuOriginal ? prev : { ...prev, sku: skuOriginal }));
      return;
    }
    // Previsualización desde el contador PERSISTENTE (no reutiliza números). Si la
    // red falla, cae a la estimación local para no dejar el campo vacío.
    let cancel = false;
    peekSku(form.categoria, otrosProductos)
      .then((s) => { if (!cancel) setForm((prev) => (prev.sku === s ? prev : { ...prev, sku: s })); })
      .catch(() => { if (!cancel) setForm((prev) => ({ ...prev, sku: siguienteSku(prev.categoria, otrosProductos) })); });
    return () => { cancel = true; };
  }, [isEdit, form.categoria, otrosProductos, catOriginal, skuOriginal]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showReceta = useMemo(() => form.esReceta, [form.esReceta]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddCategoria() {
    const clean = nuevaCat.trim();
    if (!clean) { toast('Escribe un nombre para la categoría', 'error'); return; }
    // Sin duplicados por mayúsculas/minúsculas: si ya existe, la seleccionamos.
    const existente = categorias.find((c) => c.toLowerCase() === clean.toLowerCase());
    if (existente) {
      setForm((prev) => ({ ...prev, categoria: existente }));
      setNuevaCat('');
      toast(`La categoría "${existente}" ya existe — seleccionada`, 'info');
      return;
    }
    try {
      const added = await addCategoria(clean);
      if (!added) return;
      setCategorias((prev) => (prev.some((c) => c.toLowerCase() === added.toLowerCase()) ? prev : [...prev, added].sort((a, b) => a.localeCompare(b, 'es'))));
      setForm((prev) => ({ ...prev, categoria: added }));
      setNuevaCat('');
      toast(`Categoría "${added}" añadida`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo añadir la categoría', 'error');
    }
  }

  async function handleAddUnidad() {
    const clean = nuevaUnid.trim();
    if (!clean) { toast('Escribe un nombre para la unidad', 'error'); return; }
    // Sin duplicados por mayúsculas/minúsculas (ej. «kg» vs «Kg»): si ya existe, la seleccionamos.
    const existente = unidades.find((u) => u.toLowerCase() === clean.toLowerCase());
    if (existente) {
      setForm((prev) => ({ ...prev, unidad: existente }));
      setNuevaUnid('');
      toast(`La medida "${existente}" ya existe — seleccionada`, 'info');
      return;
    }
    try {
      const added = await addUnidad(clean);
      if (!added) return;
      setUnidades((prev) => (prev.some((u) => u.toLowerCase() === added.toLowerCase()) ? prev : [...prev, added].sort((a, b) => a.localeCompare(b, 'es'))));
      setForm((prev) => ({ ...prev, unidad: added }));
      setNuevaUnid('');
      toast(`Medida "${added}" añadida`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo añadir la medida', 'error');
    }
  }

  async function handleAddAlmacen() {
    const nombre = nuevoAlmacen.trim();
    if (!nombre) { toast('Escribe un nombre para el almacén', 'error'); return; }
    try {
      const creado = await crearAlmacen({ nombre });
      setAlmacenesList((prev) => (prev.includes(creado.nombre) ? prev : [...prev, creado.nombre].sort((a, b) => a.localeCompare(b, 'es'))));
      setForm((prev) => ({ ...prev, almacen: creado.nombre }));
      setNuevoAlmacen('');
      toast(`Almacén "${creado.nombre}" añadido`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo añadir el almacén', 'error');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const sku = form.sku.trim().toUpperCase();
    const nombre = form.nombre.trim().toUpperCase();
    if (!sku || !nombre) {
      setError('SKU y nombre son obligatorios.');
      return;
    }
    if (form.esReceta && !form.receta_fundicion) {
      setError('Seleccioná la receta de producción o cambiá la respuesta a "No".');
      return;
    }
    const restockRaw = form.restock_pct.trim();

    // CAJA/BULTO → UNIDADES: en alta, si la unidad es caja/bulto y se indicó cuántas
    // unidades trae, el stock inicial (en cajas) se multiplica y se guarda en "und".
    const convierteBulto = !isEdit && esBulto && undXBulto > 0;
    const stockFinal = convierteBulto ? stockBultos * undXBulto : (Number(form.stock) || 0);
    const unidadFinal = convierteBulto ? 'und' : form.unidad;

    const payload: ProductoInput = {
      sku,
      nombre,
      categoria: form.categoria,
      unidad: unidadFinal,
      stock: stockFinal,
      stock_min: Number(form.stock_min) || 0,
      // Costo y precio de venta siempre a 2 decimales (la moneda no maneja más).
      precio: Math.round((Number(form.precio) || 0) * 100) / 100,
      precio_venta: form.precio_venta.trim() === '' ? null : Math.round(Math.max(0, Number(form.precio_venta)) * 100) / 100,
      almacen: form.almacen.trim() || 'General',
      estado: form.estado,
      restock_pct: restockRaw === '' ? null : Math.max(0, Number(restockRaw)),
      receta_fundicion: form.esReceta && form.receta_fundicion ? (form.receta_fundicion as RecetaFundicion) : null,
      // Marcar receta no se des-marca al editar (lo añade el toggle o el alta desde producción).
      es_receta: form.esReceta || (producto?.es_receta ?? false),
      es_producible: producto?.es_producible ?? false,
      // Detalle del producto (se guardan en mayúsculas salvo descripción; vacío => null).
      nombre_busqueda: form.nombre_busqueda.trim().toUpperCase() || null,
      marca: form.marca.trim().toUpperCase() || null,
      modelo: form.modelo.trim().toUpperCase() || null,
      serial: form.serial.trim().toUpperCase() || null,
      codigo: form.codigo.trim().toUpperCase() || null,
      numero: form.numero.trim().toUpperCase() || null,
      descripcion: form.descripcion.trim() || null,
      ubicacion: form.ubicacion.trim().toUpperCase() || null,
    };

    setSaving(true);
    try {
      // Producto NUEVO: reservamos el SKU correlativo REAL (atómico, persistente)
      // en el momento de crear, para que no se reutilicen números tras un borrado.
      if (!isEdit) {
        try { payload.sku = await nextSku(form.categoria, otrosProductos); }
        catch { /* sin red: se usa el SKU previsualizado */ }
      }
      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button type="submit" form="producto-form" className="btn btn-primary" disabled={saving}>
        {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
      </button>
    </>
  );

  return (
    <Modal title={isEdit ? 'Editar producto' : 'Nuevo producto'} onClose={onClose} footer={footer}>
      <form id="producto-form" onSubmit={handleSubmit}>
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '.75rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="form-grid">
          <div className="form-row">
            <label>SKU</label>
            <input
              className="input mono"
              value={form.sku}
              onChange={(e) => update('sku', e.target.value.toUpperCase())}
              required
              readOnly={!isEdit}
              title={!isEdit ? 'Se genera automáticamente según la categoría' : undefined}
            />
            {!isEdit && (
              <small className="muted" style={{ fontSize: '.72rem' }}>
                Generado automático e incremental según la categoría seleccionada.
              </small>
            )}
          </div>
          <div className="form-row">
            <label>Estado</label>
            <select
              className="select"
              value={form.estado}
              onChange={(e) => update('estado', e.target.value as 'activo' | 'inactivo')}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <label>Nombre del producto</label>
          {/* No controlado (defaultValue): un re-render por realtime (al refrescar
              `productos`) no pisa ni "corta" lo que se está tecleando. */}
          <input
            className="input"
            defaultValue={form.nombre}
            onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('nombre', e.target.value); }}
            required
          />
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Categoría</label>
            <select
              className="select"
              value={form.categoria}
              onChange={(e) => update('categoria', e.target.value)}
            >
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Nueva categoría…"
                value={nuevaCat}
                onChange={(e) => setNuevaCat(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategoria(); } }}
                maxLength={40}
              />
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleAddCategoria}>
                + Añadir
              </button>
            </div>
          </div>
          <div className="form-row">
            <label>Unidad</label>
            <select
              className="select"
              value={form.unidad}
              onChange={(e) => update('unidad', e.target.value)}
            >
              {unidades.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Nueva unidad…"
                value={nuevaUnid}
                onChange={(e) => setNuevaUnid(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUnidad(); } }}
                maxLength={20}
              />
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleAddUnidad}>
                + Añadir
              </button>
            </div>
          </div>
        </div>

        <div className="form-row">
          <label>¿Este producto forma parte de una receta de producción?</label>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.4rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${form.esReceta ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => update('esReceta', true)}
            >
              Sí
            </button>
            <button
              type="button"
              className={`btn btn-sm ${!form.esReceta ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { update('esReceta', false); update('receta_fundicion', ''); }}
            >
              No
            </button>
          </div>
          {showReceta && (
            <select
              className="select"
              value={form.receta_fundicion}
              onChange={(e) => update('receta_fundicion', e.target.value as RecetaFundicion | '')}
            >
              <option value="">— elegí una receta —</option>
              {RECETAS_FUNDICION.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
        </div>

        <div className="form-row">
          <label>Almacén</label>
          <select
            className="select"
            value={form.almacen}
            onChange={(e) => update('almacen', e.target.value)}
          >
            {!almacenesList.includes(form.almacen) && form.almacen && (
              <option value={form.almacen}>{form.almacen}</option>
            )}
            {almacenesList.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Nuevo almacén…"
              value={nuevoAlmacen}
              onChange={(e) => setNuevoAlmacen(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlmacen(); } }}
              maxLength={40}
            />
            <button type="button" className="btn btn-sm btn-ghost" onClick={handleAddAlmacen}>
              + Añadir
            </button>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>{isEdit ? 'Stock total (todos los almacenes)' : (esBulto ? `Stock inicial (en ${form.unidad}s)` : 'Stock inicial')}</label>
            <input
              className="input mono"
              type="number"
              min={0}
              step="any"
              value={form.stock}
              onChange={(e) => update('stock', e.target.value)}
              required={!isEdit}
              disabled={isEdit}
            />
            <small className="muted" style={{ fontSize: '.72rem' }}>
              {isEdit
                ? 'El stock es por almacén. Ajustalo desde “Movimiento” (entrada/salida/ajuste) en cada almacén.'
                : esBulto
                  ? `Cantidad de ${form.unidad}s. Se convierte a unidades con el campo de la derecha.`
                  : 'Ingresa al almacén seleccionado arriba. Luego se ajusta por movimientos.'}
            </small>
          </div>
          {!isEdit && esBulto && (
            <div className="form-row">
              <label>Unidades por {form.unidad}</label>
              <input
                className="input mono"
                type="number"
                min={0}
                step="any"
                value={undPorBulto}
                onChange={(e) => setUndPorBulto(e.target.value)}
                placeholder="ej. 20"
              />
              <small className="muted" style={{ fontSize: '.72rem' }}>
                {undXBulto > 0
                  ? <>Se guardará en unidades: <strong>{stockBultos} {form.unidad}{stockBultos === 1 ? '' : 's'} × {undXBulto} = {totalUnidades} und</strong>.</>
                  : <>Indicá cuántas unidades trae cada {form.unidad} (ej. 20). El stock se guardará en unidades.</>}
              </small>
            </div>
          )}
          <div className="form-row">
            <label>Stock mínimo</label>
            <input
              className="input mono"
              type="number"
              min={0}
              step="any"
              value={form.stock_min}
              onChange={(e) => update('stock_min', e.target.value)}
              required
            />
            <small className="muted" style={{ fontSize: '.72rem' }}>
              Línea roja. Por debajo de este nivel el producto entra en estado crítico.
            </small>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-row">
            <label>Precio unitario / costo (USD)</label>
            <input
              className="input mono"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={form.precio}
              onChange={(e) => update('precio', dosDecimales(e.target.value))}
              required
            />
            <small className="muted" style={{ fontSize: '.72rem' }}>
              Costo (admite decimales, ej. 0,35). Al comprar/recibir se mantiene como precio promedio ponderado (PMP).
            </small>
          </div>
          <div className="form-row">
            <label>Posible precio de venta (USD, opcional)</label>
            <input
              className="input mono"
              type="text"
              inputMode="decimal"
              value={form.precio_venta}
              onChange={(e) => update('precio_venta', dosDecimales(e.target.value))}
              placeholder="para calcular ganancia en producción"
            />
            <small className="muted" style={{ fontSize: '.72rem' }}>
              Se usa para estimar la posible ganancia cuando el producto se produce.
            </small>
          </div>
          <div className="form-row">
            <label>Umbral reabastecimiento (% opcional)</label>
            <input
              className="input mono"
              type="number"
              min={0}
              max={500}
              step={5}
              value={form.restock_pct}
              onChange={(e) => update('restock_pct', e.target.value)}
              placeholder="vacío = usar política global"
            />
            <small className="muted" style={{ fontSize: '.72rem' }}>
              % sobre el stock mínimo. 150% alerta cuando aún tienes 1.5× el mínimo.
            </small>
          </div>
        </div>

        {/* ── Detalle del producto (opcional) ── */}
        <details style={{ marginTop: '.6rem' }} open={isEdit && !!(form.marca || form.serial || form.codigo || form.nombre_busqueda)}>
          <summary style={{ cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.3rem 0' }}>
            Detalle del producto (marca, serial, código…)
          </summary>
          <div style={{ marginTop: '.5rem' }}>
            <div className="form-row">
              <label>Nombre de búsqueda / alias</label>
              <input className="input" defaultValue={form.nombre_busqueda}
                onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('nombre_busqueda', e.target.value); }}
                placeholder="Ej.: CLORO (para hallarlo más fácil)" />
              <small className="muted" style={{ fontSize: '.72rem' }}>Sirve para encontrar el producto en el buscador del inventario.</small>
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>Marca</label>
                <input className="input" defaultValue={form.marca} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('marca', e.target.value); }} placeholder="Ej.: STIHL" />
              </div>
              <div className="form-row">
                <label>Modelo</label>
                <input className="input" defaultValue={form.modelo} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('modelo', e.target.value); }} placeholder="Ej.: ZH4100D" />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-row">
                <label>N°</label>
                <input className="input mono" defaultValue={form.numero} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('numero', e.target.value); }} placeholder="N° de parte / activo" />
              </div>
              <div className="form-row">
                <label>Serial</label>
                <input className="input mono" defaultValue={form.serial} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('serial', e.target.value); }} placeholder="N° de serie" />
              </div>
              <div className="form-row">
                <label>Código</label>
                <input className="input mono" defaultValue={form.codigo} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('codigo', e.target.value); }} placeholder="Código de fábrica / barra" />
              </div>
            </div>
            <div className="form-row">
              <label>Ubicación física</label>
              <input className="input" defaultValue={form.ubicacion} onChange={(e) => { e.target.value = e.target.value.toUpperCase(); update('ubicacion', e.target.value); }} placeholder="Estante / fila / zona del almacén" />
            </div>
            <div className="form-row">
              <label>Descripción / detalles</label>
              <textarea className="input" rows={2} defaultValue={form.descripcion} onChange={(e) => update('descripcion', e.target.value)} placeholder="Características, presentación, notas…" />
            </div>
          </div>
        </details>
      </form>
    </Modal>
  );
}
