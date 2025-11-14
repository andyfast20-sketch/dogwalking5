import os
from datetime import datetime
from typing import Any, Dict, List

import requests
from flask import Blueprint, current_app, jsonify, render_template, request

main_bp = Blueprint("main", __name__)


ChatMessage = Dict[str, str]


chat_state: Dict[str, Any] = {
    "autopilot": True,
    "business_context": "",
    "messages": [],
}


banned_visitors: Dict[str, Dict[str, Any]] = {}


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _append_message(role: str, content: str) -> None:
    message: ChatMessage = {
        "role": role,
        "content": content,
        "timestamp": _iso_now(),
    }
    messages: List[ChatMessage] = chat_state["messages"]
    messages.append(message)
    if len(messages) > 100:
        del messages[:-100]


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


@main_bp.get("/api/chat/messages")
def get_chat_messages():
    return jsonify(
        {
            "messages": chat_state["messages"],
            "autopilot": chat_state["autopilot"],
        }
    )


@main_bp.post("/api/chat")
def post_chat_message():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    _append_message("visitor", message)

    if chat_state["autopilot"]:
        ai_reply = _generate_ai_reply(message)
        _append_message("ai", ai_reply)

    return (
        jsonify(
            {
                "messages": chat_state["messages"],
                "autopilot": chat_state["autopilot"],
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
    if not message:
        return jsonify({"error": "Message is required."}), 400

    _append_message("agent", message)

    return jsonify({"messages": chat_state["messages"], "autopilot": False})


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
