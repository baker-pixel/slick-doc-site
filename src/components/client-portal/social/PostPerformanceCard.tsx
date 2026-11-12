import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Eye, Heart, Info, MessageCircle, MousePointerClick, Share2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PostMetricsRow {
  calendar_id: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  saves: number | null;
  engagements: number | null;
  fetched_at: string;
}

interface PublishedPost {
  id: string;
  title: string;
  platform: string | null;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  threads: "Threads",
  bluesky: "Bluesky",
  tiktok: "TikTok",
};

const hasNoData = (m: PostMetricsRow) =>
  [m.views, m.reach, m.likes, m.comments, m.shares, m.clicks, m.engagements].every((v) => v === null);

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());
const sumOf = (vals: Array<number | null | undefined>) => vals.reduce<number>((a, v) => a + (v ?? 0), 0);

interface Props {
  clientAccountId: string;
}

// Impressions and engagement for every social post we've published for this client.
// Numbers come from sync-post-metrics (Post for Me feed) and are running totals per post.
// A dash means the platform doesn't report that number -- it never means zero.
export function PostPerformanceCard({ clientAccountId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["post-performance", clientAccountId],
    queryFn: async () => {
      const { data: posts, error } = await supabase
        .from("content_calendar")
        .select("id, title, platform, published_at, metadata")
        .eq("client_account_id", clientAccountId)
        .eq("status", "published")
        .not("postforme_post_id", "is", null)
        .order("published_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const ids = (posts ?? []).map((p) => p.id);
      const metrics = new Map<string, PostMetricsRow>();
      for (let i = 0; i < ids.length; i += 100) {
        // post_metrics isn't in the generated types yet.
        const { data: rows, error: mErr } = await (supabase as unknown as {
          from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: PostMetricsRow[] | null; error: Error | null }> } };
        })
          .from("post_metrics")
          .select("calendar_id, views, reach, likes, comments, shares, clicks, saves, engagements, fetched_at")
          .in("calendar_id", ids.slice(i, i + 100));
        if (mErr) throw mErr;
        for (const r of rows ?? []) metrics.set(r.calendar_id, r);
      }
      return { posts: (posts ?? []) as PublishedPost[], metrics };
    },
    staleTime: 60_000,
  });

  const totals = useMemo(() => {
    // Rows we asked about but the platform returned nothing for don't count as "measured".
    const rows = data ? [...data.metrics.values()].filter((r) => !hasNoData(r)) : [];
    return {
      views: sumOf(rows.map((r) => r.views)),
      reach: sumOf(rows.map((r) => r.reach)),
      engagements: sumOf(rows.map((r) => r.engagements)),
      likes: sumOf(rows.map((r) => r.likes)),
      comments: sumOf(rows.map((r) => r.comments)),
      shares: sumOf(rows.map((r) => r.shares)),
      clicks: sumOf(rows.map((r) => r.clicks)),
      measured: rows.length,
      lastSync: rows.length ? rows.map((r) => r.fetched_at).sort().at(-1)! : null,
    };
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const posts = data?.posts ?? [];
  if (posts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post performance</CardTitle>
          <CardDescription>Impressions and engagement will appear here once your first social post is published.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const stats = [
    { label: "Views / impressions", value: totals.views, icon: Eye },
    { label: "People reached", value: totals.reach, icon: Users },
    { label: "Engagements", value: totals.engagements, icon: Heart },
    { label: "Comments", value: totals.comments, icon: MessageCircle },
    { label: "Shares", value: totals.shares, icon: Share2 },
    { label: "Link clicks", value: totals.clicks, icon: MousePointerClick },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post performance</CardTitle>
        <CardDescription>
          How your published social posts are doing. Totals cover {totals.measured} of {posts.length} posts
          {totals.lastSync ? ` · updated ${formatDistanceToNow(new Date(totals.lastSync), { addSuffix: true })}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {totals.measured === 0 ? (
          <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              No numbers yet. They are collected a few hours after a post goes live and refreshed several times a day. Some
              platforms (such as personal LinkedIn profiles) don't share post statistics at all.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Post</th>
                <th className="px-2 py-2 text-right font-medium">Views</th>
                <th className="px-2 py-2 text-right font-medium">Reach</th>
                <th className="px-2 py-2 text-right font-medium">Likes</th>
                <th className="px-2 py-2 text-right font-medium">Comments</th>
                <th className="px-2 py-2 text-right font-medium">Shares</th>
                <th className="px-2 py-2 text-right font-medium">Clicks</th>
                <th className="py-2 pl-2 text-right font-medium">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const m = data?.metrics.get(p.id);
                const url = typeof p.metadata?.platform_post_url === "string" ? p.metadata.platform_post_url : null;
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="max-w-[16rem] py-2 pr-3">
                      <div className="truncate font-medium">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {p.title}
                          </a>
                        ) : (
                          p.title
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {PLATFORM_LABEL[p.platform ?? ""] ?? p.platform ?? "—"}
                        </Badge>
                        {p.published_at && format(new Date(p.published_at), "d MMM yyyy")}
                      </div>
                    </td>
                    {m && hasNoData(m) ? (
                      <td colSpan={7} className="px-2 py-2 text-right text-xs italic text-muted-foreground">
                        Stats unavailable for this post
                      </td>
                    ) : (
                      <>
                    <td className="px-2 py-2 text-right tabular-nums">{m ? fmt(m.views) : "…"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m ? fmt(m.reach) : "…"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m ? fmt(m.likes) : "…"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m ? fmt(m.comments) : "…"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m ? fmt(m.shares) : "…"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{m ? fmt(m.clicks) : "…"}</td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">{m ? fmt(m.engagements) : "…"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          “…” means we haven't collected numbers for that post yet; “—” means the platform doesn't report that figure; “Stats unavailable” means the platform didn't return any numbers for that post (for example, Facebook reports reach but not views, and LinkedIn and X report views but not reach). Compare posts within one platform, not across platforms.
        </p>
      </CardContent>
    </Card>
  );
}
