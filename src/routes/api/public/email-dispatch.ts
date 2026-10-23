import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/email-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["EMAIL_DISPATCH_SECRET"];
        const provided = request.headers.get("x-dispatch-secret") ?? "";
        if (!expected || expected.length < 16 || !secretMatches(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { runEmailDispatch } = await import("@/lib/email-dispatch.server");
          const result = await runEmailDispatch(20);
          return Response.json(result);
        } catch {
          console.error("[email-dispatch] run failed");
          return Response.json({ error: "dispatch failed" }, { status: 500 });
        }
      },
    },
  },
});
