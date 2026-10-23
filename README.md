# Shreekant Seeds Online

Build the Phase 1 foundation of a production-ready, SINGLE-MERCHANT agricultural e-commerce website for the following real business.

BUSINESS INFORMATION

Shop name:
Shreekant Seeds

Hindi shop name:
श्रीकान्त सीड्स

Location:
Neem Ka Thana, Sikar, Rajasthan, India, 332713

Address:
Kapil Mandi, Neem Ka Thana, Sikar, Rajasthan,332713

Shop hours:
9:00 AM – 7:00 PM

Customer support phone:
9414466727

WhatsApp:
9414466727

Products sold:

Seeds

Pesticides / crop-protection products

Delivery:
Local delivery from the shop owner's godown.
Delivery charges are NOT decided yet, so do not invent or display a fixed delivery charge.

Logo:
No logo is currently available.
For now, use a professional text-based brand identity using:
"Shreekant Seeds"
and
"श्रीकान्त सीड्स"

The real logo can be added later without redesigning the application.

IMPORTANT BUSINESS MODEL

This is an online store for ONE local agricultural shop.

There is ONLY ONE merchant.

The business works like this:

The shop owner sells seeds and pesticides.

Physical inventory is stored in the owner's godown.

Existing customers will receive the website link directly, primarily through WhatsApp.

Customers will open the website, browse products, add products to cart, checkout and pay online.

The owner prepares orders from the godown.

The owner delivers orders locally.

Cash on Delivery is NOT allowed.

This is NOT a marketplace.

DO NOT create:

Multi-vendor functionality

Seller registration

Vendor dashboards

Seller commissions

Multiple shops

Marketplace functionality

Courier marketplace

Driver application

Complex logistics platform

COD

The final application is a simple but professional online store for Shreekant Seeds.

PHASE 1 SCOPE

This is ONLY Phase 1 of a larger project.

Build the complete visual and structural foundation now.

Do NOT implement the real backend, database, authentication, payment processing or production inventory system yet.

Those will be implemented carefully in later phases.

Do not pretend placeholder functionality is production functionality.

LANGUAGE — VERY IMPORTANT

The primary customers are farmers in Rajasthan.

The website MUST support:

🇮🇳 Hindi
🇬🇧 English

IMPORTANT LANGUAGE BEHAVIOR:

Hindi must be the DEFAULT language when a customer first opens the website.

The interface should initially display Hindi.

Provide a clearly visible language switch/toggle such as:
"हिन्दी | English"

Customers must be able to switch to English.

Customers must be able to switch back to Hindi.

The language selector should be accessible on mobile and desktop.

Do not make customers dig through Settings to change language.

Preserve the selected language while navigating between pages during the session.

The architecture must be properly prepared for bilingual content.

Do NOT simply duplicate the entire application for each language.

Use a maintainable translation/i18n structure so text can be changed later without rebuilding the UI.

For product information, prepare the structure so product names/descriptions can eventually have Hindi and English versions.

Do not use machine-translated-looking or awkward Hindi.

Keep Hindi simple and understandable for farmers.

Use clear agricultural terminology.

CUSTOMER WEBSITE ROUTES

Create the customer-facing foundation for:

/
/products
/categories
/categories/[category]
/products/[id]
/search
/cart
/checkout
/orders
/orders/[id]
/account
/addresses

All routes should work visually and be navigable.

Backend-dependent functionality may use clearly identified demo/mock data or appropriate empty states.

Do NOT create fake production authentication or fake payment processing.

HEADER / NAVIGATION

Create a professional mobile-first header.

Include:

Shreekant Seeds branding

"श्रीकान्त सीड्स" branding

Search

Categories/products navigation

Cart

Account/login

Hindi/English language switch

On mobile, keep the header simple and easy to use.

The cart should be clearly visible.

The language switch should remain easy to find.

HOMEPAGE

Create a polished agricultural e-commerce homepage for Shreekant Seeds.

The homepage should include:

Header/navigation

Prominent search bar

Hero section

Use messaging appropriate for the business, for example around:

Seeds

Crop protection

Trusted local agricultural products

Local delivery

Do not make unsupported claims such as "best in Rajasthan", "government approved", "100% guaranteed", etc.

Main categories

Only show the actual business categories:

Seeds

Pesticides

Do not add fertilizers or farming supplies because the shop currently sells seeds and pesticides only.

Featured products

Popular products

Seeds section

Pesticides section

Local delivery information

Clearly communicate that the shop provides local delivery.

Do NOT show a fixed delivery charge because it has not yet been decided.

Why choose Shreekant Seeds

Keep claims factual and modest.

Contact section

Show:

Shreekant Seeds
श्रीकान्त सीड्स

Kapil Mandi,
Neem Ka Thana, Sikar, Rajasthan

Phone:
9414466727

WhatsApp:
9414466727

Shop hours:
9:00 AM – 7:00 PM

