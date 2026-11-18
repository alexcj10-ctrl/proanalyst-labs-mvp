"""Export the original catalog without importing FastAPI. Run from any directory."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.sequences import build_catalog  # noqa: E402

OUTPUT = ROOT / "web/src/data/catalog.json"


def serialized_catalog():
    return json.dumps(build_catalog(), ensure_ascii=False, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the committed JSON is stale")
    args = parser.parse_args()
    expected = serialized_catalog()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            parser.exit(1, "Catalog is stale. Run python scripts/export_catalog.py\n")
        print("Catalog matches backend/sequences.py exactly.")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(expected, encoding="utf-8", newline="\n")
        print(f"Exported {len(build_catalog()['combos'])} scenarios to {OUTPUT}")


if __name__ == "__main__":
    main()
