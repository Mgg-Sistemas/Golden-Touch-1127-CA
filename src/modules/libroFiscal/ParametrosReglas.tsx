/* ============================================================
   Golden Touch · Retenciones · Reglas de un impuesto (R7), dentro de su ficha
   Cuándo se retiene (condiciones) y cómo (los 8 pasos), por versiones: solo
   «en prueba» se edita; «Probar la regla» corre el motor con datos de la fecha
   y lo compara con el cálculo de hoy antes de activarla. Activar, retirar y
   versión nueva, con motivo.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal';
import { toast } from '@/shared/ui/Toast';
import { useRealtime } from '@/shared/lib/useRealtime';
import {
  NOMBRE_PASO, OPERACIONES_PASO, PIEZAS, VALORES_PIEZA, textoCondicion, textoPaso, validarCondicion, validarPaso,
  type CondicionRegla, type Operador, type PasoRegla, type Pieza, type SujetoGt,
} from './motorReglas';
import {
  activarRegla, crearRegla, faltaEnEstadoRegla, faltaEnReglaNueva, guardarCondicion, guardarPaso, listReglas, nuevaVersionRegla, quitarCondicion,
  quitarPaso, retirarRegla, type ReglaGuardada,
} from './reglas.repository';
import { cargarDatosPrueba, correrPrueba, loQueUsa, type EntradaPrueba, type ResultadoPrueba } from './probarRegla';
import { fechaCorta } from './parametrosR1';
import { hoyVenezuela } from '@/shared/lib/rangosFecha';
import { entradaDePrueba, leerPrioridad, pistaLeido } from './parametrosNumeros';

/** Hoy en Venezuela (no en UTC: después de las 20:00 ya sería mañana). */
const hoyIso = hoyVenezuela;
const mensaje = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const ESTADO: Record<ReglaGuardada['estado'], { texto: string; color: string }> = {
  en_prueba: { texto: 'En prueba', color: 'var(--warning)' }, vigente: { texto: 'Vigente', color: 'var(--success)' }, retirada: { texto: 'Retirada', color: 'var(--text-muted)' },
};
/** Valores de ejemplo de cada operación, para empezar a editar. */
const PLANTILLA: Record<string, Record<string, unknown>> = {
  componer_base: { componentes: [{ campo: 'pago', signo: '+' }] }, convertir_moneda: { tasa: 'bcv_fecha_factura' },
  comparar_minimo: { desde: 'clasificacion' }, pct_fijo: { pct: 1 }, pct_parametro: { parametro: 'alicuota' },
  pct_clasificacion: { clasificacion: 'islr_conceptos' }, tramos: { tarifa: 'islr_tarifa_2' }, monto_fijo: { monto: 0, unidad: 'UT' },
  restar_sustraendo: { desde: 'clasificacion' }, retener_pct: { parametro: 'pct_retencion' }, retener_todo: {},
  topes: { minimo: 0 }, redondear: { decimales: 2 },
};

