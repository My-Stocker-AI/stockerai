"""
PDF text parser for Canteen/Compass vending machine route PDFs.

Ported from: workflows/fixes/PARSE_PDF_TEXT_SLOT_BOUNDARY_FIX.js

Input: raw text extracted from PDF
Output: structured route data { route_name, delivery_date, locations: [...] }
"""

import re
import io
import pdfplumber


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF binary data using pdfplumber (preserves layout/whitespace)."""
    pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    text_parts = []
    for page in pdf.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    pdf.close()
    return "\n".join(text_parts)


def _reassemble_compound_slots(text: str) -> str:
    """
    Pre-process text to reassemble compound slot names split by pdfplumber.

    VendMax PDFs use compound slot names like "Drink Cooler-3-7", "Fresh Food-1-2",
    "Snack Rack-5-3". pdfplumber puts the first word ("Drink"/"Fresh"/"Snack") on the
    same line as the product data, with the rest ("Cooler-", "3-7") on subsequent lines.

    This function detects these patterns and reassembles them into single lines
    that the main parser's slot regex can match.

    Example:
        Drink Vitamin Water Focus Bottle 20 oz - Bottle 2 4 / 6 2.75 None
        Cooler-
        3-7
    Becomes:
        Drink Cooler-3-7 Vitamin Water Focus Bottle 20 oz - Bottle 2 4 / 6 2.75 None
    """
    # Line starting with compound prefix + item data ending with None
    # Negative lookahead ensures we only match SPLIT slots (not already-complete ones)
    compound_item_re = re.compile(
        r"^\s*(Drink|Fresh|Snack)\s+(?!Cooler|Food|Rack)(.+\s+\d+\s+\d+\s*/\s*\d+\s+[\d.]+\s+None)\s*$"
    )
    # Slot keyword line: Cooler-, Food-, Rack- (with optional directly-attached slot number)
    keyword_re = re.compile(r"^\s*(Cooler|Food|Rack)\s*-\s*([\d]+(?:-[\d]+)*)?\s*")
    # Standalone slot number: "3-7", "5-3", "1-2 Bottle" (extracts digits before any text)
    slot_number_re = re.compile(r"^\s*([\d]+(?:-[\d]+)*)\b")

    lines = text.split("\n")
    result = []
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()
        m = compound_item_re.match(stripped)

        if m:
            prefix_word = m.group(1)   # "Drink", "Fresh", or "Snack"
            rest = m.group(2)          # "Product... qty inv/par price None"

            # Look ahead for keyword suffix (Cooler/Food/Rack) and slot number
            keyword = None
            slot_num = None
            j = i + 1
            lookahead_limit = min(i + 6, len(lines))

            while j < lookahead_limit:
                next_stripped = lines[j].strip()
                if not next_stripped:
                    j += 1
                    continue
                # Stop if we hit another compound item, machine header, or regular item
                if compound_item_re.match(next_stripped):
                    break
                if "|" in next_stripped and "ID:" in next_stripped:
                    break

                # Look for keyword (Cooler/Food/Rack)
                km = keyword_re.match(next_stripped)
                if km and not keyword:
                    keyword = km.group(1)
                    if km.group(2):  # Slot number directly attached: "Cooler-3-7"
                        slot_num = km.group(2)
                    j += 1
                    if keyword and slot_num:
                        break
                    continue

                # Look for slot number on its own line: "3-7", "1-2 Bottle"
                sm = slot_number_re.match(next_stripped)
                if sm and keyword and not slot_num:
                    slot_num = sm.group(1)
                    j += 1
                    break

                j += 1

            if keyword and slot_num:
                full_slot = f"{prefix_word} {keyword}-{slot_num}"
                reassembled = f"{full_slot} {rest}"
                result.append(reassembled)
                i = j
            else:
                # Couldn't find suffix — preserve original line
                result.append(lines[i])
                i += 1
        else:
            result.append(lines[i])
            i += 1

    return "\n".join(result)


# What one line of the report turned out to be.
#
# Kept explicit because two different pieces of code used to infer this from "did an
# item come out of that line?" — and a slot that is ALREADY FULL produces no item,
# which is not remotely the same thing as a line we could not read. That disagreement
# put a red "could not be parsed" popup in front of the driver for every full slot on
# his route, which is exactly how a warning channel stops being believed.
_EMITTED = "emitted"                 # a real pick — it goes on the truck
_NOTHING_TO_STOCK = "nothing-to-stock"   # read fine, quantity 0, nothing to bring
_UNREADABLE = "unreadable"           # genuinely could not make sense of it — tell him


def parse_route_pdf(text: str, delivery_date: str) -> dict:
    """
    Parse extracted PDF text into structured route data.

    Returns:
        {
            "route_name": str,
            "delivery_date": str,
            "locations": [
                {
                    "location_name": str,
                    "machines": [
                        {
                            "machine_name": str,
                            "asset_number": int,
                            "items": [
                                {
                                    "product_name": str,
                                    "quantity": int,
                                    "slot": str,
                                    "inventory_current": int,
                                    "inventory_parlevel": int,
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    """
    # Step 1: Remove page break junk
    text = re.sub(r"https://[^\s]+", " ", text)
    text = re.sub(r"\d{1,2}/\d{1,2}/\d{2},?\s*\d{1,2}:\d{2}\s*(AM|PM)", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"Page\s+\d+\s+of\s+\d+", " ", text, flags=re.IGNORECASE)

    # Step 1.5: Reassemble compound slot names split by pdfplumber
    text = _reassemble_compound_slots(text)

    # Step 2: Find all machine headers
    header_pattern = re.compile(
        r"([A-Za-z]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*[^|]+\s*\|\s*ID:\s*(\w+)"
    )

    headers = []
    for match in header_pattern.finditer(text):
        headers.append({
            "index": match.start(),
            "end_index": match.end(),
            "route": match.group(1).strip(),
            "location": match.group(2).strip(),
            "machine": match.group(3).strip(),
            "id": match.group(4),
        })

    if not headers:
        return {"route_name": "", "delivery_date": delivery_date, "locations": []}

    route_name = ""
    locations: dict[str, dict] = {}

    # Slot identifier pattern (reused in multiple regexes)
    _slot = r"(0?\d{1,3}|[A-Z]\d{1,2}|Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)"

    # Complete item row: slot + product + qty + inventory + price + None
    item_row_pattern = re.compile(
        rf"^\s*{_slot}\s+(.+)\s+(\d+)\s+(\d+)\s*/\s*(\d+)\s+([\d.]+)\s+None\s*$"
    )

    # Reversed item row (page break): slot + qty + inventory + price + None + product
    # Happens when page break puts numbers on one page and product name on the next
    reversed_item_pattern = re.compile(
        rf"^\s*{_slot}\s+(\d+)\s+(\d+)\s*/\s*(\d+)\s+([\d.]+)\s+None\s+(.+)$"
    )

    # Partial: line starts with a slot number (used to detect multi-line items)
    slot_start_pattern = re.compile(rf"^\s*{_slot}\s")

    # Detect product-fragment false alarms (e.g. "20 oz - Bottle", "17 oz - Can")
    _fragment_pattern = re.compile(r"^\d+\s*oz\b", re.IGNORECASE)

    warnings: list[str] = []

    def _try_emit_item(text_to_match: str, target_machine: dict) -> str:
        """Read one report line and say what it was.

        Returns _EMITTED, _NOTHING_TO_STOCK, or _UNREADABLE. Callers must take this
        answer as given and never re-derive it from whether an item appeared — that
        second guess is the bug this function exists to remove.
        """
        # Two layouts: the normal one, and the page-break casualty where the numbers
        # land on one page and the product name on the next.
        for pattern, reversed_order in ((item_row_pattern, False), (reversed_item_pattern, True)):
            m = pattern.match(text_to_match)
            if not m:
                continue

            slot = m.group(1).strip()
            if reversed_order:
                quantity = int(m.group(2))
                inventory_current = int(m.group(3))
                inventory_parlevel = int(m.group(4))
                product_name = m.group(6).strip()
            else:
                product_name = m.group(2).strip()
                quantity = int(m.group(3))
                inventory_current = int(m.group(4))
                inventory_parlevel = int(m.group(5))

            looks_like_a_product = bool(
                re.search(r"[a-zA-Z]", product_name) and 2 < len(product_name) < 150
            )
            if not looks_like_a_product:
                # Try the other layout; if that fails too this really is damage.
                continue

            if quantity <= 0:
                # The slot is already at par. There is nothing to bring and nothing
                # wrong — do not manufacture a warning out of it.
                return _NOTHING_TO_STOCK

            target_machine["items"].append({
                "product_name": product_name,
                "quantity": quantity,
                "slot": slot,
                "inventory_current": inventory_current,
                "inventory_parlevel": inventory_parlevel,
            })
            return _EMITTED

        return _UNREADABLE

    def _is_product_fragment(text: str) -> bool:
        """Check if text is just a trailing product description (e.g. '20 oz - Bottle')."""
        return bool(_fragment_pattern.match(text.strip()))

    # Step 3: Process each machine section
    for h, header in enumerate(headers):
        next_index = headers[h + 1]["index"] if h + 1 < len(headers) else len(text)
        section_text = text[header["end_index"]:next_index]

        route_name = header["route"]
        location_name = header["location"]

        # Parse machine name and asset number
        asset_match = re.match(r"(.+?)\s*\((\d+)\)", header["machine"])
        if asset_match:
            machine_name = asset_match.group(1).strip()
            asset_number = int(asset_match.group(2))
        else:
            machine_name = header["machine"]
            asset_number = 0

        if location_name not in locations:
            locations[location_name] = {
                "location_name": location_name,
                "machines": [],
            }

        machine = {
            "machine_name": machine_name,
            "asset_number": asset_number,
            "items": [],
        }

        # Parse with multi-line accumulation for items split across page breaks
        lines = section_text.split("\n")
        pending_line = ""

        for line in lines:
            line = line.strip()
            if not line:
                continue

            is_slot_start = slot_start_pattern.match(line)

            if is_slot_start:
                # New slot starting — flush any accumulated partial
                if pending_line:
                    if _try_emit_item(pending_line, machine) == _UNREADABLE:
                        if not _is_product_fragment(pending_line):
                            warnings.append(
                                f"{machine_name}: slot {slot_start_pattern.match(pending_line).group(1)} could not be parsed"
                            )
                    pending_line = ""

                # Try complete single-line match (fast path — most items).
                # A full slot counts as handled: it was read correctly, it just has
                # nothing to bring. Leaving it pending would glue it onto the next line.
                if _try_emit_item(line, machine) != _UNREADABLE:
                    continue

                # Incomplete — start accumulating (page break or line wrap)
                pending_line = line

            elif pending_line:
                # Continuation of a multi-line item — append and retry
                pending_line = pending_line + " " + line
                if _try_emit_item(pending_line, machine) != _UNREADABLE:
                    pending_line = ""
            # else: not a slot start and nothing pending — skip (headers, labels, etc.)

        # Flush any remaining accumulated text at end of section
        if pending_line:
            if _try_emit_item(pending_line, machine) == _UNREADABLE:
                if not _is_product_fragment(pending_line):
                    warnings.append(
                        f"{machine_name}: slot {slot_start_pattern.match(pending_line).group(1)} could not be parsed"
                    )

        # Skip machines with 0 items
        if machine["items"]:
            locations[location_name]["machines"].append(machine)

    return {
        "route_name": route_name,
        "delivery_date": delivery_date,
        "locations": list(locations.values()),
        "warnings": warnings,
    }
