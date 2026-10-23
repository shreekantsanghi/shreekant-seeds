DO $mig$
DECLARE r record; d text; n text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname IN ('set_order_status','issue_delivery_credentials','get_my_delivery_credentials') LOOP
    d := pg_get_functiondef(r.oid);
    n := replace(d, 'v_order.payment_status <> ''paid''', 'v_order.payment_status::text NOT IN (''paid'', ''partially_refunded'')');
    IF n = d THEN RAISE EXCEPTION 'payment check not found in %', r.oid::regprocedure; END IF;
    EXECUTE n;
  END LOOP;
END $mig$;