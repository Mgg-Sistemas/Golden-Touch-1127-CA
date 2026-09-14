-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 14/09/2026
-- La retención al pagar una OC se carga en Bs o en $, con tasa editable
--
-- El comprobante de retención sale en bolívares, pero la OC puede estar en
-- dólares. Al pagar, la retención se escribe en Bs o en $ y se convierte con
-- una tasa que arranca en la BCV del día y se puede cambiar.
--
-- `retencion_monto` (ya existe) sigue siendo lo que se RESTÓ, en la moneda
-- de la OC. Se agregan dos datos para poder reconstruir la cuenta:
--   · retencion_monto_bs → la retención en bolívares
--   · retencion_tasa     → la tasa (Bs por $) con la que se convirtió
--
-- Nullables y sin default: las órdenes pagadas antes no tienen ese dato, y un
-- cero diría que se retuvo 0 Bs, que no es verdad.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ordenes
  add column if not exists retencion_monto_bs numeric,
  add column if not exists retencion_tasa     numeric;

comment on column public.ordenes.retencion_monto_bs is
  'Retención en bolívares al pagar la OC en Tesorería.';
comment on column public.ordenes.retencion_tasa is
  'Tasa (Bs por $) con la que se convirtió la retención al pagar. Editable: puede no ser la BCV del día.';

-- Verificación
select count(*) filter (where column_name in ('retencion_monto_bs','retencion_tasa')) as columnas_nuevas
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ordenes';
