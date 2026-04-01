import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, Mail } from "lucide-react";

interface AdminStatsCardsProps {
  contactsCount: number;
  gapAnalysesCount: number;
  pdfLeadsCount: number;
}

export function AdminStatsCards({ contactsCount, gapAnalysesCount, pdfLeadsCount }: AdminStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3 mb-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{contactsCount}</p>
              <p className="text-muted-foreground">Contacts</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{gapAnalysesCount}</p>
              <p className="text-muted-foreground">Gap Analyses</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{pdfLeadsCount}</p>
              <p className="text-muted-foreground">PDF Leads</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
