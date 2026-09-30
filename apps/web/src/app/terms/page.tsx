import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/widgets/legal"

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using Faldo, a personal money app: what it is, what it isn't, and your responsibilities.",
  alternates: { canonical: "/terms" },
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="September 30, 2026">
      <p>
        These terms are between you and [operator&apos;s legal name] (&ldquo;Faldo&rdquo;). By using Faldo you agree to
        them. [Minimum age and who may use Faldo.]
      </p>

      <h2>What Faldo is</h2>
      <p>
        Faldo helps you record your money and see what&apos;s safe to spend, what&apos;s coming up and how a purchase
        would affect your plans. It works only with what you record or import. It isn&apos;t a bank or e-wallet, doesn&apos;t
        hold or move money, and doesn&apos;t connect to your accounts.
      </p>

      <h2>Not financial advice</h2>
      <p>
        Faldo is not a licensed financial adviser. Its figures, forecasts, &ldquo;Can I afford it?&rdquo; checks and
        suggestions are estimates from your records and general information, for your own planning. They can be wrong
        or out of date, especially if your records are incomplete. For investments, loans, insurance, taxes or other
        important decisions, talk to a qualified professional. Decisions are yours.
      </p>

      <h2>AI answers</h2>
      <p>
        Faldo&apos;s calculations come from its own rules. When you allow an outside AI service, it writes answers and
        reads receipts; it can misread or misstate things. Faldo checks the amounts in AI answers against its own
        numbers, but check anything important before relying on it. See the <Link href="/privacy" className="underline underline-offset-2">Privacy notice</Link> for what is sent.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in details to yourself and tell us at [contact email] if you think someone else used your account.</li>
        <li>Use Faldo only for your own money records and in line with the law. Don&apos;t try to access other people&apos;s data, overload the service or get around its limits.</li>
        <li>You&apos;re responsible for the accuracy of what you record.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        Your records are yours. You can download them or delete your account at any time from Settings, Your data. How
        Faldo handles your data is described in the <Link href="/privacy" className="underline underline-offset-2">Privacy notice</Link>.
      </p>

      <h2>Availability and changes</h2>
      <p>
        Faldo is provided as it is and may change, pause or have outages; daily limits apply to AI features. [Notice
        period for material changes or ending the service.]
      </p>

      <h2>Liability</h2>
      <p>[Limitation of liability, governing law (for example, the laws of the Philippines) and dispute resolution, to be written with a qualified professional.]</p>

      <h2>Contact</h2>
      <p>[Contact email and address.]</p>
    </LegalPage>
  )
}
