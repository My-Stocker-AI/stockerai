"""Unit tests for formatting service — product parsing, TTS, slot formatting, voice text."""

from app.services.formatting import (
    parse_product,
    fix_pronunciation,
    format_slot_for_tts,
    generate_spoken_next_item,
    generate_spoken_next_machine,
    generate_spoken_complete,
    generate_display_text,
    generate_start_machine_voice,
    generate_start_machine_display,
    format_item_for_response,
)


# ─── parse_product ────────────────────────────────────────────────────────────


class TestParseProduct:
    def test_basic_product_with_size(self):
        result = parse_product("Coca Cola 12oz Can")
        assert result["name"] == "Coca Cola"
        assert result["size"] == "12oz"
        assert result["type"].lower() == "can"

    def test_product_no_size(self):
        result = parse_product("Snickers Bar")
        assert result["name"] == "Snickers"
        assert result["size"] == ""
        assert result["type"].lower() == "bar"

    def test_product_with_decimal_size(self):
        result = parse_product("Water 16.9oz Bottle")
        assert result["size"] == "16.9oz"
        assert result["type"].lower() == "bottle"

    def test_none_input(self):
        result = parse_product(None)
        assert result == {"name": "", "size": "", "type": ""}

    def test_empty_string(self):
        result = parse_product("")
        assert result == {"name": "", "size": "", "type": ""}

    def test_product_with_ct(self):
        result = parse_product("Gum 5ct Pack")
        assert result["size"] == "5ct"
        assert result["type"].lower() == "pack"

    def test_product_with_pk(self):
        result = parse_product("Crackers 6pk Box")
        assert result["size"] == "6pk"
        assert result["type"].lower() == "box"

    def test_plain_product(self):
        result = parse_product("Doritos Nacho Cheese")
        assert result["name"] == "Doritos Nacho Cheese"
        assert result["size"] == ""
        assert result["type"] == ""


# ─── fix_pronunciation ────────────────────────────────────────────────────────


class TestFixPronunciation:
    def test_can_to_kan(self):
        assert fix_pronunciation("Can") == "Kan"
        assert fix_pronunciation("CAN") == "KAN"

    def test_oz_to_ounce(self):
        # \b only matches word boundaries — "oz" must be standalone
        assert fix_pronunciation("12 oz") == "12 ounce"
        assert fix_pronunciation("12oz") == "12oz"  # no word boundary between digit and letter

    def test_ct_to_count(self):
        assert fix_pronunciation("5 ct") == "5 count"
        assert fix_pronunciation("5ct") == "5ct"  # no word boundary

    def test_pk_to_pack(self):
        assert fix_pronunciation("6 pk") == "6 pack"
        assert fix_pronunciation("6pk") == "6pk"  # no word boundary

    def test_none_input(self):
        assert fix_pronunciation(None) is None

    def test_no_changes_needed(self):
        assert fix_pronunciation("Doritos") == "Doritos"


# ─── format_slot_for_tts ─────────────────────────────────────────────────────


class TestFormatSlotForTTS:
    def test_numeric_slot(self):
        assert format_slot_for_tts("5") == "slot 5"

    def test_range_slot(self):
        assert format_slot_for_tts("3-4") == "slots 3 and 4"

    def test_alpha_numeric_slot(self):
        assert format_slot_for_tts("A1") == "A1"

    def test_none_input(self):
        assert format_slot_for_tts(None) is None

    def test_integer_input(self):
        assert format_slot_for_tts(5) == "slot 5"


# ─── generate_spoken_next_item ────────────────────────────────────────────────


