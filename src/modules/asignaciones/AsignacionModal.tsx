/* ============================================================
   Golden Touch · Asignaciones · alta, edición, devolución y borrado

   Un solo modal para las tres cosas que se le hacen a una asignación,
   porque siempre se mira el mismo dato: qué se le dio, a quién y si vuelve.
   ============================================================ */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '@/shared/ui/Modal';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { money, date as fmtDate } from '@/shared/lib/format';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import {
  CATEGORIA, CATEGORIAS, CONDICION_LABEL, ESTADO_LABEL, TIPO, aNumero, comprometido, detalleCorto, erroresForm, formDesde,
  formVacio, itemVacio, limpiarItem, nombreDe, payloadDe, tipoDeCategoria, totalRenglones, valorTotal,
  type Asignacion, type CondicionDevolucion, type FormAsignacion, type PersonaMin, type TipoAsignacion,
} from './asignacionesReglas';
import {
  anularDevolucion, crearAsignacion, devolverAsignacion, editarAsignacion, eliminarAsignacion, guardarKmDevolucion,
  type ProductoAsignable,
} from './asignaciones.repository';
import {
  VIGENCIA_LABEL, descripcionVehiculo, etiquetaVehiculo, marcaModelo, vigenciaAutorizacion, type VehiculoCatalogo,
} from './vehiculosCatalogo';
import { descargarAutorizacionVehiculoPdf } from './autorizacionVehiculoPdf';

/** Ejemplo del campo «¿Qué se asigna?» según la categoría. */
const EJEMPLO: Partial<Record<FormAsignacion['categoria'], string>> = {
  dotacion: 'Camisa, pantalón, botas de seguridad, casco, guantes…',
  vehiculo: 'Se completa al elegir el vehículo del catálogo',
  linea: 'Línea corporativa',
  equipo: 'Laptop, teléfono, radio…',
};

type Modo = 'ver' | 'editar' | 'devolver';

