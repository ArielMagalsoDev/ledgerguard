from ledgerguard.money import add_cents, cents_diff, cents_to_decimal_string, parse_decimal_to_cents


def test_parse_decimal_to_cents():
    assert parse_decimal_to_cents("842.40") == 84240
    assert parse_decimal_to_cents("0") == 0
    assert parse_decimal_to_cents("-12.5") == -1250
    assert parse_decimal_to_cents("1240") == 124000
    assert parse_decimal_to_cents(None) is None
    assert parse_decimal_to_cents("$12.00") is None
    assert parse_decimal_to_cents("12.005") is None


def test_cents_to_decimal_string():
    assert cents_to_decimal_string(84240) == "842.40"
    assert cents_to_decimal_string(0) == "0.00"
    assert cents_to_decimal_string(-1250) == "-12.50"


def test_add_and_diff():
    assert add_cents(100, 200, 300) == 600
    assert cents_diff(500, 300) == 200
    assert cents_diff(300, 500) == 200
