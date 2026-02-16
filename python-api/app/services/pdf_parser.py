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

    def _try_emit_item(text_to_match: str, target_machine: dict) -> bool:
        """Try to match text as a complete item row (normal or reversed). Returns True if successful."""
        # Normal order: slot product qty inv/par price None
        m = item_row_pattern.match(text_to_match)
        if m:
            slot = m.group(1).strip()
            product_name = m.group(2).strip()
            quantity = int(m.group(3))
            inventory_current = int(m.group(4))
            inventory_parlevel = int(m.group(5))
            if (
                re.search(r"[a-zA-Z]", product_name)
                and quantity > 0
                and 2 < len(product_name) < 150
            ):
                target_machine["items"].append({
                    "product_name": product_name,
                    "quantity": quantity,
                    "slot": slot,
                    "inventory_current": inventory_current,
                    "inventory_parlevel": inventory_parlevel,
                })
                return True

        # Reversed order: slot qty inv/par price None product (page-break casualty)
        m = reversed_item_pattern.match(text_to_match)
        if m:
            slot = m.group(1).strip()
            quantity = int(m.group(2))
            inventory_current = int(m.group(3))
            inventory_parlevel = int(m.group(4))
            product_name = m.group(6).strip()
            if (
                re.search(r"[a-zA-Z]", product_name)
                and quantity > 0
                and 2 < len(product_name) < 150
            ):
                target_machine["items"].append({
                    "product_name": product_name,
                    "quantity": quantity,
                    "slot": slot,
                    "inventory_current": inventory_current,
                    "inventory_parlevel": inventory_parlevel,
                })
                return True

        return False

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
                    if not _try_emit_item(pending_line, machine):
                        if not _is_product_fragment(pending_line):
                            warnings.append(
                                f"{machine_name}: slot {slot_start_pattern.match(pending_line).group(1)} could not be parsed"
                            )
                    pending_line = ""

                # Try complete single-line match (fast path — most items)
                if _try_emit_item(line, machine):
                    continue

                # Incomplete — start accumulating (page break or line wrap)
                pending_line = line

            elif pending_line:
                # Continuation of a multi-line item — append and retry
                pending_line = pending_line + " " + line
                if _try_emit_item(pending_line, machine):
                    pending_line = ""
            # else: not a slot start and nothing pending — skip (headers, labels, etc.)

        # Flush any remaining accumulated text at end of section
        if pending_line:
            if not _try_emit_item(pending_line, machine):
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