Footer

Include:

Shop information

Contact

WhatsApp

Address

Shop hours

Hindi/English language option

Customer account

Orders

Privacy/terms placeholders for later completion

MOBILE-FIRST DESIGN

Mobile is the PRIMARY customer experience.

Customers will frequently open the website directly from WhatsApp.

Design for mobile first.

Ensure:

Large touch targets

Easy-to-read text

Prominent search

Easy product browsing

Simple navigation

Clearly visible cart

Simple checkout structure

No horizontal scrolling

Good spacing

Fast-feeling interface

Good performance

Responsive tablet and desktop layouts

The website should feel comfortable for users who may not be highly familiar with online shopping.

DESIGN STYLE

The visual identity should communicate:

"Trusted local agricultural shop now available online."

Design should be:

Professional

Clean

Modern

Agricultural

Trustworthy

Friendly

Simple

Easy to understand

Suitable for Indian farmers

Mobile-first

Avoid:

Amazon/Flipkart cloning

Marketplace appearance

Generic SaaS appearance

Excessive animations

Excessive gradients

Overly complicated layouts

Tiny text

Excessive decorative elements

Prioritize usability over decoration.

Use a natural agricultural visual direction, but keep it professional rather than making the site look cartoonish.

PRODUCT FOUNDATION

Create reusable product cards and product components.

Product cards should support:

Product image

Product name

Category

Short description

Price

Optional MRP/original price

Optional discount

Availability/stock status

Add to Cart

View Details

Create a small amount of clearly identified demo/mock data.

Only use the categories:

Seeds

Pesticides

Do NOT invent real brands, certifications, registrations, license numbers, government approvals, customer reviews or agricultural claims.

Do not invent pesticide dosage, application instructions or safety recommendations.

Real product data will be added in a later phase.

PRODUCT DETAILS PAGE

Create a clean product details page containing:

Product image/gallery

Product name

Category

Price

Optional MRP

Optional discount

Availability

Product information

Quantity selector

Add to Cart

Future-ready "Share" button

Future-ready "Share on WhatsApp" action

Related products

The page must look good when a customer arrives directly from a WhatsApp product link.

Prepare the product page structure for future Hindi/English product information.

CATEGORIES

Create category browsing for:

Seeds

Pesticides

Use reusable category components.

Do not hard-code the architecture so categories cannot later be managed from the database.

CART FOUNDATION

Create the cart UI containing:

Product items

Quantity controls

Remove item

Subtotal

Delivery fee placeholder

Discount placeholder

Total

Proceed to Checkout

For Phase 1, cart behavior may use local/mock state.

Do not treat frontend totals as trusted values.

Later phases will implement secure server-side price and order calculations.

CHECKOUT FOUNDATION

Create the checkout UI structure for:

Customer details

Delivery address

Order summary

Discount/coupon area

Delivery fee

Final total

Online payment section

Place Order / Pay button

IMPORTANT:

DO NOT include Cash on Delivery.

DO NOT implement fake Razorpay payment.

DO NOT show a fake successful payment.

Razorpay will be integrated securely in a later phase using server-side order creation, payment verification and webhooks.

Delivery charges are currently undecided, so use an appropriate "Delivery charges calculated at checkout" / "To be confirmed" placeholder rather than inventing a price.

CUSTOMER ACCOUNT FOUNDATION

Create UI foundations for:

Login

Registration

Account/profile

Addresses

Orders

Order details

Authentication will be implemented later using Supabase.

Do not create fake production authentication.

ORDERS FOUNDATION

Create the UI foundation for:

Order history

Order details

Order status

Items

Total

Delivery information

Invoice access

Reorder

Use demo data or appropriate empty states.

LOCAL DELIVERY

The shop owner will personally/manage local delivery from the godown.

Create only the necessary customer-facing delivery UI.

Do NOT add:

Courier APIs

Driver app

GPS tracking

Shipping marketplace

Complex logistics system

Later phases will implement configurable local delivery areas, pincodes, charges and delivery status.

ADMIN / MERCHANT FOUNDATION

Create a separate admin dashboard foundation.

Routes:

/admin
/admin/products
/admin/products/new
/admin/products/[id]
/admin/inventory
/admin/orders
/admin/orders/[id]
/admin/customers
/admin/discounts
/admin/delivery
/admin/reports
/admin/settings

Create a clean admin layout with:

Sidebar

Header

Dashboard

Products

Inventory

Orders

Customers

Discounts

Delivery

Reports

Settings

Dashboard should include useful placeholder KPI cards such as:

Orders

Revenue

Pending Orders

Low Stock

Use clearly labeled demo/mock data.

Admin authentication, authorization, MFA and database security will be implemented later.

Do not create fake security.

ADMIN DESIGN

The admin dashboard should be simple enough for a local shop owner to use.

Prioritize:

Clear navigation

Readable tables

Large enough controls

Simple terminology

Clear status badges

