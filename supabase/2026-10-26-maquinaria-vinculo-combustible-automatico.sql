-- 26/10/2026 · Maquinaria: los equipos quedan vinculados a sí mismos con Combustible
--
-- Pedido: «estoy agregando una máquina y será vinculada a ese mismo; las máquinas estarán
-- vinculadas a sí mismas desde Combustible». El vínculo Maquinaria → Combustible es por
-- TEXTO (`maquinaria_equipos.combustible_equipo` = `combustible_catalogos.valor` con tipo
-- 'equipo'). El 23/10 se intentó poner `combustible_equipo = equipo` a secas y se revirtió:
-- los nombres NO existían en el catálogo y la ficha los marcaba como «vínculo roto».
-- Esta vez el vínculo se acompaña del valor en el catálogo, así que queda sano.
--
-- 1. BEFORE INSERT: si `combustible_equipo` viene NULL o '', se pone igual a `equipo`.
--    Solo al CREAR: una ficha vieja que se edita sin vínculo no se vincula sola (eso lo
--    decide el botón «Vincular a sí mismo» del formulario).
-- 2. AFTER INSERT OR UPDATE OF combustible_equipo: si el nombre vinculado no está en el
--    catálogo de Combustible (comparando sin mayúsculas ni acentos, igual que el índice
--    único `combustible_catalogos_tipo_valor_sin_acentos`), se crea activo. SECURITY DEFINER
--    porque quien registra una máquina puede no tener permiso de escritura en Combustible
--    (la política de la tabla exige is_admin() o puede('combustible')).
-- 3. Backfill: los equipos activos sin vínculo pasan a apuntar a su propio nombre y ese
--    nombre se crea en el catálogo si faltaba.

-- 1. Vínculo por defecto = el propio nombre
create or replace function public.maquinaria_vincular_combustible_auto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.combustible_equipo is null or btrim(new.combustible_equipo) = '' then
    new.combustible_equipo := btrim(new.equipo);
  end if;
  return new;
end $$;

-- (create or replace trigger: el MCP de Supabase declina los DROP, y así queda idempotente igual)
create or replace trigger trg_maquinaria_vincular_combustible_auto
  before insert on public.maquinaria_equipos
  for each row execute function public.maquinaria_vincular_combustible_auto();

-- 2. El nombre vinculado existe en el catálogo de Combustible (tipo 'equipo', activo)
create or replace function public.maquinaria_asegurar_catalogo_combustible()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v text := btrim(coalesce(new.combustible_equipo, ''));
begin
  if v = '' then
    return new;
  end if;
  if not exists (
    select 1 from public.combustible_catalogos c
    where c.tipo = 'equipo'
      and (upper(btrim(c.valor)) = upper(v) or public.sin_acentos(c.valor) = public.sin_acentos(v))
  ) then
    begin
      insert into public.combustible_catalogos (tipo, valor, activo, orden)
      values ('equipo', v, true, 999);
    exception when unique_violation then
      -- Dos altas a la vez con el mismo nombre: el segundo se queda con el que ya entró.
      null;
    end;
  end if;
  return new;
end $$;

create or replace trigger trg_maquinaria_asegurar_catalogo_combustible
  after insert or update of combustible_equipo on public.maquinaria_equipos
  for each row execute function public.maquinaria_asegurar_catalogo_combustible();

-- 3. Backfill: equipos activos sin vínculo → vinculados a sí mismos (el trigger 2 crea el
--    valor del catálogo al actualizar; el insert de abajo lo garantiza aunque el trigger
--    no hubiera corrido).
update public.maquinaria_equipos
set combustible_equipo = btrim(equipo)
where activo
  and (combustible_equipo is null or btrim(combustible_equipo) = '');

insert into public.combustible_catalogos (tipo, valor, activo, orden)
select distinct on (public.sin_acentos(btrim(m.combustible_equipo)))
       'equipo', btrim(m.combustible_equipo), true, 999
from public.maquinaria_equipos m
where m.activo
  and btrim(coalesce(m.combustible_equipo, '')) <> ''
  and btrim(m.combustible_equipo) = btrim(m.equipo)
  and not exists (
    select 1 from public.combustible_catalogos c
    where c.tipo = 'equipo'
      and public.sin_acentos(c.valor) = public.sin_acentos(btrim(m.combustible_equipo))
  )
order by public.sin_acentos(btrim(m.combustible_equipo)), m.created_at;
