import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut, MapPinned, MonitorSmartphone, Phone, Store, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminHeading } from "@/components/admin/core";
import { AdminMfaCard } from "@/components/admin/mfa";
import { useCopy, useStore } from "@/lib/store-context";
import { useAdminSession, useAdminSignOut } from "@/lib/use-admin-session";
import { listAdminDevices, revokeAdminDevices } from "@/lib/admin-devices.functions";
import { cn } from "@/lib/utils";

/** Short, friendly label for a device from its browser details. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iPhone/iPad" : /windows/i.test(ua) ? "Windows" : /mac os|macintosh/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "Device";
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "Browser";
  return `${os} · ${browser}`;
}

function formatWhen(iso: string, language: "hi" | "en"): string {
  const d = new Date(iso);
  return d.toLocaleString(language === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Logged-in devices: see where the merchant account is signed in and sign out other devices. */
function AdminDevicesCard() {
  const copy = useCopy();
  const { language } = useStore();
  const queryClient = useQueryClient();
  const fetchDevices = useServerFn(listAdminDevices);
  const revokeDevices = useServerFn(revokeAdminDevices);

  const devices = useQuery({ queryKey: ["admin-devices"], queryFn: () => fetchDevices(), staleTime: 15_000 });
  const revoke = useMutation({
    mutationFn: (sessionId: string | null) => revokeDevices({ data: { sessionId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-devices"] }),
  });

  const confirmRevoke = (sessionId: string | null) => {
    const message = sessionId
      ? copy({ hi: "इस डिवाइस से लॉगआउट करें?", en: "Sign out this device?" })
      : copy({ hi: "इस डिवाइस को छोड़कर बाकी सभी डिवाइस से लॉगआउट करें?", en: "Sign out all other devices except this one?" });
    if (window.confirm(message)) revoke.mutate(sessionId);
  };

  return (
    <Section
      title={copy({ hi: "लॉगिन डिवाइस", en: "Logged-in devices" })}
      description={copy({
        hi: "देखें आपका खाता किन डिवाइस पर खुला है। अधिकतम 4 डिवाइस — पुराने डिवाइस यहाँ से हटा सकते हैं।",
        en: "See where your account is signed in. Maximum 4 devices — you can remove old ones here.",
      })}
    >
      {devices.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{copy({ hi: "लोड हो रहा है…", en: "Loading…" })}</p>
      ) : devices.isError ? (
        <p className="text-sm text-destructive">{copy({ hi: "डिवाइस सूची नहीं खुल पाई।", en: "Could not load the device list." })}</p>
      ) : (
        <ul className="grid gap-3">
          {(devices.data ?? []).map((d) => (
            <li key={d.sessionId} className="flex items-start justify-between gap-3 rounded-md bg-surface p-3 ring-1 ring-border">
              <div className="flex min-w-0 gap-3">
                <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {deviceLabel(d.userAgent)}
                    {d.isCurrent && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-strong">{copy({ hi: "यह डिवाइस", en: "This device" })}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {copy({ hi: "लॉगिन:", en: "Signed in:" })} {formatWhen(d.createdAt, language)}
                    {" · "}{copy({ hi: "आखिरी उपयोग:", en: "Last active:" })} {formatWhen(d.lastActiveAt, language)}
                    {d.ip ? ` · ${d.ip}` : ""}
                  </p>
                </div>
              </div>
              {!d.isCurrent && (
                <Button variant="outline" size="sm" className="shrink-0 rounded-full" disabled={revoke.isPending} onClick={() => confirmRevoke(d.sessionId)}>
                  <Trash2 className="size-4" />
                  {copy({ hi: "हटाएँ", en: "Remove" })}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {revoke.isError && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{copy({ hi: "डिवाइस हटाया नहीं जा सका। फिर कोशिश करें।", en: "Could not remove the device. Please try again." })}</p>}
      {(devices.data?.length ?? 0) > 1 && (
        <Button variant="outline" className="mt-4 rounded-full" disabled={revoke.isPending} onClick={() => confirmRevoke(null)}>
          {revoke.isPending && <Loader2 className="animate-spin" />}
          {copy({ hi: "बाकी सभी डिवाइस से लॉगआउट", en: "Sign out all other devices" })}
        </Button>
      )}
    </Section>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-5 ring-1 ring-border">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Real settings only: every item shown here either works or reflects live information. */
export function AdminSettings() {
  const copy = useCopy();
  const { language, setLanguage } = useStore();
  const session = useAdminSession();
  const signOut = useAdminSignOut();

  return (
    <>
      <AdminHeading title={copy({ hi: "सेटिंग", en: "Settings" })} description={copy({ hi: "दुकान की जानकारी, पसंद और खाते की सुरक्षा।", en: "Shop details, preferences and account security." })} />
      <div className="grid max-w-4xl gap-5">
        <Section
          title={copy({ hi: "दुकान की जानकारी", en: "Store profile" })}
          description={copy({ hi: "यह जानकारी वेबसाइट और चालान पर दिखती है। इसे बदलने के लिए दुकान के तकनीकी सहायक से संपर्क करें।", en: "This is what customers see on the website and invoices. Contact your technical helper to change it." })}
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex gap-3"><Store className="mt-0.5 size-5 shrink-0 text-accent" /><div><dt className="text-muted-foreground">{copy({ hi: "दुकान", en: "Shop" })}</dt><dd className="font-medium">{copy({ hi: "श्रीकान्त सीड्स", en: "Shreekant Seeds" })}</dd></div></div>
            <div className="flex gap-3"><Phone className="mt-0.5 size-5 shrink-0 text-accent" /><div><dt className="text-muted-foreground">{copy({ hi: "फ़ोन / WhatsApp", en: "Phone / WhatsApp" })}</dt><dd className="font-medium">94144 66727</dd></div></div>
            <div className="flex gap-3 sm:col-span-2"><MapPinned className="mt-0.5 size-5 shrink-0 text-accent" /><div><dt className="text-muted-foreground">{copy({ hi: "पता", en: "Address" })}</dt><dd className="font-medium">Kapil Mandi, Neem Ka Thana, Sikar, Rajasthan — 332713</dd></div></div>
          </dl>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <Link to="/admin/delivery">{copy({ hi: "डिलीवरी सेटिंग खोलें", en: "Open delivery settings" })}</Link>
          </Button>
        </Section>

        <Section title={copy({ hi: "पसंद", en: "Preferences" })} description={copy({ hi: "इस डिवाइस पर दुकान प्रबंधन की भाषा।", en: "Language for the merchant workspace on this device." })}>
          <div className="inline-flex rounded-full bg-surface p-1 ring-1 ring-border" role="group" aria-label={copy({ hi: "भाषा", en: "Language" })}>
            {(["hi", "en"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)} className={cn("min-h-11 rounded-full px-5 text-sm font-semibold", language === l ? "bg-primary text-primary-foreground" : "text-foreground")}>
                {l === "hi" ? "हिन्दी" : "English"}
              </button>
            ))}
          </div>
        </Section>

        <AdminMfaCard />

        <AdminDevicesCard />

        <Section title={copy({ hi: "खाता", en: "Account" })}>
          <p className="text-sm">{session.data?.fullName ?? copy({ hi: "संचालक", en: "Merchant" })}</p>
          <p className="text-sm text-muted-foreground">{session.data?.email ?? ""}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            {copy({ hi: "लॉगआउट करें", en: "Sign out" })}
          </Button>
        </Section>
      </div>
    </>
  );
}
