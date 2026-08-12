import { describe, expect, it, vi } from 'vitest';

import { Intencao } from '../../components/1-deteccao-intencao/types.js';
import type { DetectorIntencao as DetectorComponente } from '../../components/1-deteccao-intencao/index.js';
import { Disjuntor } from '../../infra/resiliencia/disjuntor.js';
import { AdaptadorDetectorIntencao } from './detector-intencao.js';

function detectorFalso(
  implementacao: () => Promise<{ intencao: Intencao; confianca: number }>,
): DetectorComponente {
  return { detectar: implementacao } as unknown as DetectorComponente;
}

const entrada = {
  mensagem: 'Quero agendar uma reunião',
  historico: [],
  leadId: '11111111-1111-4111-8111-111111111111',
};

describe('AdaptadorDetectorIntencao', () => {
  it('devolve a intenção detectada pelo componente', async () => {
    const adaptador = new AdaptadorDetectorIntencao(
      detectorFalso(() =>
        Promise.resolve({ intencao: Intencao.QUER_AGENDAR, confianca: 0.93 }),
      ),
    );

    await expect(adaptador.detectar(entrada)).resolves.toEqual({
      intencao: Intencao.QUER_AGENDAR,
      confianca: 0.93,
    });
  });

  it('cai para palavras-chave quando a IA falha, em vez de propagar erro', async () => {
    const aoDegradar = vi.fn();
    const adaptador = new AdaptadorDetectorIntencao(
      detectorFalso(() => Promise.reject(new Error('openai fora do ar'))),
      { aoDegradar },
    );

    const resultado = await adaptador.detectar(entrada);

    expect(resultado.intencao).toBeDefined();
    expect(aoDegradar).toHaveBeenCalledWith('openai fora do ar');
  });

  it('não fica pendurado quando a IA não responde', async () => {
    const adaptador = new AdaptadorDetectorIntencao(
      detectorFalso(() => new Promise(() => undefined)),
      { timeoutMs: 30 },
    );

    const resultado = await adaptador.detectar(entrada);

    expect(resultado.intencao).toBeDefined();
  });

  it('usa o caminho degradado enquanto o disjuntor está aberto', async () => {
    const disjuntor = new Disjuntor({ nome: 'teste', limiteFalhas: 1 });
    const detectar = vi.fn().mockRejectedValue(new Error('falha'));
    const aoDegradar = vi.fn();
    const adaptador = new AdaptadorDetectorIntencao(detectorFalso(detectar), {
      disjuntor,
      aoDegradar,
    });

    await adaptador.detectar(entrada);
    await adaptador.detectar(entrada);

    // A segunda chamada nem tocou na IA.
    expect(detectar).toHaveBeenCalledTimes(1);
    expect(aoDegradar).toHaveBeenLastCalledWith('disjuntor aberto');
  });
});
