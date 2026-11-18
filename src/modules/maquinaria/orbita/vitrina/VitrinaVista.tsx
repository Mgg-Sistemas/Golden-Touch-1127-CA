/* ============================================================
   Golden Touch · Control de Maquinaria · la Vitrina (D-vitrina)
   Vista de descubrimiento, tipo United Carriers: se recorre la flota «como
   productos de una tienda». Una pantalla por protagonista; IZQUIERDA el
   gráfico (silueta/inicial/pin), DERECHA los datos esenciales. El
   protagonista puede variar: máquina, propietario o ubicación.
   · Buscador: para ir directo a un equipo (marca, placa, dueño…) sin
     recorrer N; filtra la vitrina en el acto.
   · «Ver ficha completa» NO reinventa vista: lleva al expediente que
     maquinaria ya tiene (/app/maquinaria/equipo/:id).
   Peso: scroll NATIVO con scroll-snap (sin scroll-jacking), una entrada/
   salida por panel con transform/opacity vía IntersectionObserver (nada por
   cuadro, nada en reposo), sin WebGL; prefers-reduced-motion deja todo quieto.
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { norm } from '@/shared/lib/texto';
import { SiluetaMaquina } from './SiluetaMaquina';
import { protagonistas, type ModoVitrina, type Protagonista } from './vitrinaDatos';
import type { ModeloOrbita } from '../orbitaDatos';
import './vitrina.css';

const MODOS: { id: ModoVitrina; icono: string; texto: string }[] = [
  { id: 'maquina', icono: '🚜', texto: 'Máquinas' },
  { id: 'propietario', icono: '🏢', texto: 'Propietarios' },
  { id: 'ubicacion', icono: '📍', texto: 'Ubicaciones' },
];

const prefiereQuieto = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function PinUbicacion() {
  return (
    <svg className="sil" viewBox="0 0 200 120" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <path className="sil-cuerpo" d="M100 18 a34 34 0 0 1 34 34 c0 26 -34 52 -34 52 s-34 -26 -34 -52 a34 34 0 0 1 34 -34 Z" />
      <circle className="sil-acento" cx="100" cy="52" r="14" />
    </svg>
  );
}

function Grafico({ p }: { p: Protagonista }) {
  if (p.grafico.modo === 'propietario') {
    return <div className="vit-inicial" aria-hidden="true">{p.grafico.inicial}</div>;
  }
  if (p.grafico.modo === 'ubicacion') return <PinUbicacion />;
  return <SiluetaMaquina tipo={p.grafico.tipo} className="vit-sil" />;
}

export function VitrinaVista({ modelo, onElegir, modoInicial = 'maquina', enfocarId = null }: {
  modelo: ModeloOrbita;
  onElegir: (propietarioId: string) => void;
  /** Modo con el que abre. La entrada cinemática desde el mapa la fija en 'propietario'. */
  modoInicial?: ModoVitrina;
  /** Si viene, abre en modo propietario y se desliza hasta ese propietario (drill del mapa). */
  enfocarId?: string | null;
}) {
  const [modo, setModo] = useState<ModoVitrina>(enfocarId ? 'propietario' : modoInicial);
  const [q, setQ] = useState('');
  const lista = useMemo(() => protagonistas(modelo, modo), [modelo, modo]);
  const filtrada = useMemo(() => {
    const t = norm(q.trim());
    return t ? lista.filter((p) => p.buscar.includes(t)) : lista;
  }, [lista, q]);
  const scroller = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  // Marca el panel en foco (dispara su entrada por CSS) y lleva el índice.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting && e.intersectionRatio >= 0.55) {
          e.target.setAttribute('data-foco', '');
          const i = Number((e.target as HTMLElement).dataset.i);
          if (Number.isInteger(i)) setActual(i);
        } else {
          e.target.removeAttribute('data-foco');
        }
      }
    }, { root, threshold: [0, 0.55, 1] });
    const primero = root.querySelector('.vit-panel[data-i="0"]');
    if (primero) primero.setAttribute('data-foco', '');
    root.querySelectorAll('.vit-panel').forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [filtrada, modo]);

  useEffect(() => { setQ(''); }, [modo]);           // al cambiar de modo, limpia la búsqueda
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); setActual(0); }, [filtrada]); // al filtrar, al principio

  // Entrada enfocada (drill desde el mapa): abre en propietario y se desliza al elegido.
  useEffect(() => { if (enfocarId) setModo('propietario'); }, [enfocarId]);
  useEffect(() => {
    if (!enfocarId || modo !== 'propietario') return undefined;
    const i = filtrada.findIndex((p) => p.id === enfocarId);
    if (i < 0) return undefined;
    const r = requestAnimationFrame(() => {
      const root = scroller.current;
      // Posiciona SOLO el carril interno (cada panel ocupa su alto, con snap), sin arrastrar la página.
      if (root) root.scrollTo({ top: i * root.clientHeight, behavior: prefiereQuieto() ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(r);
  }, [enfocarId, modo, filtrada]);

  const irA = (i: number) => {
    const n = Math.max(0, Math.min(filtrada.length - 1, i));
    const el = scroller.current?.querySelector(`.vit-panel[data-i="${n}"]`);
    el?.scrollIntoView({ behavior: prefiereQuieto() ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section className="vit-wrap" aria-label="Vitrina de la flota">
      <div className="vit-barra">
        <div className="view-toggle" role="tablist" aria-label="Protagonista de la vitrina">
          {MODOS.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={modo === m.id}
              className={modo === m.id ? 'active' : ''} onClick={() => setModo(m.id)}>
              {m.icono} {m.texto}
            </button>
          ))}
        </div>
        <input type="search" className="input vit-buscar" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Buscar marca, placa, dueño…" aria-label="Buscar en la vitrina" />
        <div className="vit-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => irA(actual - 1)} disabled={actual <= 0} aria-label="Anterior">▲</button>
          <span className="vit-indice" aria-live="polite">{filtrada.length ? actual + 1 : 0} / {filtrada.length}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => irA(actual + 1)} disabled={actual >= filtrada.length - 1} aria-label="Siguiente">▼</button>
        </div>
      </div>

      <div key={modo} className="vit-scroller" ref={scroller} tabIndex={-1}>
        {filtrada.map((p, i) => (
          <article key={p.id} className="vit-panel" data-i={i} data-acento={p.acento ?? 'muted'}>
            <span className="vit-numero" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <div className="vit-grafico"><Grafico p={p} /></div>
            <div className="vit-datos">
              <span className="vit-supra">{p.supra}</span>
              <h3 className="vit-titulo">{p.titulo}</h3>
              {p.sub && <p className="vit-sub">{p.sub}</p>}
              <dl className="vit-lista">
                {p.datos.map((d, k) => (
                  <div className="vit-dato" key={k}>
                    <dt>{d.etiqueta}</dt>
                    <dd className={d.tono ? `t-${d.tono}` : ''}>{d.valor}</dd>
                  </div>
                ))}
              </dl>
              {p.accion && (p.accion.tipo === 'ficha' ? (
                <Link className="btn btn-primary vit-cta" to={`/app/maquinaria/equipo/${p.accion.id}`}>{p.accion.texto}</Link>
              ) : (
                <button type="button" className="btn btn-primary vit-cta" onClick={() => onElegir(p.accion!.id)}>{p.accion.texto}</button>
              ))}
            </div>
          </article>
        ))}
        {!filtrada.length && (
          <p className="vit-vacia">{q ? `Ningún resultado para «${q}».` : 'No hay nada que mostrar aquí.'}</p>
        )}
      </div>
    </section>
  );
}
