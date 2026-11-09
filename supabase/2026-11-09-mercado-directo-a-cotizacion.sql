-- 09/11/2026 · Compras: la SOLICITUD DE MERCADO (comida de Cocina) va directo a COTIZACIÓN.
-- Pedido de la administradora: «se monta la solicitud de mercado y va directo a cotización,
-- no pasa por revisión de almacén». Ya no pasaba por Almacén (29/10/2026); ahora tampoco
-- espera la aprobación de Compras: nace «aprobada» (tarjeta «Pendiente por cargar ofertas»).
-- Corre DESPUÉS de trg_ordenes_a_revision_almacen (orden alfabético de los BEFORE INSERT),
-- que a la de mercado la deja en «pendiente».

create or replace function public.ordenes_mercado_directo_cotizacion()
 returns trigger language plpgsql set search_path to 'public' as $f$
begin
  if new.estado is distinct from 'pendiente'::public.estado_orden
     or coalesce(new.tipo, 'producto') <> 'producto'
     or new.op_padre_id is not null
     or coalesce(new.codigo, '') !~ '^SP-[0-9]{4}-[0-9]+$'
     or not public.orden_es_solicitud_mercado(new.items) then
    return new;
  end if;
  new.estado := 'aprobada'::public.estado_orden;
  new.aprobada_en := now();
  new.historial := coalesce(new.historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'evento', 'aprobada',
    'actor', 'sistema',
    'motivo', 'Solicitud de mercado: va directo a cotización (sin revisión de Almacén ni aprobación)'));
  return new;
end $f$;

do $t$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ordenes_mercado_directo' and tgrelid = 'public.ordenes'::regclass) then
    create trigger trg_ordenes_mercado_directo before insert on public.ordenes
      for each row when (new.estado = 'pendiente'::public.estado_orden)
      execute function public.ordenes_mercado_directo_cotizacion();
  end if;
end $t$;

-- Las de mercado que quedaron esperando aprobación pasan a cotización.
update public.ordenes o
   set estado = 'aprobada'::public.estado_orden,
       aprobada_en = now(),
       historial = coalesce(o.historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'evento', 'aprobada', 'actor', 'sistema',
         'motivo', 'Solicitud de mercado: va directo a cotización (sin revisión de Almacén ni aprobación)'))
 where o.estado = 'pendiente'::public.estado_orden
   and coalesce(o.tipo, 'producto') = 'producto'
   and o.op_padre_id is null
   and coalesce(o.codigo, '') ~ '^SP-[0-9]{4}-[0-9]+$'
   and public.orden_es_solicitud_mercado(o.items);
