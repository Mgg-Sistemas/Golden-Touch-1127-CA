-- =====================================================================
-- 2026-10-29 · Solicitudes de Pedido pasan PRIMERO por Almacén
-- ---------------------------------------------------------------------
-- Flujo nuevo (APAGADO hasta que la usuaria lo encienda):
--   SP nueva de materiales → estado 'revision_almacen' → Almacén indica,
--   renglón por renglón, cuánto tiene → la SP sigue a Compras ('pendiente')
--   SOLO con lo que falta; si Almacén lo cubre todo, queda 'finalizada'.
--
-- Interruptor: public.sistema_interruptores, clave 'compras_revision_almacen'.
--   Encender:  update public.sistema_interruptores set activo = true
--               where clave = 'compras_revision_almacen';
--   Apagar:    ... set activo = false ...
-- Con el interruptor en FALSE el flujo actual NO cambia en nada: el
-- trigger sale en la primera línea y no toca la orden.
--
-- Aplicado en Supabase GT (rroohciwhpfonklxuoev) el 29/10/2026 en 5 migraciones:
--   1) compras_revision_almacen_1_enum_interruptores
--   2) compras_revision_almacen_2_tabla_revision
--   3) compras_revision_almacen_3_triggers
--   4) compras_revision_almacen_4_rpc_revisar
--   5) compras_revision_almacen_5_rpc_devolver
--
-- Pruebas (29/10/2026, en un bloque DO que terminó en excepción → todo revertido):
--   A) apagado: SP nueva queda 'pendiente', sin revisión.                       OK
--   B) encendido: queda 'revision_almacen', revisión 'por_revisar', aviso a
--      almacenista; RPC con renglón 1 = 6 de 10 → orden 'pendiente', items
--      [4 (orig 10, cub 6), 4 (orig 4, cub 0)], total recalculado, aviso a
--      Compras/admin; devolver → items originales y 'revision_almacen'.       OK
--   C) todo cubierto → 'finalizada', items [], finalizada_por = nombre.        OK
--   D) servicio, SP de Maquinaria y código con sufijo (-1) no se desvían.     OK
--   E) disponible > solicitado e idx inexistente → error claro en español.    OK
--   Después: interruptor en FALSE, 0 revisiones, 0 órdenes de prueba.
-- =====================================================================


-- =====================================================================
-- 1) Estado nuevo + tabla de interruptores del sistema
-- =====================================================================

-- Nuevo valor del enum de ordenes.estado (tipo real: public.estado_orden).
-- Va en su propia migración: un valor de enum recién agregado no se puede
-- usar dentro de la misma transacción.
alter type public.estado_orden add value if not exists 'revision_almacen';

-- Interruptores generales (encender/apagar funciones del sistema sin publicar código).
create table if not exists public.sistema_interruptores (
  clave       text primary key,
  activo      boolean not null default false,
  descripcion text,
  updated_at  timestamptz default now(),
  updated_by  text
);

alter table public.sistema_interruptores enable row level security;

-- Lectura: cualquier usuario logueado (la pantalla necesita saber si está encendido).
create policy "interruptores read auth" on public.sistema_interruptores
  for select to authenticated using (true);
-- Escritura: solo administradores.
create policy "interruptores insert admin" on public.sistema_interruptores
  for insert to authenticated with check ((select public.is_admin()));
create policy "interruptores update admin" on public.sistema_interruptores
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Quién y cuándo lo cambió (se llena solo).
create or replace function public.sistema_interruptores_sello()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', (select u.email from public.usuarios u where u.id = auth.uid()), 'sistema');
  return new;
end $$;
revoke execute on function public.sistema_interruptores_sello() from public, anon, authenticated;

create trigger trg_sistema_interruptores_sello
  before insert or update on public.sistema_interruptores
  for each row execute function public.sistema_interruptores_sello();

-- Auditoría (igual que ordenes / roles_permisos).
create trigger trg_aud_sistema_interruptores
  after insert or update or delete on public.sistema_interruptores
  for each row execute function public.fn_auditar();

