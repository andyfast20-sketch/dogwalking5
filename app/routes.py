from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Any, Dict, List

import requests
from flask import Blueprint, current_app, g, jsonify, render_template, request

main_bp = Blueprint("main", __name__)


ChatMessage = Dict[str, str]


chat_state: Dict[str, Any] = {
    "autopilot": True,
    "business_context": "",
    "visitors": {},
}


banned_visitors: Dict[str, Dict[str, Any]] = {}

SlotRecord = Dict[str, Any]
BookingRecord = Dict[str, Any]

booking_slots: Dict[str, SlotRecord] = {}
booking_records: Dict[str, BookingRecord] = {}


VISITOR_COOKIE_NAME = "dogwalking_visitor_id"


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _visitors() -> Dict[str, Dict[str, Any]]:
    visitors = chat_state.setdefault("visitors", {})
    return visitors


def _get_or_create_visitor(visitor_id: str) -> Dict[str, Any]:
    visitors = _visitors()
    visitor = visitors.get(visitor_id)
    if visitor:
        return visitor

    now_iso = _iso_now()
    visitor = {
        "id": visitor_id,
        "first_seen": now_iso,
        "last_seen": now_iso,
        "visit_count": 0,
        "visits": [],
        "last_path": "",
    }
    visitors[visitor_id] = visitor
    return visitor


def _append_message(visitor: Dict[str, Any], role: str, content: str) -> None:
    message: ChatMessage = {
        "role": role,
        "content": content,
        "timestamp": _iso_now(),
    }
    messages: List[ChatMessage] = visitor.setdefault("messages", [])
    messages.append(message)
    if len(messages) > 200:
        del messages[:-200]
    visitor["last_seen"] = message["timestamp"]


def _visitor_is_waiting(visitor: Dict[str, Any]) -> bool:
    if chat_state.get("autopilot"):
        return False
    messages: List[ChatMessage] = visitor.get("messages", [])
    return bool(messages) and messages[-1]["role"] == "visitor"


def _waiting_count() -> int:
    return sum(1 for visitor in _visitors().values() if _visitor_is_waiting(visitor))


def _serialize_conversation(visitor: Dict[str, Any]) -> Dict[str, Any]:
    messages: List[ChatMessage] = visitor.get("messages", [])
    last_message = messages[-1] if messages else None
    return {
        "visitor_id": visitor.get("id"),
        "label": visitor.get("label"),
        "is_returning": bool(visitor.get("is_returning")),
        "waiting": _visitor_is_waiting(visitor),
        "last_seen": visitor.get("last_seen"),
        "last_message": last_message,
        "visit_count": int(visitor.get("visit_count") or 0),
    }


def _serialize_visitor_record(visitor: Dict[str, Any]) -> Dict[str, Any]:
    messages: List[ChatMessage] = visitor.get("messages", [])
    last_message = messages[-1] if messages else None
    visits = list(visitor.get("visits", []))
    recent_visits = visits[-5:]
    return {
        "visitor_id": visitor.get("id"),
        "label": visitor.get("label"),
        "is_returning": bool(visitor.get("is_returning")),
        "visit_count": int(visitor.get("visit_count") or 0),
        "last_seen": visitor.get("last_seen"),
        "last_path": visitor.get("last_path"),
        "waiting": _visitor_is_waiting(visitor),
        "last_message": last_message,
        "visits": recent_visits,
    }


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


def _generate_ai_reply(user_message: str) -> str:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return (
            "I’m currently unable to reach our AI assistant. Please leave your message, "
            "and a team member will get back to you shortly."
        )

    system_prompt = (
        "You are a helpful customer support assistant for a dog walking service. "
        "Use the provided business context to answer clearly and concisely, "
        "highlighting key services and booking information."
    )
    business_context = chat_state.get("business_context", "")

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "system",
                "content": f"Business context:\n{business_context.strip()}",
            },
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 400,
        "temperature": 0.7,
    }

    try:
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("No choices returned from DeepSeek API")
        message = choices[0]["message"]["content"].strip()
        if not message:
            raise ValueError("Empty message from DeepSeek API")
        return message
    except Exception:  # pragma: no cover - best effort logging only
        current_app.logger.exception("DeepSeek chat completion failed")
        return (
            "I’m having a little trouble answering right now. Please share your "
            "details and we’ll follow up personally!"
        )


def _get_client_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.remote_addr or "Unknown"


def _should_track_request() -> bool:
    if request.method != "GET":
        return False
    if request.path.startswith("/static"):
        return False
    if request.path.startswith("/api"):
        return False
    # Only track routes served by this blueprint
    if request.blueprint and request.blueprint != main_bp.name:
        return False
    return True


@main_bp.before_app_request
def track_visitors() -> None:
    if not _should_track_request():
        return

    now_iso = _iso_now()
    visitor_id = request.cookies.get(VISITOR_COOKIE_NAME)
    visitors = _visitors()
    is_new_visitor = visitor_id not in visitors if visitor_id else True

    if not visitor_id or is_new_visitor:
        visitor_id = visitor_id or uuid.uuid4().hex
        visitors[visitor_id] = {
            "id": visitor_id,
            "first_seen": now_iso,
            "last_seen": now_iso,
            "visit_count": 0,
            "ip_address": _get_client_ip(),
            "last_path": request.path,
            "visits": [],
        }
    entry = visitors[visitor_id]

    entry["visit_count"] += 1
    entry["last_seen"] = now_iso
    entry["ip_address"] = _get_client_ip()
    entry["last_path"] = request.path
    entry_visits: List[Dict[str, str]] = entry.setdefault("visits", [])
    entry_visits.append({"timestamp": now_iso, "path": request.path})
    if len(entry_visits) > 10:
        del entry_visits[:-10]

    if is_new_visitor and len(visitors) > 500:
        oldest_id = min(
            visitors.items(), key=lambda item: item[1].get("first_seen", "")
        )[0]
        if oldest_id != visitor_id:
            visitors.pop(oldest_id, None)

    g.visitor_cookie_id = visitor_id


