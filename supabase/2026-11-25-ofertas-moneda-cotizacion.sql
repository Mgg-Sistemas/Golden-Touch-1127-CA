-- ============================================================
-- Golden Touch · Compras · Moneda de la cotización: $ A BCV / EURO A BCV (25/11/2026)
--
-- El proveedor puede entregar la cotización en dólares o en euros.
-- Se guarda la moneda original y las tasas BCV usadas para convertir,
-- para poder volver a mostrar la oferta en euros aunque cambie la tasa.
--
-- El precio canónico (`precio_total` / `items[].precio`) NO cambia de
-- significado: sigue siendo el equivalente en $ a la tasa BCV. Por eso
-- el ranking, la OC y el PMP no se tocan. `precio_total_eur` y
-- `items[].precio_eur` son solo la vista en la moneda original.
-- ============================================================

alter table public.ofertas_proveedor
  add column if not exists moneda_cotizacion text not null default 'USD',
  add column if not exists tasa_usd_bcv numeric,
  add column if not exists tasa_eur_bcv numeric,
  add column if not exists precio_total_eur numeric;

comment on column public.ofertas_proveedor.moneda_cotizacion is
  'Moneda original de la cotización: USD ($ a BCV, también en ofertas antiguas) o EUR (euro a tasa BCV).';
comment on column public.ofertas_proveedor.tasa_usd_bcv is
  'Bs por 1 USD usada al convertir la cotización (BCV).';
comment on column public.ofertas_proveedor.tasa_eur_bcv is
  'Bs por 1 EUR usada al convertir la cotización (BCV).';
comment on column public.ofertas_proveedor.precio_total_eur is
  'Total en euros cotizado por el proveedor (informativo; el precio_total sigue en $ a BCV).';

-- Las ofertas ya cargadas son todas $ a BCV: el default cubre el histórico.
update public.ofertas_proveedor
   set moneda_cotizacion = 'USD'
 where moneda_cotizacion is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ofertas_proveedor_moneda_cotizacion_check') then
    alter table public.ofertas_proveedor add constraint ofertas_proveedor_moneda_cotizacion_check
      check (moneda_cotizacion in ('USD', 'EUR'));
  end if;
end $$;

-- Que PostgREST vea las columnas nuevas sin reiniciar.
notify pgrst, 'reload schema';
