import Fastify, { LogController } from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

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
  /** Pasta com o build da SPA do dashboard (dashboard/dist). */
  dashboard?: { raiz: string };
}

/**
 * Servidor HTTP do backend.
 *
 * Readiness fica em `/health` e diz a verdade sobre as dependências (503
 * quando algo está quebrado). A raiz serve a SPA do dashboard quando o build
 * existe; sem ele, responde o liveness JSON de sempre para o Railway não
 * entrar em crash-loop.
 */
export function criarServidor(deps: DependenciasServidor): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: LIMITE_CORPO_BYTES,
    logController: new LogController({
      disableRequestLogging: true,
    }),
    // Por padrão o Fastify REMOVE campos desconhecidos em silêncio. Preferimos
    // recusar: um campo que o dashboard envia e o backend ignora sem avisar é
    // exatamente o drift silencioso que quebrou o V1.
    ajv: { customOptions: { removeAdditional: false } },
  });

  // Com dashboard, a raiz serve a SPA e o liveness fica em /health;
  // sem ele (testes, build parcial), a raiz continua sendo o liveness JSON.
  if (deps.dashboard === undefined) {
    app.get('/', () => ({ servico: 'klaus-backend', status: 'no ar' }));
  } else {
    app.register(fastifyStatic, { root: deps.dashboard.raiz });
  }

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

  app.setNotFoundHandler((requisicao, resposta) => {
    // SPA com rotas client-side (/kanban, /configuracao): qualquer GET fora de
    // /api e /webhooks devolve o index.html e o roteador do navegador assume.
    const ehGet = requisicao.method === 'GET' || requisicao.method === 'HEAD';
    const ehSpa =
      deps.dashboard !== undefined &&
      ehGet &&
      !requisicao.url.startsWith('/api') &&
      !requisicao.url.startsWith('/webhooks');

    if (ehSpa) {
      return resposta.sendFile('index.html');
    }

    return resposta.status(404).send({ erro: `Rota não encontrada: ${requisicao.url}` });
  });

  return app;
}
