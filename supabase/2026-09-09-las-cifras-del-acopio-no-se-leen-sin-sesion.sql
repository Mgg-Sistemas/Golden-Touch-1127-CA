-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Las cifras del acopio dejan de contestar sin sesión
--
-- ── QUÉ PASABA ───────────────────────────────────────────────────
-- Tres funciones del centro de acopio son SECURITY DEFINER (corren con los
-- permisos de quien las creó) y `anon` podía ejecutarlas. `anon` es el rol de
-- quien NO inició sesión: le alcanza la clave pública que viaja en el bundle
-- del navegador, que es pública por diseño y no es un secreto.
--
-- Comprobado con peticiones reales SIN SESIÓN contra el proyecto:
--   POST /rest/v1/rpc/metrica_acopio_saldo_usd      → 200   617.82
--   POST /rest/v1/rpc/metrica_acopio_saldo_kg       → 200  2049.65
--   POST /rest/v1/rpc/metrica_acopio_tasa_material  → 200    21.64
--
-- Eso es el saldo del acopio en dólares, en kilos, y la tasa a la que se paga
-- el material. Cifras reales, no una tabla vacía: acá sí había fuga.
--
-- Es el mismo defecto de la vista `ventas_movimientos_caja` de ayer, por el
-- otro lado. Allá el atajo era una vista; acá es una función. En ambos casos
-- el objeto corre con permisos del dueño y el RLS de las tablas de abajo no
-- se aplica. Conviene anotarlo junto: cada objeto SECURITY DEFINER nuevo hay
-- que revisarlo por quién puede EJECUTARLO, no solo por qué lee.
--
-- ── DOS MÁS QUE ENTRAN EN EL MISMO ARREGLO ───────────────────────
-- `next_sku(prefijo, n)` MODIFICA: avanza el contador de SKU del inventario.
-- Sin sesión, cualquiera podía quemar números de código de producto. No hay
-- daño de datos, pero deja huecos en una numeración que la gente lee en papel.
-- `peek_sku(prefijo)` solo lo consulta (devolvió 9 para HOR), y va junto por
-- ser la pareja de la anterior.
--
-- Estas dos SÍ las usa el sistema (`inventario.repository.ts`), siempre con
-- sesión iniciada. Por eso no se revocan a secas: se le quita el permiso a
-- `anon` y a `public`, y se le da explícitamente a `authenticated`. Si solo
-- se revocara de `public`, el usuario logueado también perdería el permiso y
-- se rompería el alta de productos.
--
-- ── LO QUE NO SE TOCA, Y POR QUÉ ─────────────────────────────────
-- `auth_estado_bloqueo`, `auth_estado_inhabilitado` y `auth_fallo_login`
-- también contestan sin sesión, y eso NO es un descuido: las llama la pantalla
-- de login ANTES de que exista sesión (`authStore.ts`). Quitarles el permiso
-- rompe el login de todos.
--
-- Igual hay un problema real ahí y queda anotado, no arreglado:
--   · las dos primeras permiten SONDEAR correos (contestan distinto según el
--     correo exista o no);
--   · `auth_fallo_login` INCREMENTA el contador de intentos fallidos, así que
--     quien conozca un correo del personal puede dejar esa cuenta bloqueada
--     llamándola a repetición.
-- No se prueba acá porque probarlo era bloquear a una persona de verdad. El
-- arreglo no es un revoke: necesita repensar el flujo (límite por IP, o mover
-- el conteo a la Edge Function del login). Va aparte y con su propio análisis.
--
-- ── ALCANCE HONESTO ──────────────────────────────────────────────
-- Esto cierra la lectura SIN CREDENCIALES, que es lo único que hoy se alcanza
-- desde internet. NO resuelve el problema de fondo: quedan 85 tablas que lee
-- cualquiera que esté logueado, sin mirar el rol. Eso se viene cerrando de a
-- una (Ventas y cuentas por cobrar ya están) y sigue su curso.
--
-- Las tres métricas quedan para `authenticated` y no para un rol concreto:
-- hoy NADIE las llama —ni el sistema ni otra función de la base, lo verifiqué—
-- así que meterlas en `puede_leer('acopio')` sería inventar una regla para un
-- consumidor que no existe. Cuando alguna pantalla las use, ahí se gatea por
-- rol con el consumidor a la vista.
-- ═══════════════════════════════════════════════════════════════════

-- ── Las cifras del acopio: solo con sesión ───────────────────────
revoke all on function public.metrica_acopio_saldo_usd()     from anon, public;
revoke all on function public.metrica_acopio_saldo_kg()      from anon, public;
revoke all on function public.metrica_acopio_tasa_material() from anon, public;

grant execute on function public.metrica_acopio_saldo_usd()     to authenticated;
grant execute on function public.metrica_acopio_saldo_kg()      to authenticated;
grant execute on function public.metrica_acopio_tasa_material() to authenticated;

-- ── El contador de SKU: solo con sesión (el sistema lo usa logueado) ──
revoke all on function public.next_sku(p_prefijo text, p_n integer) from anon, public;
revoke all on function public.peek_sku(p_prefijo text)              from anon, public;

grant execute on function public.next_sku(p_prefijo text, p_n integer) to authenticated;
grant execute on function public.peek_sku(p_prefijo text)              to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- `anon` en false y `authenticated` en true, en las cinco.
-- ═══════════════════════════════════════════════════════════════════
select p.proname                                              as funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as la_puede_llamar_sin_sesion,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as la_puede_llamar_logueado
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('metrica_acopio_saldo_usd','metrica_acopio_saldo_kg',
                     'metrica_acopio_tasa_material','next_sku','peek_sku')
 order by p.proname;
