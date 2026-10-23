
CREATE OR REPLACE FUNCTION public.enqueue_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.push_event_types%ROWTYPE;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_event FROM public.push_event_types
    WHERE notification_type = NEW.notification_type AND audience = NEW.audience;
  -- Only catalogued, enabled, transactional events are pushed. Promotional
  -- events are catalogued but never dispatched here.
  IF NOT FOUND OR NOT v_event.is_enabled OR v_event.kind <> 'transactional' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.push_outbox (notification_id, recipient_user_id, audience, notification_type, kind, urgent)
  VALUES (NEW.id, NEW.recipient_user_id, NEW.audience, NEW.notification_type, v_event.kind, v_event.urgent)
  ON CONFLICT (notification_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    PERFORM public.request_push_dispatch();
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the notification or the business operation behind it.
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notifications_enqueue_push ON public.notifications;
CREATE TRIGGER notifications_enqueue_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_for_notification();
