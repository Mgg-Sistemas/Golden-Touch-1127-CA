-- ═══════════════════════════════════════════════════════════════════
-- Golden Touch 1127 C.A. · 07/09/2026
-- Módulo de Ventas · las tres tablas, sus índices, el RLS y el realtime
--
-- QUÉ RESUELVE
-- Hoy la empresa vende y no queda rastro en el sistema: la plata entra por
-- Tesorería sin decir de qué venta viene, el material sale del almacén con un
-- movimiento suelto, y la ganancia se calcula a mano en un cuaderno. Este
-- módulo pone el documento de venta en el medio: uno solo que cuelga la plata,
-- el material y la deuda del mismo código.
--
-- POR QUÉ TRES TABLAS Y NO UN jsonb
-- Los renglones van en tabla real porque los tres reportes que se pidieron
-- —ganancia por producto, por categoría y por cliente— se contestan con un
-- `group by` sobre `ventas_renglones`. Metidos en un jsonb habría que traerse
-- todas las ventas al navegador y sumar ahí; con 463 productos vivos eso
-- envejece mal.
--
-- POR QUÉ `costo_unit` VIVE EN EL RENGLÓN
-- Es la columna que sostiene todo el módulo. El costo promedio de una ficha se
-- mueve cada vez que entra material nuevo a otro precio. Si la ganancia se
-- calculara leyendo `existencias.costo_promedio` en el momento del reporte, la
-- ganancia de una venta de marzo cambiaría sola en septiembre. Se copia al
-- confirmar y queda congelada.
--
-- POR QUÉ `cliente_nombre` Y `cliente_rif` ESTÁN DUPLICADOS
-- No es desnormalización por descuido: el comprobante que se imprima dentro de
-- seis meses tiene que seguir diciendo lo que decía el día de la venta, aunque
-- después le corrijan el nombre o el RIF a la contraparte.
--
-- LO QUE ESTE ARCHIVO NO HACE
-- No mueve plata ni stock. Eso vive en las RPC (`confirmar_venta`,
-- `entregar_venta`, `anular_venta`) que van en archivos aparte, porque cada una
-- es un puñado de escrituras que valen todas o ninguna y necesitan estar en una
-- sola transacción del lado del servidor.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- 1 · El documento
-- ═══════════════════════════════════════════════════════════════════
-- `valor_recibido` y `diferencia` existen para la permuta, pero se llenan
-- también en la venta normal (recibido 0, diferencia = total) para que las RPC
-- y los reportes no tengan que preguntar el tipo: lo que se cobra es siempre
-- `diferencia`, en los dos casos.
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo text not null default 'venta' check (tipo in ('venta','permuta')),
  estado text not null default 'borrador'
    check (estado in ('borrador','confirmada','entregada','anulada')),
  cliente_id uuid references public.tesoreria_contrapartes(id),
  cliente_nombre text, cliente_rif text,
  condicion text not null default 'contado' check (condicion in ('contado','credito')),
  moneda text not null default 'USD',
  tasa_bs numeric,
  subtotal numeric not null default 0,
  descuento numeric not null default 0,
  iva_pct numeric not null default 16,
  iva_monto numeric not null default 0,
  total numeric not null default 0,
  costo_total numeric not null default 0,
  ganancia_total numeric not null default 0,
  valor_recibido numeric not null default 0,
  diferencia numeric not null default 0,
  pago_legs jsonb not null default '[]'::jsonb,
  -- Apunta a una cuenta CORRIENTE del cliente, compartida con otras ventas:
  -- `crear_o_acumular_cxc` suma sobre la cuenta abierta en vez de abrir otra.
  -- Anular una venta le resta el monto, nunca cierra la cuenta entera.
  cxc_id uuid references public.cuentas_por_cobrar(id),
  nota text,
  actor text, actor_name text,
  confirmada_at timestamptz, confirmada_por text,
  entregada_at timestamptz, entregada_por text,
  anulada_at timestamptz, anulada_por text, motivo_anulacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);


-- ═══════════════════════════════════════════════════════════════════
-- 2 · Lo que sale
-- ═══════════════════════════════════════════════════════════════════
-- `on delete cascade` porque un borrador se borra de verdad —no hubo nada que
-- anular— y sus renglones no tienen vida propia. Desde `confirmada` en adelante
-- la venta ya no se borra, se anula.
-- `mov_id` queda nulo hasta la entrega: es el enganche con el kardex y sirve de
-- prueba de que ese renglón salió del almacén una sola vez.
create table if not exists public.ventas_renglones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  orden int not null default 0,
  producto_id uuid not null references public.productos(id),
  producto_sku text, producto_nombre text, unidad text,
  cantidad numeric not null check (cantidad > 0),
  precio_unit numeric not null default 0,
  costo_unit numeric not null default 0,
  descuento numeric not null default 0,
  subtotal numeric not null default 0,
  ganancia numeric not null default 0,
  mov_id uuid references public.movimientos(id)
);


