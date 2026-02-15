"""
Product parsing, TTS pronunciation fixes, slot formatting, and voice/display text generation.

Ported from:
  - workflows/fixes/get_next_item_format_output_add_machine_id.js
  - workflows/fixes/start_machine_format_output_FIXED.js
"""

import re


def parse_product(product_name: str | None) -> dict:
    """Split product name into {name, size, type} components."""
    if not product_name:
        return {"name": "", "size": "", "type": ""}

    text = product_name.strip()

    # Extract size (numbers + oz/ml/g/ct/pk/count)
    size_pattern = re.compile(
        r"(\d+(?:\.\d+)?)\s*(oz|ounce|ml|g|gram|ct|count|pk|pack)", re.IGNORECASE
    )
    size_match = size_pattern.search(text)
    size = size_match.group(0) if size_match else ""

    # Extract type (Can/Bottle/Bag/Box/Bar/Pouch/Packet/Pack)
    type_pattern = re.compile(
        r"\b(can|bottle|bag|box|bar|pouch|packet|pack)\b", re.IGNORECASE
    )
    type_match = type_pattern.search(text)
    item_type = type_match.group(0) if type_match else ""

    # Remove size and type from name to get base product
    name = text
    if size:
        name = size_pattern.sub("", name).strip()
    if item_type:
        type_word = type_match.group(0)
        # Remove if at the end or followed by size/quantity
        name = re.sub(rf"\s*{re.escape(type_word)}\s*$", "", name, flags=re.IGNORECASE)
        name = re.sub(rf"\s*{re.escape(type_word)}\s*-", " -", name, flags=re.IGNORECASE)

    # Clean up extra whitespace, dashes, parentheses
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"\s*-\s*$", "", name).strip()
    name = re.sub(r"\(\s*\)", "", name).strip()

    return {"name": name, "size": size, "type": item_type}


def fix_pronunciation(text: str | None) -> str | None:
    """Fix TTS pronunciation issues."""
    if not text:
        return text
    # Fix "Can" pronounced as "Kahn"
    text = re.sub(r"\bCan\b", "Kan", text)
    text = re.sub(r"\bCAN\b", "KAN", text)
    # Fix abbreviations
    text = re.sub(r"\boz\b", "ounce", text, flags=re.IGNORECASE)
    text = re.sub(r"\bct\b", "count", text, flags=re.IGNORECASE)
    text = re.sub(r"\bpk\b", "pack", text, flags=re.IGNORECASE)
    return text


def format_slot_for_tts(slot: str | None) -> str | None:
    """Format slot for TTS: '5' -> 'slot 5', '3-4' -> 'slots 3 and 4', '1 to 3' -> 'slots 1 to 3'."""
    if not slot:
        return None
    slot = str(slot)

    # Handle combined slots: "1 to 3" (from _combine_same_product_items)
    if " to " in slot:
        return f"slots {slot}"

    # Handle dash range: "3-4"
    if "-" in slot:
        parts = slot.split("-")
        try:
            first = int(parts[0])
            second = int(parts[1])
            return f"slots {first} and {second}"
        except (ValueError, IndexError):
            return slot

    # Handle single slot: "5"
    try:
        num = int(slot)
        return f"slot {num}"
    except ValueError:
        return slot


def _build_item_voice_parts(parsed: dict, quantity: int) -> str:
    """Build voice text parts for a single item: 'Product size type.... X count'."""
    parts = []
    if parsed["name"]:
        parts.append(fix_pronunciation(parsed["name"]))
    if parsed["size"]:
        parts.append(fix_pronunciation(parsed["size"]))
    if (
        parsed["type"]
        and parsed["name"].lower().find(parsed["type"].lower()) == -1
    ):
        parts.append(fix_pronunciation(parsed["type"]))
    parts.append(f".... {quantity} count")
    return " ".join(parts)


