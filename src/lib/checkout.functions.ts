import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CustomerAddress } from "@/lib/customer-account.functions";

/**
 * Checkout foundation (Phase 5B part 1).
 *
 * Everything that matters — prices, stock, delivery rules, tax — is read from
 * the database inside this server function using the signed-in customer's own
 * session. Nothing the browser sends is trusted, and exact inventory numbers
 * never leave the database: stock is re-validated through the existing
 * `cart_change` routine, which only reports "adjusted" / "out of stock".
 */

export type DeliveryRules = {
  freeDeliveryMinPieces: number;
  freeDeliveryMaxKm: number;
  tier1MaxKm: number;
  tier1Charge: number;
  tier2MaxKm: number;
  tier2Charge: number;
  serviceArea: string;
  estimatedText: string | null;
  estimatedTextHi: string | null;
  minimumOrderAmount: number;
};

/** `distance_unknown` is honest: no trusted distance source exists yet. */
export type DeliveryState = "free" | "charged" | "merchant_approval" | "distance_unknown";

export type DeliveryQuote = {
  state: DeliveryState;
  charge: number;
  distanceKm: number | null;
  pieces: number;
  rules: DeliveryRules;
  /** False whenever the shop has to confirm the delivery charge by hand. */
  confirmed: boolean;
  /** True when the order can be placed but the shop must confirm delivery before payment. */
  needsApproval: boolean;
  /** True when this charge comes from the shop's saved approval for this address. */
  approvedByShop: boolean;
};

export type CheckoutLine = {
  productId: string;
  name: string;
  nameHi: string;
  pack: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  requestedQuantity: number;
  lineTotal: number;
  taxRate: number | null;
  adjusted: boolean;
};

export type RemovedLine = { productId: string; name: string; nameHi: string; reason: "out_of_stock" | "unavailable" };

export type TaxBreakdown = {
  /** True only when at least one product carries a real GST rate in the database. */
  available: boolean;
  taxableValue: number;
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** Lines whose product has no GST rate stored yet. */
  linesWithoutRate: number;
};

export type CheckoutAddress = CustomerAddress & {
  /** Merchant-confirmed distance; customers can see it but never set it. */
  distanceKm: number | null;
  distanceConfirmedAt: string | null;
  /** The shop's reusable delivery decision for this exact saved address. */
  deliveryApproved: boolean;
  approvedDeliveryCharge: number | null;
};

