import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { validateAnswers, visibleQuestions, type FollowUpAnswers, type FollowUpScores } from "@/lib/followUp";

interface Props {
  /** The visitor's own report token: it authorises saving their answers. */
  token: string;
  onComplete: (result: { scores: FollowUpScores; overallScore: number }) => void;
}

// Optional second step of the free scan. Tap-to-answer only (no typing), about two minutes,
// and the two locked report categories turn into real scores when it's done.
export function FollowUpCard({ token, onComplete }: Props) {
  const { toast } = useToast();
  const [answers, setAnswers] = useState<FollowUpAnswers>({});
  const [saving, setSaving] = useState(false);

  const questions = useMemo(() => visibleQuestions(answers), [answers]);
  const answered = questions.filter((q) => answers[q.id]).length;
  const checked = validateAnswers(answers);

  const choose = (id: string, value: string) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const submit = async () => {
    if (!checked.ok || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-followup", { body: { token, answers: checked.answers } });
      if (error) {
        let message: string | undefined;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (typeof body?.error === "string") message = body.error;
        } catch { /* generic message below */ }
        throw new Error(message ?? "We couldn't save your answers. Please try again.");
      }
      if (!data?.scores) throw new Error("We couldn't save your answers. Please try again.");
      onComplete({ scores: data.scores, overallScore: data.overallScore });
    } catch (e) {
      toast({ title: "Couldn't save your answers", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-4">
          <Unlock className="h-6 w-6 text-primary shrink-0 mt-1" />
          <div>
            <h3 className="text-xl font-semibold">Unlock your full score</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Two parts of your marketing can&apos;t be seen from a website: how fast you reply, and how you follow up.
              Tap your answers (about 2 minutes) and we&apos;ll add them to your report.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6" aria-live="polite">
          <Progress value={(answered / questions.length) * 100} className="h-2" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{answered} of {questions.length}</span>
        </div>

        <div className="space-y-6">
          {questions.map((q) => (
            <fieldset key={q.id}>
              <legend className="text-sm font-medium mb-2">{q.text}</legend>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const selected = answers[q.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => choose(q.id, o.value)}
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm transition-colors min-h-[40px]",
                        selected ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border",
                      )}
                    >
                      {selected && <CheckCircle2 className="inline h-4 w-4 mr-1.5 -mt-0.5" />}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <Button size="lg" className="w-full mt-8" disabled={!checked.ok || saving} onClick={submit}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
          {saving ? "Saving…" : checked.ok ? "Unlock my full score" : `Answer all ${questions.length} to unlock`}
        </Button>
      </CardContent>
    </Card>
  );
}
