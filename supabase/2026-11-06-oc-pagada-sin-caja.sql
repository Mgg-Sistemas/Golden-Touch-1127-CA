-- 06/11/2026 · Tesorería: marcar una OC como PAGADA SIN DESCONTAR SALDO DE CAJAS.
-- Pedido de la administradora: hay OC que se pagan por fuera (otra empresa, un socio,
-- un cruce de cuentas…) y no deben sacar dinero de ninguna caja. Se marcan pagadas con
-- un MOTIVO obligatorio y siguen el flujo de siempre: al quedar en 'pagada' pasan al
-- delivery (trigger ordenes_a_delivery) y luego entran al almacén al recibirse.
-- No hay movimiento en el Libro Mayor (caja_id / caja_mov_id quedan vacíos).

alter table public.ordenes add column if not exists pagada_sin_caja boolean not null default false;
alter table public.ordenes add column if not exists pagada_sin_caja_motivo text;

comment on column public.ordenes.pagada_sin_caja is
  'OC marcada pagada desde Tesorería SIN descontar saldo de cajas (sin egreso en el Libro Mayor).';
comment on column public.ordenes.pagada_sin_caja_motivo is
  'Por qué no se descontó dinero de la caja (obligatorio cuando pagada_sin_caja).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_pagada_sin_caja_motivo_chk') then
    alter table public.ordenes add constraint ordenes_pagada_sin_caja_motivo_chk
      check (not pagada_sin_caja or length(btrim(coalesce(pagada_sin_caja_motivo, ''))) >= 5);
  end if;
end $$;
