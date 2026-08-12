import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
  buscarLeadPorId,
  definirControleManualPorId,
  listarLeads,
  listarMensagensDoLead,
} from '../../infra/persistencia/index.js';
import type { PersistenciaDependencies } from '../../infra/persistencia/index.js';
import { TABELA_CONFIG_IA } from '../adaptadores/configuracao.js';
import type { ProvedorConfiguracaoSupabase } from '../adaptadores/configuracao.js';

export const HEADER_CHAVE_INTERNA = 'x-internal-api-key';
export const PREFIXO_API = '/api';

export interface DependenciasApi {
  chaveInterna: string;
  persistencia: PersistenciaDependencies;
  configuracao: ProvedorConfiguracaoSupabase;
}

function chaveConfere(recebida: string | undefined, esperada: string): boolean {
  if (recebida === undefined) {
    return false;
  }

  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);

  return a.length === b.length && timingSafeEqual(a, b);
}

const PARAMS_LEAD = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

/**
 * API consumida pelo dashboard.
 *
 * Toda rota declara schema de validação. É proposital: o V1 quebrou justamente
 * por contrato implícito entre backend e dashboard, e um payload inesperado
 * falhava em silêncio lá dentro em vez de ser recusado na porta de entrada.
 */
export function registrarRotasApi(app: FastifyInstance, deps: DependenciasApi): void {
  app.addHook('onRequest', (requisicao, resposta, proximo) => {
    if (!requisicao.url.startsWith(PREFIXO_API)) {
      return proximo();
    }

    const recebida = requisicao.headers[HEADER_CHAVE_INTERNA];
    const chave = Array.isArray(recebida) ? recebida[0] : recebida;

    if (!chaveConfere(chave, deps.chaveInterna)) {
      return resposta.status(401).send({ erro: 'Chave interna inválida.' });
    }

    return proximo();
  });

  app.get(
    `${PREFIXO_API}/leads`,
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            estagio: { type: 'string' },
            pagina: { type: 'integer', minimum: 1 },
            limite: { type: 'integer', minimum: 1, maximum: 200 },
          },
        },
      },
    },
    async (requisicao) => {
      const consulta = requisicao.query as { estagio?: string; pagina?: number; limite?: number };

      return listarLeads(deps.persistencia, consulta);
    },
  );

  app.get(
    `${PREFIXO_API}/leads/:id`,
    { schema: { params: PARAMS_LEAD } },
    async (requisicao, resposta) => {
      const { id } = requisicao.params as { id: string };
      const lead = await buscarLeadPorId(deps.persistencia, id);

      if (lead === null) {
        return resposta.status(404).send({ erro: 'Lead não encontrado.' });
      }

      return lead;
    },
  );

  app.get(
    `${PREFIXO_API}/leads/:id/mensagens`,
    { schema: { params: PARAMS_LEAD } },
    async (requisicao, resposta) => {
      const { id } = requisicao.params as { id: string };
      const lead = await buscarLeadPorId(deps.persistencia, id);

      if (lead === null) {
        return resposta.status(404).send({ erro: 'Lead não encontrado.' });
      }

      return { mensagens: await listarMensagensDoLead(deps.persistencia, id) };
    },
  );

  app.post(
    `${PREFIXO_API}/leads/:id/controle-manual`,
    {
      schema: {
        params: PARAMS_LEAD,
        body: {
          type: 'object',
          required: ['ativo'],
          properties: { ativo: { type: 'boolean' } },
        },
      },
    },
    async (requisicao, resposta) => {
      const { id } = requisicao.params as { id: string };
      const { ativo } = requisicao.body as { ativo: boolean };

      const lead = await definirControleManualPorId(deps.persistencia, id, ativo);

      if (lead === null) {
        return resposta.status(404).send({ erro: 'Lead não encontrado.' });
      }

      return { id: lead.id, controle_manual: lead.controle_manual };
    },
  );

  app.get(`${PREFIXO_API}/config`, async () => deps.configuracao.carregar());

  app.put(
    `${PREFIXO_API}/config`,
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            persona: { type: 'string', minLength: 1, maxLength: 2000 },
            objetivo: { type: 'string', minLength: 1, maxLength: 2000 },
            tomDeVoz: { type: 'string', maxLength: 2000 },
            contexto: { type: 'string', maxLength: 4000 },
          },
          additionalProperties: false,
        },
      },
    },
    async (requisicao) => {
      const corpo = requisicao.body as {
        persona?: string;
        objetivo?: string;
        tomDeVoz?: string;
        contexto?: string;
      };

      const valores: Record<string, unknown> = { atualizado_em: new Date().toISOString() };

      if (corpo.persona !== undefined) {
        valores['persona'] = corpo.persona;
      }

      if (corpo.objetivo !== undefined) {
        valores['objetivo'] = corpo.objetivo;
      }

      if (corpo.tomDeVoz !== undefined) {
        valores['tom_de_voz'] = corpo.tomDeVoz;
      }

      if (corpo.contexto !== undefined) {
        valores['contexto'] = corpo.contexto;
      }

      // O singleton tem id fixo = 1 (ver migration 0004).
      await deps.persistencia.cliente.atualizarPorId(TABELA_CONFIG_IA, '1', valores);

      // Sem isso, a edição só apareceria na conversa quando o TTL expirasse.
      deps.configuracao.invalidar();

      return deps.configuracao.carregar();
    },
  );
}