export function AsignacionModal({ asignacion, tipo = '', personal, productos, vehiculos = [], vehiculosEnUso, canWrite, actor, actorName, onClose, onSaved, onCatalogo }: {
  asignacion: Asignacion | null;
  /** Apartado desde el que se abrió (limita las categorías). Vacío = todas. */
  tipo?: TipoAsignacion | '';
  personal: PersonaMin[];
  productos: ProductoAsignable[];
  /** Catálogo de vehículos para el apartado Vehículos (autorización de tránsito). */
  vehiculos?: VehiculoCatalogo[];
  /** vehiculo_id → a quién está autorizado hoy (para avisar antes de guardar). */
  vehiculosEnUso?: Map<string, string>;
  /** Abre el catálogo de vehículos (para agregar uno que falta). */
  onCatalogo?: () => void;
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNueva = !asignacion;
  const [modo, setModo] = useState<Modo>(esNueva ? 'editar' : 'ver');
  const [f, setF] = useState<FormAsignacion>(() => (asignacion ? formDesde(asignacion) : formVacio(hoyVenezuela(), tipo)));
  // Categorías que se ofrecen: las del apartado (al editar, las del apartado de la asignación).
  const tipoForm: TipoAsignacion | '' = asignacion ? tipoDeCategoria(asignacion.categoria) : tipo;
  const categoriasForm = tipoForm ? CATEGORIAS.filter((c) => TIPO[tipoForm].categorias.includes(c.valor)) : CATEGORIAS;
  const esVehiculo = f.categoria === 'vehiculo';
  const [kmDev, setKmDev] = useState('');
  const [saving, setSaving] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [borrar, setBorrar] = useState(false);
  const [dev, setDev] = useState({ fecha: hoyVenezuela(), condicion: 'bueno' as CondicionDevolucion, reingresa: true, nota: '' });
  // Artículos ya agregados a esta entrega (solo al crear). Cada uno queda como su propia asignación.
  const [renglones, setRenglones] = useState<FormAsignacion[]>([]);

  const producto = productos.find((p) => p.id === f.producto_id) ?? null;
  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  // Al editar, lo que ya tiene esta asignación vuelve al stock antes de sacar lo nuevo.
  const stockDisponible = producto
    ? Number(producto.stock) + (asignacion?.producto_id === producto.id ? Number(asignacion.cantidad) : 0)
      - comprometido(renglones, producto.id)
    : null;

  const set = <K extends keyof FormAsignacion>(k: K, v: FormAsignacion[K]) => setF((x) => ({ ...x, [k]: v }));

  // Al cambiar de categoría se propone si retorna o no (dotación y oficina no).
  // Un vehículo no sale del inventario: es una unidad de la flota.
  function cambiarCategoria(c: FormAsignacion['categoria']) {
    setF((x) => ({ ...x, categoria: c, retornable: CATEGORIA[c].retorna, ...(c === 'vehiculo' ? { desdeInventario: false, producto_id: '' } : {}) }));
  }

  // Al elegir un vehículo del catálogo se traen su nombre, placa, marca/modelo y serial.
  function elegirVehiculo(id: string) {
    const v = vehiculos.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      vehiculo_id: id,
      descripcion: v ? descripcionVehiculo(v) : x.descripcion,
      placa: v?.placa ?? x.placa,
      marca_modelo: v ? marcaModelo(v) : x.marca_modelo,
      serial: v?.serial_carroceria ?? x.serial,
    }));
  }
  const enUsoPor = f.vehiculo_id && f.vehiculo_id !== asignacion?.vehiculo_id ? vehiculosEnUso?.get(f.vehiculo_id) : undefined;
  const vehiculoElegido = vehiculos.find((v) => v.id === f.vehiculo_id) ?? null;
  // Se ofrecen los activos; el que ya tenía esta asignación aparece aunque se haya desactivado.
  const vehiculosOfrecidos = vehiculos.filter((v) => v.activo || v.id === asignacion?.vehiculo_id);

  async function pdfAutorizacion() {
    if (!asignacion) return;
    try {
      await descargarAutorizacionVehiculoPdf(asignacion, personal.find((p) => p.id === asignacion.personal_id) ?? null,
        vehiculos.find((v) => v.id === asignacion.vehiculo_id) ?? null);
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo generar la autorización', 'error'); }
  }

  // Al elegir un producto del inventario se traen nombre, unidad y costo.
  useEffect(() => {
    if (!f.desdeInventario || !f.producto_id) return;
    const p = prodPorId.get(f.producto_id);
    if (!p) return;
    setF((x) => ({
      ...x,
      descripcion: x.descripcion.trim() ? x.descripcion : p.nombre,
      unidad: x.unidad || (p.unidad ?? ''),
      valor_unitario: x.valor_unitario || (p.precio ? String(p.precio) : ''),
      marca_modelo: x.marca_modelo || [p.marca, p.modelo].filter(Boolean).join(' '),
    }));
  }, [f.desdeInventario, f.producto_id, prodPorId]);

  function agregarOtro() {
    const errs = erroresForm(f, stockDisponible);
    setErrores(errs);
    if (errs.length) return;
    setRenglones((rs) => [...rs, f]);
    setF(limpiarItem(f));
  }

  function quitarRenglon(i: number) {
    setRenglones((rs) => rs.filter((_, x) => x !== i));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    // Si ya hay artículos agregados, el renglón en blanco no obliga a llenarlo.
    const soloAgregados = !!renglones.length && itemVacio(f);
    if (!soloAgregados) {
      const errs = erroresForm(f, stockDisponible);
      setErrores(errs);
      if (errs.length) return;
    } else setErrores([]);
    const items = soloAgregados ? renglones : [...renglones, f];
    setSaving(true);
    try {
      if (asignacion) {
        await editarAsignacion(asignacion.id, payloadDe(f), actor, actorName);
        toast('Asignación actualizada', 'success');
      } else {
        // De a uno y en orden: cada uno descuenta stock, y si falla el tercero
        // los dos primeros ya quedaron (se ven en la lista y se pueden borrar).
        for (const it of items) await crearAsignacion(payloadDe(it), actor, actorName);
        toast(items.length === 1 ? 'Asignación registrada' : `${items.length} asignaciones registradas`, 'success');
      }
      onSaved();
    } catch (err) { setErrores([err instanceof Error ? err.message : 'No se pudo guardar']); setSaving(false); }
  }

  async function confirmarDevolucion() {
    if (!asignacion) return;
    setSaving(true);
    try {
      await devolverAsignacion(asignacion.id, dev, actor, actorName);
      if (asignacion.categoria === 'vehiculo' && kmDev.trim()) await guardarKmDevolucion(asignacion.id, aNumero(kmDev), actor);
      toast('Devolución registrada', 'success');
      onSaved();
    } catch (err) { setErrores([err instanceof Error ? err.message : 'No se pudo registrar la devolución']); setSaving(false); }
  }

  async function anular() {
    if (!asignacion) return;
    setSaving(true);
    try { await anularDevolucion(asignacion.id, actor, actorName); toast('Devolución anulada', 'success'); onSaved(); }
    catch (err) { setErrores([err instanceof Error ? err.message : 'No se pudo anular']); setSaving(false); }
  }

  async function eliminar() {
    if (!asignacion) return;
    setBorrar(false); setSaving(true);
    try { await eliminarAsignacion(asignacion.id, actor, actorName); toast('Asignación eliminada', 'success'); onSaved(); }
    catch (err) { setErrores([err instanceof Error ? err.message : 'No se pudo eliminar']); setSaving(false); }
  }

  const titulo = esNueva ? (tipo ? `${TIPO[tipo].icono} Nueva · ${TIPO[tipo].label}` : '🎒 Nueva asignación')
    : modo === 'devolver' ? '↩ Registrar devolución'
    : modo === 'editar' ? `✏ ${asignacion?.codigo}` : `🎒 ${asignacion?.codigo}`;

  const pie = (
    <>
      {!esNueva && canWrite && modo === 'ver' && (
        <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setBorrar(true)} disabled={saving}>🗑 Eliminar</button>
      )}
      {!esNueva && canWrite && modo === 'ver' && asignacion?.estado === 'devuelto' && (
        <button className="btn btn-ghost" onClick={() => void anular()} disabled={saving}>↺ Anular devolución</button>
      )}
      {!esNueva && canWrite && modo === 'ver' && asignacion?.estado === 'asignado' && (
        <button className="btn btn-ghost" onClick={() => setModo('devolver')} disabled={saving}>↩ Devolver</button>
      )}
      {!esNueva && canWrite && modo === 'ver' && (
        <button className="btn btn-ghost" onClick={() => setModo('editar')} disabled={saving}>✏ Editar</button>
      )}
      {!esNueva && modo === 'ver' && asignacion?.categoria === 'vehiculo' && (
        <button className="btn btn-ghost" onClick={() => void pdfAutorizacion()} disabled={saving} title="Autorización de tránsito para que la porte el conductor">📄 Autorización</button>
      )}
      {modo !== 'ver' && !esNueva && <button className="btn btn-ghost" onClick={() => { setModo('ver'); setErrores([]); }} disabled={saving}>Volver</button>}
      {(modo === 'ver' || esNueva) && <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>}
      {modo === 'editar' && canWrite && esNueva && (
        <button type="button" className="btn btn-ghost" onClick={agregarOtro} disabled={saving} title="Guardar este artículo en la lista y cargar otro para el mismo trabajador">
          + Agregar otro artículo
        </button>
      )}
      {modo === 'editar' && canWrite && (
        <button type="submit" form="asig-form" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando…'
            : !esNueva ? 'Guardar'
            : renglones.length ? `Registrar ${renglones.length + (itemVacio(f) ? 0 : 1)} artículo(s)`
            : 'Registrar'}
        </button>
      )}
      {modo === 'devolver' && canWrite && (
        <button className="btn btn-primary" onClick={() => void confirmarDevolucion()} disabled={saving}>{saving ? 'Guardando…' : 'Confirmar devolución'}</button>
      )}
    </>
  );

  return (
    <Modal title={titulo} size="lg" onClose={() => !saving && onClose()} footer={pie}>
      {!!errores.length && (
        <div className="aviso danger" style={{ marginBottom: '.7rem' }}>
          <span className="aviso-icono">⛔</span>
          <div>{errores.map((e) => <div key={e}>{e}</div>)}</div>
        </div>
      )}

      {modo === 'ver' && asignacion && (
        <VerAsignacion a={asignacion} persona={personal.find((p) => p.id === asignacion.personal_id) ?? null}
          vehiculo={vehiculos.find((v) => v.id === asignacion.vehiculo_id) ?? null} />
      )}

      {modo === 'devolver' && asignacion && (
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            Devuelve <strong>{asignacion.descripcion}</strong> ({asignacion.cantidad}{asignacion.unidad ? ` ${asignacion.unidad}` : ''}),
            asignado el {fmtDate(asignacion.fecha)}.
          </p>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="dev-fecha">Fecha de devolución</label>
              <input id="dev-fecha" className="input" type="date" value={dev.fecha} min={asignacion.fecha}
                onChange={(e) => setDev((d) => ({ ...d, fecha: e.target.value }))} />
            </div>
            <div className="form-row">
              <label htmlFor="dev-cond">¿Cómo lo devuelve?</label>
              <select id="dev-cond" className="select" value={dev.condicion}
                onChange={(e) => {
                  const c = e.target.value as CondicionDevolucion;
                  setDev((d) => ({ ...d, condicion: c, reingresa: c === 'perdido' ? false : d.reingresa }));
                }}>
                {(Object.keys(CONDICION_LABEL) as CondicionDevolucion[]).map((c) => <option key={c} value={c}>{CONDICION_LABEL[c]}</option>)}
              </select>
            </div>
            {asignacion.categoria === 'vehiculo' && (
              <div className="form-row">
                <label htmlFor="dev-km">Kilometraje al devolver</label>
                <input id="dev-km" className="input mono" inputMode="decimal" value={kmDev} onChange={(e) => setKmDev(e.target.value)}
                  placeholder={asignacion.km_entrega != null ? `Se entregó con ${asignacion.km_entrega} km` : 'km'} />
              </div>
            )}
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="dev-nota">Nota (opcional)</label>
              <input id="dev-nota" className="input" value={dev.nota} onChange={(e) => setDev((d) => ({ ...d, nota: e.target.value }))}
                placeholder="Ej.: entregó la laptop con el cargador" />
            </div>
          </div>
          {asignacion.producto_id && (
            <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.7rem' }}>
              <input type="checkbox" checked={dev.reingresa} disabled={dev.condicion === 'perdido'}
                onChange={(e) => setDev((d) => ({ ...d, reingresa: e.target.checked }))} />
              <span>Vuelve al inventario ({asignacion.cantidad}{asignacion.unidad ? ` ${asignacion.unidad}` : ''})</span>
            </label>
          )}
          {dev.condicion === 'perdido' && (
            <div className="aviso warning sm" style={{ marginTop: '.6rem' }}>
              <span className="aviso-icono">⚠</span>
              <div>Se marca como perdido: <strong>no vuelve al inventario</strong>, pero queda registrado en el historial del trabajador.</div>
            </div>
          )}
        </div>
      )}

      {modo === 'editar' && !!renglones.length && (
        <div className="asig-renglones">
          <div className="asig-renglones-cab">
            <strong>Artículos de esta entrega ({renglones.length})</strong>
            <span className="mono">{money(totalRenglones(renglones))}</span>
          </div>
          {renglones.map((r, i) => (
            <div key={`${r.descripcion}-${i}`} className="asig-renglon">
              <span aria-hidden="true">{CATEGORIA[r.categoria]?.icono}</span>
              <div style={{ minWidth: 0 }}>
                <div className="asig-renglon-txt">{r.descripcion}</div>
                <small className="muted">
                  {r.cantidad}{r.unidad ? ` ${r.unidad}` : ''}
                  {r.valor_unitario.trim() ? ` · ${money(Number(r.valor_unitario.replace(',', '.')) || 0)} c/u` : ''}
                  {r.desdeInventario ? ' · del inventario' : ''}
                  {r.retornable ? ' · retorna' : ' · no retorna'}
                </small>
              </div>
              <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                onClick={() => quitarRenglon(i)} title="Quitar de la lista" disabled={saving}>✕</button>
            </div>
          ))}
          <small className="muted">Cada artículo queda como una asignación aparte, con su propio código.</small>
        </div>
      )}

      {modo === 'editar' && (
        <form id="asig-form" onSubmit={guardar}>
          <div className="form-grid">
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="asig-persona">Trabajador *</label>
              <SearchSelect id="asig-persona" value={f.personal_id} onChange={(v) => set('personal_id', v)} placeholder="🔍 Buscar trabajador…"
                options={personal.map((p) => ({
                  value: p.id,
                  label: `${nombreDe(p)}${p.cedula ? ` · ${p.cedula}` : ''}${p.cargo ? ` · ${p.cargo}` : ''}${p.activo === false ? ' · (inactivo)' : ''}`,
                }))} />
            </div>
            <div className="form-row">
              <label htmlFor="asig-fecha">Fecha *</label>
              <input id="asig-fecha" className="input" type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} required />
            </div>
            <div className="form-row">
              <label htmlFor="asig-cat">Categoría *</label>
              <select id="asig-cat" className="select" value={f.categoria} disabled={categoriasForm.length === 1}
                onChange={(e) => cambiarCategoria(e.target.value as FormAsignacion['categoria'])}>
                {categoriasForm.map((c) => <option key={c.valor} value={c.valor}>{c.icono} {c.label}</option>)}
              </select>
            </div>
          </div>

          {esVehiculo && (
            <div className="form-grid" style={{ marginTop: '.6rem' }}>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="asig-vehiculo">Vehículo del catálogo *</label>
                <SearchSelect id="asig-vehiculo" value={f.vehiculo_id} onChange={elegirVehiculo} placeholder="🔍 Buscar por placa, nombre o marca…"
                  options={vehiculosOfrecidos.map((v) => {
                    const uso = v.id !== asignacion?.vehiculo_id ? vehiculosEnUso?.get(v.id) : undefined;
                    return { value: v.id, label: `${etiquetaVehiculo(v)}${uso ? ` · (autorizado a ${uso})` : ''}` };
                  })} />
                <small className="muted">
                  La asignación es la <strong>autorización</strong> para que la persona transite en este vehículo.
                  {onCatalogo ? <> ¿No está? <button type="button" className="btn-link" onClick={onCatalogo}>🚙 Agrégalo al catálogo</button>.</> : null}
                </small>
                {vehiculoElegido && (
                  <div className="card" style={{ marginTop: '.4rem', padding: '.5rem .7rem', fontSize: '.84rem' }}>
                    <strong className="mono">{vehiculoElegido.placa}</strong>
                    {' · '}{[vehiculoElegido.tipo, marcaModelo(vehiculoElegido), vehiculoElegido.color].filter(Boolean).join(' · ') || '—'}
                    {(vehiculoElegido.serial_carroceria || vehiculoElegido.serial_motor) && (
                      <div className="muted mono" style={{ fontSize: '.78rem' }}>
                        {[vehiculoElegido.serial_carroceria ? `Carr. ${vehiculoElegido.serial_carroceria}` : null, vehiculoElegido.serial_motor ? `Motor ${vehiculoElegido.serial_motor}` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                )}
                {enUsoPor && (
                  <div className="aviso warning sm" style={{ marginTop: '.4rem' }}>
                    <span className="aviso-icono">⚠</span>
                    <div>Este vehículo ya está autorizado a <strong>{enUsoPor}</strong>. Registra primero su devolución.</div>
                  </div>
                )}
              </div>
              <div className="form-row">
                <label htmlFor="asig-km">Kilometraje al entregar</label>
                <input id="asig-km" className="input mono" inputMode="decimal" value={f.km_entrega} onChange={(e) => set('km_entrega', e.target.value)} placeholder="km" />
              </div>
              <div className="form-row">
                <label htmlFor="asig-hasta">Autorizado hasta</label>
                <input id="asig-hasta" className="input" type="date" value={f.autorizacion_hasta} min={f.fecha || undefined}
                  onChange={(e) => set('autorizacion_hasta', e.target.value)} />
                <small className="muted">Vacío = mientras lo tenga asignado.</small>
              </div>
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="asig-ruta">Ruta / zona autorizada</label>
                <input id="asig-ruta" className="input" value={f.ruta_autorizada} onChange={(e) => set('ruta_autorizada', e.target.value)}
                  placeholder="Ej.: Upata – Mina Peramanal – Puerto Ordaz" />
              </div>
            </div>
          )}

          {!esVehiculo && <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', margin: '.8rem 0 .4rem' }}>
            <input type="checkbox" checked={f.desdeInventario}
              onChange={(e) => setF((x) => ({ ...x, desdeInventario: e.target.checked, producto_id: e.target.checked ? x.producto_id : '' }))} />
            <span><strong>Sale del inventario</strong> (descuenta stock y queda en el kardex)</span>
          </label>}

          <div className="form-grid">
            {f.desdeInventario && (
              <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="asig-prod">Producto del inventario *</label>
                <SearchSelect id="asig-prod" value={f.producto_id} onChange={(v) => set('producto_id', v)} placeholder="🔍 Buscar producto…"
                  options={productos.map((p) => ({ value: p.id, label: `${p.sku ? `${p.sku} · ` : ''}${p.nombre} — ${p.stock} ${p.unidad ?? ''}`.trim() }))} />
                {producto && <small className="muted">Disponible: <strong className="mono">{stockDisponible} {producto.unidad ?? ''}</strong></small>}
              </div>
            )}
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="asig-desc">¿Qué se asigna? *</label>
              <input id="asig-desc" className="input" value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)}
                placeholder={EJEMPLO[f.categoria] ?? 'Laptop Dell Latitude, uniforme completo, resma de papel…'} required />
            </div>
            {f.categoria === 'dotacion' && (
              <div className="form-row">
                <label htmlFor="asig-talla">Talla</label>
                <input id="asig-talla" className="input" value={f.talla} onChange={(e) => set('talla', e.target.value)} placeholder="S, M, L, 42…" />
              </div>
            )}
            <div className="form-row">
              <label htmlFor="asig-cant">Cantidad *</label>
              <input id="asig-cant" className="input" inputMode="decimal" value={f.cantidad} onChange={(e) => set('cantidad', e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="asig-unidad">Unidad</label>
              <input id="asig-unidad" className="input" value={f.unidad} onChange={(e) => set('unidad', e.target.value)} placeholder="und, par, caja…" />
            </div>
            <div className="form-row">
              <label htmlFor="asig-valor">Valor unitario (USD)</label>
              <input id="asig-valor" className="input" inputMode="decimal" value={f.valor_unitario} onChange={(e) => set('valor_unitario', e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {f.categoria === 'linea' && (
            <div className="form-grid" style={{ marginTop: '.5rem' }}>
              <div className="form-row">
                <label htmlFor="asig-linea">Número de la línea *</label>
                <input id="asig-linea" className="input" value={f.numero_linea} onChange={(e) => set('numero_linea', e.target.value)} placeholder="0416-1234567" />
              </div>
              <div className="form-row">
                <label htmlFor="asig-oper">Operadora</label>
                <input id="asig-oper" className="input" value={f.operador} onChange={(e) => set('operador', e.target.value)} placeholder="Movistar, Movilnet, Digitel…" />
              </div>
            </div>
          )}

          <div className="form-grid" style={{ marginTop: '.5rem' }}>
            <div className="form-row">
              <label htmlFor="asig-marca">Marca / modelo</label>
              <input id="asig-marca" className="input" value={f.marca_modelo} onChange={(e) => set('marca_modelo', e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="asig-serial">Serial</label>
              <input id="asig-serial" className="input" value={f.serial} onChange={(e) => set('serial', e.target.value)} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="asig-obs">Observación</label>
              <input id="asig-obs" className="input" value={f.observacion} onChange={(e) => set('observacion', e.target.value)} />
            </div>
          </div>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.8rem' }}>
            <input type="checkbox" checked={f.retornable} onChange={(e) => set('retornable', e.target.checked)} />
            <span><strong>Debe devolverlo</strong> cuando ya no lo use o deje la empresa</span>
          </label>
          <p className="muted" style={{ fontSize: '.82rem', marginTop: '.3rem' }}>
            {f.retornable
              ? 'Queda pendiente hasta que se registre la devolución.'
              : 'Se entrega para quedárselo (dotación, material de oficina): no se pide de vuelta, pero queda en su historial.'}
          </p>
          {Number(f.cantidad) > 0 && f.valor_unitario.trim() && (
            <p className="muted" style={{ fontSize: '.85rem' }}>Valor total: <strong className="mono">{money(valorTotal({ cantidad: Number(f.cantidad) || 0, valor_unitario: Number(f.valor_unitario.replace(',', '.')) || 0 }))}</strong></p>
          )}
          {!esNueva && asignacion?.producto_id && (
            <div className="aviso info sm" style={{ marginTop: '.5rem' }}>
              <span className="aviso-icono">ℹ</span>
              <div>Si cambias el producto o la cantidad, se devuelve al inventario lo que estaba asignado y se descuenta lo nuevo.</div>
            </div>
          )}
        </form>
      )}

      {borrar && asignacion && (
        <ConfirmDialog
          title="Eliminar asignación" danger confirmText="Sí, eliminar"
          message={
            asignacion.producto_id && !asignacion.reingresa_inventario
              ? <>Se borra del historial del trabajador y lo asignado <strong>vuelve al inventario</strong>.</>
              : <>Se borra del historial del trabajador. Esta acción no se puede deshacer.</>
          }
          preview={
            <VistaPrevia titulo="Se va a eliminar">
              <Dato label="Código">{asignacion.codigo}</Dato>
              <Dato label="Trabajador">{nombreDe(personal.find((p) => p.id === asignacion.personal_id))}</Dato>
              <Dato label="Qué">{asignacion.descripcion}</Dato>
              <Dato label="Cantidad"><span className="mono">{asignacion.cantidad}{asignacion.unidad ? ` ${asignacion.unidad}` : ''}</span></Dato>
              <Dato label="Fecha">{fmtDate(asignacion.fecha)}</Dato>
              <Dato label="Estado">{ESTADO_LABEL[asignacion.estado]}</Dato>
            </VistaPrevia>
          }
          onConfirm={() => { void eliminar(); }}
          onCancel={() => setBorrar(false)}
        />
      )}
    </Modal>
  );
}

function VerAsignacion({ a, persona, vehiculo }: { a: Asignacion; persona: PersonaMin | null; vehiculo: VehiculoCatalogo | null }) {
  const det = detalleCorto(a);
  const vig = a.categoria === 'vehiculo' ? vigenciaAutorizacion(a, hoyVenezuela()) : null;
  return (
    <>
      {vig && (
        <div className={`aviso ${vig === 'vigente' ? 'success' : vig === 'vencida' ? 'danger' : 'info'}`} style={{ marginBottom: '.7rem' }}>
          <span className="aviso-icono">{vig === 'vigente' ? '🪪' : vig === 'vencida' ? '⛔' : 'ℹ'}</span>
          <div>
            <strong>{VIGENCIA_LABEL[vig]}</strong>
            {' · '}{nombreDe(persona)} puede transitar en <strong className="mono">{vehiculo?.placa ?? a.placa ?? '—'}</strong>
            {vehiculo ? ` (${[vehiculo.tipo, marcaModelo(vehiculo), vehiculo.color].filter(Boolean).join(' · ')})` : ''}
            {' '}desde el {fmtDate(a.fecha)}{a.autorizacion_hasta ? ` hasta el ${fmtDate(a.autorizacion_hasta)}` : ' mientras lo tenga asignado'}.
            {a.ruta_autorizada && <div>Ruta / zona: {a.ruta_autorizada}</div>}
            {vig === 'vencida' && <div>La fecha tope ya pasó: edita «Autorizado hasta» para renovarla o registra la devolución.</div>}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.45rem .9rem', fontSize: '.88rem' }}>
        <div><span className="muted">Trabajador:</span> <strong>{nombreDe(persona)}</strong></div>
        <div><span className="muted">Cargo:</span> <strong>{persona?.cargo || '—'}</strong></div>
        <div><span className="muted">Fecha:</span> <strong>{fmtDate(a.fecha)}</strong></div>
        <div><span className="muted">Categoría:</span> <strong>{CATEGORIA[a.categoria]?.icono} {CATEGORIA[a.categoria]?.label}</strong></div>
        <div><span className="muted">Cantidad:</span> <strong className="mono">{a.cantidad}{a.unidad ? ` ${a.unidad}` : ''}</strong></div>
        <div><span className="muted">Valor:</span> <strong className="mono">{money(valorTotal(a))}</strong></div>
        <div><span className="muted">Origen:</span> <strong>{a.producto_id ? 'Salió del inventario' : 'No es del inventario'}</strong></div>
        <div><span className="muted">Estado:</span> <strong>{ESTADO_LABEL[a.estado]}</strong></div>
      </div>
      <div className="card" style={{ marginTop: '.7rem', padding: '.7rem' }}>
        <strong>{a.descripcion}</strong>
        {det && <div className="muted" style={{ fontSize: '.85rem' }}>{det}</div>}
        {a.observacion && <div className="muted" style={{ fontSize: '.85rem' }}>{a.observacion}</div>}
      </div>
      {a.estado === 'devuelto' && (
        <div className="aviso success" style={{ marginTop: '.7rem' }}>
          <span className="aviso-icono">✅</span>
          <div>
            Devuelto el <strong>{fmtDate(a.fecha_devolucion)}</strong>
            {a.condicion_devolucion ? ` · ${CONDICION_LABEL[a.condicion_devolucion]}` : ''}
            {a.reingresa_inventario ? ' · volvió al inventario' : ''}
            {a.nota_devolucion ? <div>{a.nota_devolucion}</div> : null}
          </div>
        </div>
      )}
      {a.estado === 'asignado' && (
        <div className="aviso warning" style={{ marginTop: '.7rem' }}>
          <span className="aviso-icono">⏳</span>
          <div>Lo tiene el trabajador. Debe devolverlo cuando ya no lo use o deje la empresa.</div>
        </div>
      )}
      <p className="muted" style={{ fontSize: '.78rem', marginTop: '.6rem' }}>
        Registrado el {fmtDate(a.created_at)}{a.actor_name ? ` por ${a.actor_name}` : ''}.
      </p>
    </>
  );
}
