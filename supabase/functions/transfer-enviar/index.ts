// GT · Edge Function: transfer-enviar (proxy SALIENTE del puente inter-sistema)
// La invoca el cliente (con su JWT) para empujar al OTRO sistema:
//   - tipo 'transferencia': una transferencia → POST a {INTER_DESTINO_URL}/transfer-recibir
//   - tipo 'ack':           confirmación de recepción → POST al callback de la fila ENTRANTE
// Autentica contra el otro sistema con el secreto compartido INTER_SECRET
// (NO se expone la service-role de ninguna base).
//
// Secrets: INTER_SECRET · INTER_DESTINO_URL (base .../functions/v1 del otro sistema)
//          INTER_CALLBACK_ALLOWLIST (opcional: orígenes extra permitidos para el ACK,
//          separados por coma; p. ej. "https://abc.supabase.co")
//          INTER_EMPRESA_CODIGO (opcional, CxC: empresa_origen; por defecto 'golden-touch')
//          INTER_CXC_CLIENTE_NOMBRE (opcional, CxC: nombre del cliente en el otro sistema)
//          INTER_PUENTE_CXC (opcional: 'off' apaga el espejo de CxC desde el servidor)
// SUPABASE_URL lo provee la plataforma.
//
// ─────────────────────────────────────────────────────────────────────────────
// SEGURIDAD
// 02/09/2026 (GT-EXT-01): exige sesión y valida el destino del ACK contra una
//   lista blanca (antes se podía robar INTER_SECRET apuntando a otro servidor).
// 18/09/2026: el cuerpo del cliente YA NO se reenvía. Del pedido solo se leen
//   `tipo`, `recurso` y `transf_id`; todo lo demás (kg, litros, montos, costos,
//   legs, callback del ACK) lo RECONSTRUYE el servidor desde la fila local.
//   Además se exige el permiso de escritura del módulo que dispara cada recurso:
//     dinero       → tesoreria           (ACK de dinero: tesoreria o acopio)
//     combustible  → combustible
//     casiterita   → inventario o salidas
//     cuenta_por_cobrar → acopio
//   Así nadie puede hacer que el otro sistema acredite kg, litros, montos o CxC
//   inventados, ni mandar un ACK de una transferencia que no se recibió.
// ─────────────────────────────────────────────────────────────────────────────

import { CORS, json, exigirSesion, puede, type Sesion } from '../_shared/auth.ts';

