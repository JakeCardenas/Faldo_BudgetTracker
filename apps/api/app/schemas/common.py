from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Money = Annotated[int, Field(ge=0, le=10_000_000_000_00, description="Amount in minor units (centavos)")]
PositiveMoney = Annotated[int, Field(gt=0, le=10_000_000_000_00)]
SignedMoney = Annotated[int, Field(ge=-10_000_000_000_00, le=10_000_000_000_00)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
CurrencyCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class OutModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](OutModel):
    items: list[T]
    next_cursor: str | None = None
    total_count: int