class TestGenerateSpokenNextItem:
    def test_single_item(self):
        data = {"product_name": "Coca Cola", "quantity": 3}
        parsed = {"name": "Coca Cola", "size": "", "type": ""}
        result = generate_spoken_next_item(data, parsed, None)
        assert "Coca Cola" in result
        assert "3 count" in result

    def test_single_item_with_size(self):
        data = {"product_name": "Coca Cola 12oz Can", "quantity": 3}
        parsed = {"name": "Coca Cola", "size": "12oz", "type": "Can"}
        result = generate_spoken_next_item(data, parsed, None)
        assert "Coca Cola" in result
        assert "12oz" in result  # \b doesn't match digit-letter boundary
        assert "3 count" in result

    def test_two_items(self):
        data = {
            "product_name": "Coca Cola", "quantity": 3,
            "product_name2": "Pepsi", "quantity2": 2,
        }
        parsed = {"name": "Coca Cola", "size": "", "type": ""}
        parsed2 = {"name": "Pepsi", "size": "", "type": ""}
        result = generate_spoken_next_item(data, parsed, parsed2)
        assert "Coca Cola" in result
        assert "Pepsi" in result
        assert "3 count" in result
        assert "2 count" in result


# ─── generate_spoken_next_machine ─────────────────────────────────────────────


class TestGenerateSpokenNextMachine:
    def test_normal_transition(self):
        data = {
            "completed_machine": "Machine 1",
            "next_machine": "Machine 2",
            "next_location": "Building A",
        }
        result = generate_spoken_next_machine(data)
        assert "Machine 1 complete" in result
        assert "Machine 2" in result
        assert "Building A" in result
        assert "Top or bottom?" in result

    def test_returning_to_skipped(self):
        data = {
            "completed_machine": "Machine 3",
            "next_machine": "Machine 1",
            "next_location": "Building B",
            "returning_to_skipped": True,
        }
        result = generate_spoken_next_machine(data)
        assert "Going back to skipped" in result
        assert "Machine 1" in result


# ─── generate_spoken_complete ─────────────────────────────────────────────────


class TestGenerateSpokenComplete:
    def test_route_complete(self):
        result = generate_spoken_complete({"completed_route": "Route A"})
        assert "Route A" in result
        assert "complete" in result
        assert "Nice work" in result


# ─── generate_display_text ────────────────────────────────────────────────────


class TestGenerateDisplayText:
    def test_single_item(self):
        data = {"action": "next_item", "quantity": 3}
        parsed = {"name": "Coca Cola", "size": "12oz", "type": ""}
        result = generate_display_text(data, parsed, None)
        assert "Coca Cola (12oz) X 3" == result

    def test_non_next_item(self):
        data = {"action": "next_machine"}
        result = generate_display_text(data, {}, None)
        assert result is None


# ─── generate_start_machine_voice ─────────────────────────────────────────────


class TestGenerateStartMachineVoice:
    def test_forward(self):
        parsed = {"name": "Coca Cola", "size": "", "type": ""}
        result = generate_start_machine_voice("forward", parsed, 3)
        assert result.startswith("Starting from top.")
        assert "3 count" in result

    def test_reverse(self):
        parsed = {"name": "Water", "size": "16.9oz", "type": "Bottle"}
        result = generate_start_machine_voice("reverse", parsed, 5)
        assert result.startswith("Starting from bottom.")
        assert "5 count" in result


# ─── format_item_for_response ─────────────────────────────────────────────────


class TestFormatItemForResponse:
    def test_basic_item(self):
        parsed = {"name": "Coca Cola", "size": "12oz", "type": "Can"}
        result = format_item_for_response(
            product_name="Coca Cola 12oz Can",
            quantity=3,
            slot="5",
            slot_spoken=None,
            inventory_current=10,
            inventory_parlevel=20,
            parsed=parsed,
        )
        assert result["product_name"] == "Coca Cola 12oz Can"
        assert result["quantity"] == 3
        assert result["slot"] == "5"
        assert result["slot_spoken"] == "slot 5"
        assert result["inventory_current"] == 10
        assert result["inventory_parlevel"] == 20
        assert result["product_parsed"]["name"] == "Coca Cola"
