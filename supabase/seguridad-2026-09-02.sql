-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Correcciones de seguridad · 02/09/2026
-- Origen: auditoría de datos y sincronización (46 hallazgos).
--
-- PASO 1 — Perímetro anónimo.
--   1.a  RLS en las tablas descubiertas ........... YA APLICADO en producción
--   1.b  Funciones SECURITY DEFINER abiertas ..... PENDIENTE (este archivo)
--
-- La guarda de las funciones es uniforme:
--   · bloquea al rol 'anon' (Internet abierto, la clave anon es pública);
--   · a quien llega con sesión le exige el permiso del módulo;
--   · deja pasar al cron y al service_role — auth.uid() nulo y auth.role()
--     distinto de 'anon' — para no romper el puente con MGG ni el posteo
--     semanal de consumo de combustible.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1.a · YA APLICADO el 02/09/2026. Se deja registrado para que
--       supabase/schema.sql quede sincronizado con producción.
-- ───────────────────────────────────────────────────────────────────
-- alter table public.compras_directas            enable row level security;
-- alter table public.combustibles                enable row level security;
-- alter table public.combustible_movimientos     enable row level security;
-- alter table public.combustible_solicitudes     enable row level security;
-- alter table public._bkp_productos_prealmacen   enable row level security;
-- alter table public._bkp_existencias_prealmacen enable row level security;
-- revoke all on public._bkp_productos_prealmacen   from anon, authenticated;
-- revoke all on public._bkp_existencias_prealmacen from anon, authenticated;


-- ───────────────────────────────────────────────────────────────────
-- 1.b · GT-EXT-04 · Blindaje de funciones SECURITY DEFINER
-- ───────────────────────────────────────────────────────────────────

-- Inyectaba entradas de USD arbitrarias en la caja abierta de Peramanal.
create or replace function public.reflejar_ingreso_mgg_acopio(
  p_transf_id text, p_monto numeric, p_descripcion text, p_actor text, p_actor_name text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
DECLARE v_caja uuid;
BEGIN
  IF auth.role() = 'anon' OR (auth.uid() IS NOT NULL AND NOT public.puede('acopio')) THEN
    RAISE EXCEPTION 'No autorizado para reflejar ingresos en la caja de Peramanal.';
  END IF;
  IF COALESCE(p_monto, 0) <= 0 THEN RETURN; END IF;
  IF p_transf_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM acopio_caja_movimientos WHERE ref_transfer_inter = p_transf_id
  ) THEN RETURN; END IF;
  SELECT id INTO v_caja FROM acopio_cajas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1;
  INSERT INTO acopio_caja_movimientos (
    fecha, descripcion, usd_entregado, clasif_grupo, clasif_valor,
    caja_id, created_by, actor_name, ref_transfer_inter
  ) VALUES (
    (now() AT TIME ZONE 'America/Caracas')::date,
    COALESCE(p_descripcion, 'USD entregado por MGG (sistema externo)'),
    p_monto, 'movimientos_caja', 'USD ENTREGADO MGG',
    v_caja, p_actor, p_actor_name, p_transf_id
  );
END $fn$;


-- Reseteaba los contadores de mantenimiento de cualquier equipo.
create or replace function public.reiniciar_mantenimiento_equipo(
  p_equipo_id uuid, p_horas numeric, p_km numeric)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if auth.role() = 'anon' or (auth.uid() is not null and not public.puede('maquinaria')) then
    raise exception 'No autorizado para reiniciar el mantenimiento de equipos.';
  end if;
  update public.maquinaria_equipos
     set mantenimiento_base_hrs = coalesce(p_horas, mantenimiento_base_hrs),
         mantenimiento_base_km  = coalesce(p_km,   mantenimiento_base_km),
         updated_at = now()
   where id = p_equipo_id;
end $fn$;


