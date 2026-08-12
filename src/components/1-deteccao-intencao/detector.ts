import OpenAI from 'openai';

import {
  COMPONENT_NAME,
  DEFAULT_OPENAI_MODEL,
  ORIGEM_FALLBACK,
  ORIGEM_GPT,
} from './constants.js';
import { detectarIntencaoPorPalavrasChave } from './fallback.js';
import { JSON_RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import type {
  CacheIntencao,
  ClienteOpenAI,
  DetectorIntencaoConfig,
  EntradaDeteccaoIntencao,
  Logger,
  MensagemHistorico,
  RespostaGptIntencao,
  SaidaDeteccaoIntencao,
} from './types.js';
import { Intencao } from './types.js';
import {
  gerarChaveCache,
  mensagemEstaVazia,
  validarEntrada,
  validarRespostaGpt,
  validarSaida,
} from './validator.js';
import { criarCacheIntencao } from './cache.js';

export class DetectorIntencaoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DetectorIntencaoError';
  }
}

function criarLoggerPadrao(): Logger {
  return {
    info(message, meta) {
      console.log(JSON.stringify({ level: 'info', component: COMPONENT_NAME, message, ...meta }));
    },
    warn(message, meta) {
      console.warn(JSON.stringify({ level: 'warn', component: COMPONENT_NAME, message, ...meta }));
    },
    error(message, meta) {
      console.error(JSON.stringify({ level: 'error', component: COMPONENT_NAME, message, ...meta }));
    },
    debug(message, meta) {
      console.debug(JSON.stringify({ level: 'debug', component: COMPONENT_NAME, message, ...meta }));
    },
  };
}

export class ClienteOpenAIIntencao implements ClienteOpenAI {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger;

  constructor(apiKey: string, logger: Logger, model: string = DEFAULT_OPENAI_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.logger = logger;
  }

  async detectarIntencao(
    mensagem: string,
    historico: MensagemHistorico[],
    contexto: EntradaDeteccaoIntencao['contexto'],
  ): Promise<RespostaGptIntencao> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      response_format: JSON_RESPONSE_SCHEMA,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(mensagem, historico, contexto) },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new DetectorIntencaoError('OpenAI retornou resposta vazia.');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new DetectorIntencaoError('OpenAI retornou JSON inválido.', { cause: error });
    }

    const validada = validarRespostaGpt(parsed);

    this.logger.debug('Intenção detectada via GPT', {
      intencao: validada.intencao,
      confianca: validada.confianca,
    });

    return validada;
  }
}

export interface DetectorIntencaoDependencies {
  logger?: Logger;
  cache?: CacheIntencao;
  openaiClient?: ClienteOpenAI;
}

export class DetectorIntencao {
  private readonly logger: Logger;
  private readonly cache: CacheIntencao;
  private readonly openaiClient: ClienteOpenAI;
  private readonly cacheEnabled: boolean;

  constructor(
    config: DetectorIntencaoConfig,
    dependencies: DetectorIntencaoDependencies = {},
  ) {
    this.logger = dependencies.logger ?? criarLoggerPadrao();
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cache =
      dependencies.cache ??
      criarCacheIntencao(this.logger, {
        redisUrl: config.redisUrl,
        cacheEnabled: config.cacheEnabled,
        cacheTtlSeconds: config.cacheTtlSeconds,
      });
    this.openaiClient =
      dependencies.openaiClient ??
      new ClienteOpenAIIntencao(
        config.openaiApiKey,
        this.logger,
        config.openaiModel,
      );
  }

  async detectar(entrada: EntradaDeteccaoIntencao): Promise<SaidaDeteccaoIntencao> {
    try {
      validarEntrada(entrada);

      this.logger.info('Iniciando detecção de intenção', {
        leadId: entrada.contexto.leadId,
        mensagemLength: entrada.mensagem.length,
      });

      if (mensagemEstaVazia(entrada.mensagem)) {
        return this.finalizarSaida({
          intencao: Intencao.NAO_RESPONDEU,
          confianca: 0.98,
          motivo: 'Mensagem vazia recebida.',
          timestamp: new Date(),
          origem: ORIGEM_FALLBACK,
        });
      }

      const cacheKey = gerarChaveCache(
        entrada.mensagem,
        entrada.historico,
        entrada.contexto,
      );

      if (this.cacheEnabled) {
        const cached = await this.cache.get(cacheKey);

        if (cached) {
          this.logger.info('Detecção de intenção retornada via cache', {
            intencao: cached.intencao,
            confianca: cached.confianca,
          });
          return cached;
        }
      }

      let resultado: RespostaGptIntencao;

      try {
        resultado = await this.openaiClient.detectarIntencao(
          entrada.mensagem,
          entrada.historico,
          entrada.contexto,
        );
      } catch (error) {
        this.logger.warn('Falha na detecção via GPT, acionando fallback', {
          error: error instanceof Error ? error.message : String(error),
        });

        const fallback = detectarIntencaoPorPalavrasChave(entrada.mensagem);

        return this.finalizarSaida({
          intencao: fallback.intencao,
          confianca: fallback.confianca,
          motivo: fallback.motivo,
          timestamp: new Date(),
          origem: ORIGEM_FALLBACK,
        });
      }

      const saida = this.finalizarSaida({
        intencao: resultado.intencao,
        confianca: resultado.confianca,
        motivo: resultado.motivo,
        timestamp: new Date(),
        origem: ORIGEM_GPT,
      });

      if (this.cacheEnabled) {
        await this.cache.set(cacheKey, saida);
      }

      this.logger.info('Detecção de intenção concluída', {
        intencao: saida.intencao,
        confianca: saida.confianca,
        origem: saida.origem,
      });

      return saida;
    } catch (error) {
      this.logger.error('Erro inesperado na detecção de intenção', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof DetectorIntencaoError) {
        throw error;
      }

      throw new DetectorIntencaoError('Falha ao detectar intenção.', { cause: error });
    }
  }

  async encerrar(): Promise<void> {
    await this.cache.disconnect();
  }

  private finalizarSaida(saida: SaidaDeteccaoIntencao): SaidaDeteccaoIntencao {
    return validarSaida(saida);
  }
}

export function criarDetectorIntencao(
  config: DetectorIntencaoConfig,
  dependencies?: DetectorIntencaoDependencies,
): DetectorIntencao {
  return new DetectorIntencao(config, dependencies);
}
