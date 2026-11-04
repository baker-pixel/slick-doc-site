import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
          error:
            "group-[.toaster]:!bg-rose-50 group-[.toaster]:!text-rose-900 group-[.toaster]:!border-rose-200 dark:group-[.toaster]:!bg-rose-950/60 dark:group-[.toaster]:!text-rose-100 dark:group-[.toaster]:!border-rose-900/50",
          success:
            "group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-900 group-[.toaster]:!border-emerald-200 dark:group-[.toaster]:!bg-emerald-950/60 dark:group-[.toaster]:!text-emerald-100 dark:group-[.toaster]:!border-emerald-900/50",
          warning:
            "group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-900 group-[.toaster]:!border-amber-200 dark:group-[.toaster]:!bg-amber-950/60 dark:group-[.toaster]:!text-amber-100 dark:group-[.toaster]:!border-amber-900/50",
          info:
            "group-[.toaster]:!bg-sky-50 group-[.toaster]:!text-sky-900 group-[.toaster]:!border-sky-200 dark:group-[.toaster]:!bg-sky-950/60 dark:group-[.toaster]:!text-sky-100 dark:group-[.toaster]:!border-sky-900/50",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
