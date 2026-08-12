import { describe, expect, it, vi } from 'vitest';

import { CONTRATO_SCHEMA } from '../../infra/database/schema-contrato.js';
import type { ColunaReal, LeitorSchema } from '../../infra/database/verificar-schema.js';
import { ClienteMemoria } from '../../infra/persistencia/cliente-memoria.js';
import type { MensagemRecebida } from '../../integrations/wasender/index.js';
import { criarServidor } from '../servidor.js';
import { HEADER_SEGREDO } from './webhook.js';

const SEGREDO = 'segredo-do-webhook-bem-longo';

function leitorValido(): LeitorSchema {
  const colunas: ColunaReal[] = CONTRATO_SCHEMA.flatMap((tabela) =>
    tabela.colunas.map((coluna) => ({
      table_name: tabela.nome,
      column_name: coluna.nome,
      data_type: coluna.tipo,
      is_nullable: coluna.nulabilidade === 'obrigatoria' ? ('NO' as const) : ('YES' as const),
    })),
  );

  return { listarColunas: () => Promise.resolve(colunas) };
}

function criarApp(enfileirar: (mensagem: MensagemRecebida) => void = () => undefined) {
  return criarServidor({
    cliente: new ClienteMemoria({ leads: [] }),
    leitorSchema: leitorValido(),
    webhook: { segredo: SEGREDO, enfileirar },
  });
}

function payload(): unknown {
  return {
    data: {
      key: { id: 'wamid.ABC', remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
      pushName: 'Ana',
      message: { conversation: 'Olá, quero saber mais' },
    },
  };
}

describe('POST /webhooks/wasender', () => {
  it('aceita a mensagem e responde 202 sem processar no request', async () => {
    const enfileirar = vi.fn();
    const app = criarApp(enfileirar);

    const resposta = await app.inject({
      method: 'POST',
      url: '/webhooks/wasender',
      headers: { [HEADER_SEGREDO]: SEGREDO },
      payload: payload(),
    });

    expect(resposta.statusCode).toBe(202);
    expect(enfileirar).toHaveBeenCalledTimes(1);
    expect(enfileirar.mock.calls[0]?.[0]).toMatchObject({
      telefone: '5511999998888',
      texto: 'Olá, quero saber mais',
    });

    await app.close();
  });

  it('recusa requisição sem segredo', async () => {
    const enfileirar = vi.fn();
    const app = criarApp(enfileirar);

    const resposta = await app.inject({
      method: 'POST',
      url: '/webhooks/wasender',
      payload: payload(),
    });

    expect(resposta.statusCode).toBe(401);
    expect(enfileirar).not.toHaveBeenCalled();

    await app.close();
  });

  it('recusa segredo errado', async () => {
    const app = criarApp();

    const resposta = await app.inject({
      method: 'POST',
      url: '/webhooks/wasender',
      headers: { [HEADER_SEGREDO]: 'segredo-errado-do-mesmo-tam' },
      payload: payload(),
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });

  it('responde 200 e ignora mensagem enviada pelo próprio número', async () => {
    const enfileirar = vi.fn();
    const app = criarApp(enfileirar);

    const resposta = await app.inject({
      method: 'POST',
      url: '/webhooks/wasender',
      headers: { [HEADER_SEGREDO]: SEGREDO },
      payload: {
        data: {
          key: { id: 'wamid.X', remoteJid: '5511999998888@s.whatsapp.net', fromMe: true },
          message: { conversation: 'oi' },
        },
      },
    });

    // 200 e não 4xx: erro faria o WaSender reentregar para sempre.
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ignorado).toBe(true);
    expect(enfileirar).not.toHaveBeenCalled();

    await app.close();
  });

  it('responde 200 e ignora payload malformado', async () => {
    const app = criarApp();

    const resposta = await app.inject({
      method: 'POST',
      url: '/webhooks/wasender',
      headers: { [HEADER_SEGREDO]: SEGREDO },
      payload: { qualquer: 'coisa' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ignorado).toBe(true);

    await app.close();
  });

  it('não expõe a rota quando o webhook não está configurado', async () => {
    const app = criarServidor({
      cliente: new ClienteMemoria({ leads: [] }),
      leitorSchema: leitorValido(),
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/webhooks/wasender',
      payload: payload(),
    });

    expect(resposta.statusCode).toBe(404);

    await app.close();
  });
});
