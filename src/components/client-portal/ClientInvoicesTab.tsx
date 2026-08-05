import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Receipt, CreditCard, CheckCircle, Clock, AlertCircle, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface LineItems {
  items?: LineItem[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  description: string | null;
  line_items: LineItems | null;
  created_at: string;
}

interface ClientInvoicesTabProps {
  clientAccountId: string;
}

export default function ClientInvoicesTab({ clientAccountId }: ClientInvoicesTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    fetchInvoices();

    // Subscribe to real-time updates for invoices
    const channel = supabase
      .channel('client-invoices-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_invoices',
          filter: `client_account_id=eq.${clientAccountId}`,
        },
        () => {
          fetchInvoices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientAccountId]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("client_account_id", clientAccountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvoices((data || []).map(item => ({
        ...item,
        line_items: item.line_items as LineItems | null,
      })));
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const getStatusBadge = (status: string, dueDate: string) => {
    const isPastDue = new Date(dueDate) < new Date() && status === "pending";
    
    if (status === "paid") {
      return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
    }
    if (isPastDue) {
      return <Badge className="bg-red-100 text-red-800">Past Due</Badge>;
    }
    if (status === "pending") {
      return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
  };

  // No payment processor is wired up yet (would need Stripe or similar
  // configured server-side). Rather than a fake "redirecting to payment"
  // message that does nothing, this opens a real email to arrange payment.
  const handlePayNow = (invoice: Invoice) => {
    const subject = encodeURIComponent(`Payment for Invoice ${invoice.invoice_number}`);
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to pay invoice ${invoice.invoice_number} for ${formatCurrency(Number(invoice.amount), invoice.currency)}, due ${format(new Date(invoice.due_date), "MMM d, yyyy")}.\n\nPlease send payment instructions.\n\nThanks!`
    );
    window.open(`mailto:hello@orangedoormarketing.com?subject=${subject}&body=${body}`, "_blank");
    toast({
      title: "Let's get this paid",
      description: "We've opened an email to our billing team to arrange payment for this invoice.",
    });
  };

  const handleDownloadPdf = (invoice: Invoice) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Invoice ${invoice.invoice_number}`, 14, 20);

    doc.setFontSize(11);
    let y = 32;
    doc.text(`Status: ${invoice.status}`, 14, y);
    y += 7;
    doc.text(`Amount: ${formatCurrency(Number(invoice.amount), invoice.currency)}`, 14, y);
    y += 7;
    doc.text(`Due date: ${format(new Date(invoice.due_date), "MMM d, yyyy")}`, 14, y);
    if (invoice.paid_at) {
      y += 7;
      doc.text(`Paid on: ${format(new Date(invoice.paid_at), "MMM d, yyyy")}`, 14, y);
    }
    if (invoice.description) {
      y += 7;
      doc.text(`Description: ${invoice.description}`, 14, y);
    }

    const items = invoice.line_items?.items;
    if (items && items.length > 0) {
      autoTable(doc, {
        startY: y + 8,
        head: [["Description", "Qty", "Unit Price", "Total"]],
        body: items.map((item) => [
          item.description,
          String(item.quantity),
          formatCurrency(item.unit_price, invoice.currency),
          formatCurrency(item.total, invoice.currency),
        ]),
      });
    }

    doc.save(`invoice-${invoice.invoice_number}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate summary stats
  const totalOutstanding = invoices
    .filter((i) => i.status === "pending")
    .reduce((sum, i) => sum + Number(i.amount), 0);
  
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const pendingInvoices = invoices.filter((i) => i.status === "pending");
  const paidInvoices = invoices.filter((i) => i.status === "paid");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Invoices & Payments</h2>
        <p className="text-muted-foreground">View and manage your billing</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium">Outstanding Balance</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingInvoices.length} pending invoice{pendingInvoices.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Total Paid</span>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {paidInvoices.length} paid invoice{paidInvoices.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Receipt className="h-4 w-4" />
              <span className="text-sm font-medium">Total Invoices</span>
            </div>
            <p className="text-2xl font-bold">{invoices.length}</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No Invoices Yet</h3>
            <p className="text-muted-foreground">Your invoices will appear here once generated.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pending Invoices */}
          {pendingInvoices.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                Pending Payment ({pendingInvoices.length})
              </h3>
              <div className="grid gap-4">
                {pendingInvoices.map((invoice) => (
                  <Card 
                    key={invoice.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-yellow-500"
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="font-semibold">{invoice.invoice_number}</p>
                            {getStatusBadge(invoice.status, invoice.due_date)}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {invoice.description || "Monthly services"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Due: {format(new Date(invoice.due_date), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">{formatCurrency(Number(invoice.amount), invoice.currency)}</p>
                          <Button 
                            size="sm" 
                            className="mt-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePayNow(invoice);
                            }}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Request Payment Instructions
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Paid Invoices */}
          {paidInvoices.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Payment History ({paidInvoices.length})
              </h3>
              <div className="grid gap-4">
                {paidInvoices.map((invoice) => (
                  <Card 
                    key={invoice.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow opacity-75"
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="font-semibold">{invoice.invoice_number}</p>
                            {getStatusBadge(invoice.status, invoice.due_date)}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {invoice.description || "Monthly services"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Paid: {invoice.paid_at ? format(new Date(invoice.paid_at), "MMM d, yyyy") : "N/A"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold">{formatCurrency(Number(invoice.amount), invoice.currency)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle>Invoice {selectedInvoice.invoice_number}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  {getStatusBadge(selectedInvoice.status, selectedInvoice.due_date)}
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold">{formatCurrency(Number(selectedInvoice.amount), selectedInvoice.currency)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due Date</span>
                  <span>{format(new Date(selectedInvoice.due_date), "MMM d, yyyy")}</span>
                </div>

                {selectedInvoice.paid_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid On</span>
                    <span>{format(new Date(selectedInvoice.paid_at), "MMM d, yyyy")}</span>
                  </div>
                )}

                {selectedInvoice.description && (
                  <div>
                    <span className="text-muted-foreground text-sm">Description</span>
                    <p className="mt-1">{selectedInvoice.description}</p>
                  </div>
                )}

                {selectedInvoice.line_items?.items && selectedInvoice.line_items.items.length > 0 && (
                  <div className="border-t pt-4">
                    <span className="text-sm font-medium">Line Items</span>
                    <div className="mt-2 space-y-2">
                      {selectedInvoice.line_items.items.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>{item.description} (x{item.quantity})</span>
                          <span>{formatCurrency(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  {selectedInvoice.status === "pending" && (
                    <Button className="flex-1" onClick={() => handlePayNow(selectedInvoice)}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Request Payment Instructions
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" onClick={() => handleDownloadPdf(selectedInvoice)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
