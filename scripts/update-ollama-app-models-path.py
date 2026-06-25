"""Update Ollama desktop app settings.models path in db.sqlite."""
import sqlite3
import sys

def main():
    if len(sys.argv) < 2:
        print("usage: update-ollama-app-models-path.py <models_dir>", file=sys.stderr)
        sys.exit(1)
    models_dir = sys.argv[1].strip()
    if not models_dir:
        sys.exit(1)
    import os
    db = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Ollama", "db.sqlite")
    if not os.path.isfile(db):
        print(f"(update-ollama-app-db) skip: no db at {db}")
        return
    conn = sqlite3.connect(db)
    cur = conn.execute("SELECT models FROM settings LIMIT 1")
    row = cur.fetchone()
    before = (row[0] if row else "") or ""
    conn.execute("UPDATE settings SET models = ?", (models_dir,))
    conn.commit()
    conn.close()
    print(f"(update-ollama-app-db) settings.models: {before!r} -> {models_dir!r}")

if __name__ == "__main__":
    main()
