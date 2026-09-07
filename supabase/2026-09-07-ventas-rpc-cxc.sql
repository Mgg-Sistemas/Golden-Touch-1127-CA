-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Módulo de Ventas · La cuenta corriente del cliente baja a la base
--
-- EL PROBLEMA
-- Una venta a crédito son dos escrituras: la venta pasa a «confirmada» y al
-- cliente se le carga la deuda en su cuenta corriente. Hoy la segunda vive en
-- el navegador (`crearOAcumularCuentaPorCobrar`, en el repositorio de
-- Tesorería). Si `confirmar_venta` va a correr en la base, la deuda tiene que
-- ir con ella: si la venta se confirma en la base y el cargo se registra
-- desde el navegador, un corte de red en el medio deja una venta a crédito
-- SIN deuda registrada — plata que nadie debe.
--
-- QUÉ HACEN ESTAS DOS FUNCIONES
-- `crear_o_acumular_cxc` traslada tal cual la lógica que hoy está en
-- TypeScript: la cuenta por cobrar es CORRIENTE por contraparte + moneda. Si
-- ya hay una cuenta abierta del mismo tipo, moneda y contraparte, le SUMA el
-- monto; si no, la crea. En los dos casos deja una fila en
-- `cuentas_por_cobrar_cargos` con el `total_adeudado` del momento, que es el
-- rastro con fecha de cuánto se le fue cargando.
--
-- `revertir_cargo_cxc` es la operación inversa, y es NUEVA: hacía falta porque
-- anular una venta a crédito NO cierra la cuenta del cliente —esa cuenta la
-- comparten otras ventas— sino que le RESTA el monto de esa venta y deja un
-- cargo negativo como rastro. La función vieja rechaza montos <= 0, así que no
-- servía para esto.
--
-- POR QUÉ EL CHECK DE `cargos.monto` CAMBIA
-- `cuentas_por_cobrar_cargos_monto_check` exigía `monto > 0`. Con eso, el
-- cargo negativo de la reversa no entra. Pasa a `monto <> 0`: un cargo sigue
-- sin poder ser cero (no significaría nada), pero puede ser negativo, que es
-- exactamente el rastro de una anulación.
--
-- POR QUÉ NO SE ROMPE NADA DE LO QUE YA EXISTE
-- `crearOAcumularCuentaPorCobrar` se reescribe para llamar a esta RPC, con la
-- misma firma y el mismo retorno. Así no quedan dos implementaciones de la
-- misma regla separándose con el tiempo, y Tesorería gana atomicidad de paso
-- (hoy la cuenta y su cargo son dos viajes: si el segundo falla, la deuda
-- queda cargada sin su rastro).
--
-- `security invoker`: manda el RLS del usuario, igual que si la pantalla
-- escribiera directo. Es el mismo criterio de `devolver_hija_a_padre`.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0 · Un cargo puede ser negativo (la reversa), nunca cero ────────
alter table public.cuentas_por_cobrar_cargos
  drop constraint if exists cuentas_por_cobrar_cargos_monto_check;
alter table public.cuentas_por_cobrar_cargos
  add constraint cuentas_por_cobrar_cargos_monto_check check (monto <> 0);


-- ═══════════════════════════════════════════════════════════════════
-- 1 · crear_o_acumular_cxc
-- ═══════════════════════════════════════════════════════════════════
drop function if exists public.crear_o_acumular_cxc(
  text, text, numeric, text, text, uuid, uuid, text, text, text);

create or replace function public.crear_o_acumular_cxc(
  p_tipo        text,
  p_contraparte text,
  p_monto       numeric,
  p_moneda      text,
  p_cuenta      text default null,
  p_caja_id     uuid default null,
  p_caja_mov_id uuid default null,
  p_nota        text default null,
  p_actor       text default null,
  p_actor_name  text default null,
  -- De que venta viene este cargo. La cuenta es CORRIENTE y acumula varias
  -- ventas del mismo cliente: sin esto, tres ventas a credito se ven como una
  -- deuda sola y no hay forma de decir cual trajo cuanto. El cargo es el unico
  -- lugar donde se distingue una venta de otra.
  p_ref_venta_id uuid default null
) returns public.cuentas_por_cobrar
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_monto       numeric;
  v_contraparte text;
  v_nota        text;
  v_cuenta      public.cuentas_por_cobrar;
  v_adeudado    numeric;
