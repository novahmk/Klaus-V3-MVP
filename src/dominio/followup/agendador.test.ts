import { describe, expect, it, vi } from 'vitest';

import { ClienteMemoria } from '../../infra/persistencia/cliente-memoria.js';
import {
  TABELA_FOLLOWUP_CONFIG,
  TABELA_FOLLOWUP_MODELOS,
  TABELA_LEADS,
  TABELA_MENSAGENS,
} from '../../infra/persistencia/constants.js';
import { TravaDistribuidaMemoria } from '../../infra/resiliencia/trava-distribuida.js';
import {
  TABELA_FOLLOWUP_ENVIOS,
  executarCicloFollowup,
  intervaloCumprido,
  podeReceberFollowup,
} from './agendador.js';
import type { DependenciasFollowup } from './agendador.js';

// Quarta-feira, 10h — dia útil dentro da janela padrão.
const AGORA = new Date(2026, 7, 12, 10, 0, 0);
const HA_TRES_DIAS = new Date(2026, 7, 9, 10, 0, 0).toISOString();

function lead(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    telefone: '5511999998888',
    nome: 'Ana',
    controle_manual: false,
    opt_out: false,
    estagio: 'descoberta',
    ultima_interacao: HA_TRES_DIAS,
    ...extra,
  };
}

function criarCliente(leads: Record<string, unknown>[]): ClienteMemoria {
  return new ClienteMemoria({
    [TABELA_LEADS]: leads,
    [TABELA_MENSAGENS]: [],
    [TABELA_FOLLOWUP_ENVIOS]: [],
    [TABELA_FOLLOWUP_CONFIG]: [
      {
        max_followups: 3,
        intervalo_dias: 2,
        parar_aos_fins_de_semana: true,
        horario_inicio: '09:00:00',
        horario_fim: '18:00:00',
      },
    ],
    [TABELA_FOLLOWUP_MODELOS]: [
      { ordem: 1, titulo: 'Primeiro', mensagem: 'Ainda tem interesse?', ativo: true },
      { ordem: 2, titulo: 'Segundo', mensagem: 'Posso ajudar em algo?', ativo: true },
    ],
  });
}

function criarDeps(
  cliente: ClienteMemoria,
  enviar = vi.fn().mockResolvedValue(undefined),
): DependenciasFollowup & { enviar: ReturnType<typeof vi.fn> } {
  return {
    persistencia: { cliente },
    trava: new TravaDistribuidaMemoria(),
    enviar,
    agora: () => AGORA,
  };
}

describe('podeReceberFollowup', () => {
  it('bloqueia lead sob controle manual', () => {
    expect(podeReceberFollowup(lead({ controle_manual: true }) as never)).toBe(false);
  });

  it('bloqueia lead com opt-out', () => {
    expect(podeReceberFollowup(lead({ opt_out: true }) as never)).toBe(false);
  });

  it('bloqueia conversa encerrada', () => {
    expect(podeReceberFollowup(lead({ estagio: 'encerrado' }) as never)).toBe(false);
  });

  it('bloqueia lead já em handoff', () => {
    expect(podeReceberFollowup(lead({ estagio: 'handoff' }) as never)).toBe(false);
  });

  it('permite lead comum', () => {
    expect(podeReceberFollowup(lead() as never)).toBe(true);
  });
});

describe('intervaloCumprido', () => {
  const config = {
    max_followups: 3,
    intervalo_dias: 2,
    parar_aos_fins_de_semana: true,
    horario_inicio: '09:00:00',
    horario_fim: '18:00:00',
  };

  it('aceita lead parado além do intervalo', () => {
    expect(intervaloCumprido(lead() as never, config, AGORA)).toBe(true);
  });

  it('recusa lead que interagiu há pouco', () => {
    const recente = new Date(2026, 7, 12, 8, 0, 0).toISOString();

    expect(intervaloCumprido(lead({ ultima_interacao: recente }) as never, config, AGORA)).toBe(
      false,
    );
  });
});