-- Fila inicial: APAGADO.
insert into public.sistema_interruptores (clave, activo, descripcion)
values ('compras_revision_almacen', false, 'Las solicitudes de pedido pasan primero por Almacén antes de Compras')
on conflict (clave) do nothing;

-- ¿Está encendido? (false si la clave no existe).
create or replace function public.interruptor_activo(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select si.activo from public.sistema_interruptores si where si.clave = p_clave), false);
$$;
revoke execute on function public.interruptor_activo(text) from public, anon;
grant execute on function public.interruptor_activo(text) to authenticated;

-- Realtime.
alter publication supabase_realtime add table public.sistema_interruptores;


-- =====================================================================
-- 2) Revisión de Almacén por solicitud
-- =====================================================================
create table if not exists public.solicitudes_revision_almacen (
  id                  uuid primary key default gen_random_uuid(),
  orden_id            uuid not null unique references public.ordenes(id) on delete cascade,
  estado              text not null default 'por_revisar' check (estado in ('por_revisar', 'revisada')),
  -- Copia de ordenes.items al entrar a revisión (lo que pidió el solicitante).
  items_original      jsonb not null,
  -- Lo que dijo Almacén: [{idx, nombre, unidad, productoId, cantidad_solicitada,
  --   cantidad_disponible, cantidad_a_comprar, stock_al_revisar}]
  items_revision      jsonb,
  nota                text,
  texto_whatsapp      text,
  revisada_por        text,
  revisada_por_nombre text,
  revisada_en         timestamptz,
  created_at          timestamptz default now()
);

create index if not exists solicitudes_revision_almacen_estado_idx
  on public.solicitudes_revision_almacen (estado, created_at);

alter table public.solicitudes_revision_almacen enable row level security;

-- Lectura: Almacén (inventario) y Compras (pedidos). Escritura: SOLO vía el
-- trigger y los RPC (security definer); no hay políticas de insert/update/delete.
create policy "rev_almacen read inv_ped" on public.solicitudes_revision_almacen
  for select to authenticated
  using ((select public.is_admin()) or (select public.puede('inventario')) or (select public.puede('pedidos')));

create trigger trg_aud_solicitudes_revision_almacen
  after insert or update or delete on public.solicitudes_revision_almacen
  for each row execute function public.fn_auditar();

alter publication supabase_realtime add table public.solicitudes_revision_almacen;


-- =====================================================================
-- 3) Triggers en ordenes
-- =====================================================================

-- BEFORE INSERT: desvía la SP nueva a Almacén. Solo SP normales de MATERIALES:
--   · tipo 'producto' (nunca servicios SS)
--   · sin op_padre_id (nunca OC hijas / repartos) y código SP-AAAA-#### sin sufijo
--   · afecta_inventario (no compras que no entran a inventario)
--   · ningún renglón marcado es_servicio
--   · NO las SP que crea Maquinaria desde una orden de servicio
--     (maquinaria_pedir_compra_orden): esas ya descontaron lo que hay en
--     inventario (a_comprar) y al finalizarse moverían la orden de servicio.
-- Compras directas y servicios directos viven en otras tablas: no pasan por aquí.
create or replace function public.ordenes_a_revision_almacen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Interruptor APAGADO → el flujo de hoy, sin tocar nada.
  if not public.interruptor_activo('compras_revision_almacen') then
    return new;
  end if;

  if new.estado is distinct from 'pendiente'::public.estado_orden
     or coalesce(new.tipo, 'producto') <> 'producto'
     or new.op_padre_id is not null
     or not coalesce(new.afecta_inventario, true)
     or coalesce(new.codigo, '') !~ '^SP-[0-9]{4}-[0-9]+$'
     or jsonb_typeof(new.items) is distinct from 'array'
     or jsonb_array_length(new.items) = 0
     or (upper(coalesce(new.unidad_solicitante, '')) = 'MAQUINARIA'
         and coalesce(new.notas, '') like 'Orden de servicio %')
     or exists (select 1 from jsonb_array_elements(new.items) it
                 where coalesce(it ->> 'es_servicio', 'false') = 'true')
  then
    return new;
  end if;

  new.estado := 'revision_almacen'::public.estado_orden;
  new.historial := coalesce(new.historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'evento', 'enviada_revision_almacen',
    'actor', coalesce(new.solicitante_email, auth.jwt() ->> 'email', 'sistema'),
    'motivo', 'Enviada a Almacén para revisar existencias antes de Compras'));
  return new;
