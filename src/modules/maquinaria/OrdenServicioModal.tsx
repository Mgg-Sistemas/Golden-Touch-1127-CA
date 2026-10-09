import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { VistaPrevia, Dato } from '@/shared/ui/VistaPrevia';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { norm } from '@/shared/lib/texto';
import { num as fmtNum } from '@/shared/lib/format';
import { listProductosActivos } from '@/modules/pedidos/pedidos.repository';
import type { Producto } from '@/shared/lib/types';
import {
  SERVICIOS, URGENCIAS, INTERVENCIONES, ESTADOS_EQUIPO, ORDEN_ESTADOS, decidirRepuesto, efectoOrden, servicioPorId, sugerirServicio, soloPiezasNuevasPorComprar,
  repuestosEditables, type AvisoServicio, type TonoFlota,
} from './flota';
import {
  crearOrdenServicio, editarOrdenServicio, solicitarSalidaDeOrden, solicitarCompraDeOrden, notificarComprasPiezasNuevas, faltaSalida, faltaCompra,
  type OrdenServicio,
} from './flota.repository';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';
import { FotosNuevaOrden, FotosOrden } from './FotosOrdenServicio';
import { useFotosLocales } from './useFotosLocales';
import { subirFotosOrden } from './osFotos.repository';

interface Linea { productoId: string | null; nombre: string; unidad: string; cantidad: number; stock: number; almacen: string | null }

/** Lo que importa para saber si los repuestos cambiaron al editar. */
const firmaRepuestos = (ls: { producto_id: string | null; nombre: string; cantidad: number }[]) =>
  JSON.stringify(ls.map((l) => [l.producto_id ?? null, l.producto_id ? '' : l.nombre, Number(l.cantidad)]));

const PASOS = ['Servicio', 'Repuestos', 'Confirmar'];

function Chip({ tono, children }: { tono: TonoFlota; children: React.ReactNode }) {
  return <span className={`flo-chip tone-${tono}`}>{children}</span>;
}

/** Lo que decide cada repuesto, en vivo: del inventario, parcial o a compra. */
function Decision({ l }: { l: Linea }) {
  const d = decidirRepuesto(l.cantidad, l.productoId ? l.stock : 0);
  const a = l.cantidad > 0 ? (d.desdeInventario / l.cantidad) * 100 : 0;
  return (
    <div className="flo-decision">
      <div className="bar" aria-hidden="true"><i className="a" style={{ width: `${a}%` }} /><i className="b" style={{ width: `${100 - a}%` }} /></div>
      {d.tipo === 'stock' && <Chip tono="success">📦 Sale del inventario · quedan {fmtNum(l.stock - d.desdeInventario)}</Chip>}
      {d.tipo === 'parcial' && <><Chip tono="success">📦 {fmtNum(d.desdeInventario)} del inventario</Chip><Chip tono="warning">🛒 {fmtNum(d.aComprar)} a compra</Chip></>}
      {d.tipo === 'compra' && <Chip tono="warning">🛒 {l.productoId ? 'Sin stock · va a compra' : 'Pieza nueva · va a compra'}</Chip>}
    </div>
  );
}

/**
 * Asistente de la orden de servicio (3 pasos). Al crear:
 *  1. la base guarda la orden y decide el origen de cada repuesto con el stock real;
 *  2. si el usuario tiene permiso de Salidas, se pide la salida de inventario (por aprobar);
 *  3. si tiene permiso de Pedidos, se crea la solicitud de pedido con lo que falta.
 * Lo que no pueda pedir queda «por solicitar» en la orden.
 *
 * Con `orden` es el mismo asistente para EDITARLA: los repuestos solo se cambian mientras
 * no empezó el trabajo y no tiene salida ni pedido (después se corrigen allá); las fotos
 * se cambian en la misma ventana y lo que haya que pedir se genera desde la orden.
 */
