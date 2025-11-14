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

let adminCardsInitialized = false;

function initAdminCards() {
  if (adminCardsInitialized) return;

  const cards = document.querySelectorAll("[data-card]");
  if (!cards.length) {
    return;
  }

  adminCardsInitialized = true;

  let expandedCard = null;

  const collapseCard = (card) => {
    if (!card) return;
    const toggle = card.querySelector("[data-card-toggle]");
    const body = card.querySelector("[data-card-body]");
    if (!toggle || !body) return;
    card.classList.remove("is-expanded");
    toggle.setAttribute("aria-expanded", "false");
    body.hidden = true;
  };

  const expandCard = (card) => {
    if (!card) return;
    const toggle = card.querySelector("[data-card-toggle]");
    const body = card.querySelector("[data-card-body]");
    if (!toggle || !body) return;
    card.classList.add("is-expanded");
    toggle.setAttribute("aria-expanded", "true");
    body.hidden = false;
  };

  cards.forEach((card) => {
    const toggle = card.querySelector("[data-card-toggle]");
    const body = card.querySelector("[data-card-body]");
    if (!toggle || !body) {
      return;
    }

    // Ensure collapsed state on load
    toggle.setAttribute("aria-expanded", "false");
    body.hidden = true;

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      if (expandedCard === card) {
        collapseCard(card);
        expandedCard = null;
        return;
      }

      if (expandedCard) {
        collapseCard(expandedCard);
      }

      expandCard(card);
      expandedCard = card;

      window.requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    toggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle.click();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && expandedCard) {
      const currentCard = expandedCard;
      collapseCard(currentCard);
      expandedCard = null;
      const toggle = currentCard.querySelector("[data-card-toggle]");
      if (toggle) {
        toggle.focus();
      }
    }
  });
}

const VISITOR_ID_STORAGE_KEY = "reliableWalksVisitorId";

function getOrCreateVisitorId() {
  try {
    const storage = window.localStorage;
    if (!storage) return "";

    let visitorId = storage.getItem(VISITOR_ID_STORAGE_KEY);
    if (!visitorId) {
      const generateId = () => {
        if (window.crypto?.randomUUID) {
          return window.crypto.randomUUID();
        }
        const random = Math.floor(Math.random() * 1e9);
        return `visitor-${Date.now()}-${random}`;
      };
      visitorId = generateId();
      storage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
    }
    return visitorId;
  } catch (error) {
    console.warn("Unable to access localStorage for visitor ID", error);
    return "";
  }
}

function updateLiveChatIndicator(waitingCount) {
  const button = document.querySelector("[data-role='live-chat-button']");
  const badge = document.querySelector("[data-role='waiting-count']");
  if (!button || !badge) return;

  const count = Number(waitingCount) || 0;
  const originalLabel =
    button.dataset.originalLabel || button.getAttribute("aria-label") || "Open live chat";

  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = originalLabel;
  }

  if (count > 0) {
    badge.textContent = String(count);
    button.classList.add("has-waiting");
    const label = `${count} visitor${count === 1 ? "" : "s"} waiting to chat`;
    button.setAttribute("aria-label", label);
  } else {
    badge.textContent = "";
    button.classList.remove("has-waiting");
    button.setAttribute("aria-label", originalLabel);
  }
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

const slotDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const slotTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function parseSlotStart(slot) {
  if (!slot) return null;
  if (slot.start_iso) {
    const parsed = new Date(slot.start_iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (slot.date && slot.time) {
    const parsed = new Date(`${slot.date}T${slot.time}`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function computeSlotEnd(slot) {
  const start = parseSlotStart(slot);
  if (!start) return null;
  const minutes = Number(slot?.duration_minutes) || 0;
  return new Date(start.getTime() + minutes * 60000);
}

function formatSlotDateLabel(slot) {
  const start = parseSlotStart(slot);
  if (!start) {
    return slot?.date || "";
  }
  return slotDateFormatter.format(start);
}

function formatSlotTimeRange(slot) {
  const start = parseSlotStart(slot);
  const end = computeSlotEnd(slot);
  if (!start || !end) {
    return slot?.time || "";
  }
  return `${slotTimeFormatter.format(start)} – ${slotTimeFormatter.format(end)}`;
}

function formatSlotDuration(slot) {
  const minutes = Number(slot?.duration_minutes) || 0;
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hourLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
  return mins ? `${hourLabel} ${mins} min` : hourLabel;
}

function formatPrice(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function describeSlot(slot) {
  return [
    formatSlotDateLabel(slot),
    formatSlotTimeRange(slot),
    `${formatSlotDuration(slot)} walk`,
  ]
    .filter(Boolean)
    .join(" · ");
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
}

function formatTimestamp(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessages(container, messages) {
  if (!container) return;
  container.innerHTML = "";
  const roleLabels = {
    visitor: "Visitor",
    ai: "Autopilot",
    agent: "Agent",
  };

  messages.forEach((message) => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("chat-message");
    if (message.role) {
      wrapper.classList.add(message.role);
    }

    const meta = document.createElement("span");
    meta.classList.add("chat-meta");
    const label = roleLabels[message.role] || "Message";
    meta.textContent = `${label} · ${formatTimestamp(message.timestamp)}`;

    const body = document.createElement("p");
    body.textContent = message.content;

    wrapper.append(meta, body);
    container.appendChild(wrapper);
  });

  container.scrollTop = container.scrollHeight;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.response = response;
    throw error;
  }
  return response.json();
}

async function resolveErrorMessage(error, fallbackMessage) {
  if (!error?.response) {
    return fallbackMessage;
  }

  try {
    const data = await error.response.json();
    if (data?.error) {
      return data.error;
    }
  } catch (parseError) {
    // Ignore JSON parsing issues and fall back to the provided message.
  }

  return fallbackMessage;
}

function initLiveChatIndicator() {
  const button = document.querySelector("[data-role='live-chat-button']");
  const badge = document.querySelector("[data-role='waiting-count']");
  if (!button || !badge) return;

  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.getAttribute("aria-label") || "Open live chat";
  }

  async function refreshStatus() {
    try {
      const data = await fetchJson("/api/chat/status");
      updateLiveChatIndicator(data.waiting_count || 0);
    } catch (error) {
      // Ignore background refresh errors
    }
  }

  refreshStatus();
  setInterval(refreshStatus, 7000);
}

function initVisitorChat() {
  const chatRoot = document.querySelector("[data-role='visitor-chat']");
  if (!chatRoot) return;

  const messageContainer = chatRoot.querySelector("[data-chat-messages]");
  const statusLabel = chatRoot.querySelector("[data-role='visitor-status']");
  const feedback = chatRoot.querySelector("[data-role='visitor-feedback']");
  const form = chatRoot.querySelector("[data-role='visitor-form']");
  const textarea = form?.querySelector("textarea");
  const submitButton = form?.querySelector("button[type='submit']");
  const visitorId = getOrCreateVisitorId();

  function updateStatus(autopilot) {
    if (!statusLabel) return;
    statusLabel.textContent = autopilot
      ? "Autopilot is active — our AI helper is ready to answer your questions."
      : "Live chat is on — leave a message and a team member will reply here.";
  }

  async function refreshMessages() {
    if (!visitorId) return;
    try {
      const data = await fetchJson(
        `/api/chat/messages?visitor_id=${encodeURIComponent(visitorId)}`
      );
      renderMessages(messageContainer, data.messages || []);
      updateStatus(Boolean(data.autopilot));
      updateLiveChatIndicator(data.waiting_count || 0);
    } catch (error) {
      if (feedback) {
        feedback.textContent = "We couldn’t refresh the chat just now.";
        feedback.classList.add("error");
      }
    }
  }

  if (form && textarea && submitButton) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = textarea.value.trim();
      if (!message) {
        textarea.focus();
        return;
      }

      submitButton.disabled = true;
      if (feedback) {
        feedback.textContent = "Sending...";
        feedback.classList.remove("error");
      }

      try {
        const data = await fetchJson("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, visitor_id: visitorId }),
        });
        textarea.value = "";
        renderMessages(messageContainer, data.messages || []);
        updateStatus(Boolean(data.autopilot));
        updateLiveChatIndicator(data.waiting_count || 0);
        if (feedback) {
          feedback.textContent = data.autopilot
            ? "Reply sent instantly by Autopilot."
            : "Message delivered. A team member will reply here soon.";
        }
      } catch (error) {
        if (feedback) {
          feedback.textContent = "Sorry, we couldn’t send that message. Please try again.";
          feedback.classList.add("error");
        }
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  refreshMessages();
  setInterval(refreshMessages, 8000);
}

function initBookingSchedule() {
  const scheduleRoot = document.querySelector("[data-role='booking-schedule']");
  if (!scheduleRoot) return;

  const slotList = scheduleRoot.querySelector("[data-role='slot-list']");
  const emptyState = scheduleRoot.querySelector("[data-role='slot-empty']");
  const countLabel = scheduleRoot.querySelector("[data-role='slot-count']");
  const filterInput = scheduleRoot.querySelector("[data-role='date-filter']");
  const clearButton = scheduleRoot.querySelector("[data-action='clear-date']");

  const modal = document.querySelector("[data-role='booking-modal']");
  const modalForm = modal?.querySelector("[data-role='slot-booking-form']");
  const modalFeedback = modal?.querySelector("[data-role='modal-feedback']");
  const modalSummary = modal?.querySelector("[data-role='modal-slot-summary']");
  const hiddenSlotId = modalForm?.querySelector("[name='slot_id']");
  const firstInput = modalForm?.querySelector("input[name='name']");
  const submitButton = modalForm?.querySelector("button[type='submit']");

  let slots = [];
  let selectedSlot = null;

  function updateCount(value) {
    if (!countLabel) return;
    if (!value) {
      countLabel.textContent = "No slots";
      return;
    }
    countLabel.textContent = value === 1 ? "1 slot" : `${value} slots`;
  }

  function setModalVisibility(isOpen) {
    if (!modal) return;
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    document.body.classList.toggle("modal-open", isOpen);
    if (!isOpen && modalFeedback) {
      modalFeedback.textContent = "";
      modalFeedback.classList.remove("error");
    }
  }

  function closeModal() {
    selectedSlot = null;
    if (hiddenSlotId) {
      hiddenSlotId.value = "";
    }
    if (modalForm) {
      modalForm.reset();
    }
    setModalVisibility(false);
  }

  function openModal(slot) {
    if (!slot) return;
    selectedSlot = slot;
    if (hiddenSlotId) {
      hiddenSlotId.value = slot.id;
    }
    if (modalSummary) {
      modalSummary.textContent = `${describeSlot(slot)} — ${formatPrice(slot.price)}`;
    }
    setModalVisibility(true);
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 150);
    }
  }

  function renderSlots() {
    if (!slotList || !emptyState) return;
    slotList.innerHTML = "";
    const filterValue = filterInput?.value?.trim() || "";
    const filtered = filterValue
      ? slots.filter((slot) => slot.date === filterValue)
      : [...slots];

    updateCount(filtered.length);

    if (!filtered.length) {
      slotList.hidden = true;
      emptyState.hidden = false;
      return;
    }

    slotList.hidden = false;
    emptyState.hidden = true;

    filtered.forEach((slot) => {
      const card = document.createElement("article");
      card.classList.add("slot-card");

      const header = document.createElement("header");
      const title = document.createElement("h4");
      title.textContent = formatSlotDateLabel(slot);
      const priceBadge = document.createElement("span");
      priceBadge.classList.add("slot-pill");
      priceBadge.textContent = formatPrice(slot.price);
      header.append(title, priceBadge);

      const meta = document.createElement("div");
      meta.classList.add("slot-meta");
      const timeSpan = document.createElement("span");
      timeSpan.textContent = formatSlotTimeRange(slot);
      const durationSpan = document.createElement("span");
      durationSpan.textContent = formatSlotDuration(slot);
      meta.append(timeSpan, durationSpan);

      const action = document.createElement("div");
      action.classList.add("slot-action");
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("button", "primary");
      button.textContent = "Book this walk";
      button.addEventListener("click", () => openModal(slot));
      action.appendChild(button);

      card.append(header, meta);
      if (slot.notes) {
        const note = document.createElement("p");
        note.classList.add("slot-notes");
        note.textContent = slot.notes;
        card.appendChild(note);
      }
      card.appendChild(action);

      slotList.appendChild(card);
    });
  }

  async function loadSlots() {
    try {
      const data = await fetchJson("/api/slots");
      slots = data.slots ?? [];
      renderSlots();
    } catch (error) {
      const message = await resolveErrorMessage(
        error,
        "We couldn’t load availability right now."
      );
      if (emptyState) {
        emptyState.textContent = message;
        emptyState.hidden = false;
      }
      if (slotList) {
        slotList.innerHTML = "";
        slotList.hidden = true;
      }
      updateCount(0);
    }
  }

  if (filterInput) {
    filterInput.addEventListener("change", renderSlots);
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (filterInput) {
        filterInput.value = "";
      }
      renderSlots();
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action='close-modal']");
      if (target) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
        event.preventDefault();
        closeModal();
      }
    });
  }

  if (modalForm && submitButton) {
    modalForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!modalForm.checkValidity()) {
        modalForm.reportValidity();
        if (modalFeedback) {
          modalFeedback.textContent = "Please complete all required fields.";
          modalFeedback.classList.add("error");
        }
        return;
      }

      const formData = new FormData(modalForm);
      const payload = {
        slot_id: formData.get("slot_id"),
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        dog_name: formData.get("dog_name"),
        notes: formData.get("notes"),
      };

      if (!payload.slot_id) {
        if (modalFeedback) {
          modalFeedback.textContent = "Please pick an available slot before booking.";
          modalFeedback.classList.add("error");
        }
        return;
      }

      submitButton.disabled = true;
      if (modalFeedback) {
        modalFeedback.textContent = "Sending your booking...";
        modalFeedback.classList.remove("error");
      }

      try {
        const data = await fetchJson("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        slots = data.slots ?? slots.filter((slot) => slot.id !== payload.slot_id);
        renderSlots();
        if (modalFeedback) {
          modalFeedback.textContent = "Thank you! We’ll confirm shortly.";
        }
        setTimeout(() => {
          closeModal();
        }, 1300);
      } catch (error) {
        const message = await resolveErrorMessage(
          error,
          "We couldn’t save this booking. Please try another slot."
        );
        if (modalFeedback) {
          modalFeedback.textContent = message;
          modalFeedback.classList.add("error");
        }
        await loadSlots();
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  loadSlots();
}

function initAdminSchedule() {
  const root = document.querySelector("[data-role='schedule-manager']");
  if (!root) return;

  const slotForm = root.querySelector("[data-role='slot-form']");
  const feedback = root.querySelector("[data-role='schedule-feedback']");
  const slotList = root.querySelector("[data-role='admin-slot-list']");
  const slotEmpty = root.querySelector("[data-role='admin-slot-empty']");
  const slotCountElements = root.querySelectorAll("[data-role='admin-slot-count']");
  const bookingList = root.querySelector("[data-role='admin-booking-list']");
  const bookingEmpty = root.querySelector("[data-role='admin-booking-empty']");
  const bookingCountElements = root.querySelectorAll("[data-role='admin-booking-count']");

  let slots = [];
  let bookings = [];

  function setFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("error", Boolean(isError));
  }

  function availableSlots() {
    return slots.filter((slot) => !slot.is_booked);
  }

  function updateCounts() {
    const availableCount = availableSlots().length;
    slotCountElements.forEach((element) => {
      element.textContent = availableCount;
    });
    bookingCountElements.forEach((element) => {
      element.textContent = bookings.length;
    });
  }

  function renderSlotList() {
    if (!slotList || !slotEmpty) return;

    const available = availableSlots();
    slotList.innerHTML = "";

    if (!available.length) {
      slotList.hidden = true;
      slotEmpty.hidden = false;
      updateCounts();
      return;
    }

    slotList.hidden = false;
    slotEmpty.hidden = true;

    available.forEach((slot) => {
      const item = document.createElement("article");
      item.classList.add("schedule-item");
      item.dataset.id = slot.id;

      const header = document.createElement("header");
      const title = document.createElement("h4");
      title.textContent = formatSlotDateLabel(slot);
      const badges = document.createElement("div");
      badges.classList.add("schedule-badges");
      const priceBadge = document.createElement("span");
      priceBadge.classList.add("schedule-badge");
      priceBadge.textContent = formatPrice(slot.price);
      badges.appendChild(priceBadge);
      header.append(title, badges);

      const details = document.createElement("div");
      details.classList.add("schedule-details");
      const timeLine = document.createElement("p");
      timeLine.textContent = formatSlotTimeRange(slot);
      const durationLine = document.createElement("p");
      durationLine.textContent = `${formatSlotDuration(slot)} walk`;
      details.append(timeLine, durationLine);
      if (slot.notes) {
        const noteLine = document.createElement("p");
        noteLine.textContent = slot.notes;
        details.appendChild(noteLine);
      }

      const actions = document.createElement("div");
      actions.classList.add("schedule-actions");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.classList.add("button", "danger");
      deleteButton.dataset.action = "delete-slot";
      deleteButton.dataset.id = slot.id;
      deleteButton.textContent = "Remove slot";
      actions.appendChild(deleteButton);

      item.append(header, details, actions);
      slotList.appendChild(item);
    });

    updateCounts();
  }

  function renderBookingList() {
    if (!bookingList || !bookingEmpty) return;

    bookingList.innerHTML = "";

    if (!bookings.length) {
      bookingList.hidden = true;
      bookingEmpty.hidden = false;
      updateCounts();
      return;
    }

    bookingList.hidden = false;
    bookingEmpty.hidden = true;

    bookings.forEach((booking) => {
      const slot = booking.slot || slots.find((item) => item.id === booking.slot_id);
      const item = document.createElement("article");
      item.classList.add("schedule-item");
      item.dataset.id = booking.id;

      const header = document.createElement("header");
      const title = document.createElement("h4");
      const dogName = booking.dog_name ? `${booking.dog_name}` : "Booking";
      title.textContent = `${dogName} · ${booking.client_name}`;
      const badges = document.createElement("div");
      badges.classList.add("schedule-badges");
      const statusBadge = document.createElement("span");
      statusBadge.classList.add("schedule-badge");
      if (!booking.confirmed) {
        statusBadge.classList.add("pending");
        statusBadge.textContent = "Awaiting confirmation";
      } else {
        statusBadge.textContent = "Confirmed";
      }
      badges.appendChild(statusBadge);
      if (slot) {
        const priceBadge = document.createElement("span");
        priceBadge.classList.add("schedule-badge");
        priceBadge.textContent = formatPrice(slot.price);
        badges.appendChild(priceBadge);
      }
      header.append(title, badges);

      const details = document.createElement("div");
      details.classList.add("schedule-details");
      if (slot) {
        const timeLine = document.createElement("p");
        timeLine.textContent = `${formatSlotDateLabel(slot)} · ${formatSlotTimeRange(slot)}`;
        const durationLine = document.createElement("p");
        durationLine.textContent = `${formatSlotDuration(slot)} walk`;
        details.append(timeLine, durationLine);
      }

      const contactLine = document.createElement("p");
      const emailLink = document.createElement("a");
      emailLink.href = `mailto:${booking.email}`;
      emailLink.textContent = booking.email;
      contactLine.textContent = "Contact: ";
      contactLine.appendChild(emailLink);
      contactLine.append(` · ${booking.phone}`);
      details.appendChild(contactLine);

      if (booking.notes) {
        const notesLine = document.createElement("p");
        notesLine.textContent = `Notes: ${booking.notes}`;
        details.appendChild(notesLine);
      }

      const actions = document.createElement("div");
      actions.classList.add("schedule-actions");
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.classList.add("button", booking.confirmed ? "ghost" : "primary");
      toggleButton.dataset.action = "toggle-confirm";
      toggleButton.dataset.id = booking.id;
      toggleButton.dataset.confirmed = booking.confirmed ? "true" : "false";
      toggleButton.textContent = booking.confirmed
        ? "Mark as pending"
        : "Mark as confirmed";
      actions.appendChild(toggleButton);

      item.append(header, details, actions);
      bookingList.appendChild(item);
    });

    updateCounts();
  }

  async function loadSchedule() {
    try {
      const data = await fetchJson("/api/admin/schedule");
      slots = data.slots ?? [];
      bookings = data.bookings ?? [];
      renderSlotList();
      renderBookingList();
      setFeedback("");
    } catch (error) {
      const message = await resolveErrorMessage(
        error,
        "Unable to load the current schedule."
      );
      setFeedback(message, true);
    }
  }

  if (slotForm) {
    const submitButton = slotForm.querySelector("button[type='submit']");
    slotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!slotForm.checkValidity()) {
        slotForm.reportValidity();
        setFeedback("Please complete each required field before saving.", true);
        return;
      }

      const formData = new FormData(slotForm);
      const payload = {
        date: formData.get("date"),
        time: formData.get("time"),
        duration_minutes: Number(formData.get("duration_minutes")),
        price: formData.get("price"),
        notes: formData.get("notes"),
      };

      if (submitButton) {
        submitButton.disabled = true;
      }
      setFeedback("Publishing slot...");

      try {
        const data = await fetchJson("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        slots = data.slots ?? slots;
        renderSlotList();
        setFeedback("Slot added to your availability.");
        slotForm.reset();
      } catch (error) {
        const message = await resolveErrorMessage(
          error,
          "We couldn’t add that slot."
        );
        setFeedback(message, true);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (slotList) {
    slotList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action='delete-slot']");
      if (!button) return;
      const { id } = button.dataset;
      if (!id) return;

      button.disabled = true;
      setFeedback("Removing slot...");

      try {
        const data = await fetchJson(`/api/admin/slots/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        slots = data.slots ?? slots.filter((slot) => slot.id !== id);
        renderSlotList();
        setFeedback("Slot removed.");
      } catch (error) {
        const message = await resolveErrorMessage(
          error,
          "Unable to remove this slot."
        );
        setFeedback(message, true);
      } finally {
        button.disabled = false;
      }
    });
  }

  if (bookingList) {
    bookingList.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action='toggle-confirm']");
      if (!button) return;
      const { id } = button.dataset;
      if (!id) return;

      const currentState = button.dataset.confirmed === "true";
      button.disabled = true;
      setFeedback("Updating booking...");

      try {
        const data = await fetchJson(`/api/admin/bookings/${encodeURIComponent(id)}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: !currentState }),
        });
        bookings = data.bookings ?? bookings;
        renderBookingList();
        setFeedback(!currentState ? "Booking marked as confirmed." : "Booking set to pending.");
      } catch (error) {
        const message = await resolveErrorMessage(
          error,
          "We couldn’t update that booking."
        );
        setFeedback(message, true);
      } finally {
        button.disabled = false;
      }
    });
  }

  loadSchedule();
  setInterval(loadSchedule, 20000);
}

function initAdminChat() {
  const adminRoot = document.querySelector("[data-role='admin-chat']");
  if (!adminRoot) return;

  const messageContainer = adminRoot.querySelector("[data-chat-messages]");
  const chatHint = adminRoot.querySelector("[data-role='chat-hint']");
  const modeDescriptions = adminRoot.querySelectorAll("[data-role='mode-description']");
  const conversationSummaries = adminRoot.querySelectorAll(
    "[data-role='conversation-summary']"
  );
  const settingsForm = adminRoot.querySelector("#chat-settings-form");
  const autopilotToggle = adminRoot.querySelector("#autopilot-toggle");
  const businessContext = adminRoot.querySelector("#business-context");
  const settingsFeedback = adminRoot.querySelector("[data-role='settings-feedback']");
  const replyForm = adminRoot.querySelector("#agent-reply-form");
  const replyTextarea = adminRoot.querySelector("#agent-message");
  const replyFeedback = adminRoot.querySelector("[data-role='agent-feedback']");
  const replyButton = replyForm?.querySelector("button[type='submit']");
  const visitorList = adminRoot.querySelector("[data-role='visitor-list']");
  const visitorHeading = adminRoot.querySelector("[data-role='visitor-heading']");
  const visitorStatus = adminRoot.querySelector("[data-role='visitor-status']");

  let autopilotEnabled = false;
  let selectedVisitorId = "";
  let visitorSummaries = [];

  function updateReplyAvailability() {
    const disableInput = autopilotEnabled || !selectedVisitorId;
    if (replyTextarea) {
      replyTextarea.disabled = disableInput;
    }
    if (replyButton) {
      replyButton.disabled = disableInput;
    }
  }

  function updateConversationSummary() {
    if (!conversationSummaries.length) {
      return;
    }
    const activeCount = visitorSummaries.length;
    const waitingCount = visitorSummaries.filter((visitor) => visitor.waiting).length;
    const summaryText =
      activeCount > 0
        ? `${activeCount} active conversation${activeCount === 1 ? "" : "s"}${
            waitingCount ? ` · ${waitingCount} waiting` : ""
          }`
        : "No active visitors right now.";
    conversationSummaries.forEach((element) => {
      element.textContent = summaryText;
    });
  }

  function updateModeDescription(isAutopilot) {
    autopilotEnabled = Boolean(isAutopilot);
    const descriptionText = autopilotEnabled
      ? "Visitors chat with the AI assistant."
      : "Visitors will wait for a live reply from you.";
    modeDescriptions.forEach((element) => {
      element.textContent = descriptionText;
    });
    if (!selectedVisitorId && chatHint) {
      chatHint.textContent = autopilotEnabled
        ? "Autopilot is active. Disable it to respond manually."
        : "Select a visitor to view their messages and reply.";
    }
    updateReplyAvailability();
  }

  function updateVisitorStatusTag(isReturning) {
    if (!visitorStatus) return;
    if (!selectedVisitorId) {
      visitorStatus.textContent = "";
      visitorStatus.classList.remove("returning");
      return;
    }
    visitorStatus.textContent = isReturning ? "Returning visitor" : "New visitor";
    visitorStatus.classList.toggle("returning", Boolean(isReturning));
  }

  function setVisitorHeading(label) {
    if (!visitorHeading) return;
    if (!selectedVisitorId) {
      visitorHeading.textContent = "No active visitors";
      return;
    }
    const fallback = selectedVisitorId.slice(-6).toUpperCase();
    const headingLabel = label || fallback;
    visitorHeading.textContent = `Visitor ${headingLabel}`;
  }

  function clearConversation() {
    if (messageContainer) {
      renderMessages(messageContainer, []);
    }
    setVisitorHeading("");
    updateVisitorStatusTag(false);
    if (chatHint) {
      chatHint.textContent = autopilotEnabled
        ? "Autopilot is active. Disable it to respond manually."
        : "No visitors are waiting right now.";
    }
    updateReplyAvailability();
    updateConversationSummary();
  }

  async function loadSettings() {
    try {
      const data = await fetchJson("/api/admin/chat-settings");
      if (autopilotToggle) {
        autopilotToggle.checked = Boolean(data.autopilot);
      }
      if (businessContext) {
        businessContext.value = data.business_context || "";
      }
      updateModeDescription(Boolean(data.autopilot));
    } catch (error) {
      if (settingsFeedback) {
        settingsFeedback.textContent = "Couldn’t load settings. Refresh the page.";
        settingsFeedback.classList.add("error");
      }
    }
  }

  async function saveSettings(autopilot, context) {
    const payload = {
      autopilot,
      business_context: context,
    };
    return fetchJson("/api/admin/chat-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function renderVisitorList(summaries) {
    if (!visitorList) return;
    visitorList.innerHTML = "";

    if (!summaries.length) {
      const empty = document.createElement("p");
      empty.classList.add("visitor-list-empty");
      empty.textContent = "No visitors yet.";
      visitorList.appendChild(empty);
      return;
    }

    summaries.forEach((summary, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.classList.add("visitor-item");
      if (summary.visitor_id === selectedVisitorId) {
        item.classList.add("active");
      }
      if (summary.waiting) {
        item.classList.add("waiting");
      }

      const badge = document.createElement("span");
      badge.classList.add("visitor-badge");
      badge.textContent = summary.label || `V${String(index + 1).padStart(2, "0")}`;

      const info = document.createElement("div");
      info.classList.add("visitor-info");

      const meta = document.createElement("p");
      meta.classList.add("visitor-meta");
      const parts = [];
      parts.push(summary.is_returning ? "Returning" : "New");
      if (summary.waiting) {
        parts.push("Waiting");
      }
      meta.textContent = parts.join(" · ");

      const preview = document.createElement("p");
      preview.classList.add("visitor-preview");
      const previewSource = summary.last_message?.content || "No messages yet.";
      preview.textContent =
        previewSource.length > 80 ? `${previewSource.slice(0, 77)}…` : previewSource;

      info.append(meta, preview);
      item.append(badge, info);

      item.addEventListener("click", () => {
        if (summary.visitor_id === selectedVisitorId) {
          return;
        }
        selectedVisitorId = summary.visitor_id;
        renderVisitorList(visitorSummaries);
        refreshMessages();
      });

      visitorList.appendChild(item);
    });
  }

  async function refreshMessages() {
    if (!selectedVisitorId) {
      clearConversation();
      return;
    }
    try {
      const data = await fetchJson(
        `/api/chat/messages?visitor_id=${encodeURIComponent(selectedVisitorId)}`
      );
      renderMessages(messageContainer, data.messages || []);
      setVisitorHeading(data.label || "");
      updateVisitorStatusTag(Boolean(data.is_returning));
      updateLiveChatIndicator(data.waiting_count || 0);
      if (chatHint) {
        if (!data.messages || data.messages.length === 0) {
          chatHint.textContent = autopilotEnabled
            ? "Autopilot is active. Disable it to respond manually."
            : "No messages from this visitor yet.";
        } else {
          chatHint.textContent = autopilotEnabled
            ? "Autopilot is active. Disable it to respond manually."
            : "Live chat is on. New visitor messages will appear here.";
        }
      }
      updateReplyAvailability();
    } catch (error) {
      if (replyFeedback && !replyFeedback.textContent) {
        replyFeedback.textContent = "Unable to refresh messages.";
        replyFeedback.classList.add("error");
      }
    }
  }

  async function refreshConversations() {
    try {
      const data = await fetchJson("/api/admin/conversations");
      updateModeDescription(Boolean(data.autopilot));
      updateLiveChatIndicator(data.waiting_count || 0);
      visitorSummaries = data.visitors || [];

      if (selectedVisitorId && !visitorSummaries.some((v) => v.visitor_id === selectedVisitorId)) {
        selectedVisitorId = "";
      }

      if (!selectedVisitorId && visitorSummaries.length) {
        const waitingVisitor = visitorSummaries.find((visitor) => visitor.waiting);
        selectedVisitorId = (waitingVisitor || visitorSummaries[0]).visitor_id;
      }

      renderVisitorList(visitorSummaries);
      updateConversationSummary();

      if (selectedVisitorId) {
        await refreshMessages();
      } else {
        clearConversation();
      }
    } catch (error) {
      if (settingsFeedback && !settingsFeedback.textContent) {
        settingsFeedback.textContent = "Couldn’t load conversations. Refresh the page.";
        settingsFeedback.classList.add("error");
      }
    }
  }

  if (settingsForm && autopilotToggle && businessContext) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (settingsFeedback) {
        settingsFeedback.textContent = "Saving...";
        settingsFeedback.classList.remove("error");
      }
      try {
        const data = await saveSettings(
          autopilotToggle.checked,
          businessContext.value.trim()
        );
        updateModeDescription(Boolean(data.autopilot));
        if (settingsFeedback) {
          settingsFeedback.textContent = "Settings saved.";
        }
      } catch (error) {
        if (settingsFeedback) {
          settingsFeedback.textContent = "Couldn’t save settings. Try again.";
          settingsFeedback.classList.add("error");
        }
      }
    });

    autopilotToggle.addEventListener("change", () => {
      updateModeDescription(autopilotToggle.checked);
    });
  }

  if (replyForm && replyTextarea && replyButton) {
    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = replyTextarea.value.trim();
      if (!message) {
        replyTextarea.focus();
        return;
      }
      if (!selectedVisitorId) {
        if (replyFeedback) {
          replyFeedback.textContent = "Select a visitor to reply to.";
          replyFeedback.classList.add("error");
        }
        return;
      }

      replyButton.disabled = true;
      replyTextarea.disabled = true;
      if (replyFeedback) {
        replyFeedback.textContent = "Sending...";
        replyFeedback.classList.remove("error");
      }

      try {
        const data = await fetchJson("/api/chat/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, visitor_id: selectedVisitorId }),
        });
        replyTextarea.value = "";
        renderMessages(messageContainer, data.messages || []);
        updateVisitorStatusTag(Boolean(data.is_returning));
        updateLiveChatIndicator(data.waiting_count || 0);
        if (replyFeedback) {
          replyFeedback.textContent = "Reply sent.";
        }
        await refreshConversations();
      } catch (error) {
        if (replyFeedback) {
          replyFeedback.textContent =
            error?.response?.status === 400
              ? "Autopilot is enabled. Turn it off to reply manually."
              : "Couldn’t send reply. Try again.";
          replyFeedback.classList.add("error");
        }
      } finally {
        updateReplyAvailability();
      }
    });
  }

  loadSettings();
  refreshConversations();
  setInterval(refreshConversations, 7000);
  setInterval(refreshMessages, 6000);
}

