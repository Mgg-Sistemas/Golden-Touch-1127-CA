/* ============================================================
   Golden Touch · Depósito Mina · Salida y retorno en el teléfono (13/10/2026)

   · FormSalidaMina: material (ya elegido), cantidad, motivo, quién autorizó
     (la lista de Combustible), ¿retorna? SÍ / NO y hasta 4 fotos. Al guardar, el aviso para WhatsApp.
   · PorRetornarMina: las salidas que retornan y no volvieron completas;
     a cada una se le da retorno (todo o una parte) al inventario.
   ============================================================ */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from '@/shared/ui/Toast';
import { CompartirWhatsapp } from '@/shared/ui/CompartirWhatsapp';
import { SearchSelect } from '@/shared/ui/SearchSelect';
import { useRealtime } from '@/shared/lib/useRealtime';
import { listCatalogos } from '@/modules/combustible/tanques.repository';
import type { Producto } from '@/shared/lib/types';
import {
  MAX_FOTOS_SALIDA_MINA, MAX_ITEMS_LOTE_MOVIL, errorFotosSalidaMina, errorItemsLote, errorRetornoMina, errorSalidaMina, fechaHoraVE, filtrarPorRetornar, leerCantidad,
  mensajeRetornoMina, mensajeSalidasMina, num, pendienteRetorno, type FotoSalidaMina, type SalidaMina,
} from './salidasMina';
import { registrarSalidaMina, registrarSalidasMina, retornarSalidaMina, subirFotosSalidaMina, subirFotosSalidasMina, urlFotoSalidaMina } from './salidasMina.repository';
import { docRetornoMovil, docSalidasMovil, verDocMovilPdf, type DocMovilPdf } from './inventarioMovilPdf';

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Un renglón de una salida o un traslado del teléfono: el producto y lo que se escribió. */
export interface ItemLoteMovil { producto: Producto; cantidad: string }

/** Los renglones con su número, para validar y para la base. */
export const itemsLoteListos = (items: ItemLoteMovil[]) => items.map((it) => ({
  producto: it.producto, nombre: it.producto.nombre, unidad: it.producto.unidad,
  cantidad: leerCantidad(it.cantidad), stock: Number(it.producto.stock) || 0,
}));

/** Varios productos en una salida o un traslado (04/11/2026): la cantidad de cada uno,
 *  quitarlo y «＋ Agregar otro producto» (buscador con lo que tiene stock y no está ya). */
