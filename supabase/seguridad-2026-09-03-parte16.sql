-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · Seguridad · 03/09/2026 · PARTE 16
-- GT-INT-11 · El material sale hacia MGG antes de que MGG lo acepte,
--             y hoy nadie puede reintentarlo ni reponerlo
--
-- APLICADO el 03/09/2026. La verificación devolvió las dos tablas con
-- `revertida` en el CHECK y las cuatro columnas de reversión creadas.
-- Para revertir: quitar `revertida` de los dos CHECK y borrar las columnas
-- `revertida_at` / `revertida_por` (solo si ninguna fila las usa).
--
-- QUÉ PASA
-- Cuando se manda combustible o casiterita a MGG, el material sale PRIMERO del
-- tanque o del almacén y recién después se empuja por el puente. Si el puente
-- falla —un timeout alcanza— la fila queda en `error`, el usuario ve un mensaje
-- y ahí termina todo: el material ya no está en Golden Touch y nunca llegó a
-- MGG. Queda en el limbo entre los dos sistemas, sin botón para reintentar ni
-- para devolverlo.
--
-- Peor todavía: no hay NINGUNA pantalla que muestre estas transferencias. Las
-- funciones que las listan existen en el código pero no las llama nadie. O sea
-- que ni siquiera se puede ver que una quedó en error.
--
-- HOY NO HAY NADA PERDIDO. Se verificó antes de escribir esto: el puente de
-- combustible no tiene ninguna fila, y el de casiterita tiene una sola, en
-- estado `recibida`. Este cambio es preventivo.
--
-- QUÉ CAMBIA ACÁ
-- Solo lo que la base necesita para que el reintento y la reversión se puedan
-- registrar. Falta un estado y falta con qué auditar quién revirtió y cuándo.
--
--   · `revertida` como estado válido. No alcanza con `rechazada`: rechazada es
--     «MGG no lo quiso», revertida es «lo trajimos de vuelta nosotros». Son dos
--     hechos distintos y ambos importan para cuadrar.
--   · `revertida_at` y `revertida_por`, para que la devolución deje rastro.
--
-- El puente de casiterita no tenía ningún CHECK sobre `estado`: se le pone el
-- mismo que al de combustible. Se verificó que el único valor presente hoy es
-- `recibida`, y que el código solo escribe valores de esta lista.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- COMBUSTIBLE
-- ───────────────────────────────────────────────────────────────────
alter table public.transferencias_combustible_inter
  drop constraint if exists transferencias_combustible_inter_estado_check;

alter table public.transferencias_combustible_inter
  add constraint transferencias_combustible_inter_estado_check
  check (estado = any (array['enviada','por_confirmar','recibida','rechazada','error','revertida']));

alter table public.transferencias_combustible_inter
  add column if not exists revertida_at  timestamptz,
  add column if not exists revertida_por text;


-- ───────────────────────────────────────────────────────────────────
-- CASITERITA · no tenía CHECK; se le pone el mismo criterio
-- ───────────────────────────────────────────────────────────────────
alter table public.transferencias_casiterita_inter
  drop constraint if exists transferencias_casiterita_inter_estado_check;

alter table public.transferencias_casiterita_inter
  add constraint transferencias_casiterita_inter_estado_check
  check (estado = any (array['enviada','por_confirmar','recibida','rechazada','error','revertida']));

alter table public.transferencias_casiterita_inter
  add column if not exists revertida_at  timestamptz,
  add column if not exists revertida_por text;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  c.conrelid::regclass::text as tabla,
  pg_get_constraintdef(c.oid) as estado_permitido,
  (select count(*) from information_schema.columns col
    where col.table_schema = 'public'
      and col.table_name   = c.conrelid::regclass::text
      and col.column_name in ('revertida_at','revertida_por')) as columnas_de_reversion
from pg_constraint c
where c.conrelid in ('public.transferencias_combustible_inter'::regclass,
                     'public.transferencias_casiterita_inter'::regclass)
  and c.contype = 'c'
  and c.conname like '%estado%'
order by 1;
