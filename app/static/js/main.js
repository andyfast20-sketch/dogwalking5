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

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initForms();
});
