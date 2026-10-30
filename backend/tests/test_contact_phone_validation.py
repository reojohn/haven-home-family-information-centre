"""No database operations: validates the ContactIn schema independently."""
import pytest
from pydantic import ValidationError
from app.main import ContactIn


@pytest.mark.parametrize('number', [
    '000-000-1013', '000-000-0000', '11111111111', '123', 'not a number',
    '++63 917 123 4567'
])
def test_reject_placeholder_numbers(number):
    with pytest.raises(ValidationError):
        ContactIn(name='Example', phone=number)


@pytest.mark.parametrize('number', ['0917 123 4567', '+63 917 123 4567', '202-555-0123'])
def test_accept_normal_numbers(number):
    assert ContactIn(name='Example', phone=number).phone == number
