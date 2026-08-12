import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { verificarSaude } from '../infra/boot/boot.js';
import type { DependenciasBoot } from '../infra/boot/boot.js';
import { registrarRotasApi } from './rotas/api.js';
import type { DependenciasApi } from './rotas/api.js';
import { registrarRotaWebhook } from './rotas/webhook.js';
import type { DependenciasWebhook } from './rotas/webhook.js';

/** Payload de webhook do WhatsApp não precisa passar de 1 MB. */
export const LIMITE_CORPO_BYTES = 1_048_576;

export interface DependenciasServidor extends DependenciasBoot {
  logger?: boolean;
  webhook?: DependenciasWebhook;
  api?: DependenciasApi;
}

/**
 * Servidor HTTP do backend.
 *
 * Liveness (`/`) e readiness (`/health`) são endpoints distintos de propósito:
 * `/` responde 200 sempre, mesmo com o banco fora, para o orquestrador do
 * Railway não entrar em crash-loop; `/health` diz a verdade sobre as
 * dependências e devolve 503 quando algo está quebrado.
 */
export function criarServidor(deps: DependenciasServidor): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: LIMITE_CORPO_BYTES,
    disableRequestLogging: true,
    // Por padrão o Fastify REMOVE campos desconhecidos em silêncio. Preferimos
    // recusar: um campo que o dashboard envia e o backend ignora sem avisar é
    // exatamente o drift silencioso que quebrou o V1.
    ajv: { customOptions: { removeAdditional: false } },
  });

  app.get('/', () => ({ servico: 'klaus-backend', status: 'no ar' }));

  app.get('/health', async (_requisicao, resposta) => {
    const saude = await verificarSaude(deps);

    return resposta.status(saude.saudavel ? 200 : 503).send(saude);
  });

  if (deps.webhook !== undefined) {
    registrarRotaWebhook(app, deps.webhook);
  }

  if (deps.api !== undefined) {
    registrarRotasApi(app, deps.api);
  }

  app.setNotFoundHandler((requisicao, resposta) =>
    resposta.status(404).send({ erro: `Rota não encontrada: ${requisicao.url}` }),
  );

  return app;
}
