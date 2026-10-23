import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/admin-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/store/core";
import { useCopy } from "@/lib/store-context";
import { adminSessionKey, useAdminSession, useAdminSignOut } from "@/lib/use-admin-session";

function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-card p-6 ring-1 ring-border sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent-strong">ADMIN</span>
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children}
      </div>
    </main>
  );
}

/** Merchant/admin sign-in with Supabase Auth, including a TOTP step when MFA is enrolled. */
export function MerchantLogin({ redirectTo }: { redirectTo: string }) {
  const copy = useCopy();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: adminSessionKey });
    navigate({ to: redirectTo, replace: true });
  };

  const continueAfterPassword = async () => {
    const { data, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel) {
      setNeedsMfa(true);
      return;
    }
    await finish();
  };

  const onPasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(copy({ hi: "ईमेल और पासवर्ड दोनों भरें।", en: "Please enter both email and password." }));
      return;
    }
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(copy({ hi: "ईमेल या पासवर्ड गलत है।", en: "Email or password is incorrect." }));
        return;
      }
      await continueAfterPassword();
    } catch {
      setError(copy({ hi: "अभी लॉगिन नहीं हो पाया। थोड़ी देर बाद कोशिश करें।", en: "Sign-in failed. Please try again shortly." }));
    } finally {
      setBusy(false);
    }
  };

  const onMfaSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (code.trim().length < 6) {
      setError(copy({ hi: "6 अंकों का कोड डालें।", en: "Enter the 6-digit code." }));
      return;
    }
    setBusy(true);
    try {
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;
      const factor = factors.totp[0];
      if (!factor) {
        setError(copy({ hi: "कोई TOTP डिवाइस नहीं मिला।", en: "No TOTP device found." }));
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verifyError) {
        setError(copy({ hi: "कोड गलत है या समय निकल गया।", en: "That code is incorrect or expired." }));
        return;
      }
      await finish();
    } catch {
      setError(copy({ hi: "जाँच पूरी नहीं हो पाई। फिर कोशिश करें।", en: "Verification failed. Please try again." }));
    } finally {
      setBusy(false);
    }
  };

  if (needsMfa) {
    return (
      <AuthFrame
        title={copy({ hi: "दो-चरणीय जाँच", en: "Two-step verification" })}
        description={copy({ hi: "अपने ऑथेंटिकेटर ऐप का 6 अंकों का कोड डालें।", en: "Enter the 6-digit code from your authenticator app." })}
      >
        <form className="mt-6 space-y-4" onSubmit={onMfaSubmit}>
          <div className="space-y-2">
            <Label htmlFor="admin-totp">{copy({ hi: "कोड", en: "Code" })}</Label>
            <Input id="admin-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {copy({ hi: "जाँचें", en: "Verify" })}
          </Button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={copy({ hi: "दुकान प्रबंधन लॉगिन", en: "Merchant login" })}
      description={copy({ hi: "यह पेज सिर्फ़ दुकान के संचालक के लिए है। ग्राहक यहाँ लॉगिन न करें।", en: "This area is only for the shop owner. Customers do not sign in here." })}
    >
      <form className="mt-6 space-y-4" onSubmit={onPasswordSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="admin-email">{copy({ hi: "ईमेल", en: "Email" })}</Label>
          <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-password">{copy({ hi: "पासवर्ड", en: "Password" })}</Label>
          <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
          {copy({ hi: "लॉगिन करें", en: "Sign in" })}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        <Link to="/" className="font-semibold text-primary">{copy({ hi: "दुकान पर वापस जाएँ", en: "Back to the store" })}</Link>
      </p>
    </AuthFrame>
  );
}

/** Blocks the merchant workspace until the server confirms an active admin profile. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const copy = useCopy();
  const navigate = useNavigate();
  const signOut = useAdminSignOut();
  const { data, isLoading, isError } = useAdminSession();

  const mfaIncomplete = Boolean(data && data.isAdmin && !data.mfaSatisfied);

  useEffect(() => {
    // The server refuses merchant operations without two-step verification, so
    // an unverified session is sent back to the login screen to complete it.
    if (isError || mfaIncomplete) {
      navigate({ to: "/sks-4827", search: { redirect: "/admin" }, replace: true });
    }
  }, [isError, mfaIncomplete, navigate]);

  if (isLoading || isError || !data || mfaIncomplete) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          {copy({ hi: "जाँच हो रही है…", en: "Checking access…" })}
        </p>
      </main>
    );
  }

  if (data.isAdmin && data.isActive && !data.sessionAllowed) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
        <div className="w-full max-w-md rounded-lg bg-card p-6 text-center ring-1 ring-border sm:p-8">
          <ShieldAlert className="mx-auto size-10 text-destructive" />
          <h1 className="mt-3 font-display text-3xl font-semibold">{copy({ hi: "डिवाइस सीमा पूरी", en: "Device limit reached" })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {copy({
              hi: "अधिकतम 4 डिवाइस — किसी दूसरे डिवाइस से लॉगआउट करें।",
              en: "Maximum 4 devices — sign out on another device.",
            })}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => void signOut()}>{copy({ hi: "लॉगआउट करें", en: "Sign out" })}</Button>
            <Button asChild variant="outline"><Link to="/">{copy({ hi: "दुकान पर जाएँ", en: "Go to store" })}</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  if (!data.isAdmin || !data.isActive) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
        <div className="w-full max-w-md rounded-lg bg-card p-6 text-center ring-1 ring-border sm:p-8">
          <ShieldAlert className="mx-auto size-10 text-destructive" />
          <h1 className="mt-3 font-display text-3xl font-semibold">{copy({ hi: "अनुमति नहीं है", en: "Access denied" })}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {copy({
              hi: "इस खाते को दुकान प्रबंधन की अनुमति नहीं है। सही खाते से लॉगिन करें।",
              en: "This account is not allowed in the merchant workspace. Sign in with the shop owner account.",
            })}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => void signOut()}>{copy({ hi: "लॉगआउट करें", en: "Sign out" })}</Button>
            <Button asChild variant="outline"><Link to="/">{copy({ hi: "दुकान पर जाएँ", en: "Go to store" })}</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
