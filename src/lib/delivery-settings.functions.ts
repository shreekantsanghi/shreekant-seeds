import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin-catalog.functions";

export type MerchantDeliverySettings = {
  id: string;
  serviceArea: string;
  estimatedText: string | null;
  estimatedTextHi: string | null;
  minimumOrderAmount: number;
  freeDeliveryMinPieces: number;
  freeDeliveryMaxKm: number;
  tier1MaxKm: number;
  tier1Charge: number;
  tier2MaxKm: number;
  tier2Charge: number;
  isActive: boolean;
  originLat: number | null;
  originLon: number | null;
  originLabel: string | null;
};

const COLUMNS =
  "id, service_area, estimated_delivery_text, estimated_delivery_text_hi, minimum_order_amount, free_delivery_min_pieces, free_delivery_max_km, tier1_max_km, tier1_charge, tier2_max_km, tier2_charge, is_active, origin_lat, origin_lon, origin_label";

type Row = {
  id: string;
  service_area: string;
  estimated_delivery_text: string | null;
  estimated_delivery_text_hi: string | null;
  minimum_order_amount: number;
  free_delivery_min_pieces: number;
  free_delivery_max_km: number;
  tier1_max_km: number;
  tier1_charge: number;
  tier2_max_km: number;
  tier2_charge: number;
  is_active: boolean;
  origin_lat: number | null;
  origin_lon: number | null;
  origin_label: string | null;
};

const toSettings = (row: Row): MerchantDeliverySettings => ({
  id: row.id,
  serviceArea: row.service_area,
  estimatedText: row.estimated_delivery_text,
  estimatedTextHi: row.estimated_delivery_text_hi,
  minimumOrderAmount: Number(row.minimum_order_amount),
  freeDeliveryMinPieces: row.free_delivery_min_pieces,
  freeDeliveryMaxKm: Number(row.free_delivery_max_km),
  tier1MaxKm: Number(row.tier1_max_km),
  tier1Charge: Number(row.tier1_charge),
  tier2MaxKm: Number(row.tier2_max_km),
  tier2Charge: Number(row.tier2_charge),
  isActive: row.is_active,
  originLat: row.origin_lat === null ? null : Number(row.origin_lat),
  originLon: row.origin_lon === null ? null : Number(row.origin_lon),
  originLabel: row.origin_label,
});

export const getMerchantDeliverySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MerchantDeliverySettings | null> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("delivery_settings")
      .select(COLUMNS)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toSettings(data as Row) : null;
  });

const settingsInput = z.object({
  id: z.string().uuid(),
  serviceArea: z.string().trim().min(2).max(200),
  estimatedText: z.string().trim().max(200).nullable(),
  estimatedTextHi: z.string().trim().max(200).nullable(),
  minimumOrderAmount: z.number().min(0).max(1_000_000),
  freeDeliveryMinPieces: z.number().int().min(1).max(999),
  freeDeliveryMaxKm: z.number().min(0).max(500),
  tier1MaxKm: z.number().min(0).max(500),
  tier1Charge: z.number().min(0).max(100_000),
  tier2MaxKm: z.number().min(0).max(500),
  tier2Charge: z.number().min(0).max(100_000),
  originLat: z.number().min(-90).max(90).nullable(),
  originLon: z.number().min(-180).max(180).nullable(),
  originLabel: z.string().trim().max(200).nullable(),
});

export const saveMerchantDeliverySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => settingsInput.parse(input))
  .handler(async ({ data, context }): Promise<MerchantDeliverySettings> => {
    await assertAdmin(context);
    const { data: saved, error } = await context.supabase
      .from("delivery_settings")
      .update({
        service_area: data.serviceArea,
        estimated_delivery_text: data.estimatedText,
        estimated_delivery_text_hi: data.estimatedTextHi,
        minimum_order_amount: data.minimumOrderAmount,
        free_delivery_min_pieces: data.freeDeliveryMinPieces,
        free_delivery_max_km: data.freeDeliveryMaxKm,
        tier1_max_km: data.tier1MaxKm,
        tier1_charge: data.tier1Charge,
        tier2_max_km: data.tier2MaxKm,
        tier2_charge: data.tier2Charge,
        origin_lat: data.originLat,
        origin_lon: data.originLon,
        origin_label: data.originLabel,
      })
      .eq("id", data.id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    await logAudit(context.supabase, context.userId, "delivery_settings.update", "delivery_settings", data.id, null);
    return toSettings(saved as Row);
  });
