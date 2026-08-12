import { describe, expect, it } from 'vitest';

import { Intencao } from '../../components/1-deteccao-intencao/types.js';
import { decidirProximoEstagio } from './maquina-estados.js';
import type { SinaisConversa } from './maquina-estados.js';

function sinais(parcial: Partial<SinaisConversa> = {}): SinaisConversa {
  return {
    estagioAtual: 'abertura',
    intencao: Intencao.DEMONSTRA_INTERESSE,
    controleManual: false,
    optOut: false,
    mensagensDoLead: 1,
    score: null,
    limiarHandoff: 70,
    horasSemResposta: null,
    horasParaFollowup: 24,
    ...parcial,
  };
}

describe('trava de controle manual', () => {
  it('congela o estágio e impede qualquer envio', () => {
    const decisao = decidirProximoEstagio(
      sinais({ controleManual: true, estagioAtual: 'descoberta' }),
    );

    expect(decisao.estagio).toBe('descoberta');
    expect(decisao.acoes.responder).toBe(false);
    expect(decisao.acoes.dispararFollowup).toBe(false);
  });

  it('tem precedência sobre lead qualificado', () => {
    const decisao = decidirProximoEstagio(
      sinais({ controleManual: true, score: 95, estagioAtual: 'qualificacao' }),
    );

    expect(decisao.estagio).toBe('qualificacao');
    expect(decisao.acoes.notificarVendas).toBe(false);
  });

  it('impede follow-up de lead sumido', () => {
    const decisao = decidirProximoEstagio(
      sinais({ controleManual: true, intencao: null, horasSemResposta: 72 }),
    );

    expect(decisao.acoes.dispararFollowup).toBe(false);
  });
});

describe('encerramento negativo', () => {
  it('encerra e suspende follow-up quando o lead recusa', () => {
    const decisao = decidirProximoEstagio(sinais({ intencao: Intencao.NAO_INTERESSADO }));

    expect(decisao.estagio).toBe('encerrado');
    expect(decisao.acoes.suspenderFollowup).toBe(true);
    expect(decisao.acoes.responder).toBe(false);
  });

  it('respeita opt-out já registrado no lead', () => {
    const decisao = decidirProximoEstagio(sinais({ optOut: true, score: 99 }));

    expect(decisao.estagio).toBe('encerrado');
    expect(decisao.acoes.notificarVendas).toBe(false);
  });

  it('não reabre conversa encerrada', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'encerrado', intencao: Intencao.QUER_AGENDAR }),
    );

    expect(decisao.estagio).toBe('encerrado');
    expect(decisao.acoes.responder).toBe(false);
  });

  it('opt-out vence follow-up pendente', () => {
    const decisao = decidirProximoEstagio(
      sinais({ optOut: true, intencao: null, horasSemResposta: 100 }),
    );

    expect(decisao.acoes.dispararFollowup).toBe(false);
    expect(decisao.acoes.suspenderFollowup).toBe(true);
  });
});

describe('handoff por score', () => {
  it('dispara notificação ao cruzar o limiar', () => {
    const decisao = decidirProximoEstagio(sinais({ score: 70, estagioAtual: 'qualificacao' }));

    expect(decisao.estagio).toBe('handoff');
    expect(decisao.acoes.notificarVendas).toBe(true);
  });

  it('não dispara abaixo do limiar', () => {
    const decisao = decidirProximoEstagio(sinais({ score: 69, estagioAtual: 'qualificacao' }));

    expect(decisao.estagio).not.toBe('handoff');
  });

  it('permanece em handoff aguardando o humano', () => {
    const decisao = decidirProximoEstagio(sinais({ estagioAtual: 'handoff', score: 10 }));

    expect(decisao.estagio).toBe('handoff');
    expect(decisao.acoes.responder).toBe(false);
  });
});

describe('objeção', () => {
  it('interrompe qualquer estágio', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'descoberta', intencao: Intencao.TEM_OBJECAO }),
    );

    expect(decisao.estagio).toBe('objecao');
    expect(decisao.acoes.responder).toBe(true);
  });

  it('fecha o estágio quando o lead volta a demonstrar interesse', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'objecao', intencao: Intencao.QUER_AGENDAR }),
    );

    expect(decisao.estagio).toBe('qualificacao');
    expect(decisao.motivo).toContain('Objeção resolvida');
  });

  it('permanece em objeção enquanto não houver sinal positivo', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'objecao', intencao: Intencao.NAO_RESPONDEU }),
    );

    expect(decisao.estagio).toBe('objecao');
  });
});

describe('ausência de resposta', () => {
  it('dispara follow-up após o intervalo configurado', () => {
    const decisao = decidirProximoEstagio(
      sinais({ intencao: null, horasSemResposta: 30, horasParaFollowup: 24 }),
    );

    expect(decisao.estagio).toBe('followup');
    expect(decisao.acoes.dispararFollowup).toBe(true);
  });

  it('não dispara antes do intervalo', () => {
    const decisao = decidirProximoEstagio(
      sinais({ intencao: null, horasSemResposta: 5, horasParaFollowup: 24 }),
    );

    expect(decisao.acoes.dispararFollowup).toBe(false);
  });

  it('mensagem inclassificável não conta como ausência de resposta', () => {
    const decisao = decidirProximoEstagio(
      sinais({ intencao: Intencao.NAO_RESPONDEU, estagioAtual: 'descoberta' }),
    );

    expect(decisao.estagio).toBe('descoberta');
    expect(decisao.acoes.dispararFollowup).toBe(false);
    expect(decisao.acoes.responder).toBe(true);
  });
});

describe('avanço normal do funil', () => {
  it('abertura avança para descoberta com intenção identificada', () => {
    const decisao = decidirProximoEstagio(sinais({ estagioAtual: 'abertura' }));

    expect(decisao.estagio).toBe('descoberta');
  });

  it('descoberta avança para qualificação após trocas suficientes', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'descoberta', mensagensDoLead: 2 }),
    );

    expect(decisao.estagio).toBe('qualificacao');
  });

  it('descoberta permanece com poucas trocas', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'descoberta', mensagensDoLead: 1 }),
    );

    expect(decisao.estagio).toBe('descoberta');
  });

  it('lead que responde ao follow-up volta para descoberta', () => {
    const decisao = decidirProximoEstagio(
      sinais({ estagioAtual: 'followup', intencao: Intencao.QUER_MAIS_INFO }),
    );

    expect(decisao.estagio).toBe('descoberta');
  });
});
