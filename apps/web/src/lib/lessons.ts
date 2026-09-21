import {
  Calculator, CalendarRange, CreditCard, LifeBuoy, PiggyBank, ShieldCheck, ShoppingBag, Snowflake, TrendingDown, TrendingUp, type LucideIcon,
} from "lucide-react"

export interface Lesson {
  slug: string
  title: string
  icon: LucideIcon
  level: "Foundations" | "Growing" | "Advanced"
  minutes: number
  summary: string
  sections: { heading: string; body: string[] }[]
  takeaways: string[]
  quiz: { question: string; options: string[]; answer: number; explanation: string }
  tryIt?: { label: string; href: string }
}

export const LESSONS: Lesson[] = [
  {
    slug: "budget-50-30-20",
    title: "50/30/20, but make it real",
    icon: Calculator,
    level: "Foundations",
    minutes: 3,
    summary: "A simple way to split your income into needs, wants and savings.",
    sections: [
      {
        heading: "The idea",
        body: [
          "Split your take-home pay into three buckets: about 50% for needs, 30% for wants and 20% for savings or paying down debt.",
          "Needs are things you must pay to live and work: rent, food at home, utilities, transport, insurance and minimum debt payments. Wants are everything that makes life nicer but could be cut: eating out, shopping, streaming, trips.",
        ],
      },
      {
        heading: "An example",
        body: [
          "On a ₱25,000 monthly take-home pay: ₱12,500 for needs, ₱7,500 for wants and ₱5,000 for savings.",
          "Pay yourself first. Move the ₱5,000 to savings on payday, before you start spending, so it doesn't quietly disappear.",
        ],
      },
      {
        heading: "Adjust it to your life",
        body: [
          "If rent in the city eats most of your salary, or you send money home to family, 60/20/20 or even 70/10/20 can be more realistic. The exact split matters less than protecting the savings slice.",
          "Track a full month first. Your real numbers will show which bucket needs work.",
        ],
      },
    ],
    takeaways: ["Needs 50%, wants 30%, savings 20% is a starting point, not a rule.", "Save on payday, not with whatever is left.", "Use a month of real data before you set limits."],
    quiz: {
      question: "Which of these is a want, not a need?",
      options: ["Electricity bill", "Daily commute", "Weekend milk tea runs", "Rent"],
      answer: 2,
      explanation: "Milk tea is nice to have but can be cut back. The others keep you housed and working.",
    },
    tryIt: { label: "Make your money plan", href: "/plan/money" },
  },
  {
    slug: "emergency-fund",
    title: "Emergency fund first",
    icon: LifeBuoy,
    level: "Foundations",
    minutes: 3,
    summary: "Why a cash cushion comes before investing, and how big it should be.",
    sections: [
      {
        heading: "What it's for",
        body: [
          "An emergency fund covers the unexpected: a hospital visit, losing your job, a broken phone you need for work. Without one, emergencies usually end up on a credit card or a loan.",
        ],
      },
      {
        heading: "How much",
        body: [
          "Aim for 3 to 6 months of essential expenses. If your needs cost ₱15,000 a month, that's ₱45,000 to ₱90,000. Freelancers and single-income households should lean towards 6 months or more.",
          "That can feel huge, so start with a mini fund of ₱10,000, then build from there.",
        ],
      },
      {
        heading: "Where to keep it",
        body: [
          "Keep it safe and easy to reach, like a savings account at a PDIC-insured bank, separate from your everyday spending account. Don't put it in stocks or crypto: it has to be there when you need it.",
        ],
      },
    ],
    takeaways: ["Target 3 to 6 months of essential expenses.", "Start small with a ₱10,000 mini fund.", "Keep it liquid and separate from daily spending."],
    quiz: {
      question: "Your essential expenses are ₱20,000 a month. What's a solid emergency fund target?",
      options: ["₱5,000", "₱20,000", "₱60,000 to ₱120,000", "₱500,000"],
      answer: 2,
      explanation: "3 to 6 months of essentials is ₱60,000 to ₱120,000.",
    },
    tryIt: { label: "Calculate your emergency fund", href: "/tools/emergency-fund" },
  },
  {
    slug: "compound-interest",
    title: "Compound interest works both ways",
    icon: TrendingUp,
    level: "Foundations",
    minutes: 4,
    summary: "Small, steady amounts grow big over time. Debt grows the same way.",
    sections: [
      {
        heading: "Growth on top of growth",
        body: [
          "Compounding means you earn returns on your earlier returns. The longer your money stays invested, the faster it grows.",
          "Saving ₱2,000 a month for 10 years at 4% a year gives you about ₱294,000, even though you only put in ₱240,000. The extra ₱54,000 is compounding at work.",
        ],
      },
      {
        heading: "The dark side",
        body: [
          "Debt compounds too. Unpaid credit card balances in the Philippines can be charged interest of up to around 3% a month, which is well over 30% a year. A ₱20,000 balance you only pay the minimum on can take years to clear.",
        ],
      },
      {
        heading: "What to do",
        body: [
          "Start saving early, even small amounts, and let time do the heavy lifting. Pay off high-interest debt before chasing investment returns: clearing a 36%-a-year debt is a guaranteed 36% \"return\".",
        ],
      },
    ],
    takeaways: ["Time matters more than the amount.", "High-interest debt compounds against you.", "Pay off expensive debt before investing."],
    quiz: {
      question: "Which usually gives the best guaranteed result?",
      options: ["Investing while carrying credit card debt", "Paying off a credit card that charges 3% a month", "Keeping cash under the bed", "Buying lottery tickets"],
      answer: 1,
      explanation: "Clearing debt that costs you over 30% a year beats almost any investment return, and it's guaranteed.",
    },
  },
  {
    slug: "credit-cards",
    title: "Credit cards without the debt trap",
    icon: CreditCard,
    level: "Growing",
    minutes: 4,
    summary: "Use cards for rewards and convenience, never as extra income.",
    sections: [
      {
        heading: "Pay the full statement balance",
        body: [
          "If you pay your full statement balance by the due date, you usually pay no interest at all. Paying only the minimum keeps you in debt for a long time and costs a lot.",
        ],
      },
      {
        heading: "Watch out for installments",
        body: [
          "\"0% installment\" deals can still come with processing fees, and they lock in a monthly payment for months. Add every installment to your planned bills so you can see the total you owe each month.",
          "Many straight installment plans use add-on rates. A 1% monthly add-on rate on a 12-month plan costs more than 12% a year in true interest, because you're charged on the original amount even as you pay it down.",
        ],
      },
      {
        heading: "Keep usage low",
        body: [
          "Try to keep your balance under 30% of your limit. It's easier to pay off, and it keeps you from treating your credit limit like your salary.",
        ],
      },
    ],
    takeaways: ["Pay the statement balance in full, on time.", "Track every installment as a monthly bill.", "Keep usage under 30% of your limit."],
    quiz: {
      question: "What's the cheapest way to use a credit card?",
      options: ["Pay the minimum each month", "Pay the full statement balance by the due date", "Pay only when you remember", "Use cash advances"],
      answer: 1,
      explanation: "Paying the statement balance in full by the due date usually means zero interest.",
    },
    tryIt: { label: "Track installments in Plans", href: "/bills" },
  },
  {
    slug: "debt-snowball-avalanche",
    title: "Snowball vs. avalanche",
    icon: Snowflake,
    level: "Growing",
    minutes: 3,
    summary: "Two proven ways to pay off several debts, and how to pick one.",
    sections: [
      {
        heading: "Both start the same way",
        body: ["List every debt with its balance, interest rate and minimum payment. Pay the minimum on all of them, then put every extra peso towards one target debt."],
      },
      {
        heading: "Snowball: smallest balance first",
        body: ["Clear the smallest debt first, then roll its payment into the next smallest. Quick wins keep you motivated."],
      },
      {
        heading: "Avalanche: highest interest first",
        body: ["Target the debt with the highest interest rate first. You pay less interest overall and finish sooner, but the first win can take longer."],
      },
      {
        heading: "Which one?",
        body: ["If motivation is your problem, go snowball. If the numbers matter most, go avalanche. Either one beats paying minimums forever."],
      },
    ],
    takeaways: ["Always pay every minimum.", "Snowball builds momentum; avalanche saves the most money.", "Roll freed-up payments into the next debt."],
    quiz: {
      question: "The avalanche method targets which debt first?",
      options: ["The smallest balance", "The newest debt", "The highest interest rate", "The one owed to family"],
      answer: 2,
      explanation: "Avalanche goes after the highest interest rate first to minimize total interest.",
    },
    tryIt: { label: "Track what you owe", href: "/debts" },
  },
  {
    slug: "sinking-funds",
    title: "Sinking funds for the big months",
    icon: CalendarRange,
    level: "Growing",
    minutes: 3,
    summary: "Christmas, school fees and birthdays aren't surprises. Plan for them.",
    sections: [
      {
        heading: "Irregular, not unexpected",
        body: [
          "Some costs only show up a few times a year: Christmas gifts, school enrollment, car registration, insurance premiums, birthdays. They feel like emergencies, but you can see them coming.",
        ],
      },
      {
        heading: "Divide and save",
        body: [
          "Estimate the yearly cost and divide by the months left. If you want ₱18,000 for Christmas and it's March, save ₱2,000 a month for the next 9 months.",
          "Use your 13th month pay for these planned costs or for savings, not as a shopping bonus.",
        ],
      },
    ],
    takeaways: ["List your once-a-year expenses.", "Save for each one monthly.", "Put 13th month pay towards plans, not impulse buys."],
    quiz: {
      question: "You need ₱12,000 for school fees in 6 months. How much should you set aside monthly?",
      options: ["₱1,000", "₱2,000", "₱6,000", "₱12,000"],
      answer: 1,
      explanation: "₱12,000 ÷ 6 months = ₱2,000 a month.",
    },
    tryIt: { label: "Create a savings goal", href: "/goals" },
  },
  {
    slug: "government-benefits",
    title: "SSS, PhilHealth and Pag-IBIG",
    icon: ShieldCheck,
    level: "Growing",
    minutes: 4,
    summary: "What your mandatory contributions are for, and why they're worth keeping up.",
    sections: [
      {
        heading: "SSS",
        body: [
          "The Social Security System covers private-sector workers. It provides sickness, maternity, disability, unemployment and retirement benefits, plus salary and calamity loans for qualified members.",
        ],
      },
      {
        heading: "PhilHealth",
        body: ["PhilHealth helps pay for hospital care and some outpatient services. Keeping your contributions updated means lower out-of-pocket costs when you're confined."],
      },
      {
        heading: "Pag-IBIG Fund",
        body: [
          "Pag-IBIG offers savings, housing loans and short-term loans. Its voluntary MP2 savings program has historically paid higher dividends than regular savings accounts, though the rate changes every year.",
        ],
      },
      {
        heading: "If you're a freelancer",
        body: ["Self-employed and voluntary members pay contributions themselves. Set them up as recurring bills in Faldo so you don't fall behind."],
      },
    ],
    takeaways: ["These contributions buy real protection.", "Freelancers need to pay them on their own.", "Check current rates on each agency's official site."],
    quiz: {
      question: "Which agency mainly helps pay for hospital bills?",
      options: ["SSS", "PhilHealth", "Pag-IBIG", "BIR"],
      answer: 1,
      explanation: "PhilHealth is the national health insurance program.",
    },
    tryIt: { label: "Add contributions as bills", href: "/bills" },
  },
  {
    slug: "where-to-keep-money",
    title: "Where to keep your money",
    icon: PiggyBank,
    level: "Growing",
    minutes: 3,
    summary: "E-wallets, digital banks and traditional banks each have a job.",
    sections: [
      {
        heading: "Give each account a job",
        body: [
          "Use an e-wallet or payroll account for everyday spending, a separate savings account for your emergency fund, and goal accounts for things you're saving up for. Mixing them makes it too easy to overspend.",
        ],
      },
      {
        heading: "Insurance matters",
        body: [
          "Deposits at banks are insured by the PDIC up to ₱1,000,000 per depositor per bank. E-wallet balances aren't bank deposits, so keep larger savings in a PDIC-insured bank.",
          "Digital banks often pay higher interest on savings. Compare rates, but make sure the bank is BSP-supervised and PDIC-insured.",
        ],
      },
    ],
    takeaways: ["One account per job: spend, save, goals.", "Keep big savings in PDIC-insured banks.", "Compare interest rates, but check the bank is regulated."],
    quiz: {
      question: "Where should most of your emergency fund live?",
      options: ["Your everyday e-wallet", "A separate PDIC-insured savings account", "Crypto", "Your wallet at home"],
      answer: 1,
      explanation: "A separate insured savings account keeps it safe, reachable and away from daily spending.",
    },
    tryIt: { label: "Organize your wallets", href: "/accounts" },
  },
  {
    slug: "inflation",
    title: "Why savings shrink: inflation",
    icon: TrendingDown,
    level: "Advanced",
    minutes: 3,
    summary: "Prices rise every year. Your money needs to keep up.",
    sections: [
      {
        heading: "What inflation does",
        body: [
          "Inflation is prices going up over time. If prices rise 4% this year, ₱10,000 buys about what ₱9,600 bought last year.",
          "Cash sitting in an account earning 0.1% loses buying power every year.",
        ],
      },
      {
        heading: "Staying ahead",
        body: [
          "Keep your emergency fund safe and liquid, and accept that it will lose a little value. For money you won't need for years, look at options that can beat inflation over time, and learn the risks first.",
          "Review your budget every year too. Your grocery budget from two years ago probably doesn't cover the same basket today.",
        ],
      },
    ],
    takeaways: ["Idle cash loses value every year.", "Long-term money needs to grow faster than prices.", "Update your budget as prices change."],
    quiz: {
      question: "If inflation is 5% and your savings earn 1%, what happens to your buying power?",
      options: ["It grows 6%", "It stays the same", "It shrinks by about 4%", "It doubles"],
      answer: 2,
      explanation: "You earn 1% but prices rise 5%, so you lose about 4% of buying power.",
    },
  },
  {
    slug: "impulse-spending",
    title: "Tame the impulse buy",
    icon: ShoppingBag,
    level: "Advanced",
    minutes: 3,
    summary: "Small tricks that stop sale notifications from draining your wallet.",
    sections: [
      {
        heading: "Add friction",
        body: [
          "Use a 24-hour rule for anything over ₱1,000: add it to your cart, then decide tomorrow. Most urges fade.",
          "Remove saved cards from shopping apps and turn off sale notifications, especially during 9.9, 11.11 and 12.12 sales.",
        ],
      },
      {
        heading: "Know your triggers",
        body: [
          "Boredom, stress and payday are classic triggers. Look at your history in Faldo: when do your biggest wants purchases happen?",
          "Before buying, ask: \"Can I afford it?\" Faldo checks the purchase against your bills, budgets and goals before you commit.",
        ],
      },
    ],
    takeaways: ["Wait 24 hours before bigger buys.", "Turn off sale alerts and saved cards.", "Check affordability against your plans first."],
    quiz: {
      question: "Which habit best reduces impulse buying?",
      options: ["Saving your card in every app", "Waiting 24 hours before buying", "Shopping when stressed", "Buying during every sale"],
      answer: 1,
      explanation: "A waiting period gives the urge time to pass.",
    },
    tryIt: { label: "Check if you can afford it", href: "/plan" },
  },
]

export function lessonBySlug(slug: string) {
  return LESSONS.find((l) => l.slug === slug)
}
