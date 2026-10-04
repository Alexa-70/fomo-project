(function () {
  const STORAGE_KEY = "fomo-event-submissions-v1";
  const USER_KEY = "fomo-event-submitter-v1";
  const nav = document.querySelector(".panel-tabs");
  const panelContent = document.querySelector("#panel-content");
  const state = {
    events: [],
    userId: getOrCreateUserId(),
    storageAvailable: true,
  };

  function getOrCreateUserId() {
    try {
      let id = localStorage.getItem(USER_KEY);
      if (!id) {
        id = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(USER_KEY, id);
      }
      return id;
    } catch (error) {
      console.error("Could not access browser storage for event submissions.", error);
      return `temporary-${Date.now()}`;
    }
  }

  function loadEvents() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Stored event submissions are not a list.");
      return parsed.filter((event) =>
        event &&
        typeof event.id === "string" &&
        typeof event.title === "string" &&
        ["pending", "approved", "rejected"].includes(event.status)
      );
    } catch (error) {
      state.storageAvailable = false;
      console.error("Could not load event submissions.", error);
      return [];
    }
  }

  function saveEvents() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
      state.storageAvailable = true;
      return true;
    } catch (error) {
      state.storageAvailable = false;
      console.error("Could not save event submissions.", error);
      setStatus("Nu am putut salva evenimentul în browser. Verifică spațiul disponibil și setările de stocare.", "error");
      return false;
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeField(labelText, input, id) {
    const wrapper = element("div", "workflow-field");
    const label = element("label", "", labelText);
    label.htmlFor = id;
    input.id = id;
    wrapper.append(label, input);
    return wrapper;
  }

  function buildInterface() {
    const navButton = element("button", "tab-button", "Evenimente");
    navButton.type = "button";
    navButton.dataset.tab = "community-events";
    navButton.setAttribute("aria-selected", "false");
    nav.append(navButton);

    const panel = element("section", "tab-panel event-workflow");
    panel.dataset.tabPanel = "community-events";
    panel.setAttribute("aria-label", "Propuneri și aprobări de evenimente");

    const notice = element(
      "p",
      "workflow-notice",
      "Prototip local: propunerile și aprobările se salvează doar în acest browser. Identitatea localului nu este verificată; folosește această interfață doar pentru demonstrație."
    );

    const switcher = element("div", "workflow-switch");
    switcher.setAttribute("role", "tablist");
    const proposeButton = element("button", "active", "Propune un eveniment");
    proposeButton.type = "button";
    proposeButton.setAttribute("role", "tab");
    proposeButton.setAttribute("aria-selected", "true");
    proposeButton.dataset.workflowTab = "propose";
    const reviewButton = element("button", "", "Pentru localuri");
    reviewButton.type = "button";
    reviewButton.setAttribute("role", "tab");
    reviewButton.setAttribute("aria-selected", "false");
    reviewButton.dataset.workflowTab = "review";
    switcher.append(proposeButton, reviewButton);

    const proposeView = element("div", "workflow-view active");
    proposeView.dataset.workflowView = "propose";
    proposeView.setAttribute("role", "tabpanel");
    const proposeHeading = element("div", "workflow-heading");
    proposeHeading.append(
      element("p", "eyebrow", "Comunitatea"),
      element("h2", "", "Propune un eveniment"),
      element("p", "", "Trimite planul tău. Acesta va apărea în lista publică după ce un reprezentant al localului îl aprobă.")
    );

    const form = element("form", "workflow-form");
    form.noValidate = false;
    const title = document.createElement("input");
    title.type = "text";
    title.name = "title";
    title.required = true;
    title.maxLength = 80;
    title.placeholder = "ex. Seară de muzică live";
    form.append(makeField("Numele evenimentului", title, "community-event-title"));

    const category = document.createElement("select");
    category.name = "category";
    category.required = true;
    [
      ["", "Alege categoria"],
      ["Muzică", "Muzică"],
      ["Food & drink", "Food & drink"],
      ["Social", "Social"],
      ["Outdoor", "Outdoor"],
      ["Film", "Film"],
      ["Altceva", "Altceva"],
    ].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = value;
      category.append(option);
    });
    form.append(makeField("Categorie", category, "community-event-category"));

    const description = document.createElement("textarea");
    description.name = "description";
    description.required = true;
    description.maxLength = 500;
    description.placeholder = "Spune pe scurt ce se întâmplă.";
    form.append(makeField("Descriere", description, "community-event-description"));

    const venue = document.createElement("input");
    venue.type = "text";
    venue.name = "venue";
    venue.required = true;
    venue.maxLength = 120;
    venue.placeholder = "Numele localului și orașul";
    form.append(makeField("Localul gazdă", venue, "community-event-venue"));

    const startsAt = document.createElement("input");
    startsAt.type = "datetime-local";
    startsAt.name = "startsAt";
    startsAt.required = true;
    form.append(makeField("Data și ora", startsAt, "community-event-starts-at"));

    const submit = element("button", "workflow-submit", "Trimite spre aprobare");
    submit.type = "submit";
    form.append(submit);

    const ownHeading = element("div", "workflow-heading");
    ownHeading.append(
      element("p", "eyebrow", "Urmărește statusul"),
      element("h2", "", "Propunerile mele")
    );
    const ownList = element("div", "workflow-list");
    ownList.dataset.list = "mine";
    proposeView.append(proposeHeading, form, ownHeading, ownList);

    const reviewView = element("div", "workflow-view");
    reviewView.dataset.workflowView = "review";
    reviewView.setAttribute("role", "tabpanel");
    const reviewHeading = element("div", "workflow-heading");
    reviewHeading.append(
      element("p", "eyebrow", "Administrare local"),
      element("h2", "", "Aprobă propunerile"),
      element("p", "", "Verifică dacă localul și detaliile sunt corecte înainte de publicare.")
    );

    const reviewer = document.createElement("input");
    reviewer.type = "text";
    reviewer.name = "reviewer";
    reviewer.maxLength = 80;
    reviewer.required = true;
    reviewer.placeholder = "ex. Echipa / numele localului";
    const reviewerPanel = element("div", "reviewer-panel");
    reviewerPanel.append(makeField("Numele reprezentantului localului", reviewer, "community-event-reviewer"));

    const pendingCount = element("p", "workflow-count");
    pendingCount.dataset.pendingCount = "true";
    const pendingList = element("div", "workflow-list");
    pendingList.dataset.list = "pending";
    const approvedHeading = element("div", "workflow-heading");
    approvedHeading.append(
      element("p", "eyebrow", "Evenimente verificate"),
      element("h2", "", "Aprobate de local")
    );
    const approvedList = element("div", "workflow-list");
    approvedList.dataset.list = "approved";
    reviewView.append(reviewHeading, reviewerPanel, pendingCount, pendingList, approvedHeading, approvedList);

    const status = element("p", "workflow-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.dataset.status = "true";

    panel.append(notice, switcher, proposeView, reviewView, status);
    const settingsPanel = panelContent.querySelector('[data-tab-panel="settings"]');
    panelContent.insertBefore(panel, settingsPanel || panelContent.querySelector("#status-message"));

    return { navButton, panel, form, ownList, pendingList, approvedList, pendingCount, status, reviewer, proposeButton, reviewButton };
  }

  function setStatus(message, stateName) {
    const status = ui && ui.status;
    if (!status) return;
    status.textContent = message;
    if (stateName) status.dataset.state = stateName;
    else delete status.dataset.state;
  }

  function activateTopTab(tabName) {
    document.querySelectorAll(".panel-tabs .tab-button").forEach((button) => {
      const active = button.dataset.tab === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel-content > .tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
    });
  }

  function activateWorkflowView(viewName) {
    [ui.proposeButton, ui.reviewButton].forEach((button) => {
      const active = button.dataset.workflowTab === viewName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    ui.panel.querySelectorAll(".workflow-view").forEach((view) => {
      view.classList.toggle("active", view.dataset.workflowView === viewName);
    });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Dată nespecificată";
    return new Intl.DateTimeFormat("ro-RO", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function statusLabel(status) {
    return status === "approved" ? "Aprobat"
      : status === "rejected" ? "Respins"
        : "În așteptare";
  }

  function renderCard(event, showActions, showReviewer) {
    const card = element("article", "workflow-card");
    const top = element("div", "workflow-card-top");
    top.append(
      element("span", "event-category", event.category),
      element("span", `workflow-badge ${event.status}`, statusLabel(event.status))
    );
    const title = element("h3", "", event.title);
    const description = element("p", "workflow-description", event.description);
    const details = element("p", "", `${event.venue} · ${formatDate(event.startsAt)}`);
    card.append(top, title, description, details);
    if (showReviewer && event.reviewedBy) {
      card.append(element("p", "", `Verificat de: ${event.reviewedBy}`));
    }

    if (showActions) {
      const actions = element("div", "workflow-card-actions");
      const approve = element("button", "approve", "Aprobă");
      approve.type = "button";
      approve.disabled = !ui.reviewer.value.trim();
      approve.addEventListener("click", () => reviewEvent(event.id, "approved"));
      const reject = element("button", "reject", "Respinge");
      reject.type = "button";
      reject.disabled = !ui.reviewer.value.trim();
      reject.addEventListener("click", () => reviewEvent(event.id, "rejected"));
      actions.append(reject, approve);
      card.append(actions);
    }
    return card;
  }

  function renderList(container, list, emptyText, showActions, showReviewer) {
    container.replaceChildren();
    if (!list.length) {
      container.append(element("p", "workflow-empty", emptyText));
      return;
    }
    list.forEach((event) => container.append(renderCard(event, showActions, showReviewer)));
  }

  function render() {
    const ownEvents = state.events
      .filter((event) => event.submittedBy === state.userId)
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
    const pending = state.events
      .filter((event) => event.status === "pending")
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
    const approved = state.events
      .filter((event) => event.status === "approved")
      .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));

    renderList(ui.ownList, ownEvents, "Nu ai trimis încă nicio propunere.", false, true);
    renderList(ui.pendingList, pending, "Nu sunt propuneri în așteptare.", true, false);
    renderList(ui.approvedList, approved, "Evenimentele aprobate vor apărea aici.", false, true);
    ui.pendingCount.textContent = `${pending.length} propuneri în așteptare`;
    ui.panel.querySelectorAll(".workflow-card-actions button").forEach((button) => {
      button.disabled = !ui.reviewer.value.trim();
    });
  }

  function reviewEvent(id, status) {
    const reviewerName = ui.reviewer.value.trim();
    if (!reviewerName) {
      setStatus("Introdu numele reprezentantului localului înainte de a modera.", "error");
      ui.reviewer.focus();
      return;
    }
    const event = state.events.find((item) => item.id === id && item.status === "pending");
    if (!event) {
      setStatus("Propunerea nu mai este în așteptare. Reîncarcă lista.", "error");
      render();
      return;
    }
    event.status = status;
    event.reviewedBy = reviewerName;
    event.reviewedAt = new Date().toISOString();
    if (!saveEvents()) return;
    render();
    setStatus(status === "approved" ? "Evenimentul a fost aprobat și este vizibil în listă." : "Propunerea a fost respinsă.", "success");
  }

  const ui = buildInterface();
  state.events = loadEvents();

  ui.navButton.addEventListener("click", () => activateTopTab("community-events"));
  document.querySelectorAll(".panel-tabs .tab-button").forEach((button) => {
    if (button === ui.navButton) return;
    button.addEventListener("click", () => activateTopTab(button.dataset.tab));
  });
  ui.proposeButton.addEventListener("click", () => activateWorkflowView("propose"));
  ui.reviewButton.addEventListener("click", () => activateWorkflowView("review"));
  ui.reviewer.addEventListener("input", render);

  ui.form.addEventListener("submit", (submitEvent) => {
    submitEvent.preventDefault();
    if (!ui.form.reportValidity()) return;

    const formData = new FormData(ui.form);
    const title = String(formData.get("title")).trim();
    const description = String(formData.get("description")).trim();
    const venue = String(formData.get("venue")).trim();
    const startsAt = new Date(String(formData.get("startsAt")));
    if (!title || !description || !venue || Number.isNaN(startsAt.getTime())) {
      setStatus("Completează toate câmpurile cu informații valide.", "error");
      return;
    }

    const event = {
      id: typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      category: String(formData.get("category")),
      description,
      venue,
      startsAt: startsAt.toISOString(),
      status: "pending",
      submittedBy: state.userId,
      submittedAt: new Date().toISOString(),
    };
    state.events.push(event);
    if (!saveEvents()) {
      state.events.pop();
      return;
    }
    ui.form.reset();
    render();
    setStatus("Propunerea a fost trimisă. Va fi publicată după aprobarea localului.", "success");
  });

  render();
  if (!state.storageAvailable) {
    setStatus("Nu am putut citi propunerile salvate. Stocarea browserului este indisponibilă sau datele sunt corupte.", "error");
  }
})();
