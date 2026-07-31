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

    def test_slot_already_full_is_not_reported_as_damage(self):
        """A slot at par needs nothing brought, so the report lists it with quantity 0.

        That is a normal line, correctly read. Before 2026-07-30 the parser skipped it
        (right) and then a second piece of code saw "no item came out of that line" and
        recorded it as unreadable (wrong) — so the driver got a red popup claiming his
        report had formatting damage. On a real route that fires for every full slot,
        which trains him to ignore the one warning that ever matters.
        """
        text = """
TestRoute | Building A | Snack Machine (12345) | Col1 | ID: abc123

01 Doritos Nacho Cheese 5 8/15 1.50 None
02 Coca Cola 12oz Can 0 20/20 1.75 None
03 Snickers Bar 4 6/12 2.00 None
04 Water Bottle 0 24/24 1.25 None
05 Pepsi 12oz Can 2 5/10 1.50 None
"""
        result = parse_route_pdf(text, "2026-07-30")
        machine = result["locations"][0]["machines"][0]

        # He is asked to pick only what actually has to go on the truck.
        assert [i["slot"] for i in machine["items"]] == ["01", "03", "05"]

        # And he is told nothing is wrong, because nothing is.
        assert result["warnings"] == []

    def test_a_line_that_really_is_damaged_still_warns(self):
        """The fix must not buy silence by suppressing every warning."""
        # Slot 02's product name came through as punctuation — the line really is damaged
        # and he needs to know a product is missing from his pick.
        text = """
TestRoute | Building A | Snack Machine (12345) | Col1 | ID: abc123

01 Doritos Nacho Cheese 5 8/15 1.50 None
02 ## 3 5/10 1.00 None
03 Snickers Bar 4 6/12 2.00 None
"""
        result = parse_route_pdf(text, "2026-07-30")
        machine = result["locations"][0]["machines"][0]

        assert [i["slot"] for i in machine["items"]] == ["01", "03"]
        assert len(result["warnings"]) == 1
        assert "02" in result["warnings"][0]

    def test_a_full_slot_does_not_swallow_the_line_after_it(self):
        """The skipped line must not be left half-open and glued onto the next one."""
        text = """
TestRoute | Building A | Snack Machine (12345) | Col1 | ID: abc123

01 Coca Cola 12oz Can 0 20/20 1.75 None
02 Snickers Bar 4 6/12 2.00 None
"""
        result = parse_route_pdf(text, "2026-07-30")
        machine = result["locations"][0]["machines"][0]

        assert len(machine["items"]) == 1
        assert machine["items"][0]["product_name"] == "Snickers Bar"
        assert machine["items"][0]["quantity"] == 4
        assert result["warnings"] == []

    def test_no_headers(self):
        result = parse_route_pdf("just some random text without headers", "2026-02-10")
        assert result["route_name"] == ""
        assert result["locations"] == []
