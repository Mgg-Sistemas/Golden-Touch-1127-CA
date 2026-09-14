/* ============================================================
   Golden Touch · Cocina · Leyenda del mercado

   Portada de MGG (LeyendaMercado). Las mismas preguntas vuelven cada ciclo:
   por qué la cuenta no da lo que queda, por qué un víver no aparece, qué pasa
   al descartar, por qué no deja iniciar un mercado en cierta fecha.

   Las respuestas están escritas para GT, no copiadas: acá «Queda» es el stock
   del inventario y el mercado siguiente arranca de una foto del stock.

   Va plegada y con la clase `hint`, así el botón «?» del topbar la esconde junto
   con el resto de las ayudas del sistema.
   ============================================================ */
import type { ReactNode } from 'react';

interface Entrada {
  pregunta: string;
  respuesta: ReactNode;
}

const DUDAS: Entrada[] = [
  {
    pregunta: '¿Qué es «Disponible» y qué es «Queda»?',
    respuesta: (
      <>
        <strong>Disponible</strong> es lo que el mercado tuvo para cocinar: el saldo con el que empezó más las
        entradas registradas desde el inicio. <strong>Queda</strong> es el stock que el inventario tiene hoy de ese
        víver. <strong>Consumo</strong> es lo que se registró en las comidas del mercado.
      </>
    ),
  },
  {
    pregunta: '¿Por qué «Disponible − Consumo» no da lo que dice «Queda»?',
    respuesta: (
      <>
        Porque «Queda» sale del inventario, no de la cuenta. La diferencia son movimientos que no son comidas ni
        entradas del mercado: <strong>salidas manuales, ajustes, traslados, conteos</strong>, o comidas cargadas con
        una fecha anterior al inicio del mercado. Tocá el víver para ver sus entradas y consumos.
      </>
    ),
  },
  {
    pregunta: '¿Qué cuenta como consumo y qué como entrada?',
    respuesta: (
      <>
        <strong>Consumo</strong>: solo las comidas registradas en esta pantalla dentro del período del mercado.{' '}
        <strong>Entrada</strong>: los movimientos de tipo entrada del inventario desde el inicio, como las compras
        recibidas o una entrada manual. Una salida manual o un ajuste bajan el inventario, pero no son consumo.
      </>
    ),
  },
  {
    pregunta: 'Hay un víver en el inventario que no aparece en la tabla.',
    respuesta: (
      <>
        La tabla muestra los productos <strong>activos</strong> de las categorías de cocina (alimentos, víveres,
        carnes, proteínas, hortalizas, legumbres, verduras y limpieza) que tuvieron saldo, entradas, consumo o
        stock. Si no aparece, lo primero es mirar su <strong>categoría</strong> y si está activo.
      </>
    ),
  },
  {
    pregunta: '¿Cuánto dura un mercado y cuándo se cierra?',
    respuesta: (
      <>
        Veintiún días desde el inicio. Pasado el día 21 el contador se pone en rojo. El cierre es manual, con
        «Cerrar mercado»: genera el PDF y abre el siguiente en ese mismo instante.
      </>
    ),
  },
  {
    pregunta: '¿Con qué saldo arranca un mercado?',
    respuesta: (
      <>
        Si nace de un <strong>cierre</strong>, con el stock de ese momento. Si se <strong>inicia a mano</strong>,
        con el stock a la fecha de inicio: stock de hoy − entradas + consumos desde esa fecha. Por eso conviene
        dejar la fecha en <strong>hoy</strong>: con una fecha pasada, si en esos días hubo salidas manuales, ajustes
        o traslados, el saldo no coincide con el inventario.
      </>
    ),
  },
  {
    pregunta: '¿Qué pasa si descarto un mercado?',
    respuesta: (
      <>
        El mercado deja de contar: no le pasa saldo al siguiente y sus cifras salen de la cadena.
        <strong> No se borra nada</strong>: las comidas, los movimientos y el resumen quedan donde están, y el mercado
        se sigue consultando en «Mercados cerrados», marcado como descartado. No se abre otro: se inicia con
        «Iniciar mercado». Hay que escribir por qué, y eso queda firmado.
      </>
    ),
  },
  {
    pregunta: 'Quiero iniciar un mercado y el sistema no me deja.',
    respuesta: (
      <>
        Dos mercados no pueden compartir días, ni siquiera con uno descartado: los mismos consumos se contarían dos
        veces. La fecha mínima es el día en que terminó el último mercado; si elegís ese mismo día, el nuevo empieza
        a la hora en que terminó. Antes de iniciarlo, cargá las comidas atrasadas: mientras no hay mercado, se
        registran y descuentan stock, pero no entran en ningún ciclo.
      </>
    ),
  },
];

/** Preguntas frecuentes del mercado, plegadas. */
export function LeyendaCocina() {
  return (
    <details
      className="hint"
      style={{
        marginTop: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm, 6px)',
        padding: '.5rem .75rem', background: 'var(--bg-1)',
      }}
    >
      <summary style={{ cursor: 'pointer', fontSize: '.82rem', color: 'var(--text-muted)', userSelect: 'none' }}>
        ❔ Cómo se leen estos números · dudas frecuentes
      </summary>
      <dl style={{ margin: '.6rem 0 .1rem', fontSize: '.82rem', lineHeight: 1.55 }}>
        {DUDAS.map((d) => (
          <div key={d.pregunta} style={{ marginBottom: '.7rem' }}>
            <dt style={{ fontWeight: 600, marginBottom: '.15rem' }}>{d.pregunta}</dt>
            <dd className="muted" style={{ margin: 0 }}>{d.respuesta}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
