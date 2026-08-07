import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);
  const [invitation, setInvitation] = useState<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    client_account_id: string;
  } | null>(null);

  // Prevents onAuthStateChange from double-finalizing when handleAcceptInvite is mid-flight
  const processingInviteRef = useRef(false);
  // Ref so SIGNED_IN handler can synchronously check recovery mode before redirecting
  const isPasswordRecoveryRef = useRef(false);

  useEffect(() => {
    // Handle Supabase error hash (e.g. expired OTP)
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashError = hash.get("error_code");
    if (hashError === "otp_expired") {
      toast({
        title: "Link Expired",
        description: "This reset link has expired. Please request a new one.",
        variant: "destructive",
      });
      setForgotPasswordMode(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Listen for SIGNED_IN — finalizes portal setup after email confirmation
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        isPasswordRecoveryRef.current = true;
        setIsPasswordRecovery(true);
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
        // Block redirect if we're in password recovery or invite flow
        if (processingInviteRef.current || isPasswordRecoveryRef.current) return;

        const pendingRaw = sessionStorage.getItem("pending_invitation");
        if (pendingRaw) {
          // Legacy sessionStorage path (same-tab confirmation)
          setTimeout(() => {
            try {
              const pending = JSON.parse(pendingRaw);
              finalizePortalSetup(session.user.id, pending);
            } catch (e) {
              console.error("Pending invitation parse error:", e);
            }
          }, 0);
        } else if (inviteToken) {
          // User confirmed email and landed back on invite URL — re-fetch and finalize.
          // This handles the common case where the confirmation link opens in a new tab
          // (sessionStorage is not shared across tabs).
          setTimeout(async () => {
            const { data: inv } = await supabase
              .from("client_invitations")
              .select("id, email, first_name, last_name, client_account_id")
              .eq("token", inviteToken)
              .is("accepted_at", null)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle();
            if (inv) {
              finalizePortalSetup(session.user.id, inv);
            } else {
              checkClientPortalAccess(session.user.id);
            }
          }, 0);
        } else {
          checkClientPortalAccess(session.user.id);
        }
      }
    });

    // Skip the auto-redirect when there's a pending invite token -- an
    // unrelated existing session (e.g. this browser is also logged into
    // admin, or logged in as some other client from earlier testing) would
    // otherwise silently redirect to /portal before the visitor ever saw or
    // submitted the accept-invite form for THIS invite. loadInvitation below
    // is the only thing that should drive what happens next in that case.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isPasswordRecoveryRef.current && !inviteToken) {
        checkClientPortalAccess(session.user.id);
      }
    });

    if (inviteToken) {
      loadInvitation(inviteToken);
    }

    return () => subscription.unsubscribe();
  }, [inviteToken]);

  const finalizePortalSetup = async (
    userId: string,
    pending: { id: string; client_account_id: string; first_name: string | null; last_name: string | null }
  ) => {
    try {
      const { data: existing } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", userId)
        .eq("client_account_id", pending.client_account_id)
        .maybeSingle();

      if (!existing) {
        const { error: portalError } = await supabase
          .from("client_portal_users")
          .insert({
            user_id: userId,
            client_account_id: pending.client_account_id,
            first_name: pending.first_name,
            last_name: pending.last_name,
            invited_by: "admin",
          });
        if (portalError && portalError.code !== "23505") {
          console.error("Portal user creation error (post-confirm):", portalError);
        }
      }

      await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });

      await supabase
        .from("client_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", pending.id);

      sessionStorage.removeItem("pending_invitation");

      await seedWorkflowSafe(pending.client_account_id);

      toast({
        title: "Welcome!",
        description: "Your account has been confirmed and set up successfully.",
      });

      navigate("/portal");
    } catch (err) {
      console.error("Finalize portal setup error:", err);
    }
  };

  /** Fire-and-forget workflow seeding. Never blocks portal access. */
  const seedWorkflowSafe = async (clientAccountId: string) => {
    try {
      const { error } = await supabase.functions.invoke("seed-tier-workflow", {
        body: { client_id: clientAccountId },
      });
      // 409 (workflow already exists) is fine — ignore
      if (error && !String(error.message || "").includes("409")) {
        console.warn("seed-tier-workflow failed:", error);
        toast({
          title: "Setup pending",
          description: "Your onboarding workflow will be set up shortly.",
        });
      }
    } catch (e) {
      console.warn("seed-tier-workflow exception:", e);
      toast({
        title: "Setup pending",
        description: "Your onboarding workflow will be set up shortly.",
      });
    }
  };

  const checkClientPortalAccess = async (userId: string) => {
    const { data } = await supabase
      .from("client_portal_users")
      .select("id, client_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      // Ensure the workflow is seeded — idempotent (409 if already exists)
      // Guards against network failures on first login that silently skipped seeding
      seedWorkflowSafe(data.client_account_id);
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
      .maybeSingle();

    if (error || !data) {
      const reason = error
        ? "This invitation link is invalid or there was a problem loading it. Please contact your account manager for a new invite."
        : "This invitation has already been used or has expired. Please ask your admin to send a new one.";
      toast({
        title: "Invitation Not Found",
        description: reason,
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

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Password updated!", description: "You're now signed in." });
      isPasswordRecoveryRef.current = false;
      setIsPasswordRecovery(false);
      navigate("/portal");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
        const desc = error.message?.includes("Invalid login")
          ? "The email or password you entered is incorrect. Please try again."
          : error.message?.includes("Email not confirmed")
          ? "Your email address hasn't been verified yet. Please check your inbox for a verification link."
          : error.message || "Unable to sign in. Please check your credentials and try again.";
        toast({
          title: "Sign In Failed",
          description: desc,
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
          title: "No Portal Access",
          description: "Your account isn't linked to a client portal yet. If you were invited, please use the invitation link from your email. Otherwise, contact your account manager.",
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

    processingInviteRef.current = true;
    setLoading(true);

    try {
      if (existingUserMode) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        });

        if (signInError) {
          const desc = signInError.message?.includes("Invalid login")
            ? "The password you entered is incorrect. Please try again, or use 'Forgot password' to reset it."
            : signInError.message || "Unable to sign in. Please try again.";
          toast({
            title: "Sign In Failed",
            description: desc,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const userId = signInData.user?.id;
        if (!userId) {
          toast({
            title: "Sign In Failed",
            description: "Your account was found but the session could not be established. Please try again or clear your browser cache.",
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
            const desc = portalError.code === "42501" || portalError.message?.includes("row-level security")
              ? "A permissions issue prevented your portal setup. This has been logged — please try again in a moment."
              : portalError.code === "23505"
              ? "Your portal access already exists. Try signing in instead."
              : `Portal setup failed: ${portalError.message || "Unknown error"}. Please try again or contact your account manager.`;
            toast({
              title: "Portal Setup Failed",
              description: desc,
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }

        // Ensure client role exists
        try {
          await supabase
            .from("user_roles")
            .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
        } catch (roleErr) {
          console.error("Role upsert error (existing user):", roleErr);
        }

        await supabase
          .from("client_invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);

        await seedWorkflowSafe(invitation.client_account_id);

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
          // Include the invite token so confirmation redirect re-enters the invite flow
          emailRedirectTo: `${window.location.origin}/portal/auth?invite=${inviteToken}`,
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
        const desc = authError.message?.includes("password")
          ? "Password must be at least 8 characters long."
          : authError.message || "Could not create your account. Please try again.";
        toast({
          title: "Registration Failed",
          description: desc,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        toast({
          title: "Registration Failed",
          description: "Your account was created but the session could not be established. Please try signing in with your new password.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If email confirmation is required, defer portal setup until SIGNED_IN
      if (!authData.user?.email_confirmed_at && !authData.session) {
        sessionStorage.setItem(
          "pending_invitation",
          JSON.stringify({
            id: invitation.id,
            client_account_id: invitation.client_account_id,
            first_name: invitation.first_name,
            last_name: invitation.last_name,
          })
        );
        setConfirmEmailSent(true);
        toast({
          title: "Check Your Email",
          description: "We've sent a confirmation link to your email. Click it to finish setting up your account.",
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
        // If duplicate (23505), user already has access — proceed
        if (portalError.code === "23505") {
          console.warn("Portal user already exists, proceeding.");
        } else {
          console.error("Portal user creation error:", portalError);
          const desc = portalError.code === "42501" || portalError.message?.includes("row-level security")
            ? "A permissions issue prevented your portal setup. This has been logged — please try again in a moment."
            : `Portal setup failed: ${portalError.message || "Unknown error"}. Your login was created — contact your admin with your email address to restore portal access.`;
          toast({
            title: "Portal Setup Failed",
            description: desc,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      try {
        await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
      } catch (roleErr) {
        console.error("Role upsert error:", roleErr);
      }

      await supabase
        .from("client_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      await seedWorkflowSafe(invitation.client_account_id);

      toast({
        title: "Welcome!",
        description: "Your account has been created successfully.",
      });

      navigate("/portal");
    } catch (error: any) {
      const msg = error.message || "Something went wrong";
      const desc = msg.includes("Failed to fetch")
        ? "Network error — please check your internet connection and try again."
        : `An unexpected error occurred: ${msg}. Please try again.`;
      toast({
        title: "Something Went Wrong",
        description: desc,
        variant: "destructive",
      });
    } finally {
      processingInviteRef.current = false;
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

  if (confirmEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
            <CardDescription>
              We've sent a confirmation link to {invitation?.email ?? email}. Click it to finish setting up your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Once confirmed, you'll be signed in automatically and your portal access will be activated.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">At least 8 characters</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Update Password <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
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
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                  minLength={existingUserMode ? 1 : 8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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