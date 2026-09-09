-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Paso 5: la limpieza de ESCRITURAS que fui anotando en los pasos 3 y 4
--
-- ── DE QUÉ SE TRATA ──────────────────────────────────────────────
-- Al cerrar las lecturas del libro de caja y de las cuentas por pagar dejé
-- escrito que la escritura quedaba igual de amplia que antes, y por qué: si
-- cambiaba las dos cosas en el mismo paso y algo se rompía, no habría forma de
-- saber cuál de los dos cambios lo rompió. Ese era el motivo, no el olvido.
-- Las lecturas ya están aplicadas y verificadas, así que ahora va la otra
-- mitad, sola y con su propia prueba.
--
-- ── EL PROBLEMA, EN CONCRETO ─────────────────────────────────────
-- Las cuatro tablas tenían una sola condición para TODA la escritura:
-- insertar, modificar y borrar pedían lo mismo. Y esa condición era la unión
-- de todos los módulos que tocan la tabla de algún modo.
--
-- El resultado es que quien solo necesita AGREGAR también podía MODIFICAR y
-- BORRAR lo de otros. Un analista de compras, que lo único que hace en el
-- libro de caja es registrar el pago de una compra directa, podía editar el
-- monto de un gasto ajeno o borrar un movimiento de Tesorería.
--
-- Insertar, modificar y borrar no son el mismo permiso y no tienen por qué
-- darse juntos. Acá se separan según quién hace cada cosa DE VERDAD, que lo
-- verifiqué recorriendo las pantallas que llaman a cada función.
--
-- ── LO QUE ENCONTRÉ, PANTALLA POR PANTALLA ───────────────────────
--
-- movimientos_caja
--   · INSERTAN cuatro módulos y los cuatro con motivo:
--       Tesorería (gastos, ingresos, pagos, conversiones)
--       Pedidos   (pago de OC, compra directa, servicio directo y su comisión)
--       RRHH      (pago de nómina)
--       Salidas   (salida y traslado de dinero, ajuste de saldo de una caja)
--     Se queda como estaba. Achicarlo rompe pagos que hoy funcionan.
--   · MODIFICAN solo dos: Tesorería (editar un movimiento manual, corregir la
--     fecha, marcar el cierre de mes) y Salidas (conciliar un anticipo con el
--     mineral que llegó, que escribe el resultado sobre el mismo movimiento).
--   · BORRAN solo Tesorería. El botón vive en su pantalla y en ninguna otra.
--     (Ojo: Acopio tiene una función con el mismo nombre, pero es de otra
--     tabla —`acopio_caja_movimientos`—. Lo confirmé para no confundirlas.)
--
-- caja_lotes
--   · INSERTAN Tesorería, Pedidos y Salidas: cada ingreso de divisa deja su
--     lote, y eso pasa también al pagar una compra directa.
--   · NADIE los modifica ni los borra. Buscado en todo el código: no existe
--     una sola llamada. Quedan en Tesorería como válvula, no como uso.
--
-- cuentas_por_pagar
--   · INSERTAN y MODIFICAN Tesorería y el disparador del acopio (el que
--     recalcula la deuda con MGG, explicado en el paso 4).
--   · `pedidos` estaba en la condición y NO escribe nada: ningún archivo del
--     módulo toca estas tablas. Era permiso vestigial. Se va.
--   · NADIE borra. Queda en Tesorería como válvula.
--
-- cuentas_por_pagar_abonos · cuentas_por_pagar_ingresos
--   · Solo Tesorería, en todo. El disparador del acopio no las toca —lo leí en
--     su cuerpo, solo escribe la tabla madre—, y Pedidos tampoco.
--
-- ── QUÉ NO CAMBIA ────────────────────────────────────────────────
-- Nadie pierde la capacidad de hacer su trabajo. Ninguna de las operaciones
-- que hoy existen en una pantalla deja de estar permitida: lo que se quita es
-- permiso que ninguna pantalla usa. Por eso este cambio no debería notarse, y
-- si se nota es que encontré mal a algún consumidor.
--
-- `cajas` y `caja_saldos` no entran. Ahí la escritura la hacen funciones del
-- servidor (`aplicar_saldo_caja`, `aplicar_saldo_divisa`) desde casi todos los
-- flujos de pago, y separar eso pide revisarlas una por una. Va en su momento.
-- ═══════════════════════════════════════════════════════════════════

