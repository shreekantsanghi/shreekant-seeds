ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS delivery_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_delivery_charge numeric,
  ADD COLUMN IF NOT EXISTS delivery_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_approved_by uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_approval_required boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.addresses_block_insert_distance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.distance_km IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can set a confirmed delivery distance';
  END IF;
  IF NEW.distance_km IS NULL THEN
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;
  IF (NEW.delivery_approved OR NEW.approved_delivery_charge IS NOT NULL) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can approve a delivery charge';
  END IF;
  IF NOT NEW.delivery_approved THEN
    NEW.approved_delivery_charge := NULL;
    NEW.delivery_approved_at := NULL;
    NEW.delivery_approved_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.addresses_guard_distance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_location_changed boolean;
  v_distance_changed boolean;
  v_approval_changed boolean;
BEGIN
  v_location_changed := (
    NEW.address_line1 IS DISTINCT FROM OLD.address_line1 OR
    NEW.address_line2 IS DISTINCT FROM OLD.address_line2 OR
    NEW.landmark IS DISTINCT FROM OLD.landmark OR
    NEW.village_town IS DISTINCT FROM OLD.village_town OR
    NEW.district IS DISTINCT FROM OLD.district OR
    NEW.state IS DISTINCT FROM OLD.state OR
    NEW.pincode IS DISTINCT FROM OLD.pincode
  );
  v_distance_changed := NEW.distance_km IS DISTINCT FROM OLD.distance_km;
  v_approval_changed := (
    NEW.delivery_approved IS DISTINCT FROM OLD.delivery_approved OR
    NEW.approved_delivery_charge IS DISTINCT FROM OLD.approved_delivery_charge
  );

  IF v_distance_changed AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can set a confirmed delivery distance';
  END IF;
  IF v_approval_changed AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only the shop can approve a delivery charge';
  END IF;

  IF v_location_changed AND NOT v_distance_changed THEN
    NEW.distance_km := NULL;
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;

  IF v_distance_changed AND NEW.distance_km IS NOT NULL THEN
    NEW.distance_confirmed_at := now();
    NEW.distance_confirmed_by := auth.uid();
  END IF;

  IF v_distance_changed AND NEW.distance_km IS NULL THEN
    NEW.distance_confirmed_at := NULL;
    NEW.distance_confirmed_by := NULL;
  END IF;

  -- Any change to the delivery location cancels a previous approval.
  IF v_location_changed AND NOT v_approval_changed THEN
    NEW.delivery_approved := false;
    NEW.approved_delivery_charge := NULL;
    NEW.delivery_approved_at := NULL;
    NEW.delivery_approved_by := NULL;
  END IF;

  IF v_approval_changed AND NEW.delivery_approved THEN
    NEW.delivery_approved_at := now();
    NEW.delivery_approved_by := auth.uid();
  END IF;
  IF v_approval_changed AND NOT NEW.delivery_approved THEN
    NEW.approved_delivery_charge := NULL;
    NEW.delivery_approved_at := NULL;
    NEW.delivery_approved_by := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_pending_order(uuid, text);

