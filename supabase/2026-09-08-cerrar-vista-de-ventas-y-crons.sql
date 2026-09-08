-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 08/09/2026
-- Auditoría de exposición de datos · dos agujeros que se cierran
--
-- ── 1 · LA VISTA `ventas_movimientos_caja` SE SALTABA EL RLS ──────
-- La creé yo ayer, al amarrar Ventas con Tesorería, y tiene dos defectos
-- que se suman y se potencian:
--
--   a) En Postgres una vista corre, por defecto, con los permisos de QUIEN LA
--      CREÓ, no de quien la consulta. O sea: el RLS de `movimientos_caja` NO
--      se aplica al leer por la vista. Toda la protección de esa tabla —que
--      está bien puesta— quedaba salteada por este atajo.
--
--   b) Escribí `grant select ... to authenticated`, pero Supabase ya le había
--      dado permisos a `anon` por privilegios por omisión del esquema. Mi
--      grant sumó, no restringió. Resultado: la vista contestaba HTTP 200 a
--      una petición SIN SESIÓN, hecha solo con la clave pública que viaja en
--      el bundle del navegador.
--
-- Hoy no se filtró nada porque `ventas` está vacía y la vista no tiene filas
-- que devolver. Con la primera venta confirmada, los movimientos de caja de
-- esa venta —monto, moneda, caja, motivo, quién— quedaban legibles por
-- cualquiera que tuviera esa clave, que es pública por diseño.
--
-- Se arregla por los dos lados, no por uno:
--   · `security_invoker = on` hace que la vista respete el RLS del lector.
--   · se le quita el permiso a `anon`.
-- Con cualquiera de los dos alcanzaría. Van los dos porque son defensas
-- independientes y la de arriba ya falló una vez.
--
-- ── 2 · LAS FUNCIONES DE CRON ERAN EJECUTABLES SIN SESIÓN ─────────
-- `cron_tasa_binance_p2p()` y `cron_consumo_combustible_semanal()` son
-- SECURITY DEFINER y no llevan control interno de permisos —no lo necesitan,
-- porque las llama pg_cron desde adentro—. Pero `anon` podía ejecutarlas.
-- No devuelven datos, así que no hay filtración, pero sí permite que
-- cualquiera dispare trabajo del servidor cuando quiera.
--
-- ── LO QUE SE REVISÓ Y ESTÁ BIEN ─────────────────────────────────
-- Para que quede escrito, porque un informe que solo lista lo malo no dice
-- qué tan lejos se miró:
--   · Las 7 tablas sin política tienen RLS activo → niegan a todos.
--   · Ninguna política de lectura habilita al rol `anon`.
--   · Nómina, personal, eventos de RRHH, anticipos y datos de pago del
--     proveedor están gateados por rol, no abiertos a cualquier logueado.
--   · La auditoría solo la lee un administrador.
--   · `admin_desbloquear_usuario` verifica `is_admin()` antes de tocar nada.
--   · Los 7 buckets de archivos son privados.
-- ═══════════════════════════════════════════════════════════════════

-- ── La vista respeta el RLS de quien la consulta ─────────────────
alter view public.ventas_movimientos_caja set (security_invoker = on);

-- ── Y no la puede leer nadie sin sesión ──────────────────────────
revoke all on public.ventas_movimientos_caja from anon;

-- ── Los cron no se disparan desde afuera ─────────────────────────
revoke all on function public.cron_tasa_binance_p2p()            from anon, public;
revoke all on function public.cron_consumo_combustible_semanal() from anon, public;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker')
                                                                    as vista_respeta_rls,
  has_table_privilege('anon', 'public.ventas_movimientos_caja', 'SELECT')
                                                                    as anon_puede_leer_la_vista,
  has_function_privilege('anon', 'public.cron_tasa_binance_p2p()', 'EXECUTE')
                                                                    as anon_puede_disparar_binance,
  has_function_privilege('anon', 'public.cron_consumo_combustible_semanal()', 'EXECUTE')
                                                                    as anon_puede_disparar_combustible
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relname='ventas_movimientos_caja';
