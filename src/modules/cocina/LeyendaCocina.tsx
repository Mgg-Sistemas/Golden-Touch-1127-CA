/* ============================================================
   Golden Touch · Cocina · Leyenda del mercado

   Portada de MGG (LeyendaMercado). Las mismas preguntas vuelven cada ciclo:
   por qué la cuenta no da lo que queda, por qué un víver no aparece, qué pasa
   al descartar, desde cuándo cuenta un mercado nuevo.

   Las respuestas están escritas para GT, no copiadas: acá «Queda» es el stock
   del inventario y el mercado arranca de una foto del stock en un instante.

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
        stock. Los que no se movieron en el ciclo quedan detrás de «Ver los N víveres que no se movieron», al pie
        de la tabla. Si tampoco está ahí, lo primero es mirar su <strong>categoría</strong> y si está activo.
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
    pregunta: '¿Desde cuándo cuenta un mercado y con qué saldo arranca?',
    respuesta: (
      <>
        Desde el <strong>instante exacto</strong> en que empieza, no desde las 00:00: el del <strong>cierre</strong> si
        nace de un cierre, o el del <strong>clic en «Iniciar mercado ahora»</strong> si se inicia a mano. El saldo
        inicial es el stock de ese instante. Lo movido antes queda dentro de ese saldo y no cuenta como entrada ni
        como consumo del ciclo.
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
        «Iniciar mercado ahora». Hay que escribir por qué, y eso queda firmado.
      </>
    ),
  },
  {
    pregunta: 'Quiero iniciar un mercado y el sistema no me deja.',
    respuesta: (
      <>
        Hay un solo mercado abierto a la vez: si ya hay uno, se cierra o se descarta antes. Antes de iniciarlo,
        cargá las comidas atrasadas: mientras no hay mercado se registran y descuentan stock, pero no entran en
        ningún ciclo, y lo registrado antes del clic queda dentro del saldo inicial.
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
