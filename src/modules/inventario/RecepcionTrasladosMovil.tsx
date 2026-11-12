/* ============================================================
   Traslados con RECEPCIÓN · teléfono (12/11/2026).
   · RecepcionTrasladosMovil (modo «recibir»): en el Depósito Mina, lo que mandó
     Los Pinos y falta recibir. Se ven las fotos del envío; el usuario adjunta las
     suyas, escribe una nota si quiere y le da entrada: abre el WhatsApp con las fotos.
   · Modo «enviados»: en Los Pinos, lo que está en camino; se puede anular.
   · FotosTrasladoInput: el selector de fotos (también lo usa el traslado al enviar).
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from '@/shared/ui/Toast';
import { previewGaleria } from '@/shared/lib/reportePreview';
import { useRealtime } from '@/shared/lib/useRealtime';
import { nombreDepositoChat } from './inventarioMovil';
import { fechaHoraVE, num } from './salidasMina';
import { Listo } from './SalidaMinaMovil';
import {
  MAX_FOTOS_TRASLADO, errorFotosTraslado, mensajeRecepcionTraslado, textoTraslado,
  type FotoTraslado, type TrasladoTransito,
} from './trasladosTransito';
import { anularTrasladoTransito, listTrasladosEnTransito, recibirTrasladoTransito, urlFotoTraslado } from './trasladosTransito.repository';

const errMsg = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const esImagen = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);

/** Traslados en tránsito de un depósito (como destino o como origen), en vivo. */
export function useTrasladosEnTransito(f: { destino?: string; origen?: string }, activo: boolean) {
  const [lista, setLista] = useState<TrasladoTransito[]>([]);
  const { destino, origen } = f;
  const cargar = useCallback(async () => {
    if (!activo) { setLista([]); return; }
    setLista(await listTrasladosEnTransito({ destino, origen }).catch(() => []));
  }, [activo, destino, origen]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['traslados_transito'], () => { void cargar(); });
  return { lista, recargar: cargar };
}

