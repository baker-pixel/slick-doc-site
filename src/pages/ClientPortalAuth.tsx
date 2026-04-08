import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ClientPortalAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [existingUserMode, setExistingUserMode] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [invitation, setInvitation] = useState<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    client_account_id: string;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkClientPortalAccess(session.user.id);
      }
    });

    if (inviteToken) {
      loadInvitation(inviteToken);
    }
  }, [inviteToken]);

  const checkClientPortalAccess = async (userId: string) => {
    const { data } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      navigate("/portal");
    }
  };

  const loadInvitation = async (token: string) => {
    setIsAcceptingInvite(true);
    
    const { data, error } = await supabase
      .from("client_invitations")
      .select("id, email, first_name, last_name, client_account_id")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !data) {
      toast({
        title: "Invalid Invitation",
        description: "This invitation link is invalid or has expired.",
        variant: "destructive",
      });
      setIsAcceptingInvite(false);
      return;
    }

    setInvitation(data);
    setEmail(data.email);
    setIsAcceptingInvite(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/portal/auth`,
      });

      if (error) {
        toast({
          title: "Reset Failed",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setResetEmailSent(true);
      toast({
        title: "Check Your Email",
        description: "We've sent you a password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Sign In Failed",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!portalUser) {
        toast({
          title: "Access Denied",
          description: "You don't have access to the client portal.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      navigate("/portal");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    
    setLoading(true);

    try {
      if (existingUserMode) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });

        if (signInError) {
          toast({
            title: "Sign In Failed",
            description: "Incorrect password. Please try again.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const userId = signInData.user?.id;
        if (!userId) {
          toast({
            title: "Sign In Failed",
            description: "Could not access your account",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const { data: existingPortalUser } = await supabase
          .from("client_portal_users")
          .select("id")
          .eq("user_id", userId)
          .eq("client_account_id", invitation.client_account_id)
          .maybeSingle();

        if (!existingPortalUser) {
          const { error: portalError } = await supabase
            .from("client_portal_users")
            .insert({
              user_id: userId,
              client_account_id: invitation.client_account_id,
              first_name: invitation.first_name,
              last_name: invitation.last_name,
              invited_by: "admin",
            });

          if (portalError) {
            console.error("Portal user creation error:", portalError);
            toast({
              title: "Setup Failed",
              description: "Could not complete portal setup. Please contact support.",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }

        await supabase
          .from("client_invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);

        toast({
          title: "Welcome!",
          description: "You've been signed in successfully.",
        });

        navigate("/portal");
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/portal`,
        },
      });

      const isAlreadyRegistered =
        authError?.message?.toLowerCase().includes("already registered") ||
        (authError as any)?.code === "user_already_exists" ||
        // Auto-confirm: signUp returns 200 with an existing user whose identities array is empty
        (!authError && authData?.user && authData.user.identities?.length === 0);

      if (isAlreadyRegistered) {
        setExistingUserMode(true);
        setPassword("");
        toast({
          title: "Account Already Exists",
          description: "You already have an account. Please enter your existing password.",
        });
        setLoading(false);
        return;
      }

      if (authError) {
        toast({
          title: "Registration Failed",
          description: authError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        toast({
          title: "Registration Failed",
          description: "Could not create user account",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error: portalError } = await supabase
        .from("client_portal_users")
        .insert({
          user_id: userId,
          client_account_id: invitation.client_account_id,
          first_name: invitation.first_name,
          last_name: invitation.last_name,
          invited_by: "admin",
        });

      if (portalError) {
        console.error("Portal user creation error:", portalError);
        toast({
          title: "Setup Failed",
          description: "Could not complete portal setup. Please contact support.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          role: "client",
        });

      if (roleError) {
        console.error("Role creation error:", roleError);
      }

      await supabase
        .from("client_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });

      navigate("/portal");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (isAcceptingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (forgotPasswordMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              {resetEmailSent ? "Check Your Email" : "Reset Password"}
            </CardTitle>
            <CardDescription>
              {resetEmailSent 
                ? "We've sent a password reset link to your email."
                : "Enter your email to receive a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetEmailSent ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setForgotPasswordMode(false);
                    setResetEmailSent(false);
                  }}
                >
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send Reset Link
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => setForgotPasswordMode(false)}
                  className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {invitation 
              ? (existingUserMode ? "Sign In to Accept Invitation" : "Accept Invitation") 
              : "Client Portal"}
          </CardTitle>
          <CardDescription>
            {invitation 
              ? (existingUserMode 
                  ? `Enter your existing password for ${invitation.email}` 
                  : `Set up your account for ${invitation.email}`)
              : "Sign in to access your dashboard"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={invitation ? handleAcceptInvite : handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!invitation}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">
                {invitation 
                  ? (existingUserMode ? "Your Existing Password" : "Create Password")
                  : "Password"}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={existingUserMode ? 1 : 8}
                />
              </div>
              {invitation && !existingUserMode && (
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters
                </p>
              )}
              {existingUserMode && (
                <p className="text-xs text-muted-foreground">
                  Enter the password you used when you first signed up
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {invitation 
                    ? (existingUserMode ? "Sign In & Accept" : "Create Account")
                    : "Sign In"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {!invitation && (
              <button
                type="button"
                onClick={() => setForgotPasswordMode(true)}
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot your password?
              </button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}