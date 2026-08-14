import { HelpCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsTouchDevice } from "@/hooks/use-is-touch";

function Trigger({
  onClick,
}: {
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="Ajuda"
    >
      <HelpCircle className="size-3.5" />
    </button>
  );
}

export function HelpTooltip({
  text,
  label,
}: {
  text: string;
  label?: React.ReactNode;
}) {
  const isTouch = useIsTouchDevice();

  if (isTouch) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Trigger />
        </DialogTrigger>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-left text-base">
              {label ?? "Ajuda"}
            </DialogTitle>
            <DialogDescription className="text-left text-sm">
              {text}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Trigger />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-center">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
