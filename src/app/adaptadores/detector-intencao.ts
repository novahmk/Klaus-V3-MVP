import { detectarIntencaoPorPalavrasChave } from '../../components/1-deteccao-intencao/index.js';
import type { DetectorIntencao as DetectorComponente } from '../../components/1-deteccao-intencao/index.js';
import type {
  DetectorIntencao as PortaDetector,
  EntradaDeteccao,
} from '../../components/7-orquestracao/index.js';
import type { Intencao } from '../../components/1-deteccao-intencao/types.js';
import { comTimeout } from '../../infra/resiliencia/timeout.js';
import { Disjuntor, DisjuntorAbertoError } from '../../infra/resiliencia/disjuntor.js';

export const TIMEOUT_DETECCAO_MS = 8000;

export interface OpcoesAdaptadorDetector {
  timeoutMs?: number;
  disjuntor?: Disjuntor;
  aoDegradar?: (motivo: string) => void;
}

/**
 * Liga o Componente 1 à porta do orquestrador.
 *
 * Classificar intenção nunca pode travar a conversa: se a IA demora, falha ou
 * o disjuntor está aberto, cai para a detecção por palavras-chave. Uma
 * classificação aproximada é infinitamente melhor que um lead sem resposta.
 */
export class AdaptadorDetectorIntencao implements PortaDetector {
  private readonly detector: DetectorComponente;
  private readonly timeoutMs: number;
  private readonly disjuntor: Disjuntor;
  private readonly aoDegradar: (motivo: string) => void;

  constructor(detector: DetectorComponente, opcoes: OpcoesAdaptadorDetector = {}) {
    this.detector = detector;
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_DETECCAO_MS;
    this.disjuntor = opcoes.disjuntor ?? new Disjuntor({ nome: 'deteccao-intencao' });
    this.aoDegradar = opcoes.aoDegradar ?? (() => undefined);
  }

  async detectar(entrada: EntradaDeteccao): Promise<{ intencao: Intencao; confianca: number }> {
    try {
      const saida = await this.disjuntor.executar(() =>
        comTimeout(
          this.detector.detectar({
            mensagem: entrada.mensagem,
            historico: entrada.historico.map((mensagem) => ({
              role: mensagem.role,
              conteudo: mensagem.conteudo,
              timestamp: mensagem.timestamp,
            })),
            contexto: { leadId: entrada.leadId },
          }),
          this.timeoutMs,
          'Detecção de intenção',
        ),
      );

      return { intencao: saida.intencao, confianca: saida.confianca };
    } catch (erro) {
      const motivo =
        erro instanceof DisjuntorAbertoError
          ? 'disjuntor aberto'
          : erro instanceof Error
            ? erro.message
            : String(erro);

      this.aoDegradar(motivo);

      const fallback = detectarIntencaoPorPalavrasChave(entrada.mensagem);

      return { intencao: fallback.intencao, confianca: fallback.confianca };
    }
  }
}