-- ═══════════════════════════════════════════════════════════════════
-- 3 · Lo que entra (solo permuta)
-- ═══════════════════════════════════════════════════════════════════
-- El material que trae el cliente no es una compra: no hay factura ni pago, es
-- parte del trueque. Por eso tiene tabla propia y no reusa `compras_directas`.
-- `valor_unit` es el valor PACTADO en la mesa, y al entregar se usa como
-- `precio_unitario` de la entrada al kardex: así el costo promedio de esa ficha
-- se recalcula solo, sin que nadie lo escriba a mano.
create table if not exists public.ventas_recibidos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  orden int not null default 0,
  producto_id uuid not null references public.productos(id),
  producto_sku text, producto_nombre text, unidad text,
  cantidad numeric not null check (cantidad > 0),
  valor_unit numeric not null default 0,
  subtotal numeric not null default 0,
  mov_id uuid references public.movimientos(id)
);


-- ═══════════════════════════════════════════════════════════════════
-- 4 · Índices
-- ═══════════════════════════════════════════════════════════════════
-- El tablero abre agrupando por estado y ordenando por fecha descendente: ese
-- es el índice que se usa en cada carga de pantalla. Los de `producto_id` y
-- `cliente_id` son para los reportes de ganancia, que agrupan por ahí.
create index if not exists ventas_estado_fecha_idx on public.ventas (estado, created_at desc);
create index if not exists ventas_cliente_idx on public.ventas (cliente_id);
create index if not exists ventas_tipo_idx on public.ventas (tipo);
create index if not exists ventas_renglones_venta_idx on public.ventas_renglones (venta_id);
create index if not exists ventas_renglones_producto_idx on public.ventas_renglones (producto_id);
create index if not exists ventas_recibidos_venta_idx on public.ventas_recibidos (venta_id);


-- ═══════════════════════════════════════════════════════════════════
-- 5 · RLS · el mismo molde que Pedidos y Tesorería
-- ═══════════════════════════════════════════════════════════════════
-- Lectura para cualquier autenticado y escritura gateada por `puede('ventas')`,
-- que es la forma que ya usan las 75 tablas del sistema. Se gatea también en
-- renglones y recibidos, no solo en la cabecera: sin eso, alguien sin permiso
-- de ventas podría agregarle renglones a una venta ajena.
alter table public.ventas             enable row level security;
alter table public.ventas_renglones   enable row level security;
alter table public.ventas_recibidos   enable row level security;

drop policy if exists "ventas read auth"  on public.ventas;
drop policy if exists "ventas write op"   on public.ventas;
create policy "ventas read auth" on public.ventas
  for select using (auth.role() = 'authenticated');
create policy "ventas write op" on public.ventas
  for all using (is_admin() or puede('ventas'))
  with check (is_admin() or puede('ventas'));

drop policy if exists "ventas_renglones read auth" on public.ventas_renglones;
drop policy if exists "ventas_renglones write op"  on public.ventas_renglones;
create policy "ventas_renglones read auth" on public.ventas_renglones
  for select using (auth.role() = 'authenticated');
create policy "ventas_renglones write op" on public.ventas_renglones
  for all using (is_admin() or puede('ventas'))
  with check (is_admin() or puede('ventas'));

drop policy if exists "ventas_recibidos read auth" on public.ventas_recibidos;
drop policy if exists "ventas_recibidos write op"  on public.ventas_recibidos;
create policy "ventas_recibidos read auth" on public.ventas_recibidos
  for select using (auth.role() = 'authenticated');
create policy "ventas_recibidos write op" on public.ventas_recibidos
  for all using (is_admin() or puede('ventas'))
  with check (is_admin() or puede('ventas'));


-- ═══════════════════════════════════════════════════════════════════
-- 6 · Realtime
-- ═══════════════════════════════════════════════════════════════════
-- `alter publication … add table` revienta si la tabla ya está adentro, y este
-- archivo tiene que poder correrse dos veces sin romperse. Por eso se pregunta
-- antes en vez de atrapar el error después.
do $$
declare t text;
begin
  foreach t in array array['ventas','ventas_renglones','ventas_recibidos'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- 7 · El permiso del módulo
-- ═══════════════════════════════════════════════════════════════════
-- `ventas` arranca con exactamente el mismo alcance que `tesoreria` en cada rol:
-- quien hoy puede mover plata es quien puede vender, y quien solo mira Tesorería
-- solo mira Ventas. No se inventa un reparto nuevo — si después hay que ajustar
-- algún rol, se ajusta desde la pantalla de permisos, que es donde corresponde.
-- El `not (permisos ? 'ventas')` es para no pisar un reparto ya afinado si este
-- archivo se vuelve a correr.
update public.roles_permisos
   set permisos   = permisos || jsonb_build_object('ventas', permisos -> 'tesoreria'),
       updated_at = now()
 where permisos ? 'tesoreria'
   and not (permisos ? 'ventas');


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
-- Va última porque `runsql.cjs` devuelve solo el resultado de la última
-- sentencia. Esperado: tres filas, con 2 políticas y realtime = true cada una,
-- y `roles_con_ventas` = 11 (todos los roles del sistema).
select c.table_name,
       count(*)::int as columnas,
       (select count(*)::int from pg_indexes  i where i.schemaname='public' and i.tablename = c.table_name) as indices,
       (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename = c.table_name) as politicas,
       exists (select 1 from pg_publication_tables pt
                where pt.pubname='supabase_realtime' and pt.schemaname='public' and pt.tablename = c.table_name) as realtime,
       (select count(*)::int from public.roles_permisos rp where rp.permisos ? 'ventas') as roles_con_ventas
  from information_schema.columns c
 where c.table_schema='public'
   and c.table_name in ('ventas','ventas_renglones','ventas_recibidos')
 group by c.table_name
 order by c.table_name;
