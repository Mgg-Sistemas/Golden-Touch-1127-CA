-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 03/09/2026
-- Salidas de material · «Sede origen» pasa a ser editable
--
-- QUÉ PASABA
-- En el formulario de salida de material, «Sede origen» era un desplegable con
-- una sola opción, `Peramanal`, y encima deshabilitado. Estaba escrito a mano en
-- el JSX y NO se guardaba en ningún lado: la solicitud no tiene dónde anotar de
-- qué sede salió el material. Era decoración.
--
-- (`almacen_origen` no sirve para esto: es el ALMACÉN, y desde que el inventario
-- quedó único vale siempre «General». La sede es otra cosa.)
--
-- QUÉ CAMBIA
--   1. `pedido_catalogos` admite el tipo `sede_origen`, así las sedes se cargan
--      y se mantienen desde la misma pantalla de catálogos que ya usan las
--      unidades solicitantes — sin tocar código para agregar una sede nueva.
--   2. Se siembra `Peramanal`, que es la sede que había fija.
--   3. `solicitudes_salida` gana la columna `sede_origen`, para que el dato
--      quede guardado de verdad.
--   4. Las solicitudes que ya existen se rellenan con `Peramanal`: es de donde
--      salieron, porque hasta hoy no había otra opción posible.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1 · El catálogo admite el tipo nuevo
-- ───────────────────────────────────────────────────────────────────
alter table public.pedido_catalogos
  drop constraint if exists pedido_catalogos_tipo_check;

alter table public.pedido_catalogos
  add constraint pedido_catalogos_tipo_check
  check (tipo = any (array['clasificacion','unidad_solicitante','sede_origen']));


-- ───────────────────────────────────────────────────────────────────
-- 2 · Se siembra la sede que estaba fija en el código
-- ───────────────────────────────────────────────────────────────────
insert into public.pedido_catalogos (tipo, valor, activo, orden)
values ('sede_origen', 'Peramanal', true, 0)
on conflict (tipo, valor) do nothing;


-- ───────────────────────────────────────────────────────────────────
-- 3 · La solicitud guarda de qué sede salió
-- ───────────────────────────────────────────────────────────────────
alter table public.solicitudes_salida
  add column if not exists sede_origen text;


-- ───────────────────────────────────────────────────────────────────
-- 4 · Relleno del histórico
--     Hasta hoy Peramanal era la única opción posible, así que es de donde
--     salieron todas. Solo se tocan las que están en null.
-- ───────────────────────────────────────────────────────────────────
update public.solicitudes_salida
   set sede_origen = 'Peramanal'
 where sede_origen is null;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select pg_get_constraintdef(c.oid)
     from pg_constraint c
    where c.conrelid = 'public.pedido_catalogos'::regclass
      and c.conname  = 'pedido_catalogos_tipo_check')                       as tipos_permitidos,
  (select count(*) from public.pedido_catalogos where tipo = 'sede_origen') as sedes_en_catalogo,
  (select count(*) from public.solicitudes_salida)                          as solicitudes,
  (select count(*) from public.solicitudes_salida where sede_origen is null) as sin_sede;