end $$;
revoke execute on function public.ordenes_a_revision_almacen() from public, anon, authenticated;

create trigger trg_ordenes_a_revision_almacen
  before insert on public.ordenes
  for each row
  when (new.estado = 'pendiente'::public.estado_orden and new.tipo = 'producto' and new.op_padre_id is null)
  execute function public.ordenes_a_revision_almacen();

-- AFTER INSERT: crea la revisión y avisa a Almacén.
create or replace function public.ordenes_revision_almacen_crear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dedup text := 'sp-rev-alm-' || new.id;
begin
  insert into public.solicitudes_revision_almacen (orden_id, items_original)
  values (new.id, coalesce(new.items, '[]'::jsonb))
  on conflict (orden_id) do nothing;

  if not exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup and n.read = false) then
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('almacenista', 'info',
      '📦 Solicitud ' || new.codigo || ' por revisar',
      'Nueva solicitud ' || new.codigo || ' para revisar en Almacén'
        || coalesce(' · ' || nullif(btrim(new.unidad_solicitante), ''), '')
        || ' (' || jsonb_array_length(coalesce(new.items, '[]'::jsonb)) || ' renglón(es)).',
      '#/app/pedidos?tab=almacen',
      v_dedup);
  end if;
  return null;
end $$;
revoke execute on function public.ordenes_revision_almacen_crear() from public, anon, authenticated;

create trigger trg_ordenes_revision_almacen_crear
  after insert on public.ordenes
  for each row
  when (new.estado = 'revision_almacen'::public.estado_orden)
  execute function public.ordenes_revision_almacen_crear();


-- =====================================================================
-- 4) RPC de Almacén
-- =====================================================================

