# Componente 2 — Geração de Perguntas

Gera perguntas adaptativas em três camadas para conduzir a conversa comercial.

## Camadas

| Camada | Nome | Quando |
|--------|------|--------|
| 1 | Necessidade | `perguntasJaFeitas.length === 0` |
| 2 | Objeção | `perguntasJaFeitas.length === 1` |
| 3 | Confirmação | `perguntasJaFeitas.length >= 2` |

## Uso

```ts
import { Intencao } from '../1-deteccao-intencao/index.js';
import { criarGeradorPerguntas } from './index.js';

const gerador = criarGeradorPerguntas({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  redisUrl: process.env.REDIS_URL,
});

const resultado = await gerador.gerar({
  tema: 'automação comercial',
  historico: [{ role: 'lead', conteudo: 'Isso parece interessante' }],
  intencao: Intencao.DEMONSTRA_INTERESSE,
  clienteId: 'cliente-1',
  baseConhecimento: { segmento: 'SaaS' },
  perguntasJaFeitas: [],
});

await gerador.encerrar();
```

## Validações

- 20 a 150 caracteres
- Pergunta aberta (não sim/não)
- Termina com `?`
- Sem placeholders
- Sem repetição exata
- Similaridade máxima de 70% (Jaccard)

## Fluxo

```
Entrada → Camada → Cache → GPT → Validação → Template fallback → Cache → Saída
```

## Testes

```bash
npm test
```
