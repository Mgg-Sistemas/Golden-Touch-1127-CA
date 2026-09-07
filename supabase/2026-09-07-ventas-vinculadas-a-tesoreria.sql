-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Ventas queda amarrado a Tesorería, en los dos sentidos
--
-- LO QUE FALTABA
-- Ventas ya escribía en las tablas de Tesorería: el cobro de contado entra por
-- `movimientos_caja` con `aplicar_saldo_caja`, y el crédito cae en
-- `cuentas_por_cobrar`. Pero escribir no es lo mismo que estar vinculado: el
-- movimiento de caja quedaba con un texto en `motivo` y nada más. Desde
-- Tesorería se veía entrar plata sin poder abrir la venta que la generó, y
-- desde la venta no había cómo saber a qué movimiento fue a parar.
--
-- UN HALLAZGO QUE CONVIENE DEJAR ESCRITO
-- Las 57 entradas de dinero que tiene el sistema hoy NO tienen categoría.
-- Todas las salidas sí: gasto, pago_oc, compra_directa, servicio_directo,
-- comision_bancaria, conversion. O sea que Tesorería sabe con detalle a dónde
-- se fue la plata, y no sabe de dónde vino. El cobro de una venta va a ser el
-- primer ingreso clasificado del sistema (`categoria = 'cobro_venta'`), y eso
-- abre la puerta a que los demás ingresos se clasifiquen después.
--
-- CÓMO SE AMARRA
-- Copiando la forma que ya existe para las órdenes de compra:
-- `movimientos_caja.ref_orden_id` apunta a `ordenes`, y la pantalla de
-- Tesorería (TesoreriaPage) usa esa columna para mostrar la orden dentro del
-- detalle del movimiento. Se agrega `ref_venta_id` con el mismo papel.
--
-- Y `cuentas_por_cobrar` también: hoy una cuenta no sabe de dónde salió. Se le
-- agrega `ref_venta_id` para la venta que la originó. Ojo: la cuenta es
-- CORRIENTE por cliente y acumula varias ventas, así que esa columna guarda la
-- venta que la abrió, no todas. El detalle venta por venta vive en los cargos.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1 · El movimiento de caja sabe de qué venta viene ────────────
alter table public.movimientos_caja
  add column if not exists ref_venta_id uuid references public.ventas(id);

create index if not exists movimientos_caja_ref_venta_idx
  on public.movimientos_caja (ref_venta_id) where ref_venta_id is not null;

-- ── 2 · El cargo de la cuenta por cobrar, también ─────────────────
-- Acá es donde de verdad se ve venta por venta: la cuenta acumula, el cargo no.
alter table public.cuentas_por_cobrar_cargos
  add column if not exists ref_venta_id uuid references public.ventas(id);

create index if not exists cxc_cargos_ref_venta_idx
  on public.cuentas_por_cobrar_cargos (ref_venta_id) where ref_venta_id is not null;

-- ── 3 · La cuenta guarda la venta que la abrió ───────────────────
alter table public.cuentas_por_cobrar
  add column if not exists ref_venta_id uuid references public.ventas(id);

-- ── 4 · Y la venta sabe a qué movimientos fue ────────────────────
-- No hace falta columna: se consultan por `ref_venta_id`. Esta vista lo deja
-- servido para la pantalla y los reportes, sin repetir el join en cada lado.
create or replace view public.ventas_movimientos_caja as
  select m.ref_venta_id as venta_id,
         m.id as movimiento_id, m.at, m.tipo, m.categoria,
         m.monto, m.moneda, m.cuenta, m.caja_id,
         c.nombre as caja_nombre,
         m.motivo, m.actor_name, m.cierre_id
    from public.movimientos_caja m
    left join public.cajas c on c.id = m.caja_id
   where m.ref_venta_id is not null;

grant select on public.ventas_movimientos_caja to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select 'movimientos_caja' as tabla, count(*) as tiene_ref_venta_id
  from information_schema.columns
 where table_schema='public' and table_name='movimientos_caja' and column_name='ref_venta_id'
union all
select 'cuentas_por_cobrar_cargos', count(*)
  from information_schema.columns
 where table_schema='public' and table_name='cuentas_por_cobrar_cargos' and column_name='ref_venta_id'
union all
select 'cuentas_por_cobrar', count(*)
  from information_schema.columns
 where table_schema='public' and table_name='cuentas_por_cobrar' and column_name='ref_venta_id'
union all
select 'vista ventas_movimientos_caja', count(*)
  from information_schema.views
 where table_schema='public' and table_name='ventas_movimientos_caja'
order by 1;
