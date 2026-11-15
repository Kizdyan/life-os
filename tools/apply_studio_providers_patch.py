"""One-time, guarded surgical patch for the existing tools/studio_providers.py.
Run from repository root with Python >=3.11.
"""
from __future__ import annotations
import ast
import os
from pathlib import Path
import tempfile
FILE = Path(__file__).resolve().with_name("studio_providers.py")
ORIGINAL_INIT = '''class ProviderError(RuntimeError):
    def __init__(self, provider, status, code):
        self.provider, self.status, self.code = provider, status, code
        super().__init__(f"{provider}: {code} ({status})")'''
PATCHED_INIT = '''class ProviderError(RuntimeError):
    def __init__(self, provider, status, code, *, retry_after=None):
        self.provider, self.status, self.code = provider, status, code
        self.retry_after = retry_after
        super().__init__(f"{provider}: {code} ({status})")'''
ORIGINAL_RAISE = '        raise ProviderError(provider, error.code, code) from None'
PATCHED_RAISE = '''        # Retry-After is not a billing bypass: it is a delay hint for
        # transient 429/503 failures. Never log credentials or request bodies.
        retry_after = None
        if error.code in (429, 503):
            hint = error.headers.get("Retry-After") if error.headers else None
            if hint:
                try:
                    retry_after = max(0.0, min(300.0, float(hint)))
                except ValueError:
                    from email.utils import parsedate_to_datetime
                    from datetime import datetime, timezone
                    try:
                        retry_after = max(0.0, min(300.0, (parsedate_to_datetime(hint) - datetime.now(timezone.utc)).total_seconds()))
                    except (TypeError, ValueError, OverflowError):
                        pass
        raise ProviderError(provider, error.code, code, retry_after=retry_after) from None'''
def main() -> None:
    raw = FILE.read_text(encoding="utf-8")
    if PATCHED_INIT in raw and PATCHED_RAISE in raw:
        print("Already patched (no changes)")
        return
    if raw.count(ORIGINAL_INIT) != 1 or raw.count(ORIGINAL_RAISE) != 1:
        raise SystemExit("BLOCKED: studio_providers.py differs from verified main; inspect local file and merge manually")
    updated = raw.replace(ORIGINAL_INIT, PATCHED_INIT).replace(ORIGINAL_RAISE, PATCHED_RAISE)
    ast.parse(updated, filename=str(FILE))
    backup = FILE.with_suffix(".py.persona-retry.bak")
    with backup.open("x", encoding="utf-8", newline="") as f:
        f.write(raw)
    fd, tmp = tempfile.mkstemp(prefix=".studio_providers_", suffix=".py", dir=FILE.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(updated)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, FILE)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(f"Patched {FILE}; original backup: {backup}")
if __name__ == "__main__":
    main()
