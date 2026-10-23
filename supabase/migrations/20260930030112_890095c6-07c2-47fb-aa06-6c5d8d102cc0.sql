CREATE OR REPLACE FUNCTION public.recover_stuck_emails(p_stale_minutes integer DEFAULT 10)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(mins => GREATEST(COALESCE(p_stale_minutes, 10), 10));
  v_count integer := 0;
  v_n integer;
BEGIN
  -- Stuck rows with attempts left go back to the queue.
  UPDATE public.email_outbox
     SET status = 'queued', last_error = 'recovered from stale sending', updated_at = now()
   WHERE status = 'sending' AND updated_at < v_cutoff AND attempts < 5;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;
  -- Stuck rows that already used all 5 attempts are closed, never retried.
  UPDATE public.email_outbox
     SET status = 'failed', last_error = 'stale sending; attempt limit reached', updated_at = now()
   WHERE status = 'sending' AND updated_at < v_cutoff AND attempts >= 5;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.recover_stuck_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stuck_emails(integer) TO service_role;