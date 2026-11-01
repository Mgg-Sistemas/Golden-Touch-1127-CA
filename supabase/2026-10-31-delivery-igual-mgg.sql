-- =====================================================================
-- 2026-10-31 · DELIVERY IGUAL QUE EN MGG (base de datos)
-- ---------------------------------------------------------------------
-- Pedido de la usuaria: «el módulo de DELIVERY PC y TLF sea igual que en
-- MGG». GT y MGG hicieron Delivery por separado el 30/10/2026; este archivo
-- REEMPLAZA el modelo de GT (supabase/2026-10-30-delivery.sql: trigger que
-- creaba delivery_pedidos 'por_tomar' + delivery_eventos + 8 RPC) por el de
-- MGG (upstream: supabase/sql/delivery-2026-10-30.sql y
-- delivery-comprobante-pago-2026-10-30.sql, commit 36fcf885):
--
--   · DISPONIBLES = OC pagadas y sin recibir que nadie tomó. No hay fila
--     hasta que un motorizado la TOMA (delivery_tomar): estados aceptado →
--     en_ruta → entregado / cancelado. Índice único: UNA toma viva por OC.
--     Cancelar (con motivo) deja la OC libre otra vez para otro.
--   · delivery_pedidos (historial jsonb dentro), delivery_ubicaciones (una
--     fila por motorizado, por repartidor_id), funciones delivery_conectado,
--     delivery_puede, delivery_nombre_usuario, delivery_pedidos_listado,
--     delivery_tomar, delivery_avanzar, delivery_fotos, delivery_ubicar,
--     delivery_comprobante_pago. Escritura SOLO por esas funciones.
--
-- ADAPTACIONES DE GT (se conservan a propósito):
--   1. Interruptor: public.sistema_interruptores clave 'compras_delivery'
--      (NO la tabla config de MGG). delivery_conectado() lee esa fila;
--      delivery_desde() da la hora de encendido (activado_en).
--   2. Solo órdenes NUEVAS: una OC está disponible solo si
--      ordenes.created_at >= activado_en del interruptor.
--   3. La OC entra EN CUANTO QUEDA PAGADA, SIN esperar la retención
--      (decisión de la usuaria del 30/10/2026 en GT). MGG pide además
--      «retencion_momento is null or retencion_hecha_en is not null»: aquí
--      se quitó esa condición (en el listado y al tomar).
--   4. Solo OC de PRODUCTOS: coalesce(ordenes.tipo,'producto') = 'producto'
--      (MGG usa ordenes.clase <> 'servicio'; GT no tiene «clase»).
--   5. Permisos GT: delivery_puede() usa is_admin()/puede_leer/puede/
--      puede_full('delivery') (MGG usa puede_modulo). RLS de lectura con
--      is_admin() or puede_leer('delivery') (o 'pedidos' para los pedidos).
--   6. Aviso al rol 'delivery' cuando hay una OC disponible (MGG no lo
--      tiene): el trigger trg_ordenes_a_delivery ahora SOLO avisa (ya no crea
--      filas) y delivery_avanzar avisa cuando una cancelación la libera.
--      Al tomarla, el aviso queda leído.
--   7. Moneda: ordenes.total_moneda (MGG: ordenes.moneda).
--   8. Comprobante de pago: GT guarda los comprobantes en
--      ordenes.comprobantes_pago / factura_path (MGG los busca en el
--      historial); delivery_comprobante_pago devuelve eso y el front usa
--      comprobantesDeLaOrden().
--   9. Bucket: se reutiliza 'delivery-fotos' (mismo nombre que MGG). Ruta
--      de MGG: <pedido_id>/<recibo|entrega>-<ts>-<nombre>; se ajustó la
--      política de subida a esa ruta. delivery_fotos valida que cada ruta
--      sea de ese pedido (MGG no lo valida).
--  10. Auditoría (fn_auditar) en delivery_pedidos, como el resto de GT.
--
-- LO VIEJO DE GT (no se borra: el MCP de Supabase rechaza DROP/DELETE):
--   tablas renombradas a delivery_pedidos_v1 / delivery_eventos_v1 /
--   delivery_ubicaciones_v1 (tenían 0 filas), sin permisos para
--   authenticated; los 8 RPC viejos sin execute para authenticated.
--
-- Aplicado en Supabase GT (rroohciwhpfonklxuoev) el 31/10/2026:
--   delivery_mgg_1_retirar_v1
--   delivery_mgg_2_tablas
--   delivery_mgg_3_funciones
--   delivery_mgg_4_aviso_trigger
--   delivery_mgg_5_storage
-- (Pruebas al final del archivo.)
-- =====================================================================


-- =====================================================================
-- 1) Retirar lo de GT del 30/10 (renombrar, sin borrar)
-- =====================================================================

-- El trigger viejo creaba la fila 'por_tomar' al pagar. Mientras se arma lo
-- nuevo, no hace nada (en el paso 4 pasa a solo avisar).
create or replace function public.ordenes_a_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 31/10/2026: retirado (Delivery igual que MGG). Ver paso 4.
  return null;
end $$;

alter table public.delivery_pedidos     rename to delivery_pedidos_v1;
alter table public.delivery_eventos     rename to delivery_eventos_v1;
alter table public.delivery_ubicaciones rename to delivery_ubicaciones_v1;

-- Los índices / restricciones con nombre de relación chocarían con los nuevos.
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_pkey to delivery_pedidos_v1_pkey;
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_codigo_key to delivery_pedidos_v1_codigo_key;
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_orden_id_key to delivery_pedidos_v1_orden_id_key;
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_orden_id_fkey to delivery_pedidos_v1_orden_id_fkey;
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_estado_check to delivery_pedidos_v1_estado_check;
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_fotos_entrega_check to delivery_pedidos_v1_fotos_entrega_check;
alter table public.delivery_pedidos_v1 rename constraint delivery_pedidos_fotos_recibido_check to delivery_pedidos_v1_fotos_recibido_check;
alter index public.delivery_pedidos_estado_idx rename to delivery_pedidos_v1_estado_idx;
alter index public.delivery_pedidos_repartidor_idx rename to delivery_pedidos_v1_repartidor_idx;
alter table public.delivery_eventos_v1 rename constraint delivery_eventos_pkey to delivery_eventos_v1_pkey;
alter table public.delivery_eventos_v1 rename constraint delivery_eventos_pedido_id_fkey to delivery_eventos_v1_pedido_id_fkey;
alter table public.delivery_eventos_v1 rename constraint delivery_eventos_evento_check to delivery_eventos_v1_evento_check;
alter index public.delivery_eventos_pedido_idx rename to delivery_eventos_v1_pedido_idx;
alter index public.delivery_eventos_actor_idx rename to delivery_eventos_v1_actor_idx;
alter table public.delivery_ubicaciones_v1 rename constraint delivery_ubicaciones_pkey to delivery_ubicaciones_v1_pkey;
alter table public.delivery_ubicaciones_v1 rename constraint delivery_ubicaciones_pedido_id_fkey to delivery_ubicaciones_v1_pedido_id_fkey;
alter table public.delivery_ubicaciones_v1 rename constraint delivery_ubicaciones_lat_check to delivery_ubicaciones_v1_lat_check;
alter table public.delivery_ubicaciones_v1 rename constraint delivery_ubicaciones_lng_check to delivery_ubicaciones_v1_lng_check;
alter index public.delivery_ubicaciones_pedido_idx rename to delivery_ubicaciones_v1_pedido_idx;

-- Nadie las usa más (quedan solo para el registro).
revoke all on public.delivery_pedidos_v1, public.delivery_eventos_v1, public.delivery_ubicaciones_v1 from anon, authenticated;
comment on table public.delivery_pedidos_v1 is 'RETIRADA 31/10/2026: Delivery de GT del 30/10 reemplazado por el de MGG (ver supabase/2026-10-31-delivery-igual-mgg.sql).';
comment on table public.delivery_eventos_v1 is 'RETIRADA 31/10/2026 (ver delivery_pedidos_v1).';
comment on table public.delivery_ubicaciones_v1 is 'RETIRADA 31/10/2026 (ver delivery_pedidos_v1).';

