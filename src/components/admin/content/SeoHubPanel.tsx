import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import SeoAnalysisDashboard from "./SeoAnalysisDashboard";
import { WordPressSeoPanel } from "./WordPressSeoPanel";
import { Users } from "lucide-react";

interface SeoHubPanelProps {
  selectedClientId?: string;
  selectedClientName?: string;
}

// WordPressSeoPanel is SeoAnalysisDashboard scoped to one client, reading
// the same seo_audits table -- these were two separate sidebar items
// ("SEO" and "WP Plugin") for what a user experiences as one job: check
// SEO health, either across all clients or for the one currently selected.
export function SeoHubPanel({ selectedClientId, selectedClientName }: SeoHubPanelProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">All Clients</TabsTrigger>
        <TabsTrigger value="client">
          {selectedClientName ? `${selectedClientName}` : "Selected Client"}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <SeoAnalysisDashboard />
      </TabsContent>
      <TabsContent value="client">
        {selectedClientId ? (
          <WordPressSeoPanel clientId={selectedClientId} clientName={selectedClientName} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Select a client from Home to see their WordPress connection and per-client SEO detail.</p>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
