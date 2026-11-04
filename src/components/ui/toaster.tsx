import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

const ICONS = {
  destructive: <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />,
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />,
  warning: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />,
  info: <Info className="h-5 w-5 shrink-0 text-sky-500" />,
} as const;

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const icon = props.variant ? ICONS[props.variant as keyof typeof ICONS] : null;
        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-3">
              {icon}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
