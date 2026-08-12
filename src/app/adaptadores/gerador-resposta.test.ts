import { describe, expect, it, vi } from 'vitest';

import type { ClienteIAResposta } from '../../components/5-geracao-resposta/index.js';
import { Disjuntor } from '../../infra/resiliencia/disjuntor.js';
import { AdaptadorGeradorResposta, RESPOSTA_DEGRADADA } from './gerador-resposta.js';

function clienteIA(implementacao: () => Promise<string>): ClienteIAResposta {
  return { gerarResposta: implementacao };
}

const entrada = {
  mensagem: 'Quanto custa?',
  sistema: 'Persona: SDR',
  historico: [],
};

describe('AdaptadorGeradorResposta', () => {
  it('devolve a resposta gerada pela IA', async () => {
    const adaptador = new AdaptadorGeradorResposta(
      clienteIA(() => Promise.resolve('Depende do seu volume.')),
    );

    await expect(adaptador.gerar(entrada)).resolves.toEqual({
      resposta: 'Depende do seu volume.',
      origem: 'gpt',
    });
  });

  it('usa a abordagem pronta sem chamar a IA quando a confiança é alta', async () => {
    const gerarResposta = vi.fn();
    const adaptador = new AdaptadorGeradorResposta(clienteIA(gerarResposta));

    const saida = await adaptador.gerar({
      ...entrada,
      abordagem: { texto: 'Nosso plano começa em R$ 300.', confianca: 0.9 },
    });

    expect(saida.origem).toBe('abordagem');
    expect(gerarResposta).not.toHaveBeenCalled();
  });

  it('responde algo ao lead mesmo com a IA fora do ar', async () => {
    const aoDegradar = vi.fn();
    const adaptador = new AdaptadorGeradorResposta(
      clienteIA(() => Promise.reject(new Error('429 rate limit'))),
      { aoDegradar },
    );

    const saida = await adaptador.gerar(entrada);

    expect(saida.resposta).toBe(RESPOSTA_DEGRADADA);
    expect(aoDegradar).toHaveBeenCalledWith(expect.stringContaining('429 rate limit'));
  });

  it('não fica pendurado quando a IA demora demais', async () => {
    const adaptador = new AdaptadorGeradorResposta(
      clienteIA(() => new Promise(() => undefined)),
      { timeoutMs: 30 },
    );

    await expect(adaptador.gerar(entrada)).resolves.toMatchObject({
      resposta: RESPOSTA_DEGRADADA,
    });
  });

  it('para de tentar a IA quando o disjuntor abre', async () => {
    const disjuntor = new Disjuntor({ nome: 'teste', limiteFalhas: 1 });
    const gerarResposta = vi.fn().mockRejectedValue(new Error('falha'));
    const adaptador = new AdaptadorGeradorResposta(clienteIA(gerarResposta), { disjuntor });

    await adaptador.gerar(entrada);
    await adaptador.gerar(entrada);

    expect(gerarResposta).toHaveBeenCalledTimes(1);
  });

  it('permite customizar a resposta degradada', async () => {
    const adaptador = new AdaptadorGeradorResposta(
      clienteIA(() => Promise.reject(new Error('falha'))),
      { respostaDegradada: 'Já te respondo.' },
    );

    await expect(adaptador.gerar(entrada)).resolves.toMatchObject({
      resposta: 'Já te respondo.',
    });
  });
});