function initBanManager() {
  const root = document.querySelector("[data-role='ban-manager']");
  if (!root) return;

  const form = root.querySelector("#ban-visitor-form");
  const identifierInput = root.querySelector("#ban-identifier");
  const reasonInput = root.querySelector("#ban-reason");
  const feedback = root.querySelector("[data-role='ban-feedback']");
  const tableBody = root.querySelector("[data-role='ban-table-body']");
  const emptyState = root.querySelector("[data-role='ban-empty']");
  const table = root.querySelector("[data-role='ban-table']");
  const countPills = root.querySelectorAll("[data-role='ban-count']");

  let visitors = [];

  function setFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("error", Boolean(isError));
  }

  function setFormDisabled(isDisabled) {
    if (!form) return;
    const elements = form.querySelectorAll("input, button");
    elements.forEach((element) => {
      element.disabled = isDisabled;
    });
  }

  function updateCount() {
    const activeCount = visitors.filter((visitor) => visitor.active).length;
    countPills.forEach((pill) => {
      pill.textContent = activeCount;
      if (activeCount === 0) {
        pill.dataset.state = "empty";
      } else {
        delete pill.dataset.state;
      }
    });
  }

  function renderVisitors() {
    if (!tableBody || !emptyState || !table) return;

    tableBody.innerHTML = "";

    if (!visitors.length) {
      emptyState.hidden = false;
      table.hidden = true;
      updateCount();
      return;
    }

    emptyState.hidden = true;
    table.hidden = false;

    visitors.forEach((visitor) => {
      const row = document.createElement("tr");
      row.dataset.id = visitor.id;

      const visitorCell = document.createElement("td");
      visitorCell.textContent = visitor.id;

      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");
      statusBadge.classList.add("ban-status");
      statusBadge.classList.add(visitor.active ? "active" : "inactive");
      statusBadge.textContent = visitor.active ? "Active ban" : "Inactive";
      statusCell.appendChild(statusBadge);

      const reasonCell = document.createElement("td");
      reasonCell.textContent = visitor.reason || "—";

      const createdCell = document.createElement("td");
      createdCell.textContent = formatDateTime(visitor.created_at || visitor.updated_at);

      const actionsCell = document.createElement("td");
      actionsCell.classList.add("actions-cell");
      const actionsWrapper = document.createElement("div");
      actionsWrapper.classList.add("ban-actions");

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.classList.add("ban-action", visitor.active ? "unban" : "reinstate");
      toggleButton.dataset.action = visitor.active ? "unban" : "reinstate";
      toggleButton.dataset.id = visitor.id;
      toggleButton.textContent = visitor.active ? "Unban" : "Reinstate";
      toggleButton.setAttribute(
        "aria-label",
        visitor.active
          ? `Unban visitor ${visitor.id}`
          : `Reinstate ban for visitor ${visitor.id}`
      );

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.classList.add("ban-action", "delete");
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.id = visitor.id;
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete record for visitor ${visitor.id}`);

      actionsWrapper.append(toggleButton, deleteButton);
      actionsCell.appendChild(actionsWrapper);

      row.append(visitorCell, statusCell, reasonCell, createdCell, actionsCell);
      tableBody.appendChild(row);
    });

    updateCount();
  }

  async function loadVisitors() {
    try {
      const data = await fetchJson("/api/admin/banned-visitors");
      visitors = data.visitors ?? [];
      renderVisitors();
      if (!visitors.length) {
        setFeedback("No banned visitors at the moment.");
      } else {
        setFeedback("");
      }
    } catch (error) {
      setFeedback("Couldn’t load the banned visitors list.", true);
    }
  }

  if (form && identifierInput) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const identifier = identifierInput.value.trim();
      const reason = reasonInput?.value.trim() ?? "";
      if (!identifier) {
        identifierInput.focus();
        return;
      }

      setFormDisabled(true);
      setFeedback("Saving restriction...");

      try {
        const payload = { identifier, reason };
        const data = await fetchJson("/api/admin/banned-visitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        visitors = data.visitors ?? visitors;
        renderVisitors();
        form.reset();
        setFeedback("Visitor has been banned.");
      } catch (error) {
        if (error?.response?.status === 400) {
          setFeedback("Please provide a visitor identifier to ban.", true);
        } else {
          setFeedback("We couldn’t save that ban. Try again.", true);
        }
      } finally {
        setFormDisabled(false);
      }
    });
  }

  if (tableBody) {
    tableBody.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const { action, id } = button.dataset;
      if (!id) return;

      button.disabled = true;

      try {
        if (action === "unban") {
          const data = await fetchJson(`/api/admin/banned-visitors/${encodeURIComponent(id)}/unban`, {
            method: "POST",
          });
          visitors = data.visitors ?? visitors;
          setFeedback(`Visitor ${id} has been unbanned.`);
        } else if (action === "reinstate") {
          const visitor = visitors.find((item) => item.id === id);
          const reason = visitor?.reason ?? "";
          const data = await fetchJson("/api/admin/banned-visitors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: id, reason }),
          });
          visitors = data.visitors ?? visitors;
          setFeedback(`Ban reinstated for ${id}.`);
        } else if (action === "delete") {
          const data = await fetchJson(`/api/admin/banned-visitors/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          visitors = data.visitors ?? visitors.filter((item) => item.id !== id);
          setFeedback(`Removed ${id} from the list.`);
        }
        renderVisitors();
      } catch (error) {
        setFeedback("That action could not be completed.", true);
      } finally {
        button.disabled = false;
      }
    });
  }

  loadVisitors();
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initAdminCards();
  initForms();
  initLiveChatIndicator();
  initBookingSchedule();
  initVisitorChat();
  initAdminSchedule();
  initAdminChat();
  initBanManager();
});
