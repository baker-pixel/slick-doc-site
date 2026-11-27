import { format } from "date-fns";
import { ExternalLink, Mail, Share2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCyclePosts } from "@/hooks/use-cycle-metrics";
import { fmtNum } from "@/lib/analyticsInsights";

const PLATFORM: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", twitter: "X", threads: "Threads", bluesky: "Bluesky", tiktok: "TikTok",
};

interface Props {
  clientAccountId: string;
  start: string;
  end: string;
  outreach: { started: number; leads: number };
  closed?: boolean;
}

/** The work itself: the posts published in this cycle and the outreach started, so the numbers have a source. */
export function WhatWeDid({ clientAccountId, start, end, outreach, closed = false }: Props) {
  const { data, isLoading } = useCyclePosts(clientAccountId, start, end);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
      <h3 className="text-sm font-semibold">What we did this cycle</h3>

      <div className="mt-4 flex items-center gap-2 text-sm">
        <Mail className="h-4 w-4 text-primary shrink-0" />
        {outreach.started > 0 || outreach.leads > 0
          ? <span>Started outreach to <strong className="tabular-nums">{fmtNum(outreach.started)}</strong> prospects and found <strong className="tabular-nums">{fmtNum(outreach.leads)}</strong> new leads.</span>
          : <span className="text-muted-foreground">{closed ? "No outreach was started in this cycle." : "No outreach started yet this cycle."}</span>}
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm">
        <Share2 className="h-4 w-4 text-primary shrink-0" />
        {isLoading ? <Skeleton className="h-4 w-48" /> : (
          <span>
            {data && data.total > 0
              ? <>Published <strong className="tabular-nums">{fmtNum(data.total)}</strong> {data.total === 1 ? "post" : "posts"}{data.total > data.posts.length ? `, newest ${data.posts.length} shown` : ""}:</>
              : <span className="text-muted-foreground">{closed ? "No posts were published in this cycle." : "No posts published yet this cycle."}</span>}
          </span>
        )}
      </div>

      {data && data.posts.length > 0 && (
        <ul className="mt-3 divide-y divide-border/50">
          {data.posts.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      {p.title}<ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ) : p.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM[p.platform ?? ""] ?? p.platform ?? "—"} · {format(new Date(p.published_at), "MMM d")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{p.views === null ? "—" : fmtNum(p.views)}</p>
                <p className="text-[11px] text-muted-foreground">views</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.posts.some((p) => p.views === null) && (
        <p className="mt-2 text-xs text-muted-foreground">A dash means the platform doesn't report views for that post. It does not mean zero.</p>
      )}
    </div>
  );
}
