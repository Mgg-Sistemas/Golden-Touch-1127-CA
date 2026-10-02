/* ============================================================
   Golden Touch · Cocina · Comidas (vista de teléfono)

   La pantalla del que sirve la comida, con el celular en la mano: toca
   «Desayuno», «Almuerzo» o «Cena», pone cuántas personas comieron y qué se
   consumió, le saca fotos y guarda. Puede cargar la comida de un día
   anterior. Abajo ve las últimas comidas y puede abrir cada una para
   pasarla por WhatsApp, ver o agregar fotos, corregirla o borrarla (con
   confirmación).

   Escribe en las MISMAS tablas que el módulo de PC (crearMovimientoCocina /
   actualizarMovimientoCocina / eliminarMovimientoCocina, con el descuento de
   víveres del inventario), así que lo que se hace aquí aparece al instante
   en la PC y viceversa (realtime). La analista lo revisa desde la PC, lo
   puede corregir y lo marca como verificado; si después se corrige desde el
   teléfono, la marca se quita para que lo vuelva a mirar.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { num, dateTime } from '@/shared/lib/format';
import type { Producto } from '@/shared/lib/types';
import { AdjuntosSalida, SelectorAdjuntos } from '@/modules/salidas/AdjuntosSalida';
import {
  listViveres, listMovimientosCocina, crearMovimientoCocina, actualizarMovimientoCocina, eliminarMovimientoCocina,
  TIPOS_COMIDA, labelTipoComida, type CocinaItem, type CocinaMovimiento, type TipoComida,
} from './cocina.repository';
import { getMercadoActivo, type Mercado } from './cocinaMercado.repository';
import { adjuntosCocina, MODULO_ADJUNTO_COCINA } from './adjuntosCocina.repository';
import { avisoFueraDelCiclo, fueraDelCiclo } from './fechaComida';
import {
  diaCaracas, diasAtras, errorFechaComida, errorPersonas, etiquetaDia, hoyCaracas, instanteServicio, yaCargada, ROL_COCINA,
} from './comidaMovil';
import { mensajeComida } from './mensajeComida';

/** Cuántas comidas se ven en el teléfono. El registro completo está en la PC. */
export const ULTIMAS_EN_TELEFONO = 10;
/** Hasta cuántos días atrás se trae la lista (para avisar de un doble registro). */
const DIAS_RECIENTES = 45;
/** Cuántos víveres se muestran sin buscar: más que esto es una lista para escribir, no para mirar. */
const VIVERES_A_LA_VISTA = 40;

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const icono = (t: TipoComida) => TIPOS_COMIDA.find((x) => x.value === t)?.icono ?? '🍽';
const texto = (err: unknown, respaldo: string) =>
  (err instanceof Error ? err.message
    : err && typeof err === 'object' && 'message' in err && (err as { message?: unknown }).message
      ? String((err as { message: unknown }).message)
      : respaldo);

