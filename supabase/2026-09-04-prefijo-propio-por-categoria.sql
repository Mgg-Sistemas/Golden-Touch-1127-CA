-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026
-- Cada categoría tiene su PROPIO prefijo de SKU
--
-- QUÉ PASABA
-- El prefijo se sacaba de las 3 primeras letras del nombre de la categoría, en
-- el navegador y sin memoria. Dos categorías distintas caen en el mismo
-- prefijo con toda naturalidad: PROTEINA y PRODUCCION son las dos «PRO»,
-- HORNOS y HORTALIZAS son las dos «HOR». Cuando eso pasa, comparten el
-- contador y el SKU deja de decir a qué categoría pertenece el producto.
--
-- Y ya estaba pasando: `GEN` lo usaban GENERAL y VIVERES a la vez.
--
-- QUÉ CAMBIA
--   1. Se unifica la categoría VIVERES / VÍVERES, que convivían por la tilde.
--      El código de cocina y de pedidos ya las trataba como la misma (comparan
--      sin acentos), pero el prefijo no: por eso una caía en VIV y la otra en
--      GEN. Se dejan todas como VÍVERES, que es como las escribe el sistema al
--      montar el mercado.
--   2. Nace `sku_prefijos`: la tabla que RECUERDA qué prefijo le tocó a cada
--      categoría. Deja de ser una adivinanza del navegador.
--   3. `prefijo_categoria()` asigna el prefijo la primera vez y después
--      siempre devuelve el mismo. Si el candidato natural ya está tomado por
--      OTRA categoría, busca uno libre en vez de pisarlo.
--
-- LAS CATEGORÍAS EXISTENTES NO CAMBIAN DE PREFIJO
-- La siembra le asigna a cada una el prefijo que YA venía usando en la mayoría
-- de sus productos. Nadie se despierta con SKUs de otra familia.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1 · VIVERES y VÍVERES eran la misma categoría
-- ───────────────────────────────────────────────────────────────────
update public.productos
   set categoria = 'VÍVERES', updated_at = now()
 where public.sin_acentos(categoria) = 'viveres'
   and categoria <> 'VÍVERES';

update public.taxonomias
   set valor = 'VÍVERES'
 where scope = 'inventario.categoria'
   and public.sin_acentos(valor) = 'viveres'
   and valor <> 'VÍVERES'
   and not exists (
     select 1 from public.taxonomias t2
      where t2.scope = 'inventario.categoria' and t2.valor = 'VÍVERES'
   );

-- Si la de arriba no pudo renombrar porque «VÍVERES» ya existía, se borra la
-- duplicada en vez de dejar las dos en el desplegable.
delete from public.taxonomias
 where scope = 'inventario.categoria'
   and public.sin_acentos(valor) = 'viveres'
   and valor <> 'VÍVERES';


-- ───────────────────────────────────────────────────────────────────
-- 2 · La tabla que recuerda el prefijo de cada categoría
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.sku_prefijos (
  categoria_norm text primary key,
  categoria      text        not null,
  prefijo        text        not null unique,
  created_at     timestamptz not null default now()
);

comment on table public.sku_prefijos is
  'Prefijo de SKU asignado a cada categoría de inventario. Una categoría, un '
  'prefijo, para siempre. Lo asigna prefijo_categoria(); no se edita a mano.';

alter table public.sku_prefijos enable row level security;

drop policy if exists "sku_prefijos read" on public.sku_prefijos;
create policy "sku_prefijos read" on public.sku_prefijos
  for select using (auth.role() = 'authenticated');

-- La escritura va SOLO por la función (que es SECURITY DEFINER): nadie edita
-- la tabla a mano desde el cliente, porque cambiar un prefijo asignado
-- rompería la correspondencia con los SKU ya emitidos.
drop policy if exists "sku_prefijos write admin" on public.sku_prefijos;
create policy "sku_prefijos write admin" on public.sku_prefijos
  for all using (public.is_admin()) with check (public.is_admin());