export function ItemsLoteMovil({ items, onChange, productos, lugar, disabled }: {
  items: ItemLoteMovil[]; onChange: (items: ItemLoteMovil[]) => void; productos: Producto[]; lugar: string; disabled?: boolean;
}) {
  const [agregando, setAgregando] = useState(false);
  const [busca, setBusca] = useState('');
  const candidatos = useMemo(() => {
    const ya = new Set(items.map((it) => it.producto.id));
    const base = productos.filter((p) => !ya.has(p.id) && Number(p.stock) > 0);
    const q = sinAcentos(busca.trim());
    return (q ? base.filter((p) => sinAcentos(`${p.nombre} ${p.sku} ${p.categoria}`).includes(q)) : base).slice(0, 15);
  }, [items, productos, busca]);
  const cambiar = (i: number, cantidad: string) => onChange(items.map((it, j) => (j === i ? { ...it, cantidad } : it)));
  const cerrar = () => { setAgregando(false); setBusca(''); };

  return (
    <div className="surt-campo">
      <span className="surt-rotulo">{items.length === 1 ? 'Producto' : `Productos (${items.length})`}</span>
      {items.map((it, i) => {
        const stock = Number(it.producto.stock) || 0;
        const cant = leerCantidad(it.cantidad);
        return (
          <div key={it.producto.id} className="surt-lote-item">
            <div className="surt-lote-cab">
              <strong>{it.producto.nombre}</strong>
              {items.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar ${it.producto.nombre}`} disabled={disabled}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
            <div className="muted" style={{ fontSize: '.8rem' }}>{it.producto.sku} · hay {num(stock)} {it.producto.unidad} en {lugar}</div>
            <input className="input surt-litros" inputMode="decimal" value={it.cantidad} placeholder="0" disabled={disabled}
              aria-label={`Cantidad de ${it.producto.nombre} (${it.producto.unidad})`} autoFocus={i === items.length - 1}
              onChange={(e) => cambiar(i, e.target.value)} />
            {cant > 0 && (cant > stock
              ? <small className="surt-alerta">No alcanza: hay {num(stock)} {it.producto.unidad}.</small>
              : <small className="muted">Quedan {num(stock - cant)} {it.producto.unidad}.</small>)}
          </div>
        );
      })}
      {agregando ? (
        <div className="surt-lote-agregar">
          <input className="input surt-input" type="search" placeholder="🔍 Buscar otro producto…" value={busca} autoFocus
            onChange={(e) => setBusca(e.target.value)} autoComplete="off" aria-label="Buscar otro producto" />
          {!candidatos.length && <small className="muted">{busca.trim() ? 'Ningún producto con stock coincide.' : 'No hay más productos con stock.'}</small>}
          {candidatos.map((p) => (
            <button key={p.id} type="button" className="surt-mov"
              onClick={() => { onChange([...items, { producto: p, cantidad: '' }]); cerrar(); }}>
              <span className="icono" aria-hidden>📦</span>
              <span style={{ minWidth: 0 }}>
                <div className="titulo">{p.nombre}</div>
                <div className="sub">{p.sku} · {p.categoria}</div>
              </span>
              <span className="litros">{num(Number(p.stock) || 0)} <small>{p.unidad}</small></span>
            </button>
          ))}
          <button type="button" className="btn btn-ghost" onClick={cerrar}>Cancelar</button>
        </div>
      ) : items.length < MAX_ITEMS_LOTE_MOVIL && (
        <button type="button" className="btn btn-ghost btn-grande" disabled={disabled} onClick={() => setAgregando(true)}>＋ Agregar otro producto</button>
      )}
    </div>
  );
}

/** Aviso ya guardado: el texto para WhatsApp (con las fotos de la salida, 02/11/2026),
 *  el PDF en vista previa (30/10/2026, mismo formato que Salidas y Traslados) y el botón para seguir. */
export function Listo({ titulo, texto, onListo, pdf, fotos }: { titulo: string; texto: string; onListo: () => void; pdf?: DocMovilPdf | null; fotos?: File[] }) {
  const [abriendo, setAbriendo] = useState(false);
  async function verPdf() {
    if (!pdf) return;
    setAbriendo(true);
    try { await verDocMovilPdf(pdf); }
    catch (err) { toast(errMsg(err, 'No se pudo generar el PDF'), 'error'); }
    finally { setAbriendo(false); }
  }
  return (
    <div className="surt-form">
      <div className="surt-form-titulo"><span className="icono" aria-hidden>✅</span><strong>{titulo}</strong></div>
      <CompartirWhatsapp texto={texto} fotos={fotos} />
      {pdf && (
        <button type="button" className="btn btn-ghost btn-grande" onClick={() => void verPdf()} disabled={abriendo}>
          {abriendo ? 'Armando el PDF…' : '📄 Ver PDF'}
        </button>
      )}
      <button type="button" className="btn btn-primary surt-guardar" onClick={onListo}>Listo</button>
    </div>
  );
}

export function FormSalidaMina({ producto, productos = [], almacen, actor, actorName, onCancel, onSaved }: {
  producto: Producto; productos?: Producto[]; almacen: string; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => void;
}) {
  const lugar = almacen === 'General' ? 'el inventario' : 'el depósito';
  const [items, setItems] = useState<ItemLoteMovil[]>([{ producto, cantidad: '' }]);
  const [motivo, setMotivo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [autorizadores, setAutorizadores] = useState<string[]>([]);
  const [retorna, setRetorna] = useState<boolean | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [hechas, setHechas] = useState<SalidaMina[] | null>(null);
  const listos = itemsLoteListos(items);
  const malItems = errorItemsLote(listos);
  // Quién autoriza: la MISMA lista que Combustible (Catálogos › Autorizado por).
  const cargarAutorizadores = () => listCatalogos()
    .then((cs) => setAutorizadores(cs.filter((c) => c.tipo === 'autorizado' && c.activo).map((c) => c.valor)))
    .catch(() => {});
  useEffect(() => { void cargarAutorizadores(); }, []);
  useRealtime(['combustible_catalogos'], () => { void cargarAutorizadores(); });
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => { previas.forEach((u) => URL.revokeObjectURL(u)); }, [previas]);

  function agregarFotos(lista: FileList | null) {
    const nuevas = Array.from(lista ?? []);
    const mal = errorFotosSalidaMina(nuevas, fotos.length);
    if (mal) toast(mal, 'warning');
    setFotos((xs) => [...xs, ...nuevas.filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name))]
      .slice(0, MAX_FOTOS_SALIDA_MINA));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const problema = malItems
      ?? errorSalidaMina({ productoId: listos[0].producto.id, cantidad: listos[0].cantidad, stock: listos[0].stock, motivo, autorizado, retorna });
    if (problema) return toast(problema, 'error');
    setGuardando(true);
    try {
      let ss: SalidaMina[];
      if (listos.length === 1) {
        const it = listos[0];
        let s = await registrarSalidaMina({ productoId: it.producto.id, cantidad: it.cantidad, motivo, autorizadoPor: autorizado, retorna: !!retorna, actor, actorName, almacen });
        if (fotos.length) {
          try { s = await subirFotosSalidaMina(s, fotos); }
          catch (err) { toast(`La salida quedó registrada, pero las fotos no subieron: ${errMsg(err, 'error')}`, 'warning'); }
        }
        ss = [s];
        toast(`Salida ${s.codigo}: -${num(it.cantidad)} ${it.unidad} de ${it.nombre}`, 'success');
      } else {
        // Varios materiales: todos en una transacción (si uno no alcanza, no se guarda ninguno).
        ss = await registrarSalidasMina({
          items: listos.map((it) => ({ productoId: it.producto.id, cantidad: it.cantidad })),
          motivo, autorizadoPor: autorizado, retorna: !!retorna, actor, actorName, almacen,
        });
        if (fotos.length) {
          try { ss = await subirFotosSalidasMina(ss, fotos); }
          catch (err) { toast(`La salida quedó registrada, pero las fotos no subieron: ${errMsg(err, 'error')}`, 'warning'); }
        }
        toast(`Salida de ${ss.length} productos registrada`, 'success');
      }
      setHechas(ss);
    } catch (err) {
      toast(errMsg(err, 'No se pudo registrar la salida'), 'error');
    } finally { setGuardando(false); }
  }

  if (hechas?.length) {
    const porId = new Map(items.map((it) => [it.producto.id, it.producto]));
    return <Listo titulo={hechas.length === 1 ? `Salida ${hechas[0].codigo} registrada` : `Salida de ${hechas.length} productos registrada`}
      texto={mensajeSalidasMina(hechas, actorName ?? actor)} onListo={onSaved} fotos={fotos}
      pdf={docSalidasMovil(hechas, (id) => porId.get(id), almacen, { actor, nombre: actorName })} />;
  }

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>⬆</span><strong>Salida · {items.length === 1 ? items[0].producto.nombre : `${items.length} productos`}</strong></div>
      <ItemsLoteMovil items={items} onChange={setItems} productos={productos} lugar={lugar} disabled={guardando} />
      <div className="surt-campo">
        <label htmlFor="mina-salida-motivo">Motivo</label>
        <input id="mina-salida-motivo" className="input surt-input" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Para qué sale, a quién, a qué equipo…" autoComplete="off" />
      </div>
      <div className="surt-campo">
        <label htmlFor="mina-salida-autorizado">Autorizado por</label>
        <div className="surt-buscable">
          <SearchSelect id="mina-salida-autorizado" value={autorizado} onChange={setAutorizado} placeholder="🔍 Busca quién autorizó…"
            options={autorizadores.map((v) => ({ value: v, label: v }))} />
        </div>
        {!autorizadores.length && <small className="muted">La lista sale de Combustible › Catálogos › Autorizado por.</small>}
      </div>
      <div className="surt-campo">
        <span className="surt-rotulo" id="mina-salida-retorna">¿Retorna?</span>
        <div className="surt-sino" role="group" aria-labelledby="mina-salida-retorna">
          <button type="button" className={`surt-btn si${retorna === true ? ' sel' : ''}`} aria-pressed={retorna === true} onClick={() => setRetorna(true)}>
            <span className="icono" aria-hidden>🔄</span><span>SÍ</span><small>Vuelve a {lugar}</small>
          </button>
          <button type="button" className={`surt-btn no${retorna === false ? ' sel' : ''}`} aria-pressed={retorna === false} onClick={() => setRetorna(false)}>
            <span className="icono" aria-hidden>❌</span><span>NO</span><small>Se consume / se queda</small>
          </button>
        </div>
        {retorna && <small className="muted">Queda en «Por retornar» y desde ahí se le da retorno al inventario (todo o una parte).</small>}
      </div>
      <div className="surt-campo">
        <label htmlFor="mina-salida-fotos">Fotos ({fotos.length}/{MAX_FOTOS_SALIDA_MINA}) · opcional</label>
        {fotos.length < MAX_FOTOS_SALIDA_MINA && (
          <input id="mina-salida-fotos" className="input surt-input" type="file" accept="image/*" multiple
            onChange={(e) => { agregarFotos(e.target.files); e.target.value = ''; }} />
        )}
        {!!fotos.length && (
          <div className="rep-fotos">
            {fotos.map((f, i) => (
              <div key={`${f.name}-${i}`} className="rep-foto surt-foto-quitar">
                <img src={previas[i]} alt={f.name} />
                <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || !!malItems || retorna === null || !autorizado.trim()}>
        {guardando ? 'Guardando…' : items.length === 1 ? '✓ Guardar salida' : `✓ Guardar salida (${items.length} productos)`}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>← Otro material</button>
    </form>
  );
}

/** Las fotos de una salida (se abren en otra pestaña). */
function FotosSalida({ fotos }: { fotos: FotoSalidaMina[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void Promise.all(fotos.map(async (f) => [f.path, await urlFotoSalidaMina(f.path).catch(() => '')] as const))
      .then((xs) => { if (vivo) setUrls(Object.fromEntries(xs)); });
    return () => { vivo = false; };
  }, [fotos]);
  if (!fotos.length) return null;
  return (
    <div className="rep-fotos">
      {fotos.map((f) => (
        <a key={f.path} className="rep-foto" href={urls[f.path] || undefined} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${f.filename}`}>
          {urls[f.path] ? <img src={urls[f.path]} alt={f.filename} /> : <span className="rep-foto-doc">📷</span>}
        </a>
      ))}
    </div>
  );
}

export function PorRetornarMina({ salidas, actor, actorName, canWrite, onVolver, onSaved }: {
  salidas: SalidaMina[]; actor: string; actorName: string | null; canWrite: boolean;
  onVolver: () => void; onSaved: () => void;
}) {
  const [elegida, setElegida] = useState<SalidaMina | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pdf, setPdf] = useState<DocMovilPdf | null>(null);
  // Buscador (19/10/2026): material, código, motivo, quién autorizó, fecha… ver filtrarPorRetornar.
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => filtrarPorRetornar(salidas, busca), [salidas, busca]);

  function elegir(s: SalidaMina) { setElegida(s); setCantidad(String(pendienteRetorno(s))); setNota(''); }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!elegida) return;
    const cant = leerCantidad(cantidad);
    const problema = errorRetornoMina(elegida, cant);
    if (problema) return toast(problema, 'error');
    setGuardando(true);
    try {
      const s = await retornarSalidaMina(elegida.id, cant, nota, actorName);
      toast(`Retorno: +${num(cant)} ${s.unidad ?? ''} de ${s.producto_nombre}`, 'success');
      setAviso(mensajeRetornoMina(s, cant, nota, actorName ?? actor));
      setPdf(docRetornoMovil(s, cant, nota, new Date().toISOString(), { actor, nombre: actorName }));
    } catch (err) {
      toast(errMsg(err, 'No se pudo registrar el retorno'), 'error');
    } finally { setGuardando(false); }
  }

  if (aviso) return <Listo titulo="Retorno registrado" texto={aviso} pdf={pdf} onListo={() => { setAviso(null); setPdf(null); setElegida(null); onSaved(); }} />;

  if (elegida) {
    const falta = pendienteRetorno(elegida);
    const cant = leerCantidad(cantidad);
    const u = elegida.unidad ?? '';
    return (
      <form className="surt-form" onSubmit={(e) => void guardar(e)}>
        <div className="surt-form-titulo"><span className="icono" aria-hidden>📥</span><strong>Retorno · {elegida.producto_nombre}</strong></div>
        <div className="surt-detalle">
          <div className="surt-fila"><span>Salida</span><span className="mono">{elegida.codigo}</span></div>
          <div className="surt-fila"><span>Salió</span><span>{num(elegida.cantidad)} {u} · {fechaHoraVE(elegida.created_at)}</span></div>
          <div className="surt-fila"><span>Motivo</span><span>{elegida.motivo}</span></div>
          {elegida.autorizado_por && <div className="surt-fila"><span>Autorizó</span><span>{elegida.autorizado_por}</span></div>}
          {elegida.retornado > 0 && <div className="surt-fila"><span>Ya retornó</span><span>{num(elegida.retornado)} {u}</span></div>}
          <div className="surt-fila"><span>Falta</span><span>{num(falta)} {u}</span></div>
        </div>
        <FotosSalida fotos={elegida.fotos} />
        <div className="surt-campo">
          <label htmlFor="mina-retorno-cant">¿Cuánto retorna? ({u})</label>
          <input id="mina-retorno-cant" className="input surt-litros" inputMode="decimal" value={cantidad}
            onChange={(e) => setCantidad(e.target.value)} placeholder="0" autoFocus />
          {cant > falta
            ? <small className="surt-alerta">Solo faltan {num(falta)} {u}.</small>
            : cant > 0 && cant < falta && <small className="muted">Retorno parcial: quedarán {num(falta - cant)} {u} por retornar.</small>}
        </div>
        <div className="surt-campo">
          <label htmlFor="mina-retorno-nota">Nota</label>
          <input id="mina-retorno-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="Opcional: en qué estado volvió, quién lo trajo…" autoComplete="off" />
        </div>
        <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || cant <= 0 || cant > falta}>
          {guardando ? 'Guardando…' : '✓ Dar retorno al inventario'}
        </button>
        <button type="button" className="btn btn-ghost btn-grande" onClick={() => setElegida(null)} disabled={guardando}>← Otra salida</button>
      </form>
    );
  }

  return (
    <section className="surt-lista">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0' }}>
        <strong style={{ fontSize: '1.1rem' }}>🔄 Por retornar ({salidas.length})</strong>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
      </div>
      {salidas.length > 0 && (
        <>
          <input className="input surt-input" type="search" name="mina-retornar-buscar" placeholder="🔍 Buscar salida pendiente…"
            value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" aria-label="Buscar en Por retornar" />
          {busca.trim() && <h2>{lista.length ? `${lista.length} encontrada(s)` : 'Ninguna salida pendiente coincide'}</h2>}
        </>
      )}
      {!salidas.length && <p className="muted">No hay nada pendiente por retornar.</p>}
      {lista.map((s) => (
        <button key={s.id} type="button" className="surt-mov" disabled={!canWrite} onClick={() => elegir(s)}>
          <span className="icono" aria-hidden>📦</span>
          <span style={{ minWidth: 0 }}>
            <div className="titulo">{s.producto_nombre}</div>
            <div className="sub">{s.codigo} · {fechaHoraVE(s.created_at)} · {s.motivo}</div>
            {s.retornado > 0 && <div className="sub">Ya retornó {num(s.retornado)} de {num(s.cantidad)}</div>}
          </span>
          <span className="litros">{num(pendienteRetorno(s))} <small>{s.unidad}</small></span>
        </button>
      ))}
    </section>
  );
}
