import type { FilaMemoria, Processador } from './fila-memoria.js';

/**
 * Drena a fila fora do ciclo de request.
 *
 * O webhook só enfileira e responde; quem trabalha é este componente. Uma
 * única drenagem roda por vez — processar em paralelo geraria duas respostas
 * para o mesmo lead e corrida de estágio.
 */
export class Trabalhador<T> {
  private readonly fila: FilaMemoria<T>;
  private readonly processador: Processador<T>;
  private readonly aoFalhar: (erro: unknown) => void;
  private emExecucao = false;
  private drenagemAtual: Promise<void> = Promise.resolve();

  constructor(
    fila: FilaMemoria<T>,
    processador: Processador<T>,
    aoFalhar: (erro: unknown) => void = () => undefined,
  ) {
    this.fila = fila;
    this.processador = processador;
    this.aoFalhar = aoFalhar;
  }

  /** Agenda a drenagem sem bloquear quem chamou. */
  notificar(): void {
    if (this.emExecucao) {
      return;
    }

    this.emExecucao = true;
    this.drenagemAtual = this.executar();
  }

  private async executar(): Promise<void> {
    try {
      await this.fila.processar(this.processador);
    } catch (erro) {
      this.aoFalhar(erro);
    } finally {
      this.emExecucao = false;
    }

    // Itens enfileirados durante a drenagem não podem ficar parados.
    if (this.fila.tamanho > 0) {
      this.notificar();
    }
  }

  /** Espera a fila esvaziar. Usado no shutdown e nos testes. */
  async aguardar(): Promise<void> {
    while (this.emExecucao || this.fila.tamanho > 0) {
      this.notificar();
      await this.drenagemAtual;
    }
  }
}
