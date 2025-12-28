import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmDialog({ 
  title, 
  message, 
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm, 
  onCancel,
  isDestructive = false,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm glass-strong rounded-2xl p-6 text-center animate-scale-in">
        <h2 className="text-xl font-semibold text-foreground mb-3">{title}</h2>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? "destructive" : "default"}
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
