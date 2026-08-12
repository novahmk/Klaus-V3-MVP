import type { SupabaseClient } from '@supabase/supabase-js';

import type { TravaDistribuida } from '../resiliencia/trava-distribuida.js';

/**
 * Trava apoiada no banco, para quando houver mais de uma instância.
 *
 * A atomicidade fica no `insert ... on conflict` dentro da função SQL
 * (migration 0005): resolver isso no código, com select seguido de update,
 * deixaria janela para duas instâncias vencerem ao mesmo tempo.
 */
export class TravaDistribuidaSupabase implements TravaDistribuida {
  private readonly client: SupabaseClient;
  private readonly dono: string;

  constructor(client: SupabaseClient, dono: string) {
    this.client = client;
    this.dono = dono;
  }

  async adquirir(nome: string, ttlSegundos: number): Promise<boolean> {
    const { data, error } = await this.client.rpc('klaus_adquirir_trava', {
      p_nome: nome,
      p_dono: this.dono,
      p_ttl_segundos: ttlSegundos,
    });

    if (error !== null) {
      throw new Error(`Falha ao adquirir trava "${nome}": ${error.message}`);
    }

    return data === true;
  }

  async liberar(nome: string): Promise<void> {
    const { error } = await this.client.rpc('klaus_liberar_trava', {
      p_nome: nome,
      p_dono: this.dono,
    });

    if (error !== null) {
      throw new Error(`Falha ao liberar trava "${nome}": ${error.message}`);
    }
  }
}
