import { getContext } from "@/lib/context";
import { Sidebar, BottomNav, MobileTopBar } from "@/components/nav";
import { QuickAddHost } from "@/components/quick-add";
import { GlobalSearch } from "@/components/global-search";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const [notes, review] = await Promise.all([ctx.read.notifications(), ctx.read.txns({ needsReview: true, limit: 99 })]);
  const unread = notes.filter((n) => !n.readAt).length;
  return (
    <div className="app">
      <a className="skip" href="#main">דלג לתוכן</a>
      <Sidebar unread={unread} review={review.length} />
      <div className="main">
        <MobileTopBar unread={unread} />
        {ctx.demo && (
          <div className="demo-banner" role="note">
            <span>{ctx.local ? "מצב הדגמה מקומי — נתוני דוגמה, לא נשמרים." : "אלה נתוני דוגמה. הנתונים האמיתיים שלך יופיעו ברגע שתוסיף הוצאה או תחבר חשבון."}</span>
            <a href="/accounts">חבר חשבון בנק</a>
            <button type="button" data-open-quick-add>הוסף הוצאה ראשונה</button>
          </div>
        )}
        <GlobalSearch />
        <main className="content" id="main">{children}</main>
      </div>
      <BottomNav />
      <QuickAddHost />
    </div>
  );
}
