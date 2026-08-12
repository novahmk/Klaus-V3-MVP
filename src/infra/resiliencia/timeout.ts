export class TimeoutError extends Error {
  readonly ms: number;

  constructor(descricao: string, ms: number) {
    super(`${descricao} excedeu ${ms}ms.`);
    this.name = 'TimeoutError';
    this.ms = ms;
  }
}

/**
 * Corrida entre a promessa e um timeout.
 *
 * Regra do sistema: nenhuma chamada externa pode ficar pendente para sempre.
 * Uma dependência lenta tem que virar erro rápido e tratável, nunca um request
 * pendurado — é assim que um serviço trava por inteiro.
 *
 * Atenção: a promessa original continua rodando; isto limita a ESPERA, não
 * cancela o trabalho. Onde houver cancelamento real (fetch), use AbortSignal.
 */
export async function comTimeout<T>(
  promessa: Promise<T>,
  ms: number,
  descricao: string,
): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;

  const limite = new Promise<never>((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new TimeoutError(descricao, ms)), ms);
  });

  try {
    return await Promise.race([promessa, limite]);
  } finally {
    if (temporizador !== undefined) {
      clearTimeout(temporizador);
    }
  }
}

/** Sinal de cancelamento para APIs que suportam AbortSignal (fetch). */
export function criarSinalDeTimeout(ms: number): { sinal: AbortSignal; cancelar: () => void } {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), ms);

  return {
    sinal: controlador.signal,
    cancelar: () => clearTimeout(temporizador),
  };
}