-- Almacén revisa la SP: p_items = [{ "idx": <posición en items_original>,
--   "cantidad_disponible": <0 .. cantidad solicitada> }]. Un renglón que no
-- venga en p_items cuenta como disponible 0 (todo a Compras).
-- NO descuenta stock: Almacén entrega por Salidas como siempre.
create or replace function public.almacen_revisar_solicitud(
  p_orden_id uuid,
  p_items jsonb,
  p_nota text default null,
  p_texto_whatsapp text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o        public.ordenes%rowtype;
  v_r        public.solicitudes_revision_almacen%rowtype;
  v_email    text := coalesce(auth.jwt() ->> 'email', 'sistema');
  v_nombre   text;
  v_at       text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_n        int;
  v_map      jsonb := '{}'::jsonb;
  e          jsonb;
  it         jsonb;
  v_ord      bigint;
  v_idx      int;
  v_disp     numeric;
  v_sol      numeric;
  v_comp     numeric;
  v_pid      uuid;
  v_stock    numeric;
  v_rev      jsonb := '[]'::jsonb;
  v_items    jsonb := '[]'::jsonb;
  v_ndisp    int := 0;
  v_ncomp    int := 0;
  v_estado   public.estado_orden;
  v_hist     jsonb;
  v_texto    text;
  v_rol      text;
  v_dedup    text;
begin
  if not (public.is_admin() or public.puede('inventario')) then
    raise exception 'No tienes permiso para revisar solicitudes en Almacén.' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'La revisión debe traer la lista de renglones (arreglo).' using errcode = '22023';
  end if;

  select * into v_o from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  select * into v_r from public.solicitudes_revision_almacen where orden_id = p_orden_id for update;
  if not found then
    raise exception 'La solicitud % no tiene revisión de Almacén.', v_o.codigo using errcode = 'P0002';
  end if;
  if v_o.estado <> 'revision_almacen'::public.estado_orden then
    raise exception 'La solicitud % ya no está en revisión de Almacén (estado: %).', v_o.codigo, v_o.estado using errcode = '22023';
  end if;
  if v_r.estado <> 'por_revisar' then
    raise exception 'La solicitud % ya fue revisada por Almacén.', v_o.codigo using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), u.email)
    into v_nombre from public.usuarios u where u.id = auth.uid();
  v_nombre := coalesce(v_nombre, v_email);

  v_n := jsonb_array_length(v_r.items_original);

  -- Valida lo que manda Almacén.
  for e in select x from jsonb_array_elements(p_items) x loop
    if jsonb_typeof(e -> 'idx') is distinct from 'number'
       or (e ->> 'idx')::numeric <> trunc((e ->> 'idx')::numeric) then
      raise exception 'Cada renglón debe traer su posición (idx) como número entero.' using errcode = '22023';
    end if;
    v_idx := (e ->> 'idx')::int;
    if v_idx < 0 or v_idx >= v_n then
      raise exception 'El renglón % no existe en la solicitud % (tiene % renglones).', v_idx + 1, v_o.codigo, v_n using errcode = '22023';
    end if;
    if v_map ? v_idx::text then
      raise exception 'El renglón % viene repetido en la revisión.', v_idx + 1 using errcode = '22023';
    end if;
    if jsonb_typeof(e -> 'cantidad_disponible') is distinct from 'number' then
      raise exception 'El renglón % debe traer la cantidad disponible como número.', v_idx + 1 using errcode = '22023';
    end if;
    v_disp := (e ->> 'cantidad_disponible')::numeric;
    if v_disp < 0 then
      raise exception 'El renglón %: la cantidad disponible no puede ser negativa.', v_idx + 1 using errcode = '22023';
    end if;
    v_map := v_map || jsonb_build_object(v_idx::text, v_disp);
  end loop;

  -- Calcula renglón por renglón.
  for it, v_ord in select x, o from jsonb_array_elements(v_r.items_original) with ordinality as t(x, o) loop
    v_idx  := (v_ord - 1)::int;
    v_sol  := coalesce(nullif(it ->> 'cantidad', '')::numeric, 0);
    v_disp := coalesce((v_map ->> v_idx::text)::numeric, 0);
    if v_disp > v_sol then
      raise exception 'Renglón % (%): lo disponible (%) no puede ser mayor que lo solicitado (%).',
        v_idx + 1, coalesce(it ->> 'nombre', 's/n'), v_disp, v_sol using errcode = '22023';
    end if;
    v_comp := v_sol - v_disp;

    v_pid := case when coalesce(it ->> 'productoId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (it ->> 'productoId')::uuid end;
    v_stock := null;
    if v_pid is not null then
      select p.stock into v_stock from public.productos p where p.id = v_pid;
    end if;

    v_rev := v_rev || jsonb_build_array(jsonb_build_object(
      'idx', v_idx,
      'nombre', it -> 'nombre',
      'unidad', it -> 'unidad',
      'productoId', it -> 'productoId',
      'cantidad_solicitada', v_sol,
      'cantidad_disponible', v_disp,
      'cantidad_a_comprar', v_comp,
      'stock_al_revisar', v_stock));

    if v_disp > 0 then v_ndisp := v_ndisp + 1; end if;
    if v_comp > 0 then
      v_ncomp := v_ncomp + 1;
      v_items := v_items || jsonb_build_array(it || jsonb_build_object(
        'cantidad', v_comp,
        'cantidad_solicitada_original', v_sol,
        'cubierto_almacen', v_disp));
    end if;
  end loop;

  v_texto := 'Revisada por Almacén: ' || v_ndisp || ' renglón(es) disponible(s), ' || v_ncomp || ' a Compras';
  v_hist := jsonb_build_array(jsonb_build_object(
    'at', v_at, 'evento', 'revisada_almacen', 'actor', v_email, 'actor_nombre', v_nombre,
    'motivo', v_texto || coalesce('. Nota: ' || nullif(btrim(p_nota), ''), ''),
    'renglones_disponibles', v_ndisp, 'renglones_a_compras', v_ncomp));

  if v_ncomp > 0 then
    v_estado := 'pendiente'::public.estado_orden;
    update public.ordenes
       set items = v_items,
           total = coalesce((select sum(coalesce(nullif(x ->> 'cantidad', '')::numeric, 0)
                                       * coalesce(nullif(x ->> 'precio', '')::numeric, 0))
                               from jsonb_array_elements(v_items) x), 0),
           estado = v_estado,
           historial = coalesce(historial, '[]'::jsonb) || v_hist
     where id = p_orden_id;
  else
    v_estado := 'finalizada'::public.estado_orden;
    update public.ordenes
       set items = v_items,
           total = 0,
           estado = v_estado,
           finalizada_por = v_nombre,
           finalizada_en = now(),
           historial = coalesce(historial, '[]'::jsonb) || v_hist || jsonb_build_array(jsonb_build_object(
             'at', v_at, 'evento', 'finalizada', 'actor', v_email, 'actor_nombre', v_nombre,
             'motivo', 'Cubierta 100 % por Almacén', 'cubierta_almacen', true))
     where id = p_orden_id;
  end if;

  update public.solicitudes_revision_almacen
     set estado = 'revisada',
         items_revision = v_rev,
         nota = nullif(btrim(p_nota), ''),
         texto_whatsapp = nullif(btrim(p_texto_whatsapp), ''),
         revisada_por = v_email,
         revisada_por_nombre = v_nombre,
         revisada_en = now()
   where id = v_r.id;

  -- El aviso a Almacén ya está atendido.
  update public.notificaciones set read = true
   where dedup_key = 'sp-rev-alm-' || p_orden_id and read = false;

  -- Aviso a Compras (mismos destinos que usa hoy el sistema para las SP nuevas).
  if v_ncomp > 0 then
    foreach v_rol in array array['analista_de_compras', 'admin'] loop
      v_dedup := 'sp-rev-alm-ok-' || p_orden_id || '-' || v_rol;
      if not exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup and n.read = false) then
        insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
        values (v_rol, 'info',
          '🛒 ' || v_o.codigo || ' revisada por Almacén',
          v_o.codigo || ' revisada por Almacén: pasa a Compras con ' || v_ncomp || ' renglón(es)'
            || case when v_ndisp > 0 then ' (Almacén cubre ' || v_ndisp || ')' else '' end || '.',
          '#/app/pedidos', v_dedup);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'estado_orden', v_estado,
    'renglones_disponibles', v_ndisp,
    'renglones_a_compras', v_ncomp,
    'items_revision', v_rev);
