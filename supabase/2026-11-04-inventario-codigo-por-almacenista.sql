-- ============================================================
-- Golden Touch · Inventario · Cada almacenista con su código y su correlativo
-- en las salidas y los traslados del teléfono (04/11/2026)
--
-- Antes: SIG-0001 / SDM-0001 / SDP-0001 / TRA-0001, un solo correlativo para todos.
-- Ahora: el N° lleva las siglas de quien registra y cuenta aparte por persona:
--   SIG-ISO-0001 (Isner Orence, Inventario General) · TRA-ISO-0001 (su traslado).
-- Las siglas se asignan solas la primera vez (2 letras del nombre + 1 del apellido;
-- si ya las tiene otro, se les suma un número) y quedan fijas en
-- inventario_codigos_almacenista; el administrador puede cambiarlas ahí.
-- Lo ya registrado conserva su N°.
-- ============================================================

create table if not exists public.inventario_codigos_almacenista (
  email text primary key,
  prefijo text not null unique check (prefijo ~ '^[A-Z0-9]{2,6}$'),
  created_at timestamptz not null default now()
);

alter table public.inventario_codigos_almacenista enable row level security;

create policy inv_codigos_alm_leer on public.inventario_codigos_almacenista
  for select to authenticated using (true);

create policy inv_codigos_alm_admin on public.inventario_codigos_almacenista
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Siglas del almacenista (las crea si no tiene). SECURITY DEFINER: la escribe aunque el
-- almacenista no tenga permiso sobre la tabla.
create or replace function public.prefijo_almacenista(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_pref text;
  v_base text;
  v_nom text;
  v_ape text;
  i int := 1;
begin
  if v_email = '' then return 'GEN'; end if;
  select prefijo into v_pref from public.inventario_codigos_almacenista where email = v_email;
  if v_pref is not null then return v_pref; end if;

  select upper(public.sin_acentos(btrim(coalesce(nombre, '')))), upper(public.sin_acentos(btrim(coalesce(apellido, ''))))
    into v_nom, v_ape from public.usuarios where lower(email) = v_email limit 1;
  v_nom := regexp_replace(coalesce(v_nom, ''), '[^A-Z]', '', 'g');
  v_ape := regexp_replace(coalesce(v_ape, ''), '[^A-Z]', '', 'g');
  v_base := left(v_nom, 2) || left(v_ape, 1);
  if char_length(v_base) < 2 then
    v_base := left(regexp_replace(upper(split_part(v_email, '@', 1)), '[^A-Z]', '', 'g'), 3);
  end if;
  if char_length(v_base) < 2 then v_base := 'AL'; end if;

  v_pref := v_base;
  while exists (select 1 from public.inventario_codigos_almacenista where prefijo = v_pref) loop
    i := i + 1;
    v_pref := v_base || i::text;
  end loop;

  insert into public.inventario_codigos_almacenista (email, prefijo) values (v_email, v_pref)
  on conflict (email) do nothing;
  select prefijo into v_pref from public.inventario_codigos_almacenista where email = v_email;
  return v_pref;
end;
$$;

revoke execute on function public.prefijo_almacenista(text) from anon;
grant execute on function public.prefijo_almacenista(text) to authenticated;

-- ---------- Salida del teléfono: N° con las siglas y correlativo por persona ----------
CREATE OR REPLACE FUNCTION public.deposito_mina_registrar_salida(p jsonb)
 RETURNS deposito_mina_salidas
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_prod public.productos;
  v_cant numeric := round(coalesce((p->>'cantidad')::numeric, 0), 4);
  v_motivo text := btrim(coalesce(p->>'motivo', ''));
  v_retorna boolean := coalesce((p->>'retorna')::boolean, false);
  v_alm text := coalesce(nullif(btrim(p->>'almacen'), ''), 'Depósito Mina');
  v_es_dep boolean;
  v_lugar text;
  v_id uuid := gen_random_uuid();
  v_codigo text;
  v_pref text;
  v_tipo text;
  v_mov public.movimientos;
  v_fila public.deposito_mina_salidas;
  v_actor text := coalesce(nullif(auth.jwt()->>'email', ''), p->>'actor');
begin
  if v_alm <> 'General' and not exists (select 1 from public.almacenes where nombre = v_alm) then
    raise exception 'Almacén no válido para la salida.' using errcode = '23514';
  end if;
  v_es_dep := v_alm <> 'General';
  v_lugar := case when v_es_dep then v_alm else 'Inventario General' end;

  select * into v_prod from public.productos where id = (p->>'producto_id')::uuid;
  if v_prod.id is null then raise exception 'No se encontró el material.' using errcode = '23503'; end if;
  if coalesce(nullif(btrim(v_prod.almacen), ''), 'General') <> v_alm then
    raise exception '%', case when v_es_dep then 'Solo se pueden sacar materiales del ' || v_alm || '.'
                              else 'Ese material es del ' || v_prod.almacen || ': sácalo desde la pantalla de ese depósito.' end
      using errcode = '23514';
  end if;
  if v_cant <= 0 then raise exception 'Escribe cuánto sale.' using errcode = '23514'; end if;
  if char_length(v_motivo) < 3 then raise exception 'Escribe el motivo de la salida.' using errcode = '23514'; end if;
  if coalesce(btrim(p->>'autorizado_por'), '') = '' then raise exception 'Indica quién autorizó la salida.' using errcode = '23514'; end if;

  -- 04/11/2026: cada almacenista con sus siglas y su propio correlativo (por depósito).
  v_pref := public.prefijo_almacenista(v_actor);
  v_tipo := case when v_alm = 'Depósito Mina' then 'SDM' when v_es_dep then 'SDP' else 'SIG' end;
  v_codigo := v_tipo || '-' || v_pref || '-'
    || lpad(public.next_correlativo('salida-' || lower(v_tipo) || ':' || lower(coalesce(v_actor, '')))::text, 4, '0');

  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_prod.id, 'tipo', 'salida', 'delta', -v_cant, 'almacen', v_alm,
    'actor', v_actor, 'actor_name', p->>'actor_name',
    'ref_tipo', case when v_es_dep then 'deposito_mina_salida' else 'inventario_general_salida' end,
    'ref_id', v_id::text, 'ref_codigo', v_codigo,
    'solicitante', btrim(p->>'autorizado_por'),
    'detalle', v_motivo || ' · autorizó ' || btrim(p->>'autorizado_por') || case when v_retorna then ' · retorna' else ' · no retorna' end || ' · ' || v_lugar || ' (teléfono)'));

  insert into public.deposito_mina_salidas (id, codigo, almacen, producto_id, producto_nombre, unidad, cantidad, motivo, retorna,
    movimiento_id, actor, actor_name, autorizado_por)
  values (v_id, v_codigo, v_alm, v_prod.id, v_prod.nombre, v_prod.unidad, v_cant, v_motivo, v_retorna,
    v_mov.id, v_actor, nullif(btrim(coalesce(p->>'actor_name', '')), ''), btrim(p->>'autorizado_por'))
  returning * into v_fila;
  return v_fila;
