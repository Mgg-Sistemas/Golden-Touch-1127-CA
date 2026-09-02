-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 02/09/2026 · PARTE 14
-- GT-AUT-01 · Una cuenta dada de baja igual puede obtener un token
--
-- QUÉ PASA
-- La pantalla de ingreso hace bien su trabajo: antes de intentar el login
-- pregunta si la cuenta está bloqueada por intentos fallidos o inhabilitada, y
-- si lo está ni lo intenta. Pero eso vive en el NAVEGADOR. Nada impide llamar
-- directo a la API de autenticación con el correo y la clave: el token sale
-- igual, firmado y válido.
--
-- Hoy las políticas de la base frenan a esa cuenta cuando quiere leer o
-- escribir, así que el daño está acotado. Pero el portón está abierto: hay un
-- token de sesión válido para alguien a quien se dio de baja.
--
-- QUÉ CAMBIA
-- Un HOOK de Supabase Auth: una función que corre en el servidor cada vez que
-- se va a emitir un token, y que puede negarlo. La verificación pasa a estar
-- donde vale — antes de que el token exista, no después.
--
-- DOS DECISIONES DELIBERADAS
--
--  1) Si el usuario NO tiene ficha en `usuarios`, se DEJA PASAR. Hoy hay una
--     cuenta así en la base. Negarle el token la dejaría afuera de golpe, y no
--     hace falta: sin ficha, las políticas no le permiten leer ni escribir
--     nada. Este hook cierra el portón de los dados de baja, no reemplaza a la
--     RLS.
--
--  2) Se niega por `estado <> 'activo'` y por `bloqueado`, que son exactamente
--     las dos condiciones que hoy revisa la pantalla. Ni una más: el hook se
--     ejecuta en CADA ingreso de CADA persona, y una condición de más acá deja
--     a la empresa afuera del sistema.
--
-- CÓMO SE ACTIVA (no se activa solo)
-- Supabase → Authentication → Hooks → «Customize Access Token (JWT) Claims» →
-- elegir `public.auth_hook_token` → Enable. Se apaga desde la misma pantalla.
-- Mientras no se active, esta función no hace absolutamente nada.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.auth_hook_token(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid     uuid;
  v_estado  text;
  v_bloq    boolean;
begin
  v_uid := nullif(event->>'user_id', '')::uuid;

  -- Sin usuario identificable: no es asunto de este hook, se devuelve tal cual.
  if v_uid is null then
    return event;
  end if;

  select u.estado::text, coalesce(u.bloqueado, false)
    into v_estado, v_bloq
    from public.usuarios u
   where u.id = v_uid;

  -- Sin ficha en `usuarios`: pasa. Ver decisión (1) del encabezado.
  if not found then
    return event;
  end if;

  if v_bloq then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message',   'Tu cuenta está bloqueada por intentos fallidos. Pedile al administrador que la desbloquee.'));
  end if;

  if v_estado is distinct from 'activo' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message',   'Tu cuenta está inhabilitada. Comunicate con el administrador.'));
  end if;

  -- Todo en orden: el token sale con los claims que ya traía, sin tocar nada.
  return event;
end $fn$;


-- ───────────────────────────────────────────────────────────────────
-- Permisos: SOLO el servicio de autenticación la ejecuta.
-- Nadie más, y menos el anónimo: es la función que decide quién entra.
-- ───────────────────────────────────────────────────────────────────
grant  usage   on schema public                          to supabase_auth_admin;
grant  execute on function public.auth_hook_token(jsonb) to supabase_auth_admin;
revoke execute on function public.auth_hook_token(jsonb) from public, anon, authenticated;

-- El hook lee `usuarios`, que tiene RLS. Corre como SECURITY DEFINER (dueño de
-- la base), así que la atraviesa; esta política es el respaldo por si en algún
-- momento se cambia el modo de ejecución.
drop policy if exists usuarios_auth_hook_lectura on public.usuarios;
create policy usuarios_auth_hook_lectura on public.usuarios
  as permissive for select to supabase_auth_admin
  using (true);


-- ───────────────────────────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────────────────────────
select p.proname as funcion,
       has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE') as auth_admin_puede,
       has_function_privilege('anon', p.oid, 'EXECUTE')                as anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')       as auth_puede
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'auth_hook_token';
