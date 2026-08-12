import { describe, expect, it } from 'vitest';

import { ClienteMemoria } from '../persistencia/cliente-memoria.js';
import type { PersistenciaDependencies } from '../persistencia/index.js';
import {
  TABELA_LEAD_FATOS,
  calcularSimilaridade,
  esquecerLead,
  formatarFatosParaPrompt,
  listarFatosDoLead,
  recuperarFatosRelevantes,
  registrarFato,
} from './fatos.js';
import type { LeadFato } from './fatos.js';

const LEAD_ID = '11111111-1111-4111-8111-111111111111';
const OUTRO_LEAD = '22222222-2222-4222-8222-222222222222';

function criarDeps(cliente: ClienteMemoria): PersistenciaDependencies {
  return { cliente };
}

function clienteVazio(): ClienteMemoria {
  return new ClienteMemoria({ [TABELA_LEAD_FATOS]: [] });
}

describe('registrarFato', () => {
  it('grava o fato associado ao lead', async () => {
    const cliente = clienteVazio();

    const fato = await registrarFato(criarDeps(cliente), LEAD_ID, {
      conteudo: 'É gerente de logística',
      categoria: 'qualificacao',
      importancia: 0.8,
    });

    expect(fato?.lead_id).toBe(LEAD_ID);
    expect(cliente.linhas(TABELA_LEAD_FATOS)).toHaveLength(1);
  });

  it('ignora conteúdo vazio', async () => {
    const cliente = clienteVazio();

    await expect(registrarFato(criarDeps(cliente), LEAD_ID, { conteudo: '   ' })).resolves.toBeNull();
    expect(cliente.linhas(TABELA_LEAD_FATOS)).toHaveLength(0);
  });

  it('usa categoria contexto por padrão', async () => {
    const cliente = clienteVazio();

    const fato = await registrarFato(criarDeps(cliente), LEAD_ID, { conteudo: 'Tem três lojas' });

    expect(fato?.categoria).toBe('contexto');
  });
});

describe('listarFatosDoLead', () => {
  it('não retorna fatos de outro lead', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarFato(deps, LEAD_ID, { conteudo: 'Fato do lead A' });
    await registrarFato(deps, OUTRO_LEAD, { conteudo: 'Fato do lead B' });

    const fatos = await listarFatosDoLead(deps, LEAD_ID);

    expect(fatos).toHaveLength(1);
    expect(fatos[0]?.conteudo).toBe('Fato do lead A');
  });
});

describe('recuperarFatosRelevantes', () => {
  it('recupera o fato relacionado à pergunta atual', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarFato(deps, LEAD_ID, { conteudo: 'Precisa reduzir custo de frete' });
    await registrarFato(deps, LEAD_ID, { conteudo: 'Gosta de futebol nos fins de semana' });

    const fatos = await recuperarFatosRelevantes(deps, LEAD_ID, 'como está o custo de frete hoje');

    expect(fatos.map((fato) => fato.conteudo)).toEqual(['Precisa reduzir custo de frete']);
  });

  it('NÃO recupera fato irrelevante só por ter importância alta', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarFato(deps, LEAD_ID, {
      conteudo: 'Trabalha com jardinagem ornamental',
      categoria: 'contexto',
      importancia: 1,
    });

    const fatos = await recuperarFatosRelevantes(deps, LEAD_ID, 'qual o prazo de entrega do frete');

    expect(fatos).toEqual([]);
  });

  it('sempre inclui restrições do lead, mesmo sem relação com a pergunta', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarFato(deps, LEAD_ID, {
      conteudo: 'Não pode ser contatado antes das 18h',
      categoria: 'restricao',
      importancia: 0.95,
    });

    const fatos = await recuperarFatosRelevantes(deps, LEAD_ID, 'qual o valor do plano');

    expect(fatos).toHaveLength(1);
    expect(fatos[0]?.categoria).toBe('restricao');
  });

  it('respeita o limite de fatos recuperados', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    for (let indice = 0; indice < 6; indice += 1) {
      await registrarFato(deps, LEAD_ID, {
        conteudo: `Precisa reduzir custo de frete na filial ${indice}`,
      });
    }

    const fatos = await recuperarFatosRelevantes(deps, LEAD_ID, 'custo de frete filial', 2);

    expect(fatos).toHaveLength(2);
  });

  it('retorna vazio quando o lead não tem fatos', async () => {
    await expect(
      recuperarFatosRelevantes(criarDeps(clienteVazio()), LEAD_ID, 'qualquer coisa'),
    ).resolves.toEqual([]);
  });
});

describe('esquecerLead', () => {
  it('apaga apenas a memória do lead que pediu opt-out', async () => {
    const cliente = clienteVazio();
    const deps = criarDeps(cliente);

    await registrarFato(deps, LEAD_ID, { conteudo: 'Fato do lead A' });
    await registrarFato(deps, OUTRO_LEAD, { conteudo: 'Fato do lead B' });

    const apagados = await esquecerLead(deps, LEAD_ID);

    expect(apagados).toBe(1);
    await expect(listarFatosDoLead(deps, LEAD_ID)).resolves.toEqual([]);
    await expect(listarFatosDoLead(deps, OUTRO_LEAD)).resolves.toHaveLength(1);
  });

  it('é seguro chamar para lead sem fatos', async () => {
    await expect(esquecerLead(criarDeps(clienteVazio()), LEAD_ID)).resolves.toBe(0);
  });
});

describe('calcularSimilaridade', () => {
  it('reconhece termos em comum ignorando acento e caixa', () => {
    expect(calcularSimilaridade('custo de LOGÍSTICA', 'reduzir logistica')).toBeGreaterThan(0);
  });

  it('devolve zero para textos sem relação', () => {
    expect(calcularSimilaridade('jardinagem ornamental', 'contrato jurídico')).toBe(0);
  });
});

describe('formatarFatosParaPrompt', () => {
  it('devolve vazio sem fatos', () => {
    expect(formatarFatosParaPrompt([])).toBe('');
  });

  it('inclui a categoria de cada fato', () => {
    const fato: LeadFato = {
      id: 'f1',
      lead_id: LEAD_ID,
      conteudo: 'É gerente',
      categoria: 'qualificacao',
      importancia: 0.8,
      criado_em: '2026-08-12T10:00:00.000Z',
      ultimo_uso_em: null,
    };

    expect(formatarFatosParaPrompt([fato])).toBe('- [qualificacao] É gerente');
  });
});
