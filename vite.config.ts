// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Fora do sandbox Lovable (ex.: build no Railway), gera um servidor Node
  // standalone (`.output/server/index.mjs`, escuta em process.env.PORT) em
  // vez do preset padrão `cloudflare-module`.
  //
  // `inlineDynamicImports` não faz parte do tipo estreito exposto por
  // `LovableViteTanstackOptions["nitro"]`, mas é repassado direto ao
  // `nitro()` (ver dist/index.js do pacote) e força um único chunk no
  // bundle SSR. Sem isso, o code-splitting padrão do Nitro 3 (ainda beta)
  // gera dois chunks com import circular (`server-*.mjs` ⇄ `server-*2.mjs`)
  // e `createCsrfMiddleware` chega `undefined` em runtime — erro 500 em
  // toda rota. Workaround necessário até o bug do Nitro ser corrigido.
  nitro: {
    preset: "node-server",
    inlineDynamicImports: true,
  } as { preset: string; inlineDynamicImports: boolean },
});