begin
  -- Las mismas dos validaciones que hacía la versión TypeScript.
  v_monto := round(coalesce(p_monto, 0)::numeric, 2);
  if v_monto <= 0 then
    raise exception 'El monto debe ser mayor que 0.';
  end if;
  v_contraparte := btrim(coalesce(p_contraparte, ''));
  if v_contraparte = '' then
    raise exception 'Indica el cliente o proveedor.';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  -- ¿Ya tiene cuenta abierta en esta moneda? `for update` la bloquea hasta el
  -- fin de la transacción: dos ventas simultáneas del mismo cliente se suman
  -- una detrás de la otra en vez de pisarse.
  select * into v_cuenta
    from public.cuentas_por_cobrar
   where tipo = p_tipo
     and moneda = p_moneda
     and estado = 'abierta'
     and contraparte ilike v_contraparte
   order by created_at desc
   limit 1
   for update;

  if found then
    update public.cuentas_por_cobrar
       set monto      = round(coalesce(monto, 0) + v_monto, 2),
           estado     = 'abierta',
           updated_at = now()
     where id = v_cuenta.id
     returning * into v_cuenta;
  else
    insert into public.cuentas_por_cobrar (
      tipo, contraparte, monto, cobrado, moneda,
      cuenta, caja_id, caja_mov_id, estado, nota, actor, actor_name
    ) values (
      p_tipo, v_contraparte, v_monto, 0, p_moneda,
      p_cuenta, p_caja_id, p_caja_mov_id, 'abierta', v_nota, p_actor, p_actor_name
    )
    returning * into v_cuenta;
  end if;

  -- El rastro con fecha. `total_adeudado` es la foto de lo que se debía
  -- después de este cargo: monto acumulado menos lo ya cobrado.
  v_adeudado := round(coalesce(v_cuenta.monto, 0) - coalesce(v_cuenta.cobrado, 0), 2);
  insert into public.cuentas_por_cobrar_cargos (
    cuenta_id, monto, moneda, caja_id, cuenta, caja_mov_id,
    total_adeudado, nota, actor, actor_name, ref_venta_id
  ) values (
    v_cuenta.id, v_monto, p_moneda, p_caja_id, p_cuenta, p_caja_mov_id,
    v_adeudado, v_nota, p_actor, p_actor_name, p_ref_venta_id
  );

  return v_cuenta;
end $fn$;

comment on function public.crear_o_acumular_cxc(text, text, numeric, text, text, uuid, uuid, text, text, text, uuid) is
  'Crea o ACUMULA una cuenta por cobrar (cuenta corriente por contraparte + moneda) y deja siempre su fila de cargo. Es la version en base de crearOAcumularCuentaPorCobrar, para que la deuda de una venta a credito se registre en la misma transaccion que la venta.';

