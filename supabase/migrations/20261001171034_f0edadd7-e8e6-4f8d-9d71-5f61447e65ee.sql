CREATE OR REPLACE FUNCTION public.create_pending_order(p_address_id uuid, p_idempotency_key text)
 RETURNS TABLE(order_id uuid, order_number text, total_amount numeric, delivery_approval_required boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  v_unit numeric;
  v_delivery numeric := 0;
  v_distance numeric;
  v_needs_approval boolean := false;
  v_order_id uuid;
  v_number text;
  v_total numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;

  SELECT * INTO v_existing FROM public.orders o
    WHERE o.user_id = v_uid AND o.idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.order_number, v_existing.total_amount, v_existing.delivery_approval_required;
    RETURN;
  END IF;

  SELECT * INTO v_addr FROM public.addresses a WHERE a.id = p_address_id AND a.user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADDRESS_NOT_FOUND'; END IF;
  v_distance := v_addr.distance_km;

  SELECT * INTO v_settings FROM public.delivery_settings s WHERE s.is_active = true ORDER BY s.created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_CONFIRMED'; END IF;

  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = v_uid;

  FOR v_item IN
    SELECT c.product_id, c.quantity,
           round(p.price * (1 - public.product_discount_percent(p.id) / 100), 2) AS price,
           COALESCE(GREATEST(0, i.quantity - i.reserved_quantity), 0) AS available
    FROM public.cart_items c
    JOIN public.products p ON p.id = c.product_id AND p.is_active = true
    LEFT JOIN public.inventory i ON i.product_id = c.product_id
    WHERE c.user_id = v_uid ORDER BY c.created_at
  LOOP
    IF v_item.quantity < 1 OR v_item.quantity > v_item.available THEN RAISE EXCEPTION 'STOCK_CHANGED'; END IF;
    v_count := v_count + 1;
    v_pieces := v_pieces + v_item.quantity;
    v_subtotal := v_subtotal + round(v_item.price * v_item.quantity, 2);
  END LOOP;

  IF v_count = 0 THEN RAISE EXCEPTION 'CART_EMPTY'; END IF;
  IF v_count <> (SELECT count(*) FROM public.cart_items c WHERE c.user_id = v_uid) THEN RAISE EXCEPTION 'STOCK_CHANGED'; END IF;
  IF v_subtotal < COALESCE(v_settings.minimum_order_amount, 0) THEN RAISE EXCEPTION 'MINIMUM_ORDER_NOT_MET'; END IF;

  IF v_addr.delivery_approved AND v_addr.approved_delivery_charge IS NOT NULL THEN
    v_delivery := v_addr.approved_delivery_charge; v_needs_approval := false;
  ELSIF v_distance IS NOT NULL
        AND NOT (v_distance > v_settings.free_delivery_max_km AND v_distance > v_settings.tier2_max_km) THEN
    IF v_pieces >= v_settings.free_delivery_min_pieces AND v_distance <= v_settings.free_delivery_max_km THEN
      v_delivery := 0;
    ELSE
      v_delivery := CASE WHEN v_distance <= v_settings.tier1_max_km THEN v_settings.tier1_charge ELSE v_settings.tier2_charge END;
    END IF;
    v_needs_approval := false;
  ELSE
    v_delivery := 0; v_needs_approval := true;
  END IF;

  v_number := 'SKS-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    order_number, user_id, address_id, status, payment_status,
    subtotal, discount_amount, delivery_charge, tax_amount, total_amount,
    customer_name, customer_phone, delivery_address, delivery_distance_km,
    taxable_value, cgst_amount, sgst_amount, igst_amount, idempotency_key, delivery_approval_required
  ) VALUES (
    v_number, v_uid, v_addr.id, 'pending', 'created',
    v_subtotal, 0, v_delivery, 0, round(v_subtotal + v_delivery, 2),
    COALESCE(v_addr.full_name, v_profile.full_name), COALESCE(v_addr.phone, v_profile.phone),
    jsonb_build_object(
      'full_name', v_addr.full_name, 'phone', v_addr.phone,
      'address_line1', v_addr.address_line1, 'address_line2', v_addr.address_line2,
      'landmark', v_addr.landmark, 'village_town', v_addr.village_town,
      'district', v_addr.district, 'state', v_addr.state, 'pincode', v_addr.pincode),
    v_distance, 0, 0, 0, 0, p_idempotency_key, v_needs_approval
  ) RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT c.product_id, c.quantity, p.name, p.name_hi, p.sku,
           round(p.price * (1 - public.product_discount_percent(p.id) / 100), 2) AS price,
           p.tax_rate, p.product_type, p.pack_size, p.unit, p.hsn_code
    FROM public.cart_items c
    JOIN public.products p ON p.id = c.product_id AND p.is_active = true
    WHERE c.user_id = v_uid ORDER BY c.created_at
  LOOP
    v_unit := v_item.price;
    IF v_item.tax_rate IS NULL THEN
      v_line_base := round(v_unit * v_item.quantity, 2);
      v_taxable := v_taxable + v_line_base;
      INSERT INTO public.order_items (order_id, product_id, product_name, product_name_hi, sku,
        quantity, unit_price, total_price, product_type, pack_size, unit, hsn_code, tax_rate, tax_amount)
      VALUES (v_order_id, v_item.product_id, v_item.name, v_item.name_hi, v_item.sku,
        v_item.quantity, v_unit, round(v_unit * v_item.quantity, 2),
        v_item.product_type, v_item.pack_size, v_item.unit, v_item.hsn_code, NULL, 0);
    ELSE
      v_line_base := round((v_unit * v_item.quantity) / (1 + v_item.tax_rate / 100), 2);
      v_taxable := v_taxable + v_line_base;
      v_tax := v_tax + round(v_unit * v_item.quantity, 2) - v_line_base;
      INSERT INTO public.order_items (order_id, product_id, product_name, product_name_hi, sku,
        quantity, unit_price, total_price, product_type, pack_size, unit, hsn_code, tax_rate, tax_amount)
      VALUES (v_order_id, v_item.product_id, v_item.name, v_item.name_hi, v_item.sku,
        v_item.quantity, v_unit, round(v_unit * v_item.quantity, 2),
        v_item.product_type, v_item.pack_size, v_item.unit, v_item.hsn_code, v_item.tax_rate,
        round(v_unit * v_item.quantity, 2) - v_line_base);
    END IF;
  END LOOP;

  UPDATE public.orders SET
    taxable_value = round(v_taxable, 2), tax_amount = round(v_tax, 2),
    cgst_amount = round(v_tax / 2, 2), sgst_amount = round(v_tax - round(v_tax / 2, 2), 2), igst_amount = 0
  WHERE id = v_order_id;

  SELECT o.total_amount INTO v_total FROM public.orders o WHERE o.id = v_order_id;

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'order_created', 'order', v_order_id,
          jsonb_build_object('order_number', v_number, 'total_amount', round(v_subtotal + v_delivery, 2),
                             'delivery_approval_required', v_needs_approval));

  IF v_needs_approval THEN
    PERFORM public.notify_user(v_uid, 'customer', 'delivery_approval_pending', 'delivery', 'important',
      'Delivery confirmation pending',
      'The shop is confirming the delivery charge for your address. We''ll notify you when payment is ready.',
      v_order_id, v_addr.id, NULL, '/orders/' || v_order_id::text, 'View Order', false,
      'delivery_pending:' || v_order_id::text);
    PERFORM public.notify_admins('delivery_approval_required', 'delivery', 'action_required',
      'Delivery approval required',
      'Order ' || v_number || ' is waiting for delivery-charge approval for the customer''s saved address.',
      v_order_id, NULL, '/admin/orders/' || v_order_id::text, 'Review & Approve', true,
      'delivery_approval:' || v_order_id::text);
    PERFORM public.queue_email_admins('delivery_approval_required',
      'delivery_approval:' || v_order_id::text,
      jsonb_build_object('order_number', v_number, 'amount', v_total,
                         'customer_name', COALESCE(v_addr.full_name, v_profile.full_name)),
      v_order_id, NULL);
  ELSE
    PERFORM public.notify_user(v_uid, 'customer', 'order_created', 'order', 'normal',
      'Order placed', 'Your order ' || v_number || ' has been created.',
      v_order_id, v_addr.id, NULL, '/orders/' || v_order_id::text, 'View Order', false,
      'order_created:' || v_order_id::text);
    PERFORM public.notify_admins('new_order', 'order', 'important',
      'New order received', 'Order ' || v_number || ' has been placed.',
      v_order_id, NULL, '/admin/orders/' || v_order_id::text, 'View Order', false,
      'new_order:' || v_order_id::text);
  END IF;

  RETURN QUERY SELECT v_order_id, v_number, v_total, v_needs_approval;
END;
$function$;