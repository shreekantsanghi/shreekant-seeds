// Cloudflare Cron Trigger → protected email-dispatch endpoint (in-process, no network hop).
import { definePlugin } from "nitro";
import { useNitroApp } from "nitro/app";

export default definePlugin((nitroApp) => {
  (nitroApp as any).hooks.hook("cloudflare:scheduled", async ({ env }: { env: any }) => {
    const secret = env?.EMAIL_DISPATCH_SECRET ?? process.env["EMAIL_DISPATCH_SECRET"];
    if (!secret) {
      console.error("[email-cron] EMAIL_DISPATCH_SECRET not set; skipping");
      return;
    }
    const origin = env?.SITE_URL ?? process.env["SITE_URL"] ?? "https://shreekantseeds.in";
    try {
      const res = await useNitroApp().fetch(
        new Request(`${String(origin).replace(/\/$/, "")}/api/public/email-dispatch`, {
          method: "POST",
          headers: { "x-dispatch-secret": String(secret) },
        }),
      );
      console.log(`[email-cron] dispatch status ${res.status}`);
    } catch {
      console.error("[email-cron] dispatch call failed");
    }
  });
});
