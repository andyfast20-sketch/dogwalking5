from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List

from flask import Blueprint, jsonify, render_template, request

main_bp = Blueprint("main", __name__)


def _coerce_bool(value: Any) -> bool:
    """Convert different truthy representations into a boolean.

    Accepts strings such as "true"/"false", integers like 1/0, and already-boolean
    values. Any falsy input (including the string "false") resolves to ``False``.
    """

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off", ""}:
            return False

    if isinstance(value, (int, float)):
        return bool(value)

    return bool(value)


EnquiryRecord = Dict[str, Any]


banned_visitors: Dict[str, Dict[str, Any]] = {}
contact_enquiries: Dict[str, EnquiryRecord] = {}

VALID_ENQUIRY_STATUSES = {"new", "in_progress", "complete"}

SlotRecord = Dict[str, Any]
BookingRecord = Dict[str, Any]

booking_slots: Dict[str, SlotRecord] = {}
booking_records: Dict[str, BookingRecord] = {}
VALID_BOOKING_STATUSES = {"new", "in_progress", "complete"}


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _parse_slot_datetime(date_value: str, time_value: str) -> datetime:
    return datetime.strptime(f"{date_value} {time_value}", "%Y-%m-%d %H:%M")


def _serialize_slot(slot: SlotRecord) -> SlotRecord:
    data = dict(slot)
    try:
        start = _parse_slot_datetime(slot["date"], slot["time"])
        data["start_iso"] = start.isoformat()
    except Exception:
        data["start_iso"] = slot.get("start_iso")
    return data


def _sorted_slots(include_booked: bool | None = None) -> List[SlotRecord]:
    def should_include(slot: SlotRecord) -> bool:
        if include_booked is None:
            return True
        return bool(slot.get("is_booked")) == include_booked

    sortable: List[SlotRecord] = []
    for slot in booking_slots.values():
        if should_include(slot):
            sortable.append(slot)

    def sort_key(slot: SlotRecord):
        try:
            start = _parse_slot_datetime(slot["date"], slot["time"])
        except Exception:
            start = datetime.max
        return (start, slot.get("created_at", ""))

    return [_serialize_slot(slot) for slot in sorted(sortable, key=sort_key)]


def _serialize_booking(booking: BookingRecord) -> BookingRecord:
    data = dict(booking)
    status = (data.get("status") or "").strip().lower().replace("-", "_")
    if status not in VALID_BOOKING_STATUSES:
        status = "new"
    data["status"] = status
    slot = booking_slots.get(booking.get("slot_id"))
    if slot:
        data["slot"] = _serialize_slot(slot)
    return data


def _sorted_bookings() -> List[BookingRecord]:
    def sort_key(record: BookingRecord):
        slot = booking_slots.get(record.get("slot_id"))
        try:
            if slot:
                start = _parse_slot_datetime(slot["date"], slot["time"])
            else:
                raise ValueError
        except Exception:
            start = datetime.max
        return (start, record.get("created_at", ""))

    return [_serialize_booking(booking) for booking in sorted(booking_records.values(), key=sort_key)]


def _serialize_enquiry(enquiry: EnquiryRecord) -> EnquiryRecord:
    data = dict(enquiry)
    status = _enquiry_status(enquiry)
    data["status"] = status
    data["completed"] = status == "complete"
    return data


def _enquiry_status(enquiry: EnquiryRecord) -> str:
    status = (enquiry.get("status") or "").strip().lower().replace("-", "_")
    if status in VALID_ENQUIRY_STATUSES:
        return status
    return "complete" if enquiry.get("completed") else "new"


def _sorted_enquiries() -> List[EnquiryRecord]:
    return [
        _serialize_enquiry(enquiry)
        for enquiry in sorted(
            contact_enquiries.values(),
            key=lambda item: item.get("created_at", ""),
            reverse=True,
        )
    ]


def _enquiry_summary(enquiries_list: List[EnquiryRecord] | None = None) -> Dict[str, Any]:
    enquiries_data = enquiries_list if enquiries_list is not None else _sorted_enquiries()
    open_count = sum(1 for item in enquiries_data if _enquiry_status(item) != "complete")
    return {
        "enquiries": enquiries_data,
        "counts": {"open": open_count, "total": len(enquiries_data)},
    }


@main_bp.app_context_processor
def inject_globals():
    return {"current_year": datetime.now().year}


def _client_identifier() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return forwarded_for or (request.remote_addr or "unknown")


def _is_admin_request() -> bool:
    path = request.path or ""
    return path.startswith("/admin") or path.startswith("/api/admin")


@main_bp.before_app_request
def enforce_banned_visitors():
    if request.endpoint == "static":  # allow assets to load for the banned page
        return None

    if _is_admin_request():
        return None

    visitor_id = _client_identifier()
    visitor = banned_visitors.get(visitor_id)
    if not visitor or not visitor.get("active", False):
        return None

    message = {
        "error": "access_denied",
        "message": "This visitor has been banned by the site administrator.",
        "visitor": visitor,
    }

    if request.path.startswith("/api/"):
        return jsonify(message), 403

    return render_template("banned.html", visitor_id=visitor_id, visitor=visitor), 403