export function OrdenServicioModal({
  equipo, horometro, kilometraje, aviso, puedeSalidas, puedePedidos, actor, orden, onClose, onCreated,
}: {
  equipo: MaquinariaEquipo; horometro: number | null; kilometraje: number | null; aviso: AvisoServicio | null;
  puedeSalidas: boolean; puedePedidos: boolean; actor: { email: string; nombre: string | null };
  /** La orden a editar (si no viene, se crea una nueva). */
  orden?: OrdenServicio | null;
  onClose: () => void; onCreated: () => void;
}) {
  const editando = !!orden;
  const editables = !orden || repuestosEditables(orden);
  const cerrada = !!orden && (orden.estado === 'realizada' || orden.estado === 'anulada');
  const averiado = ['averiada', 'parada'].includes(equipo.estado_operativo ?? '') || equipo.status === 'FUERA DE SERVICIO';
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState<string | null>(() => orden?.tipo ?? sugerirServicio(averiado ? equipo.estado_nota : null, aviso));
  const [urgencia, setUrgencia] = useState<'normal' | 'alta' | 'urgente'>(orden?.urgencia ?? (averiado ? 'alta' : 'normal'));
  const [intervenciones, setIntervenciones] = useState<string[]>(orden?.intervenciones?.length ? orden.intervenciones : ['Mecánica']);
  const [origen, setOrigen] = useState<'interno' | 'externo'>(orden?.origen ?? 'interno');
  const [responsable, setResponsable] = useState(orden?.responsable ?? '');
  const [descripcion, setDescripcion] = useState(orden ? (orden.descripcion ?? '') : averiado ? (equipo.estado_nota ?? '') : '');
  const [notaCierre, setNotaCierre] = useState(orden?.nota_cierre ?? '');
  const [lineas, setLineas] = useState<Linea[]>(() => (orden?.repuestos ?? []).map((r) => ({
    productoId: r.producto_id, nombre: r.nombre, unidad: r.unidad || 'und', cantidad: Number(r.cantidad) || 1,
    stock: Math.max(0, Number(r.stock_al_crear) || 0), almacen: r.almacen ?? null,
  })));
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [saving, setSaving] = useState(false);
  // Fotos (hasta 4): se comprimen al elegirlas y se suben al crear la orden.
  const fotosOS = useFotosLocales();

  useEffect(() => {
    listProductosActivos().then((ps) => {
      setProductos(ps);
      // Al editar, la decisión inventario / compra se hace con el stock de HOY.
      const porId = new Map(ps.map((p) => [p.id, p]));
      setLineas((prev) => prev.map((l) => {
        const p = l.productoId ? porId.get(l.productoId) : null;
        return p ? { ...l, stock: Math.max(0, Number(p.stock) || 0), almacen: p.almacen || l.almacen } : l;
      }));
    }).catch(() => setProductos([]));
  }, []);

  const resultados = useMemo(() => {
    const q = norm(busqueda);
    const usados = new Set(lineas.map((l) => l.productoId).filter(Boolean));
    return productos
      .filter((p) => !usados.has(p.id) && (!q || q.split(/\s+/).every((t) => norm(`${p.nombre} ${p.sku} ${p.categoria} ${p.nombre_busqueda ?? ''}`).includes(t))))
      .slice(0, q ? 12 : 5);
  }, [productos, busqueda, lineas]);

  const decididas = lineas.map((l) => {
    const d = decidirRepuesto(l.cantidad, l.productoId ? l.stock : 0);
    return { ...l, producto_id: l.productoId, desde_inventario: d.desdeInventario, a_comprar: d.aComprar };
  });
  const efecto = efectoOrden(decididas);
  const servicio = servicioPorId(tipo);

  function agregar(p: Producto) {
    setLineas((prev) => [...prev, { productoId: p.id, nombre: p.nombre, unidad: p.unidad || 'und', cantidad: 1, stock: Math.max(0, Number(p.stock) || 0), almacen: p.almacen || null }]);
    setBusqueda('');
  }
  function agregarNueva() {
    const nombre = busqueda.trim().toUpperCase();
    if (nombre.length < 2) { toast('Escribe el nombre de la pieza en el buscador.', 'warning'); return; }
    setLineas((prev) => [...prev, { productoId: null, nombre, unidad: 'und', cantidad: 1, stock: 0, almacen: null }]);
    setBusqueda('');
  }
  const setCant = (i: number, v: number) => setLineas((prev) => prev.map((l, k) => (k === i ? { ...l, cantidad: Math.max(1, Math.round((Number(v) || 1) * 100) / 100) } : l)));

  async function guardarEdicion() {
    if (!tipo || !orden) return;
    setSaving(true);
    try {
      const nuevos = lineas.map((l) => ({ producto_id: l.productoId, nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad }));
      const cambiaron = editables && firmaRepuestos(nuevos) !== firmaRepuestos(orden.repuestos);
      const r = await editarOrdenServicio(orden.id, {
        tipo, urgencia, intervenciones, origen,
        responsable: responsable.trim(), descripcion: descripcion.trim() || (servicio?.label ?? ''),
        horometro: orden.horometro, kilometraje: orden.kilometraje,
        ...(cerrada ? { nota_cierre: notaCierre.trim() || null } : {}),
        ...(cambiaron ? { repuestos: nuevos } : {}),
      });
      const partes = [`${orden.codigo} actualizada`];
      if (r.notificar) {
        try { await notificarComprasPiezasNuevas({ id: orden.id, repuestos: r.repuestos }); partes.push('Compras notificada de las piezas nuevas'); }
        catch (e) { toast(`No se pudo avisar a Compras: ${e instanceof Error ? e.message : 'error'}. Usa «🔔 Avisar a Compras» en la orden.`, 'warning'); }
      }
      toast(partes.join(' · '), 'success');
      const o2 = { ...orden, estado: r.estado, repuestos: r.repuestos };
      if (cambiaron && (faltaSalida(o2) || faltaCompra(o2))) toast('Los repuestos cambiaron: pide la salida o la compra desde la orden.', 'info');
      onCreated();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : (e as { message?: string })?.message || 'No se pudo guardar la orden', 'error');
    } finally { setSaving(false); }
  }

  async function crear() {
    if (!tipo) return;
    setSaving(true);
    try {
      const r = await crearOrdenServicio({
        equipo_id: equipo.id, tipo, urgencia, intervenciones, origen,
        responsable: responsable.trim(), descripcion: descripcion.trim() || (servicio?.label ?? ''),
        horometro, kilometraje,
        repuestos: lineas.map((l) => ({ producto_id: l.productoId, nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad })),
      });
      const orden = {
        id: r.id, codigo: r.codigo, estado: r.estado, repuestos: r.repuestos, tipo, urgencia,
        solicitud_salida_id: null, orden_compra_id: null,
      } as unknown as OrdenServicio;
      const partes: string[] = [`${r.codigo} creada`];
      const pendientes: string[] = [];
      // Fotos: la orden ya existe (su carpeta lleva el id). Si alguna falla, se agrega luego desde la orden.
      if (fotosOS.fotos.length) {
        const { subidas, fallos } = await subirFotosOrden(r.id, fotosOS.fotos.map((f) => f.file), actor.email, actor.nombre);
        if (subidas) partes.push(subidas === 1 ? '1 foto' : `${subidas} fotos`);
        if (fallos.length) toast(`No se pudieron subir ${fallos.length} foto(s): ${fallos.join('; ')}. Agrégalas desde la orden.`, 'warning');
      }
      if (faltaSalida(orden)) {
        if (puedeSalidas) {
          try { partes.push(`salida ${await solicitarSalidaDeOrden(orden, equipo.equipo, actor)} por aprobar`); }
          catch (e) { pendientes.push(`la salida de inventario (${e instanceof Error ? e.message : 'error'})`); }
        } else pendientes.push('la salida de inventario (no tienes permiso de Salidas)');
      }
      // Piezas que no existen en el inventario: las da de alta Compras (la orden no crea
      // productos). Se le avisa con una notificación dirigida y queda constancia en la orden.
      const hayNuevas = r.repuestos.some((x) => !x.producto_id);
      if (hayNuevas) {
        try { await notificarComprasPiezasNuevas(orden); partes.push('Compras notificada de las piezas nuevas'); }
        catch (e) { pendientes.push(`avisar a Compras de las piezas nuevas (${e instanceof Error ? e.message : 'error'})`); }
      }
      if (faltaCompra(orden) && soloPiezasNuevasPorComprar(r.repuestos)) {
        // Sin productos del inventario no hay SP posible: queda «por solicitar compra».
      } else if (faltaCompra(orden)) {
        if (puedePedidos) {
          try { partes.push(`compra ${await solicitarCompraDeOrden(orden, equipo, actor)} solicitada`); }
          catch (e) { pendientes.push(`la compra (${e instanceof Error ? e.message : 'error'})`); }
        } else pendientes.push('la compra (no tienes permiso de Pedidos)');
      }
      notify(`🔧 ${partes.join(' · ')} — ${equipo.equipo}`, 'success', {
        link: `#/app/maquinaria/equipo/${equipo.id}?tab=servicios`,
        detail: servicio?.label ?? tipo,
      });
      if (pendientes.length) toast(`Queda por solicitar: ${pendientes.join('; ')}. Se puede generar después desde la orden.`, 'warning');
      onCreated();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : (e as { message?: string })?.message || 'No se pudo crear la orden', 'error');
    } finally { setSaving(false); }
  }

  const listo = paso === 0 ? !!tipo : true;

  return (
    <Modal title={editando ? `✎ Editar ${orden?.codigo} · ${equipo.equipo}` : `🔧 Orden de servicio · ${equipo.equipo}`} size="lg" onClose={onClose}
      footer={<>
        {paso > 0
          ? <button className="btn btn-ghost" onClick={() => setPaso(paso - 1)} disabled={saving}>Atrás</button>
          : <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>}
        {paso < 2
          ? <button className="btn btn-primary" disabled={!listo} onClick={() => setPaso(paso + 1)}>{paso === 0 ? (editables ? 'Elegir repuestos' : 'Ver repuestos') : editando ? 'Revisar cambios' : 'Revisar orden'}</button>
          : editando
            ? <button className="btn btn-primary" disabled={saving} onClick={() => void guardarEdicion()}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            : <button className="btn btn-primary" disabled={saving || fotosOS.preparando > 0} onClick={() => void crear()}>{saving ? 'Creando…' : fotosOS.preparando > 0 ? 'Preparando fotos…' : 'Crear orden de servicio'}</button>}
      </>}>
      <div className="flo" style={{ display: 'grid', gap: '.8rem' }}>
        <ol className="flo-wizard-steps" aria-label="Pasos">
          {PASOS.map((p, i) => <li key={p} className={i < paso ? 'done' : i === paso ? 'current' : ''} aria-current={i === paso ? 'step' : undefined}>{i + 1}. {p}</li>)}
        </ol>

        {paso === 0 && (
          <>
            {editando && orden && (
              <div className="aviso info sm"><span className="aviso-icono">✎</span><div>
                Editando <strong>{orden.codigo}</strong> · {ORDEN_ESTADOS[orden.estado]?.label ?? orden.estado}. Los cambios quedan en la auditoría.
              </div></div>
            )}
            {!editando && tipo && (averiado || aviso?.nivel !== 'ok') && (
              <div className="aviso info"><span className="aviso-icono">💡</span><div><strong>Sugerido por el estado del equipo</strong> — {averiado ? (equipo.estado_nota || 'equipo averiado') : 'servicio por horas/km próximo'}. Puedes elegir otro.</div></div>
            )}
            <div className="flo-svc-grid" role="group" aria-label="Tipo de servicio">
              {SERVICIOS.map((s) => (
                <button key={s.id} type="button" className="flo-svc" aria-pressed={tipo === s.id} onClick={() => setTipo(s.id)}>
                  <span className="ico">{s.icon}</span><strong>{s.label}</strong><span>{s.hint}</span>
                </button>
              ))}
            </div>
            <div className="form-row"><label>Urgencia</label>
              <div className="flo-opt">{URGENCIAS.map((u) => <button key={u.id} type="button" className="flo-pill" aria-pressed={urgencia === u.id} onClick={() => setUrgencia(u.id)}>{u.label}</button>)}</div>
            </div>
            <div className="form-row"><label>Tipo de intervención</label>
              <div className="flo-opt">{INTERVENCIONES.map((i) => (
                <button key={i} type="button" className="flo-pill" aria-pressed={intervenciones.includes(i)}
                  onClick={() => setIntervenciones((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))}>{i}</button>
              ))}</div>
            </div>
            <div className="form-row"><label>Lo realiza</label>
              <div className="flo-seg" role="group" aria-label="Lo realiza">
                <button type="button" aria-pressed={origen === 'interno'} onClick={() => setOrigen('interno')}>🏭 Taller propio</button>
                <button type="button" aria-pressed={origen === 'externo'} onClick={() => setOrigen('externo')}>🤝 Proveedor externo</button>
              </div>
            </div>
            <div className="form-row"><label htmlFor="os-resp">{origen === 'interno' ? 'Mecánico responsable' : 'Proveedor del servicio'}</label>
              <input id="os-resp" className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder={origen === 'interno' ? 'Nombre del mecánico' : 'Nombre del proveedor'} />
            </div>
            <div className="form-row"><label htmlFor="os-desc">Descripción del problema o trabajo</label>
              <textarea id="os-desc" className="textarea" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se observa y qué hay que hacer" />
            </div>
            {cerrada && (
              <div className="form-row"><label htmlFor="os-cierre">{orden?.estado === 'anulada' ? 'Motivo de la anulación' : 'Nota de cierre'}</label>
                <textarea id="os-cierre" className="textarea" rows={2} value={notaCierre} onChange={(e) => setNotaCierre(e.target.value)} />
              </div>
            )}
            {editando && orden ? <FotosOrden ordenId={orden.id} canWrite /> : <FotosNuevaOrden estado={fotosOS} />}
            {origen === 'externo' && <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>Si el proveedor cobra el servicio, pídelo también en <strong>Pedidos → 🔧 Servicios</strong> casado a este equipo: aparecerá en la pestaña Compras.</p>}
          </>
        )}

        {paso === 1 && !editables && (
          <>
            <div className="aviso warning sm"><span className="aviso-icono">🔒</span><div>
              {orden?.solicitud_salida_id || orden?.orden_compra_id
                ? 'Esta orden ya tiene su salida o su pedido: sus repuestos se corrigen allá (Salidas / Pedidos).'
                : 'El trabajo ya empezó o la orden está cerrada: sus repuestos ya no se cambian.'}
            </div></div>
            {orden?.repuestos.length ? (
              <ul className="flo-parts">
                {orden.repuestos.map((r, i) => <li key={i}><span>{r.nombre}</span><strong className="mono">{fmtNum(r.cantidad)} {r.unidad}</strong></li>)}
              </ul>
            ) : <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>Sin repuestos.</p>}
          </>
        )}

        {paso === 1 && editables && (
          <>
            <div className="form-row"><label htmlFor="os-inv">Buscar en inventario</label>
              <input id="os-inv" className="input" type="search" autoComplete="off" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Filtro, caucho, aceite, manguera…" />
            </div>
            <div style={{ display: 'grid', gap: '.35rem', maxHeight: 260, overflowY: 'auto' }}>
              {resultados.map((p) => (
                <button key={p.id} type="button" className="flo-linea" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => agregar(p)}>
                  <div className="flo-linea-top">
                    <div><strong>{p.nombre}</strong><small>{p.sku} · {p.categoria} · {p.almacen}</small></div>
                    <span style={{ fontSize: '.76rem', fontWeight: 700, color: Number(p.stock) > 0 ? '#5fdca9' : '#ff8a96', whiteSpace: 'nowrap' }}>
                      {Number(p.stock) > 0 ? `${fmtNum(p.stock)} ${p.unidad} en stock` : 'Sin stock'}
                    </span>
                  </div>
                </button>
              ))}
              {!resultados.length && <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>No está en el inventario. Agrégala como pieza nueva: Compras la dará de alta (se le notifica al crear la orden).</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={agregarNueva}>➕ Agregar como pieza que no está en inventario</button>

            <div className="form-row" style={{ marginBottom: 0 }}><label>Repuestos de esta orden ({lineas.length})</label>
              {lineas.length ? lineas.map((l, i) => (
                <div key={`${l.productoId ?? l.nombre}-${i}`} className="flo-linea">
                  <div className="flo-linea-top">
                    <div style={{ minWidth: 0 }}><strong>{l.nombre}</strong><small>{l.productoId ? `${fmtNum(l.stock)} ${l.unidad} en stock${l.almacen ? ` · ${l.almacen}` : ''}` : 'Pieza nueva · Compras la dará de alta'}</small></div>
                    <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
                      <div className="flo-qty">
                        <button type="button" aria-label="Menos" onClick={() => setCant(i, l.cantidad - 1)}>−</button>
                        <input inputMode="decimal" value={l.cantidad} aria-label={`Cantidad de ${l.nombre}`} onChange={(e) => setCant(i, Number(e.target.value.replace(',', '.')))} />
                        <button type="button" aria-label="Más" onClick={() => setCant(i, l.cantidad + 1)}>+</button>
                      </div>
                      <button type="button" className="btn btn-icon btn-ghost" aria-label={`Quitar ${l.nombre}`} onClick={() => setLineas((p) => p.filter((_, k) => k !== i))}>✕</button>
                    </div>
                  </div>
                  <Decision l={l} />
                </div>
              )) : <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>Sin repuestos. Puedes seguir si el servicio es solo mano de obra.</p>}
            </div>
          </>
        )}

        {paso === 2 && editando && orden && (
          <VistaPrevia titulo="Se guarda la orden así">
            <Dato label="Orden">{orden.codigo}</Dato>
            <Dato label="Servicio">{servicio?.label ?? tipo ?? undefined}</Dato>
            <Dato label="Urgencia">{URGENCIAS.find((u) => u.id === urgencia)?.label}</Dato>
            <Dato label="Intervención">{intervenciones.join(', ') || undefined}</Dato>
            <Dato label={origen === 'interno' ? 'Mecánico' : 'Proveedor'}>{responsable.trim() || undefined}</Dato>
            <Dato label="Descripción">{descripcion.trim() || undefined}</Dato>
            {cerrada && <Dato label="Nota de cierre">{notaCierre.trim() || undefined}</Dato>}
            <Dato label="Repuestos">{lineas.length ? decididas.map((l) => `${fmtNum(l.cantidad)} ${l.unidad} ${l.nombre}${editables && l.a_comprar > 0 ? ` (${fmtNum(l.a_comprar)} a compra)` : ''}`).join(' · ') : 'Sin repuestos'}</Dato>
            {editables && <Dato label="La orden queda">{efecto.compran ? 'Esperando repuestos (la compra se pide desde la orden)' : 'Abierta: todo sale del inventario'}</Dato>}
          </VistaPrevia>
        )}

        {paso === 2 && !editando && (
          <div className="flo-flow">
            <div className="flo-flow-node main"><span className="ico">🧾</span><div>
              <strong>Orden de servicio · {servicio?.label}</strong>
              <p>{equipo.equipo} · urgencia {urgencia} · {responsable.trim() || 'responsable por asignar'}</p>
              <p>{descripcion.trim() || 'Sin descripción'}</p>
              {fotosOS.fotos.length > 0 && <p>📷 {fotosOS.fotos.length === 1 ? '1 foto' : `${fotosOS.fotos.length} fotos`} · se suben al crear la orden</p>}
            </div></div>
            <div className="flo-flow-link" />
            <div className="flo-flow-split">
              <div className="flo-flow-node"><span className="ico">📦</span><div>
                <strong>Solicitud de salida de inventario</strong>
                {efecto.salen ? <ul className="flo-mini">{decididas.filter((l) => l.producto_id && l.desde_inventario > 0).map((l, i) => <li key={i}>{fmtNum(l.desde_inventario)} {l.unidad} · {l.nombre}{l.almacen ? <em> · almacén {l.almacen}</em> : null}</li>)}</ul> : <p>No se toma nada del inventario.</p>}
                {efecto.salen > 0 && <p>{puedeSalidas ? 'Va a Salidas «por aprobar»: descuenta stock cuando se ejecute.' : '⚠️ No tienes permiso de Salidas: quedará por solicitar.'}</p>}
              </div></div>
              <div className="flo-flow-node"><span className="ico">🛒</span><div>
                <strong>{efecto.compran ? 'Solicitud de pedido' : 'Sin compras'}</strong>
                {efecto.compran ? <ul className="flo-mini">{decididas.filter((l) => l.a_comprar > 0).map((l, i) => <li key={i}>{fmtNum(l.a_comprar)} {l.unidad} · {l.nombre}{l.producto_id ? null : <em> · pieza nueva</em>}</li>)}</ul> : <p>Todo está en inventario.</p>}
                {efecto.compran > 0 && <p>{efecto.compran === efecto.nuevos ? 'Solo hay piezas nuevas: la compra queda por solicitar hasta que Compras las dé de alta.' : puedePedidos ? 'Entra a Pedidos como solicitud (SP) para aprobar y cotizar.' : '⚠️ No tienes permiso de Pedidos: quedará por solicitar.'}</p>}
                {efecto.nuevos > 0 && <p>🔔 Compras recibirá una notificación con las {efecto.nuevos} pieza(s) nueva(s) para darlas de alta.</p>}
              </div></div>
            </div>
            <div className="flo-flow-link" />
            <div className="flo-flow-node"><span className="ico">🚜</span><div>
              <strong>El equipo pasa a</strong>
              <p style={{ margin: '.35rem 0' }}><span className={`flo-chip tone-${ESTADOS_EQUIPO[efecto.estadoEquipo].tono}`}>{ESTADOS_EQUIPO[efecto.estadoEquipo].icon} {ESTADOS_EQUIPO[efecto.estadoEquipo].label}</span></p>
              <p>{efecto.compran ? 'Cuando Pedidos reciba la compra, la orden pasa sola a «en proceso».' : 'El taller puede empezar el trabajo de inmediato.'}</p>
              <p className="muted" style={{ fontSize: '.74rem' }}>El stock se vuelve a revisar al crear: si cambió, la orden toma lo que haya en ese momento.</p>
            </div></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
