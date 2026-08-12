import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from './cliente-memoria.js';
import { TABELA_FOLLOWUP_CONFIG, TABELA_FOLLOWUP_MODELOS } from './constants.js';
import { ValidacaoPersistenciaError } from './errors.js';
import {
  carregarFollowupConfig,
  carregarModelosAtivos,
  converterHorarioEmMinutos,
  dentroDaJanelaDeEnvio,
  selecionarProximoModelo,
} from './followup.js';
import type { FollowupConfig, PersistenciaDependencies } from './types.js';

function criarDeps(cliente: ClienteMemoria): PersistenciaDependencies {
  return { cliente };
}

const configPadrao: FollowupConfig = {
  max_followups: 3,
  intervalo_dias: 2,
  parar_aos_fins_de_semana: true,
  horario_inicio: '09:00:00',
  horario_fim: '18:00:00',
};

describe('converterHorarioEmMinutos', () => {
  it('converte TIME do Postgres', () => {
    expect(converterHorarioEmMinutos('09:00:00')).toBe(540);
  });

  it('aceita HH:MM sem segundos', () => {
    expect(converterHorarioEmMinutos('18:30')).toBe(1110);
  });

  it('rejeita valor numérico do schema antigo', () => {
    expect(() => converterHorarioEmMinutos('9')).toThrow(ValidacaoPersistenciaError);
  });

  it('rejeita hora fora do intervalo', () => {
    expect(() => converterHorarioEmMinutos('25:00:00')).toThrow(ValidacaoPersistenciaError);
  });
});

describe('carregarFollowupConfig', () => {
  it('lê o singleton do banco sem filtrar por cliente_id', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_FOLLOWUP_CONFIG]: [
        {
          max_followups: 5,
          intervalo_dias: 3,
          parar_aos_fins_de_semana: false,
          horario_inicio: '08:00:00',
          horario_fim: '20:00:00',
        },
      ],
    });

    const config = await carregarFollowupConfig(criarDeps(cliente));

    expect(config.max_followups).toBe(5);
    expect(config.horario_inicio).toBe('08:00:00');
  });

  it('cai no padrão quando a tabela está vazia', async () => {
    const cliente = new ClienteMemoria({ [TABELA_FOLLOWUP_CONFIG]: [] });

    const config = await carregarFollowupConfig(criarDeps(cliente));

    expect(config.max_followups).toBe(3);
  });
});

describe('carregarModelosAtivos', () => {
  it('retorna apenas modelos ativos ordenados por ordem', async () => {
    const cliente = new ClienteMemoria({
      [TABELA_FOLLOWUP_MODELOS]: [
        { ordem: 2, titulo: 'Segundo', mensagem: 'B', ativo: true },
        { ordem: 1, titulo: 'Primeiro', mensagem: 'A', ativo: true },
        { ordem: 3, titulo: 'Desativado', mensagem: 'C', ativo: false },
      ],
    });

    const modelos = await carregarModelosAtivos(criarDeps(cliente));

    expect(modelos.map((modelo) => modelo.titulo)).toEqual(['Primeiro', 'Segundo']);
  });
});

describe('dentroDaJanelaDeEnvio', () => {
  it('permite envio dentro do horário comercial em dia útil', () => {
    const quarta = new Date(2026, 7, 12, 10, 0, 0);

    expect(dentroDaJanelaDeEnvio(configPadrao, quarta)).toBe(true);
  });

  it('bloqueia envio antes do horário de início', () => {
    const quarta = new Date(2026, 7, 12, 8, 59, 0);

    expect(dentroDaJanelaDeEnvio(configPadrao, quarta)).toBe(false);
  });

  it('bloqueia envio depois do horário de fim', () => {
    const quarta = new Date(2026, 7, 12, 18, 1, 0);

    expect(dentroDaJanelaDeEnvio(configPadrao, quarta)).toBe(false);
  });

  it('bloqueia fim de semana quando configurado', () => {
    const domingo = new Date(2026, 7, 16, 10, 0, 0);

    expect(dentroDaJanelaDeEnvio(configPadrao, domingo)).toBe(false);
  });

  it('permite fim de semana quando a trava está desligada', () => {
    const domingo = new Date(2026, 7, 16, 10, 0, 0);
    const config: FollowupConfig = { ...configPadrao, parar_aos_fins_de_semana: false };

    expect(dentroDaJanelaDeEnvio(config, domingo)).toBe(true);
  });
});

describe('selecionarProximoModelo', () => {
  const modelos = [
    { ordem: 1, titulo: 'Primeiro', mensagem: 'A', ativo: true },
    { ordem: 2, titulo: 'Segundo', mensagem: 'B', ativo: true },
  ];

  it('escolhe o modelo correspondente ao número de envios', () => {
    expect(selecionarProximoModelo(modelos, 1, configPadrao)?.titulo).toBe('Segundo');
  });

  it('retorna null ao atingir max_followups', () => {
    const config: FollowupConfig = { ...configPadrao, max_followups: 1 };

    expect(selecionarProximoModelo(modelos, 1, config)).toBeNull();
  });

  it('retorna null quando acabam os modelos', () => {
    expect(selecionarProximoModelo(modelos, 2, configPadrao)).toBeNull();
  });
});
