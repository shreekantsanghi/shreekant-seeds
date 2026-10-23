import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/store/core";
import { issueMerchantRefund } from "@/lib/admin-refunds.functions";
import type { AdminOrderDetailData } from "@/lib/admin-orders.functions";
import { formatDate } from "@/lib/orders-shared";
import { useCopy, useStore } from "@/lib/store-context";

const PAID = ["paid", "captured"];
const round2 = (n: number) => Math.round(n * 100) / 100;

const REFUND_STATUS: Record<string, { hi: string; en: string }> = {
  pending: { hi: "रिफंड पुष्टि की प्रतीक्षा में", en: "Refund pending confirmation" },
  processed: { hi: "रिफंड हो गया", en: "Refund processed" },
  failed: { hi: "रिफंड विफल", en: "Refund failed" },
};

const REFUND_ERRORS: Record<string, { hi: string; en: string }> = {
  EXCEEDS_REMAINING: { hi: "राशि बची हुई रिफंड योग्य राशि से ज़्यादा है।", en: "Amount is more than the remaining refundable amount." },
  NOTHING_REMAINING: { hi: "इस ऑर्डर में रिफंड के लिए कुछ नहीं बचा।", en: "Nothing is left to refund on this order." },
  NO_PAYMENT: { hi: "इस ऑर्डर का सफल भुगतान नहीं मिला।", en: "No successful payment was found for this order." },
  NOT_CONFIGURED: { hi: "भुगतान सेवा अभी सेट नहीं है।", en: "The payment service is not set up." },
  RAZORPAY_REJECTED: { hi: "Razorpay ने यह रिफंड अस्वीकार कर दिया।", en: "Razorpay rejected this refund." },
};

export function refundSummary(order: AdminOrderDetailData) {
  const paid = round2(order.payments.filter((p) => PAID.includes(p.status) && p.providerPaymentId).reduce((s, p) => s + p.amount, 0));
  const refunded = round2(order.refunds.filter((r) => r.status === "processed").reduce((s, r) => s + r.amount, 0));
  const pending = round2(order.refunds.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0));
  const remaining = Math.max(0, round2(paid - refunded - pending));
  return { paid, refunded, pending, remaining };
}

/** Merchant-only refund card: history plus the guarded refund dialog. */
export function RefundPanel({ order }: { order: AdminOrderDetailData }) {
  const copy = useCopy();
  const { language } = useStore();
  const [open, setOpen] = useState(false);
  const { paid, refunded, pending, remaining } = refundSummary(order);
  const refundable = ["paid", "partially_refunded"].includes(order.paymentStatus) && paid > 0 && remaining > 0;
  if (paid === 0 && order.refunds.length === 0) return null;

  return (
    <div className="rounded-lg bg-card p-5 ring-1 ring-border">
      <h2 className="font-display text-xl font-semibold">{copy({ hi: "रिफंड", en: "Refunds" })}</h2>
      <div className="mt-2 space-y-0.5 text-sm">
        <p>{copy({ hi: "रिफंड हुआ", en: "Refunded" })}: {money(refunded)}</p>
        {pending > 0 && <p className="text-muted-foreground">{copy({ hi: "पुष्टि बाकी", en: "Pending confirmation" })}: {money(pending)}</p>}
        <p className="text-muted-foreground">{copy({ hi: "बची रिफंड योग्य राशि", en: "Remaining refundable" })}: {money(remaining)}</p>
      </div>
      {order.refunds.length > 0 && (
        <ul className="mt-3 space-y-2 text-xs">
          {order.refunds.map((r) => (
            <li key={r.id} className="rounded-md bg-surface p-3">
              <p className="font-semibold">
                {money(r.amount)} · <span className={r.status === "failed" ? "text-destructive" : undefined}>{copy(REFUND_STATUS[r.status] ?? { hi: r.status, en: r.status })}</span>
              </p>
              <p className="mt-1 text-muted-foreground">{formatDate(r.createdAt, language)}</p>
              {r.reason && <p className="text-muted-foreground">{copy({ hi: "कारण", en: "Reason" })}: {r.reason}</p>}
              {r.status === "failed" && r.failureReason && <p className="text-destructive">{r.failureReason}</p>}
              {r.razorpayRefundId && <p className="break-all text-muted-foreground">Refund ID: {r.razorpayRefundId}</p>}
            </li>
          ))}
        </ul>
      )}
      {refundable && (
        <Button variant="outline" className="mt-4 w-full rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
          <RotateCcw className="size-4" />
          {copy({ hi: "रिफंड करें", en: "Refund" })}
        </Button>
      )}
      {open && <RefundDialog order={order} paid={paid} refunded={refunded + pending} remaining={remaining} onClose={() => setOpen(false)} />}
    </div>
  );
}

