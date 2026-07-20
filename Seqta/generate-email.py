#!/usr/bin/env python3
"""
generate-email.py  -  Build a Trinity College student email from a name + grad year.

Usage:
    python generate-email.py <first name> <surname...> <grad year>

Example:
    python generate-email.py Zayn de Lobel 2030
    -> 30delozay@students.trinity.wa.edu.au

Format:  <YY><first 4 of surname><first 3 of first name>@students.trinity.wa.edu.au
  - YY              = last two digits of the graduation year (2030 -> 30)
  - surname         = all surname words joined, spaces removed, first 4 letters
  - first name      = first 3 letters
  - everything lowercase, non-letters stripped
"""

import sys
import re

# --- Tweak these if the format ever changes -------------------------------
DOMAIN          = "students.trinity.wa.edu.au"
SURNAME_LEN     = 4   # letters taken from the surname
FIRSTNAME_LEN   = 3   # letters taken from the first name
# --------------------------------------------------------------------------


def clean(text):
    """Lowercase and keep only a-z letters."""
    return re.sub(r"[^a-z]", "", text.lower())


def generate_email(first_name, surname, grad_year):
    yy      = str(grad_year)[-2:]                 # 2030 -> "30"
    surn    = clean(surname)[:SURNAME_LEN]        # "de Lobel" -> "delo"
    first   = clean(first_name)[:FIRSTNAME_LEN]   # "Zayn"     -> "zay"
    return f"{yy}{surn}{first}@{DOMAIN}"


def main():
    args = sys.argv[1:]
    if len(args) < 3:
        print(f"Usage: python {sys.argv[0]} <first name> <surname...> <grad year>")
        print(f"Example: python {sys.argv[0]} Zayn de Lobel 2030")
        sys.exit(1)

    year = args[-1]
    if not year.isdigit():
        print(f"[!] Last argument must be the graduation year, got: {year!r}")
        sys.exit(1)

    first_name = args[0]
    surname    = " ".join(args[1:-1])
    if not surname:
        print("[!] Missing surname.")
        sys.exit(1)

    print(generate_email(first_name, surname, year))


if __name__ == "__main__":
    main()
