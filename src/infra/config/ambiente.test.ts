import { describe, expect, it } from 'vitest';

import { AmbienteInvalidoError, carregarAmbiente } from './ambiente.js';

const ambienteValido = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key-suficientemente-longa',
  INTERNAL_API_KEY: 'chave-interna-longa-o-bastante',
  OPENAI_API_KEY: 'sk-teste',
  WASENDER_API_KEY: 'wasender-teste',
  WASENDER_WEBHOOK_SECRET: 'segredo-webhook-longo-o-bastante',
};

describe('carregarAmbiente', () => {
  it('carrega ambiente completo aplicando defaults', () => {
    const ambiente = carregarAmbiente(ambienteValido);

    expect(ambiente.supabaseUrl).toBe('https://projeto.supabase.co');
    expect(ambiente.openaiModel).toBe('gpt-4o-mini');
    expect(ambiente.port).toBe(3000);
    expect(ambiente.redisUrl).toBeNull();
  });

  it('respeita valores opcionais informados', () => {
    const ambiente = carregarAmbiente({
      ...ambienteValido,
      OPENAI_MODEL: 'gpt-4o',
      REDIS_URL: 'redis://localhost:6379',
      PORT: '8080',
      NODE_ENV: 'production',
    });

    expect(ambiente.openaiModel).toBe('gpt-4o');
    expect(ambiente.redisUrl).toBe('redis://localhost:6379');
    expect(ambiente.port).toBe(8080);
    expect(ambiente.nodeEnv).toBe('production');
  });

  it('lista todos os problemas de uma vez, não só o primeiro', () => {
    try {
      carregarAmbiente({});
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(AmbienteInvalidoError);
      const problemas = (error as AmbienteInvalidoError).problemas;
      expect(problemas).toHaveLength(6);
      expect(problemas).toContain('SUPABASE_URL não definida');
      expect(problemas).toContain('INTERNAL_API_KEY não definida');
      expect(problemas).toContain('WASENDER_API_KEY não definida');
      expect(problemas).toContain('WASENDER_WEBHOOK_SECRET não definida');
    }
  });

  it('rejeita variável presente porém vazia', () => {
    expect(() => carregarAmbiente({ ...ambienteValido, INTERNAL_API_KEY: '   ' })).toThrow(
      AmbienteInvalidoError,
    );
  });

  it('rejeita chave interna curta demais para ser real', () => {
    try {
      carregarAmbiente({ ...ambienteValido, INTERNAL_API_KEY: 'trocar' });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect((error as AmbienteInvalidoError).problemas).toContain(
        'INTERNAL_API_KEY tem menos de 16 caracteres',
      );
    }
  });

  it('rejeita SUPABASE_URL sem https', () => {
    try {
      carregarAmbiente({ ...ambienteValido, SUPABASE_URL: 'http://projeto.supabase.co' });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect((error as AmbienteInvalidoError).problemas).toContain('SUPABASE_URL deve usar https');
    }
  });

  it('rejeita SUPABASE_URL malformada', () => {
    expect(() => carregarAmbiente({ ...ambienteValido, SUPABASE_URL: 'projeto' })).toThrow(
      AmbienteInvalidoError,
    );
  });

  it('rejeita PORT não numérica', () => {
    try {
      carregarAmbiente({ ...ambienteValido, PORT: 'abc' });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect((error as AmbienteInvalidoError).problemas).toContain('PORT inválida: "abc"');
    }
  });

  it('aceita localhost em desenvolvimento', () => {
    const ambiente = carregarAmbiente({
      ...ambienteValido,
      SUPABASE_URL: 'http://localhost:54321',
    });

    expect(ambiente.supabaseUrl).toBe('http://localhost:54321');
  });
});
