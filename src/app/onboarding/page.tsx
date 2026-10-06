import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const metadata = { title: "ברוך הבא — MoneyTalk" };

export default async function Onboarding() {
  const ctx = await getContext();
  if (ctx.onboarded) redirect("/");
  return (
    <main className="onboard-wrap">
      <span className="logo"><span className="mark">₪</span><span className="word">Money<b>Talk</b></span></span>
      <OnboardingWizard />
      <form action={async () => { "use server"; const c = await getContext(); await c.write.saveProfile({ onboarded: true }); redirect("/"); }}><button className="tlink muted">דלג על ההגדרה</button></form>
    </main>
  );
}
