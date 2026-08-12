import OpenAI from 'openai';

import { gerarResposta } from '../../components/5-geracao-resposta/index.js';
import type {
  ClienteIAResposta,
  EntradaGeracaoResposta,
  OrigemResposta,
} from '../../components/5-geracao-resposta/index.js';
import type { EntradaGerador, GeradorResposta } from '../../components/7-orquestracao/index.js';
import { Disjuntor, DisjuntorAbertoError } from '../../infra/resiliencia/disjuntor.js';
import { comTimeout } from '../../infra/resiliencia/timeout.js';

export const TIMEOUT_GERACAO_MS = 20_000;
export const MAX_TOKENS_RESPOSTA = 400;

/**
 * Resposta usada quando a IA está indisponível.
 *
 * Prometer nada e escalar para humano é o único comportamento seguro aqui:
 * inventar conteúdo sem o modelo seria pior que admitir a demora.
 */
export const RESPOSTA_DEGRADADA =
  'Recebi sua mensagem! Vou verificar com o time e te retorno em instantes.';

function mapearPapel(role: 'lead' | 'klaus' | 'system'): 'user' | 'assistant' | 'system' {
  if (role === 'lead') {
    return 'user';
  }

  return role === 'klaus' ? 'assistant' : 'system';
}

/**
 * Descreve a falha preservando a causa raiz.
 *
 * O Componente 5 embrulha erros da IA numa mensagem genérica; sem desempacotar
 * a causa, o log diria apenas "falha ao gerar resposta" e esconderia se foi
 * rate limit, timeout ou chave inválida — justamente o que se precisa saber.
 */
function descreverErro(erro: unknown): string {
  if (erro instanceof DisjuntorAbertoError) {
    return 'disjuntor aberto';
  }

  if (erro instanceof Error) {
    return erro.cause instanceof Error ? `${erro.message} (${erro.cause.message})` : erro.message;
  }

  return String(erro);
}

/** Implementação da porta do Componente 5 usando a API da OpenAI. */
export class ClienteIARespostaOpenAI implements ClienteIAResposta {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async gerarResposta(entrada: EntradaGeracaoResposta): Promise<string> {
    const resposta = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: MAX_TOKENS_RESPOSTA,
      messages: [
        { role: 'system', content: entrada.sistema },
        ...entrada.historico.map((mensagem) => ({
          role: mapearPapel(mensagem.role),
          content: mensagem.conteudo,
        })),
        { role: 'user' as const, content: entrada.mensagem },
      ],
    });

    return resposta.choices[0]?.message.content ?? '';
  }
}

export interface OpcoesAdaptadorGerador {
  timeoutMs?: number;
  disjuntor?: Disjuntor;
  aoDegradar?: (motivo: string) => void;
  respostaDegradada?: string;
}

/**
 * Liga o Componente 5 à porta do orquestrador, com timeout e disjuntor.
 *
 * O lead nunca fica sem resposta por falha de terceiro: se a IA não responde,
 * enviamos uma mensagem de espera e a conversa segue viva.
 */
export class AdaptadorGeradorResposta implements GeradorResposta {
  private readonly clienteIA: ClienteIAResposta;
  private readonly timeoutMs: number;
  private readonly disjuntor: Disjuntor;
  private readonly aoDegradar: (motivo: string) => void;
  private readonly respostaDegradada: string;

  constructor(clienteIA: ClienteIAResposta, opcoes: OpcoesAdaptadorGerador = {}) {
    this.clienteIA = clienteIA;
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_GERACAO_MS;
    this.disjuntor = opcoes.disjuntor ?? new Disjuntor({ nome: 'geracao-resposta' });
    this.aoDegradar = opcoes.aoDegradar ?? (() => undefined);
    this.respostaDegradada = opcoes.respostaDegradada ?? RESPOSTA_DEGRADADA;
  }

  async gerar(entrada: EntradaGerador): Promise<{ resposta: string; origem: OrigemResposta }> {
    try {
      const saida = await this.disjuntor.executar(() =>
        comTimeout(
          gerarResposta(
            { clienteIA: this.clienteIA },
            {
              mensagem: entrada.mensagem,
              sistema: entrada.sistema,
              historico: entrada.historico.map((mensagem) => ({
                role: mensagem.role,
                conteudo: mensagem.conteudo,
              })),
              ...(entrada.abordagem === undefined ? {} : { abordagem: entrada.abordagem }),
            },
          ),
          this.timeoutMs,
          'Geração de resposta',
        ),
      );

      return { resposta: saida.resposta, origem: saida.origem };
    } catch (erro) {
      this.aoDegradar(descreverErro(erro));

      return { resposta: this.respostaDegradada, origem: 'gpt' };
    }
  }
}
