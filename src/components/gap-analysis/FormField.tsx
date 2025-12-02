import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required,
  optional,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
        {optional && (
          <span className="text-muted-foreground ml-1 font-normal">(optional)</span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export function TextInput({ error, className, ...props }: TextInputProps) {
  return (
    <>
      <input
        className={cn(
          "w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
          error ? "border-destructive" : "border-border",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export function TextArea({ error, className, ...props }: TextAreaProps) {
  return (
    <>
      <textarea
        className={cn(
          "w-full px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none transition-colors",
          error ? "border-destructive" : "border-border",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </>
  );
}

interface YesNoToggleProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
}

export function YesNoToggle({ value, onChange }: YesNoToggleProps) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          "px-6 py-2 rounded-lg border transition-colors font-medium",
          value === true
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background border-border hover:border-primary/50"
        )}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          "px-6 py-2 rounded-lg border transition-colors font-medium",
          value === false
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background border-border hover:border-primary/50"
        )}
      >
        No
      </button>
    </div>
  );
}

interface SliderInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  suffix?: string;
}

export function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  showValue = true,
  suffix = "%",
}: SliderInputProps) {
  return (
    <div className="space-y-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
      />
      {showValue && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{min}{suffix}</span>
          <span className="font-medium text-foreground">{value}{suffix}</span>
          <span>{max}{suffix}</span>
        </div>
      )}
    </div>
  );
}
