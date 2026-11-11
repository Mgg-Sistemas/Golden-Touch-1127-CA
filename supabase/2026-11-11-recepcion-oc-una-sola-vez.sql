-- 11/11/2026 · Una OC se recibe UNA sola vez (nunca entradas duplicadas en Inventario).
--
-- El caso: el analista recibía la OC en la PC (Compras / Recepciones pendientes) y el
-- almacenista la recepcionaba en el teléfono. El teléfono (delivery_recibir_oc_cant)
-- bloquea la orden y devuelve 'ya_recibida'; la PC NO: revisaba `recibida_en` en la
-- copia que tenía la pantalla, sumaba el stock y recién al final marcaba la orden.
-- Con la pantalla abierta de antes (o un doble clic) entraba la mercancía dos veces.
--
-- 1) La PC aparta la orden (orden_tomar_recepcion) ANTES de mover stock: si ya está
--    recibida o alguien la está recibiendo, no empieza.
-- 2) Candado en la base: ninguna entrada de inventario de una orden (ref_tipo 'orden')
--    entra si la orden ya está recibida o la está recibiendo otra persona. Cubre la PC,
--    el teléfono y cualquier pantalla vieja.

alter table public.ordenes
  add column if not exists recepcion_en_curso_en timestamptz,
  add column if not exists recepcion_en_curso_por text;

comment on column public.ordenes.recepcion_en_curso_en is
  'Cuándo alguien empezó a recibir la OC por la PC (se aparta 10 min). Se limpia al recibir.';

-- Aparta la orden para recibirla. INVOKER: el RLS de ordenes (pedidos/admin) decide quién.
create or replace function public.orden_tomar_recepcion(p_orden_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_o record;
begin
  update public.ordenes
     set recepcion_en_curso_en = now(), recepcion_en_curso_por = v_me
   where id = p_orden_id
     and recibida_en is null
     and (recepcion_en_curso_en is null or recepcion_en_curso_en < now() - interval '10 minutes')
  returning id into v_o;
  if found then return jsonb_build_object('ok', true); end if;

  select recibida_en, recibida_por, recepcion_en_curso_por, estado into v_o
    from public.ordenes where id = p_orden_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if v_o.recibida_en is not null then
    return jsonb_build_object('ok', false, 'motivo', 'ya_recibida', 'por', v_o.recibida_por, 'en', v_o.recibida_en);
  end if;
  return jsonb_build_object('ok', false, 'motivo', 'en_curso', 'por', v_o.recepcion_en_curso_por);
end $$;

-- Suelta la orden si la recepción por PC no llegó a mover stock.
create or replace function public.orden_soltar_recepcion(p_orden_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.ordenes
     set recepcion_en_curso_en = null, recepcion_en_curso_por = null
   where id = p_orden_id and recibida_en is null
     and lower(coalesce(recepcion_en_curso_por, '')) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function public.orden_tomar_recepcion(uuid) to authenticated;
grant execute on function public.orden_soltar_recepcion(uuid) to authenticated;

-- Candado: entradas de una orden ya recibida (o apartada por otra persona) no entran.
create or replace function public.movimientos_orden_una_recepcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o record;
  v_quien text;
begin
  if new.tipo is distinct from 'entrada' or new.ref_tipo is distinct from 'orden'
     or coalesce(new.ref_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;
  select o.recibida_en, o.recibida_por, o.recepcion_en_curso_en, o.recepcion_en_curso_por,
         coalesce(o.oc_codigo, o.codigo) as cod
    into v_o from public.ordenes o where o.id = new.ref_id::uuid;
  if not found then return new; end if;
  if v_o.recibida_en is not null then
    select coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), v_o.recibida_por) into v_quien
      from public.usuarios u where lower(u.email) = lower(v_o.recibida_por) limit 1;
    raise exception 'La % ya fue recibida por % (%). No se vuelve a sumar al inventario.',
      v_o.cod, coalesce(v_quien, v_o.recibida_por, 'otra persona'),
      to_char(v_o.recibida_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI')
      using errcode = 'P0001';
  end if;
  if v_o.recepcion_en_curso_en is not null and v_o.recepcion_en_curso_en > now() - interval '10 minutes'
     and lower(coalesce(v_o.recepcion_en_curso_por, '')) <> lower(coalesce(new.actor, auth.jwt() ->> 'email', '')) then
    raise exception 'La % la está recibiendo % en este momento. Espera a que termine.',
      v_o.cod, v_o.recepcion_en_curso_por using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger trg_movimientos_orden_una_recepcion
  before insert on public.movimientos
  for each row execute function public.movimientos_orden_una_recepcion();
