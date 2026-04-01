import { useMemo } from "react";
import { format, subDays, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ContactSubmission {
  id: string;
  status: string;
  created_at: string;
}

interface GapAnalysisData {
  id: string;
  status: string;
  created_at: string;
}

interface AdminAnalyticsSectionProps {
  contacts: ContactSubmission[];
  gapAnalyses: GapAnalysisData[];
  reportPeriod: 'week' | 'month';
  setReportPeriod: (period: 'week' | 'month') => void;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

export function AdminAnalyticsSection({ 
  contacts, 
  gapAnalyses, 
  reportPeriod, 
  setReportPeriod 
}: AdminAnalyticsSectionProps) {
  const analyticsData = useMemo(() => {
    const last30Days: { date: string; contacts: number; gaps: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last30Days.push({ date: dateStr, contacts: 0, gaps: 0 });
    }
    
    contacts.forEach(c => {
      const dateStr = new Date(c.created_at).toISOString().split('T')[0];
      const entry = last30Days.find(d => d.date === dateStr);
      if (entry) entry.contacts++;
    });
    
    gapAnalyses.forEach(g => {
      const dateStr = new Date(g.created_at).toISOString().split('T')[0];
      const entry = last30Days.find(d => d.date === dateStr);
      if (entry) entry.gaps++;
    });

    return last30Days.map(d => ({ ...d, date: format(new Date(d.date), 'MMM d') }));
  }, [contacts, gapAnalyses]);

  const contactStatusData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    contacts.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [contacts]);

  const gapStatusData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    gapAnalyses.forEach(g => { statusCounts[g.status] = (statusCounts[g.status] || 0) + 1; });
    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [gapAnalyses]);

  const generatePDFReport = () => {
    const today = new Date();
    const startDate = reportPeriod === 'week' ? subDays(today, 7) : subMonths(today, 1);
    const periodLabel = reportPeriod === 'week' ? 'Weekly' : 'Monthly';
    
    const periodContacts = contacts.filter(c => new Date(c.created_at) >= startDate);
    const periodGaps = gapAnalyses.filter(g => new Date(g.created_at) >= startDate);
    
    const contactsByStatus: Record<string, number> = {};
    periodContacts.forEach(c => { contactsByStatus[c.status] = (contactsByStatus[c.status] || 0) + 1; });
    
    const gapsByStatus: Record<string, number> = {};
    periodGaps.forEach(g => { gapsByStatus[g.status] = (gapsByStatus[g.status] || 0) + 1; });

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`${periodLabel} Summary Report`, pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${format(startDate, 'MMM d, yyyy')} - ${format(today, 'MMM d, yyyy')}`, pageWidth / 2, 30, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary Statistics', 14, 52);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Contact Submissions: ${periodContacts.length}`, 14, 62);
    doc.text(`Total Gap Analysis Submissions: ${periodGaps.length}`, 14, 70);

    const contactStatusRows = Object.entries(contactsByStatus).map(([status, count]) => [status, count.toString()]);
    if (contactStatusRows.length > 0) {
      autoTable(doc, {
        startY: 85,
        head: [['Status', 'Count']],
        body: contactStatusRows,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
      });
    }

    doc.save(`${periodLabel.toLowerCase()}-report-${format(today, 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submissions Over Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="contacts" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} name="Contacts" />
                <Area type="monotone" dataKey="gaps" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.6} name="Gap Analysis" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {contactStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={contactStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                      {contactStatusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No data</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gap Analysis Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {gapStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={gapStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                      {gapStatusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">No data</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Summary Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <Select value={reportPeriod} onValueChange={(v: 'week' | 'month') => setReportPeriod(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Last 7 days</SelectItem>
                  <SelectItem value="month">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generatePDFReport}>
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
