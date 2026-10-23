import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { StoreProvider } from "@/lib/store-context";
import { StoreFooter, StoreHeader } from "@/components/store/core";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminSupabase } from "@/integrations/supabase/admin-client";
import { ForegroundPushListener } from "@/components/push-foreground-listener";

function NotFoundComponent() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="text-center">
        <p className="font-display text-7xl font-semibold text-accent">404</p>
        <h1 className="mt-3 font-display text-3xl font-semibold">
          Page not found
        </h1>
        <Button asChild className="mt-6 rounded-full">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-semibold">
          This page didn’t load
        </h1>
        <p className="mt-2 text-muted-foreground">
          Please try again or return to the store.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { name: "author", content: "Shreekant Seeds" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Gupter:wght@400;500;600;700&family=Hind:wght@300;400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="hi">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function useSupabaseAuthSync(queryClient: QueryClient) {
  const router = useRouter();

  useEffect(() => {
    // Customer and merchant sessions are separate clients with separate storage
    // slots; each listener only reacts to its own identity transitions.
    const onChange = (event: string) => {
      if (event === "PASSWORD_RECOVERY") {
        router.navigate({
          to: "/reset-password",
          replace: true,
        });
        return;
      }

      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      )
        return;

      // Drop cached account data on sign-out so the next person on this device
      // never sees the previous customer's orders, addresses or notifications.
      if (event === "SIGNED_OUT") queryClient.removeQueries();

      router.invalidate();

      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    };

    const customer = supabase.auth.onAuthStateChange((event) =>
      onChange(event),
    );

    const merchant = adminSupabase.auth.onAuthStateChange((event) =>
      onChange(event),
    );

    return () => {
      customer.data.subscription.unsubscribe();
      merchant.data.subscription.unsubscribe();
    };
  }, [router, queryClient]);
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useSupabaseAuthSync(queryClient);

  const isBare = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith("/admin") ||
      state.location.pathname.startsWith("/d/"),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        {isBare ? (
          <Outlet />
        ) : (
          <>
            <StoreHeader />
            <Outlet />
            <StoreFooter />
          </>
        )}
        <ForegroundPushListener />
        <Toaster />
      </StoreProvider>
    </QueryClientProvider>
  );
}