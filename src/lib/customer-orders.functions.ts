import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  OrderAddressSnapshot,
  OrderItemSnapshot,
  OrderSummaryRow,
  OrderTotals,
} from "@/lib/orders-shared";

/**
 * Phase 5B Part 2E — real customer orders.
 *
 * Every read runs as the signed-in customer through requireSupabaseAuth, so the
 * existing RLS policies ("Customers can view their own orders" and the matching
 * order_items policy) are the authority: changing an id in the URL simply
 * returns nothing. No payment provider identifiers are returned to customers.
 */

export type CustomerOrderDetail = OrderTotals & {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryDistanceKm: number | null;
  deliveryAddress: OrderAddressSnapshot | null;
  customerNote: string | null;
  /** True while the shop still has to confirm the delivery charge. */
  deliveryApprovalRequired: boolean;
  items: OrderItemSnapshot[];
};

const ITEM_COLUMNS =
  "id, product_name, product_name_hi, product_type, pack_size, unit, sku, hsn_code, quantity, unit_price, tax_rate, tax_amount, total_price";

type ItemRow = {
  id: string;
  product_name: string;
  product_name_hi: string;
  product_type: string | null;
  pack_size: string | null;
  unit: string | null;
  sku: string | null;
  hsn_code: string | null;
  quantity: number;
  unit_price: number | string;
  tax_rate: number | string | null;
  tax_amount: number | string;
  total_price: number | string;
};

const num = (value: number | string | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

export const toItem = (row: ItemRow): OrderItemSnapshot => ({
  id: row.id,
  productName: row.product_name,
  productNameHi: row.product_name_hi,
  productType: row.product_type,
  packSize: row.pack_size,
  unit: row.unit,
  sku: row.sku,
  hsnCode: row.hsn_code,
  quantity: row.quantity,
  unitPrice: num(row.unit_price),
  taxRate: row.tax_rate === null ? null : Number(row.tax_rate),
  taxAmount: num(row.tax_amount),
  totalPrice: num(row.total_price),
});

/** The signed-in customer's own orders, newest first. */
export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrderSummaryRow[]> => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, created_at, order_items(quantity)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return (data ?? []).map((row) => {
      const items = (row.order_items as unknown as { quantity: number }[] | null) ?? [];
      return {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        paymentStatus: row.payment_status,
        totalAmount: num(row.total_amount),
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        createdAt: row.created_at,
      };
    });
  });

/** One of the customer's own orders. RLS blocks any other customer's id. */
export const getMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CustomerOrderDetail | null> => {
    const { data: row, error } = await context.supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, created_at, customer_name, customer_phone, delivery_address, delivery_distance_km, customer_note, delivery_approval_required, subtotal, discount_amount, delivery_charge, taxable_value, cgst_amount, sgst_amount, igst_amount, tax_amount, total_amount",
      )
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;

    const { data: itemRows, error: itemError } = await context.supabase
      .from("order_items")
      .select(ITEM_COLUMNS)
      .eq("order_id", row.id)
      .order("created_at", { ascending: true });
    if (itemError) throw itemError;

    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      deliveryDistanceKm: row.delivery_distance_km === null ? null : Number(row.delivery_distance_km),
      deliveryAddress: (row.delivery_address as OrderAddressSnapshot | null) ?? null,
      customerNote: row.customer_note,
      deliveryApprovalRequired: row.delivery_approval_required === true,
      subtotal: num(row.subtotal),
      discountAmount: num(row.discount_amount),
      deliveryCharge: num(row.delivery_charge),
      taxableValue: num(row.taxable_value),
      cgstAmount: num(row.cgst_amount),
      sgstAmount: num(row.sgst_amount),
      igstAmount: num(row.igst_amount),
      taxAmount: num(row.tax_amount),
      totalAmount: num(row.total_amount),
      items: ((itemRows ?? []) as ItemRow[]).map(toItem),
    };
  });