-- RPC viejos de GT: sin ejecución para la app.
revoke execute on function public.delivery_aceptar(uuid, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.delivery_cancelar(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.delivery_en_ruta(uuid, jsonb, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.delivery_entregar(uuid, jsonb, text, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.delivery_adjuntar_fotos(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.delivery_actualizar_ubicacion(double precision, double precision, double precision, uuid) from public, anon, authenticated;
revoke execute on function public.delivery_reabrir(uuid) from public, anon, authenticated;
revoke execute on function public.delivery_contacto_analistas(text[]) from public, anon, authenticated;
comment on function public.delivery_aceptar(uuid, double precision, double precision) is 'RETIRADA 31/10/2026 (Delivery igual que MGG): usar delivery_tomar.';
comment on function public.delivery_cancelar(uuid, text, text) is 'RETIRADA 31/10/2026: usar delivery_avanzar(…, ''cancelado'', motivo).';
comment on function public.delivery_en_ruta(uuid, jsonb, double precision, double precision) is 'RETIRADA 31/10/2026: usar delivery_avanzar(…, ''en_ruta'').';
comment on function public.delivery_entregar(uuid, jsonb, text, double precision, double precision) is 'RETIRADA 31/10/2026: usar delivery_avanzar(…, ''entregado'').';
comment on function public.delivery_adjuntar_fotos(uuid, text, jsonb) is 'RETIRADA 31/10/2026: usar delivery_fotos.';
comment on function public.delivery_actualizar_ubicacion(double precision, double precision, double precision, uuid) is 'RETIRADA 31/10/2026: usar delivery_ubicar(lat, lng, …).';
comment on function public.delivery_reabrir(uuid) is 'RETIRADA 31/10/2026 (MGG no reabre: se cancela y queda libre).';
comment on function public.delivery_contacto_analistas(text[]) is 'RETIRADA 31/10/2026: el listado ya trae nombre y teléfono del analista.';


-- =====================================================================
-- 2) Tablas de MGG
-- =====================================================================
create table if not exists public.delivery_pedidos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes(id),
  estado text not null default 'aceptado' check (estado in ('aceptado', 'en_ruta', 'entregado', 'cancelado')),
  repartidor_id uuid not null,
  repartidor_email text,
  repartidor_nombre text,
  aceptado_en timestamptz not null default now(),
  en_ruta_en timestamptz,
  entregado_en timestamptz,
  cancelado_en timestamptz,
  motivo_cancel text,
  detalle_cancel text,
  almacen_entrega text,
  nota_entrega text,
  fotos_recibo jsonb not null default '[]'::jsonb,
  fotos_entrega jsonb not null default '[]'::jsonb,
  historial jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- UNA sola toma viva por OC: si un delivery ya la tomó, nadie más puede.
create unique index if not exists delivery_pedidos_una_viva on public.delivery_pedidos (orden_id) where estado <> 'cancelado';
create index if not exists delivery_pedidos_repartidor_idx on public.delivery_pedidos (repartidor_id, estado);
create index if not exists delivery_pedidos_orden_idx on public.delivery_pedidos (orden_id);
create index if not exists delivery_pedidos_aceptado_idx on public.delivery_pedidos (aceptado_en);

create table if not exists public.delivery_ubicaciones (
  repartidor_id uuid primary key,
  repartidor_email text,
  repartidor_nombre text,
  lat double precision not null,
  lng double precision not null,
  precision_m double precision,
  velocidad double precision,
  rumbo double precision,
  pedido_id uuid references public.delivery_pedidos(id) on delete set null,
  actualizado_en timestamptz not null default now()
);
create index if not exists delivery_ubicaciones_pedido_idx on public.delivery_ubicaciones (pedido_id);

alter table public.delivery_pedidos enable row level security;
alter table public.delivery_ubicaciones enable row level security;
-- Solo lectura desde la app: todo cambio pasa por las funciones (paso 3).
revoke all on public.delivery_pedidos, public.delivery_ubicaciones from anon;
revoke insert, update, delete, truncate, references, trigger on public.delivery_pedidos, public.delivery_ubicaciones from authenticated;
grant select on public.delivery_pedidos, public.delivery_ubicaciones to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_pedidos' and policyname = 'delivery_pedidos read') then
    create policy "delivery_pedidos read" on public.delivery_pedidos for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')) or (select public.puede_leer('pedidos')));
  end if;
  -- La ubicación de una persona es dato sensible: solo quien tiene el módulo Delivery.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_ubicaciones' and policyname = 'delivery_ubicaciones read') then
    create policy "delivery_ubicaciones read" on public.delivery_ubicaciones for select to authenticated
      using ((select public.is_admin()) or (select public.puede_leer('delivery')));
  end if;
end $$;

-- Auditoría (las ubicaciones cambian cada pocos segundos: no se auditan).
create or replace trigger trg_aud_delivery_pedidos
  after insert or update or delete on public.delivery_pedidos
  for each row execute function public.fn_auditar();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_pedidos') then
    alter publication supabase_realtime add table public.delivery_pedidos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_ubicaciones') then
    alter publication supabase_realtime add table public.delivery_ubicaciones;
  end if;
end $$;


-- =====================================================================
-- 3) Funciones (MGG adaptadas a GT). security definer + search_path ''.
-- =====================================================================

-- ¿Delivery conectado a Compras? (GT: sistema_interruptores 'compras_delivery').
create or replace function public.delivery_conectado() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select si.activo from public.sistema_interruptores si where si.clave = 'compras_delivery'), false);
$$;

-- Desde cuándo está encendido (null = apagado). Solo entran OC creadas desde esa hora.
create or replace function public.delivery_desde() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when si.activo then coalesce(si.activado_en, si.updated_at) end
    from public.sistema_interruptores si where si.clave = 'compras_delivery';
$$;

-- Permiso en Delivery con las funciones de GT ('lectura' | 'escritura' | 'full').
create or replace function public.delivery_puede(p_nivel text default 'lectura') returns boolean
language sql stable security definer set search_path = '' as $$
  select case coalesce(p_nivel, 'lectura')
    when 'full' then public.puede_full('delivery')
    when 'escritura' then public.puede('delivery')
    else public.puede_leer('delivery')
  end;
$$;

-- Nombre visible de un usuario (nombre + apellido, o el correo).
create or replace function public.delivery_nombre_usuario(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), ''), p_email)
  from public.usuarios u where lower(u.email) = lower(p_email) limit 1;
