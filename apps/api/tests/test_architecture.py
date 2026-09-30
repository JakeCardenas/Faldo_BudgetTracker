"""The API's layer rules, checked on every run so a wrong-way import fails CI instead of creeping in.

Routes (`api/`) sit on top and only the app factory mounts them; services hold the logic; `engine/` is pure calculation
anyone can call; `models/` and `schemas/` only describe data. Imports are read from the source, nothing is executed.
"""

import ast
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"


def imports_of(path: Path) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(), str(path))):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0, f"{path.relative_to(APP.parent)}: use absolute app.* imports"
            found.add(node.module or "")
    return found


def modules(package: str = "") -> list[Path]:
    return sorted((APP / package).rglob("*.py"))


def outside(allowed: tuple[str, ...], package: str) -> list[str]:
    """Imports in `package` that are neither the standard library nor one of `allowed` (prefixes)."""
    bad = []
    for path in modules(package):
        for name in imports_of(path):
            if name.split(".")[0] in sys.stdlib_module_names or name.startswith(allowed):
                continue
            bad.append(f"{path.relative_to(APP.parent)} imports {name}")
    return bad


def test_engine_is_pure_calculation():
    # No database, web framework, AI or service code: the engine is the part of Faldo that can be trusted with numbers.
    assert outside(("app.engine",), "engine") == []


def test_models_only_describe_tables():
    assert outside(("app.models", "sqlalchemy", "pgvector"), "models") == []


def test_schemas_only_describe_requests_and_responses():
    assert outside(("app.schemas", "app.models.enums", "pydantic"), "schemas") == []


def test_only_the_app_factory_mounts_routes():
    importers = [
        str(path.relative_to(APP.parent))
        for path in modules()
        if APP / "api" not in path.parents
        and any(name == "app.api" or name.startswith("app.api.") for name in imports_of(path))
    ]
    assert importers == ["app/main.py"]
