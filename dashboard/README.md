# Klaus Dashboard

SPA (Vite + React 19 + TanStack Router + Tailwind v4 + shadcn/ui) servida pelo
backend Fastify deste repositório. Em produção não há processo separado: o
`npm run build` na raiz gera `dashboard/dist` e o backend serve os arquivos na
raiz (`/`), com as rotas client-side (`/kanban`, `/configuracao`) resolvidas
por fallback SPA.

## Desenvolvimento

```sh
# na raiz do repo (instala backend + dashboard via workspaces)
npm install

# terminal 1 — backend na porta 3000
npm run build:backend && npm start

# terminal 2 — dashboard com HMR na porta 5173 (proxy de /api para :3000)
npm run dev:dashboard
```

As chamadas à API usam caminhos relativos `/api/*` (mesma origem) — não há
variáveis de ambiente no dashboard.
