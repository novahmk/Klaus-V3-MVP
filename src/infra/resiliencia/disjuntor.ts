export type EstadoDisjuntor = 'fechado' | 'aberto' | 'meio-aberto';

export class DisjuntorAbertoError extends Error {
  constructor(nome: string) {
    super(`Disjuntor "${nome}" está aberto: dependência indisponível.`);
    this.name = 'DisjuntorAbertoError';
  }
}

export interface OpcoesDisjuntor {
  nome: string;
  limiteFalhas?: number;
  tempoDeReaberturaMs?: number;
  agora?: () => number;
}

export const LIMITE_FALHAS_PADRAO = 5;
export const TEMPO_REABERTURA_PADRAO_MS = 30_000;

/**
 * Circuit breaker.
 *
 * Depois de N falhas seguidas, para de tentar por um tempo e falha rápido.
 * Sem isso, uma dependência lenta é pior que uma fora do ar: cada requisição
 * fica esperando o timeout e a fila inteira empaca.
 *
 * Quem chama deve tratar `DisjuntorAbertoError` como "use o caminho
 * degradado", nunca como erro fatal.
 */
export class Disjuntor {
  private readonly nome: string;
  private readonly limiteFalhas: number;
  private readonly tempoDeReaberturaMs: number;
  private readonly agora: () => number;

  private falhasSeguidas = 0;
  private abertoAte = 0;

  constructor(opcoes: OpcoesDisjuntor) {
    this.nome = opcoes.nome;
    this.limiteFalhas = opcoes.limiteFalhas ?? LIMITE_FALHAS_PADRAO;
    this.tempoDeReaberturaMs = opcoes.tempoDeReaberturaMs ?? TEMPO_REABERTURA_PADRAO_MS;
    this.agora = opcoes.agora ?? Date.now;
  }

  get estado(): EstadoDisjuntor {
    if (this.abertoAte === 0) {
      return 'fechado';
    }

    return this.agora() >= this.abertoAte ? 'meio-aberto' : 'aberto';
  }

  async executar<T>(acao: () => Promise<T>): Promise<T> {
    if (this.estado === 'aberto') {
      throw new DisjuntorAbertoError(this.nome);
    }

    try {
      const resultado = await acao();

      this.registrarSucesso();

      return resultado;
    } catch (erro) {
      this.registrarFalha();

      throw erro;
    }
  }

  private registrarSucesso(): void {
    this.falhasSeguidas = 0;
    this.abertoAte = 0;
  }

  private registrarFalha(): void {
    this.falhasSeguidas += 1;

    if (this.falhasSeguidas >= this.limiteFalhas) {
      this.abertoAte = this.agora() + this.tempoDeReaberturaMs;
    }
  }
}
