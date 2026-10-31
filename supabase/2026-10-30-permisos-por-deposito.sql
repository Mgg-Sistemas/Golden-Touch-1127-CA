-- ============================================================================
-- 30/10/2026 · Permisos por depósito (depósitos como módulos independientes)
-- ----------------------------------------------------------------------------
-- Pedido: "en la vista de mina tlf, necesito que los depósitos estén por
-- independientes, y en los roles si no le doy el permiso no debe ver el
-- depósito o inventario ... módulos independientes con sus bases de datos y rls".
--
-- Diseño: los depósitos siguen usando las tablas compartidas (productos,
-- existencias, movimientos, deposito_mina_salidas) porque traslados, OC y
-- salidas dependen de ellas; lo que los vuelve independientes es el RLS, que
-- ahora filtra cada fila por su almacén.
--
--  * roles_permisos.almacenes (jsonb): { "<nombre del almacén>": "lectura" | "escritura" }.
--    Si el almacén no está en el mapa, el rol NO lo ve. 'General' (Inventario
--    Los Pinos) no va en el mapa: sigue gobernado por el permiso 'inventario'
--    de siempre (y por puede_inventario() para escribir).
--  * Un "depósito" es cualquier fila de la tabla almacenes con nombre <> 'General'.
--    Los nombres viejos que aparecen en movimientos y no son depósitos
--    registrados ('LOS PINOS', 'PRODUCCION', 'GT MATANZA', 'Viveres y Art.
--    Limpieza', null) se tratan como el General (siguen visibles igual que antes).
--  * El admin ve y escribe todo.
--  * Al crear un depósito nuevo NO se da permiso a nadie: el admin lo asigna en Roles.
--  * Al renombrar un almacén, el permiso de los roles se mueve al nombre nuevo.
--
-- Además (necesario para que cada depósito tenga su propio stock):
--  * registrar_movimiento_stock: el stock se guarda en el almacén del producto
--    (antes todo lo que no era Depósito Mina caía en 'General').
--  * deposito_mina_registrar_salida / deposito_mina_retornar: aceptan cualquier
--    depósito registrado, no solo Depósito Mina (Mina sigue igual: código SDM-).
--
-- Las funciones de stock son SECURITY INVOKER: respetan este RLS, así que solo
-- quien puede escribir en el depósito puede moverle stock.
-- ============================================================================

-- 1. Columna con el mapa de depósitos por rol -------------------------------
alter table public.roles_permisos
  add column if not exists almacenes jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_permisos_almacenes_objeto') then
    alter table public.roles_permisos
      add constraint roles_permisos_almacenes_objeto check (jsonb_typeof(almacenes) = 'object');
  end if;
end $$;

comment on column public.roles_permisos.almacenes is
  'Permiso por depósito: {"<almacenes.nombre>": "lectura"|"escritura"}. Ausente = sin acceso. General no va aquí (lo gobierna el permiso inventario).';

-- 2. Funciones de permiso ----------------------------------------------------
-- Nombres de los depósitos registrados (todo almacén menos el General).
create or replace function public.almacenes_deposito()
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(nombre order by nombre), '{}'::text[])
    from public.almacenes
   where nombre <> 'General';
$$;

-- Depósitos del mapa del rol del usuario actual (escritura=true: solo 'escritura').
create or replace function public._mis_almacenes(p_escritura boolean)
returns text[]
language sql stable security definer
set search_path = public
as $$
  select case
    when public.is_admin() then public.almacenes_deposito()
    else coalesce((
      select array_agg(e.key)
        from public.usuarios u
        join public.roles_permisos rp on rp.role = u.role
        cross join lateral jsonb_each_text(rp.almacenes) e
       where u.id = auth.uid()
         and coalesce(u.estado::text, 'activo') = 'activo'
         and not coalesce(u.must_change_password, false)
         and (e.value = 'escritura' or (not p_escritura and e.value = 'lectura'))
    ), '{}'::text[])
  end;
$$;

create or replace function public.mis_almacenes_lectura()
returns text[]
language sql stable security definer
set search_path = public
as $$ select public._mis_almacenes(false); $$;

create or replace function public.mis_almacenes_escritura()
returns text[]
language sql stable security definer
set search_path = public
as $$ select public._mis_almacenes(true); $$;

