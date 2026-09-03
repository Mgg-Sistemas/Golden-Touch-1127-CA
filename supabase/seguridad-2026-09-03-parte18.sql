-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 03/09/2026 · PARTE 18
-- GT-AUT-03 · La clave por defecto `123456` deja de servir para trabajar
--
-- LA DECISIÓN
-- La clave inicial SIGUE SIENDO `123456` y la persona la cambia por la que
-- quiera en su primer ingreso. Eso se mantiene tal cual, por pedido expreso.
--
-- Lo que cambia es qué se puede hacer mientras no la haya cambiado.
--
-- QUÉ PASABA
-- Todo usuario nuevo o desbloqueado quedaba con `123456`, y lo único que
-- empujaba al cambio era el flag `must_change_password` aplicado EN REACT:
-- una redirección del router, no una restricción de credencial. La clave seguía
-- siendo válida en Auth, así que alcanzaba con llamar a la API desde la consola
-- del navegador para tener una sesión completa con los permisos del rol.
--
-- La ventana no es teórica: hoy hay DOS cuentas activas creadas y todavía sin
-- estrenar (`admingometales@` y `lozadawendy2511@`). Cualquiera que sepa el
-- correo de un compañero recién dado de alta entra como él.
--
-- QUÉ CAMBIA
-- Los cuatro helpers de permisos ya consultan `public.usuarios`. Se les agrega
-- una condición: quien tenga `must_change_password` en true NO pasa. Como todas
-- las políticas del sistema se apoyan en estos cuatro, la restricción se hereda
-- sola — no hace falta tocar ni una política, que era la alternativa cara y
-- peligrosa.
--
--   is_admin() · is_operativo() · puede(modulo) · puede_leer(modulo)
--
-- `puede_inventario()` está construida sobre `puede()`, así que queda cubierta
-- sin tocarla.
--
-- POR QUÉ EL CAMBIO DE CLAVE SIGUE FUNCIONANDO — verificado, no supuesto
--   · `clear_must_change_password()` es SECURITY DEFINER y no usa estos
--     helpers: limpia el flag por `auth.uid()` directo.
--   · La política de lectura de la ficha propia es `usuarios self read`
--     (`auth.uid() = id`): tampoco pasa por los helpers, así que la pantalla
--     que detecta «tenés que cambiar la clave» sigue viendo su dato.
--   · `roles_permisos` se lee con `true` y `custom_roles` con `authenticated`:
--     la aplicación carga los permisos igual y no queda en blanco.
--   · El cambio de clave en sí lo hace Supabase Auth (`updateUser`), que no
--     pasa por RLS.
--
-- A QUIÉN AFECTA HOY — verificado contra producción antes de aplicar
--   · admingometales@gmail.com      · activo   · NUNCA ingresó
--   · lozadawendy2511@gmail.com     · activo   · NUNCA ingresó
--   · analistadecomprasgt@gmail.com · inactivo · ya la frena el Auth Hook
-- Ninguna persona que esté trabajando hoy queda afuera: las dos activas son
-- justamente las que tienen `123456` sin estrenar. Al entrar por primera vez
-- van a poder cambiar la clave y seguir normal.
--
-- PARA REVERTIR
-- Volver a crear las cuatro funciones sin la línea
-- `and not coalesce(u.must_change_password, false)`.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- is_admin() · ser admin no alcanza si todavía tenés la clave de fábrica
-- ───────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from public.usuarios u
     where u.id = auth.uid()
       and u.role = 'admin'
       and u.estado = 'activo'
       and not coalesce(u.must_change_password, false)
  );
$fn$;


-- ───────────────────────────────────────────────────────────────────
-- is_operativo() · «existe y está activo», ahora también «ya estrenó la clave»
-- ───────────────────────────────────────────────────────────────────
create or replace function public.is_operativo()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from public.usuarios u
     where u.id = auth.uid()
       and u.estado = 'activo'
       and not coalesce(u.must_change_password, false)
  );
$fn$;


-- ───────────────────────────────────────────────────────────────────
-- puede(modulo) · permiso de ESCRITURA por módulo
-- ───────────────────────────────────────────────────────────────────
create or replace function public.puede(modulo text)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select public.is_admin()
    or exists (
      select 1
      from public.usuarios u
      join public.roles_permisos rp on rp.role = u.role
      where u.id = auth.uid()
        and coalesce(u.estado::text, 'activo') = 'activo'
        and not coalesce(u.must_change_password, false)
        and (
          coalesce((rp.permisos -> modulo ->> 'escritura')::boolean, false)
          or coalesce((rp.permisos -> modulo ->> 'full')::boolean, false)
        )
    );
$fn$;


-- ───────────────────────────────────────────────────────────────────
-- puede_leer(modulo) · permiso de LECTURA por módulo
-- ───────────────────────────────────────────────────────────────────
create or replace function public.puede_leer(modulo text)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select public.is_admin()
    or exists (
      select 1
      from public.usuarios u
      join public.roles_permisos rp on rp.role = u.role
      where u.id = auth.uid()
        and coalesce(u.estado::text, 'activo') = 'activo'
        and not coalesce(u.must_change_password, false)
        and (
          coalesce((rp.permisos -> modulo ->> 'lectura')::boolean, false)
          or coalesce((rp.permisos -> modulo ->> 'escritura')::boolean, false)
          or coalesce((rp.permisos -> modulo ->> 'full')::boolean, false)
        )
    );
$fn$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: las cuatro deben mencionar must_change_password
-- ═══════════════════════════════════════════════════════════════════
select p.proname as funcion,
       pg_get_functiondef(p.oid) like '%must_change_password%' as ya_lo_exige,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin','is_operativo','puede','puede_leer')
order by p.proname;
