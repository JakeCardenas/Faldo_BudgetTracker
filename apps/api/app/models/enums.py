from enum import StrEnum


class AccountType(StrEnum):
    cash = "cash"
    bank = "bank"
    e_wallet = "e_wallet"
    credit_card = "credit_card"
    savings = "savings"
    custom = "custom"


class TransactionType(StrEnum):
    income = "income"
    expense = "expense"
    transfer = "transfer"
    debt_in = "debt_in"  # money in from lending/borrowing (not income)
    debt_out = "debt_out"  # money out for lending/repaying (not spending)


MONEY_OWED_TYPES = (TransactionType.debt_in, TransactionType.debt_out)


class TransactionSource(StrEnum):
    manual = "manual"
    natural_language = "natural_language"
    receipt = "receipt"
    recurring = "recurring"
    seed = "seed"
    import_ = "import"  # a line from an imported bank or e-wallet statement


class CategoryKind(StrEnum):
    expense = "expense"
    income = "income"


class GoalStatus(StrEnum):
    active = "active"
    paused = "paused"
    completed = "completed"
    archived = "archived"


class RecurringKind(StrEnum):
    bill = "bill"
    subscription = "subscription"
    rent = "rent"
    loan = "loan"
    insurance = "insurance"
    income = "income"
    other = "other"


class Frequency(StrEnum):
    weekly = "weekly"
    biweekly = "biweekly"
    semi_monthly = "semi_monthly"
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"
    once = "once"  # one-time expected money (a client payment, a bonus); never repeats


class DebtDirection(StrEnum):
    i_owe = "i_owe"
    owed_to_me = "owed_to_me"


class DebtStatus(StrEnum):
    open = "open"
    settled = "settled"
    cancelled = "cancelled"


class ReceiptStatus(StrEnum):
    processing = "processing"
    needs_review = "needs_review"
    confirmed = "confirmed"
    failed = "failed"
    unavailable = "unavailable"
    discarded = "discarded"


class InsightSeverity(StrEnum):
    positive = "positive"
    info = "info"
    warning = "warning"
    critical = "critical"


class InsightStatus(StrEnum):
    active = "active"
    dismissed = "dismissed"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"
