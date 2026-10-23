import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin-catalog.functions";

export type AdminCustomer = {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  addressCount: number;
};

export type AdminCustomerAddress = {
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
  distanceKm: number | null;
  distanceConfirmedAt: string | null;
  estimateStatus: string;
  estimatedDistanceKm: number | null;
  estimatedDurationMin: number | null;
  estimatedAt: string | null;
};

const ADDRESS_COLUMNS =
  "id, user_id, full_name, phone, address_line1, address_line2, landmark, village_town, district, state, pincode, is_default, distance_km, distance_confirmed_at, estimate_status, estimated_distance_km, estimated_duration_min, estimated_at";

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
  distance_km: number | null;
  distance_confirmed_at: string | null;
  estimate_status: string;
  estimated_distance_km: number | null;
  estimated_duration_min: number | null;
  estimated_at: string | null;
};

const toAddress = (row: AddressRow): AdminCustomerAddress => ({
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
  estimateStatus: row.estimate_status,
  estimatedDistanceKm: row.estimated_distance_km === null ? null : Number(row.estimated_distance_km),
  estimatedDurationMin: row.estimated_duration_min === null ? null : Number(row.estimated_duration_min),
  estimatedAt: row.estimated_at,
});

/** Customer list for the merchant. Runs as the signed-in admin, so RLS applies. */
export const listAdminCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCustomer[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, phone, is_active, created_at")
      .eq("role", "customer")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const { data: addressRows, error: addressError } = await context.supabase.from("addresses").select("user_id");
    if (addressError) throw addressError;
    const counts = new Map<string, number>();
    for (const row of addressRows ?? []) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);

    // Email lives only in Supabase auth. The caller is already verified as an
    // admin above; only the email address is read — nothing else from auth.
    const emails = new Map<string, string>();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (let page = 1; page <= 50; page++) {
        const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (usersError) throw usersError;
        for (const u of users.users) if (u.email) emails.set(u.id, u.email);
        if (users.users.length < 1000) break;
      }
    } catch (err) {
      console.error("listAdminCustomers: could not read customer emails", err);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      email: emails.get(row.id) ?? null,
      isActive: row.is_active,
      createdAt: row.created_at,
      addressCount: counts.get(row.id) ?? 0,
    }));
  });

export const listAdminCustomerAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AdminCustomerAddress[]> => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("addresses")
      .select(ADDRESS_COLUMNS)
      .eq("user_id", data.userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((rows ?? []) as AddressRow[]).map(toAddress);
  });

/**
 * Merchant-confirmed delivery distance. The value is written as the signed-in
 * admin; the database trigger rejects the same write from anyone else and the
 * CHECK constraint rejects negative values.
 */
export const setAddressDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        addressId: z.string().uuid(),
        distanceKm: z.number().nonnegative().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminCustomerAddress> => {
    await assertAdmin(context);
    const { data: saved, error } = await context.supabase
      .from("addresses")
      .update({ distance_km: data.distanceKm })
      .eq("id", data.addressId)
      .select(ADDRESS_COLUMNS)
      .single();
    if (error) {
      console.error("[admin] distance update failed", error.message);
      throw new Error("DISTANCE_UPDATE_FAILED");
    }
    await logAudit(context.supabase, context.userId, "address.distance_confirm", "addresses", data.addressId, {
      distance_km: data.distanceKm,
    });
    return toAddress(saved as AddressRow);
  });
