# Roadmap

## Phase 2 — UI/UX refinement
- [x] Shared navigation, language, search, design system
- [x] Home, category, product, cart, checkout
- [x] Account, addresses, orders, contact, sharing
- [x] Admin consistency and mobile behaviour
- [x] Route metadata and bilingual copy

## Phase 3A — database reads
- [x] Products, categories, product images read from Supabase (active only)
- [x] Category pages, search, product detail on real data
- [x] Admin products and inventory on real data (inventory needs admin login)
- [x] Empty/loading/error states, no fake fallback data
- [x] Phase 3B — merchant login, admin authorization, MFA foundation

## Phase 3C — real catalogue management
- [x] Admin categories: list, create, edit, activate/deactivate, safe delete
- [x] Admin products: search/filter, create, edit, activate/deactivate, safe delete
- [x] Product photos: upload to the existing product-images bucket, cover photo, remove
- [x] Inventory editing with non-negative validation, per-product and list view
- [x] Storefront stock awareness (low stock / out of stock, add-to-cart blocked)
- [x] Audit logging of admin catalogue actions
- [ ] Later: orders, payments, delivery, reports

## Phase 4 — customer accounts
- [x] Customer signup/login/logout, forgot password + reset page
- [x] Protected /account and /addresses, public catalogue unchanged
- [x] Profile (name, phone) read/update via server functions, role forced to customer
- [x] Addresses: list, add, edit, delete, default
- [ ] Open risk: existing profiles UPDATE policy lets a signed-in user set their own
      role to admin. Reported to the owner; migration not applied.

## Phase 5A — persistent cart
- [x] cart_items table, RLS, cart_change routine, guest cart merge

## Phase 5B part 1 — checkout foundation
- [x] Server-side checkout review: cart re-read, stock re-validated via cart_change
- [x] Saved address selection (own addresses only)
- [x] Piece/distance delivery rules, merchant-editable in /admin/delivery
- [x] GST-inclusive tax extraction from products.tax_rate when present
- [ ] Blocker for part 2: no trusted distance source, so delivery charge always
      falls back to "shop will confirm"; products table has no HSN column
- [ ] Not implemented: Razorpay, order creation, discounts, stock reservation

## Known limitation
- Admin write flows could not be signed-in tested here: the Supabase project is
  external, so no test session can be minted in this environment.

## Done: profiles RLS role/is_active lockdown (applied and approved)
- Replace "Users can update their own profile" UPDATE policy with customer self-update policy (auth.uid()=id AND role='customer' AND is_active=true)
- Add "Admins can update any profile" UPDATE policy via is_admin()
- Add trigger blocking role/is_active changes for non-admins (defense in depth)
- Show exact SQL first; do NOT apply until user approves

## Phase 5B foundation — blockers
- [x] Merchant-confirmed delivery distance per saved address (admin-only writes)
- [x] Clear confirmed distance when the customer edits the address location
- [x] Optional products.hsn_code, merchant product editor only
- [x] CHECK constraint: distance_km cannot be negative
- [x] Merchant Customers page: real customers + addresses + set confirmed distance
- [x] Product editor: HSN code field
- [ ] Untested end to end: no merchant/customer session can be minted here

## Phase 5B Part 2D — inventory protection at payment (done)
- [x] `orders.inventory_fulfilled_at` marker + `inventory.quantity >= 0` check constraint
- [x] `fulfill_order_inventory(order_id)` — locked, atomic, idempotent deduction; shortfall audit
- [x] Called from `markOrderPaid`, shared by browser handler and webhook
- [x] Merchant Orders screen surfaces paid orders with no inventory deduction

## Phase 5B Part 2E — real customer + merchant orders (done)
- [x] Customer /orders list + /orders/$id detail on real data (RLS-scoped, sign-in required)
- [x] Merchant /admin/orders list + detail: customer, items, GST, payment IDs, stock state
- [x] Merchant-only flag for paid orders with `inventory_fulfilled_at` NULL (manual reconciliation)
- [x] demoOrders and DemoNotice removed from both Orders screens; mock-data.ts deleted
- [ ] Not in this phase: order status editing, delivery OTP, notifications, invoices
- [ ] Dashboard KPIs remain sample figures (deliberately untouched)

## Phase 6 — Invoice & GST foundation
- [x] Invoice number + issue date on orders (paid orders only, server-side)
- [x] Customer and merchant invoice views, print-friendly
- [x] issue_order_invoice: EXECUTE granted to authenticated only (not service_role)
- [ ] End-to-end invoice check needs a real signed-in session (customer + merchant)

