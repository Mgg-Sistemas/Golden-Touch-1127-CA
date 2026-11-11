-- 11/11/2026 · Centro de Costo PERAMANAL: editar una caja YA CERRADA con motivo.
-- Cada edición queda anotada en la caja (quién, cuándo, motivo, qué cambió y el saldo
-- antes → después). La foto del cierre (resumen_json / saldo_final) se rehace desde la
-- app y, si cambió el saldo, se corrige el «Saldo anterior» de la caja siguiente.
-- Los movimientos de una caja cerrada se editan y borran; agregar sigue bloqueado
-- (trg_movimiento_en_caja_cerrada).
alter table public.acopio_cajas
  add column if not exists ediciones jsonb not null default '[]'::jsonb;

comment on column public.acopio_cajas.ediciones is
  'Ediciones hechas con la caja ya cerrada: [{at, actor, actor_name, motivo, cambio, saldo_antes, saldo_despues}].';
