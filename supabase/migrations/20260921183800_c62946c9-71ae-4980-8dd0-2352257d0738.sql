ALTER TABLE public.push_registrations
  DROP CONSTRAINT push_registrations_fcm_token_key;

ALTER TABLE public.push_registrations
  ADD CONSTRAINT push_registrations_user_fcm_token_key UNIQUE (user_id, fcm_token);