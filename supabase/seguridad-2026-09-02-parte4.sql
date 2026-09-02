-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 4
-- GT-SIN-03 · Ingreso, traslado y conversión de divisas
--
-- QUÉ PASABA
-- Las tres operaciones leían el saldo, calculaban en JavaScript y escribían el
-- resultado. Tres consecuencias:
--
--  1. INGRESO: dos ingresos simultáneos a la misma billetera → uno se pierde, y
--     —peor— la tasa promedio ponderada queda calculada sobre un saldo base
--     equivocado, contaminando el costo en Bs de TODO el saldo restante y la
--     disponibilidad financiera que muestra el panel.
--
--  2. TRASLADO: descuenta el origen en una llamada y suma al destino en otra,
--     sin transacción. Si la segunda falla —red, permiso, pestaña cerrada— EL
--     DINERO DESAPARECE: salió de una caja y nunca llegó a la otra.
--
--  3. CONVERSIÓN: idéntico al traslado, pero entre monedas de la misma caja.
--
-- QUÉ CAMBIA
-- Tres funciones que hacen todo bajo `for update`, en UNA transacción. El
-- promedio ponderado se calcula adentro, sobre el saldo real del momento.
-- El traslado y la conversión bloquean las dos filas en orden estable para que
-- dos traslados cruzados no se traben entre sí (deadlock).
--
-- No son SECURITY DEFINER a propósito: corren con los permisos de quien llama,
-- así que la RLS de caja_saldos (puede('tesoreria') y compañía) sigue mandando.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1) INGRESO · suma y re-promedia la tasa bajo el lock
-- ───────────────────────────────────────────────────────────────────
create or replace function public.aplicar_ingreso_divisa(
  p_caja_id uuid, p_cuenta text, p_moneda text, p_monto numeric, p_tasa_bs numeric default null)
returns jsonb language plpgsql as $fn$
declare
  v_antes numeric; v_tasa_antes numeric; v_desp numeric; v_tasa numeric;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor que 0.';
  end if;

  select saldo, tasa_prom into v_antes, v_tasa_antes
    from public.caja_saldos
   where caja_id = p_caja_id and cuenta = p_cuenta and moneda = p_moneda
   for update;
  v_antes      := coalesce(v_antes, 0);
  v_tasa_antes := coalesce(v_tasa_antes, 0);
  v_desp       := round(v_antes + p_monto, 2);

  -- Promedio ponderado (Bs por unidad). Bs siempre 1.
  if p_moneda = 'Bs' then
    v_tasa := 1;
  elsif v_antes > 0 and v_tasa_antes > 0 and coalesce(p_tasa_bs, 0) > 0 then
    v_tasa := round((v_antes * v_tasa_antes + p_monto * p_tasa_bs) / v_desp, 4);
  else
    v_tasa := coalesce(nullif(p_tasa_bs, 0), nullif(v_tasa_antes, 0));
  end if;

  insert into public.caja_saldos (caja_id, cuenta, moneda, saldo, tasa_prom, updated_at)
  values (p_caja_id, p_cuenta, p_moneda, v_desp, v_tasa, now())
  on conflict (caja_id, cuenta, moneda)
  do update set saldo = excluded.saldo, tasa_prom = excluded.tasa_prom, updated_at = now();

  return jsonb_build_object(
    'saldo_antes', v_antes, 'saldo_despues', v_desp,
    'tasa_prom', v_tasa, 'tasa_antes', v_tasa_antes);
end $fn$;


-- ───────────────────────────────────────────────────────────────────
-- 2) TRASLADO entre cajas · los dos lados en una sola transacción
-- ───────────────────────────────────────────────────────────────────
create or replace function public.trasladar_divisa(
  p_origen uuid, p_destino uuid, p_cuenta text, p_moneda text, p_monto numeric)
returns jsonb language plpgsql as $fn$
declare
  v_oa numeric; v_ot numeric; v_od numeric;
  v_da numeric; v_dt numeric; v_dd numeric; v_nueva numeric;
begin
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor que 0.';
  end if;
  if p_origen = p_destino then
    raise exception 'El destino debe ser una caja distinta.';
  end if;

  -- Orden estable de bloqueo: así un traslado A→B y otro B→A no se traban.
  if p_origen < p_destino then
    select saldo, tasa_prom into v_oa, v_ot from public.caja_saldos
      where caja_id = p_origen  and cuenta = p_cuenta and moneda = p_moneda for update;
    select saldo, tasa_prom into v_da, v_dt from public.caja_saldos
      where caja_id = p_destino and cuenta = p_cuenta and moneda = p_moneda for update;
  else
    select saldo, tasa_prom into v_da, v_dt from public.caja_saldos
      where caja_id = p_destino and cuenta = p_cuenta and moneda = p_moneda for update;
    select saldo, tasa_prom into v_oa, v_ot from public.caja_saldos
      where caja_id = p_origen  and cuenta = p_cuenta and moneda = p_moneda for update;
  end if;

  v_oa := coalesce(v_oa, 0);
  v_ot := coalesce(v_ot, case when p_moneda = 'Bs' then 1 else 0 end);
  v_da := coalesce(v_da, 0);
  v_dt := coalesce(v_dt, 0);

  if v_oa - p_monto < -0.005 then
    raise exception 'Saldo insuficiente en % (%). Disponible: %.', p_moneda, p_cuenta, v_oa
      using errcode = 'P0001';
  end if;

  v_od := round(v_oa - p_monto, 2);
  v_dd := round(v_da + p_monto, 2);

  -- El destino hereda la tasa del origen, ponderada con lo que ya tenía.
  if p_moneda = 'Bs' then          v_nueva := 1;
  elsif v_dd > 0 then              v_nueva := round((v_da * v_dt + p_monto * v_ot) / v_dd, 4);
  else                             v_nueva := v_ot;
  end if;

  update public.caja_saldos set saldo = v_od, updated_at = now()
   where caja_id = p_origen and cuenta = p_cuenta and moneda = p_moneda;

  insert into public.caja_saldos (caja_id, cuenta, moneda, saldo, tasa_prom, updated_at)
  values (p_destino, p_cuenta, p_moneda, v_dd, v_nueva, now())
  on conflict (caja_id, cuenta, moneda)
  do update set saldo = excluded.saldo, tasa_prom = excluded.tasa_prom, updated_at = now();

  return jsonb_build_object(
    'origen_antes',  v_oa, 'origen_despues',  v_od, 'origen_tasa',  v_ot,
    'destino_antes', v_da, 'destino_despues', v_dd, 'destino_tasa', v_nueva);
