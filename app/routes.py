from datetime import datetime
from flask import Blueprint, render_template

main_bp = Blueprint("main", __name__)


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
def admin_dashboard():
    return render_template("admin.html")
