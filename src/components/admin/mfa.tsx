import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/admin-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopy } from "@/lib/store-context";

type Factor = { id: string; status: string; friendlyName?: string | undefined };
type Enrollment = { factorId: string; qr: string; secret: string };

/** Supabase Auth TOTP enrolment for the signed-in admin. No secret is stored by the app. */
export function AdminMfaCard() {
  const copy = useCopy();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError(copy({ hi: "दो-चरणीय सुरक्षा की जानकारी नहीं मिल पाई।", en: "Could not load two-step security details." }));
      setFactors([]);
      return;
    }
    setFactors(data.totp.map((factor) => ({ id: factor.id, status: factor.status, friendlyName: factor.friendly_name ?? undefined })));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const startEnrollment = async () => {
    setBusy(true); setError(null); setNotice(null);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `admin-${Date.now()}` });
    setBusy(false);
    if (enrollError || !data) {
      setError(copy({
        hi: "दो-चरणीय सुरक्षा चालू नहीं हो पाई। यह सुविधा Supabase प्रोजेक्ट सेटिंग में चालू होनी चाहिए।",
        en: "Could not start two-step security. It must be enabled in the Supabase project settings.",
      }));
      return;
    }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verifyEnrollment = async () => {
    if (!enrollment) return;
    setBusy(true); setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) {
      setError(copy({ hi: "कोड गलत है या समय निकल गया।", en: "That code is incorrect or expired." }));
      return;
    }
    setEnrollment(null); setCode("");
    setNotice(copy({ hi: "दो-चरणीय सुरक्षा चालू हो गई।", en: "Two-step security is now on." }));
    await load();
  };

  const removeFactor = async (factorId: string) => {
    setBusy(true); setError(null);
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (unenrollError) {
      setError(copy({ hi: "हटाया नहीं जा सका।", en: "Could not remove it." }));
      return;
    }
    await load();
  };

  const verified = (factors ?? []).filter((factor) => factor.status === "verified");

  return (
    <section className="mt-6 rounded-lg bg-card p-5 ring-1 ring-border">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 size-5 text-accent" />
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold">{copy({ hi: "दो-चरणीय सुरक्षा (TOTP)", en: "Two-step security (TOTP)" })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy({
              hi: "ऑथेंटिकेटर ऐप जोड़ें ताकि लॉगिन के समय पासवर्ड के साथ एक कोड भी माँगा जाए।",
              en: "Add an authenticator app so sign-in asks for a code along with the password.",
            })}
          </p>
        </div>
      </div>

      {factors === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
      ) : verified.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {verified.map((factor) => (
            <li key={factor.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
              <span className="truncate">{factor.friendlyName ?? copy({ hi: "ऑथेंटिकेटर ऐप", en: "Authenticator app" })}</span>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void removeFactor(factor.id)}>{copy({ hi: "हटाएँ", en: "Remove" })}</Button>
            </li>
          ))}
        </ul>
      ) : enrollment ? (
        <div className="mt-4 space-y-3">
          <img src={enrollment.qr} alt={copy({ hi: "TOTP QR कोड", en: "TOTP QR code" })} className="size-44 rounded-md bg-white p-2" />
          <p className="break-all text-xs text-muted-foreground">{copy({ hi: "मैनुअल कुंजी", en: "Manual key" })}: {enrollment.secret}</p>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">{copy({ hi: "ऐप का 6 अंकों का कोड", en: "6-digit code from the app" })}</Label>
            <Input id="mfa-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <Button disabled={busy} onClick={() => void verifyEnrollment()}>{busy && <Loader2 className="animate-spin" />}{copy({ hi: "चालू करें", en: "Turn on" })}</Button>
        </div>
      ) : (
        <Button className="mt-4" disabled={busy} onClick={() => void startEnrollment()}>{busy && <Loader2 className="animate-spin" />}{copy({ hi: "ऑथेंटिकेटर ऐप जोड़ें", en: "Add authenticator app" })}</Button>
      )}

      {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}
      {notice && <p className="mt-3 text-sm font-medium text-primary">{notice}</p>}
    </section>
  );
}
