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
  CATEGORIA, CATEGORIAS, CONDICION_LABEL, ESTADO_LABEL, detalleCorto, erroresForm, formDesde, formVacio,
  nombreDe, payloadDe, valorTotal, type Asignacion, type CondicionDevolucion, type FormAsignacion, type PersonaMin,
} from './asignacionesReglas';
import {
  anularDevolucion, crearAsignacion, devolverAsignacion, editarAsignacion, eliminarAsignacion,
  type ProductoAsignable,
} from './asignaciones.repository';

type Modo = 'ver' | 'editar' | 'devolver';

export function AsignacionModal({ asignacion, personal, productos, canWrite, actor, actorName, onClose, onSaved }: {
  asignacion: Asignacion | null;
  personal: PersonaMin[];
  productos: ProductoAsignable[];
  canWrite: boolean;
  actor: string;
  actorName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const esNueva = !asignacion;
  const [modo, setModo] = useState<Modo>(esNueva ? 'editar' : 'ver');
  const [f, setF] = useState<FormAsignacion>(() => (asignacion ? formDesde(asignacion) : formVacio(hoyVenezuela())));
  const [saving, setSaving] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [borrar, setBorrar] = useState(false);
  const [dev, setDev] = useState({ fecha: hoyVenezuela(), condicion: 'bueno' as CondicionDevolucion, reingresa: true, nota: '' });

  const producto = productos.find((p) => p.id === f.producto_id) ?? null;
  const prodPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  // Al editar, lo que ya tiene esta asignación vuelve al stock antes de sacar lo nuevo.
  const stockDisponible = producto
    ? Number(producto.stock) + (asignacion?.producto_id === producto.id ? Number(asignacion.cantidad) : 0)
    : null;

  const set = <K extends keyof FormAsignacion>(k: K, v: FormAsignacion[K]) => setF((x) => ({ ...x, [k]: v }));

  // Al cambiar de categoría se propone si retorna o no (dotación y oficina no).
  function cambiarCategoria(c: FormAsignacion['categoria']) {
    setF((x) => ({ ...x, categoria: c, retornable: CATEGORIA[c].retorna }));
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

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const errs = erroresForm(f, stockDisponible);
    setErrores(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      if (asignacion) await editarAsignacion(asignacion.id, payloadDe(f), actor, actorName);
      else await crearAsignacion(payloadDe(f), actor, actorName);
      toast(asignacion ? 'Asignación actualizada' : 'Asignación registrada', 'success');
      onSaved();
    } catch (err) { setErrores([err instanceof Error ? err.message : 'No se pudo guardar']); setSaving(false); }
  }

  async function confirmarDevolucion() {
    if (!asignacion) return;
    setSaving(true);
    try {
      await devolverAsignacion(asignacion.id, dev, actor, actorName);
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

  const titulo = esNueva ? '🎒 Nueva asignación'
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
      {modo !== 'ver' && !esNueva && <button className="btn btn-ghost" onClick={() => { setModo('ver'); setErrores([]); }} disabled={saving}>Volver</button>}
      {(modo === 'ver' || esNueva) && <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cerrar</button>}
      {modo === 'editar' && canWrite && (
        <button type="submit" form="asig-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : esNueva ? 'Registrar' : 'Guardar'}</button>
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
        <VerAsignacion a={asignacion} persona={personal.find((p) => p.id === asignacion.personal_id) ?? null} />
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
              <select id="asig-cat" className="select" value={f.categoria} onChange={(e) => cambiarCategoria(e.target.value as FormAsignacion['categoria'])}>
                {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.icono} {c.label}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', margin: '.8rem 0 .4rem' }}>
            <input type="checkbox" checked={f.desdeInventario}
              onChange={(e) => setF((x) => ({ ...x, desdeInventario: e.target.checked, producto_id: e.target.checked ? x.producto_id : '' }))} />
            <span><strong>Sale del inventario</strong> (descuenta stock y queda en el kardex)</span>
          </label>

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
                placeholder="Laptop Dell Latitude, uniforme completo, resma de papel…" required />
            </div>
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
              <div>Si cambiás el producto o la cantidad, se devuelve al inventario lo que estaba asignado y se descuenta lo nuevo.</div>
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

function VerAsignacion({ a, persona }: { a: Asignacion; persona: PersonaMin | null }) {
  const det = detalleCorto(a);
  return (
    <>
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
