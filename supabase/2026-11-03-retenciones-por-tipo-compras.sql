-- ============================================================
-- Golden Touch · Compras → Tesorería · Retenciones por tipo (03/11/2026)
--
-- Al indicar el método de pago de una OC / Control de Servicio con FACTURA y
-- marcar «¿cuándo se retiene?» (antes / después de pagar), Compras indica qué
-- se retiene y cuánto, por tipo:
--   · IVA  → % del IVA de la factura (75 % por defecto; 100 % si corresponde)
--   · ISLR → % de la base imponible (sin IVA)            (2 % por defecto)
--   · ISAE → % de la base imponible (impuesto municipal) (1 % por defecto)
--   · IGTF → % del IGTF de la orden                       (100 % por defecto)
-- El MONTO manda (el % es referencia); la app los sincroniza.
--
-- INVARIANTE DEL TOTAL: `ordenes.total` NO se toca. Sigue siendo el total de la
-- factura (base − descuento + IVA + IGTF). El neto a pagar se calcula:
--     neto = total − retencion_compras_total
-- y solo se paga el neto cuando retencion_momento = 'antes_de_pagar'.
-- Con 'despues_de_pagar' los montos quedan informados y se paga el total.
--
-- No se reutilizan `retencion_monto` / `retencion_aplicada`: esos los escribe
-- Tesorería AL PAGAR (lo que de verdad se restó del pago). Lo de Compras es lo
-- planificado; Tesorería lo ve precargado y puede ajustarlo.
-- ============================================================

alter table public.ordenes
  add column if not exists retencion_iva_pct      numeric,
  add column if not exists retencion_iva_monto    numeric,
  add column if not exists retencion_islr_pct     numeric,
  add column if not exists retencion_islr_monto   numeric,
  add column if not exists retencion_isae_pct     numeric,
  add column if not exists retencion_isae_monto   numeric,
  add column if not exists retencion_igtf_pct     numeric,
  add column if not exists retencion_igtf_monto   numeric,
  add column if not exists retencion_compras_total numeric not null default 0;

comment on column public.ordenes.retencion_iva_pct is 'Compras (método de pago): % retenido del IVA de la factura (referencia; manda el monto).';
comment on column public.ordenes.retencion_iva_monto is 'Compras (método de pago): retención de IVA indicada, en la moneda de la OC.';
comment on column public.ordenes.retencion_islr_pct is 'Compras: % de ISLR sobre la base imponible (sin IVA).';
comment on column public.ordenes.retencion_islr_monto is 'Compras: retención de ISLR indicada, en la moneda de la OC.';
comment on column public.ordenes.retencion_isae_pct is 'Compras: % de ISAE (municipal) sobre la base imponible.';
comment on column public.ordenes.retencion_isae_monto is 'Compras: retención de ISAE (municipal) indicada, en la moneda de la OC.';
comment on column public.ordenes.retencion_igtf_pct is 'Compras: % retenido del IGTF de la orden.';
comment on column public.ordenes.retencion_igtf_monto is 'Compras: retención de IGTF indicada, en la moneda de la OC.';
comment on column public.ordenes.retencion_compras_total is 'Compras: suma de las retenciones por tipo. Neto a pagar = total − esto (solo se paga el neto si retencion_momento = antes_de_pagar). ordenes.total no se reescribe.';

-- Montos y % nunca negativos; % hasta 100. Que la suma no alcance el total lo valida
-- la app (y Tesorería al pagar): un CHECK contra `total` haría fallar otros flujos que
-- reescriben el total (editar la OC, recepción) y eso no debe pasar por una retención.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_ret_compras_no_negativas') then
    alter table public.ordenes add constraint ordenes_ret_compras_no_negativas check (
      coalesce(retencion_iva_monto, 0)  >= 0 and coalesce(retencion_islr_monto, 0) >= 0 and
      coalesce(retencion_isae_monto, 0) >= 0 and coalesce(retencion_igtf_monto, 0) >= 0 and
      retencion_compras_total >= 0 and
      coalesce(retencion_iva_pct, 0)  between 0 and 100 and coalesce(retencion_islr_pct, 0) between 0 and 100 and
      coalesce(retencion_isae_pct, 0) between 0 and 100 and coalesce(retencion_igtf_pct, 0) between 0 and 100
    );
  end if;
end $$;