$$;

-- Los pedidos que ve un delivery: las OC pagadas sin recibir que nadie tomó,
-- más las tomadas en curso (y, con p_incluir_cerrados, entregadas y canceladas).
create or replace function public.delivery_pedidos_listado(p_incluir_cerrados boolean default false)
returns table (
  orden_id uuid, oc_codigo text, codigo text, total numeric, moneda text, urgente boolean, pagada_en timestamptz,
  items jsonb, notas text, motivo text, finalidad text, almacen_destino text,
  proveedor_id uuid, proveedor_nombre text, proveedor_telefono text, proveedor_direccion text, proveedor_contacto text,
  analista_email text, analista_nombre text, analista_telefono text,
  pedido_id uuid, estado text, repartidor_id uuid, repartidor_nombre text, aceptado_en timestamptz, en_ruta_en timestamptz,
  entregado_en timestamptz, cancelado_en timestamptz, motivo_cancel text, detalle_cancel text, almacen_entrega text,
  nota_entrega text, fotos_recibo jsonb, fotos_entrega jsonb, historial jsonb, es_mio boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_desde timestamptz;
begin
  if not public.delivery_puede('lectura') then
    raise exception 'No tienes permiso en Delivery.' using errcode = '42501';
  end if;
  v_desde := public.delivery_desde();
  return query
  with vivos as (
    select distinct on (d.orden_id) d.* from public.delivery_pedidos d
    order by d.orden_id, (d.estado <> 'cancelado') desc, d.created_at desc
  )
  select o.id, o.oc_codigo, o.codigo, o.total, coalesce(o.total_moneda, 'USD'), coalesce(o.urgente, false), o.pagada_en,
         o.items, o.notas, o.motivo, o.finalidad, o.almacen_destino,
         p.id, p.razon_social, p.telefono, p.direccion, p.contacto,
         coalesce(o.oc_creada_por, o.aprobada_por),
         public.delivery_nombre_usuario(coalesce(o.oc_creada_por, o.aprobada_por)),
         (select u.telefono from public.usuarios u where lower(u.email) = lower(coalesce(o.oc_creada_por, o.aprobada_por)) limit 1),
         v.id, coalesce(v.estado, 'por_tomar'), v.repartidor_id, v.repartidor_nombre, v.aceptado_en, v.en_ruta_en,
         v.entregado_en, v.cancelado_en, v.motivo_cancel, v.detalle_cancel, v.almacen_entrega, v.nota_entrega,
         coalesce(v.fotos_recibo, '[]'::jsonb), coalesce(v.fotos_entrega, '[]'::jsonb), coalesce(v.historial, '[]'::jsonb),
         coalesce(v.repartidor_id = v_uid, false)
  from public.ordenes o
  left join public.proveedores p on p.id = o.proveedor_id
  left join vivos v on v.orden_id = o.id
  where coalesce(o.tipo, 'producto') = 'producto'          -- GT: solo OC de productos
    and o.oc_codigo is not null
    and (
      -- disponible: pagada, sin recibir, NUEVA (creada desde que se encendió) y sin toma viva.
      -- GT: NO espera la retención (decisión de la usuaria 30/10/2026).
      (v_desde is not null and o.estado = 'pagada' and o.recibida_en is null and o.created_at >= v_desde
        and (v.id is null or v.estado = 'cancelado'))
      -- en curso: la toma viva (todos los que leen Delivery la ven)
      or (v.id is not null and v.estado in ('aceptado', 'en_ruta'))
      -- cerrados (histórico)
      or (p_incluir_cerrados and v.id is not null and v.estado in ('entregado', 'cancelado'))
    )
  order by coalesce(o.urgente, false) desc, o.pagada_en asc nulls last;
end $$;

-- TOMAR un pedido: solo si está pagado, sin recibir, es nuevo y nadie lo tiene.
create or replace function public.delivery_tomar(p_orden_id uuid) returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_o public.ordenes; v_ya public.delivery_pedidos; v_fila public.delivery_pedidos; v_email text; v_nombre text; v_desde timestamptz;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  v_desde := public.delivery_desde();
  if v_desde is null then
    raise exception 'Delivery todavía no está conectado a Compras.' using errcode = 'P0001';
  end if;
  select * into v_o from public.ordenes where id = p_orden_id for update;
  if v_o.id is null then raise exception 'No se encontró la orden.' using errcode = '23503'; end if;
  -- GT: sin condición de retención; solo productos y solo OC creadas desde que se encendió.
  if v_o.estado <> 'pagada' or v_o.recibida_en is not null or coalesce(v_o.tipo, 'producto') <> 'producto'
     or v_o.oc_codigo is null or v_o.created_at < v_desde then
    raise exception 'La orden % ya no está disponible para delivery (estado: %).', coalesce(v_o.oc_codigo, v_o.codigo), v_o.estado using errcode = 'P0001';
  end if;
  select * into v_ya from public.delivery_pedidos where orden_id = p_orden_id and estado <> 'cancelado' limit 1;
  if v_ya.id is not null then
    raise exception 'Este pedido ya lo tomó %.', coalesce(v_ya.repartidor_nombre, v_ya.repartidor_email, 'otro delivery') using errcode = 'P0001';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  v_nombre := public.delivery_nombre_usuario(v_email);
  insert into public.delivery_pedidos (orden_id, repartidor_id, repartidor_email, repartidor_nombre, historial)
  values (p_orden_id, auth.uid(), v_email, v_nombre,
    jsonb_build_array(jsonb_build_object('at', now(), 'evento', 'aceptado', 'actor', v_email)))
  returning * into v_fila;
  -- GT: el aviso «OC disponible» ya está atendido.
  update public.notificaciones set read = true
   where dedup_key like 'del-disp-' || p_orden_id::text || '%' and read = false;
  return v_fila;
exception when unique_violation then
  raise exception 'Este pedido ya lo tomó otro delivery.' using errcode = 'P0001';
end $$;

-- Avanzar: en_ruta → entregado, o cancelar (con motivo). Solo el que lo tomó
-- (o quien supervisa con full / admin).
create or replace function public.delivery_avanzar(
  p_pedido_id uuid, p_estado text, p_motivo text default null, p_detalle text default null,
  p_almacen text default null, p_nota text default null
) returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_d public.delivery_pedidos; v_email text; v_ok boolean; v_oc text; v_prov text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.repartidor_id <> auth.uid() and not public.delivery_puede('full') then
    raise exception 'Este pedido lo tiene %: solo él puede moverlo.', coalesce(v_d.repartidor_nombre, v_d.repartidor_email) using errcode = '42501';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  v_ok := (v_d.estado = 'aceptado' and p_estado in ('en_ruta', 'cancelado'))
       or (v_d.estado = 'en_ruta' and p_estado in ('entregado', 'cancelado'));
  if not v_ok then
    raise exception 'No se puede pasar de % a %.', v_d.estado, p_estado using errcode = 'P0001';
  end if;
  if p_estado = 'cancelado' and char_length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo por el que no se puede buscar el pedido.' using errcode = '23514';
  end if;
  update public.delivery_pedidos set
    estado = p_estado,
    en_ruta_en = case when p_estado = 'en_ruta' then now() else en_ruta_en end,
    entregado_en = case when p_estado = 'entregado' then now() else entregado_en end,
    cancelado_en = case when p_estado = 'cancelado' then now() else cancelado_en end,
    motivo_cancel = case when p_estado = 'cancelado' then btrim(p_motivo) else motivo_cancel end,
    detalle_cancel = case when p_estado = 'cancelado' then nullif(btrim(coalesce(p_detalle, '')), '') else detalle_cancel end,
    almacen_entrega = case when p_estado = 'entregado' then nullif(btrim(coalesce(p_almacen, '')), '') else almacen_entrega end,
    nota_entrega = case when p_estado = 'entregado' then nullif(btrim(coalesce(p_nota, '')), '') else nota_entrega end,
    historial = historial || jsonb_build_array(jsonb_build_object('at', now(), 'evento', p_estado, 'actor', v_email,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), ''))),
    updated_at = now()
  where id = p_pedido_id
  returning * into v_d;

  -- GT: al cancelar, la OC queda libre otra vez → aviso al rol delivery.
  if p_estado = 'cancelado' then
    update public.delivery_ubicaciones set pedido_id = null where pedido_id = v_d.id;
    select coalesce(o.oc_codigo, o.codigo), nullif(btrim(p.razon_social), '') into v_oc, v_prov
      from public.ordenes o left join public.proveedores p on p.id = o.proveedor_id where o.id = v_d.orden_id;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('delivery', 'warning',
      '🔄 OC ' || coalesce(v_oc, '') || ' disponible otra vez',
      coalesce(v_d.repartidor_nombre, 'Un delivery') || ' no puede buscarla (' || btrim(p_motivo) || ')'
        || coalesce(' · proveedor ' || v_prov, '') || '. Está libre para otro delivery.',
      '#/app/delivery/telefono', 'del-disp-' || v_d.orden_id::text || '-c' || v_d.id::text);
  end if;
  return v_d;
