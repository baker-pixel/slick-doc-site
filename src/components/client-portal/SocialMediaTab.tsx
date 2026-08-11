import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, PenTool } from "lucide-react";
import { ClientIntegrationsTab } from "./ClientIntegrationsTab";
import { SocialPostComposer } from "./social/SocialPostComposer";

interface SocialMediaTabProps {
  clientAccountId: string;
  initialTab?: "composer" | "accounts";
  onTabChange?: (tab: string) => void;
}

export function SocialMediaTab({ clientAccountId, initialTab = "accounts", onTabChange }: SocialMediaTabProps) {
  const [subTab, setSubTab] = useState<string>(initialTab);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Social & Accounts</h2>
        <p className="text-muted-foreground">
          Create posts and manage connected social accounts. See the Calendar tab for your full posting schedule.
        </p>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="composer" className="gap-1.5">
            <PenTool className="h-3.5 w-3.5" />
            Composer
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Connected Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="composer" className="mt-6">
          <SocialPostComposer clientAccountId={clientAccountId} />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <ClientIntegrationsTab clientAccountId={clientAccountId} onTabChange={onTabChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
