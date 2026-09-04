-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 04/09/2026 · GT-AUT-02 · tercera y última tanda
-- Los catálogos y la configuración pasan a escribirse por ROL
--
-- QUÉ PASABA
-- Estas tablas seguían con `is_operativo()`, que solo significa «existe en la
-- tabla usuarios y está activo», sin mirar el rol. Cualquier persona con
-- cuenta activa podía reescribir el catálogo de equipos, las clasificaciones
-- del centro de acopio o las categorías de gasto desde la consola del
-- navegador, aunque el menú ni le mostrara ese módulo.
--
-- Es el mismo hallazgo de las dos tandas anteriores; quedaban estas 18 tablas
-- por cerrar. Pesan menos que las anteriores —no mueven plata ni existencias—
-- pero un catálogo alterado ensucia todo lo que cuelga de él.
--
-- VERIFICADO ANTES DE APLICAR, NO DESPUÉS
-- Se cruzó cada tabla contra quién la escribió de verdad y contra la matriz de
-- roles. Los tres casos con historial rastreable:
--   · adjuntos_directos       → analistas de compras, admin y «analista»
--   · evaluaciones_recepcion  → analistas de compras y admin
--   · categorias_gasto        → analista de tesorería y admin (570 sembradas)
-- Los tres roles conservan su permiso en el módulo elegido. Ninguno pierde
-- acceso a lo que ya venía haciendo.
--
-- DOS TABLAS QUEDAN COMO ESTÁN, A PROPÓSITO
--
--   `taxonomias` — ya se había decidido en la primera tanda: son catálogos
--   compartidos que alimenta cualquier módulo con escritura. Gatearlas por un
--   módulo rompería a los otros.
--
--   `tasa_snapshot` — el INSERT se reparte, el resto no. La tasa del BCV se
--   refresca sola desde CUALQUIER usuario que tenga la app abierta (el chip de
--   la barra superior dispara un refresco perezoso que inserta la muestra, y
--   traga los errores en silencio). Gatearlo a `tesoreria` habría congelado la
--   tasa para todos hasta que entrara alguien de Tesorería, sin ningún aviso.
--   Solución: INSERT sigue abierto a cualquier operativo —solo agrega
--   historia—, pero CORREGIR o BORRAR una tasa pasa a ser de Tesorería.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1 · Centro de acopio
--     `acopio_catalogos` lo escribe el módulo de Producción (contratos), pero
--     su contenido es de acopio: se admiten los dos para no romper el flujo.
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "acopio_catalogos write op" on public.acopio_catalogos;
create policy "acopio_catalogos write rol" on public.acopio_catalogos
  for all using (public.is_admin() or public.puede('produccion') or public.puede('acopio'))
       with check (public.is_admin() or public.puede('produccion') or public.puede('acopio'));

drop policy if exists "acopio_clasificaciones write op" on public.acopio_clasificaciones;
create policy "acopio_clasificaciones write rol" on public.acopio_clasificaciones
  for all using (public.is_admin() or public.puede('acopio'))
       with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_costo_clases write op" on public.acopio_costo_clases;
create policy "acopio_costo_clases write rol" on public.acopio_costo_clases
  for all using (public.is_admin() or public.puede('acopio'))
       with check (public.is_admin() or public.puede('acopio'));


-- ───────────────────────────────────────────────────────────────────
-- 2 · Compras y servicios
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "adjuntos_directos write op" on public.adjuntos_directos;
create policy "adjuntos_directos write rol" on public.adjuntos_directos
  for all using (public.is_admin() or public.puede('pedidos'))
       with check (public.is_admin() or public.puede('pedidos'));

drop policy if exists "evals write operativo" on public.evaluaciones_recepcion;
create policy "evals write rol" on public.evaluaciones_recepcion
  for all using (public.is_admin() or public.puede('pedidos'))
       with check (public.is_admin() or public.puede('pedidos'));

drop policy if exists "servicios_cat write op" on public.servicios_catalogo;
create policy "servicios_cat write rol" on public.servicios_catalogo
  for all using (public.is_admin() or public.puede('pedidos'))
       with check (public.is_admin() or public.puede('pedidos'));

-- `pedido_catalogos` lo escriben DOS módulos: las unidades solicitantes se
-- cargan tanto desde la Solicitud de Pedido como desde la salida de material
-- (mismo catálogo compartido). Cerrar por uno solo rompería el otro.
drop policy if exists "pedcat write operativo" on public.pedido_catalogos;
create policy "pedcat write rol" on public.pedido_catalogos
  for all using (public.is_admin() or public.puede('pedidos') or public.puede('salidas'))
       with check (public.is_admin() or public.puede('pedidos') or public.puede('salidas'));


