"""
PDF text parser for Canteen/Compass vending machine route PDFs.

Ported from: workflows/fixes/PARSE_PDF_TEXT_SLOT_BOUNDARY_FIX.js

Input: raw text extracted from PDF
Output: structured route data { route_name, delivery_date, locations: [...] }
"""

import re
from PyPDF2 import PdfReader
import io


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF binary data."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
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

    # Item row pattern
    item_row_pattern = re.compile(
        r"^\s*(0?\d{1,3}|[A-Z]\d{1,2}|Drink Cooler[\d-]+|Fresh Food[\d-]+|Snack Rack[\s-]*(?:Small)?[\d-]+)"
        r"\s+(.+)\s+(\d+)\s+(\d+)\s*/\s*(\d+)\s+([\d.]+)\s+None\s*$"
    )

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

        # Parse line-by-line (CRITICAL: preserves slot boundaries)
        lines = section_text.split("\n")

        for line in lines:
            line = line.strip()
            if not line or len(line) < 10:
                continue

            item_match = item_row_pattern.match(line)
            if not item_match:
                continue

            slot = item_match.group(1).strip()
            product_name = item_match.group(2).strip()
            quantity = int(item_match.group(3))
            inventory_current = int(item_match.group(4))
            inventory_parlevel = int(item_match.group(5))

            # Validation
            if (
                re.search(r"[a-zA-Z]", product_name)
                and quantity > 0
                and 2 < len(product_name) < 150
            ):
                machine["items"].append({
                    "product_name": product_name,
                    "quantity": quantity,
                    "slot": slot,
                    "inventory_current": inventory_current,
                    "inventory_parlevel": inventory_parlevel,
                })

        # Skip machines with 0 items
        if machine["items"]:
            locations[location_name]["machines"].append(machine)

    return {
        "route_name": route_name,
        "delivery_date": delivery_date,
        "locations": list(locations.values()),
    }
