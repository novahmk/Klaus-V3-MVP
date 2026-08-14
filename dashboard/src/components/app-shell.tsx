import { Link, useRouterState } from "@tanstack/react-router";
import { Zap, KanbanSquare, Settings, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type Item = { titulo: string; curto: string; url: string; icone: LucideIcon };

const itens: Item[] = [
  { titulo: "Prospecção", curto: "Prospecção", url: "/", icone: Zap },
  { titulo: "Kanban de Leads", curto: "Kanban", url: "/kanban", icone: KanbanSquare },
  { titulo: "Configuração", curto: "Config", url: "/configuracao", icone: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar p-6 lg:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary shadow-glow">
            <span className="text-lg font-bold text-primary-foreground">K</span>
          </div>
          <span className="truncate text-xl font-bold tracking-tight text-foreground">
            Klaus AI
          </span>
        </div>

        <nav className="flex-1 space-y-2">
          {itens.map((item) => {
            const ativo = pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  ativo
                    ? "border border-primary/20 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <item.icone className="size-5 shrink-0" />
                <span className="truncate">{item.titulo}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-panel-strong p-3">
            <span className="text-sm font-medium text-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <div className="rounded-2xl border border-border bg-panel-strong p-4">
            <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Status da IA
            </p>
            <div className="flex items-center gap-2">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
              <span className="text-sm font-medium text-foreground">Klaus está online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        {/* Barra superior — mobile */}
        <div className="flex items-center gap-3 border-b border-border bg-sidebar px-4 py-3 lg:hidden">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary">
            <span className="text-base font-bold text-primary-foreground">K</span>
          </div>
          <span className="truncate text-base font-bold tracking-tight text-foreground">
            Klaus AI
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              online
            </span>
          </div>
        </div>

        {children}
      </div>

      {/* Navegação inferior — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-sidebar lg:hidden">
        {itens.map((item) => {
          const ativo = pathname === item.url;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                ativo ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icone className="size-5" />
              {item.curto}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)] gap-4 border-b border-border bg-surface/40 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-8 sm:py-5">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {acao ? <div className="shrink-0">{acao}</div> : null}
    </header>
  );
}
