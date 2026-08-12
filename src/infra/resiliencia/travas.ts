/**
 * Serializa execuções por chave.
 *
 * Duas mensagens do mesmo lead chegando juntas não podem ser processadas em
 * paralelo: dariam duas respostas e disputariam a atualização do estágio.
 * Leads diferentes continuam em paralelo — travar tudo transformaria o sistema
 * em fila única e o deixaria lento.
 */
export class TravaPorChave {
  private readonly filas = new Map<string, Promise<unknown>>();
  private readonly aguardando = new Map<string, number>();

  async executar<T>(chave: string, acao: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(chave) ?? Promise.resolve();

    this.aguardando.set(chave, (this.aguardando.get(chave) ?? 0) + 1);

    // Encadeia mesmo que a anterior tenha falhado: uma falha não pode
    // deixar a chave travada para sempre.
    const atual = anterior.then(acao, acao);

    this.filas.set(
      chave,
      atual.then(
        () => undefined,
        () => undefined,
      ),
    );

    try {
      return await atual;
    } finally {
      const restantes = (this.aguardando.get(chave) ?? 1) - 1;

      if (restantes <= 0) {
        this.aguardando.delete(chave);
        this.filas.delete(chave);
      } else {
        this.aguardando.set(chave, restantes);
      }
    }
  }

  get tamanho(): number {
    return this.filas.size;
  }
}