/** Orígenes a los que este sistema acepta mandar el secreto compartido. */
function origenesPermitidos(): string[] {
  const lista: string[] = [];
  const destino = Deno.env.get('INTER_DESTINO_URL');
  if (destino) {
    try { lista.push(new URL(destino).origin); } catch { /* mal configurado: se ignora */ }
  }
  for (const extra of (Deno.env.get('INTER_CALLBACK_ALLOWLIST') ?? '').split(',')) {
    const v = extra.trim();
    if (!v) continue;
    try { lista.push(new URL(v).origin); } catch { /* entrada inválida: se ignora */ }
  }
  return lista;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Recurso = 'dinero' | 'combustible' | 'casiterita' | 'cuenta_por_cobrar';
const RECURSOS: Recurso[] = ['dinero', 'combustible', 'casiterita', 'cuenta_por_cobrar'];

/** Módulos (cualquiera alcanza) cuyo permiso de escritura habilita cada operación. */
function modulosPara(tipo: 'transferencia' | 'ack', recurso: Recurso): string[] {
  if (tipo === 'ack') return recurso === 'dinero' ? ['tesoreria', 'acopio'] : [recurso === 'combustible' ? 'combustible' : '__ninguno__'];
  switch (recurso) {
    case 'dinero': return ['tesoreria'];
    case 'combustible': return ['combustible'];
    case 'casiterita': return ['inventario', 'salidas'];
    case 'cuenta_por_cobrar': return ['acopio'];
  }
}

async function tienePermiso(s: Sesion, modulos: string[]): Promise<boolean> {
  for (const m of modulos) if (await puede(s, m)) return true;
  return false;
}

type Resultado = { ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string };
const noEnviable = (msg = 'La transferencia no existe o no está en un estado enviable.'): Resultado =>
  ({ ok: false, status: 409, error: msg });

/** Reconstruye, desde la fila LOCAL, el cuerpo que se manda al otro sistema.
 *  Los nombres de campo son los que espera transfer-recibir (nuevo y viejo). */
async function payloadTransferencia(s: Sesion, recurso: Recurso, transfId: string): Promise<Resultado> {
  const db = s.admin;
  const ENVIABLE = ['enviada', 'error'];

  if (recurso === 'dinero') {
    const { data, error } = await db.from('transferencias_inter')
      .select('transf_id, direccion, estado, empresa_origen, empresa_destino, legs, resumen, motivo, actor, actor_name')
      .eq('transf_id', transfId).maybeSingle();
    if (error) { console.error('[transfer-enviar] dinero', error); return { ok: false, status: 500, error: 'No se pudo leer la transferencia.' }; }
    const r = data as Record<string, unknown> | null;
    if (!r || r.direccion !== 'saliente' || !ENVIABLE.includes(String(r.estado))) return noEnviable();
    const legs = Array.isArray(r.legs) ? (r.legs as Record<string, unknown>[]) : [];
    const legsLimpios = legs
      .map((l) => ({ cuenta: l.cuenta ?? 'general', moneda: l.moneda, monto: Number(l.monto), tasa_bs: l.tasa_bs ?? null }))
      .filter((l) => Number.isFinite(l.monto) && l.monto > 0);
    if (!legsLimpios.length) return noEnviable('La transferencia no tiene montos.');
    return { ok: true, body: {
      tipo: 'transferencia', transf_id: r.transf_id,
      empresa_origen: r.empresa_origen, empresa_destino: r.empresa_destino,
      legs: legsLimpios, resumen: r.resumen, motivo: r.motivo,
      actor: r.actor, actor_name: r.actor_name,
    } };
  }

  if (recurso === 'combustible') {
    const { data, error } = await db.from('transferencias_combustible_inter')
      .select('transf_id, direccion, estado, empresa_origen, empresa_destino, combustible_nombre, litros, costo_litro, resumen, motivo, actor, actor_name')
      .eq('transf_id', transfId).maybeSingle();
    if (error) { console.error('[transfer-enviar] combustible', error); return { ok: false, status: 500, error: 'No se pudo leer la transferencia.' }; }
    const r = data as Record<string, unknown> | null;
    if (!r || r.direccion !== 'saliente' || !ENVIABLE.includes(String(r.estado))) return noEnviable();
    const litros = Number(r.litros);
    if (!Number.isFinite(litros) || litros <= 0) return noEnviable('La transferencia no tiene litros.');
    return { ok: true, body: {
      tipo: 'transferencia', recurso: 'combustible', transf_id: r.transf_id,
      empresa_origen: r.empresa_origen, empresa_destino: r.empresa_destino,
      combustible_nombre: r.combustible_nombre, litros,
      costo_litro: r.costo_litro == null ? null : Number(r.costo_litro),
      resumen: r.resumen, motivo: r.motivo, actor: r.actor, actor_name: r.actor_name,
    } };
  }

  if (recurso === 'casiterita') {
    const { data, error } = await db.from('transferencias_casiterita_inter')
      .select('transf_id, direccion, estado, empresa_origen, empresa_destino, producto_nombre, sku, kg, costo_unitario, almacen_destino, resumen, motivo, actor, actor_name')
      .eq('transf_id', transfId).maybeSingle();
    if (error) { console.error('[transfer-enviar] casiterita', error); return { ok: false, status: 500, error: 'No se pudo leer la transferencia.' }; }
    const r = data as Record<string, unknown> | null;
    if (!r || r.direccion !== 'saliente' || !ENVIABLE.includes(String(r.estado))) return noEnviable();
    const kg = Number(r.kg);
    if (!Number.isFinite(kg) || kg <= 0) return noEnviable('La transferencia no tiene Kg.');
    return { ok: true, body: {
      tipo: 'transferencia', recurso: 'casiterita', transf_id: r.transf_id,
      empresa_origen: r.empresa_origen, empresa_destino: r.empresa_destino,
      producto_nombre: r.producto_nombre, sku: r.sku,
      kg, costo_unitario: r.costo_unitario == null ? null : Number(r.costo_unitario),
      almacen_destino: r.almacen_destino ?? 'LOS PINOS - CASITERITA',
      resumen: r.resumen, motivo: r.motivo, actor: r.actor, actor_name: r.actor_name,
    } };
  }

  // cuenta_por_cobrar: la fila local es el movimiento de caja de Acopio (transf_id = su id).
  if ((Deno.env.get('INTER_PUENTE_CXC') ?? '').trim().toLowerCase() === 'off') {
    return { ok: false, status: 403, error: 'El espejo de cuentas por cobrar está desactivado.' };
  }
  const { data, error } = await db.from('acopio_caja_movimientos')
    .select('id, descripcion, usd_entregado, ref_martillo_id, created_by, actor_name')
    .eq('id', transfId).maybeSingle();
  if (error) { console.error('[transfer-enviar] cxc', error); return { ok: false, status: 500, error: 'No se pudo leer el movimiento.' }; }
  const m = data as Record<string, unknown> | null;
  const monto = Math.round(Number(m?.usd_entregado) * 100) / 100;
  // Mismas exclusiones que la deuda a MGG: sin compensaciones de martillo ni el
  // «Saldo anterior» que arrastra el cierre de caja (ese nunca genera deuda).
  if (!m || !Number.isFinite(monto) || monto <= 0 || m.ref_martillo_id != null
      || String(m.descripcion ?? '').startsWith('Saldo anterior')) {
    return noEnviable('El movimiento no existe o no genera cuenta por cobrar.');
  }
  return { ok: true, body: {
    tipo: 'transferencia', recurso: 'cuenta_por_cobrar', transf_id: m.id,
    empresa_origen: (Deno.env.get('INTER_EMPRESA_CODIGO') ?? '').trim() || 'golden-touch',
    empresa_destino: 'mgg', monto, moneda: 'USD',
    cliente_nombre: (Deno.env.get('INTER_CXC_CLIENTE_NOMBRE') ?? '').trim() || 'GOLDEN TOUCH 1127 C.A.',
    motivo: 'USD entregados (centro de costo)', actor: m.created_by, actor_name: m.actor_name,
  } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1) Sesión válida antes de tocar nada. Sin esto, el resto es de acceso público.
  const sesion = await exigirSesion(req);
  if (sesion instanceof Response) return sesion;

  let pedido: Record<string, unknown>;
  try { pedido = await req.json(); } catch { return json({ error: 'Body JSON inválido' }, 400); }
  if (!pedido || typeof pedido !== 'object') return json({ error: 'Body JSON inválido' }, 400);

  // 2) Del cuerpo solo se toman tipo, recurso y transf_id.
  const tipo: 'transferencia' | 'ack' = pedido.tipo === 'ack' ? 'ack' : 'transferencia';
  const recursoRaw = pedido.recurso == null ? 'dinero' : String(pedido.recurso);
  if (!RECURSOS.includes(recursoRaw as Recurso)) return json({ entregada: false, error: 'Recurso no soportado.' }, 400);
  const recurso = recursoRaw as Recurso;
  const transfId = typeof pedido.transf_id === 'string' ? pedido.transf_id.trim() : '';
  if (!UUID_RE.test(transfId)) return json({ entregada: false, error: 'transf_id inválido.' }, 400);

  // 3) Permiso del módulo que dispara esta operación.
  if (!(await tienePermiso(sesion, modulosPara(tipo, recurso)))) {
    return json({ entregada: false, error: 'No tenés permiso para esta operación.' }, 403);
  }

  const secret = Deno.env.get('INTER_SECRET');
  if (!secret) return json({ entregada: false, error: 'INTER_SECRET no configurado en este sistema.' });

  const selfUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const callbackPropio = selfUrl ? `${selfUrl}/functions/v1` : '';

  // 4) Destino y cuerpo, ambos desde la base local. NUNCA del pedido.
  let target: string;
  let body: Record<string, unknown>;
  if (tipo === 'ack') {
    // El ACK solo sale si la ENTRANTE local existe y ya quedó recibida acá.
    const TABLE = recurso === 'combustible' ? 'transferencias_combustible_inter' : 'transferencias_inter';
    const { data, error } = await sesion.admin.from(TABLE)
      .select('transf_id, direccion, estado, callback_base').eq('transf_id', transfId).maybeSingle();
    if (error) {
      console.error('[transfer-enviar] ack', error);
      return json({ entregada: false, error: 'No se pudo leer la transferencia.' }, 500);
    }
    const r = data as { transf_id: string; direccion: string; estado: string; callback_base: string | null } | null;
    if (!r || r.direccion !== 'entrante' || r.estado !== 'recibida') {
      return json({ entregada: false, error: 'No hay una transferencia entrante recibida con ese id.' });
    }
    const cb = r.callback_base;
    if (!cb) return json({ entregada: false, error: 'La transferencia no tiene a quién avisar.' });

    let origen: string;
    try { origen = new URL(cb).origin; }
    catch { return json({ entregada: false, error: 'callback_base no es una URL válida.' }, 400); }
    if (!origenesPermitidos().includes(origen)) {
      // El secreto compartido solo viaja a sistemas que configuramos nosotros.
      return json({ entregada: false, error: 'Destino de ACK no permitido.' }, 403);
    }
    target = `${cb.replace(/\/+$/, '')}/transfer-recibir`;
    body = { tipo: 'ack', transf_id: r.transf_id, ...(recurso === 'dinero' ? {} : { recurso }) };
  } else {
    const destino = Deno.env.get('INTER_DESTINO_URL');
    if (!destino) return json({ entregada: false, error: 'Destino no configurado todavía: definí INTER_DESTINO_URL al desplegar el otro sistema.' });
    const res = await payloadTransferencia(sesion, recurso, transfId);
    // Rechazos de negocio con 200 + entregada:false, para que la pantalla muestre el motivo.
    if (!res.ok) return json({ entregada: false, error: res.error }, res.status === 500 ? 500 : 200);
    target = `${destino.replace(/\/+$/, '')}/transfer-recibir`;
    body = res.body;
  }

  // 5) El callback que anunciamos es SIEMPRE el propio.
  const envio = { ...body, callback_base: callbackPropio, origen_actor: sesion.email };

  let resp: Response;
  try {
    resp = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-inter-secret': secret },
      body: JSON.stringify(envio),
    });
  } catch (e) {
    console.error('[transfer-enviar] fetch', target, e);
    return json({ entregada: false, error: 'No se pudo contactar al otro sistema.' });
  }

  const text = await resp.text();
  if (!resp.ok) {
    console.error('[transfer-enviar] el otro sistema respondió', resp.status, text.slice(0, 500));
    return json({ entregada: false, error: `El otro sistema rechazó la entrega (HTTP ${resp.status}).` });
  }
  return json({ entregada: true, respuesta: text });
});