-- ¿El usuario actual puede ver el almacén?
create or replace function public.puede_ver_almacen(p_almacen text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.is_admin() then true
    when nullif(btrim(coalesce(p_almacen, '')), '') is null or p_almacen = 'General' then true
    when not (p_almacen = any (public.almacenes_deposito())) then true   -- nombre viejo, no es depósito
    else p_almacen = any (public.mis_almacenes_lectura())
  end;
$$;

-- ¿El usuario actual puede escribir (stock, productos, salidas) en el almacén?
create or replace function public.puede_escribir_almacen(p_almacen text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.is_admin() then true
    when nullif(btrim(coalesce(p_almacen, '')), '') is null
      or p_almacen = 'General'
      or not (p_almacen = any (public.almacenes_deposito())) then public.puede_inventario()
    else p_almacen = any (public.mis_almacenes_escritura())
  end;
$$;

grant execute on function public.almacenes_deposito()               to authenticated;
grant execute on function public._mis_almacenes(boolean)            to authenticated;
grant execute on function public.mis_almacenes_lectura()            to authenticated;
grant execute on function public.mis_almacenes_escritura()          to authenticated;
grant execute on function public.puede_ver_almacen(text)            to authenticated;
grant execute on function public.puede_escribir_almacen(text)       to authenticated;

-- 3. RLS ----------------------------------------------------------------------
-- Misma lógica que puede_ver_almacen / puede_escribir_almacen, escrita con
-- subconsultas (select ...) para que Postgres las evalúe una sola vez por
-- consulta y no una vez por fila (movimientos tiene miles de filas).

-- 3a. productos
alter policy "productos read auth" on public.productos
  using (
    (select auth.role()) = 'authenticated'
    and (almacen is null
         or not (almacen = any ((select public.almacenes_deposito())::text[]))
         or almacen = any ((select public.mis_almacenes_lectura())::text[]))
  );
alter policy "productos write inv" on public.productos
  using (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  )
  with check (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  );
alter policy "productos insert inv" on public.productos
  with check (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  );

-- 3b. existencias
alter policy "existencias read auth" on public.existencias
  using (
    (select auth.role()) = 'authenticated'
    and (almacen is null
         or not (almacen = any ((select public.almacenes_deposito())::text[]))
         or almacen = any ((select public.mis_almacenes_lectura())::text[]))
  );
alter policy "existencias write inv" on public.existencias
  using (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  )
  with check (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  );

-- 3c. movimientos
alter policy "movimientos read auth" on public.movimientos
  using (
    (select auth.role()) = 'authenticated'
    and (almacen is null
         or not (almacen = any ((select public.almacenes_deposito())::text[]))
         or almacen = any ((select public.mis_almacenes_lectura())::text[]))
  );
alter policy "movimientos write inv" on public.movimientos
  using (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  )
  with check (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  );

-- 3d. deposito_mina_salidas (salidas por teléfono de depósitos y del General)
alter policy "dms read" on public.deposito_mina_salidas
  using (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_lectura())::text[])
         else ((select public.puede_leer('inventario')) or (select public.puede_inventario())) end
  );
alter policy "dms insert" on public.deposito_mina_salidas
  with check (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  );
alter policy "dms update" on public.deposito_mina_salidas
  using (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  )
  with check (
    case when almacen = any ((select public.almacenes_deposito())::text[])
         then almacen = any ((select public.mis_almacenes_escritura())::text[])
         else (select public.puede_inventario()) end
  );

-- 4. Semilla: nadie que hoy trabaja en los depósitos pierde acceso -----------
-- Roles con la vista de teléfono 'deposito_mina' y el rol 'almacenista':
-- escritura en todos los depósitos que existen hoy. El resto, nada.
update public.roles_permisos rp
   set almacenes = rp.almacenes || (
         select coalesce(jsonb_object_agg(a.nombre, 'escritura'), '{}'::jsonb)
           from public.almacenes a
          where a.nombre <> 'General'),
       updated_at = now()
 where rp.role = 'almacenista'
    or 'deposito_mina' = any (coalesce(rp.vistas_telefono, '{}'::text[]));

