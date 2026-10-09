import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { notify } from '@/shared/lib/notify';
import { norm } from '@/shared/lib/texto';
import { num as fmtNum } from '@/shared/lib/format';
import { listProductosActivos } from '@/modules/pedidos/pedidos.repository';
import type { Producto } from '@/shared/lib/types';
import {
  SERVICIOS, URGENCIAS, INTERVENCIONES, ESTADOS_EQUIPO, decidirRepuesto, efectoOrden, servicioPorId, sugerirServicio,
  type AvisoServicio, type TonoFlota,
} from './flota';
import {
  crearOrdenServicio, solicitarSalidaDeOrden, solicitarCompraDeOrden, faltaSalida, faltaCompra, type OrdenServicio,
} from './flota.repository';
import type { MaquinariaEquipo } from './maquinariaEquipos.repository';

interface Linea { productoId: string | null; nombre: string; unidad: string; cantidad: number; stock: number }

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
 */
export function OrdenServicioModal({
  equipo, horometro, kilometraje, aviso, puedeSalidas, puedePedidos, actor, onClose, onCreated,
}: {
  equipo: MaquinariaEquipo; horometro: number | null; kilometraje: number | null; aviso: AvisoServicio | null;
  puedeSalidas: boolean; puedePedidos: boolean; actor: { email: string; nombre: string | null };
  onClose: () => void; onCreated: () => void;
}) {
  const averiado = ['averiada', 'parada'].includes(equipo.estado_operativo ?? '') || equipo.status === 'FUERA DE SERVICIO';
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState<string | null>(() => sugerirServicio(averiado ? equipo.estado_nota : null, aviso));
  const [urgencia, setUrgencia] = useState<'normal' | 'alta' | 'urgente'>(averiado ? 'alta' : 'normal');
  const [intervenciones, setIntervenciones] = useState<string[]>(['Mecánica']);
  const [origen, setOrigen] = useState<'interno' | 'externo'>('interno');
  const [responsable, setResponsable] = useState('');
  const [descripcion, setDescripcion] = useState(averiado ? (equipo.estado_nota ?? '') : '');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { listProductosActivos().then(setProductos).catch(() => setProductos([])); }, []);

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
    setLineas((prev) => [...prev, { productoId: p.id, nombre: p.nombre, unidad: p.unidad || 'und', cantidad: 1, stock: Math.max(0, Number(p.stock) || 0) }]);
    setBusqueda('');
  }
  function agregarNueva() {
    const nombre = busqueda.trim().toUpperCase();
    if (nombre.length < 2) { toast('Escribe el nombre de la pieza en el buscador.', 'warning'); return; }
    setLineas((prev) => [...prev, { productoId: null, nombre, unidad: 'und', cantidad: 1, stock: 0 }]);
    setBusqueda('');
  }
  const setCant = (i: number, v: number) => setLineas((prev) => prev.map((l, k) => (k === i ? { ...l, cantidad: Math.max(1, Math.round((Number(v) || 1) * 100) / 100) } : l)));

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
      if (faltaSalida(orden)) {
        if (puedeSalidas) {
          try { partes.push(`salida ${await solicitarSalidaDeOrden(orden, equipo.equipo, actor)} por aprobar`); }
          catch (e) { pendientes.push(`la salida de inventario (${e instanceof Error ? e.message : 'error'})`); }
        } else pendientes.push('la salida de inventario (no tienes permiso de Salidas)');
      }
      if (faltaCompra(orden)) {
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
    <Modal title={`🔧 Orden de servicio · ${equipo.equipo}`} size="lg" onClose={onClose}
      footer={<>
        {paso > 0
          ? <button className="btn btn-ghost" onClick={() => setPaso(paso - 1)} disabled={saving}>Atrás</button>
          : <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>}
        {paso < 2
          ? <button className="btn btn-primary" disabled={!listo} onClick={() => setPaso(paso + 1)}>{paso === 0 ? 'Elegir repuestos' : 'Revisar orden'}</button>
          : <button className="btn btn-primary" disabled={saving} onClick={() => void crear()}>{saving ? 'Creando…' : 'Crear orden de servicio'}</button>}
      </>}>
      <div className="flo" style={{ display: 'grid', gap: '.8rem' }}>
        <ol className="flo-wizard-steps" aria-label="Pasos">
          {PASOS.map((p, i) => <li key={p} className={i < paso ? 'done' : i === paso ? 'current' : ''} aria-current={i === paso ? 'step' : undefined}>{i + 1}. {p}</li>)}
        </ol>

        {paso === 0 && (
          <>
            {tipo && (averiado || aviso?.nivel !== 'ok') && (
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
            {origen === 'externo' && <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>Si el proveedor cobra el servicio, pídelo también en <strong>Pedidos → 🔧 Servicios</strong> casado a este equipo: aparecerá en la pestaña Compras.</p>}
          </>
        )}

        {paso === 1 && (
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
              {!resultados.length && <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>No está en el inventario. Agrégala como pieza nueva y se pedirá a compras.</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={agregarNueva}>➕ Agregar como pieza que no está en inventario</button>

            <div className="form-row" style={{ marginBottom: 0 }}><label>Repuestos de esta orden ({lineas.length})</label>
              {lineas.length ? lineas.map((l, i) => (
                <div key={`${l.productoId ?? l.nombre}-${i}`} className="flo-linea">
                  <div className="flo-linea-top">
                    <div style={{ minWidth: 0 }}><strong>{l.nombre}</strong><small>{l.productoId ? `${fmtNum(l.stock)} ${l.unidad} en stock` : 'Pieza nueva · no existe en inventario'}</small></div>
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

        {paso === 2 && (
          <div className="flo-flow">
            <div className="flo-flow-node main"><span className="ico">🧾</span><div>
              <strong>Orden de servicio · {servicio?.label}</strong>
              <p>{equipo.equipo} · urgencia {urgencia} · {responsable.trim() || 'responsable por asignar'}</p>
              <p>{descripcion.trim() || 'Sin descripción'}</p>
            </div></div>
            <div className="flo-flow-link" />
            <div className="flo-flow-split">
              <div className="flo-flow-node"><span className="ico">📦</span><div>
                <strong>Solicitud de salida de inventario</strong>
                {efecto.salen ? <p>{decididas.filter((l) => l.producto_id && l.desde_inventario > 0).map((l) => `${fmtNum(l.desde_inventario)} ${l.unidad} · ${l.nombre}`).join(' · ')}</p> : <p>No se toma nada del inventario.</p>}
                {efecto.salen > 0 && <p>{puedeSalidas ? 'Va a Salidas «por aprobar»: descuenta stock cuando se ejecute.' : '⚠️ No tienes permiso de Salidas: quedará por solicitar.'}</p>}
              </div></div>
              <div className="flo-flow-node"><span className="ico">🛒</span><div>
                <strong>{efecto.compran ? 'Solicitud de pedido' : 'Sin compras'}</strong>
                {efecto.compran ? <p>{decididas.filter((l) => l.a_comprar > 0).map((l) => `${fmtNum(l.a_comprar)} ${l.unidad} · ${l.nombre}`).join(' · ')}</p> : <p>Todo está en inventario.</p>}
                {efecto.compran > 0 && <p>{puedePedidos ? 'Entra a Pedidos como solicitud (SP) para aprobar y cotizar.' : '⚠️ No tienes permiso de Pedidos: quedará por solicitar.'}{efecto.nuevos ? ' Las piezas nuevas van anotadas en la nota.' : ''}</p>}
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
