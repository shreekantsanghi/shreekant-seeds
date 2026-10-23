import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStore } from "@/lib/store-context";
import { addWishlistItem, listWishlist, removeWishlistItem } from "@/lib/wishlist.functions";

export const wishlistKey = ["customer-wishlist"] as const;

/**
 * Single shared wishlist source. Every heart across the storefront reads the
 * same query, so the filled/empty state stays consistent everywhere.
 */
export function useWishlist() {
  const { isSignedIn, language } = useStore();
  const say = (copy: { hi: string; en: string }) => copy[language];
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const list = useServerFn(listWishlist);
  const add = useServerFn(addWishlistItem);
  const remove = useServerFn(removeWishlistItem);

  const query = useQuery<string[]>({
    queryKey: wishlistKey,
    queryFn: () => list(),
    enabled: isSignedIn,
    retry: false,
    staleTime: 30_000,
  });

  const ids = useMemo(() => new Set(query.data ?? []), [query.data]);

  const onError = useCallback(() => {
    toast.error(say({ hi: "विशलिस्ट अपडेट नहीं हो सकी। दोबारा कोशिश करें।", en: "Could not update the wishlist. Please try again." }));
    void queryClient.invalidateQueries({ queryKey: wishlistKey });
  }, [queryClient, language]);

  const setLocal = (productId: string, saved: boolean) =>
    queryClient.setQueryData<string[]>(wishlistKey, (current) => {
      const base = current ?? [];
      return saved ? (base.includes(productId) ? base : [productId, ...base]) : base.filter((id) => id !== productId);
    });

  const addMutation = useMutation({
    mutationFn: (productId: string) => add({ data: { productId } }),
    onError,
  });
  const removeMutation = useMutation({
    mutationFn: (productId: string) => remove({ data: { productId } }),
    onError,
  });

  const requireAccount = useCallback(() => {
    const safe = pathname.startsWith("/admin") ? "/wishlist" : pathname;
    toast.info(say({ hi: "विशलिस्ट के लिए साइन इन करें।", en: "Sign in to use your wishlist." }));
    void navigate({ to: "/customer-login", search: { redirect: safe } });
  }, [navigate, pathname, language]);

  const toggle = useCallback(
    (productId: string, productName?: string) => {
      if (!isSignedIn) {
        requireAccount();
        return;
      }
      const saved = ids.has(productId);
      setLocal(productId, !saved);
      const name = productName ? ` — ${productName}` : "";
      if (saved) {
        removeMutation.mutate(productId);
        toast.success(say({ hi: `विशलिस्ट से हटाया गया${name}`, en: `Removed from wishlist${name}` }), { duration: 2500 });
      } else {
        addMutation.mutate(productId);
        toast.success(say({ hi: `विशलिस्ट में जोड़ा गया${name}`, en: `Saved to wishlist${name}` }), { duration: 2500 });
      }
    },
    [isSignedIn, ids, requireAccount, addMutation, removeMutation, language],
  );

  return {
    productIds: query.data ?? [],
    ids,
    count: ids.size,
    isSaved: (productId: string) => ids.has(productId),
    toggle,
    isSignedIn,
    isLoading: isSignedIn && query.isLoading,
    isError: isSignedIn && query.isError,
    refetch: () => query.refetch(),
  };
}
