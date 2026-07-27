const STORAGE_KEY = "ritm-habits-v1";

const starterHabits = [
  { id: crypto.randomUUID(), name: "Стакан воды после пробуждения", icon: "💧", done: true },
  { id: crypto.randomUUID(), name: "20 минут без телефона", icon: "🧘", done: false },
  { id: crypto.randomUUID(), name: "Прочитать 10 страниц", icon: "📖", done: false },
];

const state = {
  habits: loadHabits(),
  filter: "all",
};

const dateElement = document.querySelector("#currentDate");
const habitList = document.querySelector("#habitList");
const emptyState = document.querySelector("#emptyState");
const template = document.querySelector("#habitTemplate");
const form = document.querySelector("#habitForm");
const nameInput = document.querySelector("#habitName");
const iconInput = document.querySelector("#habitIcon");
const openFormButton = document.querySelector("#openFormButton");
const cancelFormButton = document.querySelector("#cancelFormButton");
const progressRing = document.querySelector("#progressRing");
const progressPercent = document.querySelector("#progressPercent");
const progressCopy = document.querySelector("#progressCopy");

dateElement.textContent = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());

function loadHabits() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : starterHabits;
  } catch {
    return starterHabits;
  }
}

function saveHabits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.habits));
}

function getFilteredHabits() {
  if (state.filter === "done") return state.habits.filter((habit) => habit.done);
  if (state.filter === "active") return state.habits.filter((habit) => !habit.done);
  return state.habits;
}

function updateProgress() {
  const completed = state.habits.filter((habit) => habit.done).length;
  const total = state.habits.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  progressPercent.textContent = `${percent}%`;
  progressRing.style.background = `conic-gradient(var(--green) ${percent * 3.6}deg, #e5e7df 0deg)`;
  progressRing.setAttribute("aria-valuenow", String(percent));

  if (!total) progressCopy.textContent = "Добавь первый шаг";
  else if (percent === 100) progressCopy.textContent = "Идеальный ритм!";
  else if (percent >= 50) progressCopy.textContent = "Больше половины";
  else if (completed > 0) progressCopy.textContent = `${completed} из ${total} выполнено`;
  else progressCopy.textContent = "Начни с одного шага";
}

function render() {
  habitList.replaceChildren();
  const habits = getFilteredHabits();
  emptyState.hidden = habits.length > 0;

  habits.forEach((habit, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const checkButton = card.querySelector(".check-button");
    const deleteButton = card.querySelector(".delete-button");

    card.style.animationDelay = `${index * 35}ms`;
    card.classList.toggle("done", habit.done);
    card.querySelector(".habit-icon").textContent = habit.icon;
    card.querySelector(".habit-info h3").textContent = habit.name;
    checkButton.setAttribute(
      "aria-label",
      habit.done ? `Снять отметку «${habit.name}»` : `Отметить «${habit.name}» выполненной`,
    );

    checkButton.addEventListener("click", () => toggleHabit(habit.id));
    deleteButton.addEventListener("click", () => deleteHabit(habit.id));
    habitList.append(card);
  });

  updateProgress();
}

function toggleHabit(id) {
  state.habits = state.habits.map((habit) =>
    habit.id === id ? { ...habit, done: !habit.done } : habit,
  );
  saveHabits();
  render();
}

function deleteHabit(id) {
  state.habits = state.habits.filter((habit) => habit.id !== id);
  saveHabits();
  render();
}

function showForm() {
  form.hidden = false;
  openFormButton.setAttribute("aria-expanded", "true");
  nameInput.focus();
}

function hideForm() {
  form.hidden = true;
  form.reset();
  openFormButton.setAttribute("aria-expanded", "false");
}

openFormButton.setAttribute("aria-controls", "habitForm");
openFormButton.setAttribute("aria-expanded", "false");
openFormButton.addEventListener("click", showForm);
cancelFormButton.addEventListener("click", hideForm);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  state.habits.unshift({
    id: crypto.randomUUID(),
    name,
    icon: iconInput.value,
    done: false,
  });
  saveHabits();
  hideForm();
  render();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    render();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !form.hidden) hideForm();
});

render();
