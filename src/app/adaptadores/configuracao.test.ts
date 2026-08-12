import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from '../../infra/persistencia/cliente-memoria.js';
import { TABELA_REGRAS_CONVERSA } from '../../infra/persistencia/constants.js';
import { CONFIG_IA_PADRAO, TABELA_CONFIG_IA, ProvedorConfiguracaoSupabase } from './configuracao.js';

function cliente(configIa: Record<string, unknown>[] = [], regras: Record<string, unknown>[] = []) {
  return new ClienteMemoria({
    [TABELA_CONFIG_IA]: configIa,
    [TABELA_REGRAS_CONVERSA]: regras,
  });
}

describe('ProvedorConfiguracaoSupabase', () => {
  it('carrega persona, objetivo e regras do banco', async () => {
    const provedor = new ProvedorConfiguracaoSupabase({
      cliente: cliente(
        [{ persona: 'SDR técnico', objetivo: 'Agendar demo', tom_de_voz: 'direto', contexto: null }],
        [{ nao_prometer: ['desconto'], sempre_confirmar: [], escalar_humano_quando: [] }],
      ),
    });

    const config = await provedor.carregar();

    expect(config.agente.persona).toBe('SDR técnico');
    expect(config.agente.tomDeVoz).toBe('direto');
    expect(config.regras.nao_prometer).toEqual(['desconto']);
  });

  it('usa padrão quando a tabela está vazia, para o agente nunca ficar mudo', async () => {
    const provedor = new ProvedorConfiguracaoSupabase({ cliente: cliente() });

    const config = await provedor.carregar();

    expect(config.agente.persona).toBe(CONFIG_IA_PADRAO.persona);
    expect(config.agente.objetivo).toBe(CONFIG_IA_PADRAO.objetivo);
  });

  it('omite campos opcionais nulos', async () => {
    const provedor = new ProvedorConfiguracaoSupabase({
      cliente: cliente([{ persona: 'p', objetivo: 'o', tom_de_voz: null, contexto: null }]),
    });

    const config = await provedor.carregar();

    expect(config.agente.tomDeVoz).toBeUndefined();
    expect(config.agente.contexto).toBeUndefined();
  });

  it('não relê o banco dentro do TTL', async () => {
    const clienteMemoria = cliente([{ persona: 'inicial', objetivo: 'o' }]);
    let chamadas = 0;
    const original = clienteMemoria.selecionarUm.bind(clienteMemoria);

    clienteMemoria.selecionarUm = ((tabela: string, filtros: Record<string, string>) => {
      chamadas += 1;
      return original(tabela, filtros);
    }) as typeof clienteMemoria.selecionarUm;

    const provedor = new ProvedorConfiguracaoSupabase({ cliente: clienteMemoria });

    await provedor.carregar();
    await provedor.carregar();

    // Uma leitura de config_ia e uma de regras na primeira chamada apenas.
    expect(chamadas).toBe(2);
  });

  it('relê o banco depois que o TTL expira', async () => {
    let agora = 0;
    const clienteMemoria = cliente([{ persona: 'inicial', objetivo: 'o' }]);
    const provedor = new ProvedorConfiguracaoSupabase(
      { cliente: clienteMemoria },
      { ttlMs: 1000, agora: () => agora },
    );

    await provedor.carregar();

    clienteMemoria.linhas(TABELA_CONFIG_IA)[0]!['persona'] = 'atualizada';
    agora += 1001;

    await expect(provedor.carregar()).resolves.toMatchObject({
      agente: { persona: 'atualizada' },
    });
  });

  it('invalidar força releitura imediata', async () => {
    const clienteMemoria = cliente([{ persona: 'inicial', objetivo: 'o' }]);
    const provedor = new ProvedorConfiguracaoSupabase({ cliente: clienteMemoria });

    await provedor.carregar();
    clienteMemoria.linhas(TABELA_CONFIG_IA)[0]!['persona'] = 'nova';
    provedor.invalidar();

    await expect(provedor.carregar()).resolves.toMatchObject({
      agente: { persona: 'nova' },
    });
  });
});