@main_bp.get("/")
def index():
    return render_template("index.html")


@main_bp.get("/services")
def services():
    return render_template("services.html")


@main_bp.get("/about")
def about():
    return render_template("about.html")


@main_bp.get("/contact")
def contact():
    return render_template("contact.html")


@main_bp.get("/book")
def booking():
    return render_template("booking.html")


@main_bp.get("/admin")
def admin():
    return render_template("admin.html")


@main_bp.get("/admin2")
def admin2():
    """Render an alternate administrative view focused on field operations."""

    return render_template("admin2.html")


@main_bp.get("/amin")
def amin():
    """Render the dedicated page for Amin team members."""

    return render_template("amin.html")


@main_bp.get("/api/slots")
def list_public_slots():
    available_slots = _sorted_slots(include_booked=False)
    return jsonify({"slots": available_slots})


@main_bp.get("/api/admin/schedule")
def get_schedule_overview():
    return jsonify({
        "slots": _sorted_slots(),
        "bookings": _sorted_bookings(),
    })


@main_bp.post("/api/admin/slots")
def create_slot():
    data = request.get_json(silent=True) or {}
    date_value = (data.get("date") or "").strip()
    time_value = (data.get("time") or "").strip()
    duration_value = int(data.get("duration_minutes") or 0)
    price_value = float(data.get("price") or 0)
    notes = (data.get("notes") or "").strip()

    if not date_value or not time_value:
        return jsonify({"error": "Date and time are required."}), 400

    if duration_value <= 0:
        return jsonify({"error": "Duration must be greater than zero."}), 400

    if price_value < 0:
        return jsonify({"error": "Price cannot be negative."}), 400

    try:
        start = _parse_slot_datetime(date_value, time_value)
    except Exception:
        return jsonify({"error": "Please provide a valid date and time."}), 400

    slot_id = uuid.uuid4().hex
    slot: SlotRecord = {
        "id": slot_id,
        "date": date_value,
        "time": time_value,
        "duration_minutes": duration_value,
        "price": price_value,
        "notes": notes,
        "is_booked": False,
        "created_at": _iso_now(),
        "start_iso": start.isoformat(),
    }
    booking_slots[slot_id] = slot

    return (
        jsonify({
            "slot": _serialize_slot(slot),
            "slots": _sorted_slots(),
        }),
        201,
    )


@main_bp.delete("/api/admin/slots/<slot_id>")
def delete_slot(slot_id: str):
    slot = booking_slots.get(slot_id)
    if not slot:
        return jsonify({"error": "Slot not found."}), 404

    if slot.get("is_booked"):
        return jsonify({"error": "This slot has an active booking and cannot be removed."}), 409

    booking_slots.pop(slot_id, None)
    return jsonify({"removed": True, "slots": _sorted_slots()}), 200


