import { useState } from "react";
import { ConnectSitePanel } from "./ConnectSitePanel";
import { WpFixQueuePanel } from "./WpFixQueuePanel";
import { SeoScoreCard } from "@/components/admin/shared/SeoScoreCard";

interface Props {
  clientId: string;
  clientName?: string;
}

export function WordPressSeoPanel({ clientId, clientName }: Props) {
  const [siteId, setSiteId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <ConnectSitePanel
            clientId={clientId}
            mode="admin"
            onSiteConnected={setSiteId}
          />
        </div>
        <div>
          {siteId && <SeoScoreCard siteId={siteId} />}
        </div>
      </div>

      {siteId && <WpFixQueuePanel siteId={siteId} />}
    </div>
  );
}
