(function () {
  const api = window.FomoFirebase;
  const eventAdminUid = "QM6bRLP4OMZRo6CBNe6JkqClMrf1";
  const nav = document.querySelector(".panel-tabs");
  const panelContent = document.querySelector("#panel-content");
  const state = { events: [], locations: [], user: null };
  const attendanceSubscriptions = new Map();
  const attendanceData = new Map();

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
      "Evenimentele apar imediat pe hartă cu eticheta „În verificare”. Ownerul locației sau user-vld le poate aproba ori respinge."
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
      element("p", "", "Autentifică-te și confirmă emailul. Evenimentul apare imediat pe hartă ca „În verificare”, apoi ownerul locației sau adminul îl verifică.")
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
    const categoryPrompt = element("option", "", "Alege tipul evenimentului");
    categoryPrompt.value = "";
    categoryPrompt.disabled = true;
    categoryPrompt.selected = true;
    category.append(categoryPrompt);
    [
      ["socializing", "Socializare"],
      ["workshops", "Ateliere"],
      ["charity", "Caritate"],
      ["exhibitions", "Expoziții și artă"],
      ["sports", "Sport"],
      ["healthcare", "Sănătate și wellbeing"],
      ["entertainment", "Muzică și divertisment"],
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

    const endsAt = document.createElement("input");
    endsAt.type = "datetime-local";
    endsAt.name = "endsAt";
    endsAt.required = true;
    makeField(form, "Ora de încheiere", endsAt, "community-event-ends-at");

    const ticketPrice = document.createElement("input");
    ticketPrice.type = "number";
    ticketPrice.name = "ticketPrice";
    ticketPrice.required = true;
    ticketPrice.min = "0";
    ticketPrice.max = "100000";
    ticketPrice.step = "0.01";
    ticketPrice.value = "0";
    makeField(form, "Preț bilet (RON; 0 dacă intrarea este gratuită)", ticketPrice, "community-event-ticket-price");
    const ticketUrl = document.createElement("input");
    ticketUrl.type = "url";
    ticketUrl.name = "ticketUrl";
    ticketUrl.maxLength = 500;
    ticketUrl.placeholder = "https://...";
    makeField(form, "Link pentru cumpărarea biletului (HTTPS)", ticketUrl, "community-event-ticket-url");
    const promotionHint = element(
      "p",
      "workflow-field-help",
      "Pentru bilete cu plată, introdu pagina HTTPS unde se cumpără. FOMO afișează linkul, dar nu procesează plăți.",
    );
    form.append(promotionHint);

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
    const adminInbox = element("section", "workflow-admin-inbox");
    adminInbox.hidden = true;
    const adminInboxHeading = element("h2", "workflow-subheading", "Mesaje primite de user-vld");
    const adminInboxCount = element("p", "workflow-count");
    const adminInboxList = element("div", "workflow-list");
    adminInboxList.dataset.list = "admin-pending";
    adminInbox.append(adminInboxHeading, adminInboxCount, adminInboxList);
    proposeView.append(proposeHeading, form, ownHeading, ownList, adminInbox);

    const reviewView = element("div", "workflow-view");
    reviewView.dataset.workflowView = "review";
    reviewView.setAttribute("role", "tabpanel");
    const reviewHeading = element("div", "workflow-heading");
    reviewHeading.append(
      element("p", "eyebrow", "Verificare locație"),
      element("h2", "", "Verificarea locației"),
      element("p", "", "Ownerii văd aici propunerile pentru locațiile lor. User-vld poate verifica toate propunerile.")
    );
    const moderationCount = element("p", "workflow-count");
    const moderationList = element("div", "workflow-list");
    moderationList.dataset.list = "location-moderation";
    const promotionHeading = element("h2", "workflow-subheading", "Promovări solicitate");
    const promotionCount = element("p", "workflow-count");
    const promotionList = element("div", "workflow-list");
    promotionList.dataset.list = "promotions";
    reviewView.append(reviewHeading, moderationCount, moderationList, promotionHeading, promotionCount, promotionList);

    const status = element("p", "workflow-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    panel.append(notice, switcher, proposeView, reviewView, status);
    panelContent.insertBefore(panel, panelContent.querySelector("#status-message"));
    return {
      navButton, panel, form, location, ownList, adminInbox, adminInboxCount, adminInboxList,
      moderationCount, moderationList, promotionCount, promotionList,
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
        : "În verificare";
  }

  function renderCard(event, actionMode) {
    const card = element("article", "workflow-card");
    const top = element("div", "workflow-card-top");
    const badgeLabel = event.promotionStatus === "paid" ? "Promovat"
      : event.promotionStatus === "requested" ? "Promovare solicitată"
        : statusLabel(event.status);
    top.append(
      element("span", "event-category", eventCategoryLabel(event.category)),
      element("span", `workflow-badge ${event.promotionStatus || event.status}`, badgeLabel)
    );
    card.append(
      top,
      element("h3", "", event.title),
      element("p", "workflow-description", event.description),
      element("p", "", `${event.venue}, ${event.city} · ${formatDate(event.startsAt)} – ${formatDate(event.endsAt || event.startsAt)}`),
    );
    if (Number.isSafeInteger(event.ticketPriceCents)) {
      const ticketPrice = (event.ticketPriceCents / 100).toFixed(2);
      const promotionFee = (Math.round(event.ticketPriceCents * 5 / 100) / 100).toFixed(2);
      card.append(element(
        "p",
        "",
        `Bilet: ${ticketPrice} RON · promovare: ${promotionFee} RON (plată unică)`,
      ));
    }
    if (typeof event.ticketUrl === "string" && event.ticketUrl.startsWith("https://")) {
      const ticketLink = element("a", "workflow-ticket-link", "Deschide pagina biletelor ↗");
      ticketLink.href = event.ticketUrl;
      ticketLink.target = "_blank";
      ticketLink.rel = "noopener noreferrer";
      card.append(ticketLink);
    }
    if (actionMode) {
      const actions = element("div", "workflow-card-actions");
      const choices = actionMode === "review"
        ? [["rejected", "Respinge"], ["approved", "Aprobă"]]
        : actionMode === "request-promotion"
          ? event.promotionStatus ? [] : [["requested", `Solicită promovarea · ${(
            Math.round(Number(event.ticketPriceCents || 0) * 5 / 100) / 100
          ).toFixed(2)} RON`]]
          : [["paid", "Confirmă plata și promovează"]];
      for (const [decision, label] of choices) {
        const button = element(
          "button",
          decision === "approved" || decision === "paid" ? "approve" : "reject",
          label,
        );
        button.type = "button";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const updates = actionMode === "review"
              ? {
                status: decision,
                reviewedAt: firebase.database.ServerValue.TIMESTAMP,
                reviewedBy: state.user.uid,
              }
              : actionMode === "request-promotion"
                ? {
                  promotionStatus: "requested",
                  promotionRequestedAt: firebase.database.ServerValue.TIMESTAMP,
                  promotionRequestedBy: state.user.uid,
                }
                : {
                  promotionStatus: "paid",
                  promotedAt: firebase.database.ServerValue.TIMESTAMP,
                  promotedBy: state.user.uid,
                };
            await api.db.ref(`communityEvents/${event.id}`).update(updates);
            await loadData();
            const message = actionMode === "review"
              ? decision === "approved" ? "Evenimentul a fost verificat și publicat." : "Propunerea a fost respinsă."
              : actionMode === "request-promotion"
                ? "Solicitarea de promovare a fost trimisă administratorului pentru verificarea plății."
                : "Plata a fost confirmată; evenimentul este acum promovat.";
            setStatus(message, "success");
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

  function eventCategoryLabel(category) {
    return ({
      socializing: "Socializare",
      workshops: "Ateliere",
      charity: "Caritate",
      exhibitions: "Expoziții și artă",
      sports: "Sport",
      healthcare: "Sănătate și wellbeing",
      entertainment: "Muzică și divertisment",
    })[category] || category;
  }

  function renderList(container, list, emptyText, actionMode) {
    container.replaceChildren();
    if (!list.length) {
      container.append(element("p", "workflow-empty", emptyText));
      return;
    }
    list.forEach((event) => container.append(renderCard(event, actionMode)));
  }

  function eventFromSnapshot(snapshot) {
    return { id: snapshot.key, ...snapshot.val() };
  }

  function publishPublicEvents(events) {
    state.events = events.filter((event) =>
    event.status === "approved" || event.status === "pending"
    );
    if (typeof window.FomoRefreshCommunityEvents === "function") {
    window.FomoRefreshCommunityEvents(state.events.map((event) => ({
      id: `community-${event.id}`,
      databaseEventId: event.id,
      title: event.title,
        category: event.category,
        description: event.description,
        venue: `${event.venue}, ${event.city}`,
        venueType: event.venueType,
        locationId: event.locationId,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        latitude: Number(event.latitude),
        longitude: Number(event.longitude),
        ticketPriceCents: Number(event.ticketPriceCents || 0),
        ticketUrl: event.ticketUrl || "",
        status: event.status,
        tier: event.promotionStatus === "paid" ? "paid" : "free",
        attendeesCount: event.attendeesCount,
        attendanceLoaded: event.attendanceLoaded === true,
        attendanceError: event.attendanceError || null,
        goingByMe: Boolean(event.goingByMe),
        votes: 0,
        votedByMe: false,
        source: "community",
      })));
    }
  }

  function watchAttendance(event) {
    if (attendanceSubscriptions.has(event.id)) return;
    const ref = api.db.ref(`eventAttendance/${event.id}`);
    const listener = ref.on("value", (snapshot) => {
      const attendees = snapshot.val() || {};
      attendanceData.set(event.id, attendees);
      const currentUser = api.user();
      const currentEvent = state.events.find((item) => item.id === event.id);
      if (!currentEvent) return;
      currentEvent.attendeesCount = Object.keys(attendees).length;
      currentEvent.attendanceLoaded = true;
      currentEvent.attendanceError = null;
      currentEvent.goingByMe = Boolean(currentUser && attendees[currentUser.uid]);
      publishPublicEvents(state.events);
    }, (error) => {
      console.error(`Could not load attendance for event ${event.id}.`, error);
      const currentEvent = state.events.find((item) => item.id === event.id);
      if (currentEvent) {
        currentEvent.attendanceLoaded = false;
        currentEvent.attendanceError = error.message;
        publishPublicEvents(state.events);
      }
      setStatus(`Nu am putut încărca numărul real de participanți: ${error.message}`, "error");
    });
    attendanceSubscriptions.set(event.id, { ref, listener });
  }

  function updateAttendanceSubscriptions(events) {
    const eventIds = new Set(events.map((event) => event.id));
    for (const [eventId, subscription] of attendanceSubscriptions) {
      if (!eventIds.has(eventId)) {
        subscription.ref.off("value", subscription.listener);
        attendanceSubscriptions.delete(eventId);
        attendanceData.delete(eventId);
      }
    }
    const currentUser = api.user();
    events.forEach((event) => {
      const hasAttendance = attendanceData.has(event.id);
      const attendees = attendanceData.get(event.id);
      event.attendanceLoaded = hasAttendance;
      event.attendanceError = null;
      if (hasAttendance) {
        event.attendeesCount = Object.keys(attendees).length;
        event.goingByMe = Boolean(currentUser && attendees[currentUser.uid]);
      } else {
        event.attendeesCount = null;
        event.goingByMe = false;
      }
      watchAttendance(event);
    });
  }

  async function loadData() {
    if (!api.configured) {
      setStatus("Configurează Firebase pentru a activa propunerile și moderarea online.", "error");
      return;
    }
    const [approvedSnapshot, pendingSnapshot, locations] = await Promise.all([
      api.db.ref("communityEvents").orderByChild("status").equalTo("approved").once("value"),
      api.db.ref("communityEvents").orderByChild("status").equalTo("pending").once("value"),
      api.locations(),
    ]);
    const publicEvents = [];
    pendingSnapshot.forEach((child) => publicEvents.push(eventFromSnapshot(child)));
    const approved = [];
    approvedSnapshot.forEach((child) => approved.push(eventFromSnapshot(child)));
    const mergedPublicEvents = [...approved, ...publicEvents];
    state.events = mergedPublicEvents;
    updateAttendanceSubscriptions(mergedPublicEvents);
    publishPublicEvents(mergedPublicEvents);
    state.locations = locations;
    if (typeof window.FomoSetEventLocations === "function") {
      window.FomoSetEventLocations(state.locations);
    } else if (typeof window.FomoSetLocations === "function") {
      window.FomoSetLocations(state.locations);
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
      renderList(ui.promotionList, [], "Autentifică-te pentru a vedea solicitările de promovare.", false);
      renderList(ui.adminInboxList, [], "Autentifică-te ca administrator.", false);
      ui.adminInbox.hidden = true;
      ui.adminInboxCount.textContent = "";
      ui.promotionCount.textContent = "";
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
      renderList(ui.promotionList, [], "Confirmă emailul pentru a gestiona promovările.", false);
      renderList(ui.adminInboxList, [], "Confirmă emailul pentru acces.", false);
      ui.adminInbox.hidden = true;
      ui.adminInboxCount.textContent = "";
      ui.promotionCount.textContent = "";
      return;
    }

    try {
      const admin = state.user.uid === eventAdminUid
        ? await api.db.ref(`admins/${state.user.uid}`).once("value")
        : null;
      const isVldAdmin = admin?.val() === true;
      ui.adminInbox.hidden = !isVldAdmin;
      if (isVldAdmin) {
        const inboxSnapshot = await api.db.ref("communityEvents").once("value");
        const pendingEvents = [];
        inboxSnapshot.forEach((child) => {
          const event = eventFromSnapshot(child);
          if (event.status === "pending") pendingEvents.push(event);
        });
        renderList(
          ui.adminInboxList,
          pendingEvents,
          "Nu ai mesaje noi cu propuneri de evenimente.",
          pendingEvents.length ? "review" : null,
        );
        ui.adminInboxCount.textContent = `${pendingEvents.length} propuneri în așteptare`;
      } else {
        renderList(ui.adminInboxList, [], "Mesajele sunt disponibile doar administratorului.", false);
        ui.adminInboxCount.textContent = "";
      }
      const ownedLocations = state.locations.filter((location) => location.ownerUid === state.user.uid);
      const ownerPendingSnapshots = isVldAdmin
        ? []
        : await Promise.all(ownedLocations.map((location) => api.db.ref("communityEvents")
          .orderByChild("locationId")
          .equalTo(location.id)
          .once("value")));
      const ownerPendingEvents = new Map();
      ownerPendingSnapshots.forEach((snapshot) => snapshot.forEach((child) => {
        const event = eventFromSnapshot(child);
        if (event.status === "pending") ownerPendingEvents.set(event.id, event);
      }));
      renderList(
        ui.moderationList,
        [...ownerPendingEvents.values()],
        isVldAdmin
          ? "Propunerile în așteptare sunt în inboxul din „Propune un eveniment”."
          : "Nu există propuneri în așteptare pentru locațiile tale.",
        ownerPendingEvents.size ? "review" : null,
      );
      ui.moderationCount.textContent = `${ownerPendingEvents.size} propuneri pentru locațiile tale`;
      const ownedLocationIds = new Set(
        state.locations
          .filter((location) => location.ownerUid === state.user.uid)
          .map((location) => location.id),
      );
      const promotionEvents = approved.filter((event) =>
        admin?.val() === true
          ? event.promotionStatus === "requested"
          : ownedLocationIds.has(event.locationId) &&
            Number.isSafeInteger(event.ticketPriceCents) &&
            event.ticketPriceCents > 0 &&
            event.promotionStatus !== "paid"
      );
      const promotionAction = admin?.val() === true
        ? promotionEvents.length ? "confirm-promotion" : null
        : promotionEvents.some((event) => !event.promotionStatus) ? "request-promotion" : null;
      renderList(
        ui.promotionList,
        promotionEvents,
        admin?.val() === true
          ? "Nu există solicitări de promovare în așteptare."
          : "Nu există evenimente aprobate eligibile pentru promovare la locațiile tale.",
        promotionAction,
      );
      ui.promotionCount.textContent = `${promotionEvents.length} ${
        admin?.val() === true ? "plăți de verificat" : "evenimente eligibile sau solicitări în curs"
      }`;
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
    const endsAt = new Date(String(values.get("endsAt")));
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      setStatus("Alege o dată validă, aflată în viitor.", "error");
      return;
    }
    if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
      setStatus("Ora de încheiere trebuie să fie după ora de început.", "error");
      return;
    }
    const ticketPriceCents = Math.round(Number(values.get("ticketPrice")) * 100);
    const ticketUrlValue = String(values.get("ticketUrl") || "").trim();
    if (ticketPriceCents > 0) {
      try {
        if (new URL(ticketUrlValue).protocol !== "https:") throw new Error();
      } catch {
        setStatus("Pentru un eveniment cu plată introdu un link de bilete valid, care începe cu https://.", "error");
        return;
      }
    }
    ui.submit.disabled = true;
    try {
      const location = state.locations.find((item) => item.id === String(values.get("locationId")));
      if (!location) throw new Error("Alege o locație validă.");
      const eventData = {
        title: String(values.get("title")).trim(),
        description: String(values.get("description")).trim(),
        category: String(values.get("category")),
        locationId: location.id,
        venue: location.name,
        city: location.city,
        venueType: location.category || "Altele",
        latitude: location.latitude,
        longitude: location.longitude,
        status: "pending",
        submittedBy: user.uid,
        startsAt: startsAt.toISOString(),
        startsAtMs: startsAt.getTime(),
        endsAt: endsAt.toISOString(),
        ticketPriceCents,
        ...(ticketUrlValue ? { ticketUrl: ticketUrlValue } : {}),
        submittedAt: firebase.database.ServerValue.TIMESTAMP,
      };
      const createdEvent = await api.db.ref("communityEvents").push(eventData);
      ui.form.reset();
      let submissionStatus = "Evenimentul apare pe hartă cu eticheta „În verificare”; ownerul locației sau user-vld îl poate aproba.";
      let submissionStatusType = "success";
      try {
        const xpResult = await window.FomoGamification.awardXp("event_created", createdEvent.key);
        submissionStatus = xpResult.xpAwarded
          ? `${submissionStatus} Ai primit 50 XP.`
          : `${submissionStatus} XP-ul pentru această propunere fusese deja acordat.`;
      } catch (xpError) {
        console.error("Event proposal succeeded, but XP could not be awarded.", xpError);
        submissionStatus = `Evenimentul a fost trimis, dar XP nu a putut fi acordat: ${xpError.message}`;
        submissionStatusType = "error";
      }
      try {
        await loadData();
      } catch (refreshError) {
        console.error("Event proposal succeeded, but the event list could not refresh.", refreshError);
        submissionStatus += ` Lista nu s-a putut actualiza: ${refreshError.message}`;
        submissionStatusType = "error";
      }
      setStatus(submissionStatus, submissionStatusType);
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
