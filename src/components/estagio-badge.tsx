import { cn } from "@/lib/utils";
import { rotuloEstagio, type Estagio } from "@/lib/klaus-types";

const estilos: Record<Estagio, string> = {
  abertura: "bg-estagio-abertura/10 text-estagio-abertura border-estagio-abertura/25",
  descoberta: "bg-estagio-descoberta/10 text-estagio-descoberta border-estagio-descoberta/25",
  qualificacao:
    "bg-estagio-qualificacao/10 text-estagio-qualificacao border-estagio-qualificacao/25",
  objecao: "bg-estagio-objecao/10 text-estagio-objecao border-estagio-objecao/25",
  handoff: "bg-estagio-handoff/10 text-estagio-handoff border-estagio-handoff/25",
  followup: "bg-estagio-followup/10 text-estagio-followup border-estagio-followup/25",
  encerrado: "bg-estagio-encerrado/10 text-estagio-encerrado border-estagio-encerrado/25",
};

export function EstagioBadge({ estagio, className }: { estagio: Estagio; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        estilos[estagio],
        className,
      )}
    >
      {rotuloEstagio(estagio)}
    </span>
  );
}

const cores: Record<Estagio, string> = {
  abertura: "bg-estagio-abertura",
  descoberta: "bg-estagio-descoberta",
  qualificacao: "bg-estagio-qualificacao",
  objecao: "bg-estagio-objecao",
  handoff: "bg-estagio-handoff",
  followup: "bg-estagio-followup",
  encerrado: "bg-estagio-encerrado",
};

export function EstagioPonto({ estagio, className }: { estagio: Estagio; className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", cores[estagio], className)} />;
}
