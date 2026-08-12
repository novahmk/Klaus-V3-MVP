import type {
  ConfiguracaoCarregada,
  ProvedorConfiguracao,
} from '../../components/7-orquestracao/index.js';
import { carregarRegrasConversa } from '../../infra/persistencia/index.js';
import type { PersistenciaDependencies } from '../../infra/persistencia/index.js';

export const TABELA_CONFIG_IA = 'config_ia';

/** Usado quando a tabela ainda não foi preenchida. Nunca deixa o agente mudo. */
export const CONFIG_IA_PADRAO = {
  persona: 'Consultor comercial cordial e objetivo.',
  objetivo: 'Qualificar o lead e agendar uma conversa com o time.',
} as const;

interface LinhaConfigIa {
  persona: string | null;
  objetivo: string | null;
  tom_de_voz: string | null;
  contexto: string | null;
}

export interface OpcoesProvedor {
  /** Evita reler o banco a cada mensagem. */
  ttlMs?: number;
  agora?: () => number;
}

export const TTL_PADRAO_MS = 30_000;

/**
 * Lê a configuração que o dashboard edita.
 *
 * Tem cache curto de propósito: sem ele, cada mensagem faria duas consultas
 * extras; com TTL longo, editar a persona no dashboard demoraria demais para
 * refletir na conversa.
 */
export class ProvedorConfiguracaoSupabase implements ProvedorConfiguracao {
  private readonly deps: PersistenciaDependencies;
  private readonly ttlMs: number;
  private readonly agora: () => number;
  private cache: { valor: ConfiguracaoCarregada; expiraEm: number } | null = null;

  constructor(deps: PersistenciaDependencies, opcoes: OpcoesProvedor = {}) {
    this.deps = deps;
    this.ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS;
    this.agora = opcoes.agora ?? Date.now;
  }

  async carregar(): Promise<ConfiguracaoCarregada> {
    const agora = this.agora();

    if (this.cache !== null && agora < this.cache.expiraEm) {
      return this.cache.valor;
    }

    const [linha, regras] = await Promise.all([
      this.deps.cliente.selecionarUm<LinhaConfigIa>(TABELA_CONFIG_IA, {}),
      carregarRegrasConversa(this.deps),
    ]);

    const valor: ConfiguracaoCarregada = {
      agente: {
        persona: linha?.persona ?? CONFIG_IA_PADRAO.persona,
        objetivo: linha?.objetivo ?? CONFIG_IA_PADRAO.objetivo,
        ...(linha?.tom_de_voz ? { tomDeVoz: linha.tom_de_voz } : {}),
        ...(linha?.contexto ? { contexto: linha.contexto } : {}),
      },
      regras,
    };

    this.cache = { valor, expiraEm: agora + this.ttlMs };

    return valor;
  }

  /** Invalida o cache após uma edição vinda do dashboard. */
  invalidar(): void {
    this.cache = null;
  }
}
