import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/store/core";
import { useCopy } from "@/lib/store-context";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Shreekant Seeds" },
      { name: "description", content: "How Shreekant Seeds uses the details you share when you shop with us." },
      { property: "og:title", content: "Privacy Policy | Shreekant Seeds" },
      { property: "og:description", content: "How Shreekant Seeds uses the details you share when you shop with us." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const copy = useCopy();
  const items = [
    { hi: "खाता बनाते समय आप अपना नाम, ईमेल और फोन नंबर देते हैं, और ऑर्डर के लिए डिलीवरी पता।", en: "When you create an account you share your name, email and phone number, and a delivery address for orders." },
    { hi: "इन जानकारियों का उपयोग आपके ऑर्डर, डिलीवरी, चालान और ऑर्डर से जुड़ी सूचनाएँ भेजने के लिए होता है।", en: "These details are used to process your orders, deliveries, invoices and order-related notifications." },
    { hi: "भुगतान Razorpay के ज़रिए होता है। आपके कार्ड या UPI की पूरी जानकारी हमारी वेबसाइट पर नहीं रखी जाती।", en: "Payments are handled by Razorpay. Your full card or UPI details are not stored on our website." },
    { hi: "अपनी जानकारी के बारे में किसी भी प्रश्न के लिए दुकान से 9414466727 पर संपर्क करें।", en: "For any question about your details, contact the shop at 9414466727." },
  ];
  return <main><PageIntro title={copy({ hi: "गोपनीयता नीति", en: "Privacy Policy" })} /><div className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><ul className="list-disc space-y-3 pl-5 text-foreground/80">{items.map((item) => <li key={item.en}>{copy(item)}</li>)}</ul></div></main>;
}