-- ───────────────────────────────────────────────────────────────────
-- 3 · Siembra: cada categoría se queda con el prefijo que YA usaba
--     (el más frecuente entre sus productos). Si dos categorías se pelean
--     el mismo, gana la que tiene más productos; la otra queda sin asignar
--     y recibirá uno libre la próxima vez que se use.
-- ───────────────────────────────────────────────────────────────────
insert into public.sku_prefijos (categoria_norm, categoria, prefijo)
select distinct on (public.sin_acentos(x.categoria))
       public.sin_acentos(x.categoria), x.categoria, x.prefijo
  from (
    select p.categoria,
           upper((regexp_match(p.sku, '^([A-Za-z]+)'))[1]) as prefijo,
           count(*) as n
      from public.productos p
     where p.sku ~ '^[A-Za-z]+' and coalesce(p.categoria, '') <> ''
     group by 1, 2
  ) x
 where x.prefijo is not null
 order by public.sin_acentos(x.categoria), x.n desc, x.prefijo
on conflict do nothing;


-- ───────────────────────────────────────────────────────────────────
-- 4 · La función que asigna y recuerda
-- ───────────────────────────────────────────────────────────────────
create or replace function public.prefijo_categoria(p_categoria text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_norm  text;
  v_base  text;
  v_cand  text;
  v_pref  text;
  i       int;
begin
  if not public.is_operativo() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_norm := public.sin_acentos(btrim(coalesce(p_categoria, '')));
  if v_norm = '' then v_norm := 'general'; end if;

  -- ¿Ya tiene prefijo? Entonces ese, siempre.
  select prefijo into v_pref from public.sku_prefijos where categoria_norm = v_norm;
  if v_pref is not null then return v_pref; end if;

  -- Candidato natural: las letras del nombre, sin acentos ni signos.
  v_base := upper(regexp_replace(v_norm, '[^a-z]', '', 'g'));
  if v_base = '' then v_base := 'GEN'; end if;
  v_cand := left(v_base, 3);

  -- Si está tomado por OTRA categoría, se estira a 4 y 5 letras; si aun así
  -- choca, se numera. Determinista: la misma categoría siempre cae igual.
  if exists (select 1 from public.sku_prefijos where prefijo = v_cand) then
    v_cand := left(v_base, 4);
    if length(v_cand) < 4 or exists (select 1 from public.sku_prefijos where prefijo = v_cand) then
      v_cand := left(v_base, 5);
      if length(v_cand) < 5 or exists (select 1 from public.sku_prefijos where prefijo = v_cand) then
        for i in 2..99 loop
          v_cand := left(v_base, 3) || i::text;
          exit when not exists (select 1 from public.sku_prefijos where prefijo = v_cand);
        end loop;
      end if;
    end if;
  end if;

  -- Carrera entre dos altas simultáneas de la misma categoría: gana la
  -- primera y la segunda lee lo que quedó, en vez de fallar.
  insert into public.sku_prefijos (categoria_norm, categoria, prefijo)
  values (v_norm, btrim(p_categoria), v_cand)
  on conflict (categoria_norm) do nothing;

  select prefijo into v_pref from public.sku_prefijos where categoria_norm = v_norm;
  if v_pref is null then
    -- El conflicto fue por el PREFIJO, no por la categoría: se reintenta con
    -- el numerado, que es libre por construcción.
    for i in 2..99 loop
      v_cand := left(v_base, 3) || i::text;
      exit when not exists (select 1 from public.sku_prefijos where prefijo = v_cand);
    end loop;
    insert into public.sku_prefijos (categoria_norm, categoria, prefijo)
    values (v_norm, btrim(p_categoria), v_cand)
    on conflict (categoria_norm) do nothing;
    select prefijo into v_pref from public.sku_prefijos where categoria_norm = v_norm;
  end if;

  return coalesce(v_pref, 'GEN');
end $$;

comment on function public.prefijo_categoria(text) is
  'Prefijo de SKU de una categoría. Lo asigna la primera vez (evitando los ya '
  'tomados por otras categorías) y después devuelve siempre el mismo.';

revoke execute on function public.prefijo_categoria(text) from public, anon;
grant execute on function public.prefijo_categoria(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from public.sku_prefijos)                                  as categorias_con_prefijo,
  (select count(*) from public.productos
    where public.sin_acentos(categoria) = 'viveres' and categoria <> 'VÍVERES') as viveres_sin_unificar,
  (select count(*) from (
     select prefijo from public.sku_prefijos group by prefijo having count(*) > 1) x) as prefijos_repetidos,
  (select jsonb_object_agg(categoria, prefijo) from public.sku_prefijos)      as mapa;
