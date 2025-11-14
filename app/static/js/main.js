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

function initVisitorChat() {
  const chatRoot = document.querySelector("[data-role='visitor-chat']");
  if (!chatRoot) return;

  const messageContainer = chatRoot.querySelector("[data-chat-messages]");
  const statusLabel = chatRoot.querySelector("[data-role='visitor-status']");
  const feedback = chatRoot.querySelector("[data-role='visitor-feedback']");
  const form = chatRoot.querySelector("[data-role='visitor-form']");
  const textarea = form?.querySelector("textarea");
  const submitButton = form?.querySelector("button[type='submit']");

  function updateStatus(autopilot) {
    if (!statusLabel) return;
    statusLabel.textContent = autopilot
      ? "Autopilot is active — our AI helper is ready to answer your questions."
      : "Live chat is on — leave a message and a team member will reply here.";
  }

  async function refreshMessages() {
    try {
      const data = await fetchJson("/api/chat/messages");
      renderMessages(messageContainer, data.messages || []);
      updateStatus(Boolean(data.autopilot));
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
          body: JSON.stringify({ message }),
        });
        textarea.value = "";
        renderMessages(messageContainer, data.messages || []);
        updateStatus(Boolean(data.autopilot));
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

function initAdminChat() {
  const adminRoot = document.querySelector("[data-role='admin-chat']");
  if (!adminRoot) return;

  const messageContainer = adminRoot.querySelector("[data-chat-messages]");
  const chatHint = adminRoot.querySelector("[data-role='chat-hint']");
  const modeDescription = adminRoot.querySelector("[data-role='mode-description']");
  const settingsForm = adminRoot.querySelector("#chat-settings-form");
  const autopilotToggle = adminRoot.querySelector("#autopilot-toggle");
  const businessContext = adminRoot.querySelector("#business-context");
  const settingsFeedback = adminRoot.querySelector("[data-role='settings-feedback']");
  const replyForm = adminRoot.querySelector("#agent-reply-form");
  const replyTextarea = adminRoot.querySelector("#agent-message");
  const replyFeedback = adminRoot.querySelector("[data-role='agent-feedback']");
  const replyButton = replyForm?.querySelector("button[type='submit']");

  function updateModeDescription(isAutopilot) {
    if (modeDescription) {
      modeDescription.textContent = isAutopilot
        ? "Visitors chat with the AI assistant."
        : "Visitors will wait for a live reply from you.";
    }
    if (chatHint) {
      chatHint.textContent = isAutopilot
        ? "Autopilot is active. Disable it to respond manually."
        : "Live chat is on. New visitor messages will appear here.";
    }
    if (replyTextarea) {
      replyTextarea.disabled = isAutopilot;
    }
    if (replyButton) {
      replyButton.disabled = isAutopilot;
    }
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
    const data = await fetchJson("/api/admin/chat-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return data;
  }

  async function refreshMessages() {
    try {
      const data = await fetchJson("/api/chat/messages");
      renderMessages(messageContainer, data.messages || []);
      updateModeDescription(Boolean(data.autopilot));
    } catch (error) {
      if (replyFeedback && !replyFeedback.textContent) {
        replyFeedback.textContent = "Unable to refresh messages.";
        replyFeedback.classList.add("error");
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
          body: JSON.stringify({ message }),
        });
        replyTextarea.value = "";
        renderMessages(messageContainer, data.messages || []);
        if (replyFeedback) {
          replyFeedback.textContent = "Reply sent.";
        }
      } catch (error) {
        if (replyFeedback) {
          replyFeedback.textContent =
            error?.response?.status === 400
              ? "Autopilot is enabled. Turn it off to reply manually."
              : "Couldn’t send reply. Try again.";
          replyFeedback.classList.add("error");
        }
      } finally {
        replyTextarea.disabled = autopilotToggle?.checked ?? false;
        replyButton.disabled = autopilotToggle?.checked ?? false;
      }
    });
  }

  loadSettings();
  refreshMessages();
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
  const countPill = root.querySelector("[data-role='ban-count']");

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
    if (!countPill) return;
    const activeCount = visitors.filter((visitor) => visitor.active).length;
    countPill.textContent = activeCount;
    if (activeCount === 0) {
      countPill.dataset.state = "empty";
    } else {
      delete countPill.dataset.state;
    }
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
  initForms();
  initVisitorChat();
  initAdminChat();
  initBanManager();
});
