-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Correcciones de seguridad · 02/09/2026 · PARTE 2
-- Continúa supabase/seguridad-2026-09-02.sql
--
--   PASO 3 · Confidencialidad de nómina y datos bancarios (GT-CON-01)
--   PASO 4 · Siembra del correlativo de Solicitudes de Pedido (GT-INT-03)
--   PASO 5 · Escritura de inventario y órdenes por rol (GT-AUT-02) — REVISAR
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- PASO 3 · GT-CON-01 · Confidencialidad de nómina y datos bancarios
--
-- Hoy la lectura de estas tablas es `auth.role() = 'authenticated'`: CUALQUIER
-- cuenta con sesión —un obrero que ni ve la pestaña de RRHH— puede sacar por
-- consola la cédula, el sueldo y la cuenta bancaria de toda la plantilla, y
-- suscribirse por Realtime para verlo en vivo.
--
-- La escritura ya está bien gateada con puede('rrhh'); acá se arregla la LECTURA.
--
-- NOTA sobre Realtime: no hace falta sacar las tablas de la publicación.
-- Supabase Realtime aplica RLS en `postgres_changes`, así que al ajustar la
-- política de SELECT la suscripción queda filtrada con el mismo criterio y las
-- pestañas de RRHH le siguen funcionando a quien corresponde.
-- ═══════════════════════════════════════════════════════════════════

-- `puede()` mira solo 'escritura'/'full'. Para gatear LECTURA hace falta el
-- gemelo que además acepte 'lectura'; si no, los roles de solo consulta
-- perderían pantallas que hoy usan con normalidad.
create or replace function public.puede_leer(modulo text)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select public.is_admin()
    or exists (
      select 1
      from public.usuarios u
      join public.roles_permisos rp on rp.role = u.role
      where u.id = auth.uid()
        and coalesce(u.estado::text, 'activo') = 'activo'
        and (
          coalesce((rp.permisos -> modulo ->> 'lectura')::boolean, false)
          or coalesce((rp.permisos -> modulo ->> 'escritura')::boolean, false)
          or coalesce((rp.permisos -> modulo ->> 'full')::boolean, false)
        )
    );
$fn$;
revoke execute on function public.puede_leer(text) from public, anon;
grant  execute on function public.puede_leer(text) to authenticated, service_role;


-- personal · cédula, sueldo base, teléfonos, contacto de emergencia y datos
-- bancarios. Verificado en el código: solo lo lee src/modules/rrhh/.
drop policy if exists "personal read auth" on public.personal;
create policy "personal read rrhh" on public.personal for select
  using (public.puede_leer('rrhh'));

-- nomina_periodos · cada quincena liquidada.
drop policy if exists "nomina_per read auth" on public.nomina_periodos;
create policy "nomina_per read rrhh" on public.nomina_periodos for select
  using (public.puede_leer('rrhh') or public.puede_leer('tesoreria'));

-- nomina_renglones · neto pagado, deducciones, anticipos, seriales de billetes.
-- Verificado: además de RRHH lo lee src/modules/salidas/cajas.repository.ts.
drop policy if exists "nomina_ren read auth" on public.nomina_renglones;
create policy "nomina_ren read rrhh" on public.nomina_renglones for select
  using (public.puede_leer('rrhh') or public.puede_leer('tesoreria') or public.puede_leer('salidas'));

-- anticipos_prestamos · deudas personales del personal con la empresa.
drop policy if exists "anticipos read auth" on public.anticipos_prestamos;
create policy "anticipos read rrhh" on public.anticipos_prestamos for select
  using (public.puede_leer('rrhh') or public.puede_leer('tesoreria'));

-- rrhh_eventos · historial laboral, sanciones, permisos.
drop policy if exists "rrhh_ev read auth" on public.rrhh_eventos;
create policy "rrhh_ev read rrhh" on public.rrhh_eventos for select
  using (public.puede_leer('rrhh'));

-- proveedor_datos_pago · cuentas bancarias de los proveedores.
-- Verificado: lo lee src/modules/pedidos/datosPago.repository.ts además de Tesorería.
drop policy if exists "pdp read auth" on public.proveedor_datos_pago;
create policy "pdp read staff" on public.proveedor_datos_pago for select
  using (public.puede_leer('tesoreria') or public.puede_leer('pedidos') or public.puede_leer('proveedores'));


-- ═══════════════════════════════════════════════════════════════════
-- PASO 4 · GT-INT-03 · Siembra del correlativo de Solicitudes de Pedido
--
--   CORRER ESTO **ANTES** DE PUBLICAR EL FRONT.
--
-- `nextCodigo()` pasó de `count(*) + 1` a la RPC atómica `next_correlativo`.
-- Si el contador arranca en 0, el primer SP generado chocaría con uno que ya
-- existe. Esto lo siembra con el máximo actual del año en curso.
-- ═══════════════════════════════════════════════════════════════════
insert into public.correlativos (clave, valor)
select 'sp-' || to_char(now(), 'YYYY'),
       coalesce(max(substring(codigo from 9)::int), 0)
  from public.ordenes
 where codigo like 'SP-' || to_char(now(), 'YYYY') || '-%'
   and substring(codigo from 9) ~ '^[0-9]+$'
on conflict (clave) do update
  set valor = greatest(public.correlativos.valor, excluded.valor),
      updated_at = now();

