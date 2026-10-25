"""Download the official source PDFs and pin each one by sha256 in data/sources.json."""

import hashlib
import sys
import urllib.request
from datetime import datetime, timezone

from .common import RAW, ROOT, load_config, write_json


def main(force=False):
    config = load_config()
    RAW.mkdir(parents=True, exist_ok=True)
    sources = {}
    for doc, meta in config["docs"].items():
        path = RAW / f"{doc}.pdf"
        if force or not path.exists():
            print(f"fetch {doc} <- {meta['url']}")
            req = urllib.request.Request(meta["url"], headers={"User-Agent": "Mozilla/5.0 (Ballotty)"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                path.write_bytes(resp.read())
        sources[doc] = {
            "url": meta["url"],
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bytes": path.stat().st_size,
            "retrieved_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds"),
        }
    write_json(ROOT / "data" / "sources.json", sources)
    print(f"{len(sources)} sources pinned in data/sources.json")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
