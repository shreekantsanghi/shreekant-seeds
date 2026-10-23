import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/store/core";
import { useCopy } from "@/lib/store-context";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms | Shreekant Seeds" },
      { name: "description", content: "Basic terms for ordering from Shreekant Seeds, Neem Ka Thana." },
      { property: "og:title", content: "Terms | Shreekant Seeds" },
      { property: "og:description", content: "Basic terms for ordering from Shreekant Seeds, Neem Ka Thana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const copy = useCopy();
  const items = [
    { hi: "सभी कीमतें GST सहित हैं। कीमत, स्टॉक और डिलीवरी शुल्क ऑर्डर के समय पक्के होते हैं।", en: "All prices include GST. Price, stock and delivery charge are confirmed when you place the order." },
    { hi: "केवल ऑनलाइन भुगतान स्वीकार किया जाता है।", en: "Only online payment is accepted." },
    { hi: "डिलीवरी दुकान के स्थानीय क्षेत्र में की जाती है; शुल्क चेकआउट पर दिखाया जाता है।", en: "Delivery is made within the shop's local area; the charge is shown at checkout." },
    { hi: "ऑर्डर से जुड़े किसी भी प्रश्न के लिए दुकान से 9414466727 पर संपर्क करें।", en: "For any question about an order, contact the shop at 9414466727." },
  ];
  return <main><PageIntro title={copy({ hi: "नियम व शर्तें", en: "Terms" })} /><div className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><ul className="list-disc space-y-3 pl-5 text-foreground/80">{items.map((item) => <li key={item.en}>{copy(item)}</li>)}</ul></div></main>;
}