## Phase 7 — customer phone OTP (cancelled)
- [x] Decision: no phone OTP. Customer auth stays email + password; merchant stays email + password + TOTP.
- [x] Step 1 database preparation was never applied (migration interrupted); nothing to remove.
- [x] No phone_e164 column, index, normalize_phone_e164 or claim_verified_phone exists.

## Phase 8 — order status workflow (done)
- [x] set_order_status(order_id, status): admin-only, locked, one-step forward, paid-only,
      out_for_delivery requires inventory_fulfilled_at, cancel only pre-fulfilment, audit entry
- [x] "delivered" cannot be set by the merchant — reserved for the QR + delivery-code flow
- [x] updateAdminOrderStatus server fn + merchant Advance/Cancel control with inline refusal reason
- [x] Customer order detail: step timeline, awaiting-payment message, no merchant-only info
- [x] No backfill; existing orders and inventory untouched

## Phase 9 — QR + delivery code confirmation
- [ ] order_deliveries table (hashes only, no direct grants)
- [ ] issue_delivery_credentials: explicit merchant action, never automatic on render
- [ ] confirm_delivery: public, atomic, 5-attempt lock, 24h expiry, one-time
- [ ] Customer QR + code while out_for_delivery; merchant QR/code + reissue
- [ ] Public /d/$token page: code entry only, no order data
- [ ] order_deliveries: no direct authenticated access, routines only

## Phase 9 — QR + delivery code confirmation (done)
- [x] order_deliveries table (hashes only, no anon/authenticated grants, RLS on)
- [x] issue_delivery_credentials(order_id, reissue): admin-only, out_for_delivery + paid + stock deducted,
      256-bit token + 6-digit code returned once, 24h expiry, reissue invalidates previous
- [x] confirm_delivery(token, code): anon-executable, locked + atomic, 5-attempt lock, expiry,
      one-time, sets delivered, generic result, audit delivery_code_verified / delivery_code_failed
- [x] Merchant: generate/reissue QR + code panel at out_for_delivery; still no Mark Delivered
- [x] Customer: delivery-code note while out_for_delivery only
- [x] Public /d/$token page: branding + code input only, no order data, no site chrome
- [ ] Merchant-signed-in end-to-end run (needs a real out_for_delivery order)

## Phase 9 fix — stable customer/merchant delivery credentials (done)
- [x] Derive token + 6-digit code from order id + credential nonce + server-only secret
- [x] Customer + merchant reads return the SAME active credential; only explicit merchant reissue rotates the nonce
- [x] No plaintext token/code stored; confirm_delivery behaviour unchanged

## Phase 9 security fix — delivery-person PIN (done)
- [x] Third per-credential secret (6-digit delivery-person PIN) derived from the same server secret + nonce, stored only as delivery_pin_hash
- [x] Merchant panel shows customer code and delivery-person PIN separately; customer page still shows only QR + own code
- [x] confirm_delivery(token, pin, code) requires all three; wrong PIN or wrong code is one generic failed attempt, 5 attempts lock
- [x] Reissue rotates token, code and PIN together; viewing pages never rotates or resets anything
- [ ] Merchant-signed-in end-to-end run of tests A–G (needs a real out_for_delivery order)

## Phase 10 — merchant free-delivery override (done)
- [x] orders: delivery_override_free + delivery_charge_base
- [x] set_order_delivery_override (admin-only; refuses cancelled, paid, or any non-failed payment attempt)
- [x] setAdminDeliveryOverride server fn + merchant Delivery section with confirmations
- [x] Customer + merchant order pages show "FREE" when delivery is 0
- [x] Verified: on/off restores exact original amounts; paid rejected; customer/anon rejected; audit written

## Phase 10A — address delivery approval (done)
- [x] addresses: delivery_approved, approved_delivery_charge, delivery_approved_at/by; orders.delivery_approval_required
- [x] Triggers: customers can never set approval; location edits invalidate it
- [x] create_pending_order: approved address wins, then automatic rules, else waiting-for-confirmation
- [x] set_address_delivery_approval (shop-only, FREE/tier1/tier2, only waiting unpaid orders with no payment attempt)
- [x] Checkout never opens payment while approval is pending; startRazorpayPayment refuses such orders
- [x] Customer order page: waiting notice, then Continue to Payment; merchant order page: approval panel

- Verification report on checkout/Razorpay integration requested before migration approval (done, reported in chat).
- Migration NOT applied yet; awaiting approval.

- Phase 10A — approved address must take precedence over automatic distance/quantity rules in create_pending_order (pending user approval of migration)
- Address approval change/revoke affects FUTURE orders only; an existing order's delivery charge is never altered by a later revoke.

## Phase 11 — Central in-app notifications (in progress)
- [ ] notifications table + RLS + backend-only writers (notify_user / notify_admins)
- [ ] Event hooks: order created, delivery approval required/approved, order status, delivery confirmed, payment paid/failed, low/out-of-stock, stock shortfall
- [ ] Approval-required orders: customer gets ONLY "Delivery confirmation pending" (no duplicate "Order placed")
- [ ] Bell + unread badge + dropdown in store header and shop workspace
- [ ] /notifications and /admin/notifications pages with filters, mark read / mark all read
- [ ] Supabase Realtime per signed-in user

- Phase 11 test audit row (action='phase11_test', id 38d03913-a379-4e2a-bb82-18edc3a132c0) kept on user request; delete only when they approve.

## Pending
- Apply Phase 13 cart cleanup migration (orders.cart_cleared_at + consume_order_cart) — awaiting user quiet window after "go".

## Web push transactional wiring (done)
- [x] Review-first: no hard-coded preview URL in DB; runtime-configured dispatch endpoint
- [x] Verify all 12 notification_type values against Phase 11/12 events
- [x] Ship dispatch endpoint before enabling the DB trigger
- [x] Prove Stage 2 end to end (queue claim, per-browser record, invalid-token pruning, real push) before Stage 3
- [ ] Shop must open Notifications once so the live sending address is recorded (preview + published)
- [ ] Customer browser: press Enable notifications again (old token was stale and removed)

## Phase 14 — automatic road distance (done)
- [x] Migration applied: addresses estimate columns + guards (server/shop-only writes, location edit clears estimate), delivery_settings origin (27.74032, 75.78250)
- [x] geoapify.server.ts + geo-distance.server.ts (cache + 10-min floor, out_of_range = > tier2_max_km)
- [x] geo-distance.functions.ts (merchant Recalculate + suggestion), best-effort estimate after address save
- [x] Admin UI: customer estimate line + Recalculate/Use this distance, order suggestion line, shop origin fields
- [x] Type check clean, production build OK
- [ ] Merchant end-to-end check (needs real merchant session): save origin, open a customer address, Recalculate

## Phase 14 extension — customer "Use my current location"
- [x] delivery_locations snapshot table (own-row read, admin read, server-only writes)
- [x] estimateGpsDelivery server function (validates coords/accuracy, routes from shop origin, returns snapshot id)
- [x] Checkout GPS button + status messages, snapshot id kept in checkout state
- [x] placePendingOrder attaches the exact snapshot id after verification (best effort)
- [x] Merchant order screen shows GPS distance/duration/accuracy/source

- [ ] Step 1: Product types — fertilizer + other (audit follow-up)
- [ ] Dashboard real KPIs (Step 2 — not started, per user)
- [x] Delivery-approval section on dashboard (Step 3 — done)
- [x] Reports (Step 4 — done: real sales/orders/products/inventory/customers/delivery report with period filter)

## Phase 15 — security hardening
- [x] Fix #1: server-side merchant MFA enforcement (aal2 in assertAdmin) — done
- [x] Fix #2: audit_logs append-only — applied; authenticated=SELECT+INSERT only, policies verified

## Merchant refunds UI, brands, settings, customer passwords
- [x] Refund dialog on merchant order detail (type "refund" to confirm) + refund history
- [x] Customer password show/hide + 8 chars / lowercase / number checklist
- [x] Brands section + product Brand dropdown (existing brands preserved)
- [x] Real merchant Settings page (demo text removed)
- [ ] Supabase Auth password rule must be set to "lowercase + digits" (dashboard; owner action)
- [x] New logo + favicon — uploaded Shreekant Seeds logo replaces the shared simple symbol

## Production fixes (Oct 1)
- [ ] Merchant password reset via Supabase Dashboard recovery link (awaiting go-ahead)
- [ ] Order SKS-20260928-661EBC blocked at Confirmed — investigated; awaiting owner decision on partially refunded orders
- [ ] Regression check after fixes

## Phase 21 (15 items)
- [x] 3,4,5,6,7,8,10,12 done in code
- [x] 13/14 database change approved and applied; verified (guard removed, 3 new columns, brand join live)
- [x] 1,2,9,11 done in code (build + typecheck OK)
- [ ] 15 merchant 4-device limit — SQL proposed, awaiting approval

- [x] Phase 21 final: चालान wording, cancel/discount typed confirmations, Category & Product Type discounts (live merchant click-through pending)

- [ ] Stage 1 only: all-products percentage discount and dated free-delivery promotion — planning complete; implementation waits for approval. Buy X Get Y deferred.
