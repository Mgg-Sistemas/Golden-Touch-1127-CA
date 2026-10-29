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
  MAX_FOTOS_SALIDA_MINA, errorFotosSalidaMina, errorRetornoMina, errorSalidaMina, fechaHoraVE, filtrarPorRetornar, leerCantidad,
  mensajeRetornoMina, mensajeSalidaMina, num, pendienteRetorno, type FotoSalidaMina, type SalidaMina,
} from './salidasMina';
import { registrarSalidaMina, retornarSalidaMina, subirFotosSalidaMina, urlFotoSalidaMina } from './salidasMina.repository';

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

/** Aviso ya guardado: el texto para WhatsApp y el botón para seguir. */
export function Listo({ titulo, texto, onListo }: { titulo: string; texto: string; onListo: () => void }) {
  return (
    <div className="surt-form">
      <div className="surt-form-titulo"><span className="icono" aria-hidden>✅</span><strong>{titulo}</strong></div>
      <CompartirWhatsapp texto={texto} />
      <button type="button" className="btn btn-primary surt-guardar" onClick={onListo}>Listo</button>
    </div>
  );
}

export function FormSalidaMina({ producto, actor, actorName, onCancel, onSaved }: {
  producto: Producto; actor: string; actorName: string | null;
  onCancel: () => void; onSaved: () => void;
}) {
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [autorizadores, setAutorizadores] = useState<string[]>([]);
  const [retorna, setRetorna] = useState<boolean | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [hecha, setHecha] = useState<SalidaMina | null>(null);
  const cant = leerCantidad(cantidad);
  const stock = Number(producto.stock) || 0;
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
    const problema = errorSalidaMina({ productoId: producto.id, cantidad: cant, stock, motivo, autorizado, retorna });
    if (problema) return toast(problema, 'error');
    setGuardando(true);
    try {
      let s = await registrarSalidaMina({ productoId: producto.id, cantidad: cant, motivo, autorizadoPor: autorizado, retorna: !!retorna, actor, actorName });
      if (fotos.length) {
        try { s = await subirFotosSalidaMina(s, fotos); }
        catch (err) { toast(`La salida quedó registrada, pero las fotos no subieron: ${errMsg(err, 'error')}`, 'warning'); }
      }
      toast(`Salida ${s.codigo}: -${num(cant)} ${producto.unidad} de ${producto.nombre}`, 'success');
      setHecha(s);
    } catch (err) {
      toast(errMsg(err, 'No se pudo registrar la salida'), 'error');
    } finally { setGuardando(false); }
  }

  if (hecha) return <Listo titulo={`Salida ${hecha.codigo} registrada`} texto={mensajeSalidaMina(hecha, actorName ?? actor)} onListo={onSaved} />;

  return (
    <form className="surt-form" onSubmit={(e) => void guardar(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>⬆</span><strong>Salida · {producto.nombre}</strong></div>
      <div className="muted">{producto.sku} · hay {num(stock)} {producto.unidad} en el depósito</div>
      <div className="surt-campo">
        <label htmlFor="mina-salida-cant">Cantidad ({producto.unidad})</label>
        <input id="mina-salida-cant" className="input surt-litros" inputMode="decimal" value={cantidad}
          onChange={(e) => setCantidad(e.target.value)} placeholder="0" autoFocus />
        {cant > 0 && (cant > stock
          ? <small className="surt-alerta">No alcanza: hay {num(stock)} {producto.unidad}.</small>
          : <small className="muted">Quedan {num(stock - cant)} {producto.unidad}.</small>)}
      </div>
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
            <span className="icono" aria-hidden>🔄</span><span>SÍ</span><small>Vuelve al depósito</small>
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
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando || cant <= 0 || cant > stock || retorna === null || !autorizado.trim()}>
        {guardando ? 'Guardando…' : '✓ Guardar salida'}
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
    } catch (err) {
      toast(errMsg(err, 'No se pudo registrar el retorno'), 'error');
    } finally { setGuardando(false); }
  }

  if (aviso) return <Listo titulo="Retorno registrado" texto={aviso} onListo={() => { setAviso(null); setElegida(null); onSaved(); }} />;

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