function RefundDialog({ order, paid, refunded, remaining, onClose }: { order: AdminOrderDetailData; paid: number; refunded: number; remaining: number; onClose: () => void }) {
  const copy = useCopy();
  const queryClient = useQueryClient();
  const refund = useServerFn(issueMerchantRefund);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  // One key per dialog opening, so a double submit or retry never creates a second refund.
  const [idempotencyKey] = useState(() => `rf-${order.id.slice(0, 8)}-${crypto.randomUUID()}`);

  const partialValue = Number(amount);
  const amountError =
    mode === "partial" &&
    (amount.trim() === "" || !/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !(partialValue > 0) || partialValue > remaining);
  const canSubmit = confirm === "refund" && !amountError;

  const mutation = useMutation({
    mutationFn: () =>
      refund({ data: { orderId: order.id, amount: mode === "partial" ? round2(partialValue) : null, reason: reason.trim() || undefined, idempotencyKey } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-order", order.id] });
      if (result.ok) {
        toast.success(copy({ hi: "रिफंड भेजा गया — पुष्टि की प्रतीक्षा है।", en: "Refund submitted — pending confirmation." }));
        onClose();
      } else {
        toast.error(copy(REFUND_ERRORS[result.code] ?? { hi: "रिफंड नहीं हो सका।", en: "The refund could not be issued." }));
      }
    },
    onError: (error) => {
      const raw = error instanceof Error ? error.message : "";
      toast.error(
        raw.includes("MFA")
          ? copy({ hi: "पहले दो-चरण सत्यापन पूरा करें।", en: "Please complete two-step verification first." })
          : copy({ hi: "रिफंड नहीं हो सका। दोबारा कोशिश करें।", en: "The refund could not be issued. Please try again." }),
      );
    },
  });

  const field = "h-11 w-full rounded-md border border-input bg-background px-3";
  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy({ hi: "रिफंड", en: "Refund" })} · {order.orderNumber}</DialogTitle>
          <DialogDescription className="font-medium text-destructive">
            {copy({ hi: "यह ग्राहक के मूल भुगतान माध्यम में असली रिफंड है।", en: "This is a real refund to the customer's original payment method." })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 rounded-md bg-surface p-3 text-sm">
          <p>{copy({ hi: "भुगतान की गई राशि", en: "Paid amount" })}: <strong>{money(paid)}</strong></p>
          <p>{copy({ hi: "पहले से रिफंड", en: "Already refunded" })}: <strong>{money(refunded)}</strong></p>
          <p>{copy({ hi: "बची रिफंड योग्य राशि", en: "Remaining refundable" })}: <strong>{money(remaining)}</strong></p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{copy({ hi: "रिफंड का प्रकार", en: "Refund type" })}</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="refund-mode" className="size-5" checked={mode === "full"} onChange={() => setMode("full")} />
            {copy({ hi: "पूरा रिफंड", en: "Full refund" })} ({money(remaining)})
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="refund-mode" className="size-5" checked={mode === "partial"} onChange={() => setMode("partial")} />
            {copy({ hi: "आंशिक रिफंड", en: "Partial refund" })}
          </label>
        </fieldset>
        {mode === "partial" && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{copy({ hi: "राशि (₹)", en: "Amount (₹)" })}</span>
            <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountError || undefined} />
            {amount.trim() !== "" && amountError && (
              <span className="mt-1 block text-xs text-destructive">
                {copy({ hi: `0 से ज़्यादा, अधिकतम 2 दशमलव, और ${money(remaining)} से ज़्यादा नहीं।`, en: `Above 0, up to 2 decimals, and not more than ${money(remaining)}.` })}
              </span>
            )}
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{copy({ hi: "कारण (वैकल्पिक)", en: "Reason (optional)" })}</span>
          <input className={field} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{copy({ hi: "पुष्टि के लिए नीचे refund लिखें।", en: "Type refund below to confirm." })}</span>
          <input className={field} autoComplete="off" autoCapitalize="off" spellCheck={false} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="refund" />
        </label>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>{copy({ hi: "रहने दें", en: "Cancel" })}</Button>
          <Button variant="destructive" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {copy({ hi: "रिफंड की पुष्टि करें", en: "Confirm refund" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
