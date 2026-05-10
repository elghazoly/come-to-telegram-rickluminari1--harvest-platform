#!/usr/bin/env python3
"""
Convert PDF to Markdown using pymupdf4llm
Usage: python3 pdf_to_md.py <pdf_path>
Output: prints markdown to stdout
"""
import sys
import pymupdf4llm

if len(sys.argv) < 2:
    print("Usage: pdf_to_md.py <pdf_path>", file=sys.stderr)
    sys.exit(1)

pdf_path = sys.argv[1]
md = pymupdf4llm.to_markdown(pdf_path, show_progress=False)
print(md)