-- ── movimientos_caja ─────────────────────────────────────────────
-- Insertar: los cuatro módulos que registran plata (sin cambios).
-- Modificar: Tesorería y Salidas (conciliación de mineral).
-- Borrar: solo Tesorería.
-- Lo de Salidas va POR FILA, y no es un adorno: `salidas` con escritura la
-- tienen casi todos los roles (los almacenistas y los analistas de compras
-- incluidos). Dejarlo por módulo habría permitido editar cualquier movimiento
-- del libro, que es justo lo que se está corrigiendo. La conciliación solo
-- toca anticipos de mineral, y esos son los que llevan `estado_mineral`.
drop policy if exists "movimientos_caja update operativo" on public.movimientos_caja;
create policy "movimientos_caja update operativo" on public.movimientos_caja
  for update using      (is_admin() or puede('tesoreria') or (puede('salidas') and estado_mineral is not null))
             with check (is_admin() or puede('tesoreria') or (puede('salidas') and estado_mineral is not null));

drop policy if exists "movimientos_caja delete operativo" on public.movimientos_caja;
create policy "movimientos_caja delete operativo" on public.movimientos_caja
  for delete using (is_admin() or puede('tesoreria'));

-- ── caja_lotes ───────────────────────────────────────────────────
-- Insertar: sin cambios (cada ingreso de divisa deja su lote).
-- Modificar y borrar: nadie lo hace; queda en Tesorería.
drop policy if exists "caja_lotes update operativo" on public.caja_lotes;
create policy "caja_lotes update operativo" on public.caja_lotes
  for update using      (is_admin() or puede('tesoreria'))
             with check (is_admin() or puede('tesoreria'));

drop policy if exists "caja_lotes delete operativo" on public.caja_lotes;
create policy "caja_lotes delete operativo" on public.caja_lotes
  for delete using (is_admin() or puede('tesoreria'));

-- ── cuentas_por_pagar · se va `pedidos`, que no escribe nada ─────
drop policy if exists "cxp insert operativo" on public.cuentas_por_pagar;
create policy "cxp insert operativo" on public.cuentas_por_pagar
  for insert with check (is_admin() or puede('tesoreria') or puede('acopio'));

drop policy if exists "cxp update operativo" on public.cuentas_por_pagar;
create policy "cxp update operativo" on public.cuentas_por_pagar
  for update using      (is_admin() or puede('tesoreria') or puede('acopio'))
             with check (is_admin() or puede('tesoreria') or puede('acopio'));

drop policy if exists "cxp delete operativo" on public.cuentas_por_pagar;
create policy "cxp delete operativo" on public.cuentas_por_pagar
  for delete using (is_admin() or puede('tesoreria'));

-- ── cuentas_por_pagar_abonos · solo Tesorería ────────────────────
drop policy if exists "cxpa insert operativo" on public.cuentas_por_pagar_abonos;
create policy "cxpa insert operativo" on public.cuentas_por_pagar_abonos
  for insert with check (is_admin() or puede('tesoreria'));

drop policy if exists "cxpa update operativo" on public.cuentas_por_pagar_abonos;
create policy "cxpa update operativo" on public.cuentas_por_pagar_abonos
  for update using      (is_admin() or puede('tesoreria'))
             with check (is_admin() or puede('tesoreria'));

drop policy if exists "cxpa delete operativo" on public.cuentas_por_pagar_abonos;
create policy "cxpa delete operativo" on public.cuentas_por_pagar_abonos
  for delete using (is_admin() or puede('tesoreria'));

-- ── cuentas_por_pagar_ingresos · solo Tesorería ──────────────────
drop policy if exists "cxp_ingresos insert" on public.cuentas_por_pagar_ingresos;
create policy "cxp_ingresos insert" on public.cuentas_por_pagar_ingresos
  for insert with check (is_admin() or puede('tesoreria'));

drop policy if exists "cxp_ingresos update" on public.cuentas_por_pagar_ingresos;
create policy "cxp_ingresos update" on public.cuentas_por_pagar_ingresos
  for update using      (is_admin() or puede('tesoreria'))
             with check (is_admin() or puede('tesoreria'));

drop policy if exists "cxp_ingresos delete" on public.cuentas_por_pagar_ingresos;
create policy "cxp_ingresos delete" on public.cuentas_por_pagar_ingresos
  for delete using (is_admin() or puede('tesoreria'));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- Cada tabla con sus cuatro reglas separadas y su condición propia.
-- ═══════════════════════════════════════════════════════════════════
select tablename, cmd, coalesce(qual, with_check) as condicion
  from pg_policies
 where schemaname = 'public'
   and tablename in ('movimientos_caja','caja_lotes','cuentas_por_pagar',
                     'cuentas_por_pagar_abonos','cuentas_por_pagar_ingresos')
 order by tablename, cmd;