@main_bp.post("/api/bookings")
def create_booking():
    data = request.get_json(silent=True) or {}
    slot_id = (data.get("slot_id") or "").strip()
    client_name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip()
    dog_name = (data.get("dog_name") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not slot_id:
        return jsonify({"error": "Slot ID is required."}), 400

    slot = booking_slots.get(slot_id)
    if not slot:
        return jsonify({"error": "We couldn’t find that slot. Please refresh."}), 404

    if slot.get("is_booked"):
        return jsonify({"error": "That slot has just been booked. Please choose another."}), 409

    if not client_name or not email or not phone or not dog_name:
        return (
            jsonify({"error": "Please complete all booking details before submitting."}),
            400,
        )

    booking_id = uuid.uuid4().hex
    booking: BookingRecord = {
        "id": booking_id,
        "slot_id": slot_id,
        "client_name": client_name,
        "email": email,
        "phone": phone,
        "dog_name": dog_name,
        "notes": notes,
        "created_at": _iso_now(),
        "confirmed": False,
        "status": "new",
        "updated_at": _iso_now(),
    }

    slot["is_booked"] = True
    slot["booking_id"] = booking_id
    booking_records[booking_id] = booking

    return (
        jsonify({
            "booking": _serialize_booking(booking),
            "slots": _sorted_slots(include_booked=False),
        }),
        201,
    )


@main_bp.post("/api/enquiries")
def submit_enquiry():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip()
    message = (data.get("message") or "").strip()

    if not name or not email or not phone or not message:
        return jsonify({"error": "Please complete all contact details before submitting."}), 400

    enquiry_id = uuid.uuid4().hex
    now_iso = _iso_now()
    record: EnquiryRecord = {
        "id": enquiry_id,
        "name": name,
        "email": email,
        "phone": phone,
        "message": message,
        "created_at": now_iso,
        "updated_at": now_iso,
        "completed": False,
        "completed_at": None,
        "status": "new",
    }
    contact_enquiries[enquiry_id] = record

    return jsonify({"enquiry": _serialize_enquiry(record)}), 201


@main_bp.get("/api/admin/enquiries")
def list_enquiries():
    enquiries_data = _sorted_enquiries()
    return jsonify(_enquiry_summary(enquiries_data))


@main_bp.patch("/api/admin/enquiries/<enquiry_id>")
def update_enquiry(enquiry_id: str):
    enquiry = contact_enquiries.get(enquiry_id)
    if not enquiry:
        return jsonify({"error": "Enquiry not found."}), 404

    data = request.get_json(silent=True) or {}
    updated = False
    now_iso = _iso_now()

    def set_status(status_value: str):
        nonlocal updated
        enquiry["status"] = status_value
        enquiry["completed"] = status_value == "complete"
        enquiry["updated_at"] = now_iso
        enquiry["completed_at"] = now_iso if enquiry["completed"] else None
        updated = True

    if "status" in data:
        status_value = (data.get("status") or "").strip().lower().replace("-", "_")
        if status_value not in VALID_ENQUIRY_STATUSES:
            return (
                jsonify({"error": "Status must be new, in_progress, or complete."}),
                400,
            )
        set_status(status_value)

    if "completed" in data and "status" not in data:
        completed = _coerce_bool(data.get("completed"))
        set_status("complete" if completed else "new")

    for field in ("name", "email", "phone", "message"):
        if field in data:
            value = (data.get(field) or "").strip()
            if not value:
                return jsonify({"error": f"{field.title()} cannot be empty."}), 400
            enquiry[field] = value
            enquiry["updated_at"] = now_iso
            updated = True

    if not updated:
        return jsonify({"error": "No changes supplied."}), 400

    enquiries_data = _sorted_enquiries()
    response = _enquiry_summary(enquiries_data)
    response["enquiry"] = _serialize_enquiry(enquiry)
    return jsonify(response)


@main_bp.delete("/api/admin/enquiries/<enquiry_id>")
def delete_enquiry(enquiry_id: str):
    if enquiry_id not in contact_enquiries:
        return jsonify({"error": "Enquiry not found."}), 404

    contact_enquiries.pop(enquiry_id, None)
    return jsonify(_enquiry_summary())


@main_bp.get("/api/admin/bookings")
def list_bookings():
    return jsonify({"bookings": _sorted_bookings()})


@main_bp.post("/api/admin/bookings/<booking_id>/status")
def update_booking_status(booking_id: str):
    booking = booking_records.get(booking_id)
    if not booking:
        return jsonify({"error": "Booking not found."}), 404

    data = request.get_json(silent=True) or {}
    updated = False
    now_iso = _iso_now()

    if "confirmed" in data:
        confirmed = _coerce_bool(data.get("confirmed"))
        booking["confirmed"] = confirmed
        booking["updated_at"] = now_iso
        updated = True

    if "status" in data:
        status_value = (data.get("status") or "").strip().lower().replace("-", "_")
        if status_value not in VALID_BOOKING_STATUSES:
            return (
                jsonify({"error": "Status must be new, in_progress, or complete."}),
                400,
            )
        booking["status"] = status_value
        booking["updated_at"] = now_iso
        updated = True

    if not updated:
        return jsonify({"error": "No changes supplied."}), 400

    return jsonify({
        "booking": _serialize_booking(booking),
        "bookings": _sorted_bookings(),
    })


def _serialize_banned_visitors() -> List[Dict[str, Any]]:
    return sorted(
        (visitor for visitor in banned_visitors.values()),
        key=lambda item: item.get("created_at", ""),
        reverse=True,
    )


@main_bp.get("/api/admin/banned-visitors")
def list_banned_visitors():
    return jsonify({"visitors": _serialize_banned_visitors()})


@main_bp.post("/api/admin/banned-visitors")
def create_or_update_ban():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip()
    reason = (data.get("reason") or "").strip()

    if not identifier:
        return jsonify({"error": "Visitor identifier is required."}), 400

    existing = banned_visitors.get(identifier)
    timestamp = _iso_now()
    if existing:
        existing.update(
            {
                "reason": reason,
                "active": True,
                "updated_at": timestamp,
            }
        )
        visitor = existing
        status_code = 200
    else:
        visitor = {
            "id": identifier,
            "reason": reason,
            "active": True,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        banned_visitors[identifier] = visitor
        status_code = 201

    return jsonify({"visitor": visitor, "visitors": _serialize_banned_visitors()}), status_code


@main_bp.post("/api/admin/banned-visitors/<path:visitor_id>/unban")
def unban_visitor(visitor_id: str):
    visitor = banned_visitors.get(visitor_id)
    if not visitor:
        return jsonify({"error": "Visitor not found."}), 404

    visitor["active"] = False
    visitor["updated_at"] = _iso_now()

    return jsonify({"visitor": visitor, "visitors": _serialize_banned_visitors()})


@main_bp.delete("/api/admin/banned-visitors/<path:visitor_id>")
def delete_visitor(visitor_id: str):
    visitor = banned_visitors.pop(visitor_id, None)
    if not visitor:
        return jsonify({"error": "Visitor not found."}), 404

    return jsonify({"removed": True, "visitors": _serialize_banned_visitors()})
