/**
 * Shared topic taxonomy. Both the deterministic analyzer and the
 * OpenAI prompt use these exact ids so results stay comparable
 * regardless of which provider analyzed a row.
 */
export interface TopicDef {
  id: string;
  label: string;
  severity: number; // 0-100, used by prioritization
  keywords: string[];
}

export const TOPICS: TopicDef[] = [
  {
    id: "fraud-scam",
    label: "Fraud and scams",
    severity: 100,
    keywords: ["scam", "fraud", "fraudulent", "counterfeit", "fake seller", "took my money", "never sent", "victim"],
  },
  {
    id: "product-quality",
    label: "Product quality and defects",
    severity: 75,
    keywords: ["defect", "broken", "quality", "damaged", "wrong item", "wrong items", "low-quality", "poor quality", "not meet", "expectations"],
  },
  {
    id: "pricing-payment",
    label: "Pricing and payments",
    severity: 70,
    keywords: ["payment", "overcharg", "additional payment", "price", "refund", "charged", "money"],
  },
  {
    id: "delivery",
    label: "Delivery and shipping",
    severity: 65,
    keywords: ["deliver", "shipping", "arrived", "late", "delayed", "shipment", "package", "order was"],
  },
  {
    id: "customer-support",
    label: "Customer support experience",
    severity: 60,
    keywords: ["customer service", "support", "helpful", "unresponsive", "resolved", "assistance", "knowledgeable"],
  },
  {
    id: "website-ordering",
    label: "Website and ordering",
    severity: 55,
    keywords: ["website", "crash", "placing my order", "checkout", "navigate", "user-friendly", "order on the"],
  },
  {
    id: "packaging",
    label: "Packaging and missing items",
    severity: 50,
    keywords: ["packaging", "missing", "box", "items were"],
  },
  {
    id: "replacement-resolution",
    label: "Replacement and resolution",
    severity: 45,
    keywords: ["replacement", "replaced", "provided a solution", "solution"],
  },
  {
    id: "seller-responsiveness",
    label: "Seller responsiveness",
    severity: 35,
    keywords: ["responsive", "seller was", "transparent", "informed promptly", "communicat"],
  },
  {
    id: "general-praise",
    label: "General praise",
    severity: 10,
    keywords: ["great", "excellent", "exceeded", "perfect", "love", "innovative", "wonderful", "amazing", "best"],
  },
];

export function topicById(id: string): TopicDef | undefined {
  return TOPICS.find((t) => t.id === id);
}

export function topicLabel(id: string): string {
  return topicById(id)?.label ?? id;
}
