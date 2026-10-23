import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomerProfile = {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
};

export type CustomerAddress = {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

const addressInput = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[0-9]{10}$/),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  villageTown: z.string().trim().min(2).max(120),
  district: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120).default("Rajasthan"),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/),
  isDefault: z.boolean().default(false),
});

type AddressRow = {
  id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  village_town: string;
  district: string;
  state: string;
  pincode: string;
  is_default: boolean;
};

const toAddress = (row: AddressRow): CustomerAddress => ({
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
});

/**
 * Reads the signed-in customer's own profile, creating it on first use.
 * The role is always forced to "customer" here; the browser can never supply it.
 */
export const getCustomerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerProfile> => {
    const claims = context.claims as unknown as Record<string, unknown>;
    const email = typeof claims["email"] === "string" ? (claims["email"] as string) : null;
    const metadata = (claims["user_metadata"] ?? {}) as Record<string, unknown>;

    const { data, error } = await context.supabase
      .from("profiles")
      .select("full_name, phone, role, is_active")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const fullName = typeof metadata["full_name"] === "string" ? (metadata["full_name"] as string) : null;
      const phone = typeof metadata["phone"] === "string" ? (metadata["phone"] as string) : null;
      const { data: created, error: insertError } = await context.supabase
        .from("profiles")
        .insert({ id: context.userId, full_name: fullName, phone, role: "customer", is_active: true })
        .select("full_name, phone, role, is_active")
        .single();
      if (insertError) throw insertError;
      return {
        userId: context.userId,
        email,
        fullName: created.full_name,
        phone: created.phone,
        role: created.role,
        isActive: created.is_active,
      };
    }

    return {
      userId: context.userId,
      email,
      fullName: data.full_name,
      phone: data.phone,
      role: data.role,
      isActive: data.is_active,
    };
  });

/** Updates only the customer's own name and phone. Role and status are never touched. */
export const updateCustomerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(100),
        phone: z.string().trim().regex(/^[0-9]{10}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

export const listCustomerAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerAddress[]> => {
    const { data, error } = await context.supabase
      .from("addresses")
      .select("id, full_name, phone, address_line1, address_line2, landmark, village_town, district, state, pincode, is_default")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toAddress);
  });

export const saveCustomerAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => addressInput.parse(input))
  .handler(async ({ data, context }): Promise<CustomerAddress> => {
    const row = {
      user_id: context.userId,
      full_name: data.fullName,
      phone: data.phone,
      address_line1: data.addressLine1,
      address_line2: data.addressLine2 || null,
      landmark: data.landmark || null,
      village_town: data.villageTown,
      district: data.district,
      state: data.state,
      pincode: data.pincode,
      is_default: data.isDefault,
    };

    const columns =
      "id, full_name, phone, address_line1, address_line2, landmark, village_town, district, state, pincode, is_default";

    const saved = data.id
      ? await context.supabase.from("addresses").update(row).eq("id", data.id).eq("user_id", context.userId).select(columns).single()
      : await context.supabase.from("addresses").insert(row).select(columns).single();
    if (saved.error) throw saved.error;

    if (data.isDefault) {
      const { error: clearError } = await context.supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", context.userId)
        .neq("id", saved.data.id);
      if (clearError) throw clearError;
    }

    // Phase 14: best-effort road-distance estimate. Never blocks or fails the
    // save; the runner swallows its own errors and skips addresses whose
    // estimate is still current.
    try {
      const { runAddressEstimate } = await import("@/lib/geo-distance.server");
      await runAddressEstimate(saved.data.id);
    } catch {
      // ignore — estimation is decision support only
    }

    return toAddress(saved.data);
  });

export const setDefaultCustomerAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error: clearError } = await context.supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .neq("id", data.id);
    if (clearError) throw clearError;
    const { error } = await context.supabase
      .from("addresses")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

export const deleteCustomerAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("addresses")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true } as const;
  });
