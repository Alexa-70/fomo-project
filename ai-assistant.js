(function () {
  const history = [];
  const LAUNCHER_POSITION_KEY = "fomo-assistant-position-v1";
  const DRAG_THRESHOLD = 6;
  const routeIntent = /\b(cum ajung|cum ajunge|traseu|ruta|drum spre|directii)\b/i;
  const stopWords = new Set(["cum", "ajung", "ajunge", "traseu", "ruta", "rută", "drum", "spre", "la", "de", "in", "în", "the", "eventul", "evenimentul"]);

  const launcher = document.createElement("button");
  launcher.className = "ai-assistant-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Deschide asistentul FOMO");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight Home");
  launcher.title = "Trage pentru a muta · săgeți pentru deplasare · Home pentru resetare";
  launcher.textContent = "Întreabă FOMO";

  const panel = document.createElement("section");
  panel.className = "ai-assistant-panel";
  panel.setAttribute("aria-label", "Asistentul FOMO");
  panel.hidden = true;
  panel.innerHTML = `
    <header class="ai-assistant-header">
      <div><strong>Asistent FOMO</strong><span>Evenimente, preferințe și trasee</span></div>
      <button class="ai-assistant-close" type="button" aria-label="Închide asistentul">×</button>
    </header>
    <div class="ai-assistant-messages" role="log" aria-live="polite" aria-relevant="additions text"></div>
    <form class="ai-assistant-form">
      <label class="ai-assistant-privacy">Întrebarea și contextul sunt trimise către Groq. Coordonatele exacte ale locației tale rămân în browser.</label>
      <div class="ai-assistant-compose">
        <textarea name="message" rows="2" maxlength="2000" placeholder="Întreabă despre evenimente sau trasee..." aria-label="Mesaj pentru asistent" required></textarea>
        <button type="submit">Trimite</button>
      </div>
    </form>`;
  document.body.append(launcher, panel);

  const messages = panel.querySelector(".ai-assistant-messages");
  const form = panel.querySelector(".ai-assistant-form");
  const input = form.elements.message;
  const sendButton = form.querySelector('button[type="submit"]');
  let pointerStart = null;
  let suppressNextClick = false;
  let dragMoved = false;

  function clampLauncherPosition(left, top) {
    const margin = 8;
    return {
      left: Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - launcher.offsetWidth - margin)),
      top: Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - launcher.offsetHeight - margin)),
    };
  }

  function saveLauncherPosition(position) {
    try {
      localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(position));
    } catch (error) {
      console.warn("Nu am putut salva poziția butonului asistentului.", error);
    }
  }

  function placeLauncher(left, top, persist = false) {
    const position = clampLauncherPosition(left, top);
    launcher.style.left = `${position.left}px`;
    launcher.style.top = `${position.top}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    if (persist) saveLauncherPosition(position);
    if (!panel.hidden) positionPanel();
  }

  function restoreLauncherPosition() {
    try {
      const savedPosition = JSON.parse(localStorage.getItem(LAUNCHER_POSITION_KEY) || "null");
      if (
        savedPosition &&
        Number.isFinite(savedPosition.left) &&
        Number.isFinite(savedPosition.top)
      ) {
        placeLauncher(savedPosition.left, savedPosition.top);
      }
    } catch (error) {
      console.warn("Nu am putut citi poziția butonului asistentului.", error);
    }
  }

  function positionPanel() {
    const launcherRect = launcher.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const left = Math.min(
      Math.max(8, launcherRect.right - panelWidth),
      Math.max(8, window.innerWidth - panelWidth - 8),
    );
    const above = launcherRect.top - panelHeight - 12;
    const top = above >= 8
      ? above
      : Math.min(launcherRect.bottom + 12, Math.max(8, window.innerHeight - panelHeight - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function onLauncherPointerDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    pointerStart = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      left: rect.left,
      top: rect.top,
    };
    dragMoved = false;
    if (event.isTrusted) launcher.setPointerCapture(event.pointerId);
  }

  function onLauncherPointerMove(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    const deltaX = event.clientX - pointerStart.startX;
    const deltaY = event.clientY - pointerStart.startY;
    if (!dragMoved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    dragMoved = true;
    placeLauncher(event.clientX - pointerStart.offsetX, event.clientY - pointerStart.offsetY);
  }

  function onLauncherPointerUp(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    if (dragMoved) {
      const rect = launcher.getBoundingClientRect();
      placeLauncher(rect.left, rect.top, true);
      suppressNextClick = true;
    }
    pointerStart = null;
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
  }

  function onLauncherKeyDown(event) {
    const offsets = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (event.key === "Home") {
      event.preventDefault();
      try {
        localStorage.removeItem(LAUNCHER_POSITION_KEY);
      } catch (error) {
        console.warn("Nu am putut reseta poziția butonului asistentului.", error);
      }
      launcher.style.left = "";
      launcher.style.top = "";
      launcher.style.right = "";
      launcher.style.bottom = "";
      if (!panel.hidden) positionPanel();
      return;
    }
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const rect = launcher.getBoundingClientRect();
    const distance = event.shiftKey ? 40 : 10;
    placeLauncher(rect.left + offset[0] * distance, rect.top + offset[1] * distance, true);
  }

  function addMessage(role, content, isError = false) {
    const message = document.createElement("div");
    message.className = `ai-assistant-message ${role}${isError ? " error" : ""}`;
    message.textContent = content;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function openPanel(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      positionPanel();
      input.focus();
    }
  }

  function getSettings() {
    try {
      const settings = JSON.parse(localStorage.getItem("fomo-settings-v1") || "{}");
      return {
        defaultOrigin: typeof settings.defaultOrigin === "string" ? settings.defaultOrigin : "",
        showPromoted: settings.showPromoted !== false,
      };
    } catch (error) {
      console.warn("Nu am putut citi preferințele pentru asistent.", error);
      return {};
    }
  }

  function getOriginContext() {
    const appContext = window.FomoAppContext;
    if (!appContext || typeof appContext.getOrigin !== "function") return null;

    const point = appContext.getOrigin();
    const inputValue = document.querySelector("#origin")?.value.trim() || "";
    return { label: inputValue || (Number.isFinite(point.latitude) ? "Locație selectată" : "") };
  }

  function normalize(text) {
    return text.toLocaleLowerCase("ro").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function eventForRoute(message) {
    const appContext = window.FomoAppContext;
    if (!appContext || typeof appContext.getEvents !== "function") return null;
    const events = appContext.getEvents();
    const queryWords = normalize(message).match(/[\p{L}\p{N}]+/gu) || [];
    const meaningfulWords = queryWords.filter((word) => word.length > 2 && !stopWords.has(word));
    let bestEvent = null;
    let bestScore = 0;

    for (const event of events) {
      const eventWords = normalize(`${event.title} ${event.venue}`).match(/[\p{L}\p{N}]+/gu) || [];
      const score = new Set(eventWords.filter((word) => word.length > 2)).size
        ? new Set(eventWords.filter((word) => word.length > 2 && meaningfulWords.includes(word))).size
        : 0;
      if (score > bestScore) {
        bestEvent = event;
        bestScore = score;
      }
    }

    if (bestScore > 0) return bestEvent;
    const selectedId = appContext.getSelectedEventId?.();
    return events.find((event) => event.id === selectedId) || null;
  }

  async function getRouteContext(message) {
    if (!routeIntent.test(normalize(message))) return null;
    const event = eventForRoute(message);
    if (!event) return null;
    return {
      event: event.title,
      venue: event.venue,
    };
  }

  launcher.addEventListener("pointerdown", onLauncherPointerDown);
  launcher.addEventListener("pointermove", onLauncherPointerMove);
  launcher.addEventListener("pointerup", onLauncherPointerUp);
  launcher.addEventListener("pointercancel", onLauncherPointerUp);
  launcher.addEventListener("keydown", onLauncherKeyDown);
  launcher.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      return;
    }
    openPanel(panel.hidden);
  });
  panel.querySelector(".ai-assistant-close").addEventListener("click", () => openPanel(false));
  window.addEventListener("resize", () => {
    const rect = launcher.getBoundingClientRect();
    placeLauncher(rect.left, rect.top);
  });
  restoreLauncherPosition();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || sendButton.disabled) return;

    addMessage("user", message);
    input.value = "";
    sendButton.disabled = true;
    input.disabled = true;
    const pendingMessage = addMessage("assistant pending", "Caut un răspuns...");

    try {
      const route = await getRouteContext(message);
      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: history.slice(-10),
          origin: getOriginContext(),
          preferences: getSettings(),
          route,
        }),
      };
      const assistantApiUrl = String(window.FOMO_ASSISTANT_API_URL || "").replace(/\/+$/, "");
      let data;
      if (assistantApiUrl) {
        const response = await fetch(`${assistantApiUrl}/api/assistant`, requestOptions);
        data = await response.json();
        if (!response.ok) throw new Error(data.error || "Cererea către asistent nu a reușit.");
      } else {
        data = await window.FomoRouteContext.apiRequest("/api/assistant", requestOptions);
      }
      if (typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error("Asistentul a returnat un răspuns gol.");
      }

      pendingMessage.remove();
      addMessage("assistant", data.reply.trim());
      history.push({ role: "user", content: message }, { role: "assistant", content: data.reply.trim() });
      if (history.length > 10) history.splice(0, history.length - 10);
    } catch (error) {
      pendingMessage.remove();
      addMessage("assistant", error.message || "Nu am putut trimite întrebarea. Încearcă din nou.", true);
    } finally {
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  });

  addMessage("assistant", "Salut! Te pot ajuta să descoperi evenimente și să găsești traseul către ele. Întreabă-mă ce ți-ar plăcea să faci.");
})();
