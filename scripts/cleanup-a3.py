"""Remove audit A3 (+ remaining dist-alt) directories."""
import shutil
import stat
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    "最新客户端目录",
    "UI设计",
    "VoxCPM-main",
    ".venv",
    "graphify-out",
    "dist-alt",
]


def _on_rm_error(func, path, exc_info):
    try:
        Path(path).chmod(stat.S_IWRITE)
        func(path)
    except OSError:
        raise exc_info[1]


def remove_tree(path: Path) -> None:
    if not path.exists():
        print(f"MISSING {path.name}")
        return
    try:
        shutil.rmtree(path, onerror=_on_rm_error)
        print(f"DELETED {path.name}")
    except OSError as e:
        print(f"FAILED {path.name}: {e}", file=sys.stderr)
        raise


def main() -> int:
    failed = []
    for name in TARGETS:
        try:
            remove_tree(ROOT / name)
        except OSError:
            failed.append(name)
    if failed:
        print("PARTIAL: still locked or present:", ", ".join(failed), file=sys.stderr)
        print("Close 鲸落AI/Electron and run: python scripts/remove-dist-alt.ps1", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
