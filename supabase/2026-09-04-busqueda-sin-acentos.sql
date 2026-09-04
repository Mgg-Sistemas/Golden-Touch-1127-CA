-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Buscar sin importar los acentos
--
-- QUÉ PASABA
-- Buscar «camion» no encontraba «CAMIÓN», y «MARIA» no encontraba «MARÍA».
-- La gente escribe sin acentos (sobre todo desde el teléfono) y el sistema le
-- decía que no existía. En el buscador global esto es server-side: el `ilike`
-- de Postgres distingue mayúsculas pero NO acentos — `Ó` y `O` son letras
-- distintas para él.
--
-- QUÉ CAMBIA
--   1. Se instala `unaccent`, la extensión que quita diacríticos.
--   2. `public.sin_acentos(texto)` deja el texto en minúscula y sin acentos.
--      Se marca IMMUTABLE a propósito (ver nota abajo) para poder usarla en
--      columnas generadas e índices.
--   3. Las tres columnas donde de verdad hay acentos ganan una columna espejo
--      `*_busq`, calculada por la base, que el buscador consulta en vez del
--      campo original. El dato original NO se toca: se sigue guardando y
--      mostrando «CAMIÓN» con su acento; lo que cambia es contra qué se compara.
--
-- POR QUÉ COLUMNA GENERADA Y NO unaccent() EN LA CONSULTA
-- El cliente habla con PostgREST, que no permite llamar funciones dentro de un
-- filtro. Con la columna espejo el filtro sigue siendo un `ilike` común.
-- Además, al calcularla la base, nunca se puede desincronizar del original.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1 · La extensión (en el esquema `extensions`, como el resto en Supabase)
-- ───────────────────────────────────────────────────────────────────
create extension if not exists unaccent with schema extensions;


-- ───────────────────────────────────────────────────────────────────
-- 2 · Normalizador único: minúscula + sin acentos
--
-- NOTA SOBRE IMMUTABLE
-- `unaccent(text)` es STABLE, no IMMUTABLE, porque resuelve el diccionario de
-- búsqueda por configuración y ese valor podría cambiar. Postgres, por eso,
-- rechaza usarla en una columna generada o en un índice.
-- La forma de dos argumentos —`unaccent('extensions.unaccent', txt)`— fija el
-- diccionario explícitamente, así que el resultado SÍ es determinista y la
-- envoltura se puede declarar IMMUTABLE sin mentir.
-- ───────────────────────────────────────────────────────────────────
create or replace function public.sin_acentos(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = extensions, public, pg_temp
as $$
  select lower(extensions.unaccent('extensions.unaccent', txt))
$$;

comment on function public.sin_acentos(text) is
  'Minúscula y sin acentos. Para comparar/buscar texto sin que el acento importe. '
  'IMMUTABLE gracias a la forma de 2 argumentos de unaccent (diccionario fijo).';

grant execute on function public.sin_acentos(text) to anon, authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- 3 · Columnas espejo para el buscador global
--     Solo donde de verdad aparecen acentos: nombres y razones sociales.
--     (SKU, RIF, código y correo son ASCII; no hace falta.)
-- ───────────────────────────────────────────────────────────────────
alter table public.productos
  add column if not exists nombre_busq text
  generated always as (public.sin_acentos(nombre)) stored;

alter table public.proveedores
  add column if not exists razon_social_busq text
  generated always as (public.sin_acentos(razon_social)) stored;

alter table public.usuarios
  add column if not exists nombre_busq text
  generated always as (public.sin_acentos(nombre)) stored;


-- ───────────────────────────────────────────────────────────────────
-- 4 · Índices para que el `%texto%` no recorra la tabla entera
--     pg_trgm es lo que hace indexable una búsqueda por subcadena.
-- ───────────────────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;

create index if not exists productos_nombre_busq_trgm
  on public.productos using gin (nombre_busq extensions.gin_trgm_ops);

create index if not exists proveedores_razon_social_busq_trgm
  on public.proveedores using gin (razon_social_busq extensions.gin_trgm_ops);

create index if not exists usuarios_nombre_busq_trgm
  on public.usuarios using gin (nombre_busq extensions.gin_trgm_ops);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  public.sin_acentos('CAMIÓN Ñandú Über')                                as muestra,
  (select count(*) from public.productos    where nombre_busq is not null) as prod_ok,
  (select count(*) from public.proveedores  where razon_social_busq is not null) as prov_ok,
  (select count(*) from public.usuarios     where nombre_busq is not null) as usr_ok,
  (select count(*) from pg_indexes
     where schemaname = 'public'
       and indexname in ('productos_nombre_busq_trgm',
                         'proveedores_razon_social_busq_trgm',
                         'usuarios_nombre_busq_trgm'))                    as indices;
