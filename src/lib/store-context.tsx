import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Context } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addCartItem,
  getCart,
  mergeGuestCart,
  removeCartItem,
  setCartQuantity,
  type CartItem,
  type CartResult,
} from "@/lib/cart.functions";

export type Language = "hi" | "en";
type StoreContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  cart: CartItem[];
  addToCart: (productId: string, quantity?: number, productName?: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  cartCount: number;
  isSignedIn: boolean;
  cartLoading: boolean;
  cartError: boolean;
};

// Keep one context identity across dev hot reloads so providers and consumers never mismatch.
const contextHolder = globalThis as typeof globalThis & {
  __shreekantStoreContext?: Context<StoreContextValue | undefined>;
};
const StoreContext =
  contextHolder.__shreekantStoreContext ??
  (contextHolder.__shreekantStoreContext = createContext<StoreContextValue | undefined>(undefined));
const GUEST_KEY = "shreekant-cart";
const cartKey = ["customer-cart"] as const;

function readGuestCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === "object" && item !== null && typeof (item as CartItem).productId === "string",
    );
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("hi");
  const [guestCart, setGuestCart] = useState<CartItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const merging = useRef(false);

  const say = useCallback((copy: { hi: string; en: string }) => copy[language], [language]);
  const viewCartAction = useCallback(
    () => ({ label: say({ hi: "कार्ट देखें", en: "View cart" }), onClick: () => navigate({ to: "/cart" }) }),
    [say, navigate],
  );

  useEffect(() => {
    const saved = window.sessionStorage.getItem("shreekant-language");
    if (saved === "hi" || saved === "en") setLanguageState(saved);
    setGuestCart(readGuestCart());
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  // Keyed by customer so one account's cart can never be shown for another.
  const userCartKey = useMemo(() => [...cartKey, userId] as const, [userId]);
  const cartQuery = useQuery<CartResult>({
    queryKey: userCartKey,
    queryFn: () => getCart(),
    enabled: Boolean(userId),
    retry: false,
  });

  const serverCart = cartQuery.data?.items ?? [];

  const notifyAdjusted = useCallback(
    (result: CartResult) => {
      queryClient.setQueryData(userCartKey, result);
      if (result.adjusted)
        toast.warning(
          say({
            hi: "स्टॉक बदल गया है, इसलिए मात्रा उपलब्ध स्टॉक के अनुसार कर दी गई है।",
            en: "Stock has changed, so the quantity was adjusted to what is available.",
          }),
        );
    },
    [queryClient, say, userCartKey],
  );

  const onError = useCallback(
    (error: Error) => {
      const outOfStock = error.message.includes("OUT_OF_STOCK");
      toast.error(
        outOfStock
          ? say({ hi: "यह उत्पाद अभी उपलब्ध नहीं है।", en: "This product is not available right now." })
          : say({ hi: "कार्ट अपडेट नहीं हो सकी। दोबारा कोशिश करें।", en: "Could not update the cart. Please try again." }),
      );
    },
    [say],
  );

  type AddInput = { productId: string; quantity: number; productName: string | undefined; wasInCart: boolean };
  const addMutation = useMutation({
    mutationFn: (input: AddInput) => addCartItem({ data: { productId: input.productId, quantity: input.quantity } }),
    onSuccess: (result: CartResult, input: AddInput) => {
      queryClient.setQueryData(userCartKey, result);
      if (result.adjusted) {
        toast.warning(
          say({
            hi: "स्टॉक बदल गया है, इसलिए मात्रा उपलब्ध स्टॉक के अनुसार कर दी गई है।",
            en: "Stock has changed, so the quantity was adjusted to what is available.",
          }),
        );
        return;
      }
      const item = result.items.find((entry) => entry.productId === input.productId);
      const name = input.productName ? ` — ${input.productName}` : "";
      const quantityNote = item ? ` (${say({ hi: "मात्रा", en: "quantity" })} ${item.quantity})` : "";
      toast.success(
        input.wasInCart
          ? say({ hi: `कार्ट अपडेट हुआ${name}${quantityNote}`, en: `Cart updated${name}${quantityNote}` })
          : say({ hi: `कार्ट में जोड़ा गया${name}`, en: `Added to cart${name}` }),
        { duration: 3000, action: viewCartAction() },
      );
    },
    onError,
  });
  const quantityMutation = useMutation({
    mutationFn: (input: { productId: string; quantity: number }) => setCartQuantity({ data: input }),
    onSuccess: notifyAdjusted,
    onError,
  });
  const removeMutation = useMutation({
    mutationFn: (input: { productId: string }) => removeCartItem({ data: input }),
    onSuccess: notifyAdjusted,
    onError,
  });

  const writeGuest = (items: CartItem[]) => {
    setGuestCart(items);
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(items));
  };

  // Sign-in keeps whatever the visitor put in the cart before logging in.
  useEffect(() => {
    if (!userId || merging.current) return;
    const pending = readGuestCart();
    if (!pending.length) return;
    merging.current = true;
    mergeGuestCart({ data: { items: pending } })
      .then((result) => {
        window.localStorage.removeItem(GUEST_KEY);
        setGuestCart([]);
        notifyAdjusted(result);
      })
      .catch(() =>
        toast.error(
          say({
            hi: "लॉगिन से पहले जोड़े गए सामान कार्ट में नहीं जुड़ सके। कृपया दोबारा जोड़ें।",
            en: "Items added before login could not be moved to your cart. Please add them again.",
          }),
        ),
      )
      .finally(() => {
        merging.current = false;
      });
  }, [userId, notifyAdjusted, say]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    window.sessionStorage.setItem("shreekant-language", next);
  };

  const cart = userId ? serverCart : guestCart;

  const addToCart = (productId: string, quantity = 1, productName?: string) => {
    if (userId) {
      // Ignore a second tap while the same product is still being added.
      if (addMutation.isPending && addMutation.variables?.productId === productId) return;
      addMutation.mutate({ productId, quantity, productName, wasInCart: serverCart.some((item) => item.productId === productId) });
      return;
    }
    const found = guestCart.find((item) => item.productId === productId);
    writeGuest(
      found
        ? guestCart.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item))
        : [...guestCart, { productId, quantity }],
    );
    const name = productName ? ` — ${productName}` : "";
    toast.success(
      found
        ? say({ hi: `कार्ट अपडेट हुआ${name} (${say({ hi: "मात्रा", en: "quantity" })} ${found.quantity + quantity})`, en: `Cart updated${name} (quantity ${found.quantity + quantity})` })
        : say({ hi: `कार्ट में जोड़ा गया${name}`, en: `Added to cart${name}` }),
      { duration: 3000, action: viewCartAction() },
    );
  };

  const setQuantity = (productId: string, quantity: number) => {
    if (userId) {
      quantityMutation.mutate({ productId, quantity: Math.max(0, Math.min(99, quantity)) });
      return;
    }
    writeGuest(
      quantity < 1
        ? guestCart.filter((item) => item.productId !== productId)
        : guestCart.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
    );
  };

  const removeFromCart = (productId: string) => {
    if (userId) {
      removeMutation.mutate({ productId });
      return;
    }
    writeGuest(guestCart.filter((item) => item.productId !== productId));
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      cart,
      addToCart,
      setQuantity,
      removeFromCart,
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      isSignedIn: Boolean(userId),
      cartLoading: Boolean(userId) && cartQuery.isLoading,
      cartError: Boolean(userId) && cartQuery.isError,
    }),
    [language, cart, userId, cartQuery.isLoading, cartQuery.isError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}

export function useCopy() {
  const { language } = useStore();
  return <T,>(copy: { hi: T; en: T }): T => copy[language];
}
