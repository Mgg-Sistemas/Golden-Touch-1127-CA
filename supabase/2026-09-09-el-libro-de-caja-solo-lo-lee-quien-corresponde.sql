-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Paso 3 de la revisión de lecturas: el libro de caja
--
-- ── LO PRIMERO, PORQUE CAMBIA EL DIAGNÓSTICO ─────────────────────
-- `movimientos_caja` no tenía UNA política de lectura, tenía DOS caminos:
--
--   1. "movimientos_caja read auth"       SELECT → auth.role() = 'authenticated'
--   2. "movimientos_caja write operativo" ALL    → is_admin() or puede('tesoreria')
--                                                  or puede('pedidos') or puede('rrhh')
--                                                  or puede('salidas')
--
-- La segunda dice ALL, y en Postgres ALL incluye SELECT. Las políticas
-- permisivas se SUMAN con OR. O sea: cambiar solo la primera no habría
-- restringido nada, porque la segunda seguía dando lectura por su cuenta.
--
-- Es una trampa que conviene dejar escrita: una política `for all` pensada
-- como "permiso de escritura" también abre la lectura. Por eso acá se PARTE
-- en insert / update / delete, con la MISMA condición que tenía, y la lectura
-- queda gobernada por una sola regla.
--
-- (Revisé los dos pasos anteriores por las dudas: en `ventas` y en las cuentas
-- por cobrar la política ALL es `puede('ventas')` / `puede('tesoreria')`, que
-- es MÁS ESTRECHA que la de lectura que les puse. Ahí no había fuga y no hace
-- falta tocar nada.)
--
-- ── POR QUÉ NO ALCANZABA CON GATEAR POR MÓDULO ───────────────────
-- Lo verifiqué contra los usuarios reales: los 16 activos tienen lectura Y
-- escritura de `pedidos`. Todos. Así que una regla del tipo "tesorería o
-- pedidos o rrhh o salidas" habría dejado exactamente a las mismas 16
-- personas leyendo exactamente lo mismo. Un cambio para la foto, no para la
-- realidad.
--
-- Por eso la regla es POR FILA, no por módulo: cada área ve las filas de su
-- trabajo, no el libro entero.
--
-- ── QUÉ LEE CADA UNO, VERIFICADO EN EL CÓDIGO ────────────────────
-- Recorrí todas las consultas al libro. No hay más que estas:
--   · Tesorería       → el libro completo (`listMovimientosCaja`, cierres).
--                       Es su módulo; ahí se concilia y se cierra el mes.
--   · Pedidos/Compras → pagos casados a una orden (`ref_orden_id`), y los
--                       pagos de compra directa y servicio directo, que se
--                       reconcilian por categoría.
--   · Ventas          → los cobros de una venta (`ref_venta_id`). Ojo: Ventas
--                       lee por la vista `ventas_movimientos_caja`, que ayer
--                       pasó a `security_invoker`, así que ahora hereda ESTA
--                       regla. Sin esta línea, la vista quedaba muda.
--   · RRHH            → los pagos de nómina (`ref_nomina_renglon_id`).
--   · Salidas         → los traslados de dinero y los anticipos a conciliar
--                       con mineral (`estado_mineral`). Hoy son CERO filas:
--                       en Golden Touch ese flujo no se usa.
--
-- ── LA LÍNEA DEL `actor`, QUE NO ES UN CAPRICHO ──────────────────
-- `or actor = (auth.jwt() ->> 'email')` — uno ve lo que uno mismo hizo.
--
-- No es una concesión: es NECESARIA. Cuando el sistema registra un pago hace
-- `insert(...).select('*').single()`, y esa devolución pasa por la política de
-- LECTURA. Si la fila recién escrita no se puede leer, el `.single()` falla y
-- se cae la operación entera.
--
-- Pasa de verdad en dos lugares que revisé: la comisión bancaria de una compra
-- directa se guarda con categoría `gasto` (no `comision_bancaria`, como sí hace
-- el camino de la OC), y los reversos de anulación se guardan con categoría
-- `reverso`. Sin esta línea, un analista de compras no podría pagar una compra
-- directa con comisión, ni anularla.
--
-- La alternativa era meter `gasto` en la regla de Pedidos, y eso habría dejado
-- las 68 filas de gastos de la empresa a la vista de todos: justo lo que se
-- quiere evitar. Comprobado que sirve: las 253 filas del libro tienen `actor`
-- con un correo que existe en `usuarios`.
--
-- ── QUÉ DEJA DE VER LA GENTE ─────────────────────────────────────
-- De 253 movimientos, quien solo tiene Pedidos deja de ver 138: los 68 gastos
-- de la empresa, los 59 ingresos de dinero y las 11 conversiones de divisa.
-- Son 7 personas hoy (2 almacenistas, 3 analistas de compras, 1 analista y 1
-- del centro de acopio).
--
-- ── `caja_lotes` Y `cierres_caja` ENTRAN TAMBIÉN ─────────────────
-- Los lotes de divisa (monto y tasa de cada ingreso) y los cierres de mes solo
-- los lee Tesorería; lo verifiqué, no hay otro consumidor. Se cierran a
-- `puede_leer('tesoreria')`.
-- En los lotes hay que partir la política ALL igual que arriba, porque los
-- ESCRIBEN también Pedidos y Salidas (`egresarDivisa` se llama al pagar una
-- compra directa). Escribir sí, leer no: los `insert` de lotes no devuelven la
-- fila, así que no se rompe nada.
-- En los cierres no hace falta partir nada: su política ALL ya es de tesorería.
--
-- ── LO QUE NO SE TOCA, Y POR QUÉ ─────────────────────────────────
-- `cajas` y `caja_saldos` quedan como están, leídas por cualquiera logueado.
-- No es olvido: el selector de caja aparece en Pedidos, Salidas, Ventas y
-- Compra directa, y todos necesitan la lista para elegir de dónde sale la
-- plata. El problema real ahí no es QUÉ FILAS se ven sino QUÉ COLUMNAS: sobra
-- el `saldo`. El RLS filtra filas, no columnas, así que eso se arregla con una
-- vista que exponga solo id/nombre/moneda y cambiando quién la consume. Es un
-- cambio de código en varias pantallas y va aparte, con su prueba.
--
-- Tampoco se toca la ESCRITURA: sigue igual de amplia que antes (tesorería,
-- pedidos, rrhh, salidas). Queda anotado que hoy alguien de compras puede
-- editar o borrar un movimiento manual que no es suyo. Es un problema real,
-- pero es de escritura y este paso es de lectura; mezclarlos hace imposible
-- saber cuál de los dos rompió algo si algo rompe.
-- ═══════════════════════════════════════════════════════════════════

