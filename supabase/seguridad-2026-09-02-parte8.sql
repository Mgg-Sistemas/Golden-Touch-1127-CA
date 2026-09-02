-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 8
-- GT-INT-02 · Eliminar una orden de compra: doble reverso
--
-- QUÉ PASA
-- `eliminarOrdenCompra` devuelve la plata a caja, revierte el stock y recién al
-- final borra la orden. El orden está bien pensado —si se corta la conexión, la
-- base queda consistente y se puede reintentar— pero no hay nada que impida
-- correrlo DOS VECES sobre la misma orden.
--
-- Y correrlo dos veces no es raro: un doble clic, o dos personas mirando la
-- misma lista. La reversión de plata inserta un ingreso de auditoría, pero NO
-- marca el egreso original como revertido. Así que la segunda pasada vuelve a
-- encontrar los mismos egresos y devuelve la plata OTRA VEZ: la caja termina
-- con dinero que nunca existió.
--
-- QUÉ CAMBIA
-- Una marca `eliminando_at`. Antes de revertir nada, el borrado hace:
--     update ordenes set eliminando_at = now()
--      where id = ? and eliminando_at is null
-- Si no toma ninguna fila, otra persona ya está en eso y se detiene sin tocar
-- caja ni stock. Si algo falla después, la marca se limpia y la orden queda
-- intacta para reintentar — por eso es una marca y no el borrado de la fila:
-- reservar destruyendo se llevaría por delante ofertas, abonos y chat (caen en
-- cascada) y no habría vuelta atrás.
--
-- Es nullable y sin default: las órdenes que ya existen quedan en NULL, o sea
-- disponibles, que es lo correcto.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ordenes
  add column if not exists eliminando_at timestamptz;

comment on column public.ordenes.eliminando_at is
  'Reserva del borrado (GT-INT-02): marcada mientras se revierte plata y stock. NULL = disponible.';


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select case
         when count(*) = 1 then 'OK · columna eliminando_at creada'
         else 'FALTA · la columna no esta'
       end as estado
from information_schema.columns
where table_schema = 'public' and table_name = 'ordenes' and column_name = 'eliminando_at';
