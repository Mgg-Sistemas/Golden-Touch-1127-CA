/* ============================================================
   Golden Touch · Manual de Usuario (PDF)
   Genera un PDF descargable que explica, pantalla por pantalla,
   cómo usar el sistema de gestión de Golden Touch 1127 CA.
   Se descarga SOLO cuando el usuario hace clic en el menú.
   ============================================================ */
import { dateTime } from '@/shared/lib/format';
import { loadLogoDataUrl } from '@/shared/lib/pdfLogo';
import { previewPdf } from '@/shared/lib/reportePreview';

const NARANJA: [number, number, number] = [255, 138, 0];
const GRIS_TEXTO: [number, number, number] = [60, 60, 60];

interface Seccion {
  /** Ícono tal como aparece en el menú (decorativo). */
  icono: string;
  titulo: string;
  /** Clave de captura: coincide con la vista capturada en vivo (o null si no aplica). */
  captura?: string;
  /** Párrafo introductorio: ¿para qué sirve la pantalla? */
  intro: string;
  /** Funcionalidades concretas, en lenguaje sencillo. */
  puntos: string[];
}

/** Una captura de pantalla embebida (PNG) con sus dimensiones reales. */
export interface CapturaManual {
  dataUrl: string;
  w: number;
  h: number;
}

export type CapturasManual = Record<string, CapturaManual>;

