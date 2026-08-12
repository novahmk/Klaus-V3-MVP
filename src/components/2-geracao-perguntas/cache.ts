import { Redis } from 'ioredis';

import {
  CACHE_KEY_PREFIX,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_REDIS_URL,
  ORIGEM_CACHE,
} from './constants.js';
import type { CachePerguntas, GeradorPerguntasOutput, Logger } from './types.js';
import { validarSaida } from './validators.js';

export class CachePerguntasRedis implements CachePerguntas {
  private readonly client: Redis;
  private readonly logger: Logger;
  private readonly defaultTtlSeconds: number;
  private connected = false;

  constructor(
    logger: Logger,
    redisUrl: string = DEFAULT_REDIS_URL,
    defaultTtlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
  ) {
    this.logger = logger;
    this.defaultTtlSeconds = defaultTtlSeconds;
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.client.connect();
    this.connected = true;
  }

  private buildKey(key: string): string {
    return `${CACHE_KEY_PREFIX}${key}`;
  }

  async get(key: string): Promise<GeradorPerguntasOutput | null> {
    try {
      await this.ensureConnected();
      const raw = await this.client.get(this.buildKey(key));

      if (!raw) {
        this.logger.debug('Cache miss para geração de pergunta', { key });
        return null;
      }

      const parsed = JSON.parse(raw) as GeradorPerguntasOutput;
      const saida = validarSaida(
        {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
          origem: parsed.origem === 'gpt' ? 'gpt' : 'template',
        },
        [],
      );

      this.logger.debug('Cache hit para geração de pergunta', {
        key,
        camada: saida.camada,
      });

      return { ...saida, origem: parsed.origem };
    } catch (error) {
      this.logger.warn('Falha ao ler cache de pergunta', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async set(
    key: string,
    value: GeradorPerguntasOutput,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    try {
      await this.ensureConnected();
      const payload = JSON.stringify({
        pergunta: value.pergunta,
        contextoEsperado: value.contextoEsperado,
        camada: value.camada,
        timestamp: value.timestamp.toISOString(),
        origem: value.origem,
      });

      await this.client.setex(this.buildKey(key), ttlSeconds, payload);

      this.logger.debug('Pergunta salva no cache', {
        key,
        camada: value.camada,
        ttlSeconds,
      });
    } catch (error) {
      this.logger.warn('Falha ao salvar cache de pergunta', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.quit();
    this.connected = false;
  }
}

export class CachePerguntasMemoria implements CachePerguntas {
  private readonly store = new Map<
    string,
    { value: GeradorPerguntasOutput; expiresAt: number }
  >();

  constructor(private readonly defaultTtlSeconds: number = DEFAULT_CACHE_TTL_SECONDS) {}

  async get(key: string): Promise<GeradorPerguntasOutput | null> {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: GeradorPerguntasOutput,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export function criarCachePerguntas(
  logger: Logger,
  options: {
    redisUrl?: string;
    cacheEnabled?: boolean;
    cacheTtlSeconds?: number;
  } = {},
): CachePerguntas {
  if (options.cacheEnabled === false) {
    return new CachePerguntasMemoria(options.cacheTtlSeconds);
  }

  return new CachePerguntasRedis(logger, options.redisUrl, options.cacheTtlSeconds);
}
