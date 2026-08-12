import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { WebhookInvalidoError, parsearWebhook } from '../../integrations/wasender/index.js';
import type { MensagemRecebida } from '../../integrations/wasender/index.js';

export const HEADER_SEGREDO = 'x-webhook-secret';

export interface DependenciasWebhook {
  segredo: string;
  enfileirar: (mensagem: MensagemRecebida) => void;
  aoIgnorar?: (motivo: string) => void;
}

/** Comparação em tempo constante: evita descobrir o segredo por timing. */
function segredoConfere(recebido: string | undefined, esperado: string): boolean {
  if (recebido === undefined) {
    return false;
  }

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Webhook do WaSender.
 *
 * Duas decisões importantes:
 *
 * 1. Responde 202 imediatamente e processa fora do request. Processar aqui
 *    dentro faria o WaSender esperar pela IA e estourar o timeout dele.
 * 2. Payload que não deve ser processado (mensagem própria, grupo, formato
 *    inesperado) responde 200 com `ignorado`, não 4xx. Erro faria o WaSender
 *    reentregar a mesma mensagem para sempre.
 */
export function registrarRotaWebhook(app: FastifyInstance, deps: DependenciasWebhook): void {
  app.post('/webhooks/wasender', (requisicao, resposta) => {
    const recebido = requisicao.headers[HEADER_SEGREDO];
    const cabecalho = Array.isArray(recebido) ? recebido[0] : recebido;

    if (!segredoConfere(cabecalho, deps.segredo)) {
      return resposta.status(401).send({ erro: 'Segredo do webhook inválido.' });
    }

    let mensagem: MensagemRecebida;

    try {
      mensagem = parsearWebhook(requisicao.body);
    } catch (erro) {
      if (erro instanceof WebhookInvalidoError) {
        deps.aoIgnorar?.(erro.message);

        return resposta.status(200).send({ ignorado: true, motivo: erro.message });
      }

      throw erro;
    }

    deps.enfileirar(mensagem);

    return resposta.status(202).send({ recebido: true, waMessageId: mensagem.waMessageId });
  });
}