-- ───────────────────────────────────────────────────────────────────
-- 3 · Inventario
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "almacenes write operativo" on public.almacenes;
create policy "almacenes write rol" on public.almacenes
  for all using (public.is_admin() or public.puede('inventario'))
       with check (public.is_admin() or public.puede('inventario'));


-- ───────────────────────────────────────────────────────────────────
-- 4 · Salidas (transporte)
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "choferes write op" on public.choferes;
create policy "choferes write rol" on public.choferes
  for all using (public.is_admin() or public.puede('salidas'))
       with check (public.is_admin() or public.puede('salidas'));

drop policy if exists "vehiculos write op" on public.vehiculos;
create policy "vehiculos write rol" on public.vehiculos
  for all using (public.is_admin() or public.puede('salidas'))
       with check (public.is_admin() or public.puede('salidas'));


-- ───────────────────────────────────────────────────────────────────
-- 5 · Combustible
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "combustible_catalogos write op" on public.combustible_catalogos;
create policy "combustible_catalogos write rol" on public.combustible_catalogos
  for all using (public.is_admin() or public.puede('combustible'))
       with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "vehiculos write operativo" on public.combustible_vehiculos;
create policy "combustible_vehiculos write rol" on public.combustible_vehiculos
  for all using (public.is_admin() or public.puede('combustible'))
       with check (public.is_admin() or public.puede('combustible'));

drop policy if exists "comb_write" on public.combustibles;
create policy "combustibles write rol" on public.combustibles
  for all using (public.is_admin() or public.puede('combustible'))
       with check (public.is_admin() or public.puede('combustible'));


-- ───────────────────────────────────────────────────────────────────
-- 6 · Maquinaria y producción
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "maquinaria_cat write op" on public.maquinaria_catalogos;
create policy "maquinaria_cat write rol" on public.maquinaria_catalogos
  for all using (public.is_admin() or public.puede('maquinaria'))
       with check (public.is_admin() or public.puede('maquinaria'));

drop policy if exists "hornos write operativo" on public.hornos;
create policy "hornos write rol" on public.hornos
  for all using (public.is_admin() or public.puede('produccion'))
       with check (public.is_admin() or public.puede('produccion'));


-- ───────────────────────────────────────────────────────────────────
-- 7 · Tesorería
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "catgasto write operativo" on public.categorias_gasto;
create policy "catgasto write rol" on public.categorias_gasto
  for all using (public.is_admin() or public.puede('tesoreria'))
       with check (public.is_admin() or public.puede('tesoreria'));

drop policy if exists "contrapartes write operativo" on public.tesoreria_contrapartes;
create policy "contrapartes write rol" on public.tesoreria_contrapartes
  for all using (public.is_admin() or public.puede('tesoreria'))
       with check (public.is_admin() or public.puede('tesoreria'));

-- `tasa_snapshot`: agregar una muestra lo hace el refresco automático desde
-- cualquier sesión abierta; corregir o borrar el histórico es de Tesorería.
drop policy if exists "tasa_snapshot write operativo" on public.tasa_snapshot;
create policy "tasa_snapshot insert operativo" on public.tasa_snapshot
  for insert with check (public.is_operativo());
create policy "tasa_snapshot update rol" on public.tasa_snapshot
  for update using (public.is_admin() or public.puede('tesoreria'))
       with check (public.is_admin() or public.puede('tesoreria'));
create policy "tasa_snapshot delete rol" on public.tasa_snapshot
  for delete using (public.is_admin() or public.puede('tesoreria'));


-- ───────────────────────────────────────────────────────────────────
-- 8 · Aviso de mantenimiento — solo administrador
--     Es el cartel que ve TODO el sistema. Ninguna pantalla lo escribe: el
--     único que lo toca es el script de despliegue, que corre con la clave de
--     servicio y no pasa por RLS. Cerrarlo a administrador no rompe nada y
--     evita que cualquiera cuelgue un aviso a toda la empresa.
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "aviso write op" on public.aviso_mantenimiento;
create policy "aviso write admin" on public.aviso_mantenimiento
  for all using (public.is_admin()) with check (public.is_admin());


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select tablename, policyname, cmd, left(coalesce(qual, with_check), 80) as regla
  from pg_policies
 where schemaname = 'public'
   and (qual like '%is_operativo()%' or with_check like '%is_operativo()%')
 order by tablename, cmd;