export function ParametrosReglas({ puedeEditar, impuestoClave }: { puedeEditar: boolean; impuestoClave: string }) {
  const [reglas, setReglas] = useState<ReglaGuardada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [accion, setAccion] = useState<'nueva' | 'activar' | 'retirar' | 'version' | 'probar' | null>(null);

  const cargar = useCallback(async () => {
    try {
      const xs = await listReglas(impuestoClave);
      setReglas(xs); setError(null);
      setSelId((id) => (id && xs.some((r) => r.id === id) ? id : xs.find((r) => r.estado === 'vigente')?.id ?? xs[0]?.id ?? null));
    } catch (e) { setError(mensaje(e, 'No se pudieron leer las reglas.')); }
  }, [impuestoClave]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRealtime(['retencion_reglas', 'retencion_regla_condiciones', 'retencion_regla_pasos'], () => { void cargar(); });

  const sel = reglas?.find((r) => r.id === selId) ?? null;
  const editable = puedeEditar && sel?.estado === 'en_prueba';

  return (
    <div>
      {error && <div className="card" style={{ borderColor: 'var(--danger)' }}>{error} <button type="button" className="btn btn-sm btn-ghost" onClick={() => void cargar()}>Reintentar</button></div>}
      {!reglas && !error && <p className="muted">Leyendo las reglas…</p>}
      {reglas && (
        <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.4rem' }}>
          {reglas.map((r) => (
            <button key={r.id} type="button" className={`btn btn-sm ${r.id === selId ? 'btn-primary' : ''}`} aria-pressed={r.id === selId} onClick={() => setSelId(r.id)}>
              {r.nombre} v{r.version} · <span style={{ color: r.id === selId ? undefined : ESTADO[r.estado].color }}>{ESTADO[r.estado].texto}</span>
            </button>
          ))}
          {reglas.length === 0 && <span className="muted">Sin reglas: el registro usa el cálculo de hoy.</span>}
          {puedeEditar && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAccion('nueva')}>Nueva regla</button>}
        </div>
      )}

      {sel && (
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong>{sel.nombre} · versión {sel.version}</strong>
            <span className="muted" style={{ fontSize: '.8rem' }}>
              {ESTADO[sel.estado].texto} · desde {fechaCorta(sel.desde)}{sel.hasta ? ` hasta ${fechaCorta(sel.hasta)}` : ''} · prioridad {sel.prioridad}
            </span>
          </div>
          <div className="muted" style={{ fontSize: '.76rem' }}>{sel.motivo}{sel.actualizadoPor ? ` · ${sel.actualizadoPor}` : ''}</div>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', margin: '.4rem 0' }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setAccion('probar')}>Probar la regla</button>
            {puedeEditar && sel.estado === 'en_prueba' && <button type="button" className="btn btn-sm" onClick={() => setAccion('activar')}>Activar</button>}
            {puedeEditar && sel.estado === 'vigente' && <button type="button" className="btn btn-sm" onClick={() => setAccion('retirar')}>Retirar</button>}
            {puedeEditar && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAccion('version')}>Nueva versión desde…</button>}
          </div>
          {!editable && sel.estado !== 'en_prueba' && <p className="muted" style={{ fontSize: '.78rem', margin: '0 0 .3rem' }}>Esta versión ya no se edita: para cambiarla, haz una versión nueva.</p>}

          <Condiciones regla={sel} editable={editable} onCambio={() => void cargar()} />
          <Pasos regla={sel} editable={editable} onCambio={() => void cargar()} />
        </div>
      )}

      {accion === 'nueva' && <NuevaReglaModal impuestoClave={impuestoClave} onClose={() => setAccion(null)} onHecho={(id) => { setAccion(null); setSelId(id); void cargar(); }} />}
      {sel && (accion === 'activar' || accion === 'retirar' || accion === 'version') && (
        <EstadoReglaModal regla={sel} accion={accion} onClose={() => setAccion(null)} onHecho={(id) => { setAccion(null); if (id) setSelId(id); void cargar(); }} />
      )}
      {sel && accion === 'probar' && <ProbarModal regla={sel} onClose={() => setAccion(null)} />}
    </div>
  );
}