/** Contenido del manual: una entrada por pantalla del sistema. */
const SECCIONES: Seccion[] = [
  {
    icono: '🔐',
    titulo: 'Inicio de sesión',
    intro:
      'Es la primera pantalla que ves al abrir el sistema. Sirve para identificarte y proteger la información de la empresa: solo las personas autorizadas pueden entrar.',
    puntos: [
      'Escribí tu correo electrónico y tu contraseña, y presioná "Ingresar".',
      'Si los datos son correctos, el sistema te lleva al tablero principal (Dashboard).',
      'Cada usuario ve únicamente los módulos que su rol tiene permitidos.',
      'Para salir de forma segura usá el botón de cerrar sesión (⎋), abajo a la izquierda.',
      'Entrar con huella (opcional, por equipo): podés entrar con la huella (o Face ID / Windows Hello) del dispositivo. Primero entrá con tu clave, abrí el botón 🔒 (junto a tu usuario, abajo a la izquierda) y tocá "Activar huella en este equipo". Desde ahí, la pantalla de inicio muestra el botón "Entrar con huella". La huella nunca sale del dispositivo (no se guarda tu huella, solo una llave de seguridad), la contraseña sigue funcionando como respaldo y la activación queda atada a ese equipo (en otro hay que volver a activarla). Desde el mismo menú podés ver y quitar los dispositivos con huella. Requiere conexión segura (HTTPS).',
    ],
  },
  {
    icono: '🧭',
    titulo: 'Cómo está organizado el sistema',
    intro:
      'Todas las pantallas comparten la misma estructura, para que siempre sepas dónde estás parado.',
    puntos: [
      'Menú lateral (izquierda): es el índice del sistema. Está dividido en "Operación" (el trabajo del día a día) y "Sistema" (configuración).',
      'Podés ocultar o mostrar el menú con el botón ☰ de la barra superior para tener más espacio.',
      'Barra superior: contiene el buscador general, el botón (?) de textos de ayuda y la campana de notificaciones.',
      'Botón (?) - mostrar/ocultar ayudas: los módulos traen textos explicativos (los "hints" o ayudas) que a veces saturan el visual. Con el botón (?) de la barra superior se ocultan o se muestran de golpe en todo el sistema; queda naranja cuando están visibles y apagado cuando están ocultos. La preferencia se recuerda en ese navegador.',
      'Aviso "El sistema se actualizó": cuando se publica una nueva versión, a todos los usuarios les aparece arriba un aviso fijo (no se puede ocultar) con el botón "Actualizar ahora". Al pulsarlo la app recarga y toma la última versión. Conviene guardar lo que se esté escribiendo antes de actualizar.',
      'Buscador general: escribí cualquier producto, proveedor u orden y el sistema lo encuentra en todo el sistema; al hacer clic en un resultado te lleva directo a su detalle.',
      'Campana de notificaciones (◔): te avisa, por ejemplo, cuando un producto está por agotarse. El número rojo indica cuántos avisos sin leer tenés.',
      'Tiempo real: el sistema es multiusuario y se actualiza solo. Lo que registra un usuario (una entrada, una orden, un movimiento de caja, etc.) aparece automáticamente en la pantalla de los demás, sin necesidad de recargar.',
      'Vista previa de PDF / Excel: en todo el sistema, al generar un reporte (PDF o Excel) primero se abre una vista previa dentro del sistema y solo se baja el archivo si pulsás Descargar. Lo mismo con los adjuntos (facturas, comprobantes de retención, ofertas en PDF, adjuntos de compra directa): se ven en un visor embebido sin salir del sistema, con Descargar y Abrir en pestaña. Se cierra con Cerrar o la tecla Esc.',
    ],
  },
  {
    icono: '▦',
    titulo: 'Dashboard (Tablero principal)',
    captura: 'dashboard',
    intro:
      'Es el resumen general de la empresa. De un vistazo muestra cómo está el inventario y la actividad reciente, sin tener que entrar a cada módulo.',
    puntos: [
      'Tarjetas con los indicadores clave: valor del inventario, cantidad de productos, alertas de stock bajo, entre otros.',
      'Gráficos que muestran la evolución y la composición del inventario.',
      'Lista de "Movimientos recientes": las últimas entradas, salidas y ajustes registrados.',
      'Al hacer clic en un movimiento se abre el detalle del producto involucrado.',
    ],
  },
  {
    icono: '⬢',
    titulo: 'Inventario',
    captura: 'inventario',
    intro:
      'Es el corazón del sistema: el listado de todos los materiales y productos, con su stock, costo y ubicación. Desde aquí se crean productos, se registran movimientos y se administran los almacenes.',
    puntos: [
      'Listado de productos con su SKU (código), nombre, categoría, stock y estado.',
      'Filtros: por SKU/nombre, almacén, categoría, producción, clase ABC, estado de stock y estado. Al filtrar por almacén se muestran solo los productos con existencia en ese almacén, con el stock y el costo (PMP) propios de ese almacén.',
      'Nuevo producto: al crearlo, el SKU se genera solo y de forma correlativa según la categoría (por ejemplo LUB-001, LUB-002 para Lubricantes). No hace falta inventarlo a mano. El correlativo es persistente: el número nunca se reutiliza aunque se borre el producto con el número más alto.',
      'Carga por caja/bulto: al crear un producto en caja o bulto aparece el campo "Unidades por caja/bulto" y el stock inicial (en cajas) se convierte a unidades (ej. 2 cajas × 20 = 40 und). Igual en Movimiento → Entrada con el check "Ingresar por caja/bulto".',
      'Importar desde Excel: la plantilla ya NO pide el SKU (lo asigna el sistema, correlativo por categoría); sí se carga la categoría (define el prefijo). Los nombres ya existentes se actualizan y los nuevos se insertan con un SKU nuevo.',
      'Importar desde Excel - cotejo de materiales ya existentes (no duplica): al importar, el sistema COTEJA cada material contra el inventario y evita crear duplicados. La comparacion del NOMBRE es robusta: ignora mayusculas/minusculas, acentos y espacios repetidos, de modo que "Tornillo 1/2", "TORNILLO  1/2" y "torníllo 1/2" se reconocen como el MISMO material. Los que ya existen se ACTUALIZAN (no se crean de nuevo); solo los realmente nuevos se insertan. El resumen previo muestra "Nuevas", "Ya en inventario (se actualizan)", "Duplicadas" y "Con error", y en la tabla cada fila indica si ya existe en el sistema. Si hay coincidencias, pide confirmar antes de subir.',
      'Resumen (botón 📊): desglosa el valor por almacenes y sub-almacenes, los productos nuevos, y las entradas, salidas y traslados con su total en $ (por rango). Al tocar un indicador (ej. Salidas) se ve qué productos fueron. Exporta a PDF con vista previa y por correo.',
      'Traslado entre almacenes: el producto se mueve llevando el precio/costo (PMP) que tiene en el inventario; si esa existencia no tenía costo, usa el precio del producto, para que el almacén destino quede valorizado.',
      'Detalle del producto (opcional): al crear/editar se pueden cargar nombre de búsqueda/alias (ej.: CLORO), marca, modelo, N°, serial, código, ubicación y descripción. El buscador encuentra el producto también por estos datos (incluida la medida, la categoría y la ubicación) y todos se ven en su detalle. La búsqueda combina palabras: se puede escribir el producto + su detalle juntos (ej.: "clavo media pulgada") y encuentra el clavo cuya medida es "media pulgada" aunque el nombre sea solo CLAVO.',
      'Cada producto guarda su stock por almacén y su costo promedio ponderado (PMP), que se actualiza automáticamente con cada compra o entrada. Los campos de precio/costo admiten decimales menores a 1 (ej. 0,35) y aceptan coma o punto como separador.',
      'Movimientos: se pueden registrar entradas, salidas, transferencias y ajustes; el sistema lleva el historial completo (kardex) de cada producto.',
      'Detalle del producto: muestra su ficha completa y todos sus movimientos; permite descargar su trazabilidad en PDF.',
      'Alertas de stock: el sistema marca en rojo los productos por debajo del mínimo para que sepas qué reponer.',
      'Almacenes: se pueden ver en formato lista o en tarjetas (kanban) con totales de productos, productos usados y consumo diario.',
      'Renombrar la sede: cada tarjeta de sede tiene un botón (lápiz) para renombrarla; el nuevo nombre se aplica a todos sus almacenes y subalmacenes (es solo la etiqueta de agrupación, no afecta el stock).',
      'Recepciones (botón del inventario): el número del botón cuenta solo las órdenes PENDIENTES por marcar la recepción (contra entrega lista para recibir o ya pagadas y aún sin recibir). Cuando la recepción se finaliza deja de contar; las finalizadas se siguen viendo en la lista, pero sin sumar al número del botón.',
      'Pendientes por recepción (desde el Inventario): en la pestaña Recepciones el almacenista ve arriba las órdenes de compra (OC) que faltan por recibir como tarjetas (código, fecha, ítems, total, quién solicitó). Desde ahí ve el detalle o pulsa "Recibir": elige el almacén / sub-almacén destino, confirma cuánto entró por ítem (puede ser parcial) y deja una nota. Solo lo recibido suma al inventario en el almacén elegido y la OC sale de pendientes. Todo en tiempo real.',
      'Detalle de una recepción finalizada: en Recepciones (finalizadas), al hacer clic en una tarjeta se abre el detalle de la orden: cabecera (código, OC, fecha, quién solicitó, cuándo se recibió) y la tabla de ítems con cantidad, precio unitario y subtotal, más el total.',
      'Renombrar almacenes y subalmacenes (sin perder el stock): con el botón Editar de cada almacén se cambia el nombre. Como el inventario se indexa por nombre, al renombrar el sistema propaga el nombre nuevo de forma atómica a todo lo asociado (existencias/stock, productos, movimientos, recepciones, salidas, traslados, compras directas y producción): el almacén conserva todo su stock e historial, solo cambia el nombre. Si el nombre ya existe avisa; en subalmacenes el nombre se mantiene único de forma transparente.',
      'Exportar: se pueden descargar los productos de cada almacén en Excel o PDF, e importar productos masivamente desde un Excel.',
      'Reporte PDF por almacenes y subalmacenes: en la vista de Sedes, el botón "Reporte PDF (almacenes y subalmacenes)" descarga un informe completo de todo el inventario ordenado por sede, almacén y subalmacén, con stock, costo unitario (PMP) y valor por producto, subtotales por almacén y por sede, y el valor total del inventario.',
    ],
  },
  {
    icono: '✉',
    titulo: 'Pedidos / Compras',
    captura: 'pedidos',
    intro:
      'Aquí se gestiona todo el ciclo de compra: desde que se pide un material hasta que se recibe. También deja un registro ordenado (trazabilidad) de cada paso.',
    puntos: [
      'Solicitud de pedido (pestaña Solicitud de Pedido): es la solicitud interna de lo que se necesita. La Unidad solicitante se elige de un desplegable con las unidades del catálogo (en vivo); si no está, se escribe en "¿No está? Escribí la unidad nueva…" y con "+ Añadir" se guarda de una vez en el catálogo y queda seleccionada. El Solicitante (persona) es editable: un analista puede registrar la solicitud a nombre de otra persona o unidad; ambos se muestran en el detalle y el PDF. Al agregar un producto nuevo se elige el almacén/sub-almacén destino y la unidad desde una lista. Por cada producto se carga su finalidad (¿para qué se compra?). Se puede agregar una Nota opcional; los campos de texto se guardan en mayúscula. El botón Categorías gestiona (agregar, filtrar, editar, activar/desactivar) las unidades solicitantes; al escribir una unidad nueva en la OP se guarda sola. La pestaña Unidades solicitantes muestra una columna Categoría que se puede editar al editar cada unidad. Al aprobarla, el detalle y el PDF muestran quién la aprobó y cuándo. APROBAR la Solicitud de Pedido la hace Compras (el analista de compras o el administrador). La firma final de la Orden de Compra (Aprobar OC / Aprobar en lote) sí queda reservada exclusivamente al rol Administrador, y eso está reforzado en la base de datos (si no es admin, la base rechaza la firma de la OC).',
      'MERCADO (restablecer el mercado): al crear la SP, el check "MERCADO" trae la última compra de mercado con casillas para re-seleccionar qué se vuelve a comprar (y permite añadir productos nuevos). Fija la finalidad general automática "PEDIDO PARA RESTABLECER EL MERCADO". Los productos nuevos cargados en una SP de MERCADO entran al inventario en la categoría VÍVERES (disponibles en Cocina) con su SKU correlativo asignado de una vez.',
      'Nuevo servicio (Solicitud de Servicio SS → Control de Servicio CS): el botón "Nuevo servicio" (junto a "Nueva orden") permite pedir servicios en vez de productos, con el mismo procedimiento que la SP. La Solicitud de Servicio tiene su correlativo propio (SS-AAAA-####) y, al adjudicar la oferta, se convierte en un Control de Servicio (CS-AAAA-####) que recorre el mismo flujo (aprobación, ofertas, método de pago, Tesorería y recepción). Cada renglón es un servicio: se elige una categoría (RECARGA, MANTENIMIENTO, OTRO…) y luego el servicio de una lista desplegable que permite escribir servicios nuevos (se guardan en el catálogo, accesible desde Categorías → pestaña Servicios), su cantidad y su medida (L, und, m, kg, juego…). Cuando la categoría es MANTENIMIENTO, el servicio queda casado a una máquina/vehículo de Control de Maquinaria (obligatorio). Las solicitudes y controles de servicio se gestionan en su propia pestaña "Servicios" (junto a Compra Directa), con su propio Kanban que recorre el mismo procedimiento que una OC: Solicitado → Aprobado (cotizar) → Pendiente por aprobación (Gerente General) → Crédito/cuentas abiertas → Confirmado (método de pago) → Confirmado pagar → Pendiente por realizar → Pagado → Servicio realizado → Finalizado (y Cancelado). Cada tarjeta lleva el badge "Servicio".',
      'Realizar OC (Orden de Compra): convierte el pedido en una compra a un proveedor. Antes de emitirla se eligen los documentos que la acompañan: Nota de entrega y/o Nota de despacho.',
      'Compra a varios proveedores (multiproveedor): una misma Solicitud de Pedido (SP) se puede repartir entre varios proveedores; el sistema genera una Orden de Compra por proveedor, todas casadas a la misma SP (códigos SP-AAAA-####-1, -2…, cada una con su propio código OC). La SP madre queda repartida y cada OC sigue su flujo por separado (aprobación, método de pago, Tesorería y PDF). Al elegir el proveedor de cada ítem, el selector y el producto muestran la marca/modelo que ese proveedor ofertó, para distinguir cuando varios cotizan el mismo producto en distinta marca. Reparto parcial: no hace falta asignar todos los ítems; los que queden sin asignar o en $0 (sin oferta real) vuelven a la SP madre en Pendiente (cargar ofertas) con solo esos ítems, para cotizarlos y crear su OC aparte. Un producto en $0 se marca automáticamente como pendiente y no entra a la OC. Detalle de una OC hija: al abrir una orden hija (SP-AAAA-####-1, -2…) se muestra SOLO la oferta del proveedor que se le asignó al repartir (tomada de la orden padre), en solo lectura (no se agregan/eligen/reparten/editan ofertas desde la hija), con los precios en Bs (BCV) y en divisa ($).',
      'Indicar método de pago: cuando la OC está "Confirmada (indicar método de pago)" se eligen el/los método(s) de pago y el tipo de soporte (Nota de entrega / Factura). En multipago se puede REPARTIR EL TOTAL POR MONEDA: indicar cuánto en $ va por cada método (p. ej. $100 en divisas + $6 en Bs); el sistema valida que la suma cuadre con el total de la OC. Si los montos quedan en 0, el monto lo define Tesorería al pagar. En ese paso también se puede CAMBIAR EL PROVEEDOR de la OC: como cambia el proveedor adjudicado, la OC VUELVE A APROBACIÓN DEL GERENTE GENERAL (no se envía a pagar en ese momento); los ítems y el total se mantienen. Tras la nueva aprobación se vuelve a indicar el método de pago. CAMBIAR EL MÉTODO YA CONFIRMADO: mientras la OC esté en "Confirmada pagar" y aún no se haya pagado en Tesorería, Compras puede pulsar "Cambiar método de pago" en el detalle para corregir el/los método(s) (el formulario aparece precargado con lo indicado); se actualiza al instante en Tesorería y queda en el historial.',
      'Modificar una OC pendiente por cargar método de pago: aunque el GG ya la haya firmado, en el estado "Confirmada (indicar método de pago)" se puede volver a Editar la OC (ítems, cantidades, costo unitario de cada producto, motivo, finalidad). Al editar el costo de un producto, el total de la OC se recalcula al instante (cantidad x costo). Al guardar, la OC VUELVE AUTOMÁTICAMENTE a aprobación del Gerente General (pasa a OC por confirmar y se limpia la firma previa) y sale de Tesorería hasta que el GG la apruebe de nuevo. Queda en el historial.',
      'Pago en Tesorería (Órdenes pendientes por pagar): al abrir una OC para pagar se ve un resumen de la orden (solicitante, unidad solicitante, finalidad, motivo y notas), la condición de pago y la conversión $ ⇄ Bs. Si la caja es Multimoneda, la grilla de multipago por cuenta se prellena respetando el reparto por moneda que indicó Compras (cada moneda con lo que le toca, p. ej. $100 en divisas + $6 en Bs) en vez de cargar todo en una sola; igual se puede ajustar a mano. Multipago ENTRE CAJAS: si una sola caja no alcanza, con "+ Añadir otra caja" se suman cuentas/monedas de otras cajas hasta cubrir el total (un egreso por cuenta, cada uno de su propia caja). El pago se puede anclar a un gasto eligiendo categoría → subcategoría (listas buscables/filtrables), para que quede etiquetado como gasto además de pago de OC.',
      'Pagar varias OC del mismo proveedor: en el listado de órdenes por pagar se marcan varias con casillas (✓) y, si son del mismo proveedor, se pagan juntas desde una sola caja (un egreso por OC). En el modal, al hacer clic sobre cada OC se despliega su detalle (solicitante, unidad, finalidad, motivo, notas y fechas). Funciona incluso con las que están "Esperando método de pago" (no hace falta esperar a que Compras indique el método).',
      'Resumen PDF de OC por pagar: un botón genera, con vista previa, un reporte con N°OC, proveedor, finalidad, notas, estado y monto, con el total general.',
      'Órdenes pendientes por pagar — Esperar método: las OC que aún no tienen método de pago indicado muestran el badge "Esperando método de pago" DEBAJO de la condición; igual se pueden abrir con "Ver" para ver el detalle de la compra y pagarlas directo eligiendo la caja (no hace falta esperar a que Compras indique el método). Cuando Compras lo indica, el botón pasa a "Ver / Pagar".',
      'Histórico de Pedidos / Compras: el botón Histórico abre el listado filtrable de todas las órdenes. Al hacer clic en una fila se abre el detalle (solicitante, proveedor, estado, fechas, ítems con montos y total) y se puede imprimir en PDF con vista previa: "Imprimir PDF" (trazabilidad) y, si tiene OC/Control de Servicio, "OC PDF".',
      'Compras a crédito · datos del proveedor: en Cuentas por pagar (créditos), pestaña "Compras a crédito", al elegir una OC se muestra una tarjeta con los datos del proveedor traídos del directorio por la OC (razón social, RIF, teléfono, contacto, correo, dirección). Así Tesorería ve a quién le paga sin salir del modal; se sincroniza con la ficha del proveedor que se cargó al montar la OC.',
      'Datos de pago del proveedor (dónde pagarle): en esa tarjeta se ven los datos de pago guardados por método (pago móvil, transferencia, Zelle, Binance) y con el botón "Cargar / editar datos de pago" se cargan o editan sin salir de Tesorería (nombre/razón social, CI/RIF, banco, número de cuenta). Quedan en la ficha del proveedor y se reutilizan en próximas compras.',
      'Comisión bancaria en el abono: al registrar un abono de una compra a crédito se puede indicar, además del monto, una COMISIÓN BANCARIA opcional: se escribe el monto y se elige de qué saldo de la caja sale. Se descuenta de la caja como egreso aparte y NO reduce la deuda de la OC (es un costo del banco). Queda en el detalle de abonos (columna "Comisión bancaria", con su equivalente en USD).',
      'Resumen PDF de cuentas (créditos y por cobrar): en Cuentas por pagar (créditos) —tanto en Compras a crédito como en Cliente/Proveedor— y en Cuentas por cobrar hay un botón "📄 Resumen" (junto al buscador de cuentas) que genera, con vista previa, un PDF con el mismo formato del resumen de OC por pagar: lista todas las cuentas con contraparte, total, abonado/cobrado, saldo y estado, y el total por moneda.',
      'Chat con Compras desde Tesorería: el detalle de pago de una OC incluye un chat interno que es el MISMO hilo de la orden en Pedidos. Tesorería y el analista de compras conversan ahí (coordinar método de pago, aclarar la orden) en tiempo real; las OC con mensajes sin leer muestran un chip 💬 en el listado y cada mensaje notifica a la otra parte.',
      'Libro Mayor (por moneda): al tocar una moneda se ve el detalle de sus movimientos (fecha, caja, concepto, beneficiario/motivo, Debe, Haber, saldo) con totales Debe / Haber / Neto y un botón para descargar el reporte en PDF (con vista previa).',
      'Recepción: cuando llega la mercadería se registra la entrada, y el inventario se actualiza solo con su costo.',
      'Trazabilidad: cada orden tiene una línea de tiempo con todo lo que ocurrió (creación, emisión, documentos, recepción, etc.).',
      'Si un proveedor desiste, se registra la fecha, la hora y el motivo; eso queda reflejado en el PDF de la orden.',
      'Cambiar proveedor / "Proveedor desistió" cuando la OC está pendiente por el Gerente General: mientras la OC está en "Pendiente por aprobación (Gerente General)" (oferta elegida, OC creada sin firmar), Compras puede pulsar "Proveedor desistió", indicar el motivo y reabrir las ofertas para re-elegir otro proveedor antes de que el GG firme. Antes solo se permitía sobre la OP aprobada; ahora también en este estado. Si la OC es una orden HIJA (de una SP repartida entre varios proveedores), al desistir sus productos vuelven a la SP madre original con todos sus proveedores y la madre se reabre en "Pendiente (cargar ofertas)" para volver a cotizar todo.',
      'Abono a crédito que sincroniza solo: al saldar el total de una compra a crédito (cuenta abierta), la OC sale automáticamente de "Crédito / cuentas abiertas" y pasa a "Pendiente por recepción" (o "Recibida", lista para finalizar, si ya había llegado). Ya no se queda en pendiente esperando un paso manual.',
      'Editar y cancelar la OC: en la etapa "Pendiente (cargar ofertas)", desde el detalle de la tarjeta se puede Editar OC (cambiar cantidades, agregar/quitar ítems, EDITAR EL NOMBRE de un producto —se sincroniza con el inventario—, agregar productos nuevos que no existen en inventario, marcar cuáles se compran, motivo y finalidad) mientras no haya una oferta con precio. Al editar también se puede ver, REEMPLAZAR o QUITAR la imagen o PDF adjunto de la solicitud (máx. 10 MB). Las órdenes canceladas quedan en la columna Cancelada (en rojo) del kanban de Órdenes de Compra.',
      'Cancelar una OC ya aprobada: una OC aprobada por el gerente (o con el proveedor desistido) se puede cancelar mientras aún no se haya pagado, con el botón "Cancelar OC". El sistema exige el motivo, que se imprime en el PDF de la OC (banner rojo "Orden de Compra Cancelada" con el motivo, quién la canceló y cuándo). Una OC ya pagada o recibida no se cancela.',
      'Compra directa: las compras sin proceso de aprobación pueden asociar un proveedor con buscador; si no existe, se agrega en el momento y queda guardado en el directorio de Proveedores. Cada compra directa recibe un correlativo propio (CD-AAAA-####) visible en la tarjeta, la lista y el PDF. Al cargar la factura y elegir la caja se muestra su billetera (saldo disponible, por moneda si es Multimoneda); el saldo del selector es el real de la billetera y el gasto sale de la billetera real de la caja (de su saldo en esa moneda; si es Multimoneda, repartido por moneda). Una compra directa En proceso se puede eliminar con el botón Eliminar (las Finalizadas no, porque ya movieron dinero e inventario).',
      'Compra directa - categoría y medida nuevas al vuelo: al dar de alta un material nuevo, si su categoría o su unidad/medida no existen se pueden crear en el momento con los campos "Nueva categoría..." / "Nueva medida..." + Añadir, sin salir de la compra. Quedan guardadas en el catálogo de inventario y seleccionadas en ese renglón.',
      'Compra directa - medida de un material existente: al elegir un material del inventario se muestra su unidad/medida actual y se puede cambiar (otra existente o una nueva con + Añadir). Si se cambia, se actualiza la medida del producto en el inventario.',
      'Finalización: al finalizar la OC se evalúa la recepción (calidad, puntualidad, comentario) y hay un botón "Cargar factura" para adjuntar la factura del proveedor (PDF o imagen); luego se ve con el botón Factura en el detalle de la orden.',
      'Lista de Pedidos/Compras: en modo Lista, al hacer clic en cualquier fila se abre el detalle de la orden (además del botón Ver).',
      'Retenciones (módulo): al cargar la factura del proveedor (al finalizar la OC) o cuando el soporte es Factura, la OC se vincula al módulo Retenciones. En "Por realizar", la persona de retenciones ve la OC y la factura (Ver factura) y sube su comprobante: Retención por IVA, ISLR y/o Municipal (al menos uno). Al finalizar queda registrada y pasa a "Realizadas"; se refleja en Tesorería y al pagar la OC se marca como pagada.',
      'Compra Directa · categoría/subcategoría de gasto: al cargar la factura y precios se elige la categoría y subcategoría de gasto (mismo catálogo que Tesorería). El egreso queda etiquetado y el movimiento en Tesorería se refleja por categoría y subcategoría, igual que un gasto manual.',
      'Servicios - insumo del inventario (mantenimiento): en los renglones de mantenimiento de maquina/vehiculo (Solicitud de Servicio y Servicio Directo) hay un campo "Insumo del inventario" con buscador: si el material que se cambia ya esta en stock (p. ej. el caucho), se elige de ahi y queda vinculado al servicio (se ve en la lista y el detalle). Es al gusto; se puede dejar vacio y con "Quitar insumo" se desvincula.',
      'Mantenimiento de electrodomésticos (Solicitud de Servicio y Servicio Directo): entre las categorías de servicio está "MANTENIMIENTO DE ELECTRODOMÉSTICOS". Al elegirla, en vez del equipo de Control de Maquinaria aparece un desplegable con una lista predeterminada de electrodomésticos (Cocina, Nevera, Lavadora, Microondas, Secadora, Horno, Aire acondicionado, Ventilador, Licuadora, Televisor…); se puede elegir uno o escribir otro. El artículo queda registrado como el "equipo" del servicio (sin vincularse a maquinaria).',
      'Compra Directa - categorías nuevas sincronizadas con inventario: al agregar un material NUEVO se puede crear una categoría en el momento (campo "Nueva categoría…" + "+ Añadir", o simplemente tecleándola: al guardar la compra se da de alta sola). La categoría se guarda en el catálogo del inventario (taxonomías) y queda sincronizada: aparece en Inventario y en próximas compras. Lo mismo aplica a la unidad/medida.',
      'Servicio Directo (pestaña): igual que la Compra Directa pero como SERVICIO (mano de obra, mantenimientos, reparaciones, recargas). No pasa por aprobación y NO entra al inventario; solo registra el gasto en Tesorería. Se crea con el mismo formato que la Solicitud de Servicio: uno o varios renglones con Categoría del servicio (se busca o se escribe), Tipo de servicio (caucho, aceite, pintura, repuesto… del catálogo, o uno nuevo), Equipo de Control de Maquinaria y Cantidad. Correlativo SD-AAAA-####, proveedor opcional (directorio o alta en el momento); las categorías y tipos nuevos se guardan en el catálogo de servicios. Al finalizar ("Cargar factura y monto") se adjunta la factura, se carga el monto por servicio, la categoría/subcategoría de gasto y la caja (con su billetera; si es Multimoneda, el pago repartido por moneda con tasa BCV) — el monto sale de la billetera real (egreso en Tesorería). Si el renglón tiene equipo, el servicio aparece en el historial del equipo (Maquinaria → Bitácora / Resumen → clic en el equipo). Cuando el tipo/categoría es de gas, oxígeno o extintores, el renglón pide cantidad de bombonas y KG a recargar (en vez de Cantidad/Medida). El botón PDF abre la vista previa del comprobante con la tabla de servicios (categoría, tipo, equipo, cantidad, bombonas, KG y monto). Se puede ELIMINAR mientras esté En proceso o Por pagar (aún no tocó la caja); si ya está Finalizado (pagado) hay que Reabrirlo primero (devuelve el dinero a la caja) y luego eliminarlo. Al crear o editar también se puede indicar el Solicitante (quién lo solicitó) y la Unidad solicitante (se muestran en el detalle) y adjuntar VARIAS imágenes o PDF a la vez. La Solicitud de Servicio normal, el Servicio Directo y la Compra Directa permiten adjuntar VARIOS archivos (imágenes o PDF) al crear; en el detalle de la orden/compra/servicio se listan como adjuntos y se pueden agregar más, previsualizar y borrar individualmente.',
      'Solicitud de Servicio / Servicio Directo - recargas: cuando el servicio es de gas, oxígeno o extintores, en vez de Cantidad/Medida se piden la cantidad de bombonas y los KG a recargar; esos datos salen en el PDF de la orden y en el detalle (en órdenes de servicio la columna Finalidad se reemplaza por Categoría y debajo del nombre se muestran las bombonas/KG).',
      'Compra/Servicio Directo - detalle, reabrir, editar y varias facturas: al hacer clic en la tarjeta (kanban) o en la fila (lista) se abre el detalle (cabecera + tabla de renglones + facturas). En "En proceso" el botón "Editar" (✏) permite cambiar materiales/servicios, cantidades, almacén/equipo y proveedor. En "Por pagar" (mientras Tesorería no haya pagado) el botón "Editar" reabre "Cargar factura y montos" precargado para corregir montos, moneda, IVA, descuento, total, retención, factura y la NOTA (sigue Por pagar; no toca caja ni inventario). En "Finalizada" el botón "Reabrir" (↺) devuelve el dinero a la caja (revierte el egreso en Tesorería, exacto incluso en Multimoneda, sin alterar la tasa promedio) y —en compras— revierte la entrada al inventario, dejándolo "En proceso" para corregirlo y volver a finalizarlo (si ese stock ya se consumió, el inventario queda en 0, no negativo). En el detalle también se pueden cargar VARIAS facturas o comprobantes (PDF o imagen), previsualizarlas y borrarlas individualmente.',
      'Tesorería - editar/borrar movimientos manuales: en el detalle de un movimiento (boton "Detalles" del Libro Mayor o una fila del Resumen) los movimientos MANUALES (gasto, ingreso, ajuste) tienen "Editar" y "Borrar". Al editar se cambia monto, concepto, categoria/subcategoria y fecha; si cambia el monto, el saldo de la caja se ajusta por la diferencia (sincroniza). Al borrar se revierte su efecto en el saldo. Los movimientos vinculados (pago de OC, traslado entre cajas, conciliacion de mineral, conversion, pago de compra/servicio directo) NO se editan ahi: se anulan desde su modulo para no descuadrar el otro lado ni el inventario.',
      'Compra/Servicio Directo - flujo con pago y recepción EN PARALELO: la Compra Directa tiene CUATRO columnas (En proceso -> Por recibir -> Por pagar -> Finalizada); el Servicio Directo tres (En proceso -> Por pagar -> Finalizada, no entra a inventario). El ANALISTA pulsa "Cargar factura y montos/monto", adjunta la factura y carga los montos: al MONTAR, la compra queda con DOS pendientes independientes a la vez -> "Por recibir" (almacén) y "Por pagar" en Tesorería (etiqueta DIRECTO). NO toca caja ni inventario todavía. La mercancía puede RECIBIRSE ANTES de que Tesorería pague (o al revés): pago y recepción son independientes. El pago lo hace SOLO Tesorería (panel "Directos por pagar"; el contador del botón incluye los directos): elige caja (billetera / Multimoneda con tasa BCV) y categoría/subcategoría de gasto -> el dinero sale de esa caja. La compra queda Finalizada recién cuando está PAGADA y RECIBIDA. En el tablero de Pedidos la tarjeta se ubica en "Por recibir" (el pago se ve en Tesorería). El botón Pagar ya NO aparece en Compra/Servicio Directo.',
      'Tesorería - detalle del movimiento de una compra/servicio directo: al abrir el detalle (boton "Detalles") de un movimiento que pago una Compra o Servicio Directo, se muestra QUE se compro/contrato y el REQUERIMIENTO: codigo, proveedor, almacen destino (compra) o equipo (servicio), solicitante, la nota/requerimiento y la tabla de renglones (material o servicio, cantidad y precio) con su total, en la MONEDA de la orden (Bs o $). El PDF del detalle (boton "↓ PDF") incluye esa misma tabla.',
      'Compra/Servicio Directo - Pago a externo (reintegrar): al crear o editar una Compra Directa o un Servicio Directo hay un check "Pago a externo". Si lo pago OTRA PERSONA de su bolsillo, se marca y se ingresan sus datos (nombre y apellido, cedula/RIF, telefono y una nota de reintegro). Queda marcado en el DETALLE de la compra/servicio, en su PDF y, sobre todo, en TESORERIA: al ver el movimiento del pago aparece un aviso resaltado "Pago a externo - reintegrar" con los datos de la persona, para que se le DEVUELVA el dinero a quien lo adelanto. El PDF del detalle del movimiento tambien lo incluye.',
      'Servicio Directo - Nota / motivo y edicion: el servicio directo se puede EDITAR (boton Editar del detalle) mientras esta En proceso: cambia servicios, proveedor, solicitante, la NOTA/MOTIVO, la MONEDA y los datos de Pago a externo. La Nota / motivo es un texto libre que se carga al crear o editar y aparece en el DETALLE, en el PDF del servicio y en Tesoreria (junto al requerimiento del movimiento del pago).',
      'Servicio Directo - Moneda (Bs o $): el servicio directo tiene una moneda propia. Se elige al crear (selector "Moneda del servicio") y se puede cambiar al editar o al cargar factura y monto (montar). Todos los montos (detalle, lista, PDF y Tesoreria) se muestran en esa moneda: en Bs como "Bs ..." y en dolares como "$ ...". El servicio (Solicitud de Servicio) normal maneja la moneda por sus ofertas (Bs a BCV o divisa), asi que ya soporta ambas.',
      'Inventario - tarjeta "Casiterita producida": la tarjeta (icono de fuego) del panel de Inventario muestra los KG de CASITERITA que YA entraron al inventario por CONTRATOS FINALIZADOS (cerrados) del modulo Produccion, y cuantos contratos finalizados suman esos kilos. Al cerrar un contrato, su casiterita (kg seco limpio) entra como stock del producto CASITERITA en el almacen PRODUCCION; esta tarjeta refleja ese total. Un clic lleva a Produccion.',
      'Compra Directa - nota visible en Tesorería: la nota/observacion de la compra (se escribe al crear, editar o al cargar factura y montos) suele traer los datos de a quien y como pagar (persona, Pago Movil, cuenta). Ahora se muestra en Tesorería: en el panel "Directos por pagar" bajo el material y RESALTADA dentro del modal de pago, para que quien paga sepa a quien abonarle. La nota se conserva al re-montar (no se borra si no se toca).',
      'Compra Directa - recepción en inventario (almacenista, independiente del pago): al montar la compra queda "por recibir" (no hace falta que esté pagada). Aparece en la columna "Por recibir" del propio tablero de Compra Directa (botón "Recibir" en la tarjeta/fila) y también en Inventario -> Recepciones, panel "Compras directas por recibir" (el contador del botón las incluye). Desde cualquiera de los dos, el almacenista pulsa "Recibir", ve el detalle (materiales, cantidades y costo) y elige el almacén / sub-almacén destino; al confirmar, cada material entra al inventario como ENTRADA (costo = gasto / cantidad -> PMP; en Bs se convierte a USD con la tasa del día). La compra puede recibirse ANTES o DESPUÉS de que Tesorería pague. El detalle indica por separado el estado de pago y de recepción (en qué almacén y por quién). Si la compra está marcada "no ingresa al inventario" (materiales ya cargados a mano), no aparece para recibir.',
      'Compra Directa en Bs - costo de inventario en USD: el inventario se valoriza en USD. Si la compra es en Bs, al darle entrada el costo de cada material se convierte a dólares con la tasa del día (Bs / tasa BCV) redondeado a 2 decimales; así el PMP y el valor del inventario quedan siempre en USD (el total a pagar en Tesorería sigue en Bs). El panel "Compras directas por recibir" y la tarjeta muestran el total en la MONEDA REAL de la compra (si fue en Bs, en Bs; ya no en $). Al abrir "Recibir", el modal muestra el costo en Bs y una columna "Entra ($)" con la conversion a dolares (tasa del dia) que es lo que realmente entra al inventario.',
      'Conversor multimoneda (Tesorería): convierte un saldo existente de una moneda a otra. Se elige la moneda de origen y, en la lista "Sale de", el saldo concreto (caja · billetera) con su cantidad disponible visible; luego la caja destino (puede ser OTRA caja) y su cuenta/billetera destino. Se indica con quién se hace el cambio (cliente o proveedor, se guarda en el directorio), el monto (botón "Usar todo"), la tasa (sugerida de Binance/TRM, editable, no usa BCV) y una comisión/descuento % opcional o "⊕ Redondear" para escribir a mano el neto que recibe el destino. Al pulsar 💱 Convertir descuenta del origen y acredita el neto en el destino (egreso + ingreso como movimiento de conversión), arrastrando la base de costo.',
      'PDF de la OC: muestra por ítem la marca y el modelo cuando el usuario los cargó en la oferta (bajo la descripción del producto).',
      'Marca/modelo visibles para el Gerente General: además de la comparativa y el PDF, el detalle de la OC muestra la marca y el modelo de cada ítem (etiqueta 🏷), para que el GG los vea al revisar y aprobar la orden.',
      'Todas las órdenes se pueden descargar en PDF (orden de compra y trazabilidad).',
    ],
  },
  {
    icono: '⚒',
    titulo: 'Proveedores',
    captura: 'proveedores',
    intro:
      'Es el directorio de proveedores de la empresa y la herramienta para comparar sus ofertas y elegir la mejor de forma objetiva.',
    puntos: [
      'Registro de cada proveedor con sus datos de contacto.',
      'Comparación de ofertas: el sistema ayuda a elegir la mejor opción combinando criterios (precio, tiempo de entrega, condiciones y otros).',
      'Comparación por producto (Bs vs USD): en cada oferta se cargan dos precios en $ por producto — Pago en Bs a BCV y Pago en USD — más un descuento por producto; el sistema calcula el total de cada columna, la diferencia (Bs − USD) y la variación %. Se ve al cargar y al desplegar la oferta, y en el PDF de trazabilidad. Una sola moneda: si el proveedor cotiza solo en Bs o solo en $, se puede llenar una sola columna y dejar la otra en blanco; la oferta se guarda con ese único precio.',
      'Adjuntos de la oferta: se pueden subir varios archivos (PDF y/o varias fotos de la cotización, máx. 10 MB c/u); el jefe puede verlos todos desde la comparativa.',
      'Editar una oferta cargada: mientras la oferta esté Pendiente (no aceptada), al desplegarla en la comparativa aparece "Editar oferta", que abre el formulario prellenado para corregir proveedor, marca, modelo, cantidad y montos (Bs/USD), condiciones, ficha y notas. En los adjuntos, al editar se ven los actuales con opción de ver y quitar cada uno, y se pueden agregar nuevos; queda la lista resultante.',
      'Mismo producto en varias marcas/modelos: con "+ Otra marca/modelo" el proveedor puede cotizar el mismo producto en distintas marcas/modelos, cada una con su precio (Bs y USD); se ven con su marca/modelo en la comparativa y el PDF.',
      'Conversación por orden (chat interno): dentro del detalle de cada orden hay un hilo de seguimiento entre compras y el Gerente General, en tiempo real, con aviso de mensajes sin leer (chip y notificación).',
      'Detalle de cada proveedor con su historial.',
      'Desde el buscador general o desde una orden se puede llegar directo a la ficha del proveedor.',
    ],
  },
  {
    icono: '🔥',
    titulo: 'Producción',
    captura: 'produccion',
    intro:
      'Gestiona la fabricación o producción de productos a partir de materiales del inventario, usando "recetas" que indican qué insumos y en qué cantidad se necesitan.',
    puntos: [
      'Recetas: definen los materiales que consume cada producto que se fabrica; al producir, el sistema descuenta esos insumos del inventario.',
      'KG Mesas (merma por humedad): botón junto a Crear contrato. Por cada contrato muestra su nombre y la fecha en que se creó, y permite cargar manualmente Pesos Mojado y Pesos Seco (2 decimales). Calcula solo la Merma en Kg = Pesos Seco − Pesos Mojado (admite negativos) y el % Merma Humedad = Merma ÷ Pesos Mojado × 100. Arriba, en tarjetas, los totales: Total Pesos Mojados, Total Pesos Seco, Merma en Kg (sumas de cada columna) y % de Merma = (Merma total ÷ Total Pesos Mojados) × 100. Los pesos se guardan solos al salir del campo y es en tiempo real. El Pesos Mojado cargado acá se refleja automáticamente en la observación del contrato como "Material de Mesa: …", y al cerrar (finalizar) el contrato se vuelve a volcar ese valor a la observación.',
      'Vista kanban: muestra las producciones en proceso y las últimas finalizadas.',
      'Cada producción registra el horno utilizado y la cantidad producida.',
      'Se puede descargar la receta/producción en Excel, con el encabezado naranja característico del sistema.',
    ],
  },
  {
    icono: '↘',
    titulo: 'Salidas / Traslados',
    captura: 'salidas',
    intro:
      'Controla la salida de cosas de la empresa y los movimientos internos. Tiene un interruptor superior para elegir entre Salidas y Traslados, y un segundo interruptor entre Material y Dinero.',
    puntos: [
      'Salida de material: despacha materiales del inventario. Permite varios materiales en una misma solicitud (como una OC en OP): se arma un carrito con "＋ Agregar material", cada renglón con su producto y cantidad, y al pie se ve el Total. No se elige almacén: el buscador muestra todos los materiales con stock (cada uno con su almacén) y al ejecutar cada material se descuenta del almacén que le corresponde (pueden salir de almacenes distintos). Se aprueba/ejecuta de una sola vez. Ya no pide "a quién va dirigido": solo descuenta el inventario. El precio unitario viene precargado con el costo (PMP) de ese almacén (una caja de 10 lápices que costó $100 vale $10 c/u) y ahora SE PUEDE EDITAR por material: si se cambia, se usa en la salida y se actualiza el costo del producto en el inventario (queda vinculado). Lleva un selector de Unidad solicitante igual al de la OP, con el mismo catálogo (sincronizado en vivo) y opción de añadir una unidad nueva.',
      'Traslado de material: mueve materiales entre almacenes dentro de la Sede Peramanal (origen → destino), conservando el costo (PMP) del origen, que se puede editar por material; si se cambia, se actualiza el costo del producto en el inventario. Igual que la salida, permite varios materiales en una misma solicitud (carrito con "＋ Agregar material"), todos del mismo origen hacia el mismo destino. También lleva el selector de Unidad solicitante del catálogo de OP.',
      'Transporte y destino: en la creación se cargan el Chofer / responsable (nombre, apellido y cédula) y el Vehículo (descripción y placa), ambos buscables desde un catálogo gestionable (alta rápida con "＋ Nuevo" y edición/desactivación/eliminación con el botón ⚙; los desactivados no aparecen). También se indican la Dirección de despacho y la Dirección de destino. Todo se imprime en la Orden de Salida y se ve en el detalle.',
      'Editar la solicitud (mientras está Por aprobar): en el detalle de una solicitud aún Por aprobar aparece el botón Editar. Se pueden cambiar los datos de cabecera (solicitante, unidad, motivo, fecha de entrega, dirigido a, consumo interno), el transporte y direcciones (chofer, C.I., vehículo, placa, dirección de despacho y de destino) y, en material, las cantidades, el costo unitario y la observación de cada renglón (también se pueden quitar renglones); el producto y el almacén no se cambian. Editar no mueve stock ni saldo (eso ocurre solo al ejecutar). Una vez Aprobada ya no se edita el contenido. Cuando la orden está FINALIZADA (ejecutada) aparece el botón "Editar nota": permite agregar o corregir SOLO la nota/motivo/detalle (una anotación adicional del usuario) sin cambiar productos, cantidades, montos ni el estado (sigue Finalizada); esa nota se refleja también en el historial y el PDF.',
      'Consumo interno: una casilla marca la salida/traslado como consumo interno (el material se queda en la empresa); se refleja en el detalle, en la trazabilidad y en el PDF.',
      'Resumen por unidad solicitante: el botón "Resumen por unidad" muestra el gasto de material agrupado por la unidad que lo solicitó (salidas ejecutadas), con gráfico de barras y tabla; al tocar una barra o fila se ve el detalle (fecha, hora, quién solicitó, material, cantidad y monto en $). Es filtrable por fechas, se actualiza en vivo y se exporta a PDF, Excel o correo.',
      '"A quién va dirigido": aplica a la salida de dinero (interruptor: Almacén despliega los almacenes registrados más "Consumo Interno"; Persona despliega la lista de usuarios con nombre, apellido y cargo). La salida de material ya no lo usa.',
      'Salida de dinero: es un adelanto que sale de una caja (en USD o Bs) y queda en estado "pendiente".',
      'Conciliación con mineral: la salida de dinero pendiente se "casa" después con la recepción del mineral equivalente (cantidad, costo por KG/G y descripción), que ingresa al inventario.',
      'Traslado de dinero: mueve saldo entre cajas de la misma moneda.',
      'Cajas: se administran desde el botón de cajas (crear, renombrar, habilitar/deshabilitar y ajustar saldo).',
      'Cada salida queda en un historial; al hacer clic se ve su detalle, con opción de PDF y trazabilidad. El PDF se genera solo cuando lo pedís con el botón.',
      'Filtrar el Historial: la pestaña Historial (de Salidas y de Traslados, material o dinero) tiene un buscador libre (producto, almacén, quién lo hizo, motivo, caja…) y un rango de fechas (Desde / Hasta), con botón para limpiar. Filtra la tabla al instante.',
    ],
  },
  {
    icono: '⛽',
    titulo: 'Combustible',
    captura: 'combustible',
    intro:
      'Tiene dos secciones (selector arriba): Tanques (control de diésel por tanque, réplica del Excel, con carga directa) y Solicitudes de salida (flujo con aprobación).',
    puntos: [
      'Tanques — Reporte por tanque: una tarjeta por tanque muestra los litros disponibles, una barra contra la capacidad, la tasa (USD/L) y el resumen de entradas/uso/traslados; arriba, el total disponible entre todos.',
      'Tanques — Vista de inicio: arriba hay DOS tarjetas-resumen. "Combustible disponible" suma todos los tanques EXCEPTO los del grupo Brasileros; "Los Brasileros" suma solo el Tanque #2 Brasileros y el Registro Brasileros - GT (identificados por su nombre). Esos dos tanques se descuentan del total general y solo se reflejan en la tarjeta Los Brasileros. Cada tarjeta muestra litros disponibles, cantidad de tanques, valor total en $ y tasa promedio (ponderada por litros). Debajo están las tarjetas de cada tanque (litros disponibles, capacidad, tasa y resumen de entradas/uso/traslados).',
      'Tanques — Aviso de combustible bajo: cuando el grupo GENERAL (la primera tarjeta, sin los Brasileros) baja a 6.000 ltrs o menos, el sistema muestra un aviso en la parte superior ("Hay que comprar combustible") y deja una notificación en la campana. Solo lo ven los usuarios con permiso en Tesorería, Combustible o Inventario y los administradores. El aviso tiene un botón para cerrarlo y vuelve a aparecer cada 2 horas, hasta que se registre la compra y el combustible entre en los totales.',
      'Tanques — Abrir un tanque y Volver: al hacer clic en una tarjeta la vista cambia: la tarjeta seleccionada queda arriba y debajo aparecen sus movimientos (mes en curso). El botón Volver regresa al inicio de Combustible con todas las tarjetas.',
      'Tanques — Saldo de apertura: los litros con que se creó el tanque (saldo inicial) son la apertura del libro. El saldo corrido de la tabla arranca desde esa apertura, de modo que la última fila siempre coincide con el saldo real del tanque (el de la tarjeta), aunque la apertura no sea un movimiento; por eso editar o borrar un movimiento nunca pierde la apertura.',
      'Tanques — Tasa fija: la tasa USD/L del tanque NO varía sola (no se promedia). Solo cambia cuando se edita la tasa del tanque (botón ✎), y al cambiarla se re-valorizan todos sus movimientos a la nueva tasa. La vista de inicio agrupa los tanques bajo su banner: los del grupo general bajo "Combustible disponible" y los Brasileros bajo "Los Brasileros".',
      'Tanques — Tipos de movimiento: Entrada (entra combustible y se valoriza a la tasa fija del tanque; la primera entrada de un tanque sin tasa la fija con el costo informado), Uso (un equipo consume y descuenta a la tasa del tanque) y Traslado (sale a otra mina o a otro tanque; si es a otro tanque, se acredita allí a la tasa del origen).',
      'Tanques — Libro mayor (mes en curso): la tabla muestra solo los movimientos del mes actual. Cada fila guarda fecha, hora, equipo, autorizado por, destino, observación, los litros y el saldo corrido en ltrs y USD, más el horómetro final (HF) y el contador final del surtidor. La tabla oculta Tanque, HI (horómetro inicial), Cont. ini y Tasa: esos datos siguen en Ver detalle. La columna de litros se rotula "Saldo ltrs".',
      'Tanques — Medidores del equipo: en cada nuevo movimiento se capturan el horómetro inicial (HI, autocarga con el último final del equipo) y final (HF), el kilometraje (odómetro, precarga la última lectura del equipo) y el contador del surtidor. El horómetro y el kilometraje registrados aquí alimentan la alerta "Próximos a mantenimiento" de Control de Maquinaria.',
      'Tanques — Ver / editar movimiento: el botón Ver permite editar todo el movimiento (tipo, litros, tasa, fecha, hora, equipo, autorizado, destino, observación y medidores: horómetro, kilometraje y contador). Si se cambian tipo, litros o tasa se recalcula el saldo del tanque. Si se cambia la fecha u hora, el movimiento cambia de lugar en la línea de tiempo y el sistema re-encadena los medidores: el contador inicial del surtidor (por tanque) y el horómetro inicial (por equipo) vuelven a colgar del valor final del movimiento anterior, conservando lo registrado en cada uno.',
      'Tanques — Manejo por mes e Histórico de Movimientos: al terminar el mes la lista actual se vacía y comienza el mes nuevo automáticamente; lo anterior queda en el botón Histórico de Movimientos, que muestra una tarjeta por tanque y, al elegirlo, sus movimientos agrupados por mes (con filtros, búsqueda y reportes). El saldo, el horómetro y el contador NO se reinician: siguen encadenados sobre todos los movimientos.',
      'Tanques — Catálogos: los desplegables de Equipos, Autorizados y Ubicaciones se gestionan desde el botón Catálogos (vienen precargados desde la planilla).',
      'Tanques — Conciliación: compara el saldo de nuestros libros contra el reportado por la mina y guarda la diferencia por período. También hay gráfica de consumo por equipo.',
      'Solicitudes de salida: flujo Por aprobar → Aprobada → Finalizada. Se registra el ingreso (litros + costo, recalcula PMP) y la salida sale del inventario del almacén de origen al finalizar. Cada solicitud se descarga en PDF y se envía por correo.',
    ],
  },
  {
    icono: '📦',
    titulo: 'Centro de Acopio PERAMANAL',
    captura: 'acopio',
    intro:
      'Registra la recepción de mineral en el centro de acopio, replicando el formato de "Control de Recepción de Mineral por Centro de Acopio". Cada recepción tiene un encabezado (fecha, centro, aliado) y una tabla de lotes; al cerrarla, el mineral recibido suma stock al inventario.',
    puntos: [
      'Numeración automática: cada recepción recibe un número correlativo (REC-AÑO-0001).',
      'Tabla de lotes: por cada lote se registran bolsas, peso por bolsa, peso neto, precintos y peso recepcionado. El Peso Bruto y las dos Diferencias se calculan solos.',
      'Estados: una recepción nace como borrador (Abierta) y se puede editar; al "Cerrar y sumar stock" se suma el mineral al producto y almacén elegidos y queda bloqueada.',
      'Anular: si una recepción cerrada se anula, el sistema revierte automáticamente el stock que había sumado.',
      'Se puede descargar la recepción en PDF con el formato del formato original (incluye las firmas de Conforme Entregado y Conforme Recibido).',
      'Caja Peramanal: un libro de caja donde se registran entradas, gastos, nóminas, traslados y los Kg cerrados de casiterita; cada movimiento se clasifica en uno de los 5 grupos (Contratos, Gastos Caja, Movimientos de Caja, Nómina, Traslado), cada uno con su color.',
      'Tasa actual del material: una tarjeta en la vista inicial muestra el precio por Kg = (Facturado + Gastos + Nóminas) ÷ Kg cerrados. Por eso, cada gasto que se carga en la caja hace variar la tasa.',
      'Tarjetas de resumen vinculadas a los movimientos: las tarjetas Tasa actual, USD entregados, Saldo de caja (saldo en moneda $ Usd corrido), Saldo en Kg, Gastos GT y Nóminas GT se calculan en vivo desde la misma lista de Movimientos del Centro de Acopio; al registrar un movimiento se actualizan solas (no quedan en $0,00 mientras existan movimientos).',
      'USD entregados ↔ Cuenta por pagar a MGG: el total de la tarjeta "USD entregados" se refleja automáticamente como una cuenta por pagar a MGG en Tesorería → Cuentas por pagar (créditos), y se mantiene sincronizado siempre (al crear, editar o borrar movimientos). Esa deuda se salda pagando con dinero (abono normal) o con producto al cambio: la contraparte entrega producto que entra al inventario y su valor en USD abona la deuda, sin mover caja.',
      'Recibir dinero de MGG (directo a una caja): botón "RECIBIR DINERO DE MGG" en Tesorería (junto a Cuentas por cobrar). Igual que la entrada de dinero del Acopio, pero el dinero entra DIRECTO a la caja elegida (sube su saldo, en la moneda de la caja) y queda anclado como una cuenta por pagar a MGG llamada "MGG · directo", en la moneda de la caja. Al abrir, un mensaje explica a dónde va el dinero y se elige la caja (con su billetera) y el monto. Es incremental (varios ingresos en la misma moneda se acumulan) y la deuda se salda después desde Cuentas por pagar con abonos (egreso de caja) o entregando producto. Es una cuenta APARTE de la deuda "MGG" sincronizada desde Acopio (no se mezclan).',
      'Agregar movimiento: botón que abre un formulario con la fecha automática y los campos $ Usd Facturados, Gastos GT (monto + lista de gastos), Nómina (monto + lista de nómina), Traslado de Caja (montos en $ con 2 decimales) y Kg Recibidos por MGG (en Kg). Debajo de cada concepto hay un campo Descripción: ese texto es el que se muestra en la columna Descripción de la lista de Movimientos (si se deja vacío, se usa un texto por defecto). Cada concepto se registra como un movimiento con su categoría.',
      'Resumen caja: botón en el encabezado que abre un resumen financiero de la caja (como la hoja RESUMEN CAJA PERAMANAL GT): período (inicio, última actualización, días), saldo actual de la caja, total entregado, total gastado (gastos + nómina), tasa del material, % gastos vs % nómina, distribución de gastos y de nómina por categoría (monto y %), y bloque de Kg de casiterita (producción GT, enviados a MGG, diferencia). Se actualiza en vivo con cada movimiento y se puede descargar en PDF o enviar por correo. Incluye un filtro por rango de fechas (Desde / Hasta): al indicarlo, todo el resumen se recalcula mostrando solo los movimientos de ese rango. En "Gastos por categoría", todas las categorías son clicables (marcadas con 📊) y abren el detalle del gasto con gráfica de barras, buscable y con filtro de período: las de vehículo/maquinaria (las que terminan en "REPUESTOS - REPARACIONES - SERVICIOS") muestran el gasto por equipo y el resto muestra el gasto por descripción del movimiento.',
      'Equipo/vehículo en el gasto: al cargar/editar un movimiento de caja cuya categoría de gasto sea de vehículo/maquinaria ("…REPUESTOS - REPARACIONES - SERVICIOS"), el formulario despliega un selector buscable de equipos (la misma lista de Combustible > Catálogos > Equipos). Es opcional; al elegirlo, el gasto queda atado a ese equipo y suma en su consumo por equipo dentro del Resumen de Caja.',
      'Consumo Martillos: botón que abre el libro de consumo de martillos del Molino H66 (hoja CONSUMO MAZOS MARTILLOS GT): fecha, descripción, $Usd entregados, cantidad de martillos, precio $/martillo (= $Usd facturados ÷ cantidad de martillos, igual que el Excel), $Usd facturados, saldo $ corrido (= entregados − facturados), martillos entregados a GT, consumidos (uso) y martillos restantes (= entregados − a GT − consumidos). Permite agregar, editar y eliminar, es en tiempo real y se descarga en PDF o se envía por correo.',
      'Martillos · Entrega vs Consumo: al agregar/editar se elige el tipo. Entrega es la carga de siempre (entregados, facturados, a GT). Consumo (uso) registra los martillos usados: se ingresa la cantidad y se valora al precio vigente del martillo; el resultado (cantidad × precio) se registra automáticamente como un gasto "USO DE MARTILLOS" en la caja de Acopio (grupo Gastos Caja) y descuenta esos martillos del inventario y de los restantes. Si se edita o borra el consumo, el gasto se actualiza o elimina solo.',
      'Listar movimientos (switch): la lista de Movimientos del Centro de Acopio arranca oculta. En el encabezado, junto a "+ Agregar Movimiento", hay un switch "LISTAR MOVIMIENTOS" que la muestra u oculta. Mientras el switch está apagado también se oculta el botón "+ Agregar Movimiento" (aparece solo al activarlo). Mientras está oculta, las tarjetas de resumen siguen calculándose en vivo (no hace falta activarla para verlas).',
      'Ir al contrato desde Acopio: en la lista de Movimientos del Centro de Acopio, las filas de contrato (descripción "CONTRATO PRODUCCIÓN GT - #N", marcadas con ↗) son clicables: al pulsarlas, el sistema navega al módulo de Producción y abre el detalle de ese contrato.',
      'Editar movimientos de Acopio: las filas que NO son de contrato (movimientos de caja, marcadas con ✎) son clicables para editarlas. Abren el mismo formulario de alta y permiten modificar todos los datos (fecha, clasificación de caja y de costo, descripción, $ entregado, Kg cerrados, facturados, gastos, nóminas, traslado y Kg recibidos) o eliminarlas.',
      'Vínculo con el Inventario (Casiterita y Martillos): ambos se reflejan como productos del inventario (almacén PRODUCCION). La Casiterita aumenta su stock al cerrar un contrato desde Producción, valorizada con la tasa del material de acopio vigente (queda en la trazabilidad). Los Martillos sincronizan su cantidad (restantes) y su costo (precio por martillo) automáticamente desde el libro de Consumo de Martillos, registrando cada cambio en la trazabilidad como un movimiento de Ajuste.',
      'Tasa actual del material: la tarjeta muestra una flecha con el texto SUBIÓ (verde) o BAJÓ (rojo) según haya aumentado o disminuido la tasa respecto al valor anterior.',
      'Dinero por entrar (desde otro sistema): cuando llega dinero desde el sistema externo Mineral Group, el banner DINERO POR ENTRAR muestra el monto; al pulsar ACEPTAR ENTRADA se registra como un movimiento del Centro de Acopio con la descripción fija "CAJA MULTIMONEDAS MGG / CAJA GT PERAMANAL" y el monto en la columna $Usd entregado (suma en la tarjeta USD entregados y en el Saldo de caja). Ya no requiere tener una caja abierta; si la hay, el movimiento se asocia automáticamente.',
      'Cierres de caja: la caja se maneja por períodos (cada "cierre" tiene número, rango de fechas y recepción asociada). Al cerrar, se calcula el resumen del cierre: días transcurridos, total gastado, distribución del gasto por categoría y tasa promedio. Al cerrar, el sistema crea automáticamente una RECEPCIÓN (módulo Recepciones) con el Saldo de KG de casiterita acumulado. Esa casiterita NO entra al inventario al cerrar la caja: primero se hace la recepción del laboratorio; el ingreso a inventario es un paso posterior.',
      'Clasificación de costos (2 niveles): cada gasto puede etiquetarse con una Clasificación y una Sub-clasificación (ej. "Costos de Extracción y acarreo" → "Gastos de Combustible") para el análisis de costos del cierre.',
      'Cuadre Efectivo: cuadre de caja en efectivo (lo que entrega el proveedor de caja). Se cuenta el efectivo por billetes para verificarlo, se cargan las salidas categorizadas (nómina, compras, adelantos), se lleva el saldo corriente y se controlan los vales/deudas pendientes.',
      'Procesos: las demás hojas del Excel (resúmenes, registros de cuadrillas, mesa seca, consumo de martillos) se muestran como vistas del sistema y se van convirtiendo en módulos interactivos.',
    ],
  },
  {
    icono: '📋',
    titulo: 'Recepciones (Laboratorio de mineral)',
    intro:
      'Registra la recepción de casiterita que llega del Centro de Acopio y el análisis de laboratorio por elemento (réplica de la hoja "Recepción Global Laboratorio"). Está vinculado a los cierres de caja del Centro de Acopio.',
    puntos: [
      'Secciones (debajo del título): tres botones — Conciliación, Totales y Resúmenes — abren su panel de trabajo dentro de la misma vista.',
      'Procedencias (catálogo): el botón "Procedencias" abre un catálogo editable (agregar, renombrar, borrar) con lista estilizada; se guardan en MAYÚSCULAS y sin repetir. Estas procedencias alimentan el desplegable de los pesos y las pestañas del análisis químico.',
      'Todo por procedencia: pesos, Humedad Final, análisis químico, conciliación, totales y resumen trabajan por procedencia. Se cargan los pesos de cada procedencia y el sistema arma su neto y su humedad; el análisis se separa por pestañas de procedencia; y conciliación/totales/resumen muestran un desglose por procedencia con su total general.',
      'Resúmenes (hoja de recepción): arma automáticamente la hoja clásica de "Recepción de mineral" con los datos ya cargados (recepción/pesadas, conciliación, humedad, Fe de Totales y análisis) y la muestra en pantalla con un boton "PDF (vista previa)". Reúne, en el formato de siempre: RECEPCIÓN# y FECHA, Procedencia C/A, Kg neto Centro de Acopio, Merma no llegó (%), Kg neto Recibidos por Ops (con la cantidad de big bags), Merma humedad (%), Kg neto Secos, Merma Fe (%), Kg neto finales seco y limpio, Tenor Sn (lecturas A/B/C y su promedio) y Kg Neto de Sn (= Kg finales × promedio del Tenor / 100), cada fila con su columna de Observaciones. El PDF abre en vista previa y solo se descarga si se pulsa Descargar.',
      'Conciliación (vs Centros de Acopio): el botón abre un modal que compara el Peso KG total recibido contra lo reportado por los centros de acopio (incluye aliados). La lista (modal principal) muestra cada conciliación con N° Recepción, Fecha, Reportado (KG), Kg No Llegó y % No Llegó; se hace clic en una fila para editarla o se elimina con la papelera; abajo Cerrar y "Nueva conciliación". El formulario (Nueva/editar) tiene N° de recepción (incremental, editable), Centros de Acopio (lista editable de Saldo KG + centro/aliado, con Añadir centro y eliminar) y un panel RESUMEN: Peso Kg Total (editable, con atajo usar recepciones), Kg Reportado (suma de saldos), Kg Faltante = Peso Kg total − Reportado (rojo), la Diferencia = Reportado − Peso Kg total (positiva = "Kg a favor" en verde; negativa = "Kg Faltante" en rojo), Kg Peso de Bolsas, Muestras tomadas por Laboratorio MGG, Kg No Llegó = Diferencia + Peso de Bolsas + Muestras (rojo), % de lo que no llegó = No llegó / Reportado × 100 y un desglose por procedencia (neto seco de cada una), más una Nota opcional. Se guarda con "GUARDAR CONCILIACIÓN" y se vuelve con "Volver"; todo se sincroniza en tiempo real y se puede editar o eliminar. Cada centro tiene una Categoría (Normal/RESGUARDO); al elegir RESGUARDO aparece "¿Entran estos KG al inventario?" y, si se marca, se elige el almacén destino (si no existe se escribe y se crea, sincronizado con el inventario real). Esos saldos de RESGUARDO entran al inventario SIN tasa (sin costo) y el ingreso efectivo ocurre al Cerrar recepción.',
      'Cerrar recepción (histórico): botón a la altura de las secciones que abre un modal con el histórico de recepciones cerradas (N° y fecha). Con "Cerrar recepción" se pide el N° de recepción (la primera vez; luego incremental) y al confirmar se guarda una foto de TODOS los datos (recepciones, análisis, humedad, conciliación y totales de ese N°); además los centros RESGUARDO marcados "entra al inventario" ingresan al inventario sin tasa (producto Casiterita). Al hacer clic en un cierre se ven sus detalles con la fecha y los ingresos por resguardo. Todo en tiempo real.',
      'Se alimenta del cierre de caja: cada vez que se cierra la caja del Centro de Acopio se crea automáticamente una fila de recepción con Peso KG = Saldo de KG de casiterita acumulado, la fecha/hora del cierre y Procedencia = PERAMANAL (editable). Esa casiterita NO entra al inventario al cerrar la caja; primero se hace la recepción (el ingreso a inventario es un paso posterior).',
      'Cabecera de cada recepción: Ítem (correlativo que empieza en 1 y se incrementa solo), Fecha y hora, Peso KG, Procedencia (PERAMANAL por defecto, editable) y N° Análisis (correlativo del laboratorio). También se puede crear una recepción a mano con "Nueva recepción".',
      'Recepción Global Laboratorio: el laboratorio carga el análisis por elemento (Sn (Estaño) — Laboratorio Mineral Group, UCV, Fe, Ti, Ta, Nb, V, Zr, Bal (estéril), Mn, Hf…). Cada elemento tiene varias lecturas A, B, C, D… (la cantidad se configura por mineral) y una columna Prom. = promedio de las casillas con dato (si cargás 2 lecturas, divide entre 2); algunos (como UCV) son de valor único. Todos los valores son leyes del mineral en porcentaje (%); el Prom. y el Promedio del lote se muestran en % con mín. 2 y máx. 3 decimales. La tabla se muestra en columna: cada mineral es un bloque apilado uno bajo otro, 5 de un lado y 5 del otro, y el Promedio del lote de cada bloque va centrado al pie.',
      'Añadir valores / Guardar datos (independiente): la tabla de laboratorio es independiente de la de recepciones (kg). El análisis es por procedencia: arriba hay pestañas de procedencia (del catálogo) y cada una tiene su propio set; "+ Añadir valores" crea el análisis en la procedencia seleccionada. Cada análisis tiene una columna "#" para los números de muestra/sobre (texto libre, ej. "34, 34, 645"), informativa. El N° Análisis es correlativo por procedencia. Los N° cargados se gestionan en la barra (editar el número, el # y eliminar). Además del guardado al salir de cada celda, "Guardar datos" guarda de una vez todos los datos cargados sin borrar lo recién ingresado. Esos datos químicos se muestran después al Cerrar la recepción (en el detalle del cierre, como "Resultados de laboratorio").',
      'Configurar minerales: botón que abre un panel para gestionar los minerales: agregar uno nuevo (nombre, subtítulo opcional, tipo A/B/C/…/Prom. o Solo Prom., N° de lecturas A,B,C,D… y color), editar (incluido subir o bajar el N° de lecturas de un mineral ya creado) y ocultar/mostrar. Los cambios se reflejan al instante.',
      'Promedio del lote: al pie de cada elemento se calcula el Promedio del lote = promedio de los Prom. de todas las recepciones que tienen valor en ese elemento.',
      'Humedad Provisional y Humedad Final: debajo del laboratorio hay dos tablas, una al lado de la otra, con sus botones "+ Humedad Provisional" y "+ Humedad Final" para agregar filas. Provisional: se cargan Peso (Gr) Húmedos y Peso (Gr) seco; el sistema calcula % Humedad = 100% - (Peso seco / Peso Húmedos) x 100 (redondeado a 2 decimales) y Merma peso H2O = Peso x % Humedad / 100; al pie, Promedio del lote del % (promedio simple) y Merma total (sumatoria). Final (automática, por procedencia): ya no se carga a mano; se completa sola desde los pesos, una fila por procedencia, con Peso (Kg) neto húmedo y Peso (Kg) recogido (seco = neto seco de esa procedencia). Merma peso H2O = Neto húmedo - Peso seco final y % Humedad final = Merma / Neto húmedo x 100; arriba se ve el PESO (KG) TOTAL NETO SECO y al pie los totales. Se sincroniza al cargar/editar/guardar los pesos. Solo la humedad se muestra en %.',
      'Añadir pesos: botón que abre un panel con dos tablas, Pesos Húmedos y Pesos Secos, una al lado de la otra. Con "+ Añadir …" se agrega una fila con Procedencia (A, B, ALI, D, FALTANTE…), su Peso húmedo y seco y una Categoría elegible por fila (un mismo pesaje mezcla los 3 tipos); el número se incrementa por categoría (Big bag 1, Saco 1, Bolsa de hielo 1…). La tara se descuenta por categoría: BIG BAG x1.5, SACO x0.06, BOLSA DE HIELO x0.05. Al pie: TARA ENVASES = suma de las taras de cada categoría y TOTAL NETO = suma de todos los pesos + TARA ENVASES (puede ser negativo). Cada fila se puede eliminar y se guarda en tiempo real.',
      'Guardar pesos e históricos: el botón "Guardar pesos" guarda la pesada actual (los bigbags cargados) en un histórico; al guardar, esos bigbags pasan a la pesada y la pesada actual queda vacía para empezar otra. La tabla "Históricos de pesadas guardadas" lista cada pesada como "PESOS GUARDADOS DÍA {fecha}" con su N° de bigbags, Neto húmedo, Neto seco y estado, y es modificable: al hacer clic en "PESOS GUARDADOS DÍA …" (o en "Editar") se abren los detalles de ese día con sus bigbags para corregirlos (los totales se recalculan solos), se puede marcar Consumida/Disponible y eliminar. Todo se sincroniza en tiempo real; estos pesos guardados se tomarán luego en otro paso.',
      'Edición y tiempo real: cada celda se guarda al salir de ella y se sincroniza al instante con los demás usuarios. Las recepciones se pueden editar o eliminar.',
    ],
  },
  {
    icono: '🍽',
    titulo: 'Control de Alimentación (Cocina)',
    intro:
      'Controla el consumo de víveres de la cocina por tipo de comida (desayuno, almuerzo, cena): qué se consume, cuántos platos se hacen y cuánto cuesta, tomando los precios del inventario.',
    puntos: [
      'Añadir movimiento: se elige el TIPO DE COMIDA (Desayuno, Almuerzo o Cena — uno por movimiento), se indica cuántos PLATOS se realizaron y se agregan los víveres consumidos. El buscador trae SOLO los productos de la categoría VÍVERES del inventario; por cada uno se indica la cantidad y el sistema toma el precio del inventario (PMP) y calcula el valor. Cada movimiento recibe un correlativo (CK-AAAA-####) y queda con su fecha y hora.',
      'Descuento de stock: al registrar el movimiento, cada víver se DESCUENTA del inventario (consumo). No deja consumir más de lo disponible.',
      'Tabla de movimientos: lista cada movimiento con tipo de comida, fecha/hora, correlativo, platos y valor. Es filtrable por fecha (desde/hasta), tipo de comida y una búsqueda general (código, producto, nota, fecha/hora). Se descarga en PDF con vista previa.',
      'Consumo / Resumen: botón con el consumo diario, semanal, mensual o por rango de fechas, con BARRAS de los víveres más consumidos y del consumo por tipo de comida. Muestra un resumen tipo "Día 23/06/2026 · 24 platos · consumo total $300 · promedio por plato $12,50" y el STOCK DISPONIBLE de víveres. Todo se puede descargar en PDF con vista previa.',
      'Alerta a Restablecer: botón con el que la cocina avisa a Compras que hay que montar el mercado (con nota opcional). Aparece como una tarjeta en Pedidos: el analista toca "Montar mercado" (abre la SP con MERCADO activado) o "Marcar atendida".',
    ],
  },
  {
    icono: '🚜',
    titulo: 'Control de Maquinaria y Vehículos',
    intro:
      'Registro y control de la maquinaria y equipos: ficha técnica, bitácora de horómetro/mantenimiento, alertas de mantenimiento preventivo y reportes.',
    puntos: [
      '4 tarjetas de estado (arriba): "Vehículos / Maquinaria ACTIVA" (operativos), "En MANTENIMIENTO" (equipos con al menos una solicitud de servicio registrada — al tocarla lleva al submódulo Servicio de Mantenimiento para darles seguimiento), "Próximos a Mantenimiento" (equipos cerca de su próximo servicio según el horómetro y el kilometraje vigentes que se traen de Combustible, dentro del margen del intervalo de la ficha) y "En ESTADO CRÍTICO" (mantenimiento vencido o fuera de servicio). Tocar Activa, Próximos a Mantenimiento o Crítico filtra la tabla a esos equipos.',
      'Catálogo (botón 🏷): 3 pestañas — Tipo de maquinaria, Propietario y Status (ACTIVO, MANTENIMIENTO, FUERA DE SERVICIO, INACTIVO). Se puede agregar, filtrar, editar, desactivar/activar y eliminar; nombres en MAYÚSCULA, sin duplicados.',
      'Registro de equipos (+ Nuevo equipo): ficha técnica completa (tipo, propietario, status, ubicación, año, marca, modelo, color, serial, placa, motor, combustible, litros, frecuencia de mantenimiento preventivo cada N horas y cada N km, y documentación). La Última ubicación es un buscador que toma las ubicaciones de Combustible (o se escribe una nueva). Tabla con búsqueda tolerante a acentos, edición, activar/desactivar y eliminar.',
      'Horómetro / Kilometraje y alerta: la columna Horómetro / Kilometraje muestra el horómetro vigente (h) y/o el kilometraje vigente (km) y, debajo, cuánto falta para el próximo mantenimiento (intervalo «cada N horas» y/o «cada N km» de la ficha). El equipo se marca con ⚠️ solo cuando está cerca de cumplir su servicio (dentro del 10% del intervalo; ej.: cada 250 h avisa con ≤ 25 h, o cada 10.000 km con ≤ 1.000 km), no desde el principio. El horómetro y el kilometraje vigentes se traen de Combustible (equipo vinculado); el horómetro cae a la bitácora si no hay dato de Combustible. El usuario solo actualiza horómetro y kilometraje en Combustible y fija el intervalo de alerta en la ficha. El gráfico «Equipos por status» del Resumen es clickeable. «Desactivar» deja el equipo inactivo (se ve con «Ver inactivos» y se reactiva con «Activar»); además, el botón 🗑 Eliminar lo borra de forma definitiva (incluida su bitácora de mantenimientos), con confirmación previa.',
      'Bitácora / horómetro (🔧): registro cronológico (fecha, horómetro, kilometraje, aceite, refrigerante, gasoil, trabajo, mecánico, ubicación). Las HRS. trabajadas (lectura − lectura anterior) y el consumo Lts/h (gasoil ÷ HRS) se calculan solos, igual que el Excel. Avisa cuando el período supera la frecuencia de mantenimiento. La alerta por kilometraje se calcula con el km vigente de Combustible y el intervalo «cada N km» de la ficha: al acercarse (dentro del 10%) o alcanzar el próximo servicio, el equipo se avisa con una tarjeta en Servicio de Mantenimiento.',
      'Tipo de mantenimiento (trazabilidad): dentro del botón 🔧 cada registro indica su tipo — Cambio de aceite, Cambio de pieza, Cambio de filtro, Servicio/preventivo, Reparación, Inspección, Lectura de horómetro u Otro. Al elegir "Cambio de pieza" se habilita el campo "Pieza cambiada" (ej. MOTOR, BOMBA HIDRÁULICA). El tipo y la pieza quedan en la columna Tipo de la bitácora, con la trazabilidad completa del historial de cada equipo.',
      'Resumen (📊): gráficas de gasoil por equipo y por status, y tabla de mantenimiento preventivo (⚠️ Toca servicio). Filtrable por fechas. La gráfica de gasoil es dinámica: al hacer click sobre un equipo se abre su detalle (consumo y valor del período, último horómetro, horas del período y ficha técnica).',
      'Reportes: el registro de equipos se descarga en PDF y Excel y se envía por correo.',
      'Servicio de Mantenimiento (submódulo, en el menú bajo Control de Maquinaria): agrupa los equipos en switches por flota — FLOTA PESADA, VEHÍCULOS DE CARGA y PLANTAS ELÉCTRICAS. El equipo se ubica en su flota automáticamente según su tipo: vehículo/carro/camión/gandola → VEHÍCULOS DE CARGA; planta/generador eléctrico → PLANTAS ELÉCTRICAS; el resto (excavadora, cargador, martillo…) → FLOTA PESADA. Igual se puede forzar un grupo a mano en la ficha ("Grupo · Servicio de Mantenimiento"), que tiene prioridad. Cada switch lista status, ubicación, horómetro vigente, mantenimiento cada (h) y HRS restantes, marcando con ⚠️ los equipos a ≤ 250 h del próximo servicio; además una tarjeta avisa los equipos próximos por kilometraje (km vigente de Combustible + intervalo «cada N km» de la ficha). Desde cada equipo se abre su Bitácora. Además, cada equipo muestra la columna "Solicitudes de servicio" con la cantidad de solicitudes (de Pedidos → Servicios) casadas y cuántas están en curso; al tocarla se ven todas (código, estado, descripción, quién la pidió y unidad), así se ve de dónde se pidió el servicio y se le da seguimiento del consumo en la bitácora. El botón "Resumen de [grupo]" muestra el consolidado (horómetro, HRS restantes y consumos del período: aceite/gasoil/refrigerante/filtros), filtrable por fechas y con descarga a PDF (vista previa). En ese resumen cada equipo es clickeable: abre su historial completo de movimientos (une la bitácora con las solicitudes de servicio) en una línea de tiempo por fecha — ej. "25/06 · Cambio de cauchos ×6" — filtrable por rango de fechas y con descarga a PDF. Si algún equipo no se pudiera ubicar por su tipo, aparece en la pestaña "SIN CLASIFICAR" para no ocultarlo.',
      'Tiempo real y permisos por rol como el resto del sistema.',
    ],
  },
  {
    icono: '👤',
    titulo: 'Usuarios',
    captura: 'usuarios',
    intro:
      'Permite administrar las personas que usan el sistema y, sobre todo, qué puede hacer cada una. (Disponible para perfiles administradores.)',
    puntos: [
      'Alta y edición de usuarios con su nombre, cargo y departamento.',
      'Roles y permisos: se define, por rol, a qué módulos puede entrar cada persona y si puede solo ver o también modificar.',
      'Cambio de clave de los usuarios.',
      'Resumen de Actividad (supervisión): muestra quién está conectado ahora y cuánto tiempo lleva en el sistema (en vivo), el tiempo por usuario y el detalle de sesiones por rango de fechas. Se descarga en PDF con vista previa.',
      'Esto garantiza que cada quien acceda solo a lo que le corresponde.',
    ],
  },
  {
    icono: '⚙',
    titulo: 'Ajustes',
    captura: 'ajustes',
    intro:
      'Es tu espacio personal de configuración dentro del sistema.',
    puntos: [
      'Perfil: revisá y actualizá tus datos.',
      'Preferencias: ajustá opciones de tu cuenta.',
      'Cambiar tu contraseña de forma segura.',
    ],
  },
  {
    icono: '📘',
    titulo: 'Menú de Usuario',
    intro:
      'Es el acceso a este manual. Al hacer clic, el sistema genera y descarga este documento en PDF para que puedas consultarlo o imprimirlo cuando lo necesites.',
    puntos: [
      'El manual se descarga únicamente cuando vos lo pedís con el clic; no se envía ni se descarga solo.',
      'Podés volver a descargarlo siempre que quieras; reflejará las pantallas disponibles del sistema.',
    ],
  },
];