CREATE FUNCTION public.create_pending_order(p_address_id uuid, p_idempotency_key text)
 RETURNS TABLE(order_id uuid, order_number text, total_amount numeric, delivery_approval_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_addr public.addresses%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_settings public.delivery_settings%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_item record;
  v_count integer := 0;
  v_pieces integer := 0;
  v_subtotal numeric := 0;
  v_taxable numeric := 0;
  v_tax numeric := 0;
  v_line_base numeric;
  v_delivery numeric := 0;
  v_distance numeric;
  v_needs_approval boolean := false;
  v_order_id uuid;
  v_number text;
  v_total numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;

  SELECT * INTO v_existing FROM public.orders o
    WHERE o.user_id = v_uid AND o.idempotency_key = p_idempotency_key
    LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_amount,
                        v_existing.delivery_approval_required;
    RETURN;
  END IF;

  SELECT * INTO v_addr FROM public.addresses a WHERE a.id = p_address_id AND a.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
  END IF;

  v_distance := v_addr.distance_km;

  SELECT * INTO v_settings FROM public.delivery_settings s WHERE s.is_active = true
    ORDER BY s.created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_CONFIRMED';
  END IF;

  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = v_uid;

  FOR v_item IN
    SELECT c.product_id, c.quantity, p.price,
           COALESCE(GREATEST(0, i.quantity - i.reserved_quantity), 0) AS available
    FROM public.cart_items c
    JOIN public.products p ON p.id = c.product_id AND p.is_active = true
    LEFT JOIN public.inventory i ON i.product_id = c.product_id
    WHERE c.user_id = v_uid
    ORDER BY c.created_at
  LOOP
    IF v_item.quantity < 1 OR v_item.quantity > v_item.available THEN
      RAISE EXCEPTION 'STOCK_CHANGED';
    END IF;
    v_count := v_count + 1;
    v_pieces := v_pieces + v_item.quantity;
    v_subtotal := v_subtotal + round(v_item.price * v_item.quantity, 2);
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CART_EMPTY';
  END IF;
  IF v_count <> (SELECT count(*) FROM public.cart_items c WHERE c.user_id = v_uid) THEN
    RAISE EXCEPTION 'STOCK_CHANGED';
  END IF;
  IF v_subtotal < COALESCE(v_settings.minimum_order_amount, 0) THEN
    RAISE EXCEPTION 'MINIMUM_ORDER_NOT_MET';
  END IF;

  -- 1. A merchant-approved saved address always wins.
  IF v_addr.delivery_approved AND v_addr.approved_delivery_charge IS NOT NULL THEN
    v_delivery := v_addr.approved_delivery_charge;
    v_needs_approval := false;

  -- 2. Otherwise the existing automatic rules, unchanged.
  ELSIF v_distance IS NOT NULL
        AND NOT (v_distance > v_settings.free_delivery_max_km AND v_distance > v_settings.tier2_max_km) THEN
    IF v_pieces >= v_settings.free_delivery_min_pieces AND v_distance <= v_settings.free_delivery_max_km THEN
      v_delivery := 0;
    ELSE
      v_delivery := CASE WHEN v_distance <= v_settings.tier1_max_km THEN v_settings.tier1_charge ELSE v_settings.tier2_charge END;
    END IF;
    v_needs_approval := false;

  -- 3. Otherwise the shop must confirm before payment.
  ELSE
    v_delivery := 0;
    v_needs_approval := true;
  END IF;

  v_number := 'SKS-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    order_number, user_id, address_id, status, payment_status,
    subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
    customer_name, customer_phone, delivery_address, delivery_distance_km,
    taxable_value, cgst_amount, sgst_amount, igst_amount, idempotency_key,
    delivery_approval_required
  ) VALUES (
    v_number, v_uid, v_addr.id, 'pending', 'created',
    v_subtotal, 0, v_delivery, 0, round(v_subtotal + v_delivery, 2),
    COALESCE(v_addr.full_name, v_profile.full_name), COALESCE(v_addr.phone, v_profile.phone),
    jsonb_build_object(
      'full_name', v_addr.full_name, 'phone', v_addr.phone,
      'address_line1', v_addr.address_line1, 'address_line2', v_addr.address_line2,
      'landmark', v_addr.landmark, 'village_town', v_addr.village_town,
      'district', v_addr.district, 'state', v_addr.state, 'pincode', v_addr.pincode
    ),
    v_distance, 0, 0, 0, 0, p_idempotency_key,
    v_needs_approval
  ) RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT c.product_id, c.quantity, p.name, p.name_hi, p.sku, p.price, p.tax_rate,
           p.product_type, p.pack_size, p.unit, p.hsn_code
    FROM public.cart_items c
    JOIN public.products p ON p.id = c.product_id AND p.is_active = true
    WHERE c.user_id = v_uid
    ORDER BY c.created_at
  LOOP
    IF v_item.tax_rate IS NULL THEN
      v_line_base := round(v_item.price * v_item.quantity, 2);
      v_taxable := v_taxable + v_line_base;
      INSERT INTO public.order_items (order_id, product_id, product_name, product_name_hi, sku,
        quantity, unit_price, total_price, product_type, pack_size, unit, hsn_code, tax_rate, tax_amount)
      VALUES (v_order_id, v_item.product_id, v_item.name, v_item.name_hi, v_item.sku,
        v_item.quantity, v_item.price, round(v_item.price * v_item.quantity, 2),
        v_item.product_type, v_item.pack_size, v_item.unit, v_item.hsn_code, NULL, 0);
    ELSE
      v_line_base := round((v_item.price * v_item.quantity) / (1 + v_item.tax_rate / 100), 2);
      v_taxable := v_taxable + v_line_base;
      v_tax := v_tax + round(v_item.price * v_item.quantity, 2) - v_line_base;
      INSERT INTO public.order_items (order_id, product_id, product_name, product_name_hi, sku,
        quantity, unit_price, total_price, product_type, pack_size, unit, hsn_code, tax_rate, tax_amount)
      VALUES (v_order_id, v_item.product_id, v_item.name, v_item.name_hi, v_item.sku,
        v_item.quantity, v_item.price, round(v_item.price * v_item.quantity, 2),
        v_item.product_type, v_item.pack_size, v_item.unit, v_item.hsn_code, v_item.tax_rate,
        round(v_item.price * v_item.quantity, 2) - v_line_base);
    END IF;
  END LOOP;

  UPDATE public.orders SET
    taxable_value = round(v_taxable, 2),
    tax_amount = round(v_tax, 2),
    cgst_amount = round(v_tax / 2, 2),
    sgst_amount = round(v_tax - round(v_tax / 2, 2), 2),
    igst_amount = 0
  WHERE id = v_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'order_created', 'order', v_order_id,
          jsonb_build_object('order_number', v_number, 'total_amount', round(v_subtotal + v_delivery, 2),
                             'delivery_approval_required', v_needs_approval));

  SELECT o.total_amount INTO v_total FROM public.orders o WHERE o.id = v_order_id;
  RETURN QUERY SELECT v_order_id, v_number, v_total, v_needs_approval;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_pending_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pending_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_pending_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_address_delivery_approval(
  p_address_id uuid,
  p_approved boolean,
  p_charge numeric DEFAULT NULL
)
 RETURNS TABLE(approved boolean, charge numeric, orders_updated integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_settings public.delivery_settings%ROWTYPE;
  v_addr public.addresses%ROWTYPE;
  v_charge numeric;
  v_updated integer := 0;
  v_order record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_addr FROM public.addresses a WHERE a.id = p_address_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
  END IF;

  SELECT * INTO v_settings FROM public.delivery_settings s WHERE s.is_active = true
    ORDER BY s.created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_SETTINGS_MISSING';
  END IF;

  IF p_approved THEN
    v_charge := COALESCE(p_charge, -1);
    IF v_charge NOT IN (0, v_settings.tier1_charge, v_settings.tier2_charge) THEN
      RAISE EXCEPTION 'INVALID_CHARGE';
    END IF;
  ELSE
    v_charge := NULL;
  END IF;

  UPDATE public.addresses a SET
    delivery_approved = p_approved,
    approved_delivery_charge = v_charge,
    updated_at = now()
  WHERE a.id = p_address_id;

  -- Approving fills in the charge ONLY for orders still waiting for it, and only
  -- while they are unpaid, not cancelled and have no live payment attempt.
  -- Withdrawing an approval never touches an existing order.
  IF p_approved THEN
    FOR v_order IN
      SELECT o.id, o.subtotal, o.discount_amount, o.delivery_override_free, o.delivery_charge_base
      FROM public.orders o
      WHERE o.address_id = p_address_id
        AND o.delivery_approval_required = true
        AND o.payment_status = 'created'
        AND o.status <> 'cancelled'
        AND NOT EXISTS (
          SELECT 1 FROM public.payments pay
          WHERE pay.order_id = o.id AND pay.status <> 'failed'
        )
      FOR UPDATE
    LOOP
      UPDATE public.orders o SET
        delivery_approval_required = false,
        delivery_charge = CASE WHEN v_order.delivery_override_free THEN 0 ELSE v_charge END,
        delivery_charge_base = CASE WHEN v_order.delivery_override_free THEN v_charge ELSE v_order.delivery_charge_base END,
        total_amount = round(v_order.subtotal - v_order.discount_amount
                             + CASE WHEN v_order.delivery_override_free THEN 0 ELSE v_charge END, 2),
        updated_at = now()
      WHERE o.id = v_order.id;
      v_updated := v_updated + 1;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'address_delivery_approval', 'address', p_address_id,
          jsonb_build_object('approved', p_approved, 'charge', v_charge, 'orders_updated', v_updated));

  RETURN QUERY SELECT p_approved, v_charge, v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_address_delivery_approval(uuid, boolean, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_address_delivery_approval(uuid, boolean, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_address_delivery_approval(uuid, boolean, numeric) TO authenticated;