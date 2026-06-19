// Israeli payment methods (PRD §9.2). Hebrew labels.

export type PaymentMethod = {
  id: string;
  he: string;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "credit", he: "אשראי" },
  { id: "cash", he: "מזומן" },
  { id: "transfer", he: "העברה בנקאית" },
  { id: "bit", he: "ביט" },
];

const BY_ID = new Map(PAYMENT_METHODS.map((p) => [p.id, p]));

export function getPaymentMethod(id?: string): PaymentMethod | undefined {
  return id ? BY_ID.get(id) : undefined;
}
