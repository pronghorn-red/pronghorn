import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ArrowLeft, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { PronghornLogo } from "@/components/layout/PronghornLogo";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    signIn,
    signUp,
    signInWithGoogle,
    signInWithAzure,
    resetPassword,
    updatePassword,
    session
  } = useAuth();

  // Loading states
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [azureLoading, setAzureLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [signupCodeError, setSignupCodeError] = useState<string | null>(null);
  const [signupCodeValidating, setSignupCodeValidating] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  // Password visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // Forgot password states
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Reset password mode (when user clicks link in email)
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  // Email verification success state
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  // Expired link error state
  const [expiredLinkError, setExpiredLinkError] = useState<string | null>(null);

  // Already verified error state (link already used)
  const [alreadyVerifiedError, setAlreadyVerifiedError] = useState<string | null>(null);

  // Track if we've detected an expired recovery link - persists across re-renders
  const [expiredRecoveryDetected, setExpiredRecoveryDetected] = useState(false);

  // Handle URL params after Supabase redirect - check IMMEDIATELY before any session redirects
  useEffect(() => {
    const verified = searchParams.get('verified');
    const recovery = searchParams.get('recovery');

    // Check hash fragment for errors (Supabase puts errors there)
    const hash = window.location.hash;
    let hasExpiredRecoveryError = false;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const error = hashParams.get('error');
      const errorCode = hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');
      if (error === 'access_denied') {
        if (errorCode === 'otp_expired') {
          // Expired link (recovery or verification)
          if (recovery === 'true') {
            hasExpiredRecoveryError = true;
            setExpiredRecoveryDetected(true);
            setExpiredLinkError(errorDescription?.replace(/\+/g, ' ') || 'Your reset link has expired or has already been used. Please request a new one.');
            // Clear the recovery param to prevent reset mode from activating
            window.history.replaceState({}, '', '/auth');
          } else if (verified === 'true') {
            setAlreadyVerifiedError('This verification link has expired or already been used. Please sign in with your email and password.');
            window.history.replaceState({}, '', '/auth');
          } else {
            setExpiredLinkError(errorDescription?.replace(/\+/g, ' ') || 'This link has expired. Please try again.');
            window.history.replaceState({}, '', '/auth');
          }
        } else if (verified === 'true') {
          // Other access denied error on verification (likely already used)
          setAlreadyVerifiedError('This verification link has already been used. Please sign in with your email and password.');
          window.history.replaceState({}, '', '/auth');
        } else {
          // Clear hash for other errors too
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
      }
    }

    // Only show verification success if no error
    if (verified === 'true' && !alreadyVerifiedError) {
      setVerificationSuccess(true);
      // If session already exists from verification redirect, go straight to dashboard
      if (session) {
        toast.success("Email verified! Redirecting to dashboard...");
        navigate("/dashboard");
        return;
      }
      toast.success("Email verified successfully! You can now sign in.");
    }

    // Only enter reset mode if recovery=true AND no expired error was detected (now or previously)
    if (recovery === 'true' && !hasExpiredRecoveryError && !expiredRecoveryDetected && !expiredLinkError) {
      setResetMode(true);
      toast.success("Please set your new password.");
    }
  }, [searchParams, expiredLinkError, alreadyVerifiedError, expiredRecoveryDetected, session, navigate]);

  // Listen for PASSWORD_RECOVERY auth event from Supabase
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setResetMode(true);
        toast.success("Please set your new password.");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Redirect to dashboard if already authenticated (except in reset mode or recovery flow)
  useEffect(() => {
    const recovery = searchParams.get('recovery');
    // Don't redirect if we're in reset mode OR if recovery param is present (race condition guard)
    if (session && !resetMode && recovery !== 'true') {
      navigate("/dashboard");
    }
  }, [session, navigate, resetMode, searchParams]);

  const validateSignupCode = async (code: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('validate-signup-code', {
        body: { code }
      });
      if (error) {
        // Try to extract the actual error message from FunctionsHttpError
        const errorMessage = error.message || 'Failed to validate signup code';
        return { valid: false, error: errorMessage };
      }
      return { valid: data?.valid === true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to validate signup code';
      return { valid: false, error: message };
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error(error.message);
      setGoogleLoading(false);
    }
  };

  const handleAzureSignIn = async () => {
    setAzureLoading(true);
    const { error } = await signInWithAzure();
    if (error) {
      toast.error(error.message);
      setAzureLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const {
      error
    } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed in successfully!");
      navigate("/dashboard");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupCodeError(null);
    setSignupError(null);
    
    if (signupPassword !== signupConfirm) {
      setSignupError("Passwords don't match");
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters");
      return;
    }
    
    // Validate signup code first
    setSignupCodeValidating(true);
    const codeResult = await validateSignupCode(signupCode);
    setSignupCodeValidating(false);
    
    if (!codeResult.valid) {
      setSignupCodeError(codeResult.error || "Invalid signup code. Please contact an administrator.");
      return;
    }
    
    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, true);
    setLoading(false);
    if (error) {
      setSignupError(error.message);
    } else {
      setSignupError(null);
      toast.success("Account created! Please check your email to verify your account.");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }
    setResetLoading(true);
    const {
      error
    } = await resetPassword(resetEmail);
    setResetLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset email sent! Check your inbox.");
      setForgotPasswordMode(false);
      setResetEmail("");
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const {
      error
    } = await updatePassword(newPassword);
    setLoading(false);
    if (error) {
      // Handle specific error cases
      if (error.message?.includes('session') || error.message?.includes('token') || error.message?.includes('expired')) {
        toast.error("Your reset link has expired. Please request a new one.");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Password updated successfully!");
      setResetMode(false);
      // Clear URL params to prevent issues on refresh
      window.history.replaceState({}, '', '/auth');
      navigate("/dashboard");
    }
  };

  // Password visibility toggle component
  const PasswordToggle = ({
    show,
    onToggle
  }: {
    show: boolean;
    onToggle: () => void;
  }) => (
    <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  // Login type information component
  const LoginTypeInfo = () => (
    <Alert className="mb-4 border-muted bg-muted/50">
      <Info className="h-4 w-4" />
      <AlertDescription className="text-sm">
        <ul className="mt-1 space-y-1 text-muted-foreground">
          <li><span className="font-medium text-foreground">Email/Password:</span> Public access</li>
          <li><span className="font-medium text-foreground">Google SSO:</span> Government of Alberta</li>
          <li><span className="font-medium text-foreground">Microsoft SSO:</span> Organizations with Entra ID</li>
        </ul>
      </AlertDescription>
    </Alert>
  );

  // Reset password form (when user comes back from email link)
  if (resetMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Link to="/" className="flex justify-center mb-4">
              <PronghornLogo className="h-12 w-12 rounded-lg" />
            </Link>
            <CardTitle className="text-2xl">Set New Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input id="new-password" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                  <PasswordToggle show={showNewPassword} onToggle={() => setShowNewPassword(!showNewPassword)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                <div className="relative">
                  <Input id="confirm-new-password" type={showConfirmNewPassword ? "text" : "password"} value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required minLength={6} />
                  <PasswordToggle show={showConfirmNewPassword} onToggle={() => setShowConfirmNewPassword(!showConfirmNewPassword)} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Forgot password form
  if (forgotPasswordMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Link to="/" className="flex justify-center mb-4">
              <PronghornLogo className="h-12 w-12 rounded-lg" />
            </Link>
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <CardDescription>Enter your email to receive a reset link</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" placeholder="you@example.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={resetLoading}>
                {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
            </form>
            <Button variant="ghost" className="w-full mt-4" onClick={() => setForgotPasswordMode(false)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link to="/" className="flex justify-center mb-4">
            <PronghornLogo className="h-12 w-12 rounded-lg" />
          </Link>
          <CardTitle className="text-2xl">
            <Link to="/" className="hover:text-primary transition-colors">Welcome to Pronghorn</Link>
          </CardTitle>
          <CardDescription>Sign in to access your projects</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Expired link error banner */}
          {expiredLinkError && (
            <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {expiredLinkError}
                <Button variant="link" className="p-0 h-auto ml-1 text-amber-700 dark:text-amber-400 underline" onClick={() => {
                  setExpiredLinkError(null);
                  setForgotPasswordMode(true);
                }}>
                  Request a new link
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Already verified/used link warning */}
          {alreadyVerifiedError && (
            <Alert className="mb-4 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {alreadyVerifiedError}
              </AlertDescription>
            </Alert>
          )}

          {/* Verification success message */}
          {verificationSuccess && !alreadyVerifiedError && (
            <Alert className="mb-4 border-green-500/50 bg-green-500/10">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                Your email has been verified! You can now sign in to your account.
              </AlertDescription>
            </Alert>
          )}

          {/* Login type information */}
          <LoginTypeInfo />

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input id="login-password" type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                    <PasswordToggle show={showLoginPassword} onToggle={() => setShowLoginPassword(!showLoginPassword)} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>

              <Button variant="link" className="w-full mt-2 text-sm text-muted-foreground" onClick={() => setForgotPasswordMode(true)}>
                Forgot your password?
              </Button>

              <div className="mt-4 space-y-2">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={handleGoogleSignIn} disabled={googleLoading || azureLoading}>
                    {googleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                    Google
                  </Button>
                  <Button variant="outline" onClick={handleAzureSignIn} disabled={googleLoading || azureLoading}>
                    {azureLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23">
                        <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                        <path fill="#f35325" d="M1 1h10v10H1z" />
                        <path fill="#81bc06" d="M12 1h10v10H12z" />
                        <path fill="#05a6f0" d="M1 12h10v10H1z" />
                        <path fill="#ffba08" d="M12 12h10v10H12z" />
                      </svg>
                    )}
                    Microsoft
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-code">Signup Code</Label>
                  <Input 
                    id="signup-code" 
                    type="text" 
                    placeholder="Enter signup code" 
                    value={signupCode} 
                    onChange={e => {
                      setSignupCode(e.target.value);
                      setSignupCodeError(null);
                    }} 
                    required 
                  />
                  {signupCodeError && (
                    <p className="text-sm text-destructive">{signupCodeError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Contact an administrator to obtain a signup code.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input id="signup-password" type={showSignupPassword ? "text" : "password"} value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required minLength={6} />
                    <PasswordToggle show={showSignupPassword} onToggle={() => setShowSignupPassword(!showSignupPassword)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <div className="relative">
                    <Input id="signup-confirm" type={showSignupConfirm ? "text" : "password"} value={signupConfirm} onChange={e => setSignupConfirm(e.target.value)} required minLength={6} />
                    <PasswordToggle show={showSignupConfirm} onToggle={() => setShowSignupConfirm(!showSignupConfirm)} />
                  </div>
                </div>
                {signupError && (
                  <Alert className="border-destructive/50 bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <AlertDescription className="text-destructive">
                      {signupError}
                    </AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading || signupCodeValidating}>
                  {(loading || signupCodeValidating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {signupCodeValidating ? 'Validating Code...' : 'Create Account'}
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            </TabsContent>
          </Tabs>

          <div className="mt-6 text-center">
            <Button variant="link" onClick={() => navigate("/dashboard")} className="text-sm">
              Continue without signing in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
