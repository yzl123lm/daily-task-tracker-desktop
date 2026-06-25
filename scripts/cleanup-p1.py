"""P1 cleanup: remove audit temp files, dist-alt (best effort), __pycache__."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def rm_tree(path: Path) -> bool:
    if not path.exists():
        return True
    try:
        if path.is_file():
            path.unlink()
        else:
            shutil.rmtree(path)
        return not path.exists()
    except OSError as exc:
        print(f"[skip] {path}: {exc}")
        return False


def main() -> int:
    ok = True
    for name in (
        ".cursor/audit-a.txt",
        ".cursor/audit-plan.txt",
        ".cursor/audit-p0.txt",
        ".cursor/audit-security.txt",
        "dist-alt",
        "scripts/__pycache__",
    ):
        p = ROOT / name
        if not p.exists():
            print(f"[missing] {name}")
            continue
        if rm_tree(p):
            print(f"[removed] {name}")
        else:
            ok = False
            print(f"[failed] {name}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