-- El guard decía `if not (is_staff() OR auth.uid() is null)`: esa segunda
-- condición AUTORIZABA al anónimo, justo al revés de lo que dice su mensaje
-- de error. Se elimina y se exige staff o permiso de inventario.
create or replace function public.renombrar_almacen(p_id uuid, p_nombre_final text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
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
  -- Referencias denormalizadas por nombre (stock e historial quedan consistentes).
  update public.existencias           set almacen = v_new            where almacen = v_old;
  update public.productos             set almacen = v_new            where almacen = v_old;
  update public.movimientos           set almacen = v_new            where almacen = v_old;
  update public.produccion            set almacen_destino = v_new    where almacen_destino = v_old;
  update public.produccion_materiales set almacen = v_new            where almacen = v_old;
  update public.compras_directas      set almacen = v_new            where almacen = v_old;
  update public.solicitudes_salida    set almacen_origen = v_new     where almacen_origen = v_old;
  update public.solicitudes_salida    set almacen_destino = v_new    where almacen_destino = v_old;
  update public.ordenes               set almacen_destino = v_new    where almacen_destino = v_old;
end $fn$;


-- Borraba e insertaba movimientos de caja en el rango que le pasaran.
-- El cuerpo no cambia; solo se le antepone la guarda. La llama el cron
-- (cron_consumo_combustible_semanal) y también la UI de Combustible.
create or replace function public.postear_consumo_combustible_semana(
  p_desde date, p_hasta date, p_actor text default 'cron')
returns numeric language plpgsql security definer set search_path to 'public' as $fn$
DECLARE v_usd numeric; v_litros numeric; v_tasa numeric; v_caja uuid; v_periodo text; v_semana text;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.uid() IS NOT NULL AND NOT (public.puede('combustible') OR public.puede('acopio'))) THEN
    RAISE EXCEPTION 'No autorizado para postear el consumo semanal de combustible.';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido.';
  END IF;
  v_periodo := 'combustible:' || to_char(p_desde,'YYYY-MM-DD') || '..' || to_char(p_hasta,'YYYY-MM-DD');
  v_semana  := to_char(p_desde,'DD/MM') || '–' || to_char(p_hasta,'DD/MM');

  SELECT COALESCE(SUM(litros),0) INTO v_litros
    FROM public.combustible_tanque_movimientos
   WHERE tipo='uso' AND fecha BETWEEN p_desde AND p_hasta;

  SELECT CASE WHEN COALESCE(SUM(saldo_litros),0) > 0
              THEN SUM(saldo_litros * tasa_usd_litro) / SUM(saldo_litros) ELSE 0 END
    INTO v_tasa
    FROM public.combustible_tanques
   WHERE position('brasileros' in lower(nombre)) = 0;

  v_usd := round(v_litros * v_tasa, 2);

  DELETE FROM public.acopio_caja_movimientos
   WHERE ref_combustible_periodo IN (v_periodo, v_periodo || ':entrada');

  IF v_usd <= 0 THEN RETURN 0; END IF;

  SELECT id INTO v_caja FROM public.acopio_cajas WHERE estado='abierta' ORDER BY created_at DESC LIMIT 1;
  IF v_caja IS NULL THEN
    RAISE EXCEPTION 'No hay una caja de Peramanal abierta para cargar el consumo.';
  END IF;

  INSERT INTO public.acopio_caja_movimientos
    (fecha, descripcion, gastos, clasif_grupo, clasif_valor, caja_id, ref_combustible_periodo, created_by, actor_name)
  VALUES
    (p_hasta,
     'CONSUMO COMBUSTIBLE GT · semana ' || v_semana || ' · '
       || trim(to_char(v_litros,'FM999999990.##')) || ' L × '
       || trim(to_char(round(v_tasa,4),'FM990.0000')) || ' $/L (tasa tarjeta)',
     v_usd, 'gastos_caja', 'GASOIL', v_caja, v_periodo, p_actor, 'Consumo semanal (automático)');

  INSERT INTO public.acopio_caja_movimientos
    (fecha, descripcion, usd_entregado, clasif_grupo, clasif_valor, caja_id, ref_combustible_periodo, created_by, actor_name)
  VALUES
    (p_hasta,
     'ENTRADA MULTIMONEDA · consumo combustible GT · semana ' || v_semana,
     v_usd, 'movimientos_caja', '2. CAJA MULTIMONEDAS MGG / CAJA PERAMANAL', v_caja, v_periodo || ':entrada', p_actor, 'Consumo semanal (automático)');

  RETURN v_usd;
END $fn$;


-- next_correlativo era SECURITY DEFINER sin search_path fijo.
alter function public.next_correlativo(text) set search_path = public;


-- ───────────────────────────────────────────────────────────────────
-- Permisos de ejecución: fuera el anónimo.
-- directorio_usuarios NO cambia de cuerpo (es una lectura legítima para
-- quien tiene sesión), solo deja de estar abierta a Internet.
-- ───────────────────────────────────────────────────────────────────
revoke execute on function public.reflejar_ingreso_mgg_acopio(text,numeric,text,text,text) from public, anon;
revoke execute on function public.reiniciar_mantenimiento_equipo(uuid,numeric,numeric)     from public, anon;
revoke execute on function public.renombrar_almacen(uuid,text)                             from public, anon;
revoke execute on function public.postear_consumo_combustible_semana(date,date,text)       from public, anon;
revoke execute on function public.directorio_usuarios()                                    from public, anon;
revoke execute on function public.next_correlativo(text)                                   from public, anon;

grant execute on function public.reflejar_ingreso_mgg_acopio(text,numeric,text,text,text) to authenticated, service_role;
grant execute on function public.reiniciar_mantenimiento_equipo(uuid,numeric,numeric)     to authenticated, service_role;
grant execute on function public.renombrar_almacen(uuid,text)                             to authenticated, service_role;
grant execute on function public.postear_consumo_combustible_semana(date,date,text)       to authenticated, service_role;
grant execute on function public.directorio_usuarios()                                    to authenticated, service_role;
grant execute on function public.next_correlativo(text)                                   to authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- Verificación (debe dar anon_puede = false en las seis)
-- ───────────────────────────────────────────────────────────────────
select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_puede,
       coalesce(array_to_string(p.proconfig,','),'SIN search_path') as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('reflejar_ingreso_mgg_acopio','reiniciar_mantenimiento_equipo',
                    'renombrar_almacen','postear_consumo_combustible_semana',
                    'directorio_usuarios','next_correlativo')
order by 1;
