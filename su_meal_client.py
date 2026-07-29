"""
Stellenbosch University Student Meal Booking - API client.

Auth: CAS (sso.sun.ac.za) form login -> jsessionid cookie.
No MFA challenge observed on this service via direct POST (see caveat in README below).

Usage:
    Create a text file (e.g. credentials.txt) with two lines:
        27881741
        your_password_here
    python su_meal_client.py credentials.txt
"""

import os
import sys
import requests
from bs4 import BeautifulSoup

SERVICE_URL = "https://web-apps.sun.ac.za/student-meal-booking/shiro-cas"
LOGIN_URL = f"https://sso.sun.ac.za/login?service={SERVICE_URL}"
API_BASE = "https://web-apps.sun.ac.za/student-meal-booking/spring/api"


class SUMealClient:
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/152.0",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://web-apps.sun.ac.za/student-meal-booking/index.html",
        })
        self._authenticated = False

    # ---------- auth ----------

    def login(self):
        r = self.session.get(LOGIN_URL)
        soup = BeautifulSoup(r.text, "html.parser")
        lt_field = soup.find("input", {"name": "lt"})
        execution_field = soup.find("input", {"name": "execution"})
        if not lt_field or not execution_field:
            raise RuntimeError("Could not find CAS login ticket fields — page structure may have changed.")

        payload = {
            "username": self.username,
            "password": self.password,
            "lt": lt_field["value"],
            "execution": execution_field["value"],
            "_eventId": "submit",
        }
        r = self.session.post(LOGIN_URL, data=payload, allow_redirects=True)

        if "jsessionid" not in self.session.cookies.get_dict():
            raise RuntimeError(
                "Login did not yield a jsessionid cookie. This may mean an MFA "
                "challenge was triggered (not handled by this client) or credentials "
                "were rejected. Inspect r.url / r.text to see where you landed."
            )
        self._authenticated = True
        return r

    def _ensure_auth(self):
        if not self._authenticated:
            self.login()

    # ---------- read endpoints ----------

    def get_bookings(self, from_date: str, lang: str = "en"):
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/get-meal-bookings-dto/{lang}/{from_date}")
        r.raise_for_status()
        return r.json()

    def get_quota_summary(self, lang: str = "en"):
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/get-quota-summary/{lang}")
        r.raise_for_status()
        return r.json()

    def get_meal_slots(self, meal_date: str, lang: str = "en"):
        """Available meal slots (e.g. Breakfast/Lunch/Dinner) for a date."""
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/get-meal-slots-dto/{meal_date}/{lang}")
        r.raise_for_status()
        return r.json()

    def get_meal_facilities(self, meal_date: str, meal_slot: str, lang: str = "en"):
        """
        Available facilities (dining halls) for a date + slot (e.g. 'L' for lunch).
        Returns a list of {"code": str, "description": str}, e.g.
        {"code": "2", "description": "Helshoogte"}. code "0" is a "Select"
        placeholder shown in the UI dropdown, not a real facility.
        """
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/get-meal-slot-facilities/{lang}/{meal_date}/{meal_slot}")
        r.raise_for_status()
        return r.json()

    def get_meal_options(self, meal_date: str, meal_slot: str, facility_id: str, lang: str = "en"):
        """
        Available meal options (menu items) for a date + slot + facility.
        Returns a list of dicts:
            {"code": str, "description": str, "cost": "R54.83" or None,
             "sessionId": int, "sessionStart": "12:30", "sessionEnd": "13:30",
             "bookable": bool, "reason": str}
        code "0" ("Select") is a UI placeholder with bookable=False, not a
        real option. "code" here is what book_meal() expects as mealOption,
        and "sessionId" is what it expects as mealSession.
        """
        self._ensure_auth()
        r = self.session.get(
            f"{API_BASE}/get-meal-slot-facility-options/{lang}/{meal_date}/{meal_slot}/{facility_id}"
        )
        r.raise_for_status()
        return r.json()

    # ---------- write endpoints ----------

    def increase_quota(self, amount_cents: int, lang: str = "en"):
        """
        Request a booking quota increase. amount_cents is in cents (confirmed:
        50000 == R500, matching the quotaIncreaseDTO codes from get_quota_summary).

        This does NOT apply instantly. On success it returns
        {"success": True, "message": "Request submitted"} but balanceDesc /
        currentQuotaDesc are unchanged in an immediate get_quota_summary() call.
        Instead, quotaPendingMessage becomes "Quota request is pending" and the
        quotaIncreaseDTO/quotaDecreaseDTO lists collapse to a single
        {"code": 0, "amount": "R0"} placeholder until the pending request
        clears (observed ~10 minute cooldown before another request is
        accepted) — only call this again once quotaPendingMessage is None.
        """
        self._ensure_auth()
        r = self.session.get(f"{API_BASE}/increase-quota/{lang}/{amount_cents}")
        r.raise_for_status()
        return r.json()

    def book_meal(self, meal_date: str, meal_slot: str, meal_facility: str,
                   meal_option: str, meal_session: int,
                   exclude_weekends: bool = True, advance_booking_days: str = ""):
        """
        Book a meal. Field names/types match the captured request body exactly:
            advanceBookingDays: str (often empty)
            excludeWeekends: bool
            mealDate: "YYYY-MM-DD"
            mealFacility: str (facility id, e.g. "2")
            mealOption: str (menu option id, e.g. "34362")
            mealSession: int
            mealSlot: str (e.g. "L")
        """
        self._ensure_auth()
        payload = {
            "advanceBookingDays": advance_booking_days,
            "excludeWeekends": exclude_weekends,
            "mealDate": meal_date,
            "mealFacility": str(meal_facility),
            "mealOption": str(meal_option),
            "mealSession": meal_session,
            "mealSlot": meal_slot,
        }
        r = self.session.post(f"{API_BASE}/store-meal-booking/en", json=payload)
        r.raise_for_status()
        return r.json()

    # ---------- convenience ----------

    def find_and_book(self, meal_date: str, meal_slot: str, facility_id: str, option_id: str, session_id: int):
        """Thin wrapper if you already know all the IDs (e.g. from get_meal_options)."""
        return self.book_meal(
            meal_date=meal_date,
            meal_slot=meal_slot,
            meal_facility=facility_id,
            meal_option=option_id,
            meal_session=session_id,
        )