const CONSEJOS: string[] = [
  'Si no ves un módulo en el menú, es porque tu rol no tiene permiso para entrar; pedíselo a un administrador.',
  'Usá el buscador de la barra superior para llegar rápido a cualquier producto, proveedor u orden.',
  'Revisá la campana de notificaciones: te avisa cuando un material está por agotarse.',
  'Los reportes en PDF y Excel siempre se descargan con un botón; nada se descarga ni se envía por correo de forma automática.',
  'Ante cualquier duda, cerrá sesión con el botón ⎋ y volvé a ingresar; tus datos quedan guardados.',
];

export async function descargarManualUsuario(capturas: CapturasManual = {}): Promise<void> {
  const [logoDataUrl, { jsPDF }] = await Promise.all([
    loadLogoDataUrl().catch(() => null),
    import('jspdf'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 42.52; // 1.5 cm
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM = PAGE_H - 54;
  let y = MARGIN;

  // Asegura espacio vertical; si no entra, agrega página nueva.
  function ensure(h: number) {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function texto(t: string, size: number, style: 'normal' | 'bold' | 'italic', color = GRIS_TEXTO, lineGap = 4) {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(t, CONTENT_W) as string[];
    for (const line of lines) {
      ensure(size + lineGap);
      doc.text(line, MARGIN, y);
      y += size + lineGap;
    }
  }

  function bullet(t: string) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(GRIS_TEXTO[0], GRIS_TEXTO[1], GRIS_TEXTO[2]);
    const lines = doc.splitTextToSize(t, CONTENT_W - 16) as string[];
    lines.forEach((line, i) => {
      ensure(14);
      if (i === 0) {
        doc.setTextColor(NARANJA[0], NARANJA[1], NARANJA[2]);
        doc.text('•', MARGIN + 2, y);
        doc.setTextColor(GRIS_TEXTO[0], GRIS_TEXTO[1], GRIS_TEXTO[2]);
      }
      doc.text(line, MARGIN + 16, y);
      y += 14;
    });
    y += 2;
  }

  // Embebe una captura de pantalla, escalada al ancho de contenido, con marco
  // y leyenda. Salta de página si no entra completa.
  function captura(cap: CapturaManual, leyenda: string) {
    const ratio = cap.h > 0 ? cap.h / cap.w : 0.6;
    let w = CONTENT_W;
    let h = w * ratio;
    const MAX_H = 380; // no más de ~media página, para que respire
    if (h > MAX_H) { h = MAX_H; w = h / ratio; }
    const x = MARGIN + (CONTENT_W - w) / 2;

    ensure(h + 22);
    try {
      doc.addImage(cap.dataUrl, 'JPEG', x, y, w, h);
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.8);
      doc.rect(x, y, w, h);
    } catch { /* si la imagen falla, seguimos con el texto */ }
    y += h + 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 140, 140);
    doc.text(leyenda, PAGE_W / 2, y + 8, { align: 'center' });
    y += 20;
  }

  // ───────── Portada / bienvenida ─────────
  const LOGO = 92;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'JPEG', (PAGE_W - LOGO) / 2, y, LOGO, LOGO); } catch { /* logo opcional */ }
  }
  y += LOGO + 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(NARANJA[0], NARANJA[1], NARANJA[2]);
  doc.text('Manual de Usuario', PAGE_W / 2, y, { align: 'center' });
  y += 26;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(GRIS_TEXTO[0], GRIS_TEXTO[1], GRIS_TEXTO[2]);
  doc.text('Sistema de Gestión · GOLDEN TOUCH 1127 C.A.', PAGE_W / 2, y, { align: 'center' });
  y += 40;

  // Mensaje de bienvenida (recuadro).
  const bienvenida = 'Bienvenido al manual de usuario del sistema de gestión de la empresa GOLDEN TOUCH 1127 C.A.';
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(13);
  const bLines = doc.splitTextToSize(bienvenida, CONTENT_W - 40) as string[];
  const boxH = bLines.length * 20 + 28;
  doc.setFillColor(255, 244, 230);
  doc.setDrawColor(NARANJA[0], NARANJA[1], NARANJA[2]);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 8, 8, 'FD');
  doc.setTextColor(120, 70, 0);
  let by = y + 24;
  bLines.forEach((line) => {
    doc.text(line, PAGE_W / 2, by, { align: 'center' });
    by += 20;
  });
  y += boxH + 36;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(GRIS_TEXTO[0], GRIS_TEXTO[1], GRIS_TEXTO[2]);
  const presentacion =
    'Este documento explica, pantalla por pantalla, cómo usar el sistema de manera sencilla. ' +
    'Si recién empezás, te recomendamos leerlo en orden; si ya lo conocés, podés ir directo a la sección que necesites. ' +
    'Recordá que cada usuario ve solo los módulos que su rol tiene habilitados, por lo que es posible que algunas pantallas no aparezcan en tu menú.';
  const pLines = doc.splitTextToSize(presentacion, CONTENT_W) as string[];
  pLines.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 16;
  });

  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text(`Generado el ${dateTime(new Date().toISOString())}`, MARGIN, BOTTOM);

  // ───────── Secciones por pantalla ─────────
  doc.addPage();
  y = MARGIN;

  SECCIONES.forEach((s, idx) => {
    // Título de sección con barra naranja a la izquierda.
    ensure(46);
    const headH = 26;
    doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2]);
    doc.rect(MARGIN, y, 4, headH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30, 30, 30);
    doc.text(`${idx + 1}. ${s.icono}  ${s.titulo}`, MARGIN + 14, y + 18);
    y += headH + 8;

    texto(s.intro, 10.5, 'normal');
    y += 4;

    // Captura de pantalla de la vista (si se pudo tomar en vivo).
    const cap = s.captura ? capturas[s.captura] : undefined;
    if (cap) captura(cap, `Vista de “${s.titulo}”`);

    s.puntos.forEach((p) => bullet(p));
    y += 14;
  });

  // ───────── Consejos finales ─────────
  ensure(46);
  doc.setFillColor(NARANJA[0], NARANJA[1], NARANJA[2]);
  doc.rect(MARGIN, y, 4, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text('Consejos rápidos', MARGIN + 14, y + 18);
  y += 34;
  CONSEJOS.forEach((c) => bullet(c));

  // ───────── Pie de página con numeración ─────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('GOLDEN TOUCH 1127 C.A. · Manual de Usuario', MARGIN, PAGE_H - 28);
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 28, { align: 'right' });
  }

  previewPdf(doc, 'Manual-de-Usuario-GOLDEN-TOUCH-1127-CA.pdf');
}
