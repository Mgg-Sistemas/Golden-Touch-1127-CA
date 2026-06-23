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
      'Barra superior: contiene el buscador general y la campana de notificaciones.',
      'Buscador general: escribí cualquier producto, proveedor u orden y el sistema lo encuentra en todo el sistema; al hacer clic en un resultado te lleva directo a su detalle.',
      'Campana de notificaciones (◔): te avisa, por ejemplo, cuando un producto está por agotarse. El número rojo indica cuántos avisos sin leer tenés.',
      'Tiempo real: el sistema es multiusuario y se actualiza solo. Lo que registra un usuario (una entrada, una orden, un movimiento de caja, etc.) aparece automáticamente en la pantalla de los demás, sin necesidad de recargar.',
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
      'Nuevo producto: al crearlo, el SKU se genera solo y de forma correlativa según la categoría (por ejemplo LUB-001, LUB-002 para Lubricantes). No hace falta inventarlo a mano.',
      'Detalle del producto (opcional): al crear/editar se pueden cargar nombre de búsqueda/alias (ej.: CLORO), marca, modelo, N°, serial, código, ubicación y descripción. El buscador encuentra el producto también por estos datos y todos se ven en su detalle.',
      'Cada producto guarda su stock por almacén y su costo promedio ponderado (PMP), que se actualiza automáticamente con cada compra o entrada. Los campos de precio/costo admiten decimales menores a 1 (ej. 0,35) y aceptan coma o punto como separador.',
      'Movimientos: se pueden registrar entradas, salidas, transferencias y ajustes; el sistema lleva el historial completo (kardex) de cada producto.',
      'Detalle del producto: muestra su ficha completa y todos sus movimientos; permite descargar su trazabilidad en PDF.',
      'Alertas de stock: el sistema marca en rojo los productos por debajo del mínimo para que sepas qué reponer.',
      'Almacenes: se pueden ver en formato lista o en tarjetas (kanban) con totales de productos, productos usados y consumo diario.',
      'Renombrar la sede: cada tarjeta de sede tiene un botón (lápiz) para renombrarla; el nuevo nombre se aplica a todos sus almacenes y subalmacenes (es solo la etiqueta de agrupación, no afecta el stock).',
      'Recepciones (botón del inventario): el número del botón cuenta solo las órdenes PENDIENTES por marcar la recepción (contra entrega lista para recibir o ya pagadas y aún sin recibir). Cuando la recepción se finaliza deja de contar; las finalizadas se siguen viendo en la lista, pero sin sumar al número del botón.',
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
      'Solicitud de pedido (pestaña Solicitud de Pedido): es la solicitud interna de lo que se necesita. La Unidad solicitante se elige de un desplegable con las unidades del catálogo (en vivo); si no está, se escribe en "¿No está? Escribí la unidad nueva…" y con "+ Añadir" se guarda de una vez en el catálogo y queda seleccionada. El Solicitante (persona) es editable: un analista puede registrar la solicitud a nombre de otra persona o unidad; ambos se muestran en el detalle y el PDF. Al agregar un producto nuevo se elige el almacén/sub-almacén destino y la unidad desde una lista. Por cada producto se carga su finalidad (¿para qué se compra?). Se puede agregar una Nota opcional; los campos de texto se guardan en mayúscula. El botón Categorías gestiona (agregar, filtrar, editar, activar/desactivar) las unidades solicitantes; al escribir una unidad nueva en la OP se guarda sola. La pestaña Unidades solicitantes muestra una columna Categoría que se puede editar al editar cada unidad. Al aprobarla, el detalle y el PDF muestran quién la aprobó y cuándo. APROBAR es exclusivo del rol Administrador (tanto la Solicitud de Pedido como la firma de la OC): los analistas gestionan el resto del ciclo (ofertas, emitir/confirmar OC, recepción), pero el botón Aprobar solo lo ve y ejecuta el administrador, y está reforzado en la base de datos (si no es admin, la base lo rechaza).',
      'Realizar OC (Orden de Compra): convierte el pedido en una compra a un proveedor. Antes de emitirla se eligen los documentos que la acompañan: Nota de entrega y/o Nota de despacho.',
      'Compra a varios proveedores (multiproveedor): una misma Solicitud de Pedido (SP) se puede repartir entre varios proveedores; el sistema genera una Orden de Compra por proveedor, todas casadas a la misma SP (códigos SP-AAAA-####-1, -2…, cada una con su propio código OC). La SP madre queda repartida y cada OC sigue su flujo por separado (aprobación, método de pago, Tesorería y PDF).',
      'Indicar método de pago: cuando la OC está "Confirmada (indicar método de pago)" se eligen el/los método(s) de pago y el tipo de soporte (Nota de entrega / Factura). En multipago se puede REPARTIR EL TOTAL POR MONEDA: indicar cuánto en $ va por cada método (p. ej. $100 en divisas + $6 en Bs); el sistema valida que la suma cuadre con el total de la OC. Si los montos quedan en 0, el monto lo define Tesorería al pagar. En ese paso también se puede CAMBIAR EL PROVEEDOR de la OC: como cambia el proveedor adjudicado, la OC VUELVE A APROBACIÓN DEL GERENTE GENERAL (no se envía a pagar en ese momento); los ítems y el total se mantienen. Tras la nueva aprobación se vuelve a indicar el método de pago.',
      'Modificar una OC pendiente por cargar método de pago: aunque el GG ya la haya firmado, en el estado "Confirmada (indicar método de pago)" se puede volver a Editar la OC (ítems, cantidades, motivo, finalidad). Al guardar, la OC VUELVE AUTOMÁTICAMENTE a aprobación del Gerente General (pasa a OC por confirmar y se limpia la firma previa) y sale de Tesorería hasta que el GG la apruebe de nuevo. Queda en el historial.',
      'Pago en Tesorería (Órdenes pendientes por pagar): al abrir una OC para pagar se ve un resumen de la orden (solicitante, unidad solicitante, finalidad, motivo y notas), la condición de pago y la conversión $ ⇄ Bs. Si la caja es Multimoneda, la grilla de multipago por cuenta se prellena respetando el reparto por moneda que indicó Compras (cada moneda con lo que le toca, p. ej. $100 en divisas + $6 en Bs) en vez de cargar todo en una sola; igual se puede ajustar a mano. Multipago ENTRE CAJAS: si una sola caja no alcanza, con "+ Añadir otra caja" se suman cuentas/monedas de otras cajas hasta cubrir el total (un egreso por cuenta, cada uno de su propia caja). El pago se puede anclar a un gasto eligiendo categoría → subcategoría (listas buscables/filtrables), para que quede etiquetado como gasto además de pago de OC.',
      'Pagar varias OC del mismo proveedor: en el listado de órdenes por pagar se marcan varias con casillas (✓) y, si son del mismo proveedor, se pagan juntas desde una sola caja (un egreso por OC). En el modal, al hacer clic sobre cada OC se despliega su detalle (solicitante, unidad, finalidad, motivo, notas y fechas). Funciona incluso con las que están "Esperando método de pago" (no hace falta esperar a que Compras indique el método).',
      'Resumen PDF de OC por pagar: un botón genera, con vista previa, un reporte con N°OC, proveedor, finalidad, notas, estado y monto, con el total general.',
      'Chat con Compras desde Tesorería: el detalle de pago de una OC incluye un chat interno que es el MISMO hilo de la orden en Pedidos. Tesorería y el analista de compras conversan ahí (coordinar método de pago, aclarar la orden) en tiempo real; las OC con mensajes sin leer muestran un chip 💬 en el listado y cada mensaje notifica a la otra parte.',
      'Libro Mayor (por moneda): al tocar una moneda se ve el detalle de sus movimientos (fecha, caja, concepto, beneficiario/motivo, Debe, Haber, saldo) con totales Debe / Haber / Neto y un botón para descargar el reporte en PDF (con vista previa).',
      'Recepción: cuando llega la mercadería se registra la entrada, y el inventario se actualiza solo con su costo.',
      'Trazabilidad: cada orden tiene una línea de tiempo con todo lo que ocurrió (creación, emisión, documentos, recepción, etc.).',
      'Si un proveedor desiste, se registra la fecha, la hora y el motivo; eso queda reflejado en el PDF de la orden.',
      'Editar y cancelar la OC: en la etapa "Pendiente (cargar ofertas)", desde el detalle de la tarjeta se puede Editar OC (cambiar cantidades, agregar/quitar ítems, EDITAR EL NOMBRE de un producto —se sincroniza con el inventario—, agregar productos nuevos que no existen en inventario, marcar cuáles se compran, motivo y finalidad) mientras no haya una oferta con precio. Al editar también se puede ver, REEMPLAZAR o QUITAR la imagen o PDF adjunto de la solicitud (máx. 10 MB). Las órdenes canceladas quedan en la columna Cancelada (en rojo) del kanban de Órdenes de Compra.',
      'Cancelar una OC ya aprobada: una OC aprobada por el gerente (o con el proveedor desistido) se puede cancelar mientras aún no se haya pagado, con el botón "Cancelar OC". El sistema exige el motivo, que se imprime en el PDF de la OC (banner rojo "Orden de Compra Cancelada" con el motivo, quién la canceló y cuándo). Una OC ya pagada o recibida no se cancela.',
      'Compra directa: las compras sin proceso de aprobación pueden asociar un proveedor con buscador; si no existe, se agrega en el momento y queda guardado en el directorio de Proveedores. Cada compra directa recibe un correlativo propio (CD-AAAA-####) visible en la tarjeta, la lista y el PDF. Al cargar la factura y elegir la caja se muestra su billetera (saldo disponible, por moneda si es Multimoneda) y el gasto se descuenta del saldo de esa caja (el mismo que se ve en Cajas/Tesorería). Una compra directa En proceso se puede eliminar con el botón Eliminar (las Finalizadas no, porque ya movieron dinero e inventario).',
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
      'Comparación por producto (Bs vs USD): en cada oferta se cargan dos precios en $ por producto — Pago en Bs a BCV y Pago en USD — más un descuento por producto; el sistema calcula el total de cada columna, la diferencia (Bs − USD) y la variación %. Se ve al cargar y al desplegar la oferta, y en el PDF de trazabilidad.',
      'Adjuntos de la oferta: se pueden subir varios archivos (PDF y/o varias fotos de la cotización, máx. 10 MB c/u); el jefe puede verlos todos desde la comparativa.',
      'Editar una oferta cargada: mientras la oferta esté Pendiente (no aceptada), al desplegarla en la comparativa aparece "Editar oferta", que abre el formulario prellenado para corregir proveedor, marca, modelo, cantidad y montos (Bs/USD), condiciones, ficha y notas, y agregar más adjuntos.',
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
      'Salida de material: despacha materiales del inventario. Permite varios materiales en una misma solicitud (como una OC en OP): se arma un carrito con "＋ Agregar material", cada renglón con su producto y cantidad, y al pie se ve el Total. No se elige almacén: el buscador muestra todos los materiales con stock (cada uno con su almacén) y al ejecutar cada material se descuenta del almacén que le corresponde (pueden salir de almacenes distintos). Se aprueba/ejecuta de una sola vez. Ya no pide "a quién va dirigido": solo descuenta el inventario. El precio unitario está anclado al VALOR del material: es el costo (PMP) de ese almacén y no se edita (una caja de 10 lápices que costó $100 vale $10 c/u; al sacar 1, los 9 restantes valen $90). Lleva un selector de Unidad solicitante igual al de la OP, con el mismo catálogo (sincronizado en vivo) y opción de añadir una unidad nueva.',
      'Traslado de material: mueve materiales entre almacenes dentro de la Sede Peramanal (origen → destino), conservando el costo (PMP) del origen (precio anclado, no editable). Igual que la salida, permite varios materiales en una misma solicitud (carrito con "＋ Agregar material"), todos del mismo origen hacia el mismo destino. También lleva el selector de Unidad solicitante del catálogo de OP.',
      'Transporte y destino: en la creación se cargan el Chofer / responsable (nombre, apellido y cédula) y el Vehículo (descripción y placa), ambos buscables desde un catálogo gestionable (alta rápida con "＋ Nuevo" y edición/desactivación/eliminación con el botón ⚙; los desactivados no aparecen). También se indican la Dirección de despacho y la Dirección de destino. Todo se imprime en la Orden de Salida y se ve en el detalle.',
      'Consumo interno: una casilla marca la salida/traslado como consumo interno (el material se queda en la empresa); se refleja en el detalle, en la trazabilidad y en el PDF.',
      'Resumen por unidad solicitante: el botón "Resumen por unidad" muestra el gasto de material agrupado por la unidad que lo solicitó (salidas ejecutadas), con gráfico de barras y tabla; al tocar una barra o fila se ve el detalle (fecha, hora, quién solicitó, material, cantidad y monto en $). Es filtrable por fechas, se actualiza en vivo y se exporta a PDF, Excel o correo.',
      '"A quién va dirigido": aplica a la salida de dinero (interruptor: Almacén despliega los almacenes registrados más "Consumo Interno"; Persona despliega la lista de usuarios con nombre, apellido y cargo). La salida de material ya no lo usa.',
      'Salida de dinero: es un adelanto que sale de una caja (en USD o Bs) y queda en estado "pendiente".',
      'Conciliación con mineral: la salida de dinero pendiente se "casa" después con la recepción del mineral equivalente (cantidad, costo por KG/G y descripción), que ingresa al inventario.',
      'Traslado de dinero: mueve saldo entre cajas de la misma moneda.',
      'Cajas: se administran desde el botón de cajas (crear, renombrar, habilitar/deshabilitar y ajustar saldo).',
      'Cada salida queda en un historial; al hacer clic se ve su detalle, con opción de PDF y trazabilidad. El PDF se genera solo cuando lo pedís con el botón.',
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
      'Tanques — Tasa fija: la tasa USD/L del tanque NO varía sola (no se promedia). Solo cambia cuando se edita la tasa del tanque (botón ✎), y al cambiarla se re-valorizan todos sus movimientos a la nueva tasa. La vista de inicio agrupa los tanques bajo su banner: los del grupo general bajo "Combustible disponible" y los Brasileros bajo "Los Brasileros".',
      'Tanques — Tipos de movimiento: Entrada (entra combustible y se valoriza a la tasa fija del tanque; la primera entrada de un tanque sin tasa la fija con el costo informado), Uso (un equipo consume y descuenta a la tasa del tanque) y Traslado (sale a otra mina o a otro tanque; si es a otro tanque, se acredita allí a la tasa del origen).',
      'Tanques — Libro mayor (mes en curso): la tabla muestra solo los movimientos del mes actual. Cada fila guarda fecha, hora, equipo, autorizado por, destino, observación, los litros y el saldo corrido en ltrs y USD, más el horómetro final (HF) y el contador final del surtidor. La tabla oculta Tanque, HI (horómetro inicial), Cont. ini y Tasa: esos datos siguen en Ver detalle. La columna de litros se rotula "Saldo ltrs".',
      'Tanques — Ver / editar movimiento: el botón Ver permite editar todo el movimiento (tipo, litros, tasa, fecha, hora, equipo, autorizado, destino, observación y medidores). Si se cambian tipo, litros o tasa se recalcula el saldo del tanque. Si se cambia la fecha u hora, el movimiento cambia de lugar en la línea de tiempo y el sistema re-encadena los medidores: el contador inicial del surtidor (por tanque) y el horómetro inicial (por equipo) vuelven a colgar del valor final del movimiento anterior, conservando lo registrado en cada uno.',
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
      'Cierres de caja: la caja se maneja por períodos (cada "cierre" tiene número, rango de fechas y recepción asociada). Al cerrar, se calcula el resumen del cierre: días transcurridos, total gastado, distribución del gasto por categoría y tasa promedio.',
      'Clasificación de costos (2 niveles): cada gasto puede etiquetarse con una Clasificación y una Sub-clasificación (ej. "Costos de Extracción y acarreo" → "Gastos de Combustible") para el análisis de costos del cierre.',
      'Cuadre Efectivo: cuadre de caja en efectivo (lo que entrega el proveedor de caja). Se cuenta el efectivo por billetes para verificarlo, se cargan las salidas categorizadas (nómina, compras, adelantos), se lleva el saldo corriente y se controlan los vales/deudas pendientes.',
      'Procesos: las demás hojas del Excel (resúmenes, registros de cuadrillas, mesa seca, consumo de martillos) se muestran como vistas del sistema y se van convirtiendo en módulos interactivos.',
    ],
  },
  {
    icono: '🚜',
    titulo: 'Control de Maquinaria',
    intro:
      'Registro y control de la maquinaria y equipos: ficha técnica, bitácora de horómetro/mantenimiento, alertas de mantenimiento preventivo y reportes.',
    puntos: [
      'Catálogo (botón 🏷): 3 pestañas — Tipo de maquinaria, Propietario y Status (ACTIVO, MANTENIMIENTO, FUERA DE SERVICIO, INACTIVO). Se puede agregar, filtrar, editar, desactivar/activar y eliminar; nombres en MAYÚSCULA, sin duplicados.',
      'Registro de equipos (+ Nuevo equipo): ficha técnica completa (tipo, propietario, status, ubicación, año, marca, modelo, color, serial, placa, motor, combustible, litros, frecuencia de mantenimiento preventivo cada N horas y documentación). La Última ubicación es un buscador que toma las ubicaciones de Combustible (o se escribe una nueva). Tabla con búsqueda tolerante a acentos, edición, activar/desactivar y eliminar.',
      'HRS acumuladas y alerta: la tabla muestra las HRS acumuladas (suma de las horas trabajadas, del horómetro vigente) y cuántas faltan para el próximo mantenimiento. El equipo se marca con ⚠️ solo cuando está cerca de cumplir su servicio (dentro del 10% del intervalo; ej.: cada 250 h avisa con ≤ 25 h), no desde la primera hora. Las horas acumuladas se traen de Combustible si el equipo está vinculado. El gráfico «Equipos por status» del Resumen es clickeable. Los equipos no se borran: «Desactivar» los deja inactivos (se ven con «Ver inactivos» y se reactivan con «Activar»).',
      'Bitácora / horómetro (🔧): registro cronológico (fecha, horómetro, aceite, refrigerante, gasoil, trabajo, mecánico, ubicación). Las HRS. trabajadas (lectura − lectura anterior) y el consumo Lts/h (gasoil ÷ HRS) se calculan solos, igual que el Excel. Avisa cuando el período supera la frecuencia de mantenimiento.',
      'Tipo de mantenimiento (trazabilidad): dentro del botón 🔧 cada registro indica su tipo — Cambio de aceite, Cambio de pieza, Cambio de filtro, Servicio/preventivo, Reparación, Inspección, Lectura de horómetro u Otro. Al elegir "Cambio de pieza" se habilita el campo "Pieza cambiada" (ej. MOTOR, BOMBA HIDRÁULICA). El tipo y la pieza quedan en la columna Tipo de la bitácora, con la trazabilidad completa del historial de cada equipo.',
      'Resumen (📊): gráficas de gasoil por equipo y por status, y tabla de mantenimiento preventivo (⚠️ Toca servicio). Filtrable por fechas. La gráfica de gasoil es dinámica: al hacer click sobre un equipo se abre su detalle (consumo y valor del período, último horómetro, horas del período y ficha técnica).',
      'Reportes: el registro de equipos se descarga en PDF y Excel y se envía por correo.',
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
