"""Unit tests for PDF text parser."""

from app.services.pdf_parser import parse_route_pdf


SAMPLE_PDF_TEXT = """
Some header text
https://example.com/pdf 2/10/26, 8:30 AM Page 1 of 3

TestRoute | Building A | Snack Machine (12345) | Col1 | ID: abc123

01 Doritos Nacho Cheese 5 8/15 1.50 None
02 Coca Cola 12oz Can 3 10/20 1.75 None
03 Snickers Bar 4 6/12 2.00 None

TestRoute | Building B | Drink Cooler (67890) | Col1 | ID: def456

01 Water 16.9oz Bottle 6 12/24 1.25 None
02 Pepsi 12oz Can 2 5/10 1.50 None
"""

EMPTY_MACHINE_TEXT = """
TestRoute | Building C | Empty Machine (99999) | Col1 | ID: ghi789

No items in this section.

TestRoute | Building D | Good Machine (11111) | Col1 | ID: jkl012

01 Chips 3 5/10 1.00 None
"""


class TestParseRoutePdf:
    def test_basic_parsing(self):
        result = parse_route_pdf(SAMPLE_PDF_TEXT, "2026-02-10")
        assert result["route_name"] == "TestRoute"
        assert result["delivery_date"] == "2026-02-10"
        assert len(result["locations"]) == 2  # Building A and B

    def test_machine_items(self):
        result = parse_route_pdf(SAMPLE_PDF_TEXT, "2026-02-10")
        # Find Building A location
        building_a = next(l for l in result["locations"] if l["location_name"] == "Building A")
        assert len(building_a["machines"]) == 1
        machine = building_a["machines"][0]
        assert machine["machine_name"] == "Snack Machine"
        assert machine["asset_number"] == 12345
        assert len(machine["items"]) == 3

    def test_item_fields(self):
        result = parse_route_pdf(SAMPLE_PDF_TEXT, "2026-02-10")
        building_a = next(l for l in result["locations"] if l["location_name"] == "Building A")
        item = building_a["machines"][0]["items"][0]
        assert item["product_name"] == "Doritos Nacho Cheese"
        assert item["quantity"] == 5
        assert item["slot"] == "01"
        assert item["inventory_current"] == 8
        assert item["inventory_parlevel"] == 15

    def test_skips_empty_machines(self):
        result = parse_route_pdf(EMPTY_MACHINE_TEXT, "2026-02-10")
        # Empty Machine should be skipped, only Good Machine included
        all_machines = []
        for loc in result["locations"]:
            all_machines.extend(loc["machines"])
        machine_names = [m["machine_name"] for m in all_machines]
        assert "Empty Machine" not in machine_names
        assert "Good Machine" in machine_names

    def test_removes_page_junk(self):
        result = parse_route_pdf(SAMPLE_PDF_TEXT, "2026-02-10")
        # Should parse correctly despite URLs and page numbers in text
        assert result["route_name"] == "TestRoute"
        total_items = sum(
            len(m["items"]) for loc in result["locations"] for m in loc["machines"]
        )
        assert total_items == 5  # 3 + 2

    def test_empty_text(self):
        result = parse_route_pdf("", "2026-02-10")
        assert result["route_name"] == ""
        assert result["locations"] == []

    def test_no_headers(self):
        result = parse_route_pdf("just some random text without headers", "2026-02-10")
        assert result["route_name"] == ""
        assert result["locations"] == []


# ── 2026-08-06: found live, on Davy's first upload of the session ──────────────────────────
#
# He uploaded his real South route and got "Upload complete — 5 item(s) skipped … formatting
# issues". The upload had in fact worked and the data was clean, which is the worst kind of
# error message: it makes a working result look broken. Two separate causes hid behind it.

def test_a_full_slot_is_not_a_formatting_error():
    """Quantity 0 means the slot is already full. Nothing to carry, nothing to pick — and
    nothing wrong with his paperwork.

    `quantity > 0` used to sit inside the match condition, so a full slot fell through every
    pattern and was reported to the operator as a formatting problem. Davy hit it on two slots
    of a route that parsed perfectly. A full slot is the most ordinary thing on a route."""
    text = (
        "TestRoute | Test Site | Snack Machine (12345) | Col1 | ID: abc123\n"
        "\n"
        "029 Cheetos Crunchy LSS 2 oz 0 0 / 12 1.50 None\n"
        "030 Twix Caramel Cookie Bar 1.79 oz 9 6 / 15 1.75 None\n"
    )
    result = parse_route_pdf(text, "2026-08-07")
    items = [i for loc in result["locations"] for m in loc["machines"] for i in m["items"]]

    assert result["warnings"] == [], f"a full slot must not be reported as a defect: {result['warnings']}"
    slots = {i["slot"] for i in items}
    assert "030" in slots, "the row with stock to carry must still be picked up"
    assert "029" not in slots, "a full slot creates no pick — there is nothing to carry"


def test_a_note_in_the_last_column_does_not_delete_the_item():
    """The last column normally reads "None". When the operator writes a real note there, the
    row must still be read — the note is ignored, the stocking work is kept.

    Three rows on Davy's route read e.g. "… 3.00 Remove Monster Green Can 16 oz", a comment
    added AFTER the route was delivered. Each row still had 1 item to fill. The old patterns
    demanded the word "None", so all three rows were discarded — a comment about the machine
    silently deleted real work from the driver's route."""
    text = (
        "TestRoute | Test Site | Snack Machine (12345) | Col1 | ID: abc123\n"
        "\n"
        "044 Mountain Dew Can 12 oz - Can 1 0 / 6 3.00 Remove Monster Green Can 16 oz\n"
        "045 Coke Zero Can 12 oz - Can 1 5 / 6 1.50 None\n"
    )
    result = parse_route_pdf(text, "2026-08-07")
    items = {i["slot"]: i for loc in result["locations"] for m in loc["machines"] for i in m["items"]}

    assert result["warnings"] == [], f"a note is not a defect: {result['warnings']}"
    assert "044" in items, "the note must not take the item with it"
    assert items["044"]["product_name"] == "Mountain Dew Can 12 oz - Can", \
        "the note must not leak into the product name the driver hears"
    assert items["044"]["quantity"] == 1
    assert "045" in items, "ordinary rows must be untouched"