grant execute on function public.crear_o_acumular_cxc(text, text, numeric, text, text, uuid, uuid, text, text, text, uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 2 · revertir_cargo_cxc
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.revertir_cargo_cxc(
  p_cuenta_id  uuid,
  p_monto      numeric,
  p_nota       text default null,
  p_actor      text default null,
  p_actor_name text default null
) returns public.cuentas_por_cobrar
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_monto    numeric;
  v_nota     text;
  v_cuenta   public.cuentas_por_cobrar;
  v_nuevo    numeric;
  v_cobrado  numeric;
  v_estado   text;
begin
  v_monto := round(coalesce(p_monto, 0)::numeric, 2);
  if v_monto <= 0 then
    raise exception 'El monto a revertir debe ser mayor que 0.';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  select * into v_cuenta
    from public.cuentas_por_cobrar
   where id = p_cuenta_id
   for update;
  if not found then
    raise exception 'No existe la cuenta por cobrar %.', p_cuenta_id;
  end if;

  v_cobrado := round(coalesce(v_cuenta.cobrado, 0), 2);
  v_nuevo   := round(coalesce(v_cuenta.monto, 0) - v_monto, 2);

  -- Una cuenta no puede quedar con más cobrado que debido: eso sería plata
  -- recibida que ya no se le debe a nadie. Primero hay que devolverla.
  if v_cobrado > v_nuevo + 0.01 then
    raise exception 'No se puede revertir % de la cuenta de %: quedaria en % y ya tiene % cobrado. Hay que devolver esa plata primero.',
      v_monto, v_cuenta.contraparte, v_nuevo, v_cobrado;
  end if;

  if v_nuevo < 0 then
    v_nuevo := 0;
  end if;
  -- Sin saldo pendiente, la cuenta se cierra.
  v_estado := case when v_nuevo <= 0 or v_cobrado >= v_nuevo - 0.01 then 'saldada' else 'abierta' end;

  update public.cuentas_por_cobrar
     set monto      = v_nuevo,
         estado     = v_estado,
         updated_at = now()
   where id = v_cuenta.id
   returning * into v_cuenta;

  -- El cargo negativo es el rastro de la reversa: la cuenta es corriente y
  -- su historia tiene que poder leerse renglón por renglón.
  insert into public.cuentas_por_cobrar_cargos (
    cuenta_id, monto, moneda, caja_id, cuenta, caja_mov_id,
    total_adeudado, nota, actor, actor_name
  ) values (
    v_cuenta.id, -v_monto, v_cuenta.moneda, null, null, null,
    round(v_nuevo - v_cobrado, 2), v_nota, p_actor, p_actor_name
  );

  return v_cuenta;
end $fn$;

comment on function public.revertir_cargo_cxc(uuid, numeric, text, text, text) is
  'Resta un cargo de una cuenta por cobrar y deja un cargo negativo como rastro. La usa la anulacion de una venta a credito: la cuenta es corriente y la comparten otras ventas, por eso se le RESTA en vez de cerrarla. Rechaza si la cuenta quedaria con mas cobrado que debido.';

grant execute on function public.revertir_cargo_cxc(uuid, numeric, text, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 3 · Prueba con datos de mentira (se revierte entera si algo falla)
-- ═══════════════════════════════════════════════════════════════════
do $test$
declare
  v_c        public.cuentas_por_cobrar;
  v_id       uuid;
  v_n        int;
  v_monto    numeric;
  v_ade      numeric;
  v_fallo    boolean;
  k_nombre   text := 'ZZ-TEST-CXC-CLIENTE';
begin
  -- ── Caso 1 · Nace la cuenta ──────────────────────────────────────
  v_c := public.crear_o_acumular_cxc(
    'cliente', k_nombre, 100, 'USD', 'principal', null, null, 'ZZ-TEST venta 1', 'tester', 'Tester');
  v_id := v_c.id;
  if round(v_c.monto, 2) <> 100 then
    raise exception 'PRUEBA 1: la cuenta debia nacer en 100 y nacio en %.', v_c.monto;
  end if;
  if v_c.estado <> 'abierta' or v_c.contraparte <> k_nombre then
    raise exception 'PRUEBA 1: la cuenta nacio mal (estado %, contraparte %).', v_c.estado, v_c.contraparte;
  end if;

  -- ── Caso 2 · El segundo cargo ACUMULA, no crea otra cuenta ───────
  v_c := public.crear_o_acumular_cxc(
    'cliente', k_nombre, 50, 'USD', 'principal', null, null, 'ZZ-TEST venta 2', 'tester', 'Tester');
  if v_c.id <> v_id then
    raise exception 'PRUEBA 2: se creo una cuenta nueva en vez de acumular en la que ya existia.';
  end if;
  if round(v_c.monto, 2) <> 150 then
    raise exception 'PRUEBA 2: la cuenta debia quedar en 150 y quedo en %.', v_c.monto;
  end if;

  select count(*) into v_n from public.cuentas_por_cobrar where contraparte = k_nombre;
  if v_n <> 1 then
    raise exception 'PRUEBA 2: debia haber UNA sola cuenta del cliente y hay %.', v_n;
  end if;

  select count(*) into v_n from public.cuentas_por_cobrar_cargos where cuenta_id = v_id;
  if v_n <> 2 then
    raise exception 'PRUEBA 2: debia haber 2 cargos y hay %.', v_n;
  end if;

  -- El cargo mas nuevo lleva la foto de lo adeudado: 150.
  select round(total_adeudado, 2) into v_ade
    from public.cuentas_por_cobrar_cargos where cuenta_id = v_id
   order by at desc, monto asc limit 1;
  if v_ade <> 150 then
    raise exception 'PRUEBA 2: el total_adeudado del ultimo cargo debia ser 150 y es %.', v_ade;
  end if;

  -- ── Caso 3 · Otra moneda es OTRA cuenta ──────────────────────────
  v_c := public.crear_o_acumular_cxc('cliente', k_nombre, 70, 'Bs');
  if v_c.id = v_id then
    raise exception 'PRUEBA 3: un cargo en otra moneda no puede caer en la cuenta en USD.';
  end if;

  -- ── Caso 4 · La reversa ──────────────────────────────────────────
  v_c := public.revertir_cargo_cxc(v_id, 50, 'ZZ-TEST anulacion venta 2', 'tester', 'Tester');
  if round(v_c.monto, 2) <> 100 then
    raise exception 'PRUEBA 4: tras revertir 50 la cuenta debia quedar en 100 y quedo en %.', v_c.monto;
  end if;
  if v_c.estado <> 'abierta' then
    raise exception 'PRUEBA 4: la cuenta todavia debe 100, no puede quedar %.', v_c.estado;
  end if;

  select count(*) into v_n from public.cuentas_por_cobrar_cargos where cuenta_id = v_id;
  if v_n <> 3 then
    raise exception 'PRUEBA 4: debia haber 3 cargos (2 mas la reversa) y hay %.', v_n;
  end if;

  select round(monto, 2) into v_monto
    from public.cuentas_por_cobrar_cargos where cuenta_id = v_id order by monto asc limit 1;
  if v_monto <> -50 then
    raise exception 'PRUEBA 4: la reversa debia dejar un cargo de -50 y dejo %.', v_monto;
  end if;

  -- ── Caso 5 · Se niega a dejar mas cobrado que debido ─────────────
  update public.cuentas_por_cobrar set cobrado = 90 where id = v_id;
  v_fallo := false;
  begin
    v_c := public.revertir_cargo_cxc(v_id, 50, 'ZZ-TEST reversa imposible');
  exception when others then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'PRUEBA 5: revertir hasta 50 con 90 ya cobrado tenia que fallar y no fallo.';
  end if;
  select round(monto, 2) into v_monto from public.cuentas_por_cobrar where id = v_id;
  if v_monto <> 100 then
    raise exception 'PRUEBA 5: la reversa rechazada no debia tocar el monto, y quedo en %.', v_monto;
  end if;
  update public.cuentas_por_cobrar set cobrado = 0 where id = v_id;

  -- ── Caso 6 · Revertir todo deja la cuenta saldada ────────────────
  v_c := public.revertir_cargo_cxc(v_id, 100, 'ZZ-TEST anulacion venta 1');
  if round(v_c.monto, 2) <> 0 or v_c.estado <> 'saldada' then
    raise exception 'PRUEBA 6: la cuenta debia quedar en 0 y saldada, y quedo en % / %.', v_c.monto, v_c.estado;
  end if;

  -- ── Caso 7 · Las validaciones de entrada ─────────────────────────
  v_fallo := false;
  begin
    v_c := public.crear_o_acumular_cxc('cliente', k_nombre, 0, 'USD');
  exception when others then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'PRUEBA 7: un cargo de 0 tenia que fallar y no fallo.';
  end if;

  v_fallo := false;
  begin
    v_c := public.crear_o_acumular_cxc('cliente', '   ', 10, 'USD');
  exception when others then
    v_fallo := true;
  end;
  if not v_fallo then
    raise exception 'PRUEBA 7: una contraparte vacia tenia que fallar y no fallo.';
  end if;

  -- ── Limpieza (los cargos se van en cascada) ──────────────────────
  delete from public.cuentas_por_cobrar where contraparte like 'ZZ-TEST-%';

  raise notice 'Pruebas de crear_o_acumular_cxc / revertir_cargo_cxc: OK';
end $test$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('crear_o_acumular_cxc', 'revertir_cargo_cxc')
 order by p.proname;
