import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Eye, EyeOff, Loader2, LogIn, MapPin, Pencil, Plus, Star, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, PageIntro } from "./core";
import { useCopy } from "@/lib/store-context";
import {
  customerProfileKey,
  useCustomerAddresses,
  useCustomerProfile,
  useCustomerSignOut,
  useDeleteCustomerAddress,
  useSaveCustomerAddress,
  useSetDefaultAddress,
  useUpdateCustomerProfile,
  type AddressInput,
} from "@/lib/use-customer";
import type { CustomerAddress } from "@/lib/customer-account.functions";

type Mode = "login" | "signup" | "forgot";

const passwordRules = (value: string) => ({ length: value.length >= 8, lower: /[a-z]/.test(value), number: /[0-9]/.test(value) });
const strongEnough = (value: string) => Object.values(passwordRules(value)).every(Boolean);

/** Password input with a show/hide toggle that only affects this field. */
function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const copy = useCopy();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? copy({ hi: "पासवर्ड छिपाएँ", en: "Hide password" }) : copy({ hi: "पासवर्ड दिखाएँ", en: "Show password" })}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function PasswordChecklist({ value }: { value: string }) {
  const copy = useCopy();
  const rules = passwordRules(value);
  const items = [
    [rules.length, { hi: "8 अक्षर", en: "8 characters" }],
    [rules.lower, { hi: "छोटा अक्षर (a–z)", en: "Lowercase letter" }],
    [rules.number, { hi: "अंक (0–9)", en: "Number" }],
  ] as const;
  return (
    <ul className="space-y-1 text-xs" aria-live="polite">
      {items.map(([ok, label]) => (
        <li key={label.en} className={ok ? "flex items-center gap-1.5 font-medium text-primary" : "flex items-center gap-1.5 text-muted-foreground"}>
          <Check className={ok ? "size-4" : "size-4 opacity-30"} aria-hidden="true" />
          {copy(label)}
          <span className="sr-only">{ok ? copy({ hi: "पूरा", en: "done" }) : copy({ hi: "बाकी", en: "missing" })}</span>
        </li>
      ))}
    </ul>
  );
}
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** Customer sign-in / registration / password recovery. Separate from the merchant login. */
export function CustomerAuthPage({ redirectTo }: { redirectTo: string }) {
  const copy = useCopy();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!validEmail(email.trim())) {
      setError(copy({ hi: "सही ईमेल पता लिखें।", en: "Please enter a valid email address." }));
      return;
    }
    if (mode !== "forgot" && !password) {
      setError(copy({ hi: "पासवर्ड डालें।", en: "Please enter your password." }));
      return;
    }
    if (mode === "signup") {
      if (fullName.trim().length < 2) {
        setError(copy({ hi: "अपना पूरा नाम लिखें।", en: "Please enter your full name." }));
        return;
      }
      if (!/^[0-9]{10}$/.test(phone.trim())) {
        setError(copy({ hi: "10 अंकों का मोबाइल नंबर लिखें।", en: "Please enter a 10-digit mobile number." }));
        return;
      }
      if (!strongEnough(password)) {
        setError(
          copy({
            hi: "पासवर्ड कम से कम 8 अक्षर का हो, उसमें एक छोटा अक्षर और एक अंक हो।",
            en: "Password must be at least 8 characters with a lowercase letter and a number.",
          }),
        );
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "login") {
        // Switching accounts: end any existing customer session on this device and
        // drop its cached private data (cart, profile, addresses, orders) first, so
        // nothing from the previous customer is reused or refetched with a stale token.
        const { data: existing } = await supabase.auth.getSession();
        await queryClient.cancelQueries();
        queryClient.clear();
        if (existing.session) await supabase.auth.signOut({ scope: "local" });
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) {
          setError(
            signInError.message.toLowerCase().includes("confirm")
              ? copy({ hi: "पहले अपने ईमेल में आया पुष्टि लिंक खोलें।", en: "Please open the confirmation link sent to your email first." })
              : copy({ hi: "ईमेल या पासवर्ड गलत है।", en: "Email or password is incorrect." }),
          );
          return;
        }
        await queryClient.cancelQueries();
        queryClient.clear();
        navigate({ to: redirectTo, replace: true });
        return;
      }

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), phone: phone.trim() },
          },
        });
        // With email confirmation on, Supabase returns an obfuscated user with no
        // identities (and no new Auth user) when the email already exists.
        const alreadyRegistered =
          (signUpError && (signUpError.code === "user_already_exists" || signUpError.code === "email_exists" || signUpError.message.toLowerCase().includes("registered"))) ||
          (!signUpError && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
        if (alreadyRegistered) {
          setError(copy({ hi: "यह ईमेल पहले से रजिस्टर है। कृपया लॉगिन करें।", en: "This email is already registered. Please sign in instead." }));
          return;
        }
        if (signUpError) {
          setError(copy({ hi: "खाता नहीं बन पाया। थोड़ी देर बाद कोशिश करें।", en: "We could not create the account. Please try again shortly." }));
          return;
        }
        if (!data.session) {
          setNotice(
            copy({
              hi: "आपके ईमेल पर पुष्टि लिंक भेजा गया है। लिंक खोलने के बाद लॉगिन करें।",
              en: "A confirmation link has been sent to your email. Open it, then sign in.",
            }),
          );
          setMode("login");
          setPassword("");
          return;
        }
        await queryClient.invalidateQueries({ queryKey: customerProfileKey });
        navigate({ to: redirectTo, replace: true });
        return;
      }

      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setNotice(
        copy({
          hi: "अगर यह ईमेल हमारे पास है तो पासवर्ड बदलने का लिंक भेज दिया गया है।",
          en: "If this email is registered, a password reset link has been sent.",
        }),
      );
    } catch {
      setError(copy({ hi: "अभी काम पूरा नहीं हो पाया। थोड़ी देर बाद कोशिश करें।", en: "Something went wrong. Please try again shortly." }));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "login"
      ? copy({ hi: "ग्राहक लॉगिन", en: "Customer login" })
      : mode === "signup"
        ? copy({ hi: "नया ग्राहक खाता", en: "Create customer account" })
        : copy({ hi: "पासवर्ड भूल गए", en: "Forgot password" });

  return (
    <main>
      <PageIntro
        title={title}
        description={copy({
          hi: "अपने पते सुरक्षित रखने और आगे ऑर्डर करने के लिए खाता बनाएँ।",
          en: "Create an account to save your addresses and order later.",
        })}
      />
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <div className="rounded-lg bg-card p-6 ring-1 ring-border">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            {mode === "signup" && (
              <>
                <Field id="cust-name" label={copy({ hi: "पूरा नाम", en: "Full name" })}>
                  <Input id="cust-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
                <Field id="cust-phone" label={copy({ hi: "मोबाइल नंबर", en: "Mobile number" })}>
                  <Input id="cust-phone" inputMode="numeric" autoComplete="tel" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                </Field>
              </>
            )}
            <Field id="cust-email" label={copy({ hi: "ईमेल", en: "Email" })}>
              <Input id="cust-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {mode !== "forgot" && (
              <Field id="cust-password" label={copy({ hi: "पासवर्ड", en: "Password" })}>
                <PasswordInput
                  id="cust-password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={setPassword}
                />
                {mode === "signup" && <PasswordChecklist value={password} />}
              </Field>
            )}
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            {notice && <p role="status" className="rounded-md bg-surface p-3 text-sm">{notice}</p>}
            <Button type="submit" className="h-12 w-full rounded-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
              {mode === "login"
                ? copy({ hi: "लॉगिन करें", en: "Sign in" })
                : mode === "signup"
                  ? copy({ hi: "खाता बनाएँ", en: "Create account" })
                  : copy({ hi: "लिंक भेजें", en: "Send reset link" })}
            </Button>
          </form>

          <div className="mt-5 space-y-2 text-sm">
            {mode !== "login" && (
              <button type="button" className="font-semibold text-primary" onClick={() => switchMode("login")}>
                {copy({ hi: "पहले से खाता है? लॉगिन करें", en: "Already have an account? Sign in" })}
              </button>
            )}
            {mode !== "signup" && (
              <button type="button" className="flex min-h-11 items-center font-semibold text-primary" onClick={() => switchMode("signup")}>
                {copy({ hi: "नया खाता बनाएँ", en: "Create a new account" })}
              </button>
            )}
            {mode !== "forgot" && (
              <button type="button" className="flex min-h-11 items-center text-muted-foreground underline" onClick={() => switchMode("forgot")}>
                {copy({ hi: "पासवर्ड भूल गए?", en: "Forgot password?" })}
              </button>
            )}
          </div>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          {copy({ hi: "दुकान संचालक यहाँ लॉगिन न करें।", en: "Shop owners do not sign in here." })}
        </p>
      </div>
    </main>
  );
}

