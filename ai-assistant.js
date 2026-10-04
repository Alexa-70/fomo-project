(function () {
  const history = [];
  const routeIntent = /\b(cum ajung|cum ajunge|traseu|ruta|drum spre|directii)\b/i;
  const stopWords = new Set(["cum", "ajung", "ajunge", "traseu", "ruta", "rută", "drum", "spre", "la", "de", "in", "în", "the", "eventul", "evenimentul"]);

  const launcher = document.createElement("button");
  launcher.className = "ai-assistant-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Deschide asistentul FOMO");
  launcher.setAttribute("aria-expanded", "false");
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
      <label class="ai-assistant-privacy">Întrebarea și contextul sunt trimise către Groq. Coordonatele exacte rămân în browser; pentru trasee se trimite doar rezultatul rutei.</label>
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
    if (open) input.focus();
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
    if (!event || !window.FomoRoutePlanner?.showRoute) return null;

    const route = await window.FomoRoutePlanner.showRoute(event);
    if (!route) return null;
    return {
      event: event.title,
      venue: event.venue,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      steps: (route.steps || []).slice(0, 8).map((step) => ({
        roadName: step.roadName,
        maneuverType: step.maneuverType,
        modifier: step.modifier,
        distanceMeters: step.distanceMeters,
      })),
    };
  }

  launcher.addEventListener("click", () => openPanel(panel.hidden));
  panel.querySelector(".ai-assistant-close").addEventListener("click", () => openPanel(false));

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
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: history.slice(-10),
          origin: getOriginContext(),
          preferences: getSettings(),
          route,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Asistentul nu a putut răspunde.");
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
