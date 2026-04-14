import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plug, CalendarDays, PenTool } from "lucide-react";
import { ClientIntegrationsTab } from "./ClientIntegrationsTab";
import { SocialFeedCalendar } from "./social/SocialFeedCalendar";
import { SocialPostComposer } from "./social/SocialPostComposer";

interface SocialMediaTabProps {
  clientAccountId: string;
}

export function SocialMediaTab({ clientAccountId }: SocialMediaTabProps) {
  const [subTab, setSubTab] = useState("composer");

  return (
    <div className="space-y-6">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="composer" className="gap-1.5">
            <PenTool className="h-3.5 w-3.5" />
            Composer
          </TabsTrigger>
          <TabsTrigger value="feed" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Feed & Calendar
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5">
            <Plug className="h-3.5 w-3.5" />
            Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="composer" className="mt-6">
          <SocialPostComposer clientAccountId={clientAccountId} />
        </TabsContent>

        <TabsContent value="feed" className="mt-6">
          <SocialFeedCalendar clientAccountId={clientAccountId} />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <ClientIntegrationsTab clientAccountId={clientAccountId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
