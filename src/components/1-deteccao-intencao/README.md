# Componente 1 — Detecção de Intenção

Identifica a intenção do lead a partir da mensagem atual, histórico e contexto.

## Uso

```ts
import { criarDetectorIntencao, Intencao } from 'klaus-v2';

const detector = criarDetectorIntencao({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  redisUrl: process.env.REDIS_URL,
});

const resultado = await detector.detectar({
  mensagem: 'Quero agendar uma demo',
  historico: [{ role: 'lead', conteudo: 'Olá' }],
  contexto: { leadId: 'lead-123', clienteId: 'cliente-1' },
});

console.log(resultado);
// { intencao, confianca, motivo, timestamp, origem }

await detector.encerrar();
```

## Fluxo interno

1. Valida entrada
2. Retorna `NAO_RESPONDEU` para mensagem vazia
3. Consulta cache Redis
4. Chama GPT com resposta JSON estruturada
5. Em falha do GPT, usa fallback por palavras-chave
6. Persiste resultado no cache e retorna saída validada

## Intenções

- `QUER_AGENDAR`
- `QUER_MAIS_INFO`
- `TEM_OBJECAO`
- `DEMONSTRA_INTERESSE`
- `NAO_INTERESSADO`
- `NAO_RESPONDEU`

## Origens da resposta

- `gpt` — detecção via OpenAI
- `cache` — resultado reutilizado do Redis
- `fallback` — regras por palavras-chave

## Testes

```bash
npm test
```
