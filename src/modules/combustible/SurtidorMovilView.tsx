/* ============================================================
   Golden Touch · Combustible · Surtidor (vista de teléfono)

   La pantalla del que está al lado del tanque con el celular: elige el
   tanque, toca «Surtir a un equipo» o «Pasar a otro tanque», pone los
   litros, a qué equipo/camión va, quién autorizó, le saca fotos y guarda.
   Abajo ve los últimos movimientos del tanque y puede abrir cada uno para
   ver o agregar fotos.

   Escribe en las MISMAS tablas que el módulo de PC (registrarUso /
   registrarTraslado, con PMP y contadores encadenados), así que lo que se
   carga acá aparece al instante en la PC, y lo que corrigen en la PC se ve
   acá (realtime). Corregir litros, equipo u hora es tarea de la PC: el rol
   COMBUSTIBLE solo registra, y la base se lo hace cumplir.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/modules/auth/authStore';
import { usePermissions } from '@/modules/auth/PermissionsContext';
import { useRealtime } from '@/shared/lib/useRealtime';
import { toast } from '@/shared/ui/Toast';
import { Modal } from '@/shared/ui/Modal';
import { EmptyState } from '@/shared/ui/EmptyState';
import { num, date, dateTime } from '@/shared/lib/format';
import type { CatalogoCombustible, MovimientoTanque, TanqueCombustible, TipoCatalogoCombustible, TipoMovTanque } from '@/shared/lib/types';
import {
  listTanques, listCatalogos, listMovimientosTanque, registrarUso, registrarTraslado,
  ultimoHorometroEquipo, ultimoContadorTanque, ultimoKilometrajeEquipo,
} from './tanques.repository';
import { AdjuntosSalida, SelectorAdjuntos } from '@/modules/salidas/AdjuntosSalida';
import { adjuntosCombustible, MODULO_ADJUNTO_TANQUE } from './adjuntosCombustible.repository';

/** Clave del rol que trabaja solo desde esta pantalla. */
export const ROL_SURTIDOR = 'combustible';

const ICONO: Record<TipoMovTanque, string> = { entrada: '⬇', uso: '⛽', traslado: '🔁', retorno: '↩', merma: '🔻' };
const NOMBRE_TIPO: Record<TipoMovTanque, string> = { entrada: 'Entrada', uso: 'Surtido', traslado: 'Traslado', retorno: 'Retorno', merma: 'Merma' };

const hoyVE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const horaVE = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date());

type TipoSurtidor = 'uso' | 'traslado';

