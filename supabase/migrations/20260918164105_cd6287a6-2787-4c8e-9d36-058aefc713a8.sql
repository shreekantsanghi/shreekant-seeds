ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_invoice_number_key ON public.orders (invoice_number) WHERE invoice_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.issue_order_invoice(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Only the owning customer or an active admin may cause an invoice to exist.
  IF v_order.user_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Never invent an invoice number for unpaid or failed orders.
  IF v_order.payment_status <> 'paid' THEN
    RETURN NULL;
  END IF;

  IF v_order.invoice_number IS NOT NULL THEN
    RETURN v_order.invoice_number;
  END IF;

  v_number := 'SS/' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '/' ||
              lpad(nextval('public.invoice_number_seq')::text, 5, '0');

  UPDATE public.orders
     SET invoice_number = v_number,
         invoice_issued_at = now()
   WHERE id = p_order_id;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_order_invoice(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.issue_order_invoice(uuid) TO authenticated;