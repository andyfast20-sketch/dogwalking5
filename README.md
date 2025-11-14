# Dog Walking Scheduler

A simple Flask application that showcases how Python, HTML, CSS, and JavaScript can work together to manage a dog walking schedule. The server renders an initial list of walks and exposes an API endpoint that the client-side JavaScript can use to add new walks dynamically.

## Getting started

1. Create and activate a virtual environment (optional but recommended).
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   flask --app wsgi run
   ```
4. Open your browser and navigate to `http://127.0.0.1:5000/` to view the app.

## Project structure

```
app/
├── __init__.py       # Flask app factory
├── routes.py         # Route definitions and API endpoint
├── templates/
│   └── index.html    # HTML template rendered by Flask
└── static/
    ├── css/style.css # Styling for the page
    └── js/main.js    # Client-side logic for adding walks
```

## Features

- Flask backend serving HTML templates and a JSON API.
- Responsive layout styled with CSS, including light and dark mode support.
- JavaScript-powered form submission that updates the schedule without reloading the page.
