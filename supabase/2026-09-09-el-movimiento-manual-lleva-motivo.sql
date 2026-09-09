-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Inventario · entrada, salida y ajuste hechos a mano llevan motivo
--
-- ── QUÉ PASABA ───────────────────────────────────────────────────
-- El kardex guarda el motivo en `detalle`, y era opcional: el formulario lo
-- rotulaba «Detalle (opcional)» y la columna admitía nulo. En los movimientos
-- que genera el sistema no importa, porque el propio flujo escribe de dónde
-- viene (la orden, la recepción, la cocina). En los que carga una persona a
-- mano sí importa: son justo los que después nadie sabe explicar.
--
-- Contado antes de tocar nada:
--   ajuste manual   26 movimientos, 16 sin motivo
--   entrada manual  76 movimientos, 73 sin motivo
--   salida manual   31 movimientos, 31 sin motivo
--
-- 120 movimientos de stock cargados a mano sin una línea que diga por qué.
--
-- ── DÓNDE SE PONE LA REGLA ───────────────────────────────────────
-- Acá, en la base, no en la pantalla. El navegador habla directo con Postgres:
-- una validación en React se saltea con la consola abierta. La pantalla
-- también valida, pero para avisar antes y bien, no para proteger.
--
-- ── A QUÉ MOVIMIENTOS APLICA, Y POR QUÉ SOLO A ESOS ──────────────
-- A los que tienen `ref_tipo = 'manual'` Y son entrada, salida o ajuste.
-- El único código que marca un movimiento como `manual` es el formulario de
-- movimiento del inventario; lo verifiqué en todo el repositorio.
--
-- Hay una trampa que conviene dejar escrita: `registrarMovimiento` pone
-- `ref_tipo: input.ref_tipo ?? 'manual'`. O sea que cualquier llamada que
-- OLVIDE indicar el origen queda rotulada como manual sin serlo. Revisé las
-- 37 llamadas del sistema: solo cuatro omiten el origen, y las cuatro son de
-- tipo `creacion` o `transferencia` —que no entran en la regla— y además ya
-- traen su motivo. Ninguna se rompe.
--
-- Quedan FUERA a propósito:
--   · `creacion`: el alta de un producto ya escribe su propio texto.
--   · `transferencia`: idem, dice de qué almacén a cuál.
--   · `consumo`, `fundicion`, `fin_fundicion`: no son los tres que se pidieron.
--     Vale decirlo claro porque deja un hueco: el formulario ofrece «Consumo en
--     proceso», que también resta stock, y por ahí se puede esquivar el motivo
--     de una salida. Si se decide cerrarlo, es agregar `consumo` a la lista de
--     abajo y a la validación de la pantalla.
--
-- ── POR QUÉ `NOT VALID` ──────────────────────────────────────────
-- Los 120 movimientos viejos no pasan la regla, y no se tocan: el kardex es
-- una bitácora, y reescribirle el pasado para que cierre con una regla nueva
-- es peor que dejar el hueco a la vista. `not valid` deja la historia como
-- está y exige el motivo de acá en adelante, que es lo que se pidió.
-- Si algún día se completan a mano, se ejecuta:
--   alter table public.movimientos validate constraint movimiento_manual_lleva_motivo;
--
-- ── EL MÍNIMO DE 3 CARACTERES ────────────────────────────────────
-- La regla no pide «que no esté vacío» sino tres caracteres sin contar
-- espacios. Un punto o una letra suelta cumplen la letra de «poner el motivo»
-- y no informan nada; con eso el cambio quedaría en apariencia. Tres es lo
-- mínimo que puede ser una palabra. Si molesta, se baja.
-- ═══════════════════════════════════════════════════════════════════

alter table public.movimientos
  drop constraint if exists movimiento_manual_lleva_motivo;

alter table public.movimientos
  add constraint movimiento_manual_lleva_motivo
  check (
    ref_tipo is distinct from 'manual'
    or tipo::text not in ('entrada', 'salida', 'ajuste')
    or length(btrim(coalesce(detalle, ''))) >= 3
  ) not valid;

comment on constraint movimiento_manual_lleva_motivo on public.movimientos is
  'Entrada, salida y ajuste cargados a mano (ref_tipo = manual) exigen un motivo de al menos 3 caracteres en `detalle`. NOT VALID: los 120 movimientos anteriores al 09/09/2026 quedan como están, la bitácora no se reescribe.';


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- La regla existe y NO está validada (la historia vieja sigue en su lugar),
-- y se ve cuántos movimientos viejos quedaron sin motivo.
-- ═══════════════════════════════════════════════════════════════════
select c.conname                                        as regla,
       c.convalidated                                   as valida_lo_viejo,
       (select count(*) from public.movimientos m
         where m.ref_tipo = 'manual'
           and m.tipo::text in ('entrada','salida','ajuste')
           and length(btrim(coalesce(m.detalle,''))) < 3) as viejos_sin_motivo
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
 where t.relname = 'movimientos'
   and c.conname = 'movimiento_manual_lleva_motivo';
