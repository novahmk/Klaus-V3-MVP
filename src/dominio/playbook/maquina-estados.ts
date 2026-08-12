import { Intencao } from '../../components/1-deteccao-intencao/types.js';
import { ESTAGIO_INICIAL } from './estagios.js';
import type { Estagio } from './estagios.js';

export const MINIMO_TROCAS_DESCOBERTA = 2;

/** Intenções que sinalizam que a objeção deixou de bloquear a conversa. */
const INTENCOES_POSITIVAS: readonly Intencao[] = [
  Intencao.QUER_AGENDAR,
  Intencao.DEMONSTRA_INTERESSE,
  Intencao.QUER_MAIS_INFO,
];

export interface SinaisConversa {
  estagioAtual: Estagio;
  /** Intenção da mensagem recebida agora. `null` quando não houve mensagem. */
  intencao: Intencao | null;
  controleManual: boolean;
  optOut: boolean;
  mensagensDoLead: number;
  score: number | null;
  limiarHandoff: number;
  /** Horas desde a última mensagem do lead. `null` se ele nunca respondeu. */
  horasSemResposta: number | null;
  horasParaFollowup: number;
}

export interface AcoesConversa {
  responder: boolean;
  notificarVendas: boolean;
  dispararFollowup: boolean;
  suspenderFollowup: boolean;
}

export interface DecisaoConversa {
  estagio: Estagio;
  motivo: string;
  acoes: AcoesConversa;
}

const SEM_ACAO: AcoesConversa = {
  responder: false,
  notificarVendas: false,
  dispararFollowup: false,
  suspenderFollowup: false,
};

function decisao(
  estagio: Estagio,
  motivo: string,
  acoes: Partial<AcoesConversa> = {},
): DecisaoConversa {
  return { estagio, motivo, acoes: { ...SEM_ACAO, ...acoes } };
}

/**
 * Máquina de estados determinística do playbook.
 *
 * A ordem de avaliação é a própria regra de negócio e é intencional:
 * controle manual e opt-out vêm antes de tudo porque são travas, não etapas.
 */
export function decidirProximoEstagio(sinais: SinaisConversa): DecisaoConversa {
  // 1. Vendedor assumiu: nada avança, nada é enviado, follow-up incluído.
  if (sinais.controleManual) {
    return decisao(sinais.estagioAtual, 'Controle manual ativo: IA pausada.');
  }

  // 2. Opt-out é definitivo e tem precedência sobre qualquer oportunidade.
  if (sinais.optOut || sinais.intencao === Intencao.NAO_INTERESSADO) {
    return decisao('encerrado', 'Lead pediu para não ser mais contatado.', {
      suspenderFollowup: true,
    });
  }

  if (sinais.estagioAtual === 'encerrado') {
    return decisao('encerrado', 'Conversa já encerrada.');
  }

  // 3. Lead qualificado vai para humano, independentemente do estágio.
  if (sinais.score !== null && sinais.score >= sinais.limiarHandoff) {
    return decisao('handoff', `Score ${sinais.score} atingiu o limiar ${sinais.limiarHandoff}.`, {
      notificarVendas: true,
    });
  }

  if (sinais.estagioAtual === 'handoff') {
    return decisao('handoff', 'Aguardando atendimento humano.');
  }

  // 4. Objeção pode surgir a qualquer momento e interrompe o fluxo normal.
  if (sinais.intencao === Intencao.TEM_OBJECAO) {
    return decisao('objecao', 'Objeção detectada na mensagem atual.', { responder: true });
  }

  // 5. Critério explícito de objeção resolvida: o lead voltou a sinalizar
  //    interesse. Sem isso o estágio nunca fechava.
  if (sinais.estagioAtual === 'objecao') {
    if (sinais.intencao !== null && INTENCOES_POSITIVAS.includes(sinais.intencao)) {
      return decisao('qualificacao', 'Objeção resolvida: lead voltou a demonstrar interesse.', {
        responder: true,
      });
    }

    return decisao('objecao', 'Objeção ainda em aberto.', { responder: sinais.intencao !== null });
  }

  // 6. Ausência de resposta é estado temporal, não intenção classificada.
  if (
    sinais.intencao === null &&
    sinais.horasSemResposta !== null &&
    sinais.horasSemResposta >= sinais.horasParaFollowup
  ) {
    return decisao('followup', 'Lead sem resposta além do intervalo configurado.', {
      dispararFollowup: true,
    });
  }

  if (sinais.intencao === null) {
    return decisao(sinais.estagioAtual, 'Sem mensagem nova para processar.');
  }

  // 7. Mensagem inclassificável não avança o estágio, mas merece resposta.
  if (sinais.intencao === Intencao.NAO_RESPONDEU) {
    return decisao(sinais.estagioAtual, 'Mensagem não classificável: estágio mantido.', {
      responder: true,
    });
  }

  if (sinais.estagioAtual === 'abertura' || sinais.estagioAtual === 'followup') {
    return decisao('descoberta', 'Intenção identificada: iniciando descoberta.', {
      responder: true,
    });
  }

  if (
    sinais.estagioAtual === 'descoberta' &&
    sinais.mensagensDoLead >= MINIMO_TROCAS_DESCOBERTA
  ) {
    return decisao('qualificacao', 'Trocas suficientes na descoberta.', { responder: true });
  }

  return decisao(sinais.estagioAtual, 'Continuando no estágio atual.', { responder: true });
}

export function estagioInicial(): Estagio {
  return ESTAGIO_INICIAL;
}
