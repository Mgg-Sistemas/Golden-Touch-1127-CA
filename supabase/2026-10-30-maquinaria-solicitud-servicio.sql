-- 30/10/2026 · Control de Maquinaria pide sus repuestos como SOLICITUD DE SERVICIO.
--
-- Flujo pedido por el usuario:
--   Maquinaria hace una SOLICITUD DE SERVICIO (SS-AAAA-####) con NOMBRES GENERALES de
--   las piezas → el analista de compras la acepta en Pedidos → 🔧 Servicios y, al cargar
--   la cotización, le pone a cada renglón el producto del inventario (o da de alta uno
--   nuevo con el nombre que corresponde).
--
-- Cambios respecto a la versión anterior (que armaba una SP-…):
--   · tipo = 'servicio' y código SS-AAAA-#### con el MISMO correlativo de la app
--     (next_correlativo('ss-' || año), igual que nextCodigoServicio() en pedidos.repository.ts);
--   · YA NO da de alta productos: la pieza que no está en el inventario viaja con su nombre
--     general, sin producto (el analista lo pone al cotizar). `p_nuevas` se ignora (se deja en
--     la firma para no romper a quien todavía lo manda);
--   · cada renglón lleva `pieza_maquinaria: true` (la cotización exige ponerle producto),
--     `categoria_servicio: 'REPUESTOS'` y un sku provisional SRV-… cuando no hay producto
--     (la app identifica los renglones por sku: dos piezas sin producto no pueden compartirlo);
--   · el aviso al analista lleva a la pestaña Servicios (#/app/pedidos?tab=servicios).
-- Igual que antes: permiso de Maquinaria, vínculo orden_compra_id, equipo/finalidad/urgente,
-- y el trigger compras_sincroniza_ordenes_servicio (no mira el tipo) sigue moviendo la orden
-- de servicio al recibir / cancelar / rechazar.
--
-- Stock: una orden tipo 'servicio' NO mueve inventario al recibirse (ordenAfectaInventario):
-- los repuestos se montan en el equipo y quedan en su historial, no en el kardex.

create or replace function public.maquinaria_pedir_compra_orden(p_id uuid, p_nuevas jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o record;
  r jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_equipo text;
  v_email text := coalesce(auth.jwt() ->> 'email', 'sistema');
  v_nombre text;
  v_sku text; v_uni text; v_pnom text;
  v_pid uuid; v_ss uuid;
  v_year int := extract(year from (now() at time zone 'America/Caracas'))::int;
  v_codigo text; v_fin text; v_notas text;
  v_sin_producto int := 0;
begin
  if not (public.is_admin() or public.puede('maquinaria')) then
    raise exception 'No tienes permiso.' using errcode = '42501';
  end if;
  select * into o from public.maquinaria_ordenes_servicio where id = p_id for update;
  if not found then raise exception 'La orden no existe.' using errcode = 'P0002'; end if;
  if o.orden_compra_id is not null then
    raise exception 'La orden % ya tiene su solicitud de servicio.', o.codigo using errcode = '22023';
  end if;
  if o.estado not in ('abierta', 'repuestos') then
    raise exception 'Solo se pide la compra de una orden abierta o esperando repuestos.' using errcode = '22023';
  end if;

  select equipo into v_equipo from public.maquinaria_equipos where id = o.equipo_id;
  select coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), v_email)
    into v_nombre from public.usuarios u where u.id = auth.uid();
  v_nombre := coalesce(v_nombre, v_email);
  v_fin := coalesce(public.maquinaria_finalidad_os(o.id), 'Repuesto para ' || coalesce(v_equipo, 'equipo'));

  for r in select x from jsonb_array_elements(o.repuestos) x loop
    if coalesce((r ->> 'a_comprar')::numeric, 0) <= 0 then continue; end if;

    v_pid := nullif(r ->> 'producto_id', '')::uuid;
    v_sku := null; v_uni := null; v_pnom := null;
    if v_pid is not null then
      select p.sku, p.unidad, p.nombre into v_sku, v_uni, v_pnom from public.productos p where p.id = v_pid;
    end if;
    if v_sku is null then
      -- Nombre general, sin producto: sku provisional único (la app distingue renglones por sku).
      v_pid := null;
      v_sku := 'SRV-' || upper(substr(md5(random()::text || clock_timestamp()::text || coalesce(r ->> 'nombre', '')), 1, 8));
      v_sin_producto := v_sin_producto + 1;
    end if;

    v_item := jsonb_build_object(
      'sku', v_sku,
      'nombre', coalesce(nullif(btrim(r ->> 'nombre'), ''), v_pnom, 'PIEZA'),
      'cantidad', (r ->> 'a_comprar')::numeric,
      'precio', 0,
      'unidad', coalesce(nullif(r ->> 'unidad', ''), v_uni, 'und'),
      'comprar', true,
      'finalidad', v_fin,
      'categoria_servicio', 'REPUESTOS',
      'pieza_maquinaria', true,
      'orden_servicio', o.codigo,
      'equipo_id', o.equipo_id,
      'equipo_nombre', v_equipo);
    if v_pid is not null then
      v_item := v_item || jsonb_build_object(
        'productoId', v_pid,
        'insumo_producto_id', v_pid,
        'insumo_nombre', coalesce(v_pnom, r ->> 'nombre'));
    end if;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Esta orden no tiene repuestos por comprar.' using errcode = '22023';
  end if;

  v_codigo := 'SS-' || v_year || '-' || lpad(public.next_correlativo('ss-' || v_year)::text, 4, '0');
  v_notas := 'Orden de servicio ' || o.codigo || ' · ' || coalesce(v_equipo, 'equipo') || '.';
  if v_sin_producto > 0 then
    v_notas := v_notas || ' ' || v_sin_producto || ' pieza(s) con nombre general: al cotizar, elige el producto del inventario o crea uno nuevo.';
  end if;

  insert into public.ordenes (codigo, tipo, proveedor_id, solicitante_email, solicitante, unidad_solicitante,
                              items, total, estado, notas, finalidad, clasificacion, urgente, detalle_servicio, historial)
  values (v_codigo, 'servicio', null, v_email, upper(v_nombre), 'MAQUINARIA',
          v_items, 0, 'pendiente', v_notas, v_fin, array['Servicios'], o.urgencia = 'urgente', '[]'::jsonb,
          jsonb_build_array(jsonb_build_object('at', now(), 'evento', 'creada', 'actor', v_email)))
  returning id into v_ss;

  update public.maquinaria_ordenes_servicio
     set orden_compra_id = v_ss
   where id = p_id;

  -- El aviso de «piezas nuevas» queda cubierto por la solicitud: el analista les pone producto al cotizar.
  update public.notificaciones set read = true
   where dedup_key = 'maq-os-piezas-' || o.id and read = false;

  insert into public.notificaciones (destino, kind, title, message, link, dedup_key)
  values ('analista_de_compras', 'info',
    '🔧 Solicitud de Servicio ' || v_codigo || ' · ' || o.codigo,
    coalesce(v_equipo, 'Equipo') || ': repuestos de la orden de servicio ' || o.codigo
      || case when v_sin_producto > 0
              then ' (' || v_sin_producto || ' con nombre general: ponles el producto del inventario al cotizar)' else '' end
      || '. Revísala en Pedidos → Servicios.',
    '#/app/pedidos?tab=servicios',
    'maq-os-sp-' || o.id);

  return jsonb_build_object('codigo', v_codigo, 'id', v_ss, 'creados', '[]'::jsonb);
end $function$;
