import OpenAI from 'openai';

import { criarCachePerguntas } from './cache.js';
import {
  COMPONENT_NAME,
  DEFAULT_OPENAI_MODEL,
  ORIGEM_GPT,
} from './constants.js';
import { JSON_RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { gerarPerguntaPorTemplate } from './templates.js';
import type {
  CamadaPergunta,
  CachePerguntas,
  ClienteOpenAIPerguntas,
  GeradorPerguntasConfig,
  GeradorPerguntasDependencies,
  GeradorPerguntasInput,
  GeradorPerguntasOutput,
  Logger,
  RespostaGptPergunta,
} from './types.js';
import {
  ValidacaoGeradorPerguntasError,
  determinarCamada,
  gerarChaveCache,
  validarEntrada,
  validarPergunta,
  validarRespostaGpt,
  validarSaida,
} from './validators.js';

export class GeradorPerguntasError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GeradorPerguntasError';
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

export class ClienteOpenAIPerguntasImpl implements ClienteOpenAIPerguntas {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger: Logger;

  constructor(apiKey: string, logger: Logger, model: string = DEFAULT_OPENAI_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.logger = logger;
  }

  async gerarPergunta(
    input: GeradorPerguntasInput,
    camada: CamadaPergunta,
  ): Promise<RespostaGptPergunta> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.4,
      response_format: JSON_RESPONSE_SCHEMA,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input, camada) },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new GeradorPerguntasError('OpenAI retornou resposta vazia.');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new GeradorPerguntasError('OpenAI retornou JSON inválido.', { cause: error });
    }

    const validada = validarRespostaGpt(parsed);

    this.logger.debug('Pergunta gerada via GPT', {
      camada,
      perguntaLength: validada.pergunta.length,
    });

    return validada;
  }
}

export class GeradorPerguntas {
  private readonly logger: Logger;
  private readonly cache: CachePerguntas;
  private readonly openaiClient: ClienteOpenAIPerguntas;
  private readonly cacheEnabled: boolean;

  constructor(
    config: GeradorPerguntasConfig,
    dependencies: GeradorPerguntasDependencies = {},
  ) {
    this.logger = dependencies.logger ?? criarLoggerPadrao();
    this.cacheEnabled = config.cacheEnabled !== false;
    this.cache =
      dependencies.cache ??
      criarCachePerguntas(this.logger, {
        redisUrl: config.redisUrl,
        cacheEnabled: config.cacheEnabled,
        cacheTtlSeconds: config.cacheTtlSeconds,
      });
    this.openaiClient =
      dependencies.openaiClient ??
      new ClienteOpenAIPerguntasImpl(
        config.openaiApiKey,
        this.logger,
        config.openaiModel,
      );
  }

  async gerar(input: GeradorPerguntasInput): Promise<GeradorPerguntasOutput> {
    try {
      validarEntrada(input);

      const camada = determinarCamada(input.perguntasJaFeitas.length);

      this.logger.info('Iniciando geração de pergunta', {
        clienteId: input.clienteId,
        camada,
        intencao: input.intencao,
        perguntasJaFeitas: input.perguntasJaFeitas.length,
      });

      const cacheKey = gerarChaveCache(input, camada);

      if (this.cacheEnabled) {
        const cached = await this.cache.get(cacheKey);

        if (cached) {
          try {
            const saidaCache = validarSaida(cached, input.perguntasJaFeitas);

            this.logger.info('Pergunta retornada via cache', {
              camada: saidaCache.camada,
              origem: saidaCache.origem,
            });

            return saidaCache;
          } catch (error) {
            this.logger.warn('Entrada em cache inválida para contexto atual', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const saida = await this.gerarComFallback(input, camada);

      if (this.cacheEnabled) {
        await this.cache.set(cacheKey, saida);
      }

      this.logger.info('Geração de pergunta concluída', {
        camada: saida.camada,
        origem: saida.origem,
        perguntaLength: saida.pergunta.length,
      });

      return saida;
    } catch (error) {
      this.logger.error('Erro inesperado na geração de pergunta', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (
        error instanceof GeradorPerguntasError ||
        error instanceof ValidacaoGeradorPerguntasError
      ) {
        throw error;
      }

      throw new GeradorPerguntasError('Falha ao gerar pergunta.', { cause: error });
    }
  }

  async encerrar(): Promise<void> {
    await this.cache.disconnect();
  }

  private async gerarComFallback(
    input: GeradorPerguntasInput,
    camada: CamadaPergunta,
  ): Promise<GeradorPerguntasOutput> {
    try {
      const respostaGpt = await this.openaiClient.gerarPergunta(input, camada);

      try {
        validarPergunta(respostaGpt.pergunta, input.perguntasJaFeitas);

        return validarSaida(
          {
            pergunta: respostaGpt.pergunta,
            contextoEsperado: respostaGpt.contextoEsperado,
            camada,
            timestamp: new Date(),
            origem: ORIGEM_GPT,
          },
          input.perguntasJaFeitas,
        );
      } catch (error) {
        this.logger.warn('Resposta GPT inválida, acionando fallback template', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      this.logger.warn('Falha na geração via GPT, acionando fallback template', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const template = gerarPerguntaPorTemplate(input, camada);

    return validarSaida(
      {
        pergunta: template.pergunta,
        contextoEsperado: template.contextoEsperado,
        camada,
        timestamp: new Date(),
        origem: 'template',
      },
      input.perguntasJaFeitas,
    );
  }
}

export function criarGeradorPerguntas(
  config: GeradorPerguntasConfig,
  dependencies?: GeradorPerguntasDependencies,
): GeradorPerguntas {
  return new GeradorPerguntas(config, dependencies);
}
