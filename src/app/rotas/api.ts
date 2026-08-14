import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import {
  buscarLeadPorId,
  definirControleManualPorId,
  listarLeads,
  listarMensagensDoLead,
  registrarMensagem,
  TABELA_REGRAS_CONVERSA,
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
  enviar?: (telefone: string, texto: string) => Promise<void>;
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
    `${PREFIXO_API}/leads/:id/mensagens`,
    {
      schema: {
        params: PARAMS_LEAD,
        body: {
          type: 'object',
          properties: {
            texto: { type: 'string', minLength: 1, maxLength: 4096 },
            conteudo: { type: 'string', minLength: 1, maxLength: 5000 },
          },
          anyOf: [{ required: ['texto'] }, { required: ['conteudo'] }],
          additionalProperties: false,
        },
      },
    },
    async (requisicao, resposta) => {
      const { id } = requisicao.params as { id: string };
      const corpo = requisicao.body as { texto?: string; conteudo?: string };
      const texto = (corpo.texto ?? corpo.conteudo ?? '').trim();
      const lead = await buscarLeadPorId(deps.persistencia, id);

      if (lead === null) {
        return resposta.status(404).send({ erro: 'Lead não encontrado.' });
      }

      if (texto.length === 0) {
        return resposta.status(400).send({ erro: 'Texto da mensagem não pode ser vazio.' });
      }

      if (deps.enviar === undefined) {
        return resposta.status(503).send({ erro: 'Cliente de envio não configurado.' });
      }

      try {
        await deps.enviar(lead.telefone, texto);
        const gravacao = await registrarMensagem(deps.persistencia, {
          telefone: lead.telefone,
          direcao: 'saida',
          conteudo: texto,
        });

        return {
          id: gravacao.mensagem.id,
          lead_id: lead.id,
          direcao: 'saida',
          conteudo: gravacao.mensagem.conteudo,
        };
      } catch (error) {
        const motivo = error instanceof Error ? error.message : 'Falha inesperada ao enviar mensagem.';
        return resposta.status(400).send({ erro: motivo });
      }
    },
  );

  app.post(
    `${PREFIXO_API}/prospeccao/manual-disparos`,
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            texto: { type: 'string', minLength: 1, maxLength: 4096 },
            lead_ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
            },
            telefones: {
              type: 'array',
              items: { type: 'string', minLength: 10, maxLength: 20 },
            },
            targets: {
              type: 'array',
              minItems: 1,
              maxItems: 1000,
              items: {
                type: 'object',
                required: ['message'],
                properties: {
                  lead_id: { type: 'string', format: 'uuid' },
                  phone: { type: 'string' },
                  message: { type: 'string', minLength: 1, maxLength: 5000 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (requisicao, resposta) => {
      const corpo = requisicao.body as {
        texto?: string;
        lead_ids?: string[];
        telefones?: string[];
        targets?: Array<{ lead_id?: string; phone?: string; message?: string }>;
      };

      if (Array.isArray(corpo.targets) && corpo.targets.length > 0) {
        const resultados: Array<{ lead_id?: string; phone?: string; status: string }> = [];
        const agora = new Date().toISOString();

        for (const target of corpo.targets) {
          try {
            const message = target.message?.trim() ?? '';

            if (message.length === 0) {
              resultados.push({ phone: target.phone, status: 'error' });
              continue;
            }

            let leadId: string | null = null;

            if (target.lead_id !== undefined) {
              const lead = await buscarLeadPorId(deps.persistencia, target.lead_id);

              if (lead === null) {
                resultados.push({ lead_id: target.lead_id, status: 'not_found' });
                continue;
              }

              leadId = lead.id;
            } else if (target.phone !== undefined) {
              const leads = await deps.persistencia.cliente.selecionarTodos<{ id: string }>('leads', {
                telefone: target.phone,
              });

              if (leads.length > 0) {
                const leadExistente = leads[0];

                if (leadExistente !== undefined) {
                  leadId = leadExistente.id;
                }
              }

              if (leadId === null) {
                const novoLead = await deps.persistencia.cliente.inserirUm<{ id: string }>('leads', {
                  telefone: target.phone,
                  estagio: 'novo',
                  criado_em: agora,
                });
                leadId = novoLead.id;
              }
            }

            if (leadId === null) {
              resultados.push({ phone: target.phone, status: 'error' });
              continue;
            }

            await deps.persistencia.cliente.inserirUm('mensagens', {
              lead_id: leadId,
              conteudo: message,
              direcao: 'saida',
              criado_em: agora,
            });

            await deps.persistencia.cliente.atualizarPorId('leads', leadId, {
              ultima_mensagem: message,
              ultima_interacao: agora,
            });

            resultados.push({ lead_id: leadId, status: 'queued' });
          } catch {
            resultados.push({ phone: target.phone, status: 'error' });
          }
        }

        return {
          queued_count: resultados.filter((item) => item.status === 'queued').length,
          results: resultados,
        };
      }

      const texto = (corpo.texto ?? '').trim();
      if (texto.length === 0) {
        return resposta.status(400).send({ erro: 'Texto da mensagem não pode ser vazio.' });
      }

      if (deps.enviar === undefined) {
        return resposta.status(503).send({ erro: 'Cliente de envio não configurado.' });
      }

      const alvos = new Set<string>();
      const leadIds = corpo.lead_ids ?? [];
      const numeros = corpo.telefones ?? [];

      for (const id of leadIds) {
        const lead = await buscarLeadPorId(deps.persistencia, id);

        if (lead !== null) {
          alvos.add(lead.telefone);
        }
      }

      for (const telefone of numeros) {
        alvos.add(telefone);
      }

      if (alvos.size === 0) {
        return resposta.status(400).send({ erro: 'Nenhum alvo válido foi informado.' });
      }

      const resultados: Array<{ telefone: string; sucesso: boolean; erro?: string }> = [];

      for (const telefone of Array.from(alvos)) {
        try {
          await deps.enviar(telefone, texto);
          await registrarMensagem(deps.persistencia, {
            telefone,
            direcao: 'saida',
            conteudo: texto,
          });
          resultados.push({ telefone, sucesso: true });
        } catch (error) {
          resultados.push({
            telefone,
            sucesso: false,
            erro: error instanceof Error ? error.message : 'Falha ao disparar mensagem.',
          });
        }
      }

      return {
        total: resultados.length,
        enviados: resultados.filter((item) => item.sucesso).length,
        falhas: resultados.filter((item) => !item.sucesso).length,
        resultados,
      };
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
            nao_prometer: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 1000 },
            },
            sempre_confirmar: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 1000 },
            },
            escalar_humano_quando: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 1000 },
            },
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
        nao_prometer?: string[];
        sempre_confirmar?: string[];
        escalar_humano_quando?: string[];
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

      const configAtual = await deps.persistencia.cliente.selecionarUm<Record<string, unknown>>(
        TABELA_CONFIG_IA,
        {},
      );

      if (configAtual === null) {
        await deps.persistencia.cliente.inserirUm(TABELA_CONFIG_IA, { id: '1', ...valores });
      } else {
        await deps.persistencia.cliente.atualizarPorId(
          TABELA_CONFIG_IA,
          String(configAtual['id'] ?? '1'),
          valores,
        );
      }

      const regrasExistentes = await deps.persistencia.cliente.selecionarUm<Record<string, unknown>>(
        TABELA_REGRAS_CONVERSA,
        {},
      );

      const regrasValores: Record<string, unknown> = {};

      if (corpo.nao_prometer !== undefined) {
        regrasValores['nao_prometer'] = corpo.nao_prometer;
      }

      if (corpo.sempre_confirmar !== undefined) {
        regrasValores['sempre_confirmar'] = corpo.sempre_confirmar;
      }

      if (corpo.escalar_humano_quando !== undefined) {
        regrasValores['escalar_humano_quando'] = corpo.escalar_humano_quando;
      }

      if (Object.keys(regrasValores).length > 0) {
        if (regrasExistentes === null) {
          await deps.persistencia.cliente.inserirUm(TABELA_REGRAS_CONVERSA, {
            id: 1,
            ...regrasValores,
          });
        } else {
          await deps.persistencia.cliente.atualizarPorId(
            TABELA_REGRAS_CONVERSA,
            String(regrasExistentes['id'] ?? '1'),
            regrasValores,
          );
        }
      }

      deps.configuracao.invalidar();

      return deps.configuracao.carregar();
    },
  );
}