def load_credentials(path: str):
    """
    Reads a two-line credentials file:
        line 1: username
        line 2: password
    Blank lines and lines starting with '#' are ignored.
    """
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f if ln.strip() and not ln.strip().startswith("#")]
    if len(lines) < 2:
        raise ValueError(f"{path} must contain at least two non-empty lines: username, password")
    return lines[0], lines[1]


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    credentials_path = os.path.join(script_dir, "credentials.txt")
    username, password = load_credentials(credentials_path)

    client = SUMealClient(username, password)
    client.login()

    print("=== Quota summary ===")
    print(client.get_quota_summary())

    print("\n=== Upcoming bookings ===")
    for b in client.get_bookings("2026-07-23"):
        print(f"{b['start']}: {b['description']} ({b['mealCost']})")

    # Example: inspect what's bookable for a given date/slot before booking
    date = "2026-07-24"
    slot = "L"
    print(f"\n=== Facilities for {date} {slot} ===")
    facilities = client.get_meal_facilities(date, slot)
    print(facilities)

    # Facility entries are {"code": ..., "description": ...}; code "0" is a
    # "Select" placeholder, not a real facility.
    real_facilities = [f for f in facilities if f["code"] != "0"]
    if real_facilities:
        facility_id = real_facilities[0]["code"]
        print(f"\n=== Options for {date} {slot} @ facility {facility_id} ===")
        options = client.get_meal_options(date, slot, facility_id)
        print(options)