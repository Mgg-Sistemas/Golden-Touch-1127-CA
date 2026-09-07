-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Reelegir en una OC hija devuelve los ítems a la orden PADRE
--
-- LO QUE PASABA
-- Cuando una OP se reparte entre varios proveedores, cada proveedor recibe
-- una OC HIJA (`op_padre_id` apunta a la madre). Si sobre una hija había que
-- cambiar de proveedor, el botón «🔄 Reelegir oferta» ni siquiera aparecía
-- —la pantalla lo escondía con `!o.op_padre_id`— y el backend lo rechazaba
-- con «reelegí desde la orden padre». Ese consejo no llevaba a ningún lado:
-- al repartirse, la madre queda en `reasignada`, y reelegir exige `oc_creada`.
-- Resultado: la única salida era «⚠ Proveedor desistió», que además le anota
-- al proveedor un incumplimiento que quizá no ocurrió — a veces uno
-- simplemente quiere volver a elegir.
--
-- LO QUE FIJÓ EL ADMINISTRADOR
-- «Si se hace por multiproveedor, al reelegir, que vuelva a la orden PADRE,
-- con todas sus ofertas.»
--
-- QUÉ HACE ESTA FUNCIÓN
-- Devuelve una OC hija a su madre, en una sola transacción:
--   1. Los ítems de la hija vuelven a la madre.
--   2. La madre queda en `aprobada` (cargar/elegir ofertas), con total en 0.
--   3. TODAS las ofertas de la madre vuelven a `pendiente` — las aceptadas y
--      las descartadas—, que es lo que se pidió: volver a verlas todas.
--   4. La hija queda `reasignada` y sale del tablero.
-- Sirve para los dos caminos: reelegir (sin culpa) y desistimiento del
-- proveedor (con motivo). El evento que se anota en el historial lo decide
-- quien llama.
--
-- ⚠ EL ARREGLO QUE VA DE PASO: LOS ÍTEMS DE LAS HERMANAS VIVAS
-- El camino viejo (desistimiento) fusionaba los ítems de la hija sobre los que
-- la madre ya tenía. Eso está bien en un reparto PARCIAL, donde la madre se
-- quedó solo con los sobrantes. Pero en un reparto TOTAL la madre conserva la
-- lista COMPLETA de ítems, así que al volver una hija la madre se reabría con
-- TODO —incluidos los productos que las otras hijas están comprando en ese
-- mismo momento—, y se podían cotizar y comprar dos veces.
-- Acá la lista de la madre se RECALCULA: se queda con los ítems que ninguna
-- hija viva está comprando, más los que devuelve la hija que vuelve. Una hija
-- «viva» es la que no está en reasignada / cancelada / rechazada /
-- desistida_proveedor: si ya está pagada, recibida o finalizada, esos ítems ya
-- se compraron y no tienen por qué volver a la madre.
--
-- POR QUÉ EN LA BASE Y NO EN EL CLIENTE
-- Son cuatro escrituras que tienen que valer todas o ninguna (madre, hija,
-- ofertas, historial). Hechas desde el navegador, una caída de red en el medio
-- deja la hija cerrada y los ítems en ningún lado. Acá van en una sola
-- transacción. `security invoker`: manda el RLS del usuario, igual que si la
-- pantalla escribiera directo.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.devolver_hija_a_padre(
  p_hija_id  uuid,
  p_actor    text,
  p_evento   text default 'eleccion_reabierta',
  p_motivo   text default null
) returns public.ordenes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hija    public.ordenes;
  v_padre   public.ordenes;
  v_items   jsonb;
  v_reclam  text[];
  v_ahora   timestamptz := now();
  v_ev_hija jsonb;
  v_ev_padre jsonb;
begin
  select * into v_hija from public.ordenes where id = p_hija_id;
  if not found then
    raise exception 'No existe la orden %.', p_hija_id;
  end if;
  if v_hija.op_padre_id is null then
    raise exception 'La orden % no viene de un reparto entre proveedores: no tiene orden padre.', coalesce(v_hija.oc_codigo, v_hija.codigo);
  end if;
  if v_hija.estado in ('reasignada','cancelada','rechazada','finalizada') then
    raise exception 'La orden % esta en % y ya no vuelve a la padre.', coalesce(v_hija.oc_codigo, v_hija.codigo), v_hija.estado;
  end if;

  select * into v_padre from public.ordenes where id = v_hija.op_padre_id;
  if not found then
    raise exception 'No se encontro la orden padre de %.', coalesce(v_hija.oc_codigo, v_hija.codigo);
  end if;
  if v_padre.estado in ('cancelada','rechazada') then
    raise exception 'La orden padre % esta en %: no se le pueden devolver items.', v_padre.codigo, v_padre.estado;
  end if;

  -- ── Que ya esta comprando otra hija viva ─────────────────────────
  -- Su clave es la misma que usa la pantalla: productoId, si no sku, si no nombre.
  select coalesce(array_agg(distinct coalesce(it->>'productoId', it->>'sku', it->>'nombre')), '{}')
    into v_reclam
    from public.ordenes h, jsonb_array_elements(coalesce(h.items,'[]'::jsonb)) it
   where h.op_padre_id = v_padre.id
     and h.id <> v_hija.id
     and h.estado not in ('reasignada','cancelada','rechazada','desistida_proveedor');

  -- ── La lista de la madre: lo que nadie esta comprando + lo que vuelve ──
  select coalesce(jsonb_agg(x.it order by x.ord), '[]'::jsonb) into v_items
    from (
      select it, ord from jsonb_array_elements(coalesce(v_padre.items,'[]'::jsonb)) with ordinality t(it, ord)
       where not (coalesce(it->>'productoId', it->>'sku', it->>'nombre') = any(v_reclam))
      union all
      select it, 1000000 + ord from jsonb_array_elements(coalesce(v_hija.items,'[]'::jsonb)) with ordinality t(it, ord)
       where not (coalesce(it->>'productoId', it->>'sku', it->>'nombre') = any(v_reclam))
         and not exists (
           select 1 from jsonb_array_elements(coalesce(v_padre.items,'[]'::jsonb)) p
            where coalesce(p->>'productoId', p->>'sku', p->>'nombre')
                = coalesce(it->>'productoId', it->>'sku', it->>'nombre')
              and not (coalesce(p->>'productoId', p->>'sku', p->>'nombre') = any(v_reclam))
         )
    ) x;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'La devolucion dejaria la orden padre % sin ningun renglon.', v_padre.codigo;
  end if;

  -- ── 1 · La hija se cierra: volvio a la madre ─────────────────────
  v_ev_hija := jsonb_build_object(
    'at', v_ahora, 'evento', p_evento, 'actor', p_actor,
    'volvio_a_padre', v_padre.codigo,
    'proveedorAnteriorId', v_hija.proveedor_id
  ) || case when p_motivo is null then '{}'::jsonb else jsonb_build_object('motivo', p_motivo) end;

  update public.ordenes
     set estado = 'reasignada',
         historial = coalesce(historial,'[]'::jsonb) || v_ev_hija,
         updated_at = v_ahora
   where id = v_hija.id;

  -- ── 2 · TODAS las ofertas de la madre vuelven a estar disponibles ─
  update public.ofertas_proveedor
     set estado = 'pendiente', motivo_descarte = null,
         decidida_por_email = null, decidida_en = null
   where orden_id = v_padre.id
     and estado in ('aceptada','descartada');

  -- ── 3 · La madre se reabre en la etapa de eleccion ───────────────
  v_ev_padre := jsonb_build_object(
    'at', v_ahora, 'evento', p_evento, 'actor', p_actor,
    'hija_revertida', coalesce(v_hija.oc_codigo, v_hija.codigo),
    'items_devueltos', jsonb_array_length(coalesce(v_hija.items,'[]'::jsonb))
  ) || case when p_motivo is null then '{}'::jsonb else jsonb_build_object('motivo', p_motivo) end;

  update public.ordenes
     set estado = 'aprobada',
         items = v_items,
         total = 0,
         total_divisa = null,
         pago_en_divisa = false,
         historial = coalesce(historial,'[]'::jsonb) || v_ev_padre,
         updated_at = v_ahora
   where id = v_padre.id
   returning * into v_padre;

  return v_padre;
end $$;

comment on function public.devolver_hija_a_padre(uuid, text, text, text) is
  'Devuelve una OC hija de un reparto multiproveedor a su orden padre: los items vuelven, la madre se reabre en «aprobada» con TODAS sus ofertas en pendiente y la hija queda «reasignada». Los items que otra hija viva ya esta comprando NO vuelven.';

grant execute on function public.devolver_hija_a_padre(uuid, text, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'devolver_hija_a_padre';
