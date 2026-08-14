# Novo Dashboard Klaus (V3) — Etapa 1: base visual + shell navegável

Direção visual escolhida: **console escuro** (Klaus AI) — fundo quase preto, painéis slate translúcidos, acento verde esmeralda, tipografia Inter, cantos arredondados 2xl e prévia de conversa WhatsApp alta na coluna direita. Os tokens dessa direção vão para `src/styles.css` exatamente como estão no protótipo.

Nesta etapa, tudo com dados de exemplo — sem conexão com o Supabase ainda.

## Telas

### 1. Prospecção (`/`, abre aqui)

Não é um disparo de mensagens comum: é o início de conversas de um SDR de IA.

Duas abas:

**Nova prospecção**
- Importação de planilha (.csv / .xlsx) com nome e telefone, mostrando as linhas reconhecidas e as inválidas.
- Adição manual de contato um a um (nome + telefone), com a fila crescendo abaixo e possibilidade de remover.
- Editor da abordagem/mensagem com variáveis (`{{nome}}`).
- **Controle de cadência com aleatoriedade**: intervalo aleatório mínimo–máximo em segundos, tamanho do lote, pausa entre lotes e janela de horário permitido.
- Prévia da conversa em bolhas de WhatsApp, coluna direita, alta e fixa.
- Botão principal "Iniciar prospecção".

**Disparados**
- Lista dos números já prospectados: nome, telefone, horário do envio e fase.
- Fases: Em andamento, Qualificado, Finalizado, Sem resposta, Follow-up — cada uma com etiqueta de cor distinta.
- Contagem por fase no topo e filtro por fase.

### 2. Kanban de Leads (`/kanban`)
Colunas por fase, card com telefone + última mensagem + tempo desde o último contato. Alternador Kanban ↔ Lista com os mesmos dados. Clique no card abre a conversa completa com botão "assumir conversa" (pausar a IA) ali dentro — sem tela separada de controle manual.

### 3. Configuração (`/configuracao`)
Tela única: persona/tom de voz da IA, regras de escalar para humano, modelos de mensagem usados na prospecção. Sem feature flags, health check, integrações ou métricas avançadas.

## Navegação e layout

- Sidebar escura fixa com exatamente 3 itens + indicador "Klaus está online" no rodapé.
- Desktop é a referência; no celular a navegação vira barra inferior, tudo empilha, o Kanban abre em modo Lista e nenhuma tabela ganha scroll horizontal (viram cards).
- Cada tela verificada visualmente em ~1440px e ~390px com captura real antes de eu considerar pronta.

## Dados na Etapa 1

Mocks em memória, um módulo por tela, usando os **nomes de campo do schema real** (`leads`, `mensagens.lead_id` UUID, `leads.controle_manual`, `cfg_ia_persona`, `cfg_ia_tom_voz`, `regras_conversa`) — a Etapa 2 vira substituição direta, sem renomear nada.

## Etapa 2 (depois da sua validação visual)

- Conexão com o seu Supabase (você fornece URL e chaves; guardo como secrets).
- Prospecção real via `POST {backend}/api/prospeccao/manual-disparos` com body `{clienteId, origem, mensagem, itens[]}` — o dashboard não escreve leads direto no banco.
- `GET /api/public/klaus-config` com header `x-internal-api-key` — contrato preservado.
- Resolução telefone → `leads.id` antes de qualquer leitura/escrita em `mensagens`. Nada de `leads_dashboard`.
- Regras de conversa (`nao_prometer`, `sempre_confirmar`, `escalar_humano_quando`) em somente leitura até você decidir entre o singleton `regras_conversa` e uma tabela nova.
- Definir onde a cadência aleatória é persistida e executada (hoje o contrato de disparo não tem esses campos) — a decidir com o backend.

## Notas técnicas

- TanStack Start + React 19, Tailwind v4, shadcn/ui; rotas por arquivo em `src/routes/`.
- Tokens da direção escolhida copiados para `@theme inline` / `:root` em `src/styles.css` (tema escuro como padrão); nenhuma cor hardcoded nos componentes.
- Inter carregada via `<link>` no `__root.tsx`; shell de navegação em volta do `<Outlet />`, um componente único alimentando sidebar (desktop) e barra inferior (mobile).
- Mocks em `src/lib/<tela>.mock.ts`; `head()` próprio por rota.