end $$;
revoke execute on function public.almacen_revisar_solicitud(uuid, jsonb, text, text) from public, anon;
grant execute on function public.almacen_revisar_solicitud(uuid, jsonb, text, text) to authenticated;

-- Admin devuelve una SP ya revisada a Almacén (si Compras todavía no la tocó).
create or replace function public.almacen_devolver_a_revision(p_orden_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o     public.ordenes%rowtype;
  v_r     public.solicitudes_revision_almacen%rowtype;
  v_email text := coalesce(auth.jwt() ->> 'email', 'sistema');
  v_dedup text := 'sp-rev-alm-' || p_orden_id;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede devolver una solicitud a Almacén.' using errcode = '42501';
  end if;

  select * into v_o from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;
  select * into v_r from public.solicitudes_revision_almacen where orden_id = p_orden_id for update;
  if not found then
    raise exception 'La solicitud % nunca pasó por Almacén.', v_o.codigo using errcode = 'P0002';
  end if;
  if v_r.estado <> 'revisada' then
    raise exception 'La solicitud % todavía está por revisar en Almacén.', v_o.codigo using errcode = '22023';
  end if;
  if v_o.estado <> 'pendiente'::public.estado_orden then
    raise exception 'La solicitud % ya avanzó (estado: %): no se puede devolver a Almacén.', v_o.codigo, v_o.estado using errcode = '22023';
  end if;
  if v_o.aprobada_en is not null or v_o.oc_codigo is not null then
    raise exception 'Compras ya trabajó la solicitud %: no se puede devolver a Almacén.', v_o.codigo using errcode = '22023';
  end if;
  if exists (select 1 from public.ofertas_proveedor op where op.orden_id = p_orden_id) then
    raise exception 'La solicitud % ya tiene cotizaciones cargadas: no se puede devolver a Almacén.', v_o.codigo using errcode = '22023';
  end if;

  update public.ordenes
     set items = v_r.items_original,
         total = coalesce((select sum(coalesce(nullif(x ->> 'cantidad', '')::numeric, 0)
                                     * coalesce(nullif(x ->> 'precio', '')::numeric, 0))
                             from jsonb_array_elements(v_r.items_original) x), 0),
         estado = 'revision_almacen'::public.estado_orden,
         historial = coalesce(historial, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'evento', 'devuelta_revision_almacen', 'actor', v_email,
           'motivo', 'Devuelta a revisión de Almacén'))
   where id = p_orden_id;

  update public.solicitudes_revision_almacen
     set estado = 'por_revisar',
         items_revision = null,
         revisada_por = null,
         revisada_por_nombre = null,
         revisada_en = null
   where id = v_r.id;

  -- El aviso a Compras ya no aplica; vuelve el aviso a Almacén.
  update public.notificaciones set read = true
   where dedup_key like 'sp-rev-alm-ok-' || p_orden_id || '-%' and read = false;
  if not exists (select 1 from public.notificaciones n where n.dedup_key = v_dedup and n.read = false) then
    insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
    values ('almacenista', 'warning',
      '↩️ Solicitud ' || v_o.codigo || ' devuelta a Almacén',
      'La solicitud ' || v_o.codigo || ' volvió a revisión de Almacén. Revísala de nuevo.',
      '#/app/pedidos?tab=almacen', v_dedup);
  end if;

  return jsonb_build_object('estado_orden', 'revision_almacen', 'codigo', v_o.codigo);