/** Sets a new password from the recovery link session. */
export function ResetPasswordPage() {
  const copy = useCopy();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setReady(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!strongEnough(password)) {
      setError(copy({ hi: "पासवर्ड कम से कम 8 अक्षर का हो, उसमें एक छोटा अक्षर और एक अंक हो।", en: "Password must be at least 8 characters with a lowercase letter and a number." }));
      return;
    }
    setBusy(true);
    try {
      // Accounts with two-step verification (the merchant) get an aal1 recovery
      // session; Supabase refuses password changes until it is raised to aal2.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const mfaRequired = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
      if (mfaRequired) {
        if (code.trim().length < 6) {
          setNeedsMfa(true);
          setError(needsMfa ? copy({ hi: "6 अंकों का कोड डालें।", en: "Enter the 6-digit code." }) : null);
          return;
        }
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const factor = factors?.totp[0];
        const verify = factor
          ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() })
          : { error: new Error("no factor") };
        if (verify.error) {
          setError(copy({ hi: "कोड गलत है या समय निकल गया।", en: "That code is incorrect or expired." }));
          return;
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(copy({ hi: "पासवर्ड नहीं बदला जा सका। नया लिंक मँगवाएँ।", en: "Password could not be changed. Please request a new link." }));
        return;
      }
      toast.success(copy({ hi: "पासवर्ड बदल गया।", en: "Password updated." }));
      if (mfaRequired || needsMfa) {
        // Merchant: drop the recovery session from the customer slot and use merchant login.
        await supabase.auth.signOut({ scope: "local" });
        navigate({ to: "/sks-4827", search: { redirect: "/admin" }, replace: true });
        return;
      }
      navigate({ to: "/account", replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <PageIntro title={copy({ hi: "नया पासवर्ड", en: "New password" })} description={copy({ hi: "अपने खाते के लिए नया पासवर्ड बनाएँ।", en: "Set a new password for your account." })} />
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        {!ready ? (
          <EmptyState
            title={copy({ hi: "लिंक मान्य नहीं है", en: "Link is not valid" })}
            description={copy({ hi: "पासवर्ड बदलने का लिंक ईमेल से खोलें, या नया लिंक मँगवाएँ।", en: "Open the reset link from your email, or request a new one." })}
          />
        ) : (
          <form className="space-y-4 rounded-lg bg-card p-6 ring-1 ring-border" onSubmit={onSubmit} noValidate>
            <Field id="new-password" label={copy({ hi: "नया पासवर्ड", en: "New password" })}>
              <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={setPassword} />
              <PasswordChecklist value={password} />
            </Field>
            {needsMfa && (
              <Field id="reset-totp" label={copy({ hi: "ऑथेंटिकेटर ऐप का 6 अंकों का कोड", en: "6-digit code from your authenticator app" })}>
                <Input id="reset-totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
            )}
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="h-12 w-full rounded-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {copy({ hi: "पासवर्ड बदलें", en: "Change password" })}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

function CustomerLoading() {
  const copy = useCopy();
  return (
    <main className="grid min-h-[50vh] place-items-center px-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        {copy({ hi: "जानकारी लाई जा रही है…", en: "Loading your details…" })}
      </p>
    </main>
  );
}

/** Customer email change via Supabase's own confirmation email; the email only changes after confirmation. */
function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const copy = useCopy();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError(copy({ hi: "सही ईमेल पता लिखें।", en: "Please enter a valid email address." }));
      return;
    }
    if (next === currentEmail.trim().toLowerCase()) {
      setError(copy({ hi: "यह आपका मौजूदा ईमेल है।", en: "This is already your current email." }));
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/account` });
    setBusy(false);
    if (updateError) {
      setError(copy({ hi: "ईमेल नहीं बदला जा सका। हो सकता है यह ईमेल पहले से इस्तेमाल में हो। दोबारा कोशिश करें।", en: "Could not change the email. It may already be in use. Please try again." }));
      return;
    }
    setSentTo(next);
    setEmail("");
  };
  return (
    <form className="space-y-4 rounded-lg bg-card p-6 ring-1 ring-border" onSubmit={onSubmit} noValidate>
      <h2 className="font-display text-xl font-semibold">{copy({ hi: "ईमेल बदलें", en: "Change email" })}</h2>
      <Field id="account-new-email" label={copy({ hi: "नया ईमेल", en: "New email" })}>
        <Input id="account-new-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {sentTo && <p role="status" className="text-sm text-muted-foreground">{copy({ hi: `पुष्टि लिंक दोनों ईमेल पर भेजे गए हैं — ${sentTo} और आपका मौजूदा (पुराना) ईमेल। ईमेल बदलने के लिए दोनों लिंक खोलना ज़रूरी है। पुष्टि पूरी होने तक पुराना ईमेल ही चलेगा।`, en: `Confirmation links have been sent to BOTH email addresses — ${sentTo} and your current (old) email. You must open both links to complete the change. Your current email stays active until both are confirmed.` })}</p>}
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <Button type="submit" variant="outline" className="h-12 rounded-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {copy({ hi: "पुष्टि लिंक भेजें", en: "Send confirmation link" })}
      </Button>
    </form>
  );
}

/** Customer account: own profile only, editable name and phone. */
export function AccountPage() {
  const copy = useCopy();
  const signOut = useCustomerSignOut();
  const { data, isLoading, isError, refetch } = useCustomerProfile();
  const update = useUpdateCustomerProfile();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setFullName(data.fullName ?? "");
      setPhone(data.phone ?? "");
    }
  }, [data]);

  if (isLoading) return <CustomerLoading />;
  if (isError || !data)
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ErrorState onRetry={() => refetch()} />
      </main>
    );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) {
      setError(copy({ hi: "अपना पूरा नाम लिखें।", en: "Please enter your full name." }));
      return;
    }
    if (!/^[0-9]{10}$/.test(phone.trim())) {
      setError(copy({ hi: "10 अंकों का मोबाइल नंबर लिखें।", en: "Please enter a 10-digit mobile number." }));
      return;
    }
    try {
      await update.mutateAsync({ fullName: fullName.trim(), phone: phone.trim() });
      toast.success(copy({ hi: "जानकारी सेव हो गई।", en: "Details saved." }));
    } catch {
      setError(copy({ hi: "सेव नहीं हो पाया। दोबारा कोशिश करें।", en: "Could not save. Please try again." }));
    }
  };

  return (
    <main>
      <PageIntro title={copy({ hi: "मेरा खाता", en: "My account" })} description={copy({ hi: "अपना नाम और मोबाइल नंबर यहाँ बदल सकते हैं।", en: "Update your name and mobile number here." })} />
      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
        <form className="space-y-4 rounded-lg bg-card p-6 ring-1 ring-border" onSubmit={onSubmit} noValidate>
          <UserRound className="size-8 text-accent" />
          <Field id="account-name" label={copy({ hi: "पूरा नाम", en: "Full name" })}>
            <Input id="account-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field id="account-phone" label={copy({ hi: "मोबाइल नंबर", en: "Mobile number" })}>
            <Input id="account-phone" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field id="account-email" label={copy({ hi: "ईमेल", en: "Email" })}>
            <Input id="account-email" value={data.email ?? ""} readOnly disabled />
          </Field>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="h-12 rounded-full" disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />}
            {copy({ hi: "सेव करें", en: "Save" })}
          </Button>
        </form>
        <ChangeEmailForm currentEmail={data.email ?? ""} />
        </div>
        <aside className="h-fit space-y-3 rounded-lg bg-card p-6 ring-1 ring-border">
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/addresses"><MapPin />{copy({ hi: "मेरे पते", en: "My addresses" })}</Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/orders">{copy({ hi: "मेरे ऑर्डर", en: "My orders" })}</Link>
          </Button>
          <Button variant="outline" className="w-full rounded-full" onClick={() => void signOut()}>
            {copy({ hi: "लॉगआउट करें", en: "Sign out" })}
          </Button>
        </aside>
      </div>
    </main>
  );
}

const emptyAddress = (profileName: string, profilePhone: string): AddressInput => ({
  fullName: profileName,
  phone: profilePhone,
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  villageTown: "",
  district: "",
  state: "Rajasthan",
  pincode: "",
  isDefault: false,
});

const toInput = (address: CustomerAddress): AddressInput => ({
  id: address.id,
  fullName: address.fullName,
  phone: address.phone,
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2 ?? "",
  landmark: address.landmark ?? "",
  villageTown: address.villageTown,
  district: address.district,
  state: address.state,
  pincode: address.pincode,
  isDefault: address.isDefault,
});

/** Customer delivery addresses backed by the existing addresses table. */
export function AddressesPage() {
  const copy = useCopy();
  const { data: profile } = useCustomerProfile();
  const { data: addresses, isLoading, isError, refetch } = useCustomerAddresses();
  const save = useSaveCustomerAddress();
  const setDefault = useSetDefaultAddress();
  const remove = useDeleteCustomerAddress();
  const [draft, setDraft] = useState<AddressInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    if (draft.fullName.trim().length < 2 || !/^[0-9]{10}$/.test(draft.phone.trim())) {
      setError(copy({ hi: "नाम और 10 अंकों का मोबाइल नंबर सही भरें।", en: "Enter a valid name and 10-digit mobile number." }));
      return;
    }
    if (draft.addressLine1.trim().length < 3 || draft.villageTown.trim().length < 2 || draft.district.trim().length < 2) {
      setError(copy({ hi: "पता, गाँव/कस्बा और ज़िला भरें।", en: "Enter address, village/town and district." }));
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(draft.pincode.trim())) {
      setError(copy({ hi: "6 अंकों का सही पिन कोड लिखें।", en: "Enter a valid 6-digit PIN code." }));
      return;
    }
    try {
      await save.mutateAsync(draft);
      toast.success(copy({ hi: "पता सेव हो गया।", en: "Address saved." }));
      setDraft(null);
    } catch {
      setError(copy({ hi: "पता सेव नहीं हो पाया। दोबारा कोशिश करें।", en: "Could not save the address. Please try again." }));
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm(copy({ hi: "यह पता हटाना है?", en: "Delete this address?" }))) return;
    try {
      await remove.mutateAsync(id);
      toast.success(copy({ hi: "पता हट गया।", en: "Address removed." }));
    } catch {
      toast.error(copy({ hi: "पता नहीं हटा। दोबारा कोशिश करें।", en: "Could not remove the address." }));
    }
  };

  return (
    <main>
      <PageIntro
        title={copy({ hi: "डिलीवरी पते", en: "Delivery addresses" })}
        description={copy({ hi: "अपने पते जोड़ें, बदलें और मुख्य पता चुनें।", en: "Add, edit and choose your default delivery address." })}
        actions={
          <Button className="rounded-full" onClick={() => { setError(null); setDraft(emptyAddress(profile?.fullName ?? "", profile?.phone ?? "")); }}>
            <Plus />
            {copy({ hi: "नया पता", en: "New address" })}
          </Button>
        }
      />
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-10 sm:px-6">
        {draft && (
          <form className="grid gap-4 rounded-lg bg-card p-6 ring-1 ring-border sm:grid-cols-2" onSubmit={onSubmit} noValidate>
            <Field id="addr-name" label={copy({ hi: "पाने वाले का नाम", en: "Receiver name" })}>
              <Input id="addr-name" value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </Field>
            <Field id="addr-phone" label={copy({ hi: "मोबाइल नंबर", en: "Mobile number" })}>
              <Input id="addr-phone" inputMode="numeric" maxLength={10} value={draft.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="addr-line1" label={copy({ hi: "पता (मकान, गली)", en: "Address (house, street)" })}>
                <Input id="addr-line1" value={draft.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field id="addr-line2" label={copy({ hi: "पता — दूसरी पंक्ति (वैकल्पिक)", en: "Address line 2 (optional)" })}>
                <Input id="addr-line2" value={draft.addressLine2 ?? ""} onChange={(e) => set("addressLine2", e.target.value)} />
              </Field>
            </div>
            <Field id="addr-landmark" label={copy({ hi: "पास की पहचान (वैकल्पिक)", en: "Landmark (optional)" })}>
              <Input id="addr-landmark" value={draft.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} />
            </Field>
            <Field id="addr-village" label={copy({ hi: "गाँव / कस्बा", en: "Village / town" })}>
              <Input id="addr-village" value={draft.villageTown} onChange={(e) => set("villageTown", e.target.value)} />
            </Field>
            <Field id="addr-district" label={copy({ hi: "ज़िला", en: "District" })}>
              <Input id="addr-district" value={draft.district} onChange={(e) => set("district", e.target.value)} />
            </Field>
            <Field id="addr-state" label={copy({ hi: "राज्य", en: "State" })}>
              <Input id="addr-state" value={draft.state} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field id="addr-pin" label={copy({ hi: "पिन कोड", en: "PIN code" })}>
              <Input id="addr-pin" inputMode="numeric" maxLength={6} value={draft.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
              {copy({ hi: "इसे मुख्य पता बनाएँ", en: "Make this my default address" })}
            </label>
            {error && <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" className="rounded-full" disabled={save.isPending}>
                {save.isPending && <Loader2 className="animate-spin" />}
                {copy({ hi: "सेव करें", en: "Save" })}
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setDraft(null)}>
                {copy({ hi: "रद्द करें", en: "Cancel" })}
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <CustomerLoading />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !addresses?.length ? (
          <EmptyState
            title={copy({ hi: "अभी कोई पता नहीं", en: "No address yet" })}
            description={copy({ hi: "डिलीवरी के लिए अपना पहला पता जोड़ें।", en: "Add your first delivery address." })}
          />
        ) : (
          <div className="space-y-3">
            {addresses.map((address) => (
              <article key={address.id} className="rounded-lg bg-card p-5 ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {address.fullName}
                      {address.isDefault && (
                        <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-strong">
                          {copy({ hi: "मुख्य पता", en: "Default" })}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[address.addressLine1, address.addressLine2, address.landmark, address.villageTown, address.district, address.state, address.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{address.phone}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!address.isDefault && (
                      <Button variant="outline" size="sm" className="rounded-full" disabled={setDefault.isPending} onClick={() => void setDefault.mutateAsync(address.id)}>
                        <Star />{copy({ hi: "मुख्य बनाएँ", en: "Set default" })}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setError(null); setDraft(toInput(address)); }}>
                      <Pencil />{copy({ hi: "बदलें", en: "Edit" })}
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-full text-destructive" onClick={() => void onDelete(address.id)}>
                      <Trash2 />{copy({ hi: "हटाएँ", en: "Delete" })}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
