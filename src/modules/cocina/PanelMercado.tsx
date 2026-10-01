/* ============================================================
   Golden Touch · Cocina · Panel del mercado, por capas

   Portado de MGG (MercadoPanel). Las mismas capas y el mismo dibujo; las
   cuentas viven en mercadoPanel.ts:
     · EcuacionMercado: los números del ciclo en tarjetas, lo que costó el plato y el
       contraste con el inventario, que aparece SOLO si no cuadra. Un «0» que
       tranquiliza ocupa lugar y enseña a no mirar.
     · SelectorVista: Disponible, Movimientos o Ambos.
     · TablaDisponible: los víveres que se movieron; los quietos detrás de un botón.

   Los dos sistemas comparten la hoja de estilos, así que las clases y los
   colores son los de MGG.
   ============================================================ */
import { Fragment, useMemo, useRef, useState } from 'react';
import { dateTime, money, num } from '@/shared/lib/format';
import { CICLO_DIAS, type Mercado, type ResumenViver } from './cocinaMercado.repository';
import { esDescartado } from './mercadoDescarte';
import { diaCaracas } from './mercadoInicio';
import { Modal } from '@/shared/ui/Modal';
import {
  alternarVista, costoDelCiclo, desgloseCifra, ecuacionDelCiclo, explicarDiferencia, filasDisponible,
  vistaEncendida, type CifraCiclo, type InterruptorVista, type VistaMercado,
} from './mercadoPanel';

/** Un cero en una tabla larga es ruido: se muestra un punto tenue. */
function cifra(v: number): string { return v === 0 ? '·' : num(v); }
/** Día de un instante en Caracas, como DD-MM-AAAA. */
function dmy(instante: string): string { const [y, m, d] = diaCaracas(instante).split('-'); return `${d}-${m}-${y}`; }

/* ───────── CAPA 1 · La ecuación del ciclo ───────── */