end $fn$;


-- ───────────────────────────────────────────────────────────────────
-- 3) CONVERSIÓN entre monedas de la MISMA caja
-- ───────────────────────────────────────────────────────────────────
create or replace function public.convertir_divisa_caja(
  p_caja_id uuid,
  p_cuenta_desde text, p_moneda_desde text, p_monto_desde numeric,
  p_cuenta_hacia text, p_moneda_hacia text, p_monto_hacia numeric,
  p_tasa_bs_hacia numeric default null)
returns jsonb language plpgsql as $fn$
declare
  v_oa numeric; v_ot numeric; v_od numeric;
  v_da numeric; v_dt numeric; v_dd numeric; v_nueva numeric;
  v_k_desde text := p_cuenta_desde || '|' || p_moneda_desde;
  v_k_hacia text := p_cuenta_hacia || '|' || p_moneda_hacia;
begin
  if coalesce(p_monto_desde, 0) <= 0 or coalesce(p_monto_hacia, 0) <= 0 then
    raise exception 'Indicá montos válidos para convertir.';
  end if;
  if v_k_desde = v_k_hacia then
    raise exception 'Elegí monedas (o cuentas) distintas para convertir.';
  end if;

  -- Orden estable de bloqueo dentro de la misma caja.
  if v_k_desde < v_k_hacia then
    select saldo, tasa_prom into v_oa, v_ot from public.caja_saldos
      where caja_id = p_caja_id and cuenta = p_cuenta_desde and moneda = p_moneda_desde for update;
    select saldo, tasa_prom into v_da, v_dt from public.caja_saldos
      where caja_id = p_caja_id and cuenta = p_cuenta_hacia and moneda = p_moneda_hacia for update;
  else
    select saldo, tasa_prom into v_da, v_dt from public.caja_saldos
      where caja_id = p_caja_id and cuenta = p_cuenta_hacia and moneda = p_moneda_hacia for update;
    select saldo, tasa_prom into v_oa, v_ot from public.caja_saldos
      where caja_id = p_caja_id and cuenta = p_cuenta_desde and moneda = p_moneda_desde for update;
  end if;

  v_oa := coalesce(v_oa, 0); v_ot := coalesce(v_ot, 0);
  v_da := coalesce(v_da, 0); v_dt := coalesce(v_dt, 0);

  if v_oa - p_monto_desde < -0.005 then
    raise exception 'Saldo insuficiente en % (%). Disponible: %.', p_moneda_desde, p_cuenta_desde, v_oa
      using errcode = 'P0001';
  end if;

  v_od := round(v_oa - p_monto_desde, 2);
  v_dd := round(v_da + p_monto_hacia, 2);

  if p_moneda_hacia = 'Bs' then
    v_nueva := 1;
  elsif v_da > 0 and v_dt > 0 and coalesce(p_tasa_bs_hacia, 0) > 0 then
    v_nueva := round((v_da * v_dt + p_monto_hacia * p_tasa_bs_hacia) / v_dd, 4);
  else
    v_nueva := coalesce(nullif(p_tasa_bs_hacia, 0), nullif(v_dt, 0), 0);
  end if;

  update public.caja_saldos set saldo = v_od, updated_at = now()
   where caja_id = p_caja_id and cuenta = p_cuenta_desde and moneda = p_moneda_desde;

  insert into public.caja_saldos (caja_id, cuenta, moneda, saldo, tasa_prom, updated_at)
  values (p_caja_id, p_cuenta_hacia, p_moneda_hacia, v_dd, v_nueva, now())
  on conflict (caja_id, cuenta, moneda)
  do update set saldo = excluded.saldo, tasa_prom = excluded.tasa_prom, updated_at = now();

  return jsonb_build_object(
    'origen_antes',  v_oa, 'origen_despues',  v_od, 'origen_tasa',  v_ot,
    'destino_antes', v_da, 'destino_despues', v_dd, 'destino_tasa', v_nueva);
end $fn$;


-- ───────────────────────────────────────────────────────────────────
-- Permisos: fuera el anónimo (la clave anon es pública).
-- ───────────────────────────────────────────────────────────────────
revoke execute on function public.aplicar_ingreso_divisa(uuid,text,text,numeric,numeric) from public, anon;
revoke execute on function public.trasladar_divisa(uuid,uuid,text,text,numeric)          from public, anon;
revoke execute on function public.convertir_divisa_caja(uuid,text,text,numeric,text,text,numeric,numeric) from public, anon;

grant execute on function public.aplicar_ingreso_divisa(uuid,text,text,numeric,numeric) to authenticated, service_role;
grant execute on function public.trasladar_divisa(uuid,uuid,text,text,numeric)          to authenticated, service_role;
grant execute on function public.convertir_divisa_caja(uuid,text,text,numeric,text,text,numeric,numeric) to authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_puede
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('aplicar_ingreso_divisa','trasladar_divisa','convertir_divisa_caja')
order by 1;