end $$;
revoke execute on function public.almacen_devolver_a_revision(uuid) from public, anon;
grant execute on function public.almacen_devolver_a_revision(uuid) to authenticated;

-- 6) (aplicado 29/10/2026, migración compras_revision_almacen_6_enlace_avisos) La ruta de la pantalla
--    quedó /app/solicitudes: los avisos a Almacén se corrigieron arriba (antes #/app/solicitudes-almacen).

-- 7) (aplicado 29/10/2026, migración compras_revision_almacen_7_mercado_directo_compras)
--    La solicitud de MERCADO entra directo por Compras (no pasa por Almacén):
create or replace function public.orden_es_solicitud_mercado(p_items jsonb)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
      left join public.productos p
        on p.id::text = nullif(it ->> 'productoId', '')
        or (nullif(it ->> 'productoId', '') is null and p.sku = nullif(it ->> 'sku', ''))
     where public.es_categoria_comida_cocina(p.categoria)
        or upper(coalesce(it ->> 'finalidad', '')) like '%MERCADO%'
  );
$$;
--    y en ordenes_a_revision_almacen() se agregó a las exclusiones:
--      or public.orden_es_solicitud_mercado(new.items)
--    Probado (begin/rollback, interruptor encendido): SP de COCINA con salchichas → 'pendiente';
--    SP de MINA PERAMANAL con clavos → 'revision_almacen'.

-- 8) (aplicado 29/10/2026, migración compras_revision_almacen_8_enlace_pestana_pedidos)
--    La pantalla vive DENTRO de Pedidos / Compras: los avisos a Almacén abren '#/app/pedidos?tab=almacen'.
