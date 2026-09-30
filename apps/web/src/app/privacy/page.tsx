import type { Metadata } from "next"
import { AiProvidersNow, LegalPage } from "@/widgets/legal"

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Faldo collects, why, who helps run it, how long it's kept, and the choices you have.",
  alternates: { canonical: "/privacy" },
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="September 30, 2026">
      <p>
        Faldo is a personal money app. This notice explains what it collects, why, who helps run it, how long things are
        kept and what you can do about it. Faldo is operated by [operator&apos;s legal name], [contact address]. Questions:
        [privacy contact email].
      </p>

      <h2>What Faldo collects</h2>
      <ul>
        <li>Your account: email address, display name, and a scrambled (hashed) form of your password. If you sign in with Google or Apple, the account id they give Faldo and the email they share.</li>
        <li>What you record: accounts (names, types, balances you enter and, if you add them, the last four digits of a card or account), transactions, budgets, goals, bills, money owed, planned purchases, notes and things you ask Faldo to remember.</li>
        <li>Receipts and statements you add: photos (re-saved without location or other photo data) and bank or e-wallet CSV files you import.</li>
        <li>Chats with Faldo: your messages and Faldo&apos;s answers, and short summaries used to recall earlier chats.</li>
        <li>Sign-in and device details: which browser and device each signed-in session is on, and when it was last used. If you turn on phone notifications, the address your browser gives for sending them.</li>
      </ul>
      <p>Faldo never asks for full card numbers, CVVs, PINs or bank passwords, and doesn&apos;t connect to your bank or e-wallet.</p>

      <h2>Why</h2>
      <ul>
        <li>To run the app for you: show your balances, calculate Safe to Spend, forecasts and budgets, and keep your records.</li>
        <li>To keep your account secure: sign-in, sessions, limits on repeated attempts, and emails for resetting a password or confirming your address.</li>
        <li>To answer your questions and read receipts with AI, only if you allow it (below).</li>
      </ul>
      <p>Faldo doesn&apos;t sell your data, show ads, or use analytics or tracking tools.</p>

      <h2>AI</h2>
      <p>
        Faldo&apos;s numbers always come from its own calculations. An outside AI service is used only to write answers,
        read typed entries it can&apos;t understand on its own rules, read receipt photos and word short summaries, and
        only after you allow it. You can say no or change your mind in Settings, Your data; Faldo then works on its own
        rules.
      </p>
      <AiProvidersNow />
      <p>
        Faldo limits how much it sends: it doesn&apos;t send your whole history, only a summary of your money and what a
        question needs. What an AI service does with data is governed by its own terms, linked above; deleting your Faldo
        account doesn&apos;t delete what was already sent to it.
      </p>

      <h2>Who helps run Faldo</h2>
      <ul>
        <li>Vercel hosts the app. Faldo&apos;s server runs in Vercel&apos;s Tokyo region.</li>
        <li>[Database host and region] stores your data.</li>
        <li>The AI service listed above, if you allow it.</li>
        <li>[Email provider] sends password-reset and confirmation emails, if email is set up.</li>
        <li>Google or Apple, if you choose to sign in with them.</li>
        <li>Your browser&apos;s push service (for example Google, Apple or Mozilla) delivers phone notifications, if you turn them on.</li>
      </ul>

      <h2>Cookies and storage on your device</h2>
      <ul>
        <li><code>faldo_session</code> keeps you signed in. It can&apos;t be read by the page&apos;s scripts. With &ldquo;Remember me&rdquo; it lasts 30 days from your last visit; without it, it ends when you close the browser.</li>
        <li><code>faldo_oauth</code> exists for up to 10 minutes while you sign in with Google or Apple, to check the sign-in really started here.</li>
        <li>Your browser also keeps a few preferences for this device, like theme, sounds and whether amounts are hidden.</li>
      </ul>
      <p>These are needed for the app to work; there are no advertising or analytics cookies.</p>

      <h2>How long things are kept</h2>
      <ul>
        <li>Your records, receipts and chats: until you delete them or your account.</li>
        <li>Signed-in sessions: they end after 30 days without use (12 hours without &ldquo;Remember me&rdquo;), or when you sign out or sign out other devices.</li>
        <li>Password-reset links: 30 minutes. Email confirmation links: 72 hours.</li>
        <li>Records that stop a double tap from saving twice: 7 days. Counters that limit repeated attempts and daily AI use: up to 2 days, without your name or email.</li>
        <li>Server error logs, with emails, keys and reset links removed: [hosting log retention].</li>
        <li>Database backups kept by the database host: [backup retention].</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>See and download your data: Settings, Your data (a readable copy, or a full backup).</li>
        <li>Correct or delete any record in the app, or delete your whole account in Settings, Your data.</li>
        <li>Allow or stop outside AI, hide amounts on a device, and turn notifications on or off.</li>
        <li>Sign out other devices in Settings, Password and devices.</li>
      </ul>
      <p>[Rights and complaint routes under the Philippine Data Privacy Act of 2012 and any other law that applies, to be written with a qualified professional.]</p>

      <h2>Security</h2>
      <p>
        Faldo keeps each person&apos;s data separate in the database, stores passwords only in hashed form, uses secure
        cookies, and limits repeated sign-in attempts. No system is perfectly secure; if something goes wrong that
        affects your data, [breach notification commitment].
      </p>

      <h2>Changes</h2>
      <p>If this notice changes in a way that matters, Faldo will say so in the app before the change applies.</p>
    </LegalPage>
  )
}
