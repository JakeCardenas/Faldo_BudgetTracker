import ast
import operator
from collections.abc import Callable
from decimal import ROUND_HALF_EVEN, Decimal, DivisionByZero, InvalidOperation

_BIN_OPS: dict[type[ast.operator], Callable[[Decimal, Decimal], Decimal]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}
_UNARY_OPS: dict[type[ast.unaryop], Callable[[Decimal], Decimal]] = {ast.UAdd: operator.pos, ast.USub: operator.neg}
MAX_EXPRESSION_LENGTH = 200


class CalculationError(ValueError):
    pass


def evaluate(expression: str, variables: dict[str, Decimal] | None = None) -> Decimal:
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise CalculationError("Expression is too long")
    variables = variables or {}
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise CalculationError("Invalid expression") from exc

    def walk(node: ast.AST) -> Decimal:
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, int | float) and not isinstance(node.value, bool):
            return Decimal(str(node.value))
        if isinstance(node, ast.Name):
            if node.id not in variables:
                raise CalculationError(f"Unknown value: {node.id}")
            return variables[node.id]
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
            try:
                return _BIN_OPS[type(node.op)](walk(node.left), walk(node.right))
            except (DivisionByZero, InvalidOperation) as exc:
                raise CalculationError("Division by zero") from exc
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
            return _UNARY_OPS[type(node.op)](walk(node.operand))
        raise CalculationError("Only numbers, named values, + − × ÷ and parentheses are allowed")

    return walk(tree).quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)
