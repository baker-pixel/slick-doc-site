import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentReviewPanel } from "./ContentReviewPanel";
import DeliverablesAdminPanel from "./DeliverablesAdminPanel";

interface WorkPanelProps {
  clientId?: string;
  adminPassword: string;
}

// "Content" and "Approvals" used to be two sidebar items pointing at the
// exact same component. Deliverables is a second, structurally distinct
// "stuff awaiting client sign-off" queue (a different table, uploaded
// files rather than generated_content) that belongs next to it, not in
// its own separate nav item.
export function WorkPanel({ clientId, adminPassword }: WorkPanelProps) {
  return (
    <Tabs defaultValue="content" className="space-y-4">
      <TabsList>
        <TabsTrigger value="content">Content</TabsTrigger>
        <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
      </TabsList>
      <TabsContent value="content">
        <ContentReviewPanel clientId={clientId} adminPassword={adminPassword} />
      </TabsContent>
      <TabsContent value="deliverables">
        <DeliverablesAdminPanel adminPassword={adminPassword} clientId={clientId} />
      </TabsContent>
    </Tabs>
  );
}