-- 5. Renombrar almacén: mover también el permiso de los roles y las salidas --
create or replace function public.renombrar_almacen(p_id uuid, p_nombre_final text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old text;
  v_new text := nullif(btrim(p_nombre_final), '');
begin
  if auth.role() = 'anon'
     or (auth.uid() is not null and not (public.is_staff() or public.puede('inventario'))) then
    raise exception 'No autorizado para renombrar almacenes.';
  end if;
  if v_new is null then raise exception 'El nombre del almacén no puede estar vacío.'; end if;

  select nombre into v_old from public.almacenes where id = p_id;
  if v_old is null then raise exception 'Almacén no encontrado.'; end if;
  if v_old = v_new then return; end if;

  if exists (select 1 from public.almacenes where nombre = v_new and id <> p_id) then
    raise exception 'Ya existe un almacén con ese nombre.';
  end if;

  update public.almacenes             set nombre = v_new, updated_at = now() where id = p_id;
  update public.existencias           set almacen = v_new            where almacen = v_old;
  update public.productos             set almacen = v_new            where almacen = v_old;
  update public.movimientos           set almacen = v_new            where almacen = v_old;
  update public.produccion            set almacen_destino = v_new    where almacen_destino = v_old;
  update public.produccion_materiales set almacen = v_new            where almacen = v_old;
  update public.compras_directas      set almacen = v_new            where almacen = v_old;
  update public.solicitudes_salida    set almacen_origen = v_new     where almacen_origen = v_old;
  update public.solicitudes_salida    set almacen_destino = v_new    where almacen_destino = v_old;
  update public.ordenes               set almacen_destino = v_new    where almacen_destino = v_old;
  perform set_config('gt.dms_rpc', '1', true);   -- la guardia de salidas deja cambiar el almacén
  update public.deposito_mina_salidas set almacen = v_new            where almacen = v_old;
  perform set_config('gt.dms_rpc', '', true);
  -- El permiso por depósito de cada rol sigue al nombre nuevo.
  update public.roles_permisos
     set almacenes = (almacenes - v_old) || jsonb_build_object(v_new, almacenes -> v_old),
         updated_at = now()
   where almacenes ? v_old;
end $function$;

-- ============================================================================
-- Parte 2 · Stock propio de cada depósito
-- ============================================================================

-- 6. registrar_movimiento_stock: el stock va al almacén del producto ---------
create or replace function public.registrar_movimiento_stock(p jsonb)
 returns movimientos
 language plpgsql
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_producto_id uuid := (p->>'producto_id')::uuid;
  v_almacen     text := 'General';
  v_alm_prod    text;
  v_delta       numeric := coalesce((p->>'delta')::numeric, 0);
  v_tipo        public.tipo_movimiento := (p->>'tipo')::public.tipo_movimiento;
  v_ref_tipo    text := coalesce(p->>'ref_tipo', 'manual');
  v_precio      numeric;
  v_nombre      text;
  v_precio_prod numeric := 0;
  v_stock_antes numeric := 0;
  v_costo_antes numeric := 0;
  v_stock_desp  numeric;
  v_costo       numeric;
  v_total_qty   numeric;
  v_total_stock numeric;
  v_valor       numeric;
  v_mov         public.movimientos;
begin
  if v_producto_id is null then
    raise exception 'producto_id requerido';
  end if;

  select nombre, coalesce(precio, 0), almacen
    into v_nombre, v_precio_prod, v_alm_prod
    from public.productos where id = v_producto_id for update;
  if not found then
    -- Con el RLS por depósito, un producto de un depósito sin permiso no se ve:
    -- no se puede mover su stock (antes caía como 'General').
    raise exception 'No se encontró el producto (o no tienes permiso en su depósito).' using errcode = '42501';
  end if;
  -- Cada depósito es independiente: el stock vive en el almacén del producto
  -- (General = Inventario Los Pinos; Depósito Mina, Reutilizables, Dañados, ...).
  v_almacen := coalesce(nullif(btrim(v_alm_prod), ''), 'General');

  begin
    v_precio := nullif(p->>'precio_unitario','')::numeric;
  exception when others then
    v_precio := null;
  end;

  select coalesce(stock,0), coalesce(costo_promedio,0)
    into v_stock_antes, v_costo_antes
    from public.existencias
   where producto_id = v_producto_id and almacen = v_almacen
   for update;
  v_stock_antes := coalesce(v_stock_antes, 0);
  v_costo_antes := coalesce(v_costo_antes, 0);

  v_stock_desp := v_stock_antes + v_delta;
  if v_stock_desp < 0 then
    if v_ref_tipo = 'cocina' then
      v_stock_desp := 0;
    else
      raise exception 'Stock insuficiente de "%": hay % y se intentaron sacar %.',
        coalesce(v_nombre, 'este producto'),
        trim(to_char(v_stock_antes, 'FM999999990.####')),
        trim(to_char(abs(v_delta),  'FM999999990.####'))
        using errcode = 'check_violation';
    end if;
  end if;

  if v_delta > 0 and v_precio is not null and v_precio > 0 then
    v_total_qty := v_stock_antes + v_delta;
    if v_total_qty <= 0 then
      v_costo := v_precio;
    else
      v_costo := round((v_stock_antes * v_costo_antes + v_delta * v_precio) / v_total_qty, 4);
    end if;
  elsif v_delta > 0 and v_costo_antes <= 0 then
    v_costo := greatest(coalesce(v_precio_prod, 0), 0);
  else
    v_costo := v_costo_antes;
  end if;

  insert into public.movimientos (
    producto_id, tipo, delta, almacen, stock_antes, stock_despues,
    actor, actor_name, ref_tipo, ref_id, ref_codigo, proveedor_id,
    detalle, destino, solicitante, nota_entrega, fecha_entrega,
    precio_unitario, costo_promedio, at
  ) values (
    v_producto_id, v_tipo, v_delta, v_almacen, v_stock_antes, v_stock_desp,
    p->>'actor', p->>'actor_name', v_ref_tipo,
    p->>'ref_id', p->>'ref_codigo', nullif(p->>'proveedor_id','')::uuid,
    p->>'detalle', p->>'destino', p->>'solicitante', p->>'nota_entrega',
    nullif(p->>'fecha_entrega','')::date,
    v_precio, v_costo, coalesce(nullif(p->>'at','')::timestamptz, now())
  ) returning * into v_mov;

  insert into public.existencias (producto_id, almacen, stock, costo_promedio, updated_at)
  values (v_producto_id, v_almacen, v_stock_desp, v_costo, now())
  on conflict (producto_id, almacen)
  do update set stock = excluded.stock, costo_promedio = excluded.costo_promedio, updated_at = now();

  select coalesce(sum(stock),0), coalesce(sum(stock*costo_promedio),0)
    into v_total_stock, v_valor
    from public.existencias where producto_id = v_producto_id;
  if v_total_stock > 0 and v_valor > 0 then
    update public.productos
       set stock = v_total_stock,
           precio = round(v_valor / v_total_stock, 2),
           -- PMP con 4 decimales (el mismo que guarda existencias.costo_promedio).
           precio_promedio = round(v_valor / v_total_stock, 4)
     where id = v_producto_id;
  else
    update public.productos set stock = v_total_stock where id = v_producto_id;
  end if;

  if v_tipo in ('fundicion','fin_fundicion') then
    update public.productos set en_fundicion = (v_tipo = 'fundicion') where id = v_producto_id;
  end if;

  return v_mov;
end;
$function$;

-- 7. Salida por teléfono desde cualquier depósito registrado -----------------
-- Depósito Mina igual que antes (SDM-, ref_tipo deposito_mina_salida).
-- Otros depósitos: código SDP- (correlativo 'salida-deposito'), mismo ref_tipo
-- 'deposito_mina_salida' y la fila en deposito_mina_salidas con su almacén.
create or replace function public.deposito_mina_registrar_salida(p jsonb)
 returns deposito_mina_salidas
 language plpgsql
 set search_path to 'public'
as $function$
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

  v_codigo := case
    when v_alm = 'Depósito Mina' then 'SDM-' || lpad(public.next_correlativo('salida-deposito-mina')::text, 4, '0')
    when v_es_dep               then 'SDP-' || lpad(public.next_correlativo('salida-deposito')::text, 4, '0')
    else                             'SIG-' || lpad(public.next_correlativo('salida-inventario-general')::text, 4, '0') end;
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

create or replace function public.deposito_mina_retornar(p_id uuid, p_cantidad numeric, p_nota text default null::text, p_actor_name text default null::text)
 returns deposito_mina_salidas
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_s public.deposito_mina_salidas;
  v_cant numeric := round(coalesce(p_cantidad, 0), 4);
  v_pend numeric;
  v_actor text := nullif(auth.jwt()->>'email', '');
  v_es_dep boolean;
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
  v_es_dep := v_s.almacen <> 'General';

  perform public.registrar_movimiento_stock(jsonb_build_object(
    'producto_id', v_s.producto_id, 'tipo', 'entrada', 'delta', v_cant, 'almacen', v_s.almacen,
    'actor', v_actor, 'actor_name', p_actor_name,
    'ref_tipo', case when v_es_dep then 'deposito_mina_retorno' else 'inventario_general_retorno' end,
    'ref_id', v_s.id::text, 'ref_codigo', v_s.codigo,
    'detalle', 'Retorno de ' || v_s.codigo || coalesce(' · ' || nullif(btrim(p_nota), ''), '')
      || ' · ' || case when v_es_dep then v_s.almacen else 'Inventario General' end || ' (teléfono)'));

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

-- 8. deposito_mina_salidas acepta cualquier depósito ---------------------------
-- Antes un CHECK solo dejaba 'Depósito Mina' o 'General'. Ahora lo valida
-- deposito_mina_registrar_salida contra la tabla almacenes.
alter table public.deposito_mina_salidas drop constraint if exists deposito_mina_salidas_almacen_chk;
comment on column public.deposito_mina_salidas.almacen is
  'General o cualquier depósito registrado en almacenes (lo valida deposito_mina_registrar_salida).';
