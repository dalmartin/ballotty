"""PDF -> one text file per page, in column reading order.

Pamphlet pages are mostly two columns. We find the real gutter from word
positions (a fixed half-split cuts words on Multnomah pages) and read the
left column, then the right. Pages without a clear gutter are read whole.
"""

import pdfplumber

from .common import PAGES, RAW, load_config


def find_gutter(page):
    words = page.extract_words()
    if len(words) < 40:
        return None
    w = page.width
    lo, hi = int(w * 0.3), int(w * 0.7)
    coverage = [0] * (hi - lo)
    for word in words:
        for x in range(max(lo, int(word["x0"])), min(hi, int(word["x1"]) + 1)):
            coverage[x - lo] += 1
    # Widest run of x positions that (almost) no word crosses.
    best, run_start, best_span = None, None, 0
    threshold = max(2, len(words) // 100)
    for i, c in enumerate(coverage + [threshold + 1]):
        if c <= threshold:
            run_start = i if run_start is None else run_start
        elif run_start is not None:
            if i - run_start > best_span:
                best_span, best = i - run_start, lo + (run_start + i) // 2
            run_start = None
    return best if best_span >= 4 else None


def page_to_text(page):
    gutter = find_gutter(page)
    if gutter is None:
        return page.extract_text() or ""
    left = page.crop((0, 0, gutter, page.height)).extract_text() or ""
    right = page.crop((gutter, 0, page.width, page.height)).extract_text() or ""
    return left + "\n\n" + right


def main():
    config = load_config()
    for doc in config["docs"]:
        out = PAGES / doc
        out.mkdir(parents=True, exist_ok=True)
        with pdfplumber.open(RAW / f"{doc}.pdf") as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                (out / f"{i}.txt").write_text(page_to_text(page))
            print(f"extract {doc}: {len(pdf.pages)} pages")


if __name__ == "__main__":
    main()
