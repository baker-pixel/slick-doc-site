import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Calendar, Clock, CheckCircle, AlertCircle, PenLine } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { SignatureModal } from "./SignatureModal";

interface ClientAgreementsTabProps {
  clientAccountId: string;
}

interface ServiceAgreement {
  id: string;
  title: string;
  description: string | null;
  agreement_type: string;
  file_url: string | null;
  file_name: string | null;
  status: string;
  effective_date: string | null;
  expiration_date: string | null;
  signed_at: string | null;
  signature_data: string | null;
  signer_name: string | null;
  created_at: string;
}

export function ClientAgreementsTab({ clientAccountId }: ClientAgreementsTabProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [signingAgreement, setSigningAgreement] = useState<ServiceAgreement | null>(null);
  const queryClient = useQueryClient();

  const { data: agreements, isLoading } = useQuery({
    queryKey: ['client-agreements', clientAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_agreements')
        .select('*')
        .eq('client_account_id', clientAccountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ServiceAgreement[];
    },
  });

  const signMutation = useMutation({
    mutationFn: async ({ agreementId, signatureData, signerName, agreementTitle }: { agreementId: string; signatureData: string; signerName: string; agreementTitle: string }) => {
      const signedAt = new Date().toISOString();
      
      const { error } = await supabase
        .from('service_agreements')
        .update({
          signature_data: signatureData,
          signer_name: signerName,
          signed_at: signedAt,
          status: 'active',
        })
        .eq('id', agreementId);

      if (error) throw error;

      // Send notification to admin
      try {
        await supabase.functions.invoke('send-client-notification', {
          body: {
            type: 'agreement_signed',
            client_account_id: clientAccountId,
            title: agreementTitle,
            // Admin email is now fetched from admin_settings table in edge function
            details: {
              signer_name: signerName,
              signed_at: new Date(signedAt).toLocaleString(),
            },
          },
        });
      } catch (notifyError) {
        console.error('Failed to send admin notification:', notifyError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-agreements', clientAccountId] });
      toast.success("Agreement signed successfully!");
      setSigningAgreement(null);
    },
    onError: (error) => {
      console.error('Sign error:', error);
      toast.error("Failed to sign agreement");
    },
  });

  const handleDownload = async (agreement: ServiceAgreement) => {
    if (!agreement.file_url) {
      toast.error("No file available for download");
      return;
    }

    setDownloading(agreement.id);
    try {
      const { data, error } = await supabase.storage
        .from('service-agreements')
        .download(agreement.file_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = agreement.file_name || 'agreement.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Agreement downloaded successfully");
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download agreement");
    } finally {
      setDownloading(null);
    }
  };

  const handleSign = (signatureData: string, signerName: string) => {
    if (!signingAgreement) return;
    signMutation.mutate({
      agreementId: signingAgreement.id,
      signatureData,
      signerName,
      agreementTitle: signingAgreement.title,
    });
  };

  const getStatusBadge = (status: string, signed: boolean) => {
    if (signed) {
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Signed</Badge>;
    }
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pending Signature</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAgreementTypeLabel = (type: string) => {
    switch (type) {
      case 'contract': return 'Service Contract';
      case 'sow': return 'Scope of Work';
      case 'nda': return 'Non-Disclosure Agreement';
      case 'addendum': return 'Contract Addendum';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Service Agreements</h2>
        <p className="text-muted-foreground">View, download, and sign your service agreements.</p>
      </div>

      {!agreements || agreements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">No service agreements available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agreements.map((agreement) => {
            const isSigned = !!agreement.signed_at;
            const needsSignature = agreement.status === 'pending' && !isSigned;

            return (
              <Card key={agreement.id} className={needsSignature ? "border-yellow-500/50" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        {agreement.title}
                      </CardTitle>
                      <CardDescription>{getAgreementTypeLabel(agreement.agreement_type)}</CardDescription>
                    </div>
                    {getStatusBadge(agreement.status, isSigned)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {agreement.description && (
                    <p className="text-sm text-muted-foreground">{agreement.description}</p>
                  )}

                  <div className="flex flex-wrap gap-4 text-sm">
                    {agreement.effective_date && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Effective: {format(new Date(agreement.effective_date), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                    {agreement.expiration_date && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Expires: {format(new Date(agreement.expiration_date), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                    {isSigned && (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>
                          Signed by {agreement.signer_name} on {format(new Date(agreement.signed_at!), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Show signature image if signed */}
                  {isSigned && agreement.signature_data && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-2">Signature:</p>
                      <img 
                        src={agreement.signature_data} 
                        alt="Signature" 
                        className="max-h-16 bg-white rounded border"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {agreement.file_url ? (
                      <Button 
                        variant="outline" 
                        onClick={() => handleDownload(agreement)}
                        disabled={downloading === agreement.id}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {downloading === agreement.id ? 'Downloading...' : 'Download'}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        <span>Document pending upload</span>
                      </div>
                    )}

                    {needsSignature && (
                      <Button onClick={() => setSigningAgreement(agreement)}>
                        <PenLine className="h-4 w-4 mr-2" />
                        Sign Agreement
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {signingAgreement && (
        <SignatureModal
          isOpen={!!signingAgreement}
          onClose={() => setSigningAgreement(null)}
          onSign={handleSign}
          agreementTitle={signingAgreement.title}
          isLoading={signMutation.isPending}
        />
      )}
    </div>
  );
}
