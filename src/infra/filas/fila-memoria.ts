export interface Tarefa<T> {
  id: string;
  payload: T;
  tentativas: number;
}

export interface OpcoesFila {
  maxTentativas?: number;
}

export type Processador<T> = (payload: T) => Promise<void>;

export const MAX_TENTATIVAS_PADRAO = 3;

/**
 * Fila em memória.
 *
 * Existe para desacoplar o recebimento do webhook do processamento sem
 * introduzir Redis/BullMQ antes de haver volume que justifique. O contrato é
 * o mesmo que uma fila distribuída exporia, então trocar a implementação
 * depois não muda quem a usa.
 *
 * Importante: como a fila é em memória, a garantia de não perder mensagem vem
 * da idempotência da persistência (`wa_message_id`), não da fila.
 */
export class FilaMemoria<T> {
  private readonly pendentes: Tarefa<T>[] = [];
  private readonly mortas: Tarefa<T>[] = [];
  private readonly maxTentativas: number;
  private sequencia = 0;

  constructor(opcoes: OpcoesFila = {}) {
    this.maxTentativas = opcoes.maxTentativas ?? MAX_TENTATIVAS_PADRAO;
  }

  enfileirar(payload: T): Tarefa<T> {
    this.sequencia += 1;
    const tarefa: Tarefa<T> = { id: `tarefa-${this.sequencia}`, payload, tentativas: 0 };

    this.pendentes.push(tarefa);

    return tarefa;
  }

  get tamanho(): number {
    return this.pendentes.length;
  }

  /** Tarefas que esgotaram as tentativas. Nunca são descartadas em silêncio. */
  get deadLetter(): readonly Tarefa<T>[] {
    return this.mortas;
  }

  /**
   * Processa a fila inteira. Falhas reenfileiram a tarefa até `maxTentativas`;
   * depois disso ela vai para a dead-letter em vez de sumir.
   */
  async processar(processador: Processador<T>): Promise<{ processadas: number; falhas: number }> {
    let processadas = 0;
    let falhas = 0;

    while (this.pendentes.length > 0) {
      const tarefa = this.pendentes.shift();

      if (tarefa === undefined) {
        break;
      }

      try {
        await processador(tarefa.payload);
        processadas += 1;
      } catch {
        falhas += 1;
        const atualizada: Tarefa<T> = { ...tarefa, tentativas: tarefa.tentativas + 1 };

        if (atualizada.tentativas >= this.maxTentativas) {
          this.mortas.push(atualizada);
        } else {
          this.pendentes.push(atualizada);
        }
      }
    }

    return { processadas, falhas };
  }
}
