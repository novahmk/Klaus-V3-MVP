import { Redis } from 'ioredis';

import {
  CACHE_KEY_PREFIX,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_REDIS_URL,
  ORIGEM_CACHE,
} from './constants.js';
import type { CacheIntencao, Logger, SaidaDeteccaoIntencao } from './types.js';
import { validarSaida } from './validator.js';

export class CacheIntencaoRedis implements CacheIntencao {
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

  async get(key: string): Promise<SaidaDeteccaoIntencao | null> {
    try {
      await this.ensureConnected();
      const raw = await this.client.get(this.buildKey(key));

      if (!raw) {
        this.logger.debug('Cache miss para detecção de intenção', { key });
        return null;
      }

      const parsed = JSON.parse(raw) as SaidaDeteccaoIntencao;
      const saida = validarSaida({
        ...parsed,
        timestamp: new Date(parsed.timestamp),
        origem: ORIGEM_CACHE,
      });

      this.logger.debug('Cache hit para detecção de intenção', {
        key,
        intencao: saida.intencao,
      });

      return saida;
    } catch (error) {
      this.logger.warn('Falha ao ler cache de intenção', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async set(
    key: string,
    value: SaidaDeteccaoIntencao,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    try {
      await this.ensureConnected();
      const payload = JSON.stringify({
        intencao: value.intencao,
        confianca: value.confianca,
        motivo: value.motivo,
        timestamp: value.timestamp.toISOString(),
        origem: ORIGEM_CACHE,
      });

      await this.client.setex(this.buildKey(key), ttlSeconds, payload);

      this.logger.debug('Resultado de intenção salvo no cache', {
        key,
        intencao: value.intencao,
        ttlSeconds,
      });
    } catch (error) {
      this.logger.warn('Falha ao salvar cache de intenção', {
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

export class CacheIntencaoMemoria implements CacheIntencao {
  private readonly store = new Map<
    string,
    { value: SaidaDeteccaoIntencao; expiresAt: number }
  >();

  constructor(private readonly defaultTtlSeconds: number = DEFAULT_CACHE_TTL_SECONDS) {}

  async get(key: string): Promise<SaidaDeteccaoIntencao | null> {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return {
      ...entry.value,
      origem: ORIGEM_CACHE,
    };
  }

  async set(
    key: string,
    value: SaidaDeteccaoIntencao,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    this.store.set(key, {
      value: {
        ...value,
        origem: ORIGEM_CACHE,
      },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export function criarCacheIntencao(
  logger: Logger,
  options: {
    redisUrl?: string;
    cacheEnabled?: boolean;
    cacheTtlSeconds?: number;
  } = {},
): CacheIntencao {
  if (options.cacheEnabled === false) {
    return new CacheIntencaoMemoria(options.cacheTtlSeconds);
  }

  return new CacheIntencaoRedis(
    logger,
    options.redisUrl,
    options.cacheTtlSeconds,
  );
}