function Condiciones({ regla, editable, onCambio }: { regla: ReglaGuardada; editable: boolean; onCambio: () => void }) {
  const [pieza, setPieza] = useState<Pieza>('direccion');
  const [operador, setOperador] = useState<Operador>('es');
  const [valorTexto, setValorTexto] = useState('');
  const lista = VALORES_PIEZA[pieza];
  /** Lo escrito → el valor de la condición: un texto, una lista o un objeto JSON. */
  const valor = useMemo<unknown>(() => {
    if (lista) return operador === 'en' || operador === 'no_en' ? valorTexto.split(',').map((x) => x.trim()).filter(Boolean) : valorTexto.trim();
    try { return JSON.parse(valorTexto || '{}'); } catch { return null; }
  }, [lista, operador, valorTexto]);
  const cond: CondicionRegla = { pieza, operador, valor };
  const falta = valor == null ? 'el valor no es un JSON válido' : validarCondicion(cond);

  async function agregar() {
    try { await guardarCondicion(regla.id, cond); toast('Condición agregada.', 'success'); setValorTexto(''); onCambio(); } catch (e) { toast(mensaje(e, 'No se pudo guardar.'), 'error'); }
  }
  async function quitar(i: number) {
    try { await quitarCondicion(regla.idsCondiciones[i]); toast('Condición quitada.', 'success'); onCambio(); } catch (e) { toast(mensaje(e, 'No se pudo quitar.'), 'error'); }
  }

  return (
    <div style={{ marginTop: '.4rem' }}>
      <strong style={{ fontSize: '.84rem' }}>Cuándo se aplica</strong>
      {regla.condiciones.length === 0 && <p className="muted" style={{ fontSize: '.8rem', margin: '.2rem 0' }}>Siempre (sin condiciones).</p>}
      {regla.condiciones.map((c, i) => (
        <div key={regla.idsCondiciones[i] ?? i} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: '.8rem', padding: '.15rem 0' }}>
          <span style={{ flex: 1 }}>• {textoCondicion(c)}</span>
          {editable && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void quitar(i)}>Quitar</button>}
        </div>
      ))}
      {editable && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '.3rem' }}>
          <select className="select" style={{ maxWidth: 190 }} value={pieza} onChange={(e) => { setPieza(e.target.value as Pieza); setValorTexto(''); }} aria-label="Pieza">
            {PIEZAS.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 140 }} value={operador} onChange={(e) => setOperador(e.target.value as Operador)} aria-label="Operador">
            <option value="es">es</option><option value="no_es">no es</option>
            {lista && <><option value="en">es uno de</option><option value="no_en">no es ninguno de</option></>}
          </select>
          <input className="input mono" style={{ flex: '1 1 220px' }} value={valorTexto} onChange={(e) => setValorTexto(e.target.value)}
            placeholder={lista ? `${lista.join(', ')}${operador === 'en' || operador === 'no_en' ? ' (separados por coma)' : ''}` : pieza === 'clasificacion' ? '{"clasificacion": "isae_caroni", "codigos": ["1.01"]}' : '{"monto": 10, "unidad": "UT", "sobre": "pago"}'} aria-label="Valor" />
          <button type="button" className="btn btn-sm" onClick={() => void agregar()} disabled={!!falta || !valorTexto.trim()}>Agregar condición</button>
          {valorTexto.trim() && falta && <small className="hint" style={{ color: 'var(--warning)', width: '100%' }}>{falta}</small>}
        </div>
      )}
    </div>
  );
}

function Pasos({ regla, editable, onCambio }: { regla: ReglaGuardada; editable: boolean; onCambio: () => void }) {
  const [editando, setEditando] = useState<number | null>(null);
  return (
    <div style={{ marginTop: '.6rem' }}>
      <strong style={{ fontSize: '.84rem' }}>Cómo se calcula (8 pasos)</strong>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
        const p = regla.pasos.find((x) => x.paso === n) ?? null;
        return (
          <div key={n} style={{ fontSize: '.8rem', padding: '.2rem 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
              <span className="mono" style={{ width: 18 }}>{n}</span>
              <span style={{ flex: 1 }}>{p ? textoPaso(p) : <span className="muted">{NOMBRE_PASO[n]} · no se usa</span>}</span>
              {editable && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditando(editando === n ? null : n)}>{p ? 'Editar' : 'Usar'}</button>}
              {editable && p && n !== 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void quitarPaso(regla.id, n).then(() => { toast('Paso quitado.', 'success'); onCambio(); }).catch((e) => toast(mensaje(e, 'No se pudo quitar.'), 'error'))}>Quitar</button>}
            </div>
            {editando === n && <EditorPaso reglaId={regla.id} paso={n} actual={p} onHecho={() => { setEditando(null); onCambio(); }} />}
          </div>
        );
      })}
    </div>
  );
}

