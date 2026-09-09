-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Paso 4 de la revisión de lecturas: las cuentas por pagar
--
-- ── CÓMO ESTABAN ─────────────────────────────────────────────────
-- Las tres tablas repetían el mismo par que el libro de caja:
--
--   "cxp read auth"       SELECT → auth.role() = 'authenticated'
--   "cxp write operativo" ALL    → is_admin() or puede('tesoreria')
--                                  or puede('acopio') or puede('pedidos')
--
-- Y otra vez: ALL incluye SELECT, y las políticas permisivas se suman. Como
-- los 16 usuarios activos tienen `pedidos`, cambiar solo la de SELECT no
-- habría restringido nada. Se parte en insert / update / delete con la MISMA
-- condición, y la lectura queda en una sola regla.
--
-- ── QUIÉN LAS LEE DE VERDAD ──────────────────────────────────────
-- Todo el código que las consulta vive en `tesoreria/cuentasPorPagar.repository.ts`,
-- y solo lo importan pantallas de Tesorería. Lo verifiqué archivo por archivo.
--
-- Pedidos aparece suscrito a `cuentas_por_pagar` por realtime, pero no la lee:
-- el evento solo dispara `resumenPendientesPorPagar()`, que cuenta sobre
-- `ordenes`, `compras_directas` y `servicios_directos`. Se queda sin efecto y
-- no se rompe nada.
--
-- ── POR QUÉ ACOPIO SÍ ENTRA, Y NO ES UN FAVOR ────────────────────
-- La tabla madre la escribe un TRIGGER: `trg_sync_deuda_mgg_acopio`, colgado
-- de `acopio_caja_movimientos`. Cada vez que el centro de acopio registra USD
-- entregados, el trigger recalcula la deuda con MGG y la deja acá.
--
-- La clave: esa función NO es SECURITY DEFINER. Corre con los permisos de
-- quien dispara el movimiento, así que el RLS se le aplica adentro. Y antes de
-- escribir hace un SELECT para ver si la cuenta ya existe:
--
--   select id, coalesce(abonado,0) ... from cuentas_por_pagar
--    where tipo='proveedor' and moneda='USD' and contraparte ilike 'MGG'
--
-- Si Acopio no puede LEER la tabla, ese select no encuentra la fila, el
-- trigger cree que no existe y crea una segunda cuenta por pagar a MGG. No
-- falla con error: duplica la deuda en silencio, que es peor.
--
-- Por eso la regla de la madre es `tesoreria or acopio`. En las hijas no hace
-- falta: el trigger no las toca.
--
-- (La alternativa era volver la función SECURITY DEFINER y dejar la madre solo
-- para Tesorería. No se hace: esa función no lleva control de permisos adentro
-- —no lo necesitaba, la llamaba un trigger—, y volverla DEFINER sin agregarle
-- ese control es abrir una puerta para cerrar una ventana.)
--
-- ── QUÉ CAMBIA EN LA PRÁCTICA ────────────────────────────────────
-- Dejan de leer las cuentas por pagar 6 de los 16 usuarios activos: los 2
-- almacenistas, los 3 analistas de compras y el analista. Ninguno tiene
-- pantalla que las muestre; las leían solo porque la API se lo permitía.
--
-- Siguen leyéndolas Tesorería (por su módulo) y el analista de centro de
-- acopio (por el trigger de arriba).
--
-- Hoy hay 1 fila en la madre y ninguna en las hijas. Es poco dato, pero es
-- exactamente el que no conviene que circule: cuánto le debe la empresa a
-- quién.
--
-- ── LO QUE NO SE TOCA ────────────────────────────────────────────
-- La ESCRITURA queda igual de amplia que antes (tesorería, acopio, pedidos).
-- `pedidos` ahí es vestigial —ningún código de Pedidos escribe estas tablas—
-- pero quitarlo es un cambio de escritura y este paso es de lectura. Se anota
-- para la limpieza de escrituras, junto con lo del libro de caja.
-- ═══════════════════════════════════════════════════════════════════

-- ── cuentas_por_pagar ────────────────────────────────────────────
drop policy if exists "cxp write operativo" on public.cuentas_por_pagar;

create policy "cxp insert operativo" on public.cuentas_por_pagar
  for insert with check (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

create policy "cxp update operativo" on public.cuentas_por_pagar
  for update using      (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'))
             with check (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

create policy "cxp delete operativo" on public.cuentas_por_pagar
  for delete using (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

drop policy if exists "cxp read auth" on public.cuentas_por_pagar;
create policy "cxp read rol" on public.cuentas_por_pagar
  for select using (puede_leer('tesoreria') or puede_leer('acopio'));

-- ── cuentas_por_pagar_abonos ─────────────────────────────────────
drop policy if exists "cxpa write operativo" on public.cuentas_por_pagar_abonos;

create policy "cxpa insert operativo" on public.cuentas_por_pagar_abonos
  for insert with check (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

create policy "cxpa update operativo" on public.cuentas_por_pagar_abonos
  for update using      (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'))
             with check (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

create policy "cxpa delete operativo" on public.cuentas_por_pagar_abonos
  for delete using (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

drop policy if exists "cxpa read auth" on public.cuentas_por_pagar_abonos;
create policy "cxpa read rol" on public.cuentas_por_pagar_abonos
  for select using (puede_leer('tesoreria'));

-- ── cuentas_por_pagar_ingresos ───────────────────────────────────
drop policy if exists "cxp_ingresos write" on public.cuentas_por_pagar_ingresos;

create policy "cxp_ingresos insert" on public.cuentas_por_pagar_ingresos
  for insert with check (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

create policy "cxp_ingresos update" on public.cuentas_por_pagar_ingresos
  for update using      (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'))
             with check (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

create policy "cxp_ingresos delete" on public.cuentas_por_pagar_ingresos
  for delete using (is_admin() or puede('tesoreria') or puede('acopio') or puede('pedidos'));

drop policy if exists "cxp_ingresos read" on public.cuentas_por_pagar_ingresos;
create policy "cxp_ingresos read rol" on public.cuentas_por_pagar_ingresos
  for select using (puede_leer('tesoreria'));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- Ninguna política debe quedar en `ALL`; la de SELECT debe ser la nueva.
-- ═══════════════════════════════════════════════════════════════════
select tablename, cmd, policyname
  from pg_policies
 where schemaname = 'public' and tablename like 'cuentas_por_pagar%'
 order by tablename, cmd, policyname;
