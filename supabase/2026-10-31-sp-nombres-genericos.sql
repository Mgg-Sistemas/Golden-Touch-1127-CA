-- ============================================================
-- Golden Touch · Solicitud de Pedido con NOMBRES GENÉRICOS (31/10/2026)
-- Flujo nuevo de Compras (interruptor `compras_revision_almacen`).
--
-- Con el interruptor encendido, la SP de productos que monta alguien que NO es
-- analista de compras ni admin va con nombres generales: ningún renglón casado a un
-- producto del inventario. Almacén la revisa y el analista, al cotizar, le pone a
-- cada renglón el producto correcto (o lo crea): recién ahí entra al inventario.
--
-- 1) ordenes_sp_nombres_genericos (BEFORE INSERT en ordenes): rechaza la SP de un
--    no-analista que traiga renglones con productoId y marca los renglones con
--    `nombre_generico: true`. Fuera de alcance: interruptor apagado, servicios, OC
--    hijas (op_padre_id), códigos que no son SP-AAAA-N, solicitud de MERCADO,
--    llamadas sin usuario (service role).
-- 2) ofertas_generico_con_producto (BEFORE INSERT/UPDATE OF items en
--    ofertas_proveedor): una cotización no se guarda mientras un renglón genérico
--    que se compra no tenga producto del inventario. No depende del interruptor:
--    el renglón genérico ya existe y hay que resolverlo igual.
--
-- La regla del cliente vive en src/modules/pedidos/nombresGenericos.ts y
-- src/modules/pedidos/piezasMaquinaria.ts (requiereAsignarProducto).
-- Idempotente: create or replace + triggers creados solo si faltan.
-- ============================================================

create or replace function public.ordenes_sp_nombres_genericos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol  text;
  v_conp text;
begin
  if not public.interruptor_activo('compras_revision_almacen') then
    return new;
  end if;
  if coalesce(new.tipo, 'producto') <> 'producto'
     or new.op_padre_id is not null
     or coalesce(new.codigo, '') !~ '^SP-[0-9]{4}-[0-9]+$'
     or jsonb_typeof(new.items) is distinct from 'array'
     or public.orden_es_solicitud_mercado(new.items)
  then
    return new;
  end if;
  if auth.uid() is null then
    return new;  -- service role / procesos del sistema
  end if;

  select u.role into v_rol from public.usuarios u where u.id = auth.uid();
  if public.is_admin() or coalesce(v_rol, '') = 'analista_de_compras' then
    return new;  -- Compras y el admin siguen pidiendo con productos del inventario
  end if;

  select string_agg(coalesce(nullif(btrim(it ->> 'nombre'), ''), 's/n'), ', ')
    into v_conp
    from jsonb_array_elements(new.items) it
   where nullif(btrim(coalesce(it ->> 'productoId', '')), '') is not null;
  if v_conp is not null then
    raise exception 'Con el flujo nuevo de Compras la Solicitud de Pedido se hace con nombres genéricos: el producto del inventario lo pone el analista de compras al cotizar. Recarga la página y vuelve a cargar: %', v_conp
      using errcode = '42501';
  end if;

  new.items := coalesce((
    select jsonb_agg(case when jsonb_typeof(it) = 'object'
                          then it || jsonb_build_object('nombre_generico', true)
                          else it end order by o)
      from jsonb_array_elements(new.items) with ordinality as t(it, o)
  ), '[]'::jsonb);
  return new;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_ordenes_sp_nombres_genericos'
                    and tgrelid = 'public.ordenes'::regclass) then
    create trigger trg_ordenes_sp_nombres_genericos
      before insert on public.ordenes
      for each row execute function public.ordenes_sp_nombres_genericos();
  end if;
end $$;

create or replace function public.ofertas_generico_con_producto()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_falta text;
begin
  if jsonb_typeof(new.items) is distinct from 'array' then
    return new;
  end if;
  select string_agg(distinct coalesce(nullif(btrim(it ->> 'nombre'), ''), 's/n'), ', ')
    into v_falta
    from jsonb_array_elements(new.items) it
   where jsonb_typeof(it) = 'object'
     and coalesce(it ->> 'nombre_generico', 'false') = 'true'
     and coalesce(it ->> 'comprar', 'true') <> 'false'
     and nullif(btrim(coalesce(it ->> 'productoId', '')), '') is null;
  if v_falta is not null then
    raise exception 'Ponle el producto del inventario (o crea uno nuevo) a los renglones con nombre genérico antes de guardar la cotización: %', v_falta
      using errcode = '23514';
  end if;
  return new;
end $function$;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_ofertas_generico_con_producto'
                    and tgrelid = 'public.ofertas_proveedor'::regclass) then
    create trigger trg_ofertas_generico_con_producto
      before insert or update of items on public.ofertas_proveedor
      for each row execute function public.ofertas_generico_con_producto();
  end if;
end $$;
