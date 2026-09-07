-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Auditoría de las tablas de Ventas
--
-- POR QUÉ
-- En este sistema hay un convenio que no estaba escrito en ningún lado: las
-- tablas que mueven plata o material llevan un trigger `trg_aud_<tabla>` que
-- dispara `fn_auditar()` y deja el rastro en `auditoria_eventos`. Lo llevan
-- `ordenes`, `compras_directas`, `servicios_directos`, `cuentas_por_cobrar`,
-- `cuentas_por_pagar`, `movimientos_caja`, `cajas`, `productos`, `usuarios` y
-- `roles_permisos`, entre otras. Ventas mueve las dos cosas —dinero y stock—
-- así que le corresponde.
--
-- POR QUÉ TAMBIÉN LAS TABLAS HIJAS
-- El convenio general audita el documento y no sus renglones (los cargos y
-- abonos de cuentas por cobrar no están auditados). Pero hay una excepción que
-- marca el criterio real: `nomina_renglones` SÍ está auditada, porque el
-- renglón es donde vive la plata.
--
-- Acá pasa lo mismo, y peor: `ventas_renglones` guarda el precio, el costo
-- congelado y la ganancia de cada línea. Son exactamente los números que
-- alguien podría cambiar sin que se note, y de los que después salen los
-- reportes de margen. `ventas_recibidos` guarda el valor con el que entra
-- material al inventario, que decide el costo promedio de esa ficha.
-- Un cambio silencioso en cualquiera de las dos deforma el inventario o el
-- margen sin dejar rastro. Por eso van las tres.
-- ═══════════════════════════════════════════════════════════════════

drop trigger if exists trg_aud_ventas on public.ventas;
create trigger trg_aud_ventas
  after insert or delete or update on public.ventas
  for each row execute function fn_auditar();

drop trigger if exists trg_aud_ventas_renglones on public.ventas_renglones;
create trigger trg_aud_ventas_renglones
  after insert or delete or update on public.ventas_renglones
  for each row execute function fn_auditar();

drop trigger if exists trg_aud_ventas_recibidos on public.ventas_recibidos;
create trigger trg_aud_ventas_recibidos
  after insert or delete or update on public.ventas_recibidos
  for each row execute function fn_auditar();


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select c.relname as tabla, t.tgname as trigger, t.tgenabled as habilitado
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
   and c.relname in ('ventas','ventas_renglones','ventas_recibidos')
 order by c.relname;