-- ── movimientos_caja · la política ALL se parte para que no dé lectura ──
drop policy if exists "movimientos_caja write operativo" on public.movimientos_caja;

create policy "movimientos_caja insert operativo" on public.movimientos_caja
  for insert with check (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'));

create policy "movimientos_caja update operativo" on public.movimientos_caja
  for update using      (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'))
             with check (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'));

create policy "movimientos_caja delete operativo" on public.movimientos_caja
  for delete using (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'));

-- ── movimientos_caja · la lectura, por fila ──────────────────────
drop policy if exists "movimientos_caja read auth" on public.movimientos_caja;

create policy "movimientos_caja read rol" on public.movimientos_caja
  for select using (
       puede_leer('tesoreria')
    or actor = (auth.jwt() ->> 'email')
    or (puede_leer('pedidos') and (ref_orden_id is not null
                                   or categoria in ('compra_directa','servicio_directo')))
    or (puede_leer('ventas')  and ref_venta_id is not null)
    or (puede_leer('rrhh')    and ref_nomina_renglon_id is not null)
    or (puede_leer('salidas') and (tipo = 'traslado_salida' or estado_mineral is not null))
  );

-- ── caja_lotes · escribir sí, leer solo Tesorería ────────────────
drop policy if exists "caja_lotes write operativo" on public.caja_lotes;

create policy "caja_lotes insert operativo" on public.caja_lotes
  for insert with check (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'));

create policy "caja_lotes update operativo" on public.caja_lotes
  for update using      (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'))
             with check (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'));

create policy "caja_lotes delete operativo" on public.caja_lotes
  for delete using (is_admin() or puede('tesoreria') or puede('pedidos') or puede('rrhh') or puede('salidas'));

drop policy if exists "caja_lotes read auth" on public.caja_lotes;
create policy "caja_lotes read rol" on public.caja_lotes
  for select using (puede_leer('tesoreria'));

-- ── cierres_caja · su ALL ya es de tesorería, solo va la lectura ──
drop policy if exists "cierres read auth" on public.cierres_caja;
create policy "cierres read rol" on public.cierres_caja
  for select using (puede_leer('tesoreria'));


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- Ninguna política debe quedar en `ALL` sobre estas tablas, y la de SELECT
-- debe ser la nueva.
-- ═══════════════════════════════════════════════════════════════════
select tablename, cmd, policyname
  from pg_policies
 where schemaname = 'public'
   and tablename in ('movimientos_caja','caja_lotes','cierres_caja')
 order by tablename, cmd, policyname;
