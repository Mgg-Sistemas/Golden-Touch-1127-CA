-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 14/09/2026
-- Pagar una OC: retención descontada y reembolso de lo pagado de más
--
-- RETENCIÓN
-- Desde Tesorería se marca «Tiene retención» y se escribe el monto. Ese
-- monto se RESTA del total de la factura antes de pagar: se paga el neto.
-- Queda guardado en la orden para saber después por qué se pagó menos.
--   · retencion_aplicada  → si al pagar se marcó que tenía retención
--   · retencion_monto     → cuánto se retuvo, en la moneda de la OC
--
-- REEMBOLSO
-- Antes el formulario no dejaba pagar más que el total. Ahora, con una
-- confirmación, se paga lo que corresponde y lo que sobra sale en OTRO
-- egreso, categoría `reembolso_oc`, con el concepto
-- «REEMBOLSO DE ORDEN DE COMPRA OC-…». Así el pago de la OC dice
-- exactamente lo que valía la factura y el excedente queda a la vista.
--   · reembolso_usd          → cuánto se pagó de más, en USD equivalente
--   · reembolso_caja_mov_ids → los egresos de reembolso en movimientos_caja
--
-- Todas con default: las órdenes existentes quedan en «sin retención, sin
-- reembolso», que es lo que eran. No hay backfill que hacer.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ordenes
  add column if not exists retencion_aplicada     boolean not null default false,
  add column if not exists retencion_monto        numeric not null default 0,
  add column if not exists reembolso_usd          numeric not null default 0,
  add column if not exists reembolso_caja_mov_ids jsonb   not null default '[]'::jsonb;

comment on column public.ordenes.retencion_aplicada is
  'Al pagar en Tesorería se marcó que la factura tenía retención.';
comment on column public.ordenes.retencion_monto is
  'Monto retenido, en la moneda de la OC. Se restó del total de la factura al pagar.';
comment on column public.ordenes.reembolso_usd is
  'Lo pagado de más al pagar la OC, en USD equivalente. Salió en egresos aparte (categoria reembolso_oc).';
comment on column public.ordenes.reembolso_caja_mov_ids is
  'Ids de movimientos_caja de los egresos de reembolso de esta OC.';

-- Verificación
select count(*) filter (where column_name in
         ('retencion_aplicada','retencion_monto','reembolso_usd','reembolso_caja_mov_ids')) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ordenes';
