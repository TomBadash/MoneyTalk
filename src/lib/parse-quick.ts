// Quick-entry parser (PRD §9.3): "קפה 18" → { title: "קפה", amount: 18 }.
// Picks the first standalone number as the amount; the rest (minus a ₪ sign)
// becomes the title. Works whether the number comes before or after the text.

export type ParsedQuick = {
  title: string;
  amount: number | null;
};

export function parseQuickEntry(raw: string): ParsedQuick {
  const text = raw.trim();
  if (!text) return { title: "", amount: null };

  // first number (supports decimals with . or ,)
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  const amount = match ? parseFloat(match[1].replace(",", ".")) : null;

  const title = text
    .replace(/₪/g, "")
    .replace(/(\d+(?:[.,]\d+)?)/, "")
    .replace(/\s+/g, " ")
    .trim();

  return { title, amount };
}
