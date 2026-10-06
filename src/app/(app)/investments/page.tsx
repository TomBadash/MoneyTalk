export const metadata = { title: "השקעות — MoneyTalk" };

export default function Investments() {
  return (
    <div className="stack-col">
      <div className="spread"><h1 className="ttl">השקעות</h1><span className="soon">בקרוב</span></div>
      <div className="card stack-col">
        <p>בשלב הבא תוכל לראות כאן את כל ההון שלך במקום אחד:</p>
        <ul className="ticks"><li>תיק מניות, קרנות נאמנות, אג״ח ומזומן — עם רווח/הפסד ותשואה</li><li>פנסיה, קרן השתלמות וקופות גמל</li><li>שווי נקי (Net Worth) לאורך זמן — בנפרד בין הפקדות לבין תשואה</li><li>חלוקת נכסים: מניות ארה״ב, חו״ל, ישראל, אג״ח ומזומן</li></ul>
        <p className="muted tiny">עד אז, הפקדות להשקעות שמזוהות בתנועות שלך נספרות כ״הקצאת הון״ ולא כהוצאה — כך שיעור החיסכון שלך נשאר מדויק.</p>
      </div>
    </div>
  );
}
