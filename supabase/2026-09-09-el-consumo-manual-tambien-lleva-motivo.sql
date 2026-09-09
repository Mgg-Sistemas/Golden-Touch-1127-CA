-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 09/09/2026
-- Inventario · se cierra el hueco: el consumo manual también lleva motivo
--
-- ── POR QUÉ HAY UN SEGUNDO ARCHIVO ───────────────────────────────
-- Esta mañana se puso la regla para entrada, salida y ajuste hechos a mano.
-- Al escribirla quedó anotado que dejaba un hueco, y este archivo lo cierra:
--
-- El formulario de movimiento del inventario ofrece también «Consumo en
-- proceso», que RESTA STOCK igual que una salida. Como no pedía motivo, quien
-- no quisiera escribirlo podía elegir «consumo» en vez de «salida» y sacar
-- material sin explicar nada. Una regla que se esquiva cambiando una opción
-- de un desplegable no es una regla.
--
-- ── ESTE NO ARRASTRA DEUDA VIEJA ─────────────────────────────────
-- A diferencia de los otros tres, acá no hay historia que perdonar. Contados
-- antes de tocar nada, los consumos que existen son 914 y NINGUNO es manual:
--
--   cocina        900 movimientos, 0 sin motivo
--   cocina_sync    14 movimientos, 0 sin motivo
--
-- Los pone la Distribución de comidas y todos traen su texto. Movimientos de
-- consumo cargados a mano no hay ni uno. Así que la regla nace sin excepciones
-- que arrastrar: se agrega y ya está cumplida por todo lo que hay.
--
-- ── LA RESTRICCIÓN SIGUE SIENDO `NOT VALID`, Y NO POR EL CONSUMO ──
-- Se rehace entera porque una restricción CHECK no se puede ampliar en su
-- lugar. Sigue `not valid` por lo de siempre: los 120 movimientos viejos de
-- entrada, salida y ajuste que no llevan motivo. El kardex es una bitácora y
-- no se le reescribe el pasado. El consumo, por su cuenta, ya la cumple.
-- ═══════════════════════════════════════════════════════════════════

alter table public.movimientos
  drop constraint if exists movimiento_manual_lleva_motivo;

alter table public.movimientos
  add constraint movimiento_manual_lleva_motivo
  check (
    ref_tipo is distinct from 'manual'
    or tipo::text not in ('entrada', 'salida', 'ajuste', 'consumo')
    or length(btrim(coalesce(detalle, ''))) >= 3
  ) not valid;

comment on constraint movimiento_manual_lleva_motivo on public.movimientos is
  'Entrada, salida, ajuste y consumo cargados a mano (ref_tipo = manual) exigen un motivo de al menos 3 caracteres en `detalle`. El consumo entra el 09/09/2026 porque tambien resta stock y era la puerta para esquivar el motivo de una salida. NOT VALID: los 120 movimientos anteriores quedan como estan, la bitacora no se reescribe.';


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- La regla ya cubre los cuatro tipos; los viejos sin motivo siguen siendo los
-- mismos 120 de entrada/salida/ajuste (el consumo no suma ninguno).
-- ═══════════════════════════════════════════════════════════════════
select (select count(*) from public.movimientos m
         where m.ref_tipo = 'manual'
           and m.tipo::text in ('entrada','salida','ajuste')
           and length(btrim(coalesce(m.detalle,''))) < 3)  as viejos_sin_motivo,
       (select count(*) from public.movimientos m
         where m.ref_tipo = 'manual'
           and m.tipo::text = 'consumo'
           and length(btrim(coalesce(m.detalle,''))) < 3)  as consumos_manuales_sin_motivo,
       (select c.convalidated from pg_constraint c
          join pg_class t on t.oid = c.conrelid
         where t.relname = 'movimientos'
           and c.conname = 'movimiento_manual_lleva_motivo') as valida_lo_viejo;