function EditorPaso({ reglaId, paso, actual, onHecho }: { reglaId: string; paso: number; actual: PasoRegla | null; onHecho: () => void }) {
  const ops = OPERACIONES_PASO[paso];
  const [operacion, setOperacion] = useState(actual?.operacion ?? ops[0]);
  const [json, setJson] = useState(JSON.stringify(actual?.valores ?? PLANTILLA[actual?.operacion ?? ops[0]] ?? {}));
  const valores = useMemo(() => { try { return JSON.parse(json || '{}') as Record<string, unknown>; } catch { return null; } }, [json]);
  const falta = valores == null ? 'los valores no son un JSON válido' : validarPaso({ paso, operacion, valores });
  async function guardar() {
    if (!valores) return;
    try { await guardarPaso(reglaId, { paso, operacion, valores }); toast(`Paso ${paso} guardado.`, 'success'); onHecho(); } catch (e) { toast(mensaje(e, 'No se pudo guardar.'), 'error'); }
  }
  return (
    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end', margin: '.3rem 0 .2rem 1.4rem' }}>
      <select className="select" style={{ maxWidth: 200 }} value={operacion} onChange={(e) => { setOperacion(e.target.value); setJson(JSON.stringify(PLANTILLA[e.target.value] ?? {})); }} aria-label="Operación">
        {ops.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
      <input className="input mono" style={{ flex: '1 1 300px' }} value={json} onChange={(e) => setJson(e.target.value)} aria-label="Valores" />
      <button type="button" className="btn btn-sm" onClick={() => void guardar()} disabled={!!falta}>Guardar paso</button>
      {falta && <small className="hint" style={{ color: 'var(--warning)', width: '100%' }}>{falta}</small>}
    </div>
  );
}

function NuevaReglaModal({ impuestoClave, onClose, onHecho }: { impuestoClave: string; onClose: () => void; onHecho: (id: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [desde, setDesde] = useState(hoyIso());
  const [prioridad, setPrioridad] = useState('100');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const prioridadLeida = leerPrioridad(prioridad);
  /** Por qué «Crear» está apagado (se dice debajo). */
  const falta = 'error' in prioridadLeida ? prioridadLeida.error : faltaEnReglaNueva({ nombre, desde, prioridad: prioridadLeida.valor, motivo });
  async function crear() {
    if ('error' in prioridadLeida || falta) { toast(falta ?? 'Revisa la regla.', 'error'); return; }
    setGuardando(true);
    try { const id = await crearRegla({ impuestoClave, nombre, desde, prioridad: prioridadLeida.valor, motivo }); toast('Regla creada en prueba. Agrega sus condiciones y pasos.', 'success'); onHecho(id); } catch (e) { toast(mensaje(e, 'No se pudo crear.'), 'error'); setGuardando(false); }
  }
  return (
    <Modal title={`Nueva regla · ${impuestoClave}`} onClose={() => !guardando && onClose()}
      footer={(<><button type="button" className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button><button type="button" className="btn btn-primary" onClick={() => void crear()} disabled={guardando || !!falta}>{guardando ? 'Guardando…' : 'Crear'}</button></>)}>
      <fieldset disabled={guardando} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-row"><label>Nombre</label><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: ISAE de otro municipio" /></div>
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <div className="form-row" style={{ flex: '0 1 160px' }}><label>Desde</label><input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="form-row" style={{ flex: '0 1 120px' }}><label>Prioridad</label><input className="input mono" type="text" inputMode="numeric" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} /><small className="hint muted">Vacío = 100</small></div>
        </div>
        <div className="form-row"><label>Motivo</label><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        {falta && <small className="hint" style={{ color: nombre || motivo || 'error' in prioridadLeida ? 'var(--warning)' : undefined, display: 'block' }}>{falta}</small>}
        <small className="hint muted">Nace «en prueba»: no se usa al registrar hasta que se active. Menor prioridad = se revisa primero.</small>
      </fieldset>
    </Modal>
  );
}

function EstadoReglaModal({ regla, accion, onClose, onHecho }: { regla: ReglaGuardada; accion: 'activar' | 'retirar' | 'version'; onClose: () => void; onHecho: (id?: string) => void }) {
  const [fecha, setFecha] = useState(hoyIso());
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const titulo = { activar: 'Activar', retirar: 'Retirar', version: 'Nueva versión de' }[accion];
  const falta = faltaEnEstadoRegla(accion, fecha, motivo);
  async function confirmar() {
    if (falta) { toast(falta, 'error'); return; }
    setGuardando(true);
    try {
      if (accion === 'activar') { await activarRegla(regla.id, motivo); toast('Regla activada: desde su fecha se usa al registrar.', 'success'); onHecho(); }
      else if (accion === 'retirar') { await retirarRegla(regla.id, fecha, motivo); toast('Regla retirada.', 'success'); onHecho(); }
      else { const id = await nuevaVersionRegla(regla.id, fecha, motivo); toast('Versión nueva creada en prueba.', 'success'); onHecho(id); }
    } catch (e) { toast(mensaje(e, 'No se pudo.'), 'error'); setGuardando(false); }
  }
  return (
    <Modal title={`${titulo} ${regla.nombre} v${regla.version}`} compact onClose={() => !guardando && onClose()}
      footer={(<><button type="button" className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button><button type="button" className="btn btn-primary" onClick={() => void confirmar()} disabled={guardando || !!falta}>{guardando ? 'Guardando…' : titulo}</button></>)}>
      {accion === 'activar' && <p style={{ fontSize: '.84rem' }}>Antes de activarla, pruébala y compárala con el cálculo de hoy. Desde el {fechaCorta(regla.desde)} el registro la usa; la versión vigente anterior cierra el día antes.</p>}
      {accion !== 'activar' && <div className="form-row"><label>{accion === 'retirar' ? 'Vale hasta' : 'Vale desde'}</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>}
      <div className="form-row"><label>Motivo</label><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
      {falta && <small className="hint" style={{ color: motivo ? 'var(--warning)' : undefined }}>{falta}</small>}
    </Modal>
  );
}

function ProbarModal({ regla, onClose }: { regla: ReglaGuardada; onClose: () => void }) {
  const usa = loQueUsa(regla);
  const [e, setE] = useState<Omit<EntradaPrueba, 'tasa' | 'pago' | 'baseImponible' | 'iva'>>({ fecha: hoyIso(), direccion: 'practicada', sujeto: 'PJD', moneda: 'Bs', supuesto: false, codigo: null });
  // Los montos se escriben como texto (con decimales, en formato venezolano) y se leen al probar.
  const [textos, setTextos] = useState({ tasa: '', pago: '1000', base: '1000', iva: '160' });
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);
  const [probando, setProbando] = useState(false);
  const set = (p: Partial<EntradaPrueba>) => setE((x) => ({ ...x, ...p }));
  const setTexto = (p: Partial<typeof textos>) => setTextos((x) => ({ ...x, ...p }));
  const entrada = entradaDePrueba(e, textos);
  const pista = (t: string) => { const x = pistaLeido(t); return x ? <small className="hint muted">{x}</small> : null; };

  async function probar() {
    if ('error' in entrada) { toast(entrada.error, 'error'); return; }
    const datos = entrada.valor;
    setProbando(true);
    try { setResultado(correrPrueba(regla, datos, await cargarDatosPrueba(regla, datos))); } catch (err) { toast(mensaje(err, 'No se pudo probar.'), 'error'); } finally { setProbando(false); }
  }

  return (
    <Modal title={`Probar ${regla.nombre} v${regla.version}`} size="xl" onClose={onClose} footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-row" style={{ flex: '0 1 150px', margin: 0 }}><label>Fecha de la factura</label><input className="input" type="date" value={e.fecha} onChange={(x) => set({ fecha: x.target.value })} /></div>
        <div className="form-row" style={{ flex: '0 1 140px', margin: 0 }}><label>Dirección</label><select className="select" value={e.direccion} onChange={(x) => set({ direccion: x.target.value as EntradaPrueba['direccion'] })}><option value="practicada">Practicada</option><option value="sufrida">Recibida</option></select></div>
        <div className="form-row" style={{ flex: '0 1 110px', margin: 0 }}><label>Sujeto</label><select className="select" value={e.sujeto ?? ''} onChange={(x) => set({ sujeto: (x.target.value || null) as SujetoGt | null })}>{['PJD', 'PJND', 'PNR', 'PNNR'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="form-row" style={{ flex: '0 1 100px', margin: 0 }}><label>Moneda</label><select className="select" value={e.moneda} onChange={(x) => set({ moneda: x.target.value })}><option value="Bs">Bs</option><option value="USD">$</option></select></div>
        {e.moneda !== 'Bs' && <div className="form-row" style={{ flex: '0 1 110px', margin: 0 }}><label>Tasa</label><input className="input mono" type="text" inputMode="decimal" value={textos.tasa} onChange={(x) => setTexto({ tasa: x.target.value })} />{pista(textos.tasa)}</div>}
        <div className="form-row" style={{ flex: '0 1 120px', margin: 0 }}><label>Pago</label><input className="input mono" type="text" inputMode="decimal" value={textos.pago} onChange={(x) => setTexto({ pago: x.target.value })} />{pista(textos.pago)}</div>
        <div className="form-row" style={{ flex: '0 1 120px', margin: 0 }}><label>Base imponible</label><input className="input mono" type="text" inputMode="decimal" value={textos.base} onChange={(x) => setTexto({ base: x.target.value })} />{pista(textos.base)}</div>
        <div className="form-row" style={{ flex: '0 1 110px', margin: 0 }}><label>IVA</label><input className="input mono" type="text" inputMode="decimal" value={textos.iva} onChange={(x) => setTexto({ iva: x.target.value })} />{pista(textos.iva)}</div>
        {usa.clasificacion && <div className="form-row" style={{ flex: '0 1 130px', margin: 0 }}><label>Código ({usa.clasificacion})</label><input className="input mono" value={e.codigo ?? ''} onChange={(x) => set({ codigo: x.target.value || null })} /></div>}
        <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'center', fontSize: '.84rem', minHeight: 36 }}><input type="checkbox" checked={e.supuesto} onChange={(x) => set({ supuesto: x.target.checked })} /> Supuesto marcado</label>
        <button type="button" className="btn btn-primary" onClick={() => void probar()} disabled={probando || 'error' in entrada}>{probando ? 'Probando…' : 'Probar'}</button>
      </div>
      {'error' in entrada && <small className="hint" style={{ color: 'var(--warning)' }}>{entrada.error}</small>}

      {resultado && (
        <div style={{ marginTop: '.7rem' }}>
          {resultado.condicionesQueFallan.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--warning)' }}>
              <strong style={{ fontSize: '.84rem' }}>Con estos datos la regla no aplicaría:</strong>
              <ul style={{ margin: '.2rem 0 0 1rem', padding: 0, fontSize: '.8rem' }}>{resultado.condicionesQueFallan.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', margin: '.5rem 0' }}>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Con la regla</div><div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700 }}>{resultado.motor.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {e.moneda}</div>{resultado.motor.motivo && <small className="muted">{resultado.motor.motivo}</small>}</div>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Con el cálculo de hoy</div><div className="mono" style={{ fontSize: '1.2rem' }}>{resultado.hoy ? `${resultado.hoy.monto.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${e.moneda}` : '—'}</div>{resultado.hoy && <small className="muted">{resultado.hoy.explicacion}</small>}</div>
            <div style={{ alignSelf: 'center', fontWeight: 700, color: resultado.coinciden == null ? 'var(--text-muted)' : resultado.coinciden ? 'var(--success)' : 'var(--danger)' }}>
              {resultado.coinciden == null ? 'Sin cálculo de hoy para comparar' : resultado.coinciden ? 'Coinciden' : 'Difieren: revisa la regla antes de activarla'}
            </div>
          </div>
          <table className="table" style={{ fontSize: '.78rem', width: '100%' }}>
            <thead><tr><th>Paso</th><th>Qué hizo</th><th>Valores</th></tr></thead>
            <tbody>
              {resultado.motor.foto.pasos.map((p) => (
                <tr key={p.paso}><td>{p.paso} · {NOMBRE_PASO[p.paso]}</td><td>{p.detalle}</td><td className="mono">{Object.entries(p.valores).map(([k, v]) => `${k}: ${v ?? '—'}`).join(' · ')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