export type CheckoutReview = {
  lines: CheckoutLine[];
  removed: RemovedLine[];
  pieces: number;
  subtotal: number;
  discountAmount: number;
  delivery: DeliveryQuote;
  tax: TaxBreakdown;
  total: number;
  stockChanged: boolean;
  addresses: CheckoutAddress[];
  selectedAddressId: string | null;
  canPlaceOrder: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function quoteDelivery(
  pieces: number,
  distanceKm: number | null,
  rules: DeliveryRules,
  approvedCharge: number | null,
): DeliveryQuote {
  const base = { distanceKm, pieces, rules, needsApproval: false, approvedByShop: false };
  // 1. A shop-approved saved address always wins over the automatic rules.
  if (approvedCharge !== null) {
    return {
      ...base,
      state: approvedCharge === 0 ? "free" : "charged",
      charge: approvedCharge,
      confirmed: true,
      approvedByShop: true,
    };
  }
  // 2. Otherwise the existing automatic rules, unchanged.
  if (distanceKm !== null && !(distanceKm > rules.freeDeliveryMaxKm && distanceKm > rules.tier2MaxKm)) {
    if (pieces >= rules.freeDeliveryMinPieces && distanceKm <= rules.freeDeliveryMaxKm) {
      return { ...base, state: "free", charge: 0, confirmed: true };
    }
    const charge = distanceKm <= rules.tier1MaxKm ? rules.tier1Charge : rules.tier2Charge;
    return { ...base, state: "charged", charge, confirmed: true };
  }
  // 3. Otherwise the shop must confirm the charge before payment.
  return {
    ...base,
    state: distanceKm === null ? "distance_unknown" : "merchant_approval",
    charge: 0,
    confirmed: false,
    needsApproval: true,
  };
}

export const reviewCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ addressId: z.string().uuid().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<CheckoutReview> => {
    const { supabase, userId } = context;

    // 1. Authoritative cart, re-validated against live stock through the
    //    existing database routine (never bypassed, never weakened).
    const current = await supabase
      .from("cart_items")
      .select("product_id, quantity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (current.error) {
      console.error("[checkout] cart read failed", current.error.message);
      throw new Error("CHECKOUT_READ_FAILED");
    }

    const requested = new Map<string, number>();
    let stockChanged = false;
    const removed: RemovedLine[] = [];

    for (const row of current.data ?? []) {
      requested.set(row.product_id, row.quantity);
      const { data: result, error } = await supabase.rpc("cart_change", {
        p_product_id: row.product_id,
        p_quantity: row.quantity,
        p_mode: "set",
      });
      if (error) {
        console.error("[checkout] stock re-check failed", { product: row.product_id, message: error.message });
        throw new Error("CHECKOUT_STOCK_CHECK_FAILED");
      }
      const validated = (Array.isArray(result) ? result[0] : result) as
        | { quantity: number; adjusted: boolean; out_of_stock: boolean }
        | undefined;
      if (validated?.out_of_stock || validated?.adjusted) stockChanged = true;
    }

    const after = await supabase
      .from("cart_items")
      .select("product_id, quantity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (after.error) {
      console.error("[checkout] cart re-read failed", after.error.message);
      throw new Error("CHECKOUT_READ_FAILED");
    }
    const validatedItems = after.data ?? [];
    const ids = validatedItems.map((row) => row.product_id);

    // 2. Prices and tax data come from the products table, never the browser.
    const products = ids.length
      ? await supabase
          .from("products")
          .select("id, name, name_hi, pack_size, unit, price, tax_rate, primary_image_url")
          .in("id", ids)
          .eq("is_active", true)
      : { data: [], error: null };
    if (products.error) {
      console.error("[checkout] product read failed", products.error.message);
      throw new Error("CHECKOUT_READ_FAILED");
    }
    const byId = new Map((products.data ?? []).map((row) => [row.id, row]));
    // Active merchant offers — same database rule create_pending_order uses.
    const offerRows = ids.length ? await supabase.rpc("active_product_discounts") : { data: [], error: null };
    if (offerRows.error) {
      console.error("[checkout] offers read failed", offerRows.error.message);
      throw new Error("CHECKOUT_READ_FAILED");
    }
    const offerPrice = new Map((offerRows.data ?? []).map((row) => [row.product_id, Number(row.discounted_price)]));

    for (const [productId, quantity] of requested) {
      if (!validatedItems.some((row) => row.product_id === productId)) {
        removed.push({ productId, name: "", nameHi: "", reason: "out_of_stock" });
        stockChanged = true;
      } else if (!byId.has(productId)) {
        removed.push({ productId, name: "", nameHi: "", reason: "unavailable" });
        stockChanged = true;
      }
      void quantity;
    }

    const lines: CheckoutLine[] = [];
    for (const row of validatedItems) {
      const product = byId.get(row.product_id);
      if (!product) continue;
      const unitPrice = offerPrice.get(row.product_id) ?? Number(product.price);
      const requestedQuantity = requested.get(row.product_id) ?? row.quantity;
      lines.push({
        productId: row.product_id,
        name: product.name,
        nameHi: product.name_hi,
        pack: product.pack_size ?? product.unit,
        imageUrl: product.primary_image_url,
        unitPrice,
        quantity: row.quantity,
        requestedQuantity,
        lineTotal: round2(unitPrice * row.quantity),
        taxRate: product.tax_rate === null ? null : Number(product.tax_rate),
        adjusted: row.quantity !== requestedQuantity,
      });
    }

    const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);

    // 3. GST is derived from the stored rate only. Selling prices are
    //    GST-inclusive, so tax is extracted from the price, never added on top.
    let taxableValue = 0;
    let totalTax = 0;
    let linesWithoutRate = 0;
    for (const line of lines) {
      if (line.taxRate === null) {
        linesWithoutRate += 1;
        taxableValue += line.lineTotal;
        continue;
      }
      const base = line.lineTotal / (1 + line.taxRate / 100);
      taxableValue += base;
      totalTax += line.lineTotal - base;
    }
    const tax: TaxBreakdown = {
      available: lines.length > 0 && linesWithoutRate < lines.length,
      taxableValue: round2(taxableValue),
      totalTax: round2(totalTax),
      cgst: round2(totalTax / 2),
      sgst: round2(totalTax / 2),
      igst: 0,
      linesWithoutRate,
    };

    // 4. Merchant-editable delivery rules.
    const settings = await supabase
      .from("delivery_settings")
      .select(
        "service_area, estimated_delivery_text, estimated_delivery_text_hi, minimum_order_amount, free_delivery_min_pieces, free_delivery_max_km, tier1_max_km, tier1_charge, tier2_max_km, tier2_charge",
      )
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (settings.error) {
      console.error("[checkout] delivery settings read failed", settings.error.message);
      throw new Error("CHECKOUT_READ_FAILED");
    }
    const rules: DeliveryRules = {
      freeDeliveryMinPieces: settings.data?.free_delivery_min_pieces ?? 5,
      freeDeliveryMaxKm: Number(settings.data?.free_delivery_max_km ?? 20),
      tier1MaxKm: Number(settings.data?.tier1_max_km ?? 10),
      tier1Charge: Number(settings.data?.tier1_charge ?? 30),
      tier2MaxKm: Number(settings.data?.tier2_max_km ?? 20),
      tier2Charge: Number(settings.data?.tier2_charge ?? 50),
      serviceArea: settings.data?.service_area ?? "",
      estimatedText: settings.data?.estimated_delivery_text ?? null,
      estimatedTextHi: settings.data?.estimated_delivery_text_hi ?? null,
      minimumOrderAmount: Number(settings.data?.minimum_order_amount ?? 0),
    };

    // 5. Addresses — only the signed-in customer's own rows (RLS enforced).
    const addressRows = await supabase
      .from("addresses")
      .select(
        "id, full_name, phone, address_line1, address_line2, landmark, village_town, district, state, pincode, is_default, distance_km, distance_confirmed_at, delivery_approved, approved_delivery_charge",
      )
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (addressRows.error) {
      console.error("[checkout] address read failed", addressRows.error.message);
      throw new Error("CHECKOUT_READ_FAILED");
    }
    const addresses: CheckoutAddress[] = (addressRows.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      landmark: row.landmark,
      villageTown: row.village_town,
      district: row.district,
      state: row.state,
      pincode: row.pincode,
      isDefault: row.is_default,
      distanceKm: row.distance_km === null ? null : Number(row.distance_km),
      distanceConfirmedAt: row.distance_confirmed_at,
      deliveryApproved: row.delivery_approved === true,
      approvedDeliveryCharge:
        row.delivery_approved === true && row.approved_delivery_charge !== null
          ? Number(row.approved_delivery_charge)
          : null,
    }));
    const selected =
      addresses.find((address) => address.id === data.addressId)?.id ??
      addresses.find((address) => address.isDefault)?.id ??
      addresses[0]?.id ??
      null;

    // The only distance the pricing trusts is the merchant-confirmed one on
    // the selected address. Nothing from the browser is used.
    const selectedAddress = addresses.find((address) => address.id === selected) ?? null;
    const delivery = quoteDelivery(
      pieces,
      selectedAddress?.distanceKm ?? null,
      rules,
      selectedAddress?.approvedDeliveryCharge ?? null,
    );

    // Discounts are not applied in this phase; no code entry exists yet.
    const discountAmount = 0;
    const total = round2(subtotal - discountAmount + delivery.charge);

    return {
      lines,
      removed,
      pieces,
      subtotal,
      discountAmount,
      delivery,
      tax,
      total,
      stockChanged,
      addresses,
      selectedAddressId: selected,
      canPlaceOrder:
        lines.length > 0 &&
        !stockChanged &&
        selected !== null &&
        (delivery.confirmed || delivery.needsApproval) &&
        subtotal >= rules.minimumOrderAmount,
    };
  });