export function ComidasMovilView() {
  const { user } = useSession();
  const { can, appUser, isAdmin, role } = usePermissions();
  const canWrite = isAdmin || can('cocina', 'escritura');
  // El rol COCINA trabaja solo desde aquí: no tiene módulo de PC al que ir.
  const esCocina = role === ROL_COCINA;
  const actor = appUser?.email ?? user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [movs, setMovs] = useState<CocinaMovimiento[]>([]);
  const [viveres, setViveres] = useState<Producto[]>([]);
  const [mercado, setMercado] = useState<Mercado | null>(null);
  const [conteo, setConteo] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ tipo: TipoComida; editar: CocinaMovimiento | null } | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<CocinaMovimiento[]> => {
    const [ms, vs, mk] = await Promise.all([
      listMovimientosCocina({ desde: diasAtras(hoyCaracas(), DIAS_RECIENTES) }),
      listViveres(),
      getMercadoActivo().catch(() => null),
    ]);
    setMovs(ms); setViveres(vs); setMercado(mk);
    try { setConteo(await adjuntosCocina.contar(MODULO_ADJUNTO_COCINA, ms.slice(0, ULTIMAS_EN_TELEFONO).map((m) => m.id))); }
    catch { /* el contador de fotos es adorno: sin él la lista se muestra igual */ }
    return ms;
  }, []);

  useEffect(() => {
    let cancel = false;
    cargar().catch((e) => { if (!cancel) toast(texto(e, 'No se pudo cargar'), 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [cargar]);
  // `productos`: al desactivar uno en Inventario sale de la lista sin recargar (no mueve existencias).
  useRealtime(['cocina_movimientos', 'existencias', 'productos', 'cocina_adjuntos'], () => { void cargar().catch(() => {}); });

  const hoy = hoyCaracas();
  const unidades = useMemo(() => Object.fromEntries(viveres.map((p) => [p.id, p.unidad ?? null])), [viveres]);
  const ultimas = movs.slice(0, ULTIMAS_EN_TELEFONO);
  // Si la comida abierta la borró otro (o se borró aquí), el detalle se cierra solo.
  const detalle = detalleId ? movs.find((m) => m.id === detalleId) ?? null : null;

  return (
    <div className="surtidor comidas-movil">
      <header className="surt-head">
        <div>
          <h1>🍽 Comidas</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{actorName ?? actor}</div>
        </div>
        {!esCocina && <Link to="/app/cocina" className="btn btn-ghost">🖥 Módulo completo</Link>}
      </header>

      {loading && <p className="muted">Cargando…</p>}

      {!loading && !form && canWrite && (
        <>
          <div className="surt-rotulo">¿Qué comida vas a cargar?</div>
          <div className="comida-tipos">
            {TIPOS_COMIDA.map((t) => {
              const ya = yaCargada(movs, hoy, t.value);
              return (
                <button key={t.value} type="button" className={`surt-btn${ya ? ' hecha' : ''}`}
                  onClick={() => setForm({ tipo: t.value, editar: null })}>
                  <span className="icono" aria-hidden>{t.icono}</span>
                  <span>{t.label}</span>
                  <small>{ya ? `✔ Hoy: ${num(ya.platos)} personas` : 'Sin cargar hoy'}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
      {!loading && !canWrite && (
        <div className="aviso warning sm" style={{ margin: '.75rem 0' }}>
          <span className="aviso-icono">👁</span>
          <div>Tu rol solo puede ver. Para cargar comidas hace falta escritura en Cocina.</div>
        </div>
      )}

      {form && (
        <FormularioComida key={form.editar?.id ?? `nueva-${form.tipo}`} tipoInicial={form.tipo} editar={form.editar}
          viveres={viveres} movs={movs} mercado={mercado} actor={actor} actorName={actorName}
          onCancel={() => setForm(null)}
          onSaved={async (id) => {
            setForm(null);
            const lista = await cargar().catch(() => [] as CocinaMovimiento[]);
            // Se abre el detalle de lo recién cargado: es donde está el botón para pasarlo por WhatsApp.
            if (lista.some((m) => m.id === id)) setDetalleId(id);
          }} />
      )}

      {!loading && (
        <section className="surt-lista">
          <h2>Últimas {ULTIMAS_EN_TELEFONO} comidas</h2>
          {!ultimas.length && <EmptyState icon="🍽" message="Todavía no hay comidas cargadas." />}
          {ultimas.map((m) => {
            const n = conteo.get(m.id) ?? 0;
            return (
              <button key={m.id} type="button" className="surt-mov" onClick={() => setDetalleId(m.id)}>
                <span className="icono" aria-hidden>{icono(m.tipo_comida)}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="titulo">{labelTipoComida(m.tipo_comida)} · {etiquetaDia(diaCaracas(m.at), hoy)}</div>
                  <div className="sub">
                    {m.codigo ?? ''}{(m.items ?? []).length ? ` · ${(m.items ?? []).length} productos` : ''}
                    {m.actor_name ? ` · ${m.actor_name}` : ''}
                    {n > 0 ? ` · 📎 ${n}` : ''}
                    {m.verificado_at ? ' · ✔ Verificado' : ''}
                  </div>
                </span>
                <span className="litros">{num(m.platos)} <small>pers.</small></span>
              </button>
            );
          })}
          {movs.length > ULTIMAS_EN_TELEFONO && (
            <p className="muted" style={{ fontSize: '.85rem' }}>Aquí se ven las últimas {ULTIMAS_EN_TELEFONO}. El registro completo lo lleva la analista en la PC.</p>
          )}
        </section>
      )}

      {detalle && (
        <DetalleComida mov={detalle} unidades={unidades} canWrite={canWrite} actor={actor} actorName={actorName} hoy={hoy}
          onClose={() => setDetalleId(null)}
          onEditar={() => { setDetalleId(null); setForm({ tipo: detalle.tipo_comida, editar: detalle }); window.scrollTo({ top: 0 }); }}
          onBorrado={async () => { setDetalleId(null); await cargar().catch(() => {}); }} />
      )}
    </div>
  );
}

/* ───────────── Formulario: cargar o corregir una comida ───────────── */
function FormularioComida({ tipoInicial, editar, viveres, movs, mercado, actor, actorName, onCancel, onSaved }: {
  tipoInicial: TipoComida; editar: CocinaMovimiento | null; viveres: Producto[]; movs: CocinaMovimiento[];
  mercado: Mercado | null; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: (id: string) => Promise<void>;
}) {
  const esEdicion = !!editar;
  const hoy = hoyCaracas();
  // Lo que esta comida ya había consumido: al corregirla vuelve al stock, así que cuenta como disponible.
  const yaConsumido = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of editar?.items ?? []) m.set(it.producto_id, (m.get(it.producto_id) ?? 0) + Number(it.cantidad || 0));
    return m;
  }, [editar]);
  // Datos de respaldo de los víveres de la comida, por si alguno ya no está activo en el inventario.
  const respaldo = useMemo(() => new Map((editar?.items ?? []).map((it) => [it.producto_id, it])), [editar]);
  const porId = useMemo(() => new Map(viveres.map((p) => [p.id, p])), [viveres]);

  const [tipo, setTipo] = useState<TipoComida>(tipoInicial);
  const [fecha, setFecha] = useState(editar?.at ? diaCaracas(editar.at) : hoy);
  const [personas, setPersonas] = useState(editar ? String(editar.platos ?? '') : '');
  const [sel, setSel] = useState<Record<string, string>>(() =>
    Object.fromEntries((editar?.items ?? []).map((it) => [it.producto_id, String(it.cantidad ?? '')])));
  const [recien, setRecien] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [nota, setNota] = useState(editar?.nota ?? '');
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [etapa, setEtapa] = useState<'comida' | 'fotos'>('comida');
  // Con mala señal, subir fotos puede tardar: pasados unos segundos se avisa que la
  // comida ya está guardada, para que nadie la vuelva a cargar.
  const [demorado, setDemorado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo elegido en esta pantalla, para no perder el nombre si el producto se desactiva con el formulario abierto.
  const [elegidos, setElegidos] = useState<Record<string, CocinaItem>>({});
  useEffect(() => {
    if (!guardando) { setDemorado(false); return; }
    const t = setTimeout(() => setDemorado(true), 12_000);
    return () => clearTimeout(t);
  }, [guardando]);

  const disponible = (pid: string) => Number(porId.get(pid)?.stock ?? 0) + (yaConsumido.get(pid) ?? 0);
  const lineas = Object.entries(sel).map(([pid, cantStr]) => {
    const p = porId.get(pid);
    const fb = respaldo.get(pid) ?? elegidos[pid];
    const cant = Number(String(cantStr).replace(',', '.')) || 0;
    return {
      pid, cant,
      sku: p?.sku ?? fb?.sku ?? '',
      nombre: p?.nombre ?? fb?.nombre ?? 'Producto',
      unidad: (p?.unidad ?? fb?.unidad ?? '') || '',
      precio: Number(p?.precio ?? fb?.precio) || 0,
      almacen: p?.almacen ?? fb?.almacen ?? null,
      hay: p ? disponible(pid) : null,
      excede: !!p && cant > disponible(pid),
      // Desactivado en el inventario y la comida le saca más de lo que ya traía: no se puede guardar.
      inactivo: !p && cant > (yaConsumido.get(pid) ?? 0),
    };
  });

  const porElegir = useMemo(() => {
    const q = norm(busqueda).trim();
    return viveres.filter((p) => !(p.id in sel) && (!q || norm(`${p.nombre} ${p.sku}`).includes(q)));
  }, [viveres, sel, busqueda]);

  const repetida = yaCargada(movs, fecha, tipo, editar?.id ?? null);
  const avisoCiclo = avisoFueraDelCiclo(fueraDelCiclo(fecha, mercado), mercado);

  function agregar(pid: string) {
    const p = porId.get(pid);
    if (p) {
      setElegidos((m) => ({ ...m, [pid]: {
        producto_id: pid, sku: p.sku, nombre: p.nombre, cantidad: 0, precio: Number(p.precio) || 0, almacen: p.almacen ?? null, unidad: p.unidad ?? null,
      } }));
    }
    setSel((s) => ({ ...s, [pid]: '' }));
    setRecien(pid);
    setBusqueda('');
  }
  function quitar(pid: string) {
    setSel((s) => { const { [pid]: _fuera, ...resto } = s; return resto; });
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const mal = errorFechaComida(fecha, hoy) ?? errorPersonas(personas);
    if (mal) { setError(mal); return; }
    if (!lineas.length) { setError('Agrega al menos un producto de lo que se consumió.'); return; }
    const sinCantidad = lineas.find((l) => !(l.cant > 0));
    if (sinCantidad) { setError(`Indica la cantidad de ${sinCantidad.nombre}, o quítalo de la lista.`); return; }
    const deBaja = lineas.find((l) => l.inactivo);
    if (deBaja) { setError(`${deBaja.nombre} fue desactivado en el inventario. Quítalo de la lista con la ✕ y vuelve a guardar.`); return; }
    const pasada = lineas.find((l) => l.excede);
    if (pasada) { setError(`No hay tanto ${pasada.nombre}: quedan ${num(pasada.hay)} ${pasada.unidad}.`.trim()); return; }

    const items: CocinaItem[] = lineas.map((l) => ({
      producto_id: l.pid, sku: l.sku, nombre: l.nombre, cantidad: l.cant, precio: l.precio, almacen: l.almacen, unidad: l.unidad || null,
    }));
    const platos = Number(String(personas).replace(',', '.'));
    const at = instanteServicio({ fecha, tipo, originalAt: editar?.at ?? null });

    setGuardando(true); setEtapa('comida');
    try {
      let id: string;
      if (editar) {
        // Corregida desde el teléfono: la analista la tiene que volver a mirar.
        id = (await actualizarMovimientoCocina(editar.id, { tipoComida: tipo, platos, items, nota: nota || null, at, actor, actorName, quitarVerificacion: true })).id;
      } else {
        id = (await crearMovimientoCocina({ tipoComida: tipo, platos, items, nota: nota || null, at, actor, actorName, origen: 'telefono' })).id;
        // Las fotos se suben recién ahora: la carpeta lleva el id de la comida.
        if (adjuntos.length) {
          setEtapa('fotos');
          const r = await adjuntosCocina.subir(MODULO_ADJUNTO_COCINA, id, adjuntos, actor);
          for (const f of r.fallos) toast(`Comida guardada, pero una foto no se pudo subir: ${f}`, 'error');
        }
      }
      toast(`${labelTipoComida(tipo)}: ${editar ? 'corregido' : 'registrado'}`, 'success');
      await onSaved(id);
    } catch (err) { setError(texto(err, 'No se pudo guardar.')); }
    finally { setGuardando(false); }
  }

  return (
    <form className="surt-form card" onSubmit={guardar}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>{icono(tipo)}</span>
        <div>
          <strong>{esEdicion ? `Corregir ${editar?.codigo ?? 'la comida'}` : `Cargar ${labelTipoComida(tipo).toLowerCase()}`}</strong>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            {esEdicion ? 'Al guardar, el inventario se ajusta por la diferencia.' : 'Al guardar, lo consumido se descuenta del inventario.'}
          </div>
        </div>
      </div>

      {error && <div className="aviso danger"><span className="aviso-icono">⛔</span><div>{error}</div></div>}

      <div className="surt-campo">
        <label>¿Qué comida fue?</label>
        <div className="comida-chips" role="radiogroup" aria-label="Tipo de comida">
          {TIPOS_COMIDA.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value}
              className={`comida-chip${tipo === t.value ? ' sel' : ''}`} onClick={() => setTipo(t.value)}>
              <span aria-hidden>{t.icono}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="surt-campo">
        <label htmlFor="com-fecha">¿De qué día?</label>
        <input id="com-fecha" className="input surt-input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} required />
        <div className="comida-dias">
          <button type="button" className={`btn ${fecha === hoy ? 'btn-primary' : 'btn-ghost'} btn-grande`} onClick={() => setFecha(hoy)}>Hoy</button>
          <button type="button" className={`btn ${fecha === diasAtras(hoy, 1) ? 'btn-primary' : 'btn-ghost'} btn-grande`} onClick={() => setFecha(diasAtras(hoy, 1))}>Ayer</button>
        </div>
        <small className="muted">Para un día anterior, toca la fecha y elige el día.</small>
        {repetida && (
          <small className="surt-alerta">
            Ya hay un {labelTipoComida(tipo).toLowerCase()} cargado ese día: {repetida.codigo ?? ''} con {num(repetida.platos)} personas.
            Si es otro turno, sigue. Si no, revisa la lista antes de guardar.
          </small>
        )}
        {avisoCiclo && <small className="surt-alerta">⚠ {avisoCiclo}</small>}
      </div>

      <div className="surt-campo">
        <label htmlFor="com-personas">¿Cuántas personas comieron?</label>
        <input id="com-personas" className="input surt-input surt-litros" type="number" inputMode="numeric" min={1} step={1}
          value={personas} onChange={(e) => setPersonas(e.target.value)} placeholder="0" autoFocus={!esEdicion} required />
      </div>

      <div className="surt-campo">
        <label htmlFor="com-buscar">¿Qué se consumió?</label>
        {lineas.length > 0 && (
          <div className="comida-sel">
            {lineas.map((l) => (
              <div key={l.pid} className={`comida-linea${l.excede || l.inactivo ? ' excede' : ''}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="nombre">{l.nombre}</div>
                  <div className="sub">
                    {l.hay != null ? `Hay ${num(l.hay)} ${l.unidad}`
                      : l.inactivo ? 'Desactivado en el inventario · quítalo con la ✕' : 'Ya no está activo en el inventario'}
                    {l.excede ? ' · no alcanza' : ''}
                  </div>
                </div>
                <input id={`com-cant-${l.pid}`} className="input comida-cant" type="number" inputMode="decimal" min={0} step="any"
                  value={sel[l.pid]} onChange={(e) => setSel((s) => ({ ...s, [l.pid]: e.target.value }))}
                  placeholder="0" aria-label={`Cantidad de ${l.nombre}`} autoFocus={recien === l.pid} />
                <span className="unidad">{l.unidad}</span>
                <button type="button" className="btn btn-ghost comida-quitar" onClick={() => quitar(l.pid)} aria-label={`Quitar ${l.nombre}`}>✕</button>
              </div>
            ))}
          </div>
        )}
        <input id="com-buscar" className="input surt-input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder={viveres.length ? '🔍 Busca el producto y tócalo…' : 'No hay víveres en el inventario'} disabled={!viveres.length} />
        <div className="comida-lista">
          {porElegir.slice(0, VIVERES_A_LA_VISTA).map((p) => (
            <button key={p.id} type="button" className="comida-viver" onClick={() => agregar(p.id)}>
              <span className="nombre">{p.nombre}</span>
              <span className="hay">{num(Number(p.stock) + (yaConsumido.get(p.id) ?? 0))} {p.unidad ?? ''} <span className="mas" aria-hidden>＋</span></span>
            </button>
          ))}
          {!porElegir.length && <div className="muted" style={{ padding: '.7rem' }}>{busqueda ? 'Ningún producto con ese nombre.' : 'No queda nada por agregar.'}</div>}
        </div>
        {porElegir.length > VIVERES_A_LA_VISTA && (
          <small className="muted">Hay {num(porElegir.length - VIVERES_A_LA_VISTA)} más: escribe parte del nombre para encontrarlo.</small>
        )}
      </div>

      <div className="surt-campo">
        <label htmlFor="com-nota">Nota (opcional)</label>
        <input id="com-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que la analista deba saber…" />
      </div>

      {editar
        ? <AdjuntosSalida repo={adjuntosCocina} modulo={MODULO_ADJUNTO_COCINA} refId={editar.id} actor={actor} grande titulo="📷 Fotos de la comida" />
        : <SelectorAdjuntos archivos={adjuntos} onChange={setAdjuntos} titulo="📷 Fotos de la comida" grande />}

      {guardando && demorado && (
        <div className="aviso warning">
          <span className="aviso-icono">⏳</span>
          <div>
            {etapa === 'fotos'
              ? <><strong>La comida ya quedó guardada</strong>; se están subiendo las fotos con poca señal. No la vuelvas a cargar.</>
              : <>Está tardando más de lo normal por la señal. No la vuelvas a cargar hasta revisar la lista.</>}
          </div>
        </div>
      )}
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>
        {guardando
          ? (etapa === 'fotos' ? `Subiendo ${adjuntos.length === 1 ? 'la foto' : `${adjuntos.length} fotos`}…` : 'Guardando…')
          : esEdicion ? '✔ Guardar cambios' : `✔ Registrar ${labelTipoComida(tipo).toLowerCase()}`}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>Cancelar</button>
    </form>
  );
}

/* ───────────── Detalle de una comida (WhatsApp, fotos, corregir, borrar) ───────────── */
function DetalleComida({ mov, unidades, canWrite, actor, actorName, hoy, onClose, onEditar, onBorrado }: {
  mov: CocinaMovimiento; unidades: Record<string, string | null>; canWrite: boolean; actor: string; actorName: string | null; hoy: string;
  onClose: () => void; onEditar: () => void; onBorrado: () => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const dia = etiquetaDia(diaCaracas(mov.at), hoy);
  const Fila = ({ k, v }: { k: string; v: string | null | undefined }) => v ? (
    <div className="surt-fila"><span className="muted">{k}</span><span>{v}</span></div>
  ) : null;

  async function borrar() {
    setBorrando(true);
    try {
      const r = await eliminarMovimientoCocina(mov.id, actor, actorName);
      toast(r.borrada ? 'Comida borrada · lo consumido volvió al inventario' : 'Esa comida ya la había borrado otra persona', r.borrada ? 'success' : 'info');
      await onBorrado();
    } catch (e) {
      toast(texto(e, 'No se pudo borrar'), 'error');
      setBorrando(false);
    }
  }

  return (
    <Modal title={`${icono(mov.tipo_comida)} ${labelTipoComida(mov.tipo_comida)} · ${num(mov.platos)} personas`} size="md"
      onClose={() => { if (!borrando) onClose(); }}
      footer={<>
        {canWrite && !confirmando && <button className="btn btn-danger btn-grande" onClick={() => setConfirmando(true)} disabled={borrando}>🗑 Eliminar</button>}
        {canWrite && !confirmando && <button className="btn btn-ghost btn-grande" onClick={onEditar} disabled={borrando}>✏ Corregir</button>}
        <button className="btn btn-primary btn-grande" onClick={onClose} disabled={borrando}>Cerrar</button>
      </>}>
      <CompartirWhatsapp texto={mensajeComida({ mov, unidades, registradoPor: mov.actor_name || mov.actor })} />

      <div className="surt-detalle">
        <Fila k="Día" v={dia} />
        <Fila k="Registro" v={mov.codigo} />
        <Fila k="Personas" v={num(mov.platos)} />
        <Fila k="Nota" v={mov.nota} />
        <Fila k="Cargado" v={`${dateTime(mov.created_at)}${mov.actor_name || mov.actor ? ` · ${mov.actor_name || mov.actor}` : ''}`} />
        <Fila k="Revisión" v={mov.verificado_at ? `✔ Verificado por ${mov.verificado_por ?? 'la analista'} · ${dateTime(mov.verificado_at)}` : 'Pendiente de que la analista la revise'} />
      </div>

      <div className="surt-rotulo">Lo que se consumió</div>
      <ul className="comida-items">
        {(mov.items ?? []).map((it) => (
          <li key={it.producto_id}>
            <span>{it.nombre}</span>
            <strong>{num(it.cantidad)} {it.unidad ?? unidades[it.producto_id] ?? ''}</strong>
          </li>
        ))}
      </ul>

      {confirmando && (
        <div className="surt-confirmar" role="alertdialog" aria-label="Confirmar borrado">
          <div style={{ fontSize: '1.05rem' }}>
            <strong>¿Borrar este {labelTipoComida(mov.tipo_comida).toLowerCase()} de {num(mov.platos)} personas ({dia.toLowerCase()})?</strong>
            <div className="muted" style={{ marginTop: '.3rem', fontSize: '.9rem' }}>
              Lo consumido vuelve al inventario en el mismo momento y los saldos del mercado se actualizan solos. Se borran sus fotos. No se puede deshacer. Se refleja al instante en la PC.
            </div>
          </div>
          <div className="botones">
            <button type="button" className="btn btn-peligro" onClick={() => void borrar()} disabled={borrando}>{borrando ? 'Borrando…' : '🗑 SÍ, BORRAR'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(false)} disabled={borrando}>↩ VOLVER</button>
          </div>
        </div>
      )}

      <AdjuntosSalida repo={adjuntosCocina} modulo={MODULO_ADJUNTO_COCINA} refId={mov.id} actor={actor} soloLectura={!canWrite} grande
        titulo="📷 Fotos de la comida" />
    </Modal>
  );
}
