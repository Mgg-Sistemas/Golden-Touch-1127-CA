-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- 1 · Los dos «juego de concha de biela» se unifican en GEN-243
-- 2 · Los dos «teipe» se unifican en MAT-008 TEIPE NEGRO COBRA
-- Ninguna de las cuatro fichas tiene stock: no se mueve material.
--
-- ═══ 1 · CONCHA DE BIELA ════════════════════════════════════════════
--   · GEN-209 «JUEGO CONCHA DE BIELA»     · 0 · $0 · 0 movimientos · sin órdenes
--   · GEN-243 «8 JUEGOS DE CONCHA DE BIELA» · 0 · $0 · 0 movimientos · OC-2026-0099
--
-- SOBREVIVE GEN-243, CON EL NOMBRE DE GEN-209
-- El nombre bueno lo tenía GEN-209, pero la orden viva la tiene GEN-243:
-- OC-2026-0099 (SP-2026-0143, del 31/08) está en `oc_aprobada`. Verificado
-- leyendo el estado real de la orden, no un conteo: la ficha en uso es la que
-- se queda y se le corrige el nombre.
--
-- POR QUÉ SALE EL «8» DEL NOMBRE
-- Es una CANTIDAD metida en el nombre del producto, y la cantidad va en la
-- orden. Con el «8» adentro, pedir ocho juegos serían «8 unidades de 8 juegos»
-- y el inventario contaría 8 cuando hay 64.
--
-- ⚠ QUEDA UN CABO SUELTO EN OC-2026-0099 — NO SE TOCA ACÁ
-- El renglón de esa orden guarda su propio snapshot:
--     nombre "8 JUEGOS DE CONCHA DE BIELA" · cantidad 1 · precio 240
-- Renombrar la ficha NO cambia ese renglón, y está bien: el documento
-- histórico debe quedar como se aprobó. Pero al RECIBIR esa orden va a entrar
-- 1 unidad al inventario cuando lo que llega físicamente son 8 juegos.
-- Lo correcto sería que el renglón diga cantidad 8 a $30 (mismo total $240).
-- Eso es EDITAR UNA ORDEN APROBADA y no se hace por migración: se corrige
-- desde Pedidos, o el almacenista recibe sabiendo que ese 1 son 8.
--
-- ═══ 2 · TEIPE ══════════════════════════════════════════════════════
--   · MAT-008 «TEIPE NEGRO COBRA» · 0 · $4,00 · 2 movimientos
--   · MAT-017 «TEIPE»             · 0 · $2,00 · 2 movimientos
-- El informe recomendaba NO unificarlas: dos precios distintos y las dos
-- usadas se parecen más a dos cintas que a un duplicado. El administrador
-- confirmó que es la misma cinta, así que se unifican y sobrevive MAT-008,
-- que es el nombre completo (marca incluida).
-- Ninguna tiene stock, así que no hay traslado ni promedio que recalcular.
-- MAT-008 conserva su costo de $4,00.
--
-- ORDEN OBLIGATORIO EN LOS DOS CASOS
-- El índice `productos_nombre_sin_acentos_activos` prohíbe dos productos
-- ACTIVOS con el mismo nombre. Por eso la ficha que sale se desactiva ANTES
-- de renombrar la que queda.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  v_209 uuid; v_243 uuid; v_008 uuid; v_017 uuid;
  v_s numeric;
begin
  select id into v_209 from public.productos where sku = 'GEN-209';
  select id into v_243 from public.productos where sku = 'GEN-243';
  select id into v_008 from public.productos where sku = 'MAT-008';
  select id into v_017 from public.productos where sku = 'MAT-017';
  if v_209 is null or v_243 is null or v_008 is null or v_017 is null then
    raise exception 'ABORTADO: falta alguna de las cuatro fichas.';
  end if;

  -- Guarda común: las cuatro tienen que estar en 0. Con material de por medio
  -- esto dejaría de ser un desactivar y necesitaría traslado por kardex.
  select coalesce(sum(e.stock),0) into v_s from public.existencias e
   where e.producto_id in (v_209, v_243, v_008, v_017);
  if round(v_s,4) <> 0 then
    raise exception 'ABORTADO: entre las cuatro fichas hay % de stock. Aparecio material y hace falta un traslado con analisis propio.', v_s;
  end if;

  -- ── 1 · Concha de biela ──────────────────────────────────────────
  update public.productos
     set nombre = 'JUEGO CONCHA DE BIELA (unificado en GEN-243)',
         estado = 'inactivo', updated_at = now()
   where id = v_209;

  update public.productos
     set nombre = 'JUEGO CONCHA DE BIELA', updated_at = now()
   where id = v_243;

  -- ── 2 · Teipe ────────────────────────────────────────────────────
  update public.productos
     set nombre = 'TEIPE (unificado en MAT-008)',
         estado = 'inactivo', updated_at = now()
   where id = v_017;

  raise notice 'OK: GEN-243 queda como JUEGO CONCHA DE BIELA; MAT-008 TEIPE NEGRO COBRA queda solo.';
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.sku, p.nombre, p.categoria, p.estado, p.precio,
       (select coalesce(sum(e.stock),0) from public.existencias e where e.producto_id = p.id) as stock,
       (select count(*) from public.movimientos m where m.producto_id = p.id)                 as movimientos
  from public.productos p
 where p.sku in ('GEN-209','GEN-243','MAT-008','MAT-017')
 order by p.estado, p.sku;
