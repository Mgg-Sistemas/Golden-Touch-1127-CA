import { describe, it, expect } from 'vitest';
import {
  parseChatBlocks,
  tokenizeInline,
  esReferenciaValida,
  etiquetaTipoReferencia,
} from './ChatFormato';
import {
  extraerMenciones,
  resolverDestinatariosMenciones,
} from './chatMenciones';

describe('ChatFormato · Bloques y sintaxis estilo WhatsApp / Slack / Telegram', () => {
  it('parsea listas con viñetas (-, •, *) correctamente', () => {
    const texto = `Lista de tareas:
- Primer elemento
• Segundo elemento
* Tercer elemento con *negrita*`;

    const blocks = parseChatBlocks(texto);
    expect(blocks.length).toBe(4);
    expect(blocks[0].type).toBe('line');
    expect(blocks[1].type).toBe('bullet');
    expect(blocks[1].content).toBe('Primer elemento');
    expect(blocks[2].type).toBe('bullet');
    expect(blocks[2].content).toBe('Segundo elemento');
    expect(blocks[3].type).toBe('bullet');
    expect(blocks[3].content).toBe('Tercer elemento con *negrita*');
  });

  it('parsea listas numeradas (1., 2.)', () => {
    const texto = `Pasos a seguir:
1. Cotizar con proveedores
2. Aprobar mejor oferta`;

    const blocks = parseChatBlocks(texto);
    expect(blocks[1].type).toBe('numbered');
    expect(blocks[1].num).toBe('1');
    expect(blocks[1].content).toBe('Cotizar con proveedores');
    expect(blocks[2].type).toBe('numbered');
    expect(blocks[2].num).toBe('2');
  });

  it('parsea citas con > al inicio de la línea', () => {
    const texto = `> Esto es una instrucción importante del Gerente`;
    const blocks = parseChatBlocks(texto);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].content).toBe('Esto es una instrucción importante del Gerente');
  });

  it('parsea bloques de código cercados con ```', () => {
    const texto = '```\nconst x = 10;\nconsole.log(x);\n```';
    const blocks = parseChatBlocks(texto);
    expect(blocks[0].type).toBe('codeblock');
    expect(blocks[0].content).toContain('const x = 10;');
  });
});

describe('ChatFormato · Inline Tokenizer', () => {
  it('reconoce negrita (* y **), cursiva (_), tachado (~ y ~~) y código (`...`)', () => {
    const texto = 'Texto con *negrita*, _cursiva_, ~tachado~ y `código inline`';
    const tokens = tokenizeInline(texto);

    const boldToken = tokens.find((t) => t.type === 'bold');
    expect(boldToken?.content).toBe('negrita');

    const italicToken = tokens.find((t) => t.type === 'italic');
    expect(italicToken?.content).toBe('cursiva');

    const strikeToken = tokens.find((t) => t.type === 'strike');
    expect(strikeToken?.content).toBe('tachado');

    const codeToken = tokens.find((t) => t.type === 'code');
    expect(codeToken?.content).toBe('código inline');
  });

  it('reconoce enlaces web (URLs)', () => {
    const texto = 'Favor revisar https://goldentouch.app/documento';
    const tokens = tokenizeInline(texto);
    const urlToken = tokens.find((t) => t.type === 'url');
    expect(urlToken?.raw).toBe('https://goldentouch.app/documento');
  });
});

describe('ChatFormato · Referencias (#) y Exclusiones requeridas', () => {
  it('valida referencias admitidas (#OC, #SP, #CS, #SS)', () => {
    expect(esReferenciaValida('#OC-2026-0041')).toBe(true);
    expect(esReferenciaValida('OC-2026-0041')).toBe(true);
    expect(esReferenciaValida('#SP-2026-0010')).toBe(true);
    expect(esReferenciaValida('#CS-2026-0005')).toBe(true);
    expect(esReferenciaValida('#SS-2026-0002')).toBe(true);
  });

  it('REQUISITO CRÍTICO: Excluye compras directas (#CD-...) y servicios directos (#SD-...)', () => {
    expect(esReferenciaValida('#CD-2026-0001')).toBe(false);
    expect(esReferenciaValida('CD-2026-0001')).toBe(false);
    expect(esReferenciaValida('#SD-2026-0002')).toBe(false);
    expect(esReferenciaValida('SD-2026-0002')).toBe(false);
  });

  it('tokeniza referencias permitidas y deja CD/SD como texto plano', () => {
    const texto = 'Referenciar #OC-2026-0041 y #SP-2026-0010 pero no tocar #CD-2026-0099 ni #SD-2026-0001';
    const tokens = tokenizeInline(texto);

    const refTokens = tokens.filter((t) => t.type === 'ref');
    expect(refTokens.map((r) => r.content)).toEqual(['OC-2026-0041', 'SP-2026-0010']);

    // Verificar que CD y SD no fueron convertidos a 'ref'
    const cdRef = refTokens.find((r) => r.content.includes('CD-'));
    const sdRef = refTokens.find((r) => r.content.includes('SD-'));
    expect(cdRef).toBeUndefined();
    expect(sdRef).toBeUndefined();
  });

  it('asigna la etiqueta humana correcta según el prefijo', () => {
    expect(etiquetaTipoReferencia('#OC-001')).toBe('Orden de Compra');
    expect(etiquetaTipoReferencia('#SP-001')).toBe('Solicitud de Pedido');
    expect(etiquetaTipoReferencia('#CS-001')).toBe('Control de Servicio');
    expect(etiquetaTipoReferencia('#SS-001')).toBe('Solicitud de Servicio');
  });
});

describe('chatMenciones · Menciones (@) y resolución de personas', () => {
  it('extrae menciones compuestas conocidas y menciones por correo', () => {
    const texto = 'Hola @Javier Leiva, favor coordinar con @Kelvin Peña y @touchgolden1127@gmail.com';
    const menciones = extraerMenciones(texto);

    expect(menciones).toContain('@Javier Leiva');
    expect(menciones).toContain('@Kelvin Peña');
    expect(menciones).toContain('@touchgolden1127@gmail.com');
  });

  it('no engulle palabras posteriores en menciones de un solo término', () => {
    const texto = 'Hola @Javier por favor revisa el monto';
    const menciones = extraerMenciones(texto);
    expect(menciones).toEqual(['@Javier']);
  });

  it('resuelve destinatarios por nombre y por email', () => {
    const menciones = ['@Javier Leiva', '@Kelvin Peña', '@touchgolden1127@gmail.com'];
    const destinatarios = resolverDestinatariosMenciones(menciones);

    expect(destinatarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'analista1mgg@gmail.com', nombre: 'JAVIER LEIVA' }),
        expect.objectContaining({ email: 'comprasanalista9@gmail.com', nombre: 'KELVIN PEÑA' }),
        expect.objectContaining({ email: 'touchgolden1127@gmail.com', nombre: 'JESUS LOZADA' }),
      ])
    );
  });
});