def generate_spoken_next_item(data: dict, parsed: dict, parsed2: dict | None) -> str:
    """
    Generate voice text for get_next_item action='next_item'.
    Includes last-item notification prefix when items_remaining == 0.
    """
    # Check if this is the last item(s) in the machine
    items_remaining = data.get("items_remaining", 0)
    is_last = (items_remaining == 0)

    # Build prefix based on HOW MANY ITEMS ARE DISPLAYED (not mode)
    prefix = ""
    if is_last:
        if parsed2:  # 2 items displayed
            prefix = "These are the last 2 items. "
        else:  # 1 item displayed
            prefix = "This is the last item. "

    # Build item voice text
    if data.get("product_name2") and parsed2:
        item1_text = _build_item_voice_parts(parsed, data["quantity"])
        item2_text = _build_item_voice_parts(parsed2, data["quantity2"])
        return f"{prefix}{item1_text}, {item2_text}"
    else:
        return f"{prefix}{_build_item_voice_parts(parsed, data["quantity"])}"


def generate_spoken_next_machine(data: dict) -> str:
    """Generate voice text for get_next_item action='next_machine'."""
    returning = data.get("returning_to_skipped", False)
    completed = data.get("completed_machine", "")
    next_m = data.get("next_machine", "")
    next_loc = data.get("next_location", "")

    if returning:
        return f"{completed} complete. Going back to skipped machine {next_m} at {next_loc}. Top or bottom?"
    else:
        return f"{completed} complete. Next is {next_m} at {next_loc}. Top or bottom?"


def generate_spoken_complete(data: dict) -> str:
    """Generate voice text for get_next_item action='complete'."""
    completed_route = data.get("completed_route", "Route")
    return f"{completed_route} route complete. Nice work!"


def generate_display_text(data: dict, parsed: dict, parsed2: dict | None) -> str | None:
    """Generate display text for next_item action."""
    if data.get("action") != "next_item":
        return None

    if data.get("product_name2") and parsed2:
        item1 = parsed["name"]
        if parsed["size"]:
            item1 += f" ({parsed['size']})"
        item1 += f" X {data['quantity']}"

        item2 = parsed2["name"]
        if parsed2["size"]:
            item2 += f" ({parsed2['size']})"
        item2 += f" X {data['quantity2']}"

        return f"{item1}, {item2}"
    else:
        item = parsed["name"]
        if parsed["size"]:
            item += f" ({parsed['size']})"
        item += f" X {data['quantity']}"
        return item


def generate_start_machine_voice(
    direction: str, parsed: dict, quantity: int, parsed2: dict | None = None, quantity2: int | None = None
) -> str:
    """Generate voice text for start_machine."""
    direction_prefix = "Starting from bottom. " if direction == "reverse" else "Starting from top. "

    if parsed2 and quantity2:
        item1_text = _build_item_voice_parts(parsed, quantity)
        item2_text = _build_item_voice_parts(parsed2, quantity2)
        return f"{direction_prefix}{item1_text}, {item2_text}"
    else:
        return f"{direction_prefix}{_build_item_voice_parts(parsed, quantity)}"


def generate_start_machine_display(
    direction: str, parsed: dict, quantity: int, parsed2: dict | None = None, quantity2: int | None = None
) -> str:
    """Generate display text for start_machine."""
    direction_prefix = "Starting from bottom. " if direction == "reverse" else "Starting from top. "

    item = parsed["name"]
    if parsed["size"]:
        item += f" ({parsed['size']})"
    item += f" X {quantity}"

    if parsed2 and quantity2:
        item2 = parsed2["name"]
        if parsed2["size"]:
            item2 += f" ({parsed2['size']})"
        item2 += f" X {quantity2}"
        return f"{direction_prefix}{item}, {item2}"
    else:
        return f"{direction_prefix}{item}"


def format_item_for_response(
    product_name: str, quantity: int, slot: str | None, slot_spoken: str | None,
    inventory_current: int, inventory_parlevel: int, parsed: dict
) -> dict:
    """Build the item object for API response (used by item1/item2)."""
    return {
        "product_name": product_name,
        "quantity": quantity,
        "slot": slot,
        "slot_spoken": format_slot_for_tts(slot) if not slot_spoken else slot_spoken,
        "inventory_current": inventory_current or 0,
        "inventory_parlevel": inventory_parlevel or 0,
        "product_parsed": {
            "name": parsed["name"],
            "size": parsed["size"],
            "type": parsed["type"],
        },
    }
