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

function updateDashboardMetric(metric, value) {
  if (!metric) return;
  const safeValue = typeof value === "number" ? value : Number(value) || 0;
  document
    .querySelectorAll(`[data-metric='${metric}']`)
    .forEach((element) => {
      element.textContent = String(safeValue);
    });
}

function initAdminCards() {
  if (adminCardsInitialized) return;

  const cards = document.querySelectorAll("[data-card]");
  if (!cards.length) {
    return;
  }

  adminCardsInitialized = true;

  let expandedCard = null;

  const grid = document.querySelector("[data-role='admin-grid']");
  const backButton = document.querySelector("[data-role='admin-back']");

  const enterDetailMode = (card) => {
    if (grid) {
      grid.classList.add("is-detail");
    }
    card.classList.add("is-active");
    if (backButton) {
      backButton.hidden = false;
    }
  };

  const exitDetailMode = () => {
    if (grid) {
      grid.classList.remove("is-detail");
    }
    if (backButton) {
      backButton.hidden = true;
    }
  };

  const collapseCard = (card, { keepDetailMode = false } = {}) => {
    if (!card) return;
    const toggle = card.querySelector("[data-card-toggle]");
    const body = card.querySelector("[data-card-body]");
    if (!toggle || !body) return;
    card.classList.remove("is-expanded");
    card.classList.remove("is-active");
    toggle.setAttribute("aria-expanded", "false");
    body.hidden = true;
    if (!keepDetailMode) {
      exitDetailMode();
    }
  };

  const expandCard = (card) => {
    if (!card) return;
    const toggle = card.querySelector("[data-card-toggle]");
    const body = card.querySelector("[data-card-body]");
    if (!toggle || !body) return;
    card.classList.add("is-expanded");
    toggle.setAttribute("aria-expanded", "true");
    body.hidden = false;
    enterDetailMode(card);
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
        collapseCard(expandedCard, { keepDetailMode: true });
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

  const defaultCard = document.querySelector("[data-card][data-card-default]");
  if (defaultCard) {
    expandCard(defaultCard);
    expandedCard = defaultCard;
  }

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

  if (backButton) {
    backButton.addEventListener("click", () => {
      if (expandedCard) {
        const currentCard = expandedCard;
        const toggle = currentCard.querySelector("[data-card-toggle]");
        collapseCard(currentCard);
        expandedCard = null;
        if (toggle) {
          toggle.focus();
        }
      } else {
        exitDetailMode();
      }
    });
  }
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

function handleFormSubmission(formId, feedbackSelector, successMessage, onSubmit) {
  const form = document.getElementById(formId);
  const feedback = document.querySelector(feedbackSelector);

  if (!form || !feedback) return;

  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      feedback.textContent = "Please complete all required fields.";
      feedback.classList.add("error");
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }
    feedback.textContent = "Sending...";
    feedback.classList.remove("error");

    try {
      const formData = new FormData(form);
      if (typeof onSubmit === "function") {
        await onSubmit(formData);
      }
      feedback.textContent = successMessage;
      feedback.classList.remove("error");
      form.reset();
    } catch (error) {
      const message = await resolveErrorMessage(
        error,
        "We couldn’t submit the form right now. Please try again."
      );
      feedback.textContent = message;
      feedback.classList.add("error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

function initForms() {
  handleFormSubmission(
    "contact-form",
    "[data-role='contact-feedback']",
    "Thank you — we’ll be in touch soon!",
    async (formData) => {
      const getValue = (key) => {
        const value = formData.get(key);
        return value ? value.toString().trim() : "";
      };

      const payload = {
        name: getValue("name"),
        email: getValue("email"),
        phone: getValue("phone"),
        message: getValue("message"),
      };

      await fetchJson("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      window.dispatchEvent(new CustomEvent("enquiries:updated"));
    }
  );
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
    updateDashboardMetric("open-slots", availableCount);
    updateDashboardMetric("bookings", bookings.length);
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

function initAdminEnquiries() {
  const root = document.querySelector("[data-role='enquiry-manager']");
  if (!root) return;

  const list = root.querySelector("[data-role='enquiry-list']");
  const emptyState = root.querySelector("[data-role='enquiry-empty']");
  const feedback = root.querySelector("[data-role='enquiry-feedback']");
  const refreshButton = root.querySelector("[data-role='enquiry-refresh']");
  const openCountLabels = root.querySelectorAll("[data-role='enquiry-open-count']");
  const totalCountLabels = root.querySelectorAll("[data-role='enquiry-total-count']");
  const summaryLabel = root.querySelector("[data-role='enquiry-summary']");
  const cardToggle = root.querySelector("[data-card-toggle]");

  let enquiries = [];
  let isLoading = false;
  let feedbackTimeoutId = null;

  function clearFeedbackLater() {
    if (feedbackTimeoutId) {
      window.clearTimeout(feedbackTimeoutId);
    }
    if (feedback && feedback.textContent) {
      feedbackTimeoutId = window.setTimeout(() => {
        if (feedback) {
          feedback.textContent = "";
          feedback.classList.remove("error");
        }
      }, 4000);
    }
  }

  function setFeedback(message, isError = false) {
    if (!feedback) return;
    if (feedbackTimeoutId) {
      window.clearTimeout(feedbackTimeoutId);
      feedbackTimeoutId = null;
    }
    feedback.textContent = message;
    feedback.classList.toggle("error", Boolean(isError));
    if (message) {
      clearFeedbackLater();
    }
  }

  function updateCounts(counts) {
    const openCount = Number(counts?.open ?? enquiries.filter((item) => !item.completed).length);
    const totalCount = Number(counts?.total ?? enquiries.length);

    openCountLabels.forEach((element) => {
      element.textContent = String(openCount);
    });
    totalCountLabels.forEach((element) => {
      element.textContent = String(totalCount);
    });

    if (summaryLabel) {
      if (totalCount === 0) {
        summaryLabel.textContent = "No enquiries yet.";
      } else if (openCount === 0) {
        summaryLabel.textContent = "All enquiries handled.";
      } else {
        const label = openCount === 1 ? "enquiry" : "enquiries";
        summaryLabel.textContent = `${openCount} open ${label}`;
      }
    }
  }

  function renderList(counts) {
    if (!list || !emptyState) return;

    updateCounts(counts);
    list.innerHTML = "";

    if (!enquiries.length) {
      list.hidden = true;
      emptyState.hidden = false;
      return;
    }

    list.hidden = false;
    emptyState.hidden = true;

    enquiries.forEach((enquiry) => {
      const item = document.createElement("li");
      item.classList.add("enquiry-item");
      if (enquiry.completed) {
        item.classList.add("is-complete");
      }

      const header = document.createElement("div");
      header.classList.add("enquiry-item__header");

      const title = document.createElement("h4");
      title.textContent = enquiry.name || "Enquiry";
      header.appendChild(title);

      const statusBadge = document.createElement("span");
      statusBadge.classList.add("status-badge");
      if (enquiry.completed) {
        statusBadge.classList.add("status-complete");
        statusBadge.textContent = "Dealt with";
      } else {
        statusBadge.textContent = "Open";
      }
      header.appendChild(statusBadge);

      const meta = document.createElement("div");
      meta.classList.add("enquiry-item__meta");
      const receivedLabel = document.createElement("span");
      receivedLabel.textContent = `Received ${formatDateTime(enquiry.created_at || enquiry.createdAt)}`;
      meta.appendChild(receivedLabel);

      if (enquiry.email) {
        const emailLink = document.createElement("a");
        emailLink.href = `mailto:${enquiry.email}`;
        emailLink.textContent = enquiry.email;
        emailLink.classList.add("enquiry-contact");
        meta.appendChild(emailLink);
      }

      if (enquiry.phone) {
        const phoneLink = document.createElement("a");
        phoneLink.href = `tel:${enquiry.phone}`;
        phoneLink.textContent = enquiry.phone;
        phoneLink.classList.add("enquiry-contact");
        meta.appendChild(phoneLink);
      }

      if (enquiry.completed && enquiry.completed_at) {
        const completedLabel = document.createElement("span");
        completedLabel.textContent = `Completed ${formatDateTime(enquiry.completed_at)}`;
        meta.appendChild(completedLabel);
      }

      const message = document.createElement("p");
      message.classList.add("enquiry-item__message");
      message.textContent = enquiry.message || "No message provided.";

      const actions = document.createElement("div");
      actions.classList.add("enquiry-actions");
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.classList.add("button", enquiry.completed ? "ghost" : "secondary");
      toggleButton.dataset.action = "toggle-enquiry";
      toggleButton.dataset.id = enquiry.id;
      toggleButton.dataset.completed = enquiry.completed ? "false" : "true";
      toggleButton.textContent = enquiry.completed ? "Mark as open" : "Mark as dealt";
      actions.appendChild(toggleButton);

      if (enquiry.email) {
        const replyLink = document.createElement("a");
        replyLink.classList.add("button", "ghost");
        replyLink.href = `mailto:${enquiry.email}`;
        replyLink.textContent = "Email reply";
        replyLink.setAttribute("role", "button");
        actions.appendChild(replyLink);
      }

      item.append(header, meta, message, actions);
      list.appendChild(item);
    });
  }

  async function loadEnquiries(showLoading = false) {
    if (isLoading) return;
    isLoading = true;

    if (showLoading) {
      setFeedback("Refreshing enquiries...");
    }
    if (refreshButton && showLoading) {
      refreshButton.disabled = true;
    }

    try {
      const data = await fetchJson("/api/admin/enquiries");
      enquiries = Array.isArray(data.enquiries) ? data.enquiries : [];
      renderList(data.counts);
      if (showLoading) {
        setFeedback("Enquiries updated.");
      } else {
        setFeedback("");
      }
    } catch (error) {
      setFeedback("We couldn’t load enquiries right now.", true);
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
      }
      isLoading = false;
    }
  }

  async function toggleEnquiry(enquiryId, completed) {
    if (!enquiryId) return;
    try {
      const data = await fetchJson(`/api/admin/enquiries/${encodeURIComponent(enquiryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      enquiries = Array.isArray(data.enquiries) ? data.enquiries : enquiries;
      renderList(data.counts);
      setFeedback(completed ? "Enquiry marked as dealt with." : "Enquiry reopened.");
    } catch (error) {
      const message = await resolveErrorMessage(
        error,
        "We couldn’t update that enquiry just now."
      );
      setFeedback(message, true);
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      loadEnquiries(true);
    });
  }

  if (list) {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='toggle-enquiry']");
      if (!button) return;
      const { id, completed } = button.dataset;
      toggleEnquiry(id, completed === "true");
    });
  }

  window.addEventListener("enquiries:updated", () => {
    loadEnquiries();
  });

  if (cardToggle) {
    cardToggle.addEventListener("click", () => {
      if (root.classList.contains("is-expanded")) {
        loadEnquiries(true);
      }
    });
  }

  loadEnquiries(true);
  setInterval(() => {
    if (!document.hidden) {
      loadEnquiries();
    }
  }, 20000);
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
  const tableWrapper = table?.closest(".table-wrapper");
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
      if (tableWrapper) {
        tableWrapper.hidden = true;
      }
      updateCount();
      return;
    }

    emptyState.hidden = true;
    table.hidden = false;
    if (tableWrapper) {
      tableWrapper.hidden = false;
    }

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
  initForms();
  initBookingSchedule();

  const runDeferredInitialisers = () => {
    initAdminCards();
    initAdminSchedule();
    initAdminEnquiries();
    initBanManager();
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(runDeferredInitialisers, { timeout: 1200 });
  } else {
    window.setTimeout(runDeferredInitialisers, 250);
  }
});