end $$;

-- Fotos ya subidas al bucket: al recibir del proveedor (recibo) o al entregar (entrega).
create or replace function public.delivery_fotos(p_pedido_id uuid, p_tipo text, p_fotos jsonb) returns public.delivery_pedidos
language plpgsql security definer set search_path = '' as $$
declare v_d public.delivery_pedidos; f jsonb;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if p_tipo not in ('recibo', 'entrega') then raise exception 'Tipo de foto inválido.' using errcode = '23514'; end if;
  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' or jsonb_array_length(p_fotos) > 6 then
    raise exception 'Se pueden adjuntar hasta 6 fotos.' using errcode = '23514';
  end if;
  -- GT: cada ruta debe ser de este pedido y de este momento (no se cuelan fotos ajenas).
  for f in select x from jsonb_array_elements(p_fotos) x loop
    if jsonb_typeof(f) <> 'object' or coalesce(f ->> 'path', '') not like p_pedido_id::text || '/' || p_tipo || '-%'
       or position('..' in coalesce(f ->> 'path', '')) > 0 then
      raise exception 'La foto % no corresponde a este pedido.', coalesce(f ->> 'path', '?') using errcode = '23514';
    end if;
  end loop;
  select * into v_d from public.delivery_pedidos where id = p_pedido_id for update;
  if v_d.id is null then raise exception 'No se encontró el pedido.' using errcode = '23503'; end if;
  if v_d.repartidor_id <> auth.uid() and not public.delivery_puede('full') then
    raise exception 'Solo el delivery que tomó el pedido puede subir sus fotos.' using errcode = '42501';
  end if;
  update public.delivery_pedidos set
    fotos_recibo = case when p_tipo = 'recibo' then p_fotos else fotos_recibo end,
    fotos_entrega = case when p_tipo = 'entrega' then p_fotos else fotos_entrega end,
    updated_at = now()
  where id = p_pedido_id returning * into v_d;
  return v_d;
