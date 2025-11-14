from datetime import datetime
from flask import Blueprint, jsonify, render_template, request

main_bp = Blueprint("main", __name__)

DOG_WALKS = [
    {
        "id": 1,
        "walker": "Alex",
        "dog": "Buddy",
        "time": "09:00",
        "duration": 30,
    },
    {
        "id": 2,
        "walker": "Sam",
        "dog": "Luna",
        "time": "11:30",
        "duration": 45,
    },
]


@main_bp.get("/")
def index():
    return render_template("index.html", walks=DOG_WALKS)


@main_bp.post("/api/schedule")
def add_walk():
    data = request.get_json(force=True)
    new_id = max((walk["id"] for walk in DOG_WALKS), default=0) + 1

    walk = {
        "id": new_id,
        "walker": data.get("walker", "Unknown"),
        "dog": data.get("dog", "Unknown"),
        "time": data.get("time", datetime.now().strftime("%H:%M")),
        "duration": int(data.get("duration", 30)),
    }

    DOG_WALKS.append(walk)
    return jsonify(walk), 201
