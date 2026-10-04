(function () {
  const api = window.FomoFirebase;
  const nav = document.querySelector(".panel-tabs");
  const panelContent = document.querySelector("#panel-content");
  const state = { events: [], locations: [], user: null };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeField(form, labelText, control, id) {
    const wrapper = element("div", "workflow-field");
    const label = element("label", "", labelText);
    label.htmlFor = id;
    control.id = id;
    wrapper.append(label, control);
    form.append(wrapper);
    return control;
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
      "Evenimentele sunt salvate online. O propunere devine publică numai după aprobarea ownerului locației sau a unui administrator."
    );
    const switcher = element("div", "workflow-switch");
    switcher.setAttribute("role", "tablist");
    const proposeButton = element("button", "active", "Propune un eveniment");
    proposeButton.type = "button";
    proposeButton.setAttribute("role", "tab");
    proposeButton.setAttribute("aria-selected", "true");
    proposeButton.dataset.workflowTab = "propose";
    const reviewButton = element("button", "", "Pentru owneri");
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
      element("p", "", "Autentifică-te și confirmă emailul. Alege locația exactă, apoi trimite detaliile pentru verificare.")
    );

    const form = element("form", "workflow-form");
    const title = document.createElement("input");
    title.type = "text";
    title.name = "title";
    title.required = true;
    title.maxLength = 80;
    title.placeholder = "ex. Seară de muzică live";
    makeField(form, "Numele evenimentului", title, "community-event-title");

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
    makeField(form, "Categorie", category, "community-event-category");

    const description = document.createElement("textarea");
    description.name = "description";
    description.required = true;
    description.maxLength = 500;
    description.placeholder = "Spune pe scurt ce se întâmplă.";
    makeField(form, "Descriere", description, "community-event-description");

    const location = document.createElement("select");
    location.name = "locationId";
    location.required = true;
    const locationPrompt = element("option", "", "Încarcă locațiile...");
    locationPrompt.value = "";
    locationPrompt.disabled = true;
    locationPrompt.selected = true;
    location.append(locationPrompt);
    makeField(form, "Locația evenimentului", location, "community-event-location");

    const startsAt = document.createElement("input");
    startsAt.type = "datetime-local";
    startsAt.name = "startsAt";
    startsAt.required = true;
    makeField(form, "Data și ora", startsAt, "community-event-starts-at");

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
      element("p", "eyebrow", "Verificare locație"),
      element("h2", "", "Aprobă propunerile"),
      element("p", "", "Doar ownerul aprobat al locației sau un administrator poate decide dacă evenimentul este real.")
    );
    const pendingCount = element("p", "workflow-count");
    const pendingList = element("div", "workflow-list");
    pendingList.dataset.list = "pending";
    reviewView.append(reviewHeading, pendingCount, pendingList);

    const status = element("p", "workflow-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    panel.append(notice, switcher, proposeView, reviewView, status);
    panelContent.insertBefore(panel, panelContent.querySelector("#status-message"));
    return {
      navButton, panel, form, location, ownList, pendingList, pendingCount,
      status, proposeButton, reviewButton, submit,
    };
  }

  const ui = buildInterface();

  function setStatus(message, stateName) {
    ui.status.textContent = message;
    if (stateName) ui.status.dataset.state = stateName;
    else delete ui.status.dataset.state;
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

  function renderCard(event, showActions) {
    const card = element("article", "workflow-card");
    const top = element("div", "workflow-card-top");
    top.append(
      element("span", "event-category", event.category),
      element("span", `workflow-badge ${event.status}`, statusLabel(event.status))
    );
    card.append(
      top,
      element("h3", "", event.title),
      element("p", "workflow-description", event.description),
      element("p", "", `${event.venue}, ${event.city} · ${formatDate(event.startsAt)}`),
    );
    if (showActions) {
      const actions = element("div", "workflow-card-actions");
      for (const [decision, label] of [["rejected", "Respinge"], ["approved", "Aprobă"]]) {
        const button = element("button", decision === "approved" ? "approve" : "reject", label);
        button.type = "button";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await api.db.ref(`communityEvents/${event.id}`).update({
              status: decision,
              reviewedAt: firebase.database.ServerValue.TIMESTAMP,
              reviewedBy: state.user.uid,
            });
            await loadData();
            setStatus(decision === "approved" ? "Evenimentul a fost verificat și publicat." : "Propunerea a fost respinsă.", "success");
          } catch (error) {
            button.disabled = false;
            setStatus(error.message, "error");
          }
        });
        actions.append(button);
      }
      card.append(actions);
    }
    return card;
  }

  function renderList(container, list, emptyText, showActions) {
    container.replaceChildren();
    if (!list.length) {
      container.append(element("p", "workflow-empty", emptyText));
      return;
    }
    list.forEach((event) => container.append(renderCard(event, showActions)));
  }

  function eventFromSnapshot(snapshot) {
    return { id: snapshot.key, ...snapshot.val() };
  }

  function publishCommunityEvents(events) {
    state.events = events.filter((event) => ["approved", "pending"].includes(event.status));
    if (typeof window.FomoRefreshCommunityEvents === "function") {
      window.FomoRefreshCommunityEvents(state.events.map((event) => ({
        id: `community-${event.id}`,
        title: event.title,
        category: event.category,
        description: event.description,
        venue: `${event.venue}, ${event.city}`,
        locationId: event.locationId,
        startsAt: event.startsAt,
        latitude: Number(event.latitude),
        longitude: Number(event.longitude),
        tier: "free",
        votes: 0,
        votedByMe: false,
        source: "community",
        status: event.status,
      })));
    }
  }

  async function loadData() {
    if (!api.configured) {
      setStatus("Configurează Firebase pentru a activa propunerile și moderarea online.", "error");
      return;
    }

    let locations = [];
    try {
      locations = await api.locations();
    } catch (error) {
      console.error("Could not load location catalog.", error);
      setStatus("Nu am putut încărca locațiile. Verifică Firebase și regulile de citire.", "error");
      return;
    }

    state.locations = locations;
    if (typeof window.FomoSetLocations === "function") {
      window.FomoSetLocations(state.locations);
    }

    try {
      const [approvedSnapshot, pendingSnapshot] = await Promise.all([
        api.db.ref("communityEvents").orderByChild("status").equalTo("approved").once("value"),
        api.db.ref("communityEvents").orderByChild("status").equalTo("pending").once("value"),
      ]);
      const communityEvents = [];
      approvedSnapshot.forEach((child) => communityEvents.push(eventFromSnapshot(child)));
      pendingSnapshot.forEach((child) => {
        const event = eventFromSnapshot(child);
        if (event.status === "pending") communityEvents.push(event);
      });
      publishCommunityEvents(communityEvents);
    } catch (error) {
      console.warn("Could not load community event feed, keeping map locations functional.", error);
      publishCommunityEvents([]);
    }
    const currentLocation = ui.location.value;
    ui.location.replaceChildren();
    const prompt = element("option", "", "Alege orașul și locația");
    prompt.value = "";
    prompt.disabled = true;
    prompt.selected = true;
    ui.location.append(prompt);
    state.locations.forEach((location) => {
      const option = element("option", "", `${location.city} — ${location.name}`);
      option.value = location.id;
      ui.location.append(option);
    });
    if (state.locations.some((location) => location.id === currentLocation)) ui.location.value = currentLocation;

    state.user = api.user();
    if (!state.user) {
      renderList(ui.ownList, [], "Autentifică-te pentru a vedea propunerile tale.", false);
      renderList(ui.pendingList, [], "Autentifică-te ca owner aprobat pentru a vedea propunerile locației tale.", false);
      ui.pendingCount.textContent = "Autentificarea este necesară pentru moderare.";
      return;
    }

    const ownSnapshot = await api.db.ref("communityEvents")
      .orderByChild("submittedBy")
      .equalTo(state.user.uid)
      .once("value");
    const ownEvents = [];
    ownSnapshot.forEach((child) => ownEvents.push(eventFromSnapshot(child)));
    ownEvents
      .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
    renderList(ui.ownList, ownEvents, "Nu ai trimis încă nicio propunere.", false);

    if (!state.user.emailVerified) {
      renderList(ui.pendingList, [], "Confirmă emailul pentru a modera propuneri.", false);
      ui.pendingCount.textContent = "Confirmarea adresei este necesară pentru moderare.";
      return;
    }

    try {
      const [admin, ...ownedLocations] = await Promise.all([
        api.db.ref(`admins/${state.user.uid}`).once("value"),
        ...state.locations
          .filter((location) => location.ownerUid === state.user.uid)
          .map((location) => api.db.ref("communityEvents")
            .orderByChild("locationId")
            .equalTo(location.id)
            .once("value")),
      ]);
      const pendingSnapshots = admin.val() === true
        ? [await api.db.ref("communityEvents").once("value")]
        : ownedLocations;
      const pendingEvents = new Map();
      pendingSnapshots.forEach((snapshot) => snapshot.forEach((child) => {
        const event = eventFromSnapshot(child);
        if (event.status === "pending") pendingEvents.set(event.id, event);
      }));
      renderList(
        ui.pendingList,
        [...pendingEvents.values()],
        "Nu există propuneri în așteptare pentru locațiile tale.",
        pendingEvents.size > 0,
      );
      ui.pendingCount.textContent = `${pendingEvents.size} propuneri în așteptare`;
    } catch (error) {
      console.error("Could not load the owner moderation queue.", error);
      setStatus(error.message, "error");
    }
  }

  ui.navButton.addEventListener("click", () => activateTopTab("community-events"));
  document.querySelectorAll(".panel-tabs .tab-button").forEach((button) => {
    if (button === ui.navButton) return;
    button.addEventListener("click", () => activateTopTab(button.dataset.tab));
  });
  ui.proposeButton.addEventListener("click", () => activateWorkflowView("propose"));
  ui.reviewButton.addEventListener("click", () => activateWorkflowView("review"));
  ui.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ui.form.reportValidity()) return;
    const user = api.configured ? api.user() : null;
    if (!user) {
      setStatus("Autentifică-te în meniul Cont pentru a trimite un eveniment.", "error");
      return;
    }
    if (!user.emailVerified) {
      setStatus("Confirmă adresa de email înainte să trimiți un eveniment.", "error");
      return;
    }

    const values = new FormData(ui.form);
    const startsAt = new Date(String(values.get("startsAt")));
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      setStatus("Alege o dată validă, aflată în viitor.", "error");
      return;
    }
    ui.submit.disabled = true;
    try {
      const location = state.locations.find((item) => item.id === String(values.get("locationId")));
      if (!location) throw new Error("Alege o locație validă.");
      const eventData = {
        title: String(values.get("title")).trim(),
        category: String(values.get("category")),
        description: String(values.get("description")).trim(),
        locationId: location.id,
        venue: location.name,
        city: location.city,
        latitude: location.latitude,
        longitude: location.longitude,
        status: "pending",
        submittedBy: user.uid,
        submittedByEmail: user.email,
        startsAt: startsAt.toISOString(),
        startsAtMs: startsAt.getTime(),
        submittedAt: firebase.database.ServerValue.TIMESTAMP,
      };
      await api.db.ref("communityEvents").push(eventData);
      ui.form.reset();
      await loadData();
      setStatus("Propunerea a fost trimisă ownerului locației pentru verificare.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      ui.submit.disabled = false;
    }
  });

  window.addEventListener("fomo-auth-changed", () => {
    loadData().catch((error) => {
      console.error("Could not refresh online event data.", error);
      setStatus(error.message, "error");
    });
  });
  window.addEventListener("fomo-firebase-ready", () => {
    loadData().catch((error) => {
      console.error("Could not load online event data.", error);
      setStatus(error.message, "error");
    });
  });
  if (api.configured) {
    loadData().catch((error) => {
      console.error("Could not load online event data.", error);
      setStatus(error.message, "error");
    });
  }
})();
