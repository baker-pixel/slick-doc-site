import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Trash2, RefreshCw, Users, FileText } from "lucide-react";

interface ContactSubmission {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  website_url: string | null;
  marketing_challenge: string | null;
  status: string;
  created_at: string;
}

interface GapAnalysisSubmission {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [storedPassword, setStoredPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [gapAnalyses, setGapAnalyses] = useState<GapAnalysisSubmission[]>([]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredPassword(password);
    setIsAuthenticated(true);
    fetchData(password);
  };

  const fetchData = async (pwd: string) => {
    setIsLoading(true);
    try {
      const [contactsRes, gapRes] = await Promise.all([
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "contact_submissions", password: pwd },
        }),
        supabase.functions.invoke("admin", {
          body: { action: "list", table: "gap_analysis_submissions", password: pwd },
        }),
      ]);

      if (contactsRes.error) throw new Error(contactsRes.error.message);
      if (gapRes.error) throw new Error(gapRes.error.message);

      if (contactsRes.data?.error === "Unauthorized" || gapRes.data?.error === "Unauthorized") {
        setIsAuthenticated(false);
        toast({ title: "Invalid password", variant: "destructive" });
        return;
      }

      setContacts(contactsRes.data?.data || []);
      setGapAnalyses(gapRes.data?.data || []);
    } catch (error: any) {
      toast({ title: "Error fetching data", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (table: string, id: string, status: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "update", table, id, data: { status }, password: storedPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Status updated" });
      fetchData(storedPassword);
    } catch (error: any) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    }
  };

  const deleteRecord = async (table: string, id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin", {
        body: { action: "delete", table, id, password: storedPassword },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Record deleted" });
      fetchData(storedPassword);
    } catch (error: any) {
      toast({ title: "Error deleting record", description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-100 text-blue-800",
      contacted: "bg-yellow-100 text-yellow-800",
      qualified: "bg-green-100 text-green-800",
      converted: "bg-purple-100 text-purple-800",
      submitted: "bg-blue-100 text-blue-800",
      reviewed: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
    };
    return <Badge className={colors[status] || "bg-gray-100 text-gray-800"}>{status}</Badge>;
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20 min-h-[80vh] flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>Admin Access</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full">
                  Access Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20 pb-12">
        <div className="container-wide mx-auto section-padding">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-display font-semibold">Admin Dashboard</h1>
            <Button variant="outline" onClick={() => fetchData(storedPassword)} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{contacts.length}</p>
                    <p className="text-muted-foreground">Contact Submissions</p>
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
                    <p className="text-2xl font-semibold">{gapAnalyses.length}</p>
                    <p className="text-muted-foreground">Gap Analysis Submissions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="contacts" className="space-y-4">
            <TabsList>
              <TabsTrigger value="contacts">Contact Submissions</TabsTrigger>
              <TabsTrigger value="gap-analysis">Gap Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="contacts">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-4 font-medium">Name</th>
                          <th className="text-left p-4 font-medium">Business</th>
                          <th className="text-left p-4 font-medium">Email</th>
                          <th className="text-left p-4 font-medium">Status</th>
                          <th className="text-left p-4 font-medium">Date</th>
                          <th className="text-left p-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contacts.map((contact) => (
                          <tr key={contact.id} className="hover:bg-muted/30">
                            <td className="p-4">{contact.first_name} {contact.last_name}</td>
                            <td className="p-4">{contact.business_name}</td>
                            <td className="p-4">{contact.email}</td>
                            <td className="p-4">
                              <Select
                                value={contact.status}
                                onValueChange={(value) => updateStatus("contact_submissions", contact.id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="contacted">Contacted</SelectItem>
                                  <SelectItem value="qualified">Qualified</SelectItem>
                                  <SelectItem value="converted">Converted</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {new Date(contact.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteRecord("contact_submissions", contact.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </td>
                          </tr>
                        ))}
                        {contacts.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              No contact submissions yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gap-analysis">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-4 font-medium">Name</th>
                          <th className="text-left p-4 font-medium">Business</th>
                          <th className="text-left p-4 font-medium">Email</th>
                          <th className="text-left p-4 font-medium">Phone</th>
                          <th className="text-left p-4 font-medium">Status</th>
                          <th className="text-left p-4 font-medium">Date</th>
                          <th className="text-left p-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {gapAnalyses.map((gap) => (
                          <tr key={gap.id} className="hover:bg-muted/30">
                            <td className="p-4">{gap.first_name} {gap.last_name}</td>
                            <td className="p-4">{gap.business_name}</td>
                            <td className="p-4">{gap.email}</td>
                            <td className="p-4">{gap.phone || "-"}</td>
                            <td className="p-4">
                              <Select
                                value={gap.status}
                                onValueChange={(value) => updateStatus("gap_analysis_submissions", gap.id, value)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="submitted">Submitted</SelectItem>
                                  <SelectItem value="reviewed">Reviewed</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {new Date(gap.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete submission?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteRecord("gap_analysis_submissions", gap.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </td>
                          </tr>
                        ))}
                        {gapAnalyses.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-muted-foreground">
                              No gap analysis submissions yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Admin;
