import { AssistantChat } from "@/components/assistant-chat";

export const metadata = { title: "עוזר AI — MoneyTalk" };

export default function Assistant() {
  return (
    <div className="stack-col">
      <h1 className="ttl">עוזר AI</h1>
      <p className="muted" style={{ marginTop: -8 }}>שאל בעברית — ותקבל תשובה מדויקת מהנתונים שלך.</p>
      <AssistantChat />
    </div>
  );
}