export function EcuacionMercado({ mercado, items, platos, consumoValor, ciclo, soloDif, onSoloDif }: {
  mercado: Mercado;
  items: ResumenViver[];
  /** Platos servidos en el ciclo. `null` si el mercado es anterior a que se guardaran. */
  platos: number | null;
  consumoValor: number;
  /** Contador del ciclo abierto. `null` para uno cerrado. */
  ciclo: { dia: number; faltan: number; vencido: boolean } | null;
  soloDif: boolean;
  onSoloDif: (activar: boolean) => void;
}) {
  const ec = useMemo(() => ecuacionDelCiclo(items), [items]);
  const costo = useMemo(() => costoDelCiclo(platos, consumoValor), [platos, consumoValor]);
  const abierto = mercado.estado === 'abierto';
  // La tarjeta abierta: cuál cifra se está mirando por dentro.
  const [detalle, setDetalle] = useState<CifraCiclo | 'costo' | null>(null);

  return (
    <div style={{ margin: '.3rem 0 .9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
        <strong style={{ fontSize: '.95rem' }}>🛒 Mercado {mercado.numero ?? ''}</strong>
        <span className="muted" style={{ fontSize: '.78rem' }} title={`Inició ${dateTime(mercado.inicio_at)}`}>
          {dmy(mercado.inicio_at)} → {mercado.cierre_at ? dmy(mercado.cierre_at) : 'en curso'}
          {!abierto && (esDescartado(mercado) ? ' · descartado' : ' · cerrado')}
          {/* El contador que antes iba en la cabecera. Pasado el día 21 se dice con
              palabras además del rojo: en una captura en blanco y negro el color no está. */}
          {abierto && ciclo && (ciclo.vencido
            ? <strong style={{ color: 'var(--danger)' }}> · día {ciclo.dia} de {CICLO_DIAS} · ¡toca cerrar!</strong>
            : ` · día ${ciclo.dia} de ${CICLO_DIAS} · faltan ${ciclo.faltan}`)}
        </span>
      </div>

      {/* La cuenta del ciclo, en UNIDADES, en tarjetas (28/09/2026). Cada una se toca y
          abre quién puso ese número: un total sin el detrás hay que creerlo, y cuadrar
          el almacén es justamente no creerle al total. */}
      <div className="coc-kpis">
        <TarjetaCifra rotulo="Saldo inicial" valor={num(ec.saldoInicial)} nota="lo que quedó del ciclo anterior"
          onAbrir={() => setDetalle('saldoInicial')} />
        <TarjetaCifra rotulo="+ Entradas" valor={num(ec.entradas)} color="var(--primary-3, #2ecc71)" nota="compras del ciclo"
          onAbrir={() => setDetalle('entradas')} />
        <TarjetaCifra rotulo="= Disponible" valor={num(ec.disponible)} fuerte nota="saldo + entradas"
          onAbrir={() => setDetalle('disponible')} />
        <TarjetaCifra rotulo="− Consumo" valor={num(ec.consumo)} color="var(--danger)" nota="servido en comidas"
          onAbrir={() => setDetalle('consumo')} />
        {/* Las pérdidas restan en la cuenta a la vista, pero no son comida servida: no van
            al costo por plato de abajo (decisión del usuario, 15/09/2026). */}
        <TarjetaCifra rotulo="− Mermas / salidas" valor={num(ec.mermas)} color="var(--warning)" nota="dañado, ajustes y traslados"
          onAbrir={() => setDetalle('mermas')} />
        {/* Sin «=», a diferencia de MGG: en GT «Queda» no sale de la cuenta, es el stock. */}
        <TarjetaCifra rotulo={abierto ? 'Queda en inventario' : 'Quedó en inventario'} valor={num(ec.queda)} fuerte
          color="var(--primary-3, #2ecc71)" nota={abierto ? 'pasa al próximo mercado' : 'pasó al próximo mercado'}
          onAbrir={() => setDetalle('queda')} />
      </div>

      {/* Lo que costó dar de comer. La cuenta de arriba se lee en UNIDADES y sirve para
          cuadrar el almacén; esta fila responde la pregunta del presupuesto. Va aparte:
          son otra unidad y mezclarlas con los kilos haría leer mal las dos. */}
      <div className="coc-kpis" style={{ marginTop: '.7rem' }}>
        {costo.platos != null && <TarjetaCifra rotulo="Platos servidos" valor={num(costo.platos)} nota="en este ciclo"
          onAbrir={() => setDetalle('costo')} />}
        <TarjetaCifra rotulo="Costo del consumo" valor={money(costo.consumo)} color="var(--danger)" nota="víveres servidos"
          onAbrir={() => setDetalle('costo')} />
        {costo.platos != null && (
          <TarjetaCifra rotulo="Costo por plato" valor={costo.porPlato != null ? money(costo.porPlato) : '—'} color="var(--warning)" destacado
            nota={costo.porPlato == null ? 'todavía no se sirvió ningún plato' : 'consumo ÷ platos'}
            onAbrir={() => setDetalle('costo')} />
        )}
      </div>

      {ec.viveresConDiferencia > 0 && (
        <div className="card" style={{ marginTop: '.7rem', borderColor: 'var(--warning)', padding: '.55rem .8rem', fontSize: '.83rem' }}>
          ⚠ Según la cuenta del ciclo {abierto ? 'deberían quedar' : 'debían quedar'} <strong className="mono">{num(ec.cuenta)}</strong>
          {ec.diferencia !== 0 ? (
            <>
              {' · diferencia '}
              <strong className="mono" style={{ color: ec.diferencia < 0 ? 'var(--danger)' : 'var(--warning)' }}>
                {ec.diferencia > 0 ? '+' : ''}{num(ec.diferencia)}
              </strong>
              {' en '}
            </>
          ) : ' · no cuadran '}
          {ec.viveresConDiferencia} {ec.viveresConDiferencia === 1 ? 'víver' : 'víveres'}
          {ec.diferencia === 0 && <span className="muted"> (las diferencias se compensan entre sí)</span>}
          {/* Un solo botón lleva de la advertencia a los víveres concretos. */}
          <button className={`btn btn-sm ${soloDif ? 'btn-primary' : 'btn-ghost'}`} style={{ marginLeft: '.5rem' }}
            onClick={() => onSoloDif(!soloDif)}>
            {soloDif ? '↩ Ver todos' : 'Ver solo estos'}
          </button>
        </div>
      )}

      {detalle && (
        <DetalleCifraModal cual={detalle} items={items} ec={ec} costo={costo} abierto={abierto}
          onClose={() => setDetalle(null)} />
      )}
    </div>
  );
}

/** Una cifra del ciclo. Es un botón: se toca y se abre de dónde sale. */
function TarjetaCifra({ rotulo, valor, nota, color, fuerte, destacado, onAbrir }: {
  rotulo: string; valor: string; nota?: string; color?: string;
  /** Número más grande: los dos que se miran primero (Disponible y Queda). */
  fuerte?: boolean;
  /** Borde de marca, como el KPI destacado del resto del sistema. */
  destacado?: boolean;
  onAbrir: () => void;
}) {
  return (
    <button type="button" className={`card coc-kpi${destacado ? ' destacado' : ''}`} onClick={onAbrir}
      title={`Ver de dónde sale «${rotulo}»`}>
      <div className="coc-kpi-rotulo">{rotulo}<span className="coc-kpi-lupa" aria-hidden="true">🔎</span></div>
      <div className="mono coc-kpi-valor" style={{ fontSize: fuerte ? '1.5rem' : '1.3rem', color }}>{valor}</div>
      {nota && <div className="muted coc-kpi-nota">{nota}</div>}
    </button>
  );
}

/* ───────── El detrás de una cifra ───────── */

/** Qué es cada cifra y cómo se saca, en palabras de quien maneja la cocina. */
const EXPLICA: Record<CifraCiclo, { titulo: string; que: string; como: string }> = {
  saldoInicial: {
    titulo: 'Saldo inicial',
    que: 'Lo que quedó en la despensa cuando cerró el mercado anterior y arrancó este.',
    como: 'Es la foto del inventario al abrir el ciclo. No se descarta nada al cerrar: lo que queda arranca el mercado siguiente.',
  },
  entradas: {
    titulo: '+ Entradas',
    que: 'Todo lo que entró a la despensa durante este ciclo: las compras del mercado.',
    como: 'Suma de las entradas de inventario de víveres entre el inicio del ciclo y hoy.',
  },
  disponible: {
    titulo: '= Disponible',
    que: 'Todo lo que hubo para consumir en el ciclo.',
    como: 'Saldo inicial + entradas. Es el techo: de aquí salen las comidas y las mermas.',
  },
  consumo: {
    titulo: '− Consumo',
    que: 'Lo que se sirvió en comidas: desayuno, almuerzo y cena.',
    como: 'Suma de los víveres de los movimientos de cocina del ciclo. Es lo único que entra en el costo por plato.',
  },
  mermas: {
    titulo: '− Mermas / salidas',
    que: 'Lo que bajó del inventario sin ser comida servida: dañado, ajustes a la baja y traslados.',
    como: 'Resta en la cuenta a la vista, pero NO entra en el costo del consumo ni en el costo por plato.',
  },
  queda: {
    titulo: 'Queda en inventario',
    que: 'Lo que hay ahora mismo en la despensa, según el inventario.',
    como: 'Es el stock real, no el resultado de la resta. Si no coincide con disponible − consumo − mermas, el panel avisa y muestra en cuáles víveres.',
  },
};

function DetalleCifraModal({ cual, items, ec, costo, abierto, onClose }: {
  cual: CifraCiclo | 'costo';
  items: ResumenViver[];
  ec: ReturnType<typeof ecuacionDelCiclo>;
  costo: ReturnType<typeof costoDelCiclo>;
  abierto: boolean;
  onClose: () => void;
}) {
  const filas = useMemo(() => (cual === 'costo' ? [] : desgloseCifra(items, cual)), [cual, items]);
  const total = useMemo(() => filas.reduce((a, f) => a + f.valor, 0), [filas]);

  if (cual === 'costo') {
    return (
      <Modal title="💲 Lo que costó dar de comer" size="md" onClose={onClose}>
        <p style={{ marginTop: 0 }}>
          La cuenta de arriba se lee en <strong>unidades</strong> y sirve para cuadrar la despensa.
          Esta fila responde otra pregunta: <strong>cuánto costó</strong>.
        </p>
        <div className="coc-kpis" style={{ marginBottom: '.8rem' }}>
          <div className="card" style={{ padding: '.6rem .75rem' }}>
            <div className="coc-kpi-rotulo">Platos servidos</div>
            <div className="mono coc-kpi-valor" style={{ fontSize: '1.3rem' }}>{costo.platos != null ? num(costo.platos) : '—'}</div>
            <div className="muted coc-kpi-nota">raciones cargadas en las comidas del ciclo</div>
          </div>
          <div className="card" style={{ padding: '.6rem .75rem' }}>
            <div className="coc-kpi-rotulo">Costo del consumo</div>
            <div className="mono coc-kpi-valor" style={{ fontSize: '1.3rem', color: 'var(--danger)' }}>{money(costo.consumo)}</div>
            <div className="muted coc-kpi-nota">los víveres servidos, al precio del inventario</div>
          </div>
          <div className="card" style={{ padding: '.6rem .75rem', borderColor: 'var(--brand, #ff8a00)' }}>
            <div className="coc-kpi-rotulo">Costo por plato</div>
            <div className="mono coc-kpi-valor" style={{ fontSize: '1.3rem', color: 'var(--warning)' }}>
              {costo.porPlato != null ? money(costo.porPlato) : '—'}
            </div>
            <div className="muted coc-kpi-nota">costo del consumo ÷ platos servidos</div>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: '.85rem' }}>
          Las <strong>mermas y salidas no entran aquí</strong>: lo dañado, los ajustes y los traslados no son comida
          servida, así que no encarecen el plato. {costo.platos == null && 'Este mercado es anterior a que se guardaran los platos del ciclo, por eso no hay costo por plato.'}
        </p>
      </Modal>
    );
  }

  const x = EXPLICA[cual];
  const titulo = cual === 'queda' && !abierto ? 'Quedó en inventario' : x.titulo;
  return (
    <Modal title={`🧮 ${titulo}`} size="lg" onClose={onClose}>
      <p style={{ marginTop: 0 }}>{x.que}</p>
      <p className="muted" style={{ fontSize: '.85rem' }}>{x.como}</p>

      <div className="card" style={{ padding: '.55rem .8rem', marginBottom: '.7rem' }}>
        <span className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total del ciclo</span>
        <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{num(ec[cual])}</div>
        <div className="muted" style={{ fontSize: '.75rem' }}>{num(filas.length)} {filas.length === 1 ? 'víver aporta' : 'víveres aportan'} a esta cifra</div>
      </div>

      {filas.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Ningún víver aporta a esta cifra en el ciclo.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="table" style={{ fontSize: '.85rem' }}>
            <thead><tr>
              <th>Víver</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th style={{ textAlign: 'right' }}>Parte</th>
            </tr></thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.producto_id}>
                  <td>{r.nombre} {r.unidad && <span className="muted">· {r.unidad}</span>}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{num(r.valor)}</td>
                  <td className="mono muted" style={{ textAlign: 'right' }}>
                    {total > 0 ? `${num(Math.round((r.valor / total) * 1000) / 10)} %` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ───────── CAPA 2 · Qué se quiere mirar ───────── */

/* Tres interruptores en vez de cuatro botones (28/09/2026, pedido del usuario).
   «Ambos» dejó de ser una opción aparte: encender Disponible y Movimientos a la vez
   ES ambos, que es como se piensa al mirar la pantalla. Cada uno dice qué prende. */
const INTERRUPTORES: { vista: InterruptorVista; icono: string; titulo: string; que: string }[] = [
  { vista: 'disponible', icono: '📋', titulo: 'Disponible', que: 'Qué hay de cada víver y cuánto queda' },
  { vista: 'movimientos', icono: '🧾', titulo: 'Movimientos', que: 'Entradas, traslados, consumos y mermas' },
  // Traído de MGG (21/09/2026): el control de distribución vive aquí, no en una
  // pantalla aparte, porque mira el mismo ciclo que las otras dos vistas.
  { vista: 'distribucion', icono: '📊', titulo: 'Distribución', que: 'Consumo por día, lote de compra y reorden' },
];

export function SelectorVista({ vista, onElegir }: { vista: VistaMercado; onElegir: (v: VistaMercado) => void }) {
  // Lo último que se miraba antes de Distribución: al apagarla se vuelve ahí y no a
  // una vista cualquiera. Se guarda en el render porque no debe provocar otro.
  const previa = useRef<VistaMercado>(vista === 'distribucion' ? 'disponible' : vista);
  if (vista !== 'distribucion') previa.current = vista;

  return (
    <div className="coc-vistas" role="group" aria-label="Qué mirar del mercado">
      {INTERRUPTORES.map((it) => {
        const on = vistaEncendida(vista, it.vista);
        // Apagar el último encendido dejaría la pantalla en blanco: se avisa en vez de hacerlo.
        const ultimo = on && it.vista !== 'distribucion' && alternarVista(vista, it.vista, previa.current) === vista;
        return (
          <button key={it.vista} type="button" role="switch" aria-checked={on} aria-label={`${it.titulo}: ${it.que}`}
            className={`coc-vista${on ? ' on' : ''}${ultimo ? ' ultimo' : ''}`}
            title={ultimo ? 'Es lo único encendido: enciende otra vista antes de apagar esta' : `${on ? 'Apagar' : 'Encender'} ${it.titulo}`}
            onClick={() => onElegir(alternarVista(vista, it.vista, previa.current))}>
            <span className="coc-vista-txt">
              <span className="coc-vista-titulo">{it.icono} {it.titulo}</span>
              <span className="coc-vista-que">{it.que}</span>
            </span>
            <span className="coc-sw" aria-hidden="true"><span className="coc-sw-bola" /></span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────── CAPA 3 · Disponible a consumir ───────── */

export function TablaDisponible({ items, soloDif, onSoloDif, onElegir, alCierre = false, maxHeight = 420 }: {
  items: ResumenViver[];
  soloDif: boolean;
  onSoloDif: (activar: boolean) => void;
  /** Tocar un víver abre su detalle. Sin esto, la tabla es de solo lectura. */
  onElegir?: (r: ResumenViver) => void;
  /** Un ciclo ya cerrado: los verbos van en pasado y la última columna es «Quedó». */
  alCierre?: boolean;
  maxHeight?: number | string;
}) {
  const [verQuietos, setVerQuietos] = useState(false);
  const { filas, quietosOcultables, difPorProducto } = useMemo(
    () => filasDisponible(items, { verQuietos, soloDif }),
    [items, verQuietos, soloDif],
  );

  return (
    <div className="card" style={{ marginBottom: '.9rem' }}>
      <div className="card-title" style={{ marginBottom: '.5rem' }}>
        Disponible a consumir{' '}
        <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          · saldo inicial + entradas − consumos − mermas{onElegir ? ' · toca un víver para el detalle' : ''}
        </span>
      </div>

      {/* Una tabla filtrada que no lo dice se lee como si fuera todo el mercado. El aviso
          lleva su propia salida, para no tener que volver a la tira de arriba. */}
      {soloDif && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.5rem', padding: '.4rem .6rem',
          borderLeft: '3px solid var(--warning)', background: 'var(--bg-2, rgba(255,255,255,.03))', borderRadius: 'var(--r-sm, 4px)', fontSize: '.79rem',
        }}>
          <span style={{ color: 'var(--warning)' }}>
            Mostrando solo los <strong>{filas.length}</strong> víveres que no cuadran, de {items.length}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => onSoloDif(false)}>↩ Ver todos</button>
        </div>
      )}

      {!filas.length ? (
        <p className="muted" style={{ margin: 0 }}>
          {soloDif
            ? 'Ya no queda ningún víver descuadrado: la cuenta del ciclo y el inventario coinciden.'
            : items.length ? 'Ningún víver se movió en este mercado todavía.' : 'Sin víveres en este mercado todavía.'}
        </p>
      ) : (
        <div className="table-wrap" style={{ maxHeight, overflowY: 'auto' }}>
          <table className="table" style={{ fontSize: '.83rem' }}>
            <thead><tr>
              <th>Víver</th>
              <th style={{ textAlign: 'right' }}>Saldo inicial</th>
              <th style={{ textAlign: 'right' }}>Entradas</th>
              <th style={{ textAlign: 'right' }}>Disponible</th>
              <th style={{ textAlign: 'right' }}>Consumido</th>
              <th style={{ textAlign: 'right' }} title="Salidas que no son comidas: pérdidas, salidas manuales, ajustes a la baja, traslados">Mermas / salidas</th>
              <th style={{ textAlign: 'right' }}>{alCierre ? 'Quedó' : 'Queda'}</th>
            </tr></thead>
            <tbody>
              {filas.map((r) => {
                const dif = difPorProducto.get(r.producto_id);
                const unidad = r.unidad ?? '';
                return (
                  // El Fragment lleva la key: la fila y su sub-línea de diferencia son dos <tr>.
                  <Fragment key={r.producto_id}>
                    <tr className={onElegir ? 'row-selectable' : undefined}
                      style={{ cursor: onElegir ? 'pointer' : undefined, ...(dif ? { borderLeft: '3px solid var(--warning)' } : {}) }}
                      onClick={onElegir ? () => onElegir(r) : undefined}
                      onKeyDown={onElegir ? (e) => { if (e.key === 'Enter') onElegir(r); } : undefined}
                      tabIndex={onElegir ? 0 : undefined}
                      title={onElegir ? 'Ver saldo, entradas y consumos' : undefined}>
                      {/* La unidad va UNA vez, con el nombre: repetida en cada celda partía los números. */}
                      <td>
                        {r.nombre}{' '}
                        {unidad && <span className="muted mono" style={{ fontSize: '.72rem' }}>{unidad}</span>}
                        {' '}{r.sku && <span className="dim mono" style={{ fontSize: '.7rem' }}>{r.sku}</span>}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{cifra(r.saldo_inicial)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.entradas ? 'var(--primary-3, #2ecc71)' : undefined }}>{r.entradas ? `+${num(r.entradas)}` : '·'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{cifra(r.disponible)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.consumo ? 'var(--danger)' : undefined }}>{r.consumo ? `−${num(r.consumo)}` : '·'}</td>
                      <td className="mono" style={{ textAlign: 'right', color: r.mermas ? 'var(--warning)' : undefined }}>{r.mermas ? `−${num(r.mermas)}` : '·'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 800, color: r.queda <= 0 ? 'var(--danger)' : 'var(--primary-3, #2ecc71)' }}>{num(r.queda)}</td>
                    </tr>
                    {/* La diferencia se dice con números y palabras, no solo con el color. */}
                    {dif && (
                      <tr style={{ borderLeft: '3px solid var(--warning)' }}>
                        <td colSpan={7} style={{ paddingTop: 0, fontSize: '.76rem' }}>
                          <span style={{ color: 'var(--warning)' }}>
                            ⚠ la cuenta del ciclo {alCierre ? 'daba' : 'da'} <strong className="mono">{num(dif.cuenta)}</strong>
                          </span>
                          {' · '}{dif.diferencia < 0 ? (alCierre ? 'faltaban' : 'faltan') : (alCierre ? 'sobraban' : 'sobran')}{' '}
                          <strong className="mono">{num(Math.abs(dif.diferencia))}</strong>{unidad ? ` ${unidad.toLowerCase()}` : ''}
                          <span className="dim" style={{ display: 'block', marginTop: '.1rem' }}>↳ {explicarDiferencia(dif.diferencia)}</span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Los que no se movieron no desaparecen: su stock sigue siendo real. Con el filtro
          encendido el botón no va: contradiría al filtro. */}
      {!soloDif && quietosOcultables > 0 && (
        <button className="btn btn-sm btn-ghost" style={{ marginTop: '.5rem' }} onClick={() => setVerQuietos((v) => !v)}>
          {verQuietos ? `Ocultar los ${quietosOcultables} que no se movieron` : `Ver los ${quietosOcultables} víveres que no se movieron`}
        </button>
      )}
    </div>
  );
}
