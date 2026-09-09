-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Servicios de mantenimiento: hay que DECLARAR si lleva repuesto del inventario
--
-- ── DE DÓNDE SALE ESTO ───────────────────────────────────────────
-- Se quiere poder ver, desde un equipo, qué insumos y repuestos del inventario
-- le corresponden y cuántos hay. Al mirar el terreno apareció que el gancho ya
-- existe: los renglones de servicio tienen `insumo_producto_id`, un buscador
-- que elige el producto del inventario, y `equipo_id`. Equipo y producto
-- quedan atados en el mismo renglón.
--
-- El problema es que nadie lo usa. Contado en los datos:
--
--   MANTENIMIENTO   29 renglones,  0 con insumo
--   RECARGA         12 renglones,  0 con insumo
--   OTRO             9 renglones,  3 con insumo
--
-- El campo fue hecho para mantenimiento y en mantenimiento está vacío las 29
-- veces. Es un campo opcional en un formulario de trabajo: no se llena. Lo
-- mismo que pasó con el motivo de los movimientos de inventario, que tenía 120
-- casos vacíos.
--
-- ── LO QUE NO SE HACE, Y ES LA PARTE IMPORTANTE ──────────────────
-- La reacción fácil era volver el insumo OBLIGATORIO. Está mal, y los datos lo
-- dicen: de los 29 renglones de mantenimiento, la enorme mayoría son
-- «🛠 Reparación», «🔧 Servicio / preventivo» y un «DIAGNÓSTICO». Son mano de
-- obra: no llevan una pieza del almacén. Solo dos hablan de piezas
-- («⚙ Cambio de pieza», «🔩 Repuestos»).
--
-- Obligar a elegir un producto donde no hay producto empuja a la gente a poner
-- cualquier cosa con tal de guardar. Eso no llena el catálogo: lo envenena. Y
-- un catálogo de repuestos con datos inventados es peor que no tenerlo, porque
-- se le cree.
--
-- ── LO QUE SÍ SE HACE ────────────────────────────────────────────
-- Se vuelve obligatoria la DECISIÓN, no el dato. En un renglón de
-- mantenimiento hay que elegir una de dos:
--   · el insumo del inventario que se usó, o
--   · marcar «no lleva repuesto del inventario».
--
-- No hay tercera opción: dejarlo en blanco y seguir ya no se puede. La
-- diferencia con el campo opcional de hoy es que la ausencia pasa a ser una
-- respuesta deliberada y no un descuido, y eso se puede leer después: sabremos
-- qué servicios consumen repuesto y cuáles son solo mano de obra. Ese es el
-- dato que hoy no existe y sin el cual el catálogo por equipo no se puede
-- armar.
--
-- ── ALCANCE EXACTO ───────────────────────────────────────────────
-- Solo los renglones cuya categoría es EXACTAMENTE 'MANTENIMIENTO'. Se compara
-- por igualdad y no por «empieza con», a propósito: existe la categoría
-- 'MANTENIMIENTO DE ELECTRODOMÉSTICOS', que empieza igual y NO entra —ahí el
-- material casi nunca sale del almacén de repuestos—. Las recargas de gas,
-- oxígeno y extintores tampoco entran: no consumen inventario, consumen
-- bombonas.
--
-- Aplica a las dos puertas por las que entra un servicio, porque si se cierra
-- una sola la otra queda de atajo:
--   · `ordenes.items`            → Solicitud de Servicio (SS → CS)
--   · `servicios_directos.items` → Servicio Directo
--
-- Verifiqué que ningún renglón de PRODUCTO (no servicio) usa esa categoría, así
-- que las órdenes de compra normales no se ven afectadas.
--
-- ── POR QUÉ UNA FUNCIÓN Y NO UN CHECK A SECAS ────────────────────
-- Los renglones viven en un arreglo JSON, y para recorrerlo hace falta una
-- función que expande el arreglo. Un CHECK no admite eso directamente, así que
-- la condición va en una función IMMUTABLE y el CHECK la llama.
--
-- Se compara `sin_insumo` como TEXTO ('true') en vez de convertirlo a booleano:
-- si alguna fila vieja trajera ahí un valor raro, la conversión reventaría al
-- validar toda la tabla. Comparar texto no falla nunca.
--
-- ── `NOT VALID`, como siempre ────────────────────────────────────
-- Los 29 renglones de mantenimiento que ya existen no declaran nada y no se
-- tocan: son historia y no se reescribe. La regla rige de acá en adelante.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.servicio_mantenimiento_declara_insumo(p_items jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select not exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
     where coalesce(it->>'categoria_servicio', it->>'categoria') = 'MANTENIMIENTO'
       and coalesce(it->>'insumo_producto_id', '') = ''
       and coalesce(it->>'sin_insumo', 'false') <> 'true'
  );
$$;

comment on function public.servicio_mantenimiento_declara_insumo(jsonb) is
  'Cierto si NINGUN renglon de mantenimiento quedo sin declarar: cada uno trae el insumo del inventario o la marca de que no lleva repuesto. Usada por el CHECK de ordenes.items y servicios_directos.items.';

-- ── Solicitud de Servicio (SS → CS) ──────────────────────────────
alter table public.ordenes
  drop constraint if exists mantenimiento_declara_insumo;

alter table public.ordenes
  add constraint mantenimiento_declara_insumo
  check (public.servicio_mantenimiento_declara_insumo(items)) not valid;

-- ── Servicio Directo ─────────────────────────────────────────────
alter table public.servicios_directos
  drop constraint if exists mantenimiento_declara_insumo;

alter table public.servicios_directos
  add constraint mantenimiento_declara_insumo
  check (public.servicio_mantenimiento_declara_insumo(items)) not valid;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- Las dos reglas puestas y sin validar, y cuántos renglones viejos quedan sin
-- declarar (los que la regla perdona).
-- ═══════════════════════════════════════════════════════════════════
select t.relname                                     as tabla,
       c.conname                                     as regla,
       c.convalidated                                as valida_lo_viejo,
       (select count(*)
          from (select items from public.ordenes
                union all
                select items from public.servicios_directos) x,
               jsonb_array_elements(coalesce(x.items,'[]'::jsonb)) it
         where coalesce(it->>'categoria_servicio', it->>'categoria') = 'MANTENIMIENTO'
           and coalesce(it->>'insumo_producto_id','') = ''
           and coalesce(it->>'sin_insumo','false') <> 'true') as viejos_sin_declarar
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
 where c.conname = 'mantenimiento_declara_insumo'
 order by t.relname;
