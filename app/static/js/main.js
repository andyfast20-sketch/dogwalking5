async function submitWalk(event) {
  event.preventDefault();

  const form = event.target;
  const message = document.getElementById("form-message");

  const payload = {
    walker: form.walker.value.trim(),
    dog: form.dog.value.trim(),
    time: form.time.value,
    duration: form.duration.value,
  };

  try {
    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to schedule walk");
    }

    const walk = await response.json();
    appendWalk(walk);
    message.textContent = `Scheduled walk for ${walk.dog} with ${walk.walker}.`;
    message.className = "success";
    form.reset();
  } catch (error) {
    console.error(error);
    message.textContent = "Sorry, something went wrong. Please try again.";
    message.className = "error";
  }
}

function appendWalk(walk) {
  const list = document.getElementById("walk-list");
  const emptyState = list.querySelector(".empty");
  if (emptyState) {
    emptyState.remove();
  }

  const item = document.createElement("li");
  item.dataset.id = walk.id;

  item.innerHTML = `
    <span class="dog">🐕 ${walk.dog}</span>
    <span class="walker">Walker: ${walk.walker}</span>
    <span class="time">Time: ${walk.time}</span>
    <span class="duration">Duration: ${walk.duration} min</span>
  `;

  list.appendChild(item);
}

function init() {
  const form = document.getElementById("walk-form");
  if (form) {
    form.addEventListener("submit", submitWalk);
  }
}

document.addEventListener("DOMContentLoaded", init);
