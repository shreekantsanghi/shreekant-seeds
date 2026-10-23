import { useCopy } from "@/lib/store-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { adminSupabase as supabase } from "@/integrations/supabase/admin-client";
import { getAdminSession, type AdminSession } from "@/lib/admin-auth.functions";

export const adminSessionKey = ["admin-session"] as const;

export function useAdminSession() {
  const fetchSession = useServerFn(getAdminSession);
  return useQuery<AdminSession>({
    queryKey: adminSessionKey,
    queryFn: () => fetchSession(),
    // Retry brief network drops on weak phone signal; never retry a real refusal.
    retry: (count, error) =>
      count < 2 && !/unauthori[sz]ed|forbidden|mfa/i.test(error instanceof Error ? error.message : String(error)),
    staleTime: 30_000,
  });
}

export function useAdminSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const copy = useCopy();
  return async () => {
    if (!window.confirm(copy({ hi: "क्या आप सच में लॉगआउट करना चाहते हैं?", en: "Are you sure you want to sign out?" }))) return;
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/sks-4827", search: { redirect: "/admin" }, replace: true });
  };
}
