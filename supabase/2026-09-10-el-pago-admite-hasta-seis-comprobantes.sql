-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 10/09/2026
-- Un pago puede llevar hasta SEIS comprobantes
--
-- POR QUÉ
-- Al pagar desde Tesorería solo entraba UN archivo. Un pago repartido
-- entre varias cuentas o varias transferencias tiene una captura por
-- cada una, y quedaba afuera todo menos la primera.
--
-- CÓMO QUEDA
-- `comprobantes_pago` guarda la lista completa, en orden:
--     [{"path": "...", "nombre": "captura-1.jpg"}, …]
-- `factura_path` / `factura_nombre` siguen apuntando al PRIMERO. No se
-- tocan: los usan el detalle del movimiento, el PDF de la OC y el
-- histórico, y romperlos sería reescribir medio sistema por un extra.
--
-- El tope de seis se valida arriba (pantalla) y acá abajo, para que no
-- entre por otra puerta.
-- ═══════════════════════════════════════════════════════════════════

alter table public.ordenes
  add column if not exists comprobantes_pago jsonb not null default '[]'::jsonb;

comment on column public.ordenes.comprobantes_pago is
  'Comprobantes del pago, hasta 6, en orden: [{path, nombre}]. El primero se refleja en factura_path/factura_nombre.';

alter table public.ordenes drop constraint if exists comprobantes_pago_hasta_seis;
alter table public.ordenes add constraint comprobantes_pago_hasta_seis
  check (
    jsonb_typeof(coalesce(comprobantes_pago, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(comprobantes_pago, '[]'::jsonb)) <= 6
  ) not valid;

-- Las órdenes ya pagadas con un solo archivo heredan su comprobante en la lista,
-- así el detalle no tiene que mirar en dos lugares distintos.
update public.ordenes
   set comprobantes_pago = jsonb_build_array(
         jsonb_build_object('path', factura_path, 'nombre', coalesce(factura_nombre, 'comprobante'))
       )
 where factura_path is not null
   and coalesce(jsonb_array_length(comprobantes_pago), 0) = 0;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='ordenes' and column_name='comprobantes_pago') as columna,
  (select count(*) from public.ordenes where jsonb_array_length(comprobantes_pago) > 0)       as ordenes_con_lista,
  (select count(*) from public.ordenes where factura_path is not null)                        as ordenes_con_factura_path,
  (select max(jsonb_array_length(comprobantes_pago)) from public.ordenes)                     as maximo_actual;