export function SurtidorMovilView() {
  const { user } = useSession();
  const { can, appUser, role } = usePermissions();
  const canWrite = can('combustible', 'escritura');
  const esSurtidor = role === ROL_SURTIDOR;
  const actor = user?.email ?? 'sistema';
  const actorName = appUser?.nombre?.trim() || user?.email || null;

  const [tanques, setTanques] = useState<TanqueCombustible[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoCombustible[]>([]);
  const [selId, setSelId] = useState('');
  const [movs, setMovs] = useState<MovimientoTanque[]>([]);
  const [conteo, setConteo] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [paso, setPaso] = useState<'inicio' | 'form'>('inicio');
  const [tipo, setTipo] = useState<TipoSurtidor>('uso');
  const [detalle, setDetalle] = useState<MovimientoTanque | null>(null);

  const reloadBase = useCallback(async () => {
    const [ts, cat] = await Promise.all([listTanques(), listCatalogos()]);
    const activos = ts.filter((t) => (t as { estado?: string }).estado !== 'inactivo');
    setTanques(activos);
    setCatalogos(cat);
    setSelId((prev) => (prev && activos.some((t) => t.id === prev) ? prev : activos[0]?.id ?? ''));
  }, []);

  // Solo los últimos 40 del tanque, del más nuevo al más viejo: en el teléfono no se
  // lee un libro mayor, se mira lo que acaba de pasar.
  const reloadMovs = useCallback(async (id: string) => {
    if (!id) { setMovs([]); setConteo(new Map()); return; }
    const todos = await listMovimientosTanque(id);
    const ultimos = todos.slice(-40).reverse();
    setMovs(ultimos);
    try { setConteo(await adjuntosCombustible.contar(MODULO_ADJUNTO_TANQUE, ultimos.map((m) => m.id))); }
    catch { /* el contador de fotos es adorno: sin él la lista se muestra igual */ }
  }, []);

  useEffect(() => {
    let cancel = false;
    reloadBase().catch((e) => { if (!cancel) toast(e instanceof Error ? e.message : 'No se pudo cargar', 'error'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [reloadBase]);
  useEffect(() => { void reloadMovs(selId).catch(() => {}); }, [selId, reloadMovs]);
  useRealtime(['combustible_tanques', 'combustible_tanque_movimientos', 'combustible_catalogos', 'combustible_adjuntos'], () => {
    void reloadBase().catch(() => {});
    void reloadMovs(selId).catch(() => {});
  });

  const sel = useMemo(() => tanques.find((t) => t.id === selId) ?? null, [tanques, selId]);
  const detalleVivo = detalle ? movs.find((m) => m.id === detalle.id) ?? detalle : null;

  function abrirForm(t: TipoSurtidor) { setTipo(t); setPaso('form'); }

  return (
    <div className="surtidor">
      <header className="surt-head">
        <div>
          <h1>⛽ Surtidor</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>{actorName ?? actor}</div>
        </div>
        {!esSurtidor && <Link to="/app/combustible" className="btn btn-ghost">🖥 Módulo completo</Link>}
      </header>

      {loading && <p className="muted">Cargando…</p>}
      {!loading && !tanques.length && <EmptyState icon="⛽" message="No hay tanques activos. Se crean desde el módulo en la PC." />}

      {!!tanques.length && (
        <>
          <div className="surt-rotulo">Tanque</div>
          <div className="surt-tanques" role="tablist" aria-label="Tanque">
            {tanques.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === selId}
                className={`surt-tanque${t.id === selId ? ' sel' : ''}`}
                onClick={() => { setSelId(t.id); setPaso('inicio'); }}>
                <div className="nombre">{t.nombre}</div>
                <div className="saldo">{num(t.saldo_litros)} <small>L</small></div>
              </button>
            ))}
          </div>
        </>
      )}

      {sel && paso === 'inicio' && canWrite && (
        <div className="surt-acciones">
          <button type="button" className="surt-btn primario" onClick={() => abrirForm('uso')}>
            <span className="icono" aria-hidden>⛽</span>
            <span>Surtir a un equipo</span>
            <small>Sale combustible de {sel.nombre} a un equipo o camión</small>
          </button>
          <button type="button" className="surt-btn" onClick={() => abrirForm('traslado')}>
            <span className="icono" aria-hidden>🔁</span>
            <span>Pasar a otro tanque</span>
            <small>Traslado de {sel.nombre} a otro tanque (p. ej. el camión de lubricación)</small>
          </button>
        </div>
      )}
      {sel && !canWrite && <div className="aviso warning sm" style={{ margin: '.75rem 0' }}><span className="aviso-icono">👁</span><div>Tu rol solo puede ver. Para registrar surtidos hace falta escritura en Combustible.</div></div>}

      {sel && paso === 'form' && (
        <FormularioSurtido key={`${sel.id}-${tipo}`} tipo={tipo} tanque={sel} tanques={tanques} catalogos={catalogos}
          actor={actor} actorName={actorName}
          onCancel={() => setPaso('inicio')}
          onSaved={async () => { setPaso('inicio'); await reloadBase().catch(() => {}); await reloadMovs(sel.id).catch(() => {}); }} />
      )}

      {sel && (
        <section className="surt-lista">
          <h2>Últimos movimientos · {sel.nombre}</h2>
          {!movs.length && <p className="muted">Este tanque no tiene movimientos todavía.</p>}
          {movs.map((m) => {
            const entra = m.tipo === 'entrada' || m.tipo === 'retorno';
            const n = conteo.get(m.id) ?? 0;
            return (
              <button key={m.id} type="button" className="surt-mov" onClick={() => setDetalle(m)}>
                <span className="icono" aria-hidden>{ICONO[m.tipo]}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="titulo">{m.equipo || m.observacion || NOMBRE_TIPO[m.tipo]}</div>
                  <div className="sub">
                    {NOMBRE_TIPO[m.tipo]} · {date(m.fecha)}{m.hora ? ` ${m.hora}` : ''}
                    {m.autorizado_por ? ` · Aut.: ${m.autorizado_por}` : ''}
                    {n > 0 ? ` · 📎 ${n}` : ''}
                  </div>
                </span>
                <span className={`litros${entra ? ' entra' : ''}`}>{entra ? '+' : '−'}{num(m.litros)} L</span>
              </button>
            );
          })}
        </section>
      )}

      {detalleVivo && (
        <DetalleMovil mov={detalleVivo} tanque={tanques.find((t) => t.id === detalleVivo.tanque_id) ?? null} tanques={tanques}
          canWrite={canWrite} esSurtidor={esSurtidor} actor={actor} onClose={() => setDetalle(null)} />
      )}
    </div>
  );
}

/* ───────────── Formulario: surtido o traslado ───────────── */
function FormularioSurtido({ tipo, tanque, tanques, catalogos, actor, actorName, onCancel, onSaved }: {
  tipo: TipoSurtidor; tanque: TanqueCombustible; tanques: TanqueCombustible[]; catalogos: CatalogoCombustible[];
  actor: string; actorName: string | null; onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const opts = (t: TipoCatalogoCombustible) => catalogos.filter((c) => c.tipo === t && c.activo);
  const [litros, setLitros] = useState('');
  const [equipo, setEquipo] = useState('');
  const [autorizado, setAutorizado] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fecha, setFecha] = useState(hoyVE());
  const [hora, setHora] = useState(horaVE());
  const [hi, setHi] = useState(''); const [hiAuto, setHiAuto] = useState(false);
  const [hf, setHf] = useState('');
  const [km, setKm] = useState('');
  const [ci, setCi] = useState(''); const [ciAuto, setCiAuto] = useState(false);
  const [cf, setCf] = useState('');
  const [masDatos, setMasDatos] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Igual que en la PC: el horómetro inicial es del equipo y el contador inicial es del
  // tanque; se traen del último final para que la cadena no se corte.
  useEffect(() => {
    if (!equipo) { setHiAuto(false); return; }
    ultimoHorometroEquipo(equipo).then((u) => { if (u != null) { setHi(String(u)); setHiAuto(true); } else setHiAuto(false); }).catch(() => {});
    ultimoKilometrajeEquipo(equipo).then((u) => { if (u != null) setKm(String(u)); }).catch(() => {});
  }, [equipo]);
  useEffect(() => {
    ultimoContadorTanque(tanque.id).then((u) => { if (u != null) { setCi(String(u)); setCiAuto(true); } else { setCi(''); setCiAuto(false); } }).catch(() => {});
  }, [tanque.id]);

  const litrosNum = Number(String(litros).replace(',', '.')) || 0;
  const litrosContador = ci !== '' && cf !== '' ? Number(cf) - Number(ci) : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!(litrosNum > 0)) { setError('Indicá los litros surtidos.'); return; }
    if (tipo === 'uso' && !equipo) { setError('Indicá a qué equipo o camión va el combustible.'); return; }
    if (tipo === 'traslado' && !destinoId) { setError('Indicá a qué tanque pasa el combustible.'); return; }
    if (litrosNum > (Number(tanque.saldo_litros) || 0)) { setError(`El tanque tiene ${num(tanque.saldo_litros)} L: no alcanza para ${num(litrosNum)} L.`); return; }
    setGuardando(true);
    try {
      const campos = {
        fecha, hora, equipo, autorizado_por: autorizado, ubicacion, observacion,
        horometroIni: hi === '' ? null : Number(hi), horometroFin: hf === '' ? null : Number(hf),
        kilometraje: km === '' ? null : Number(km),
        contadorGlobalIni: ci === '' ? null : Number(ci), contadorGlobalFin: cf === '' ? null : Number(cf),
      };
      const mov = tipo === 'uso'
        ? await registrarUso({ tanqueId: tanque.id, litros: litrosNum, campos, actor, actorName })
        : await registrarTraslado({ tanqueId: tanque.id, litros: litrosNum, tanqueDestinoId: destinoId, campos, actor, actorName });
      // Las fotos se suben recién ahora: la carpeta lleva el id del movimiento.
      if (adjuntos.length) {
        const r = await adjuntosCombustible.subir(MODULO_ADJUNTO_TANQUE, mov.id, adjuntos, actor);
        for (const f of r.fallos) toast(`Movimiento guardado, pero una foto no se pudo subir: ${f}`, 'error');
      }
      toast(tipo === 'uso' ? 'Surtido registrado' : 'Traslado registrado', 'success');
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar.'); }
    finally { setGuardando(false); }
  }

  const destinos = tanques.filter((t) => t.id !== tanque.id);

  return (
    <form className="surt-form card" onSubmit={guardar}>
      <div className="surt-form-titulo">
        <span className="icono" aria-hidden>{tipo === 'uso' ? '⛽' : '🔁'}</span>
        <div>
          <strong>{tipo === 'uso' ? 'Surtir a un equipo' : 'Pasar a otro tanque'}</strong>
          <div className="muted" style={{ fontSize: '.85rem' }}>Desde {tanque.nombre} · {num(tanque.saldo_litros)} L disponibles</div>
        </div>
      </div>

      {error && <div className="aviso danger"><span className="aviso-icono">⛔</span><div>{error}</div></div>}

      <div className="surt-campo">
        <label htmlFor="surt-litros">Litros</label>
        <input id="surt-litros" className="input surt-input surt-litros" type="number" inputMode="decimal" step="any" min={0}
          value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="0" autoFocus required />
      </div>

      {tipo === 'traslado' && (
        <div className="surt-campo">
          <label htmlFor="surt-destino">¿A qué tanque pasa?</label>
          <select id="surt-destino" className="select surt-input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
            <option value="">— elegí el tanque —</option>
            {destinos.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {num(t.saldo_litros)} L</option>)}
          </select>
        </div>
      )}

      <div className="surt-campo">
        <label htmlFor="surt-equipo">{tipo === 'uso' ? '¿A qué equipo o camión va?' : 'Equipo / camión que lo lleva (opcional)'}</label>
        <select id="surt-equipo" className="select surt-input" value={equipo} onChange={(e) => setEquipo(e.target.value)} required={tipo === 'uso'}>
          <option value="">— elegí el equipo —</option>
          {opts('equipo').map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
        </select>
      </div>

      <div className="surt-campo">
        <label htmlFor="surt-autorizado">Autorizado por</label>
        <select id="surt-autorizado" className="select surt-input" value={autorizado} onChange={(e) => setAutorizado(e.target.value)}>
          <option value="">— elegí quién autorizó —</option>
          {opts('autorizado').map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
        </select>
      </div>

      <div className="surt-campo">
        <label htmlFor="surt-cf">Contador del surtidor al terminar</label>
        <input id="surt-cf" className="input surt-input" type="number" inputMode="decimal" step="any" value={cf} onChange={(e) => setCf(e.target.value)}
          placeholder={ciAuto ? `arrancó en ${ci}` : 'lectura final del contador'} />
        {litrosContador != null && (
          <small className={Math.abs(litrosContador - litrosNum) > 1 ? 'surt-alerta' : 'muted'}>
            Según el contador salieron {num(litrosContador)} L{Math.abs(litrosContador - litrosNum) > 1 && litrosNum > 0 ? ' · no coincide con los litros' : ''}
          </small>
        )}
      </div>

      <SelectorAdjuntos archivos={adjuntos} onChange={setAdjuntos} titulo="📷 Fotos (contador, equipo, vale)" grande />

      <button type="button" className="surt-mas" onClick={() => setMasDatos((v) => !v)}>
        {masDatos ? '▾ Menos datos' : '▸ Más datos (horómetro, kilometraje, destino, hora, observación)'}
      </button>
      {masDatos && (
        <>
          <div className="surt-grid2">
            <div className="surt-campo">
              <label htmlFor="surt-hi">Horómetro inicial</label>
              <input id="surt-hi" className="input surt-input" type="number" inputMode="decimal" step="any" value={hi} readOnly={hiAuto}
                onChange={(e) => setHi(e.target.value)} placeholder="último del equipo" />
            </div>
            <div className="surt-campo">
              <label htmlFor="surt-hf">Horómetro final</label>
              <input id="surt-hf" className="input surt-input" type="number" inputMode="decimal" step="any" value={hf} onChange={(e) => setHf(e.target.value)} />
            </div>
          </div>
          <div className="surt-grid2">
            <div className="surt-campo">
              <label htmlFor="surt-km">Kilometraje</label>
              <input id="surt-km" className="input surt-input" type="number" inputMode="decimal" step="any" value={km} onChange={(e) => setKm(e.target.value)} placeholder="odómetro" />
            </div>
            <div className="surt-campo">
              <label htmlFor="surt-ci">Contador inicial</label>
              <input id="surt-ci" className="input surt-input" type="number" inputMode="decimal" step="any" value={ci} readOnly={ciAuto} onChange={(e) => setCi(e.target.value)} />
            </div>
          </div>
          <div className="surt-campo">
            <label htmlFor="surt-ubic">Destino / mina</label>
            <select id="surt-ubic" className="select surt-input" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
              <option value="">— sin destino —</option>
              {opts('ubicacion').map((c) => <option key={c.id} value={c.valor}>{c.valor}</option>)}
            </select>
          </div>
          <div className="surt-grid2">
            <div className="surt-campo">
              <label htmlFor="surt-fecha">Fecha</label>
              <input id="surt-fecha" className="input surt-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="surt-campo">
              <label htmlFor="surt-hora">Hora</label>
              <input id="surt-hora" className="input surt-input" value={hora} onChange={(e) => setHora(e.target.value)} placeholder="8:02:00 AM" />
            </div>
          </div>
          <div className="surt-campo">
            <label htmlFor="surt-obs">Observación</label>
            <input id="surt-obs" className="input surt-input" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="SUMINISTRO COMBUSTIBLE…" />
          </div>
        </>
      )}

      <button type="submit" className="btn btn-primary surt-guardar" disabled={guardando}>
        {guardando ? 'Guardando…' : tipo === 'uso' ? '✔ Registrar surtido' : '✔ Registrar traslado'}
      </button>
      <button type="button" className="btn btn-ghost btn-grande" onClick={onCancel} disabled={guardando}>Cancelar</button>
    </form>
  );
}

/* ───────────── Detalle de un movimiento (fotos) ───────────── */
function DetalleMovil({ mov, tanque, tanques, canWrite, esSurtidor, actor, onClose }: {
  mov: MovimientoTanque; tanque: TanqueCombustible | null; tanques: TanqueCombustible[];
  canWrite: boolean; esSurtidor: boolean; actor: string; onClose: () => void;
}) {
  const destino = mov.tanque_destino_id ? tanques.find((t) => t.id === mov.tanque_destino_id)?.nombre : null;
  const Fila = ({ k, v }: { k: string; v: string | null | undefined }) => v ? (
    <div className="surt-fila"><span className="muted">{k}</span><span>{v}</span></div>
  ) : null;
  return (
    <Modal title={`${ICONO[mov.tipo]} ${NOMBRE_TIPO[mov.tipo]} · ${num(mov.litros)} L`} size="md" onClose={onClose}
      footer={<>
        {!esSurtidor && <Link to="/app/combustible" className="btn btn-ghost btn-grande" onClick={onClose}>🖥 Corregir en la PC</Link>}
        <button className="btn btn-primary btn-grande" onClick={onClose}>Cerrar</button>
      </>}>
      <div className="surt-detalle">
        <Fila k="Tanque" v={tanque?.nombre} />
        <Fila k="Fecha" v={`${date(mov.fecha)}${mov.hora ? ` · ${mov.hora}` : ''}`} />
        <Fila k="Equipo" v={mov.equipo} />
        <Fila k="A qué tanque" v={destino} />
        <Fila k="Autorizado por" v={mov.autorizado_por} />
        <Fila k="Destino / mina" v={mov.ubicacion} />
        <Fila k="Observación" v={mov.observacion} />
        <Fila k="Contador" v={mov.contador_global_ini != null || mov.contador_global_fin != null ? `${mov.contador_global_ini ?? '—'} → ${mov.contador_global_fin ?? '—'}` : null} />
        <Fila k="Horómetro" v={mov.horometro_ini != null || mov.horometro_fin != null ? `${mov.horometro_ini ?? '—'} → ${mov.horometro_fin ?? '—'}` : null} />
        <Fila k="Kilometraje" v={mov.kilometraje != null ? num(mov.kilometraje) : null} />
        <Fila k="Registrado" v={`${dateTime(mov.created_at)}${mov.actor_name || mov.created_by ? ` · ${mov.actor_name || mov.created_by}` : ''}`} />
      </div>
      <AdjuntosSalida repo={adjuntosCombustible} modulo={MODULO_ADJUNTO_TANQUE} refId={mov.id} actor={actor} soloLectura={!canWrite} grande
        titulo="📷 Fotos y documentos" />
      <small className="muted" style={{ display: 'block', marginTop: '.6rem' }}>
        Acá se agregan o quitan fotos. Los litros, el equipo, la hora y los medidores se corrigen desde el módulo de Combustible en la PC; el cambio se ve acá al instante.
      </small>
    </Modal>
  );
}