describe('executarCicloFollowup', () => {
  it('envia o primeiro follow-up e registra o envio', async () => {
    const cliente = criarCliente([lead()]);
    const deps = criarDeps(cliente);

    const resultado = await executarCicloFollowup(deps);

    expect(resultado.enviados).toBe(1);
    expect(deps.enviar).toHaveBeenCalledWith('5511999998888', 'Ainda tem interesse?');
    expect(cliente.linhas(TABELA_FOLLOWUP_ENVIOS)).toHaveLength(1);
  });

  it('grava a mensagem enviada na conversa', async () => {
    const cliente = criarCliente([lead()]);

    await executarCicloFollowup(criarDeps(cliente));

    expect(cliente.linhas(TABELA_MENSAGENS)).toHaveLength(1);
    expect(cliente.linhas(TABELA_MENSAGENS)[0]?.['direcao']).toBe('saida');
  });

  it('não repete o mesmo follow-up: o ciclo seguinte avança para o próximo modelo', async () => {
    const cliente = criarCliente([lead()]);
    const enviar = vi.fn().mockResolvedValue(undefined);

    await executarCicloFollowup(criarDeps(cliente, enviar));

    // Sem avançar o tempo não haveria segundo envio: o próprio follow-up
    // atualiza `ultima_interacao` e reinicia a contagem do intervalo.
    // 17/08/2026 é segunda — 15 e 16 caem no fim de semana, que é bloqueado.
    const proximaSegunda = new Date(2026, 7, 17, 10, 0, 0);
    await executarCicloFollowup({
      ...criarDeps(cliente, enviar),
      agora: () => proximaSegunda,
    });

    expect(enviar).toHaveBeenNthCalledWith(2, '5511999998888', 'Posso ajudar em algo?');
    expect(cliente.linhas(TABELA_FOLLOWUP_ENVIOS)).toHaveLength(2);
  });

  it('não envia de novo antes de cumprir o intervalo', async () => {
    const cliente = criarCliente([lead()]);
    const enviar = vi.fn().mockResolvedValue(undefined);

    await executarCicloFollowup(criarDeps(cliente, enviar));
    await executarCicloFollowup(criarDeps(cliente, enviar));

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('para ao esgotar os modelos ativos', async () => {
    const cliente = criarCliente([lead()]);
    const enviar = vi.fn().mockResolvedValue(undefined);
    // Todos dias úteis: 12 (qua), 17 (seg), 20 (qui), 24 (seg).
    const dias = [12, 17, 20, 24];

    for (const dia of dias) {
      await executarCicloFollowup({
        ...criarDeps(cliente, enviar),
        agora: () => new Date(2026, 7, dia, 10, 0, 0),
      });
    }

    // Só existem 2 modelos ativos.
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('não envia para lead com opt-out', async () => {
    const cliente = criarCliente([lead({ opt_out: true })]);
    const deps = criarDeps(cliente);

    const resultado = await executarCicloFollowup(deps);

    expect(resultado.enviados).toBe(0);
    expect(deps.enviar).not.toHaveBeenCalled();
  });

  it('não envia para lead sob controle manual', async () => {
    const cliente = criarCliente([lead({ controle_manual: true })]);
    const deps = criarDeps(cliente);

    await executarCicloFollowup(deps);

    expect(deps.enviar).not.toHaveBeenCalled();
  });

  it('não envia fora da janela de horário', async () => {
    const cliente = criarCliente([lead()]);
    const deps = { ...criarDeps(cliente), agora: () => new Date(2026, 7, 12, 22, 0, 0) };

    const resultado = await executarCicloFollowup(deps);

    expect(resultado.executou).toBe(false);
    expect(resultado.motivo).toContain('janela');
  });

  it('não envia no fim de semana quando configurado', async () => {
    const cliente = criarCliente([lead()]);
    const domingo = new Date(2026, 7, 16, 10, 0, 0);
    const deps = { ...criarDeps(cliente), agora: () => domingo };

    const resultado = await executarCicloFollowup(deps);

    expect(resultado.executou).toBe(false);
  });

  it('não roda quando outro ciclo já tem a trava', async () => {
    const cliente = criarCliente([lead()]);
    const trava = new TravaDistribuidaMemoria();
    await trava.adquirir('followup', 120);

    const deps = { ...criarDeps(cliente), trava };
    const resultado = await executarCicloFollowup(deps);

    expect(resultado.executou).toBe(false);
    expect(resultado.motivo).toContain('andamento');
  });

  it('libera a trava ao terminar, mesmo com falha de envio', async () => {
    const cliente = criarCliente([lead()]);
    const trava = new TravaDistribuidaMemoria();
    const deps = {
      ...criarDeps(cliente, vi.fn().mockRejectedValue(new Error('WaSender fora'))),
      trava,
    };

    await executarCicloFollowup(deps);

    await expect(trava.adquirir('followup', 120)).resolves.toBe(true);
  });

  it('não reenvia follow-up cujo envio falhou, para não arriscar mensagem duplicada', async () => {
    const cliente = criarCliente([lead()]);
    const enviar = vi.fn().mockRejectedValueOnce(new Error('falha')).mockResolvedValue(undefined);

    await executarCicloFollowup(criarDeps(cliente, enviar));
    await executarCicloFollowup({
      ...criarDeps(cliente, enviar),
      agora: () => new Date(2026, 7, 17, 10, 0, 0),
    });

    expect(enviar).toHaveBeenNthCalledWith(2, '5511999998888', 'Posso ajudar em algo?');
  });
});
