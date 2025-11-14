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


def _timestamp() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _visitors() -> Dict[str, Any]:
    return chat_state.setdefault("visitors", {})


def _get_or_create_visitor(visitor_id: str) -> Dict[str, Any]:
    visitors = _visitors()
    visitor = visitors.get(visitor_id)
    if visitor is None:
        now = _timestamp()
        visitor = {
            "visitor_id": visitor_id,
            "label": visitor_id[-6:].upper(),
            "messages": [],
            "created_at": now,
            "last_seen": now,
            "is_returning": False,
        }
        visitors[visitor_id] = visitor
    else:
        visitor["last_seen"] = _timestamp()
    return visitor


def _append_message(visitor: Dict[str, Any], role: str, content: str) -> None:
    message: ChatMessage = {
        "role": role,
        "content": content,
        "timestamp": _timestamp(),
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

    now_iso = datetime.utcnow().isoformat() + "Z"
    visitor_id = request.cookies.get(VISITOR_COOKIE_NAME)
    is_new_visitor = visitor_id not in visitor_state if visitor_id else True

    if not visitor_id or is_new_visitor:
        visitor_id = visitor_id or uuid.uuid4().hex
        visitor_state[visitor_id] = {
            "id": visitor_id,
            "first_seen": now_iso,
            "last_seen": now_iso,
            "visit_count": 0,
            "ip_address": _get_client_ip(),
            "last_path": request.path,
            "visits": [],
        }
    entry = visitor_state[visitor_id]

    entry["visit_count"] += 1
    entry["last_seen"] = now_iso
    entry["ip_address"] = _get_client_ip()
    entry["last_path"] = request.path
    entry_visits: List[Dict[str, str]] = entry.setdefault("visits", [])
    entry_visits.append({"timestamp": now_iso, "path": request.path})
    if len(entry_visits) > 10:
        del entry_visits[:-10]

    if is_new_visitor and len(visitor_state) > 500:
        oldest_id = min(
            visitor_state.items(), key=lambda item: item[1].get("first_seen", "")
        )[0]
        if oldest_id != visitor_id:
            visitor_state.pop(oldest_id, None)

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


@main_bp.get("/api/admin/conversations")
def list_conversations():
    visitors = []
    for visitor_id, visitor in _visitors().items():
        messages: List[ChatMessage] = visitor.get("messages", [])
        last_message = messages[-1] if messages else None
        visitors.append(
            {
                "visitor_id": visitor_id,
                "label": visitor.get("label"),
                "last_seen": visitor.get("last_seen"),
                "message_count": len(messages),
                "waiting": _visitor_is_waiting(visitor),
                "is_returning": bool(visitor.get("is_returning")),
                "last_message": last_message,
            }
        )

    visitors.sort(key=lambda entry: entry.get("last_seen") or "", reverse=True)

    return jsonify(
        {
            "autopilot": chat_state["autopilot"],
            "waiting_count": _waiting_count(),
            "visitors": visitors,
        }
    )


@main_bp.get("/api/chat/status")
def chat_status():
    return jsonify(
        {
            "waiting_count": _waiting_count(),
            "autopilot": chat_state["autopilot"],
        }
    )
