import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarRange, Link2, PenTool } from "lucide-react";
import { ClientIntegrationsTab } from "./ClientIntegrationsTab";
import { SocialPostComposer } from "./social/SocialPostComposer";
import { PostingPlanCard } from "./social/PostingPlanCard";
import { BrandVoiceButton } from "./BrandVoiceButton";

interface SocialMediaTabProps {
  clientAccountId: string;
  initialTab?: "composer" | "accounts" | "plan";
  onTabChange?: (tab: string) => void;
  onOpenBrandVoice?: () => void;
}

export function SocialMediaTab({ clientAccountId, initialTab = "accounts", onTabChange, onOpenBrandVoice }: SocialMediaTabProps) {
  const [subTab, setSubTab] = useState<string>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Social & Accounts</h2>
          <p className="text-muted-foreground">
            Create posts and manage connected social accounts. See the Calendar tab for your full posting schedule.
          </p>
        </div>
        {onOpenBrandVoice && <BrandVoiceButton onClick={onOpenBrandVoice} label="Posts don't sound right? Edit brand voice" />}
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="composer" className="gap-1.5">
            <PenTool className="h-3.5 w-3.5" />
            Composer
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Connected Accounts
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            Posting Plan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="composer" className="mt-6">
          <SocialPostComposer clientAccountId={clientAccountId} />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <ClientIntegrationsTab clientAccountId={clientAccountId} onTabChange={onTabChange} />
        </TabsContent>

        <TabsContent value="plan" className="mt-6">
          <PostingPlanCard clientAccountId={clientAccountId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
