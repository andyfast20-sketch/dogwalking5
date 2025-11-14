function initNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("nav-menu");

  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const isOpen = menu.dataset.open === "true";
    menu.dataset.open = String(!isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.dataset.open = "false";
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

const ENQUIRY_STORAGE_KEY = "reliableWalksEnquiries";

function loadEnquiries() {
  try {
    return JSON.parse(localStorage.getItem(ENQUIRY_STORAGE_KEY)) ?? [];
  } catch (error) {
    console.error("Failed to parse enquiries from storage", error);
    return [];
  }
}

function saveEnquiries(enquiries) {
  try {
    localStorage.setItem(ENQUIRY_STORAGE_KEY, JSON.stringify(enquiries));
  } catch (error) {
    console.error("Failed to save enquiries", error);
  }
}

function addEnquiry(enquiry) {
  const enquiries = loadEnquiries();
  const entry = {
    id: Date.now(),
    ...enquiry,
    createdAt: new Date().toISOString(),
    completed: false,
    isNew: true,
  };
  enquiries.push(entry);
  saveEnquiries(enquiries);
  window.dispatchEvent(new CustomEvent("enquiries:updated"));
  return entry;
}

function formatDateTime(value) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function handleFormSubmission(formId, feedbackSelector, successMessage) {
  const form = document.getElementById(formId);
  const feedback = document.querySelector(feedbackSelector);

  if (!form || !feedback) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      feedback.textContent = "Please complete all required fields.";
      feedback.classList.add("error");
      return;
    }

    if (form.id === "contact-form") {
      const formData = new FormData(form);
      addEnquiry({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        message: formData.get("message"),
      });
    }

    feedback.textContent = successMessage;
    feedback.classList.remove("error");
    form.reset();
  });
}

function initForms() {
  handleFormSubmission(
    "contact-form",
    "[data-role='contact-feedback']",
    "Thank you — we’ll be in touch soon!"
  );

  handleFormSubmission(
    "booking-form",
    "[data-role='booking-feedback']",
    "Thank you — we’ll confirm shortly."
  );
}

function renderEnquiryCard(enquiries) {
  const card = document.querySelector("[data-role='enquiry-card']");
  if (!card) return;

  const total = enquiries.length;
  const newCount = enquiries.filter((enquiry) => enquiry.isNew).length;
  const totalLabel = card.querySelector("[data-role='enquiry-total']");
  if (totalLabel) {
    totalLabel.textContent = total === 1 ? "1 enquiry" : `${total} enquiries`;
  }

  const newBadge = card.querySelector("[data-role='new-badge']");
  if (newBadge) {
    if (newCount > 0) {
      newBadge.hidden = false;
      const countNode = newBadge.querySelector("[data-role='new-count']");
      if (countNode) {
        countNode.textContent = newCount;
      }
    } else {
      newBadge.hidden = true;
    }
  }

  if (newCount > 0) {
    card.classList.add("is-flashing");
  } else {
    card.classList.remove("is-flashing");
  }
}

function renderEnquiryList(enquiries) {
  const list = document.querySelector("[data-role='enquiry-list']");
  const emptyState = document.querySelector("[data-role='enquiry-empty']");
  if (!list || !emptyState) return;

  if (enquiries.length === 0) {
    list.innerHTML = "";
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  const items = enquiries
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((enquiry) => {
      const statusClass = enquiry.completed ? "status-complete" : "";
      const statusLabel = enquiry.completed ? "Complete" : "Awaiting action";
      const buttonLabel = enquiry.completed ? "Mark as not complete" : "Mark as complete";

      return `
        <li class="enquiry-item" data-id="${enquiry.id}">
          <div class="enquiry-item__header">
            <div>
              <h3>${escapeHtml(enquiry.name) || "Unnamed"}</h3>
              <div class="enquiry-item__meta">
                <span>${escapeHtml(enquiry.email) || "No email provided"}</span>
                <span>${escapeHtml(enquiry.phone) || "No phone"}</span>
                <span>${formatDateTime(enquiry.createdAt)}</span>
              </div>
            </div>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <p>${escapeHtml(enquiry.message) || "No message provided."}</p>
          <div class="enquiry-actions">
            <button class="button secondary" type="button" data-action="toggle-complete" data-id="${enquiry.id}">
              ${buttonLabel}
            </button>
          </div>
        </li>
      `;
    })
    .join("");

  list.innerHTML = items;
}

function initAdminDashboard() {
  const card = document.querySelector("[data-role='enquiry-card']");
  const panel = document.querySelector("[data-role='enquiry-panel']");
  const closeButton = document.querySelector("[data-role='close-panel']");
  if (!card || !panel || !closeButton) return;

  const updateUI = () => {
    const enquiries = loadEnquiries();
    renderEnquiryCard(enquiries);
    if (!panel.hidden) {
      renderEnquiryList(enquiries);
    }
  };

  updateUI();

  card.addEventListener("click", () => {
    const enquiries = loadEnquiries().map((enquiry) => ({
      ...enquiry,
      isNew: false,
    }));
    saveEnquiries(enquiries);
    renderEnquiryCard(enquiries);
    renderEnquiryList(enquiries);
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth" });
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
  });

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='toggle-complete']");
    if (!button) return;

    const id = Number(button.dataset.id);
    const enquiries = loadEnquiries().map((enquiry) => {
      if (enquiry.id === id) {
        return { ...enquiry, completed: !enquiry.completed };
      }
      return enquiry;
    });
    saveEnquiries(enquiries);
    renderEnquiryList(enquiries);
    renderEnquiryCard(enquiries);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === ENQUIRY_STORAGE_KEY) {
      updateUI();
    }
  });

  window.addEventListener("enquiries:updated", updateUI);
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initForms();
  initAdminDashboard();
});
