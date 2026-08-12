export interface TravaDistribuida {
  /** Devolve true se conseguiu a trava. Nunca bloqueia esperando. */
  adquirir(nome: string, ttlSegundos: number): Promise<boolean>;
  liberar(nome: string): Promise<void>;
}

/**
 * Implementação em memória, suficiente para uma instância única e para testes.
 * Com múltiplas instâncias, use a versão apoiada no banco.
 */
export class TravaDistribuidaMemoria implements TravaDistribuida {
  private readonly travas = new Map<string, number>();
  private readonly agora: () => number;

  constructor(agora: () => number = Date.now) {
    this.agora = agora;
  }

  adquirir(nome: string, ttlSegundos: number): Promise<boolean> {
    const expiraEm = this.travas.get(nome);
    const agora = this.agora();

    if (expiraEm !== undefined && expiraEm > agora) {
      return Promise.resolve(false);
    }

    this.travas.set(nome, agora + ttlSegundos * 1000);

    return Promise.resolve(true);
  }

  liberar(nome: string): Promise<void> {
    this.travas.delete(nome);

    return Promise.resolve();
  }
}
