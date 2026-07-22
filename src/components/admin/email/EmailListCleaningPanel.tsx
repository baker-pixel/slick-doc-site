import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, AlertTriangle, CheckCircle2, RefreshCw, Users, Mail, TrendingDown, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeErrorMessage, friendlyEdgeMessage } from "@/lib/edge-error";
import { format } from "date-fns";

interface CleanupCandidate {
  email: string;
  reason: string;
  lastActivity?: string;
  bounceCount?: number;
  complaintCount?: number;
}

interface CleanupLog {
  id: string;
  email: string;
  reason: string;
  cleaned_at: string;
  metadata?: Record<string, unknown>;
}

interface EmailListCleaningPanelProps {
  adminPassword: string;
}

export function EmailListCleaningPanel({ adminPassword }: EmailListCleaningPanelProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [candidates, setCandidates] = useState<CleanupCandidate[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [cleanupHistory, setCleanupHistory] = useState<CleanupLog[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(90);
  const [stats, setStats] = useState({
    totalEmails: 0,
    bouncedEmails: 0,
    inactiveEmails: 0,
    complainedEmails: 0,
    cleanedTotal: 0,
  });

  useEffect(() => {
    fetchCleanupHistory();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "get_list_health", password: adminPassword },
      });

      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to fetch list health stats");
      }
      if (response.data?.data) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch list health stats");
    }
  };

  const fetchCleanupHistory = async () => {
    try {
      const response = await supabase.functions.invoke("admin", {
        body: { action: "list", table: "email_cleanup_log", password: adminPassword },
      });

      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to fetch cleanup history");
      }
      setCleanupHistory(response.data?.data || []);
    } catch (error) {
      console.error("Error fetching cleanup history:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch cleanup history");
    }
  };

  const scanForCandidates = async () => {
    setIsScanning(true);
    setCandidates([]);
    setSelectedEmails(new Set());

    try {
      const response = await supabase.functions.invoke("admin", {
        body: { 
          action: "scan_cleanup_candidates", 
          password: adminPassword,
          data: { inactiveDays }
        },
      });

      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to scan for cleanup candidates");
      }

      const foundCandidates = response.data?.data || [];
      setCandidates(foundCandidates);

      if (foundCandidates.length === 0) {
        toast.success("No cleanup candidates found - your list is healthy!");
      } else {
        toast.info(`Found ${foundCandidates.length} emails to review`);
      }
    } catch (error) {
      console.error("Error scanning:", error);
      toast.error(error instanceof Error ? error.message : "Failed to scan for cleanup candidates");
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedEmails.size === candidates.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(candidates.map(c => c.email)));
    }
  };

  const toggleEmail = (email: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedEmails(newSelected);
  };

  const handleCleanup = async () => {
    if (selectedEmails.size === 0) {
      toast.error("No emails selected for cleanup");
      return;
    }

    setIsCleaning(true);
    setShowConfirmDialog(false);

    try {
      const emailsToClean = candidates.filter(c => selectedEmails.has(c.email));
      
      const response = await supabase.functions.invoke("admin", {
        body: { 
          action: "clean_emails", 
          password: adminPassword,
          data: { emails: emailsToClean }
        },
      });

      if (response.error) {
        const msg = await getEdgeErrorMessage(response.error, response.data);
        throw new Error(msg ? friendlyEdgeMessage(msg) : "Failed to clean emails");
      }

      toast.success(`Successfully cleaned ${selectedEmails.size} emails from the list`);
      setCandidates(candidates.filter(c => !selectedEmails.has(c.email)));
      setSelectedEmails(new Set());
      fetchCleanupHistory();
      fetchStats();
    } catch (error) {
      console.error("Error cleaning emails:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clean emails");
    } finally {
      setIsCleaning(false);
    }
  };

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case "bounced":
        return <Badge variant="destructive">Bounced</Badge>;
      case "complained":
        return <Badge className="bg-orange-500">Complained</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">{reason}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Emails</p>
                <p className="text-2xl font-bold">{stats.totalEmails}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Bounced</p>
                <p className="text-2xl font-bold text-destructive">{stats.bouncedEmails}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Complaints</p>
                <p className="text-2xl font-bold text-orange-500">{stats.complainedEmails}</p>
              </div>
              <Mail className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-bold text-muted-foreground">{stats.inactiveEmails}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cleaned Total</p>
                <p className="text-2xl font-bold text-green-500">{stats.cleanedTotal}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scan Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            List Cleaning Scanner
          </CardTitle>
          <CardDescription>
            Scan your email list for bounced, complained, or inactive subscribers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="inactive-days">Inactive threshold (days)</Label>
              <Input
                id="inactive-days"
                type="number"
                value={inactiveDays}
                onChange={(e) => setInactiveDays(parseInt(e.target.value) || 90)}
                className="w-32"
                min={30}
                max={365}
              />
            </div>
            <Button onClick={scanForCandidates} disabled={isScanning}>
              {isScanning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Scan for Cleanup
                </>
              )}
            </Button>
          </div>

          {candidates.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Found {candidates.length} cleanup candidates</AlertTitle>
              <AlertDescription>
                Review the list below and select emails to remove from your list.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Candidates Table */}
      {candidates.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Cleanup Candidates</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {selectedEmails.size === candidates.length ? "Deselect All" : "Select All"}
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={selectedEmails.size === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clean Selected ({selectedEmails.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.email}>
                    <TableCell>
                      <Checkbox
                        checked={selectedEmails.has(candidate.email)}
                        onCheckedChange={() => toggleEmail(candidate.email)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{candidate.email}</TableCell>
                    <TableCell>{getReasonBadge(candidate.reason)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {candidate.bounceCount && `${candidate.bounceCount} bounces`}
                      {candidate.complaintCount && `${candidate.complaintCount} complaints`}
                      {candidate.lastActivity && `Last active: ${format(new Date(candidate.lastActivity), "MMM d, yyyy")}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Cleanup History */}
      <Card>
        <CardHeader>
          <CardTitle>Cleanup History</CardTitle>
          <CardDescription>
            Recently cleaned emails from your list
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cleanupHistory.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No cleanup history yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Cleaned At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cleanupHistory.slice(0, 50).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{log.email}</TableCell>
                    <TableCell>{getReasonBadge(log.reason)}</TableCell>
                    <TableCell>{format(new Date(log.cleaned_at), "MMM d, yyyy HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm List Cleanup</DialogTitle>
            <DialogDescription>
              You are about to remove {selectedEmails.size} email(s) from your list. 
              These emails will be marked as unsubscribed and logged for compliance.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCleanup} disabled={isCleaning}>
              {isCleaning ? "Cleaning..." : `Remove ${selectedEmails.size} Emails`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