Easy product/order management

Responsive design where practical

Do not make it unnecessarily complicated.

FUTURE TECHNICAL ARCHITECTURE

Use the project's supported modern web stack with:

TypeScript

React/component-based architecture

Tailwind CSS where appropriate

Reusable components

Clean route organization

Semantic HTML

Accessible controls

Maintainable code

The application should be structured for later integration with:

Supabase

PostgreSQL

Supabase Authentication

Supabase Storage

Supabase Row Level Security

Server-side functions

Razorpay

GitHub

Cloudflare Workers deployment

Do NOT add unnecessary infrastructure such as:

Microservices

Kubernetes

Kafka

Redis

MongoDB

Complex AWS architecture

This is intentionally a single-merchant modular application.

FUTURE DATA MODEL

Do not implement the real database in Phase 1.

However, keep the application architecture compatible with future entities such as:

profiles/users

categories

products

product_images

inventory

addresses

carts

cart_items

orders

order_items

payments

deliveries

discounts

notifications

audit_logs

Agricultural product-specific data may later include:

product_batches

seed_attributes

pesticide_attributes

compliance_documents

Historical orders must eventually preserve product name and price at the time of purchase.

SECURITY DIRECTION

Keep future security requirements in mind.

The final application must ensure:

Customers can only access their own data.

Customers cannot modify product prices.

Customers cannot modify stock.

Customers cannot change payment status.

Prices and totals are validated server-side.

Admin functions require secure authorization.

Payment secrets never appear in frontend code.

Razorpay secrets remain server-side.

Supabase RLS protects customer data.

Important merchant actions can eventually be audited.

Do NOT claim Phase 1 is already production-secure.

WHATSAPP-FIRST EXPERIENCE

The owner will distribute the website link to existing customers through WhatsApp.

Therefore:

Product pages must have clean URLs.

Product pages must be easy to share.

Include a future-ready WhatsApp sharing action.

Make direct product-page visits useful.

Make phone and WhatsApp contact options easy to access.

Make the site highly usable on mobile.

Where appropriate, use a WhatsApp contact action linked to:

9414466727

Do not create a fake WhatsApp chatbot.

MOCK DATA RULES

Use only clearly identifiable demo/mock products.

Do not invent:

Real customer information

Real reviews

GST numbers

Seed licenses

Pesticide licenses

Registration numbers

Certifications

Government approvals

Business claims

Pesticide dosage instructions

Safety instructions

Fake ratings

Use placeholders where real business information is not available.

CODE QUALITY

Use:

Reusable components

Clean naming

Maintainable structure

Responsive components

Accessible controls

Semantic HTML

Proper empty states

Proper loading states where appropriate

Error states where appropriate

Avoid one giant component for the entire application.

Avoid unnecessary dependencies.

Do not rebuild existing working components unnecessarily.

CRITICAL DEVELOPMENT RULE

This project will be developed phase-by-phase.

For Phase 1, BUILD:

✓ Customer storefront foundation
✓ Hindi-first interface
✓ English language switch
✓ Homepage
✓ Product browsing
✓ Seeds category
✓ Pesticides category
✓ Product detail pages
✓ Search UI
✓ Cart UI
✓ Checkout UI foundation
✓ Customer account UI foundation
✓ Orders UI foundation
✓ Local delivery information
✓ WhatsApp-friendly experience
✓ Admin dashboard foundation
✓ Product/inventory/order/customer/admin route structure
✓ Responsive mobile-first design
✓ Reusable components
✓ Clean architecture

DO NOT BUILD YET:

✗ Real Supabase database
✗ Real authentication
✗ Real RLS
✗ Real Razorpay integration
✗ Real payment processing
✗ Real inventory persistence
✗ Real order persistence
✗ Real notifications
✗ Production invoices
✗ Production admin authorization
✗ MFA
✗ Advanced reports

Those will be implemented in their dedicated future phases.

Do not remove or overwrite working functionality unnecessarily.

Do not redesign the entire application when future phases are added.

Future phases should extend this foundation rather than rebuilding it.

PHASE 1 SUCCESS CRITERIA

At the end of Phase 1, I should be able to navigate through:

CUSTOMER:

Home
→ Products
→ Categories
→ Seeds / Pesticides
→ Product Details
→ Cart
→ Checkout
→ Account
→ Orders

ADMIN:

Dashboard
→ Products
→ Inventory
→ Orders
→ Customers
→ Discounts
→ Delivery
→ Reports
→ Settings

The customer website must initially open in Hindi and provide an obvious Hindi/English language switch.

The site must look like a real professional online store for Shreekant Seeds, not a generic template.

After completing Phase 1:

Give me a concise summary of what was created.

List the routes created.

List the major reusable components.

List the mock/demo data.

State clearly what has NOT been implemented because it belongs to later phases.

Do not automatically start Phase 2.

Do not make additional unrelated changes.

STOP after Phase 1.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