end $$;

-- El motorizado comparte su ubicación (una fila por motorizado, se pisa).
create or replace function public.delivery_ubicar(
  p_lat double precision, p_lng double precision, p_precision double precision default null,
  p_velocidad double precision default null, p_rumbo double precision default null, p_pedido_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if not public.delivery_puede('escritura') then
    raise exception 'No tienes permiso de escritura en Delivery.' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'Ubicación inválida.' using errcode = '23514';
  end if;
  select email into v_email from public.usuarios where id = auth.uid();
  insert into public.delivery_ubicaciones (repartidor_id, repartidor_email, repartidor_nombre, lat, lng, precision_m, velocidad, rumbo, pedido_id, actualizado_en)
  values (auth.uid(), v_email, public.delivery_nombre_usuario(v_email), p_lat, p_lng, p_precision, p_velocidad, p_rumbo, p_pedido_id, now())
  on conflict (repartidor_id) do update set
    lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m, velocidad = excluded.velocidad,
    rumbo = excluded.rumbo, pedido_id = excluded.pedido_id, repartidor_nombre = excluded.repartidor_nombre,
    repartidor_email = excluded.repartidor_email, actualizado_en = now();
end $$;

-- El comprobante de pago de Tesorería: el motorizado verifica, antes de ir al
-- proveedor, que la OC de verdad se pagó. Devuelve solo lo del pago (GT: los
-- comprobantes guardados en la OC), no la OC entera. Los archivos están en el
-- bucket compras-oc, que ya leen los usuarios activos (is_operativo()).
create or replace function public.delivery_comprobante_pago(p_orden_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_o record;
begin
  if not public.delivery_puede('lectura') then
    raise exception 'No tienes permiso en Delivery.' using errcode = '42501';
  end if;
  select o.id, o.oc_codigo, o.pagada_en, o.total, o.total_moneda, o.comprobantes_pago, o.factura_path, o.factura_nombre, o.metodo_pago
    into v_o from public.ordenes o where o.id = p_orden_id;
  if not found then
    raise exception 'La orden no existe.';
  end if;
  if v_o.pagada_en is null
     and not exists (select 1 from public.delivery_pedidos d where d.orden_id = p_orden_id) then
    raise exception 'Esta orden todavía no está pagada.';
  end if;
  return jsonb_build_object(
    'id', v_o.id,
    'oc_codigo', v_o.oc_codigo,
    'pagada_en', v_o.pagada_en,
    'total', v_o.total,
    'total_moneda', coalesce(v_o.total_moneda, 'USD'),
    'comprobantes_pago', coalesce(to_jsonb(v_o.comprobantes_pago), '[]'::jsonb),
    'factura_path', v_o.factura_path,
    'factura_nombre', v_o.factura_nombre,
    'metodo_pago', coalesce(to_jsonb(v_o.metodo_pago), '[]'::jsonb)
  );
end $$;

revoke all on function public.delivery_conectado() from public, anon;
revoke all on function public.delivery_desde() from public, anon;
revoke all on function public.delivery_puede(text) from public, anon;
revoke all on function public.delivery_nombre_usuario(text) from public, anon;
revoke all on function public.delivery_pedidos_listado(boolean) from public, anon;
revoke all on function public.delivery_tomar(uuid) from public, anon;
revoke all on function public.delivery_avanzar(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.delivery_fotos(uuid, text, jsonb) from public, anon;
revoke all on function public.delivery_ubicar(double precision, double precision, double precision, double precision, double precision, uuid) from public, anon;
revoke all on function public.delivery_comprobante_pago(uuid) from public, anon;
grant execute on function public.delivery_conectado() to authenticated;
grant execute on function public.delivery_desde() to authenticated;
grant execute on function public.delivery_puede(text) to authenticated;
grant execute on function public.delivery_nombre_usuario(text) to authenticated;
grant execute on function public.delivery_pedidos_listado(boolean) to authenticated;
grant execute on function public.delivery_tomar(uuid) to authenticated;
grant execute on function public.delivery_avanzar(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.delivery_fotos(uuid, text, jsonb) to authenticated;
grant execute on function public.delivery_ubicar(double precision, double precision, double precision, double precision, double precision, uuid) to authenticated;
grant execute on function public.delivery_comprobante_pago(uuid) to authenticated;


-- =====================================================================
-- 4) GT: aviso al rol 'delivery' cuando una OC queda disponible
--    El trigger trg_ordenes_a_delivery (after insert or update on ordenes,
--    when new.estado = 'pagada') ya existía: su función ahora SOLO avisa.
--    Nunca hace fallar el guardado de la orden.
-- =====================================================================
create or replace function public.ordenes_a_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_desde timestamptz; v_prov text; v_dedup text;
begin
  begin
    -- Solo cuando la OC PASA a pagada (no en cada guardado posterior).
    if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
      return null;
    end if;
    v_desde := public.delivery_desde();
    if v_desde is null
       or new.estado is distinct from 'pagada'::public.estado_orden
       or coalesce(new.tipo, 'producto') <> 'producto'
       or new.oc_codigo is null
       or new.recibida_en is not null
       or new.created_at < v_desde then
      return null;
    end if;
    v_dedup := 'del-disp-' || new.id::text;
    if exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup)
       or exists (select 1 from public.delivery_pedidos d where d.orden_id = new.id and d.estado <> 'cancelado') then
      return null;
    end if;
    select nullif(btrim(p.razon_social), '') into v_prov from public.proveedores p where p.id = new.proveedor_id;
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('delivery', 'info',
      '🛵 OC ' || new.oc_codigo || ' lista para buscar',
      'OC ' || new.oc_codigo || ' pagada' || coalesce(' · proveedor ' || v_prov, '')
        || case when coalesce(new.urgente, false) then ' · URGENTE' else '' end || '. Tómala en Delivery.',
      '#/app/delivery/telefono', v_dedup);
  exception when others then
    raise warning 'ordenes_a_delivery(%): %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.ordenes_a_delivery() from public, anon, authenticated;
comment on function public.ordenes_a_delivery() is '31/10/2026 (Delivery igual que MGG): solo avisa al rol delivery que la OC pagada está disponible; ya no crea filas.';


-- =====================================================================
-- 5) Bucket delivery-fotos (mismo nombre que MGG; ya existía en GT)
--    Ruta de MGG: <pedido_id>/<recibo|entrega>-<ts>-<rnd>-<nombre>
--    MGG: lectura = Delivery o Pedidos; subida = escritura en Delivery.
-- =====================================================================
alter policy "delivery-fotos insert" on storage.objects
  with check (bucket_id = 'delivery-fotos'
    and ((select public.is_admin()) or (select public.puede('delivery')))
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(recibo|entrega)-[^/]{1,200}$');
-- MGG no reemplaza archivos (upsert false): la actualización queda solo para admin.
alter policy "delivery-fotos update" on storage.objects
  using (bucket_id = 'delivery-fotos' and (select public.is_admin()))
  with check (bucket_id = 'delivery-fotos' and (select public.is_admin()));
-- "delivery-fotos read" (is_admin / puede_leer delivery / puede_leer pedidos) queda igual: es la de MGG.


-- =====================================================================
-- PRUEBAS (31/10/2026) — bloque DO que termina en raise exception (todo
-- revertido). Ver resultados en el reporte al final.
-- =====================================================================
-- Usuarios (solo dentro de la transacción, con request.jwt.claims):
--   A = asistentecomprasgt2 (analista_de_compras, delivery full) → NAZARET SALAZAR
--   B = comprasanalista9   (analista_de_compras, delivery full) → KELVIN PEÑA
--   L = almacen.pzo.lospinos (almacenista, delivery solo lectura)
-- OC reales usadas solo dentro de la transacción: OC-2026-0181 (A) y OC-2026-0180 (B).
--   T1  interruptor APAGADO: OC A pagada → no aparece (0); tomar → «Delivery
--       todavía no está conectado a Compras.»; 0 avisos.                       OK
--   ON  delivery_desde() = hora de encendido (activado_en).
--       A creada después de encender, pasa a pagada → 1 aviso 'del-disp-A' al
--       rol delivery; B creada ANTES de encender, pagada → 0 avisos.           OK
--   T2  A aparece 'por_tomar'; B (vieja) no aparece (0) y tomarla → «La orden
--       OC-2026-0180 ya no está disponible para delivery».                     OK
--   T3  A la toma → 'aceptado' (NAZARET SALAZAR), el aviso queda leído; B
--       intenta tomarla → «Este pedido ya lo tomó NAZARET SALAZAR.»            OK
--       (B, con full = supervisor, sí puede moverla, igual que en MGG.)
--   T4  almacenista ve el pedido (1) pero tomar → «No tienes permiso de
--       escritura en Delivery.»                                                OK
--   T5  insert directo de una 2a toma viva → unique_violation (índice
--       delivery_pedidos_una_viva).                                            OK
--   T6  cancelar con motivo 'x' → error; con motivo → 'cancelado', aviso
--       «disponible otra vez» al rol delivery; B la ve como disponible
--       ('cancelado' en la lista de activos) y la toma → 'aceptado'.           OK
--   T7  foto con ruta de otro pedido → error; foto propia → 1; entregar sin
--       pasar por en_ruta → «No se puede pasar de aceptado a entregado.»;
--       en_ruta + entregado (General, «Completo») → historial con 3 pasos.     OK
--   T8  ubicación: dos envíos → 1 fila; lat 95 → «Ubicación inválida.»;
--       listado con cerrados trae A; delivery_comprobante_pago devuelve
--       id, oc_codigo, pagada_en, total, total_moneda, comprobantes_pago,
--       factura_path, factura_nombre, metodo_pago.                             OK
-- Después (base real): interruptor en FALSE (activado_en null); 0 filas en
-- delivery_pedidos y delivery_ubicaciones; 0 avisos 'del-disp-%'; las OC de
-- prueba siguen en 'oc_creada'.
-- get_advisors (security): lo único de Delivery es el aviso esperado
-- «authenticated_security_definer_function_executable» de las 10 funciones
-- (igual que el resto de RPC del sistema: validan el permiso por dentro).