/** Selector de fotos (cámara o galería), con vista previa y quitar. */
export function FotosTrasladoInput({ id, fotos, onChange, rotulo, disabled }: {
  id: string; fotos: File[]; onChange: (f: File[]) => void; rotulo: string; disabled?: boolean;
}) {
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => { previas.forEach((u) => URL.revokeObjectURL(u)); }, [previas]);
  function agregar(lista: FileList | null) {
    const nuevas = Array.from(lista ?? []);
    const mal = errorFotosTraslado(nuevas, fotos.length);
    if (mal) toast(mal, 'warning');
    onChange([...fotos, ...nuevas.filter(esImagen)].slice(0, MAX_FOTOS_TRASLADO));
  }
  return (
    <div className="surt-campo">
      <label htmlFor={id}>{rotulo} ({fotos.length}/{MAX_FOTOS_TRASLADO})</label>
      {fotos.length < MAX_FOTOS_TRASLADO && (
        <input id={id} className="input surt-input" type="file" accept="image/*" multiple disabled={disabled}
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      )}
      {!!fotos.length && (
        <div className="rep-fotos">
          {fotos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="rep-foto surt-foto-quitar">
              <img src={previas[i]} alt={f.name} />
              <button type="button" aria-label={`Quitar ${f.name}`} disabled={disabled}
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fotos ya guardadas: miniaturas que se abren en la vista previa. */
function FotosGuardadas({ fotos, titulo }: { fotos: FotoTraslado[]; titulo: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void Promise.all(fotos.map(async (f) => [f.path, await urlFotoTraslado(f.path).catch(() => '')] as const))
      .then((xs) => { if (vivo) setUrls(Object.fromEntries(xs)); });
    return () => { vivo = false; };
  }, [fotos]);
  if (!fotos.length) return <small className="muted">{titulo}: sin fotos.</small>;
  const galeria = fotos.filter((f) => !!urls[f.path]).map((f) => ({ path: f.path, url: urls[f.path], filename: f.filename, etiqueta: titulo }));
  return (
    <div>
      <small className="muted">{titulo} ({fotos.length})</small>
      <div className="rep-fotos">
        {fotos.map((f) => (
          <button key={f.path} type="button" className="rep-foto" disabled={!urls[f.path]}
            onClick={() => previewGaleria(galeria, Math.max(0, galeria.findIndex((x) => x.path === f.path)))}
            aria-label={`Ver ${f.filename}`}>
            {urls[f.path] ? <img src={urls[f.path]} alt={f.filename} /> : <span className="rep-foto-doc">📷</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResumenTraslado({ t }: { t: TrasladoTransito }) {
  return (
    <>
      <div className="muted" style={{ fontSize: '.85rem' }}>
        De <strong>{nombreDepositoChat(t.origen)}</strong> a <strong>{nombreDepositoChat(t.destino)}</strong>
        {' · '}{t.enviado_por_nombre || t.enviado_por || '—'} · {fechaHoraVE(t.created_at)}
      </div>
      <ul style={{ margin: '.4rem 0', paddingLeft: '1.1rem' }}>
        {t.items.map((x, i) => (
          <li key={`${x.producto_id}-${i}`}><strong>{x.nombre}</strong> — {num(Number(x.cantidad) || 0)} {x.unidad}
            {x.codigo && <span className="muted mono" style={{ fontSize: '.75rem' }}> · {x.codigo}</span>}</li>
        ))}
      </ul>
      {t.nota && <div style={{ fontSize: '.88rem' }}>📝 {t.nota}</div>}
    </>
  );
}

function DetalleRecibir({ t, actorName, onVolver, onHecho }: {
  t: TrasladoTransito; actorName: string | null; onVolver: () => void; onHecho: () => void;
}) {
  const [fotos, setFotos] = useState<File[]>([]);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<TrasladoTransito | null>(null);

  async function recibir(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      setHecho(await recibirTrasladoTransito(t, { nota: nota.trim() || null, fotos, actorName }));
    } catch (err) {
      toast(errMsg(err, 'No se pudo recibir el traslado'), 'error');
    } finally { setGuardando(false); }
  }

  if (hecho) {
    return <Listo titulo={`Traslado ${hecho.codigo} recibido`} texto={mensajeRecepcionTraslado(hecho, actorName)} fotos={fotos} onListo={onHecho} />;
  }
  return (
    <form className="surt-form" onSubmit={(e) => void recibir(e)}>
      <div className="surt-form-titulo"><span className="icono" aria-hidden>📥</span><strong>Recibir · {t.codigo}</strong></div>
      <ResumenTraslado t={t} />
      <FotosGuardadas fotos={t.fotos_envio} titulo="Fotos que mandó Los Pinos" />
      <FotosTrasladoInput id="tra-recibir-fotos" fotos={fotos} onChange={setFotos} rotulo="Fotos de lo que recibiste" disabled={guardando} />
      <div className="surt-campo">
        <label htmlFor="tra-recibir-nota">Nota</label>
        <input id="tra-recibir-nota" className="input surt-input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Opcional: llegó completo, llegó dañado…" autoComplete="off" disabled={guardando} />
      </div>
      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>
        {guardando ? 'Dando entrada…' : '✅ Recibir y dar entrada'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onVolver} disabled={guardando}>← Otro traslado</button>
    </form>
  );
}

export function RecepcionTrasladosMovil({ modo, lista, actorName, canWrite, onVolver, onCambio }: {
  modo: 'recibir' | 'enviados';
  lista: TrasladoTransito[];
  actorName: string | null;
  canWrite: boolean;
  onVolver: () => void;
  onCambio: () => void;
}) {
  const [elegido, setElegido] = useState<TrasladoTransito | null>(null);
  const [busca, setBusca] = useState('');
  const [anulando, setAnulando] = useState<string | null>(null);
  const filtrados = useMemo(() => {
    const q = busca.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return q ? lista.filter((t) => textoTraslado(t).includes(q)) : lista;
  }, [lista, busca]);

  async function anular(t: TrasladoTransito) {
    const motivo = window.prompt(`¿Por qué se anula ${t.codigo}? El material vuelve a ${nombreDepositoChat(t.origen)}.`);
    if (motivo == null) return;
    setAnulando(t.id);
    try {
      await anularTrasladoTransito(t.id, motivo, actorName);
      toast(`${t.codigo} anulado: el material volvió a ${nombreDepositoChat(t.origen)}.`, 'success');
      onCambio();
    } catch (err) {
      toast(errMsg(err, 'No se pudo anular'), 'error');
    } finally { setAnulando(null); }
  }

  if (elegido && modo === 'recibir') {
    return <DetalleRecibir t={elegido} actorName={actorName} onVolver={() => setElegido(null)} onHecho={() => { setElegido(null); onCambio(); }} />;
  }

  return (
    <div className="surt-form">
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>{modo === 'recibir' ? '📥' : '🚚'}</span>
        <strong>{modo === 'recibir' ? `Traslados por recibir (${lista.length})` : `Traslados en camino (${lista.length})`}</strong>
      </div>
      {lista.length > 3 && (
        <input className="input surt-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar por código, producto o quién envió…" aria-label="Buscar traslado" />
      )}
      {!filtrados.length && <p className="muted">{lista.length ? 'Ningún traslado coincide.' : modo === 'recibir' ? 'No hay traslados por recibir.' : 'No hay traslados en camino.'}</p>}
      {filtrados.map((t) => (
        <div key={t.id} className="card" style={{ padding: '.7rem', marginBottom: '.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
            <strong className="mono">{t.codigo}</strong>
            <small className="muted">{t.items.length} producto{t.items.length === 1 ? '' : 's'}</small>
          </div>
          <ResumenTraslado t={t} />
          <FotosGuardadas fotos={t.fotos_envio} titulo="Fotos del envío" />
          {modo === 'recibir' && canWrite && (
            <button type="button" className="btn btn-primary btn-grande" style={{ marginTop: '.5rem', width: '100%' }} onClick={() => setElegido(t)}>
              📥 Recibir
            </button>
          )}
          {modo === 'enviados' && canWrite && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem' }} disabled={anulando === t.id}
              onClick={() => void anular(t)}>{anulando === t.id ? 'Anulando…' : '↩ Anular (vuelve a Los Pinos)'}</button>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-grande" onClick={onVolver}>← Volver</button>
    </div>
  );
}
