-- 23/10/2026 · RRHH · Cada empresa maneja su moneda de pago (Real brasileño).
--
-- · rrhh_empresas.moneda_pago: 'USD' (por defecto: recibos solo en $ y Bs, como hasta ahora)
--   o 'BRL' (los recibos de bonificación salen en $ y en Real brasileño, con la tasa).
-- · nomina_periodos.tasa_brl / tasa_brl_fecha: R$ por 1 USD que se usó al cargar la nómina
--   (queda congelada, igual que tasa_bcv: el recibo se firma con esa tasa).
--
-- La tasa del Real la trae la Edge Function `tasa-brl` y queda en `tasa_cambio`
-- (moneda 'BRL', 4 decimales) y en `tasa_snapshot` (par 'BRL_USD'). No hay CHECK sobre
-- tasa_cambio.moneda ni tasa_snapshot.par, así que no hace falta tocarlas.
-- Cambio solo de agregar: no borra ni reescribe nada.

alter table public.rrhh_empresas
  add column if not exists moneda_pago text not null default 'USD';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rrhh_empresas_moneda_pago_check') then
    alter table public.rrhh_empresas
      add constraint rrhh_empresas_moneda_pago_check check (moneda_pago in ('USD', 'BRL'));
  end if;
end $$;

alter table public.nomina_periodos
  add column if not exists tasa_brl numeric,
  add column if not exists tasa_brl_fecha date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nomina_periodos_tasa_brl_check') then
    alter table public.nomina_periodos
      add constraint nomina_periodos_tasa_brl_check check (tasa_brl is null or tasa_brl > 0);
  end if;
end $$;

comment on column public.rrhh_empresas.moneda_pago is 'Moneda de los recibos de la empresa: USD o BRL (Real brasileño: los recibos salen en $ y en R$).';
comment on column public.nomina_periodos.tasa_brl is 'R$ por 1 USD usado al cargar la nómina (solo empresas con moneda_pago = BRL).';
comment on column public.nomina_periodos.tasa_brl_fecha is 'Fecha de la tasa del Real usada en la nómina.';