end $function$;

-- ---------- Traslado del teléfono: TRA-<siglas>-#### por persona ----------
CREATE OR REPLACE FUNCTION public.inventario_trasladar_deposito(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_src      public.productos;
  v_dst      public.productos;
  v_cant     numeric := round(coalesce(nullif(p->>'cantidad', '')::numeric, 0), 4);
  v_nota     text := nullif(btrim(coalesce(p->>'nota', '')), '');
  v_actor    text := coalesce(nullif(auth.jwt()->>'email', ''), p->>'actor', 'sistema');
  v_nombre_a text := nullif(btrim(coalesce(p->>'actor_name', '')), '');
  v_origen   text;
  v_destino  text;
  v_codigo   text;
  v_creado   boolean := false;
  v_pre      text;
  v_sku      text;
  v_costo    numeric;
  v_stock    numeric;
  v_m1       public.movimientos;
  v_m2       public.movimientos;
begin
  select * into v_src from public.productos where id = nullif(p->>'producto_id', '')::uuid for update;
  if v_src.id is null then raise exception 'No se encontró el producto.' using errcode = '23503'; end if;
  if v_src.estado <> 'activo' then raise exception 'El producto % está inactivo.', v_src.nombre using errcode = '23514'; end if;
  if v_cant <= 0 then raise exception 'Escribe cuánto se traslada.' using errcode = '23514'; end if;

  v_origen := coalesce(nullif(btrim(v_src.almacen), ''), 'General');

  v_destino := nullif(btrim(coalesce(p->>'destino', '')), '');
  if v_destino is null then
    v_destino := case
      when v_origen = 'Depósito Mina' then 'General'
      when v_origen = 'General' then 'Depósito Mina'
      else 'Depósito Mina'
    end;
  end if;

  if v_destino = v_origen then
    raise exception 'El almacén de destino no puede ser el mismo de origen.' using errcode = '23514';
  end if;

  select coalesce(stock, 0), coalesce(costo_promedio, 0) into v_stock, v_costo
    from public.existencias where producto_id = v_src.id and almacen = v_origen for update;
  v_stock := coalesce(v_stock, 0);
  if v_cant > v_stock then
    raise exception 'No alcanza: en % hay % % de %.', v_origen, trim(to_char(v_stock, 'FM999999990.####')), v_src.unidad, v_src.nombre
      using errcode = 'check_violation';
  end if;
  if coalesce(v_costo, 0) <= 0 then v_costo := greatest(coalesce(v_src.precio, 0), 0); end if;

  select * into v_dst from public.productos
   where estado = 'activo'
     and almacen = v_destino
     and lower(public.sin_acentos(btrim(nombre))) = lower(public.sin_acentos(btrim(v_src.nombre)))
   limit 1 for update;

  if v_dst.id is not null and upper(btrim(coalesce(v_dst.unidad, ''))) <> upper(btrim(coalesce(v_src.unidad, ''))) then
    raise exception 'En % «%» está en «%» y aquí en «%»: corrige la unidad antes de trasladar.',
      v_destino, v_dst.nombre, v_dst.unidad, v_src.unidad using errcode = '23514';
  end if;

  if v_dst.id is null then
    v_pre := public._prefijo_categoria_interno(v_src.categoria);
    v_sku := v_pre || '-' || lpad(public.next_sku(v_pre, 1)::text, 3, '0');
    insert into public.productos (sku, nombre, categoria, unidad, stock, stock_min, precio, almacen, estado)
    values (v_sku, v_src.nombre, v_src.categoria, v_src.unidad, 0, 0, coalesce(v_src.precio, 0), v_destino, 'activo')
    returning * into v_dst;
    v_creado := true;
  end if;

  -- 04/11/2026: cada almacenista con sus siglas y su propio correlativo.
  v_codigo := 'TRA-' || public.prefijo_almacenista(v_actor) || '-'
    || lpad(public.next_correlativo('traslado-almacen:' || lower(v_actor))::text, 4, '0');

  v_m1 := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_src.id, 'tipo', 'transferencia', 'delta', -v_cant,
    'actor', v_actor, 'actor_name', v_nombre_a,
    'ref_tipo', 'traslado_almacen', 'ref_codigo', v_codigo, 'destino', v_destino,
    'detalle', 'Traslado ' || v_codigo || ' a ' || v_destino || coalesce(' · ' || v_nota, '') || ' (teléfono)'));
  v_m2 := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_dst.id, 'tipo', 'transferencia', 'delta', v_cant, 'precio_unitario', v_costo,
    'actor', v_actor, 'actor_name', v_nombre_a,
    'ref_tipo', 'traslado_almacen', 'ref_codigo', v_codigo,
    'detalle', 'Traslado ' || v_codigo || ' desde ' || v_origen || coalesce(' · ' || v_nota, '') || ' (teléfono)'));

  return jsonb_build_object(
    'codigo', v_codigo, 'cantidad', v_cant, 'unidad', v_src.unidad,
    'origen', v_origen, 'destino', v_destino,
    'producto_origen_id', v_src.id, 'producto_destino_id', v_dst.id,
    'nombre', v_src.nombre, 'sku_origen', v_src.sku, 'sku_destino', v_dst.sku, 'creado_en_destino', v_creado,
    'stock_origen', v_m1.stock_despues, 'stock_destino', v_m2.stock_despues,
    'nota', v_nota, 'at', v_m2.at);
end $function$;
