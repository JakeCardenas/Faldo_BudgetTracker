import uuid
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Conflict
from app.models import Category, Transaction
from app.models.enums import CategoryKind
from app.schemas.ledger import CategoryIn, CategoryUpdate
from app.services.common import get_owned

DEFAULT_EXPENSE_CATEGORIES: list[tuple[str, str, str, bool, list[str]]] = [
    ("Food & Dining", "utensils", "#C2410C", False, ["Restaurants", "Fast food", "Coffee", "Food delivery"]),
    ("Groceries", "shopping-basket", "#15803D", True, []),
    ("Transportation", "car", "#0369A1", True, ["Ride-hailing", "Public transit", "Fuel", "Parking"]),
    ("Bills & Utilities", "zap", "#A16207", True, ["Electricity", "Water", "Internet", "Mobile load"]),
    ("Housing", "home", "#4D7C0F", True, ["Rent", "Maintenance"]),
    ("Shopping", "shopping-bag", "#7C3AED", False, ["Clothing", "Shoes", "Electronics", "Home goods"]),
    ("Subscriptions", "repeat", "#BE185D", False, []),
    ("Entertainment", "clapperboard", "#9333EA", False, ["Movies", "Games", "Events"]),
    ("Health", "heart-pulse", "#DC2626", True, ["Pharmacy", "Medical"]),
    ("Personal Care", "sparkles", "#DB2777", False, []),
    ("Education", "graduation-cap", "#1D4ED8", True, []),
    ("Travel", "plane", "#0E7490", False, []),
    ("Gifts & Family", "gift", "#B45309", False, []),
    ("Fees & Charges", "receipt", "#57534E", False, []),
    ("Other", "circle-dashed", "#6B7280", False, []),
]

DEFAULT_INCOME_CATEGORIES: list[tuple[str, str, str]] = [
    ("Salary", "briefcase", "#0B6B4B"),
    ("Freelance", "laptop", "#15803D"),
    ("Allowance", "wallet", "#4D7C0F"),
    ("Gifts Received", "gift", "#B45309"),
    ("Refunds", "rotate-ccw", "#0369A1"),
    ("Other Income", "plus-circle", "#6B7280"),
]


async def create_default_categories(db: AsyncSession, user_id: uuid.UUID) -> None:
    for name, icon, color, essential, children in DEFAULT_EXPENSE_CATEGORIES:
        parent = Category(user_id=user_id, name=name, kind=CategoryKind.expense, icon=icon, color=color,
                          is_essential=essential)
        db.add(parent)
        await db.flush()
        for child in children:
            db.add(Category(user_id=user_id, name=child, kind=CategoryKind.expense, parent_id=parent.id,
                            icon=icon, color=color, is_essential=essential))
    for name, icon, color in DEFAULT_INCOME_CATEGORIES:
        db.add(Category(user_id=user_id, name=name, kind=CategoryKind.income, icon=icon, color=color))
    await db.flush()


async def list_categories(db: AsyncSession, user_id: uuid.UUID) -> list[Category]:
    return list(
        (await db.execute(select(Category).where(Category.user_id == user_id).order_by(Category.kind, Category.name)))
        .scalars()
        .all()
    )


async def create_category(db: AsyncSession, user_id: uuid.UUID, data: CategoryIn) -> Category:
    if data.parent_id:
        parent = await get_owned(db, Category, data.parent_id, user_id, "Parent category")
        if parent.parent_id is not None:
            raise AppError("Subcategories cannot have their own subcategories.")
        if parent.kind != data.kind:
            raise AppError("A subcategory must match its parent's type.")
    exists = await db.scalar(
        select(Category.id).where(
            Category.user_id == user_id, Category.name == data.name, Category.kind == data.kind,
            Category.parent_id.is_(None) if data.parent_id is None else Category.parent_id == data.parent_id,
        )
    )
    if exists:
        raise Conflict("That category already exists.")
    category = Category(user_id=user_id, **data.model_dump())
    db.add(category)
    await db.flush()
    return category


async def resolve_category_pair(
    db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID | None, subcategory_id: uuid.UUID | None
) -> tuple[Category | None, Category | None]:
    category = await get_owned(db, Category, category_id, user_id, "Category") if category_id else None
    sub = await get_owned(db, Category, subcategory_id, user_id, "Subcategory") if subcategory_id else None
    if category and category.parent_id is not None:
        sub = sub or category
        category = await get_owned(db, Category, category.parent_id, user_id, "Category")
    if sub:
        if sub.parent_id is None:
            raise AppError("That subcategory is a top-level category.")
        if category is None:
            category = await get_owned(db, Category, sub.parent_id, user_id, "Category")
        elif sub.parent_id != category.id:
            raise AppError("The subcategory does not belong to the selected category.")
    return category, sub


async def update_category(db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID, data: CategoryUpdate) -> Category:
    category = await get_owned(db, Category, category_id, user_id, "Category")
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] != category.name:
        exists = await db.scalar(select(Category.id).where(
            Category.user_id == user_id, Category.name == updates["name"], Category.kind == category.kind,
            Category.parent_id.is_(None) if category.parent_id is None else Category.parent_id == category.parent_id,
            Category.id != category.id,
        ))
        if exists:
            raise Conflict("That category already exists.")
    for key, value in updates.items():
        setattr(category, key, value)
    await db.flush()
    return category


async def delete_category(db: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID) -> list[uuid.UUID]:
    category = await get_owned(db, Category, category_id, user_id, "Category")
    affected: Any = select(Transaction.id).where(
        Transaction.user_id == user_id,
        (Transaction.category_id == category_id) | (Transaction.subcategory_id == category_id),
    )
    if category.parent_id is None:
        child_ids = select(Category.id).where(Category.parent_id == category_id)
        affected = affected.union(select(Transaction.id).where(Transaction.user_id == user_id, Transaction.subcategory_id.in_(child_ids)))
    transaction_ids = list((await db.execute(affected)).scalars().all())
    if category.parent_id is not None:
        await db.execute(update(Transaction).where(Transaction.subcategory_id == category_id).values(subcategory_id=None))
    await db.delete(category)
    await db.flush()
    return transaction_ids
