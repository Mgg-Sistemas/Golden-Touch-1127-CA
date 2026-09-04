-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Un producto activo no puede repetir nombre, con tilde o sin tilde
--
-- QUÉ PASABA
-- `productos` no tenía unicidad por nombre. Así nacieron los 25 pares
-- CAJA/UND del catálogo de repuestos y los dos «plátano». Nada impedía que
-- mañana alguien cargara «PLATANO» de nuevo al lado de «PLÁTANO», ni
-- «CAMION 350» junto a «CAMIÓN 350».
--
-- QUÉ CAMBIA
-- Índice único sobre `sin_acentos(nombre)` para los productos ACTIVOS. El
-- nombre se sigue guardando y mostrando con su tilde; lo que ya no se puede
-- es tener dos productos activos que solo se diferencien en el acento o en
-- las mayúsculas.
--
-- POR QUÉ SOLO LOS ACTIVOS
-- Los 25 gemelos vacíos y el HOR-007 recién unificado quedaron INACTIVOS a
-- propósito, para no perder su historial. Un índice sobre toda la tabla
-- chocaría con ellos y obligaría a borrarlos de verdad. Acotarlo a los
-- activos protege lo que importa —lo que la gente ve y elige— sin tocar el
-- archivo histórico. Y si alguien reactiva un gemelo cuyo nombre ya está en
-- uso, el índice lo frena en ese momento, que es exactamente cuando importa.
--
-- SEGURIDAD DE LA MIGRACIÓN
-- Verificado inmediatamente antes de aplicar: cero colisiones entre los
-- productos activos (la consulta de control devolvió lista vacía).
-- ═══════════════════════════════════════════════════════════════════

create unique index if not exists productos_nombre_sin_acentos_activos
  on public.productos (public.sin_acentos(nombre))
  where estado = 'activo';


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'productos_nombre_sin_acentos_activos')            as indice_creado,
  (select count(*) from public.productos where estado = 'activo')         as productos_activos,
  (select count(*) from (
     select 1 from public.productos where estado = 'activo'
      group by public.sin_acentos(nombre) having count(*) > 1) x)         as colisiones;
