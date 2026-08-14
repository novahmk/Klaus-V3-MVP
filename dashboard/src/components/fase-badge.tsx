import { cn } from "@/lib/utils";
import { rotuloFase, type FaseLead } from "@/lib/klaus-data";

const estilos: Record<FaseLead, string> = {
  em_andamento:
    "bg-fase-andamento/10 text-fase-andamento border-fase-andamento/25",
  qualificado:
    "bg-fase-qualificado/10 text-fase-qualificado border-fase-qualificado/25",
  finalizado:
    "bg-fase-finalizado/10 text-fase-finalizado border-fase-finalizado/25",
  sem_resposta:
    "bg-fase-sem-resposta/10 text-fase-sem-resposta border-fase-sem-resposta/25",
  follow_up: "bg-fase-followup/10 text-fase-followup border-fase-followup/25",
};

export function FaseBadge({ fase, className }: { fase: FaseLead; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        estilos[fase],
        className,
      )}
    >
      {rotuloFase(fase)}
    </span>
  );
}

export function FasePonto({ fase, className }: { fase: FaseLead; className?: string }) {
  const cores: Record<FaseLead, string> = {
    em_andamento: "bg-fase-andamento",
    qualificado: "bg-fase-qualificado",
    finalizado: "bg-fase-finalizado",
    sem_resposta: "bg-fase-sem-resposta",
    follow_up: "bg-fase-followup",
  };
  return <span className={cn("size-2 shrink-0 rounded-full", cores[fase], className)} />;
}
