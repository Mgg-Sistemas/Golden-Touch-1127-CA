-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 10
-- GT-INT-04 (continuación) · Leer y sembrar el contador de correlativos
--
-- POR QUÉ HACEN FALTA
-- La tabla `correlativos` tiene RLS activa y CERO políticas: desde el navegador
-- no se puede ni leer ni escribir. Está bien que sea así —es el contador de la
-- numeración fiscal, no algo que deba tocarse a mano— pero el módulo necesita
-- dos cosas puntuales:
--
--   · `correlativo_actual`  → para MOSTRAR qué número va a tocar. Sin esto, la
--     pantalla sugiere el máximo de la tabla de movimientos, que baja si alguien
--     borra un gasto: prometería un número que después no sale.
--
--   · `correlativo_sembrar` → el primer gasto de una categoría lo numera la
--     persona (viene de un talonario que ya venía por la mitad). Solo SUBE el
--     contador, nunca lo baja, así no se puede reusar un número ya emitido.
--
-- Las dos son SECURITY DEFINER con `search_path` fijo, fuera del alcance del
-- anónimo, y exigen permiso de tesorería para las sesiones de personas. El
-- `auth.role() = 'anon'` se rechaza aparte porque la clave pública del proyecto
-- también es un JWT válido: sin ese chequeo, «tener token» no prueba nada.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.correlativo_actual(p_clave text)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v int;
begin
  if auth.role() = 'anon' or (auth.uid() is not null and not public.puede('tesoreria')) then
    raise exception 'No tenés permiso para consultar la numeración de gastos.'
      using errcode = 'insufficient_privilege';
  end if;
  select valor into v from public.correlativos where clave = p_clave;
  return v;   -- NULL si la categoría todavía no tiene numeración
end $fn$;


create or replace function public.correlativo_sembrar(p_clave text, p_valor integer)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v int;
begin
  if auth.role() = 'anon' or (auth.uid() is not null and not public.puede('tesoreria')) then
    raise exception 'No tenés permiso para fijar la numeración de gastos.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'El número de arranque debe ser mayor que 0.';
  end if;

  -- Solo hacia arriba: bajar el contador permitiría repetir un número ya emitido.
  insert into public.correlativos (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update
    set valor = greatest(public.correlativos.valor, excluded.valor), updated_at = now()
  returning valor into v;
  return v;
end $fn$;


revoke execute on function public.correlativo_actual(text)            from public, anon;
revoke execute on function public.correlativo_sembrar(text, integer)  from public, anon;
grant  execute on function public.correlativo_actual(text)            to authenticated, service_role;
grant  execute on function public.correlativo_sembrar(text, integer)  to authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_puede
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('correlativo_actual', 'correlativo_sembrar')
order by 1;