@main_bp.after_app_request
def persist_visitor_cookie(response):
    visitor_id = getattr(g, "visitor_cookie_id", None)
    if visitor_id:
        response.set_cookie(
            VISITOR_COOKIE_NAME,
            visitor_id,
            max_age=60 * 60 * 24 * 365,
            secure=False,
            httponly=False,
            samesite="Lax",
        )
    return response


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


@main_bp.get("/api/admin/visitors")
def list_visitor_overview():
    visitors = list(_visitors().values())
    total_visitors = len(visitors)
    returning_visitors = sum(1 for visitor in visitors if visitor.get("is_returning"))
    total_visits = sum(int(visitor.get("visit_count") or 0) for visitor in visitors)

    serialized = [_serialize_visitor_record(visitor) for visitor in visitors]
    serialized.sort(
        key=lambda item: (
            item.get("last_seen") or "",
            item.get("visitor_id") or "",
        ),
        reverse=True,
    )

    return jsonify(
        {
            "total": total_visitors,
            "returning": returning_visitors,
            "total_visits": total_visits,
            "waiting_count": _waiting_count(),
            "visitors": serialized,
        }
    )


@main_bp.get("/api/admin/conversations")
def list_conversations():
    visitors = list(_visitors().values())
    summaries: List[Dict[str, Any]] = []
    for visitor in visitors:
        messages: List[ChatMessage] = visitor.get("messages", [])
        if messages or _visitor_is_waiting(visitor):
            summaries.append(_serialize_conversation(visitor))

    summaries = sorted(
        summaries,
        key=lambda item: (
            item.get("waiting", False),
            item.get("last_seen") or "",
        ),
        reverse=True,
    )

    return jsonify(
        {
            "autopilot": chat_state["autopilot"],
            "waiting_count": _waiting_count(),
            "visitors": summaries,
        }
    )


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


@main_bp.get("/api/admin/bookings")
def list_bookings():
    return jsonify({"bookings": _sorted_bookings()})


@main_bp.post("/api/admin/bookings/<booking_id>/status")
def update_booking_status(booking_id: str):
    booking = booking_records.get(booking_id)
    if not booking:
        return jsonify({"error": "Booking not found."}), 404

    data = request.get_json(silent=True) or {}
    confirmed = bool(data.get("confirmed"))
    booking["confirmed"] = confirmed
    booking["updated_at"] = _iso_now()

    return jsonify({
        "booking": _serialize_booking(booking),
        "bookings": _sorted_bookings(),
    })


@main_bp.get("/api/chat/messages")
def get_chat_messages():
    visitor_id = (request.args.get("visitor_id") or "").strip()
    if not visitor_id:
        return jsonify({"error": "Visitor ID is required."}), 400

    visitor = _get_or_create_visitor(visitor_id)

    return jsonify(
        {
            "messages": visitor.get("messages", []),
            "autopilot": chat_state["autopilot"],
            "visitor_id": visitor_id,
            "label": visitor.get("label"),
            "is_returning": bool(visitor.get("is_returning")),
            "waiting_count": _waiting_count(),
        }
    )


@main_bp.post("/api/chat")
def post_chat_message():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    visitor_id = (data.get("visitor_id") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    if not visitor_id:
        return jsonify({"error": "Visitor ID is required."}), 400

    visitor = _get_or_create_visitor(visitor_id)
    is_returning = bool(visitor.get("messages"))

    _append_message(visitor, "visitor", message)
    if is_returning:
        visitor["is_returning"] = True

    if chat_state["autopilot"]:
        ai_reply = _generate_ai_reply(message)
        _append_message(visitor, "ai", ai_reply)

    return (
        jsonify(
            {
                "messages": visitor.get("messages", []),
                "autopilot": chat_state["autopilot"],
                "visitor_id": visitor_id,
                "label": visitor.get("label"),
                "is_returning": bool(visitor.get("is_returning")),
                "waiting_count": _waiting_count(),
            }
        ),
        201,
    )


@main_bp.post("/api/chat/respond")
def post_agent_response():
    if chat_state["autopilot"]:
        return (
            jsonify(
                {
                    "error": "Autopilot is enabled. Disable it to send live replies."
                }
            ),
            400,
        )

    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    visitor_id = (data.get("visitor_id") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    if not visitor_id:
        return jsonify({"error": "Visitor ID is required."}), 400

    visitor = _get_or_create_visitor(visitor_id)
    _append_message(visitor, "agent", message)

    return jsonify(
        {
            "messages": visitor.get("messages", []),
            "autopilot": False,
            "visitor_id": visitor_id,
            "label": visitor.get("label"),
            "is_returning": bool(visitor.get("is_returning")),
            "waiting_count": _waiting_count(),
        }
    )


@main_bp.get("/api/admin/chat-settings")
def get_chat_settings():
    return jsonify(
        {
            "autopilot": chat_state["autopilot"],
            "business_context": chat_state["business_context"],
        }
    )


@main_bp.post("/api/admin/chat-settings")
def update_chat_settings():
    data = request.get_json(silent=True) or {}
    autopilot = bool(data.get("autopilot"))
    business_context = (data.get("business_context") or "").strip()

    chat_state["autopilot"] = autopilot
    chat_state["business_context"] = business_context

    return jsonify(
        {
            "autopilot": chat_state["autopilot"],
            "business_context": chat_state["business_context"],
        }
    )


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
