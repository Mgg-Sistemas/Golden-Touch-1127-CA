-- ============================================================
-- Golden Touch · Salida y «Por retornar» también en el Inventario General
-- (teléfono, 30/10/2026, pedido de la administradora).
--
-- Se reusa la tabla y las funciones del Depósito Mina (13/10/2026):
-- · deposito_mina_salidas gana la columna `almacen` ('Depósito Mina' | 'General').
--   Lo ya registrado queda como Depósito Mina (default).
-- · deposito_mina_registrar_salida recibe p->>'almacen' (si no viene, Mina:
--   los teléfonos con la versión vieja siguen igual). El material tiene que
--   ser de ESE depósito. Correlativos: SDM-#### (Mina) y SIG-#### (General).
-- · deposito_mina_retornar devuelve el stock al almacén de la salida.
-- Permisos, RLS, bucket de fotos y guardia de cambios: los mismos de la Mina.
-- ============================================================

alter table public.deposito_mina_salidas add column if not exists almacen text not null default 'Depósito Mina';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deposito_mina_salidas_almacen_chk') then
    alter table public.deposito_mina_salidas
      add constraint deposito_mina_salidas_almacen_chk check (almacen in ('Depósito Mina', 'General'));
  end if;
end $$;

create index if not exists deposito_mina_salidas_almacen_estado_idx on public.deposito_mina_salidas (almacen, estado);

create or replace function public.deposito_mina_registrar_salida(p jsonb)
 returns public.deposito_mina_salidas
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_prod public.productos;
  v_cant numeric := round(coalesce((p->>'cantidad')::numeric, 0), 4);
  v_motivo text := btrim(coalesce(p->>'motivo', ''));
  v_retorna boolean := coalesce((p->>'retorna')::boolean, false);
  v_alm text := coalesce(nullif(btrim(p->>'almacen'), ''), 'Depósito Mina');
  v_es_mina boolean;
  v_lugar text;
  v_id uuid := gen_random_uuid();
  v_codigo text;
  v_mov public.movimientos;
  v_fila public.deposito_mina_salidas;
  v_actor text := coalesce(nullif(auth.jwt()->>'email', ''), p->>'actor');
begin
  if v_alm not in ('Depósito Mina', 'General') then
    raise exception 'Almacén no válido para la salida.' using errcode = '23514';
  end if;
  v_es_mina := v_alm = 'Depósito Mina';
  v_lugar := case when v_es_mina then 'Depósito Mina' else 'Inventario General' end;

  select * into v_prod from public.productos where id = (p->>'producto_id')::uuid;
  if v_prod.id is null then raise exception 'No se encontró el material.' using errcode = '23503'; end if;
  if (coalesce(v_prod.almacen, '') = 'Depósito Mina') <> v_es_mina then
    raise exception '%', case when v_es_mina then 'Solo se pueden sacar materiales del Depósito Mina.'
                              else 'Ese material es del Depósito Mina: sácalo desde la pantalla del Depósito Mina.' end
      using errcode = '23514';
  end if;
  if v_cant <= 0 then raise exception 'Escribe cuánto sale.' using errcode = '23514'; end if;
  if char_length(v_motivo) < 3 then raise exception 'Escribe el motivo de la salida.' using errcode = '23514'; end if;
  if coalesce(btrim(p->>'autorizado_por'), '') = '' then raise exception 'Indica quién autorizó la salida.' using errcode = '23514'; end if;

  v_codigo := case when v_es_mina
    then 'SDM-' || lpad(public.next_correlativo('salida-deposito-mina')::text, 4, '0')
    else 'SIG-' || lpad(public.next_correlativo('salida-inventario-general')::text, 4, '0') end;
  v_mov := public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_prod.id, 'tipo', 'salida', 'delta', -v_cant, 'almacen', v_alm,
    'actor', v_actor, 'actor_name', p->>'actor_name',
    'ref_tipo', case when v_es_mina then 'deposito_mina_salida' else 'inventario_general_salida' end,
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

create or replace function public.deposito_mina_retornar(p_id uuid, p_cantidad numeric, p_nota text default null::text, p_actor_name text default null::text)
 returns public.deposito_mina_salidas
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_s public.deposito_mina_salidas;
  v_cant numeric := round(coalesce(p_cantidad, 0), 4);
  v_pend numeric;
  v_actor text := nullif(auth.jwt()->>'email', '');
  v_es_mina boolean;
begin
  select * into v_s from public.deposito_mina_salidas where id = p_id for update;
  if v_s.id is null then raise exception 'No se encontró la salida (o no tienes permiso).' using errcode = '23503'; end if;
  if not v_s.retorna then raise exception 'Esa salida no retorna.' using errcode = '23514'; end if;
  v_pend := v_s.cantidad - v_s.retornado;
  if v_pend <= 0 then raise exception 'Esa salida ya retornó completa.' using errcode = '23514'; end if;
  if v_cant <= 0 then raise exception 'Escribe cuánto retorna.' using errcode = '23514'; end if;
  if v_cant > v_pend then
    raise exception 'Solo faltan % por retornar.', rtrim(rtrim(v_pend::text, '0'), '.') using errcode = '23514';
  end if;
  v_es_mina := v_s.almacen = 'Depósito Mina';

  perform public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_s.producto_id, 'tipo', 'entrada', 'delta', v_cant, 'almacen', v_s.almacen,
    'actor', v_actor, 'actor_name', p_actor_name,
    'ref_tipo', case when v_es_mina then 'deposito_mina_retorno' else 'inventario_general_retorno' end,
    'ref_id', v_s.id::text, 'ref_codigo', v_s.codigo,
    'detalle', 'Retorno de ' || v_s.codigo || coalesce(' · ' || nullif(btrim(p_nota), ''), '')
      || ' · ' || case when v_es_mina then 'Depósito Mina' else 'Inventario General' end || ' (teléfono)'));

  perform set_config('gt.dms_rpc', '1', true);
  update public.deposito_mina_salidas
     set retornado = retornado + v_cant,
         retornos = retornos || jsonb_build_array(jsonb_build_object(
           'at', now(), 'cantidad', v_cant, 'nota', nullif(btrim(coalesce(p_nota, '')), ''),
           'actor', v_actor, 'actor_name', nullif(btrim(coalesce(p_actor_name, '')), '')))
   where id = p_id
  returning * into v_s;
  perform set_config('gt.dms_rpc', '', true);
  return v_s;
end $function$;

-- El almacén de una salida no se cambia a mano (misma guardia de la Mina).
create or replace function public.deposito_mina_salidas_guardia()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('gt.dms_rpc', true), '') <> '1' and (
       new.producto_id is distinct from old.producto_id or new.cantidad is distinct from old.cantidad
    or new.retorna is distinct from old.retorna or new.retornado is distinct from old.retornado
    or new.retornos is distinct from old.retornos or new.codigo is distinct from old.codigo
    or new.movimiento_id is distinct from old.movimiento_id or new.almacen is distinct from old.almacen) then
    raise exception 'La salida solo se cambia registrando un retorno.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $function$;

select
  (select count(*) from public.deposito_mina_salidas where almacen = 'Depósito Mina') as salidas_mina,
  (select count(*) from public.deposito_mina_salidas where almacen = 'General') as salidas_general,
  exists (select 1 from pg_constraint where conname = 'deposito_mina_salidas_almacen_chk') as check_almacen;
