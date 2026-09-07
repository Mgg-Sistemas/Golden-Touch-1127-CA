-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Los dos «lentes de seguridad» se unifican en GEN-227, que pasa a EQUIPOS
--
-- QUÉ PASABA
-- Convivían dos fichas del mismo EPP:
--   · GEN-227 «LENTE DE SEGURIDAD»  · GENERAL · 0 · $0     · 0 movimientos
--   · EQU-001 «LENTES DE SEGURIDA»  · EQUIPOS · 0 · $2,50  · 2 movimientos
-- Ninguna tiene stock, así que unificar NO mueve material: es desactivar la
-- de más y dejar la que se sigue usando.
--
-- SOBREVIVE GEN-227 — y por qué, con una corrección
-- El informe del 7/9 decía que GEN-227 tenía «dos OC abiertas». No es exacto:
-- las tres órdenes que la nombran están en `reasignada` (2) y `cancelada` (1),
-- o sea que ninguna está en curso. El conteo del informe tomaba por abierta
-- toda orden que no estuviera finalizada ni cancelada, y `reasignada` se coló.
-- La decisión igual se sostiene, por otro motivo: GEN-227 es la que nombran
-- los renglones de la SP-2026-0013 y sus hijas, y su nombre está bien escrito.
-- EQU-001 tiene el nombre cortado en «SEGURIDA» y no se mueve desde el 29/06.
--
-- LA CATEGORÍA
-- GEN-227 estaba en GENERAL, que es el cajón donde caen las fichas creadas al
-- vuelo desde una solicitud. Un lente de seguridad se busca en EQUIPOS, que es
-- justo donde vivía EQU-001. No existe una categoría EPP y no se crea una para
-- un solo producto: se usa la que ya está en uso.
--
-- EL SKU NO SE TOCA
-- Queda GEN-227 aunque ahora esté en EQUIPOS y el prefijo no case. Las órdenes
-- guardan el SKU DENTRO de sus renglones (`items[].sku`), y la recepción casa
-- los renglones por ese texto: cambiarlo dejaría huérfanos los tres renglones
-- históricos de la SP-2026-0013. Un prefijo que no case es cosmético; romper
-- la trazabilidad de una orden no lo es.
--
-- EL HISTORIAL DE EQU-001 NO SE PIERDE
-- Se desactiva, no se borra: sus 2 movimientos siguen consultables en su ficha,
-- y el nombre queda marcado para que se entienda por qué está ahí.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_vive   uuid;   -- GEN-227, el que sobrevive
  v_muere  uuid;   -- EQU-001, el que se desactiva
  v_stock_vive  numeric;
  v_stock_muere numeric;
begin
  select id into v_vive  from public.productos where sku = 'GEN-227';
  select id into v_muere from public.productos where sku = 'EQU-001';
  if v_vive is null or v_muere is null then
    raise exception 'ABORTADO: no se encontraron las dos fichas.';
  end if;

  select coalesce(sum(stock),0) into v_stock_vive  from public.existencias where producto_id = v_vive;
  select coalesce(sum(stock),0) into v_stock_muere from public.existencias where producto_id = v_muere;

  -- Guarda: el análisis dice que NINGUNA tiene stock. Si alguna lo tiene,
  -- aparecieron unidades entre medio y esto ya no es un simple desactivar:
  -- hay que trasladar material y eso va con su propio análisis.
  if round(v_stock_vive,4) <> 0 or round(v_stock_muere,4) <> 0 then
    raise exception 'ABORTADO: se esperaban las dos en 0 y hay GEN-227=% y EQU-001=%. Con material de por medio hace falta un traslado por kardex.',
      v_stock_vive, v_stock_muere;
  end if;

  -- ── 1 · La que se va, con el motivo escrito en el nombre ──────────
  update public.productos
     set nombre = 'LENTES DE SEGURIDA (unificado en GEN-227)',
         estado = 'inactivo',
         updated_at = now()
   where id = v_muere;

  -- ── 2 · La que queda, en la categoría donde se la busca ───────────
  update public.productos
     set categoria = 'EQUIPOS', updated_at = now()
   where id = v_vive;

  raise notice 'OK: GEN-227 LENTE DE SEGURIDAD queda en EQUIPOS; EQU-001 desactivada.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.categoria, p.unidad, p.estado, p.precio,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select count(*) from public.movimientos m where m.producto_id = p.id)                 as movimientos
  from public.productos p
 where p.sku in ('GEN-227','EQU-001')
 order by p.estado, p.sku;