-- Verificación: debe dar el número del último SP del año.
select clave, valor from public.correlativos where clave like 'sp-%';


-- ═══════════════════════════════════════════════════════════════════
-- PASO 5 · GT-AUT-02 · Escritura de inventario y órdenes por rol
--
--   APLICADO el 02/09/2026. Antes de aplicarlo se cruzaron los 16 usuarios
--   activos contra quién escribió realmente en cada tabla: los 16 pasan el
--   filtro de inventario, las solicitudes de salida las carga un almacenista
--   (conserva permiso), las órdenes las cargan analistas de compras (conservan)
--   y los equipos de maquinaria, Mariana y admin (conservan). El único «no
--   pasa» era `import-excel`, que no es una persona sino la etiqueta de la
--   importación masiva: esa corre con la sesión de quien la ejecuta.
--
--   Para revertir: volver a crear las políticas viejas con `is_operativo()`
--   sobre esas nueve tablas.
--
-- `movimientos`, `existencias` y `productos` los escribe media aplicación:
-- inventario, salidas, producción, acopio, recepciones, cocina y pedidos, todos
-- a través de `registrar_movimiento_stock` — que NO es SECURITY DEFINER, así
-- que corre con los permisos de quien la llama.
--
-- Por eso el gate no puede ser `puede('inventario')` a secas: le cerraría la
-- puerta al almacenista que registra una recepción o al cocinero que descuenta
-- víveres. Se define un helper con la lista de módulos que legítimamente tocan
-- inventario. Sigue siendo bastante más estricto que hoy —`is_operativo()`, o
-- sea cualquier cuenta activa sin mirar el rol—, que es justamente el hallazgo.
--
-- SUGERENCIA: aplicar este paso un día de poco movimiento y con alguien
-- probando en paralelo una recepción, una salida y un consumo de cocina.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.puede_inventario()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select public.is_admin()
      or public.puede('inventario') or public.puede('salidas')
      or public.puede('produccion')  or public.puede('acopio')
      or public.puede('recepciones') or public.puede('cocina')
      or public.puede('pedidos');
$fn$;
revoke execute on function public.puede_inventario() from public, anon;
grant  execute on function public.puede_inventario() to authenticated, service_role;

-- Kardex, existencias y ficha de producto: los mueven varios módulos.
drop policy if exists "movimientos write operativo" on public.movimientos;
create policy "movimientos write inv" on public.movimientos for all
  using (public.puede_inventario()) with check (public.puede_inventario());

drop policy if exists "existencias write operativo" on public.existencias;
create policy "existencias write inv" on public.existencias for all
  using (public.puede_inventario()) with check (public.puede_inventario());

drop policy if exists "productos write operativo" on public.productos;
create policy "productos write inv" on public.productos for all
  using (public.puede_inventario()) with check (public.puede_inventario());

drop policy if exists "productos insert op" on public.productos;
create policy "productos insert inv" on public.productos for insert
  with check (public.puede_inventario());

-- Estas sí tienen un dueño claro.
drop policy if exists "ordenes write op" on public.ordenes;
create policy "ordenes write pedidos" on public.ordenes for all
  using (public.is_admin() or public.puede('pedidos'))
  with check (public.is_admin() or public.puede('pedidos'));

drop policy if exists "produccion write operativo" on public.produccion;
create policy "produccion write prod" on public.produccion for all
  using (public.is_admin() or public.puede('produccion'))
  with check (public.is_admin() or public.puede('produccion'));

drop policy if exists "sol_salida write operativo" on public.solicitudes_salida;
create policy "sol_salida write salidas" on public.solicitudes_salida for all
  using (public.is_admin() or public.puede('salidas'))
  with check (public.is_admin() or public.puede('salidas'));

drop policy if exists "maq_equipos write op" on public.maquinaria_equipos;
create policy "maq_equipos write maq" on public.maquinaria_equipos for all
  using (public.is_admin() or public.puede('maquinaria'))
  with check (public.is_admin() or public.puede('maquinaria'));

drop policy if exists "acopio_hojas_excel write op" on public.acopio_hojas_excel;
create policy "acopio_hojas_excel write acopio" on public.acopio_hojas_excel for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

drop policy if exists "acopio_martillos_movimientos write op" on public.acopio_martillos_movimientos;
create policy "acopio_martillos write acopio" on public.acopio_martillos_movimientos for all
  using (public.is_admin() or public.puede('acopio'))
  with check (public.is_admin() or public.puede('acopio'));

-- `taxonomias` queda con is_operativo() A PROPÓSITO: son catálogos compartidos
-- que alimenta cualquier módulo con escritura; cerrarlos por módulo rompería
-- los selectores de media aplicación.


-- ═══════════════════════════════════════════════════════════════════
-- Verificación final del paso 5
-- ═══════════════════════════════════════════════════════════════════
select tablename, policyname, cmd, coalesce(qual, with_check, '-') as regla
from pg_policies
where schemaname = 'public'
  and tablename in ('movimientos','existencias','productos','ordenes','produccion',
                    'solicitudes_salida','maquinaria_equipos','acopio_hojas_excel',
                    'acopio_martillos_movimientos','personal','nomina_renglones',
                    'nomina_periodos','anticipos_prestamos','rrhh_eventos','proveedor_datos_pago')
order by tablename, cmd, policyname;
