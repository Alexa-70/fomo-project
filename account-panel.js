(function () {
  const api = window.FomoFirebase;
  const nav = document.querySelector(".panel-tabs");
  const content = document.querySelector("#panel-content");
  const state = { locations: [], user: null, role: "user", emailVerified: false };
  let requestSubscription = null;
  let requestSubscriptionPath = null;
  let requestRefreshQueued = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function field(form, labelText, name, type, options = {}) {
    const wrapper = element("label", "account-field");
    wrapper.append(element("span", "", labelText));
    let input;
    if (options.select) {
      input = document.createElement("select");
    } else {
      input = document.createElement("input");
      input.type = type;
    }
    input.name = name;
    input.required = options.required !== false;
    if (options.minLength) input.minLength = options.minLength;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.placeholder) input.placeholder = options.placeholder;
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }

  function buildPanel() {
    const navButton = element("button", "tab-button", "Cont");
    navButton.type = "button";
    navButton.dataset.tab = "account";
    navButton.setAttribute("aria-selected", "false");
    const adminNoticeBadge = element("span", "account-notification-badge");
    adminNoticeBadge.hidden = true;
    adminNoticeBadge.setAttribute("aria-label", "Solicitări noi de owner");
    navButton.append(adminNoticeBadge);
    nav.append(navButton);

    const panel = element("section", "tab-panel account-panel");
    panel.dataset.tabPanel = "account";
    panel.setAttribute("aria-label", "Cont și cereri de owner");
    panel.append(
      element("p", "eyebrow", "Contul tău"),
      element("h2", "", "Autentificare"),
    );
    const status = element("p", "account-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const signedOut = element("div", "account-signed-out");
    const authSwitch = element("div", "workflow-switch account-auth-switch");
    const loginTab = element("button", "active", "Login");
    const signupTab = element("button", "", "Sign up");
    loginTab.type = signupTab.type = "button";
    authSwitch.append(loginTab, signupTab);

    const loginForm = element("form", "account-form");
    field(loginForm, "Adresa de email", "email", "email", { maxLength: 254, placeholder: "nume@exemplu.ro" });
    field(loginForm, "Parola", "password", "password", { minLength: 8, maxLength: 128 });
    const loginSubmit = element("button", "account-submit", "Login");
    loginSubmit.type = "submit";
    loginForm.append(loginSubmit);

    const signupForm = element("form", "account-form");
    signupForm.hidden = true;
    field(signupForm, "Username", "username", "text", { maxLength: 80, placeholder: "Cum te numești?" });
    field(signupForm, "Adresa de email", "email", "email", { maxLength: 254, placeholder: "nume@exemplu.ro" });
    field(signupForm, "Parola (minimum 8 caractere)", "password", "password", { minLength: 8, maxLength: 128 });
    const signupSubmit = element("button", "account-submit", "Creează cont");
    signupSubmit.type = "submit";
    signupForm.append(signupSubmit);
    signedOut.append(authSwitch, loginForm, signupForm);

    const signedIn = element("div", "account-signed-in");
    signedIn.hidden = true;
    const profile = element("div", "account-profile");
    const roleBadge = element("span", "account-role-badge");
    const resendButton = element("button", "account-secondary", "Retrimite emailul de confirmare");
    resendButton.type = "button";
    const signOutButton = element("button", "account-secondary", "Deconectare");
    signOutButton.type = "button";
    signedIn.append(profile, resendButton, signOutButton);

    const ownership = element("section", "account-section");
    ownership.append(
      element("h3", "", "Solicită rol de owner"),
      element("p", "account-help", "Trimite datele firmei care operează locația. Un administrator va verifica informațiile înainte de aprobare."),
    );
    const ownerForm = element("form", "account-form");
    const locationSelect = field(ownerForm, "Locația", "locationId", "text", { select: true });
    field(ownerForm, "Denumirea legală a firmei", "companyName", "text", {
      maxLength: 160,
      placeholder: "ex. Exemplu Restaurant SRL",
    });
    const companyType = field(ownerForm, "Forma juridică", "companyType", "text", { select: true });
    companyType.append(
      ...["SRL", "SRL-D", "SA", "PFA", "II", "IF", "Altă formă"].map((label) => {
        const option = element("option", "", label);
        option.value = label;
        return option;
      }),
    );
    const companyCountry = field(ownerForm, "Țara de înregistrare", "companyCountry", "text", { select: true });
    const romania = element("option", "", "România");
    romania.value = "RO";
    companyCountry.append(romania);
    field(ownerForm, "CUI / CIF", "companyCui", "text", {
      maxLength: 12,
      placeholder: "ex. RO12345678",
    });
    field(ownerForm, "Număr Registrul Comerțului", "companyTradeRegister", "text", {
      maxLength: 32,
      placeholder: "ex. J40/1234/2024",
    });
    field(ownerForm, "Sediul social", "companyAddress", "text", {
      maxLength: 200,
      placeholder: "Localitate, stradă, număr",
    });
    const ownerSubmit = element("button", "account-submit", "Trimite solicitarea");
    ownerSubmit.type = "submit";
    ownerForm.append(ownerSubmit);
    const ownerRequests = element("div", "account-request-list");
    ownership.append(ownerForm, ownerRequests);

    const adminSection = element("section", "account-section");
    adminSection.hidden = true;
    const adminHeading = element("h3", "account-admin-heading", "Mesaje de solicitare Owner");
    adminSection.append(
      adminHeading,
      element("p", "account-help", "Mesajele apar numai conturilor autorizate ca administrator. Verifică datele firmei înainte să confirmi sau să respingi ownerul."),
    );
    const adminRequests = element("div", "account-request-list");
    const seedButton = element("button", "account-secondary", "Încarcă cele 90 de locații");
    seedButton.type = "button";
    adminSection.append(seedButton, adminRequests);
    signedIn.append(ownership, adminSection);

    panel.append(signedOut, signedIn, status);
    content.insertBefore(panel, content.querySelector("#status-message"));

    return {
      navButton, adminNoticeBadge, panel, status, signedOut, signedIn, loginTab, signupTab,
      loginForm, signupForm, profile, resendButton, signOutButton, ownership,
      ownerForm, locationSelect, ownerRequests, adminSection, adminRequests, adminHeading,
      seedButton, roleBadge,
    };
  }

  const ui = buildPanel();

  function setStatus(message, stateName) {
    ui.status.textContent = message;
    if (stateName) ui.status.dataset.state = stateName;
    else delete ui.status.dataset.state;
  }

  function watchRequests(path) {
    if (requestSubscriptionPath === path) return;
    if (requestSubscription) requestSubscription.off("value", onRequestsChanged);
    requestSubscriptionPath = path;
    requestSubscription = api.db.ref(path);
    requestSubscription.on("value", onRequestsChanged, (error) => {
      console.error("Could not watch owner requests.", error);
      setStatus(error.message, "error");
    });
  }

  function onRequestsChanged() {
    if (requestRefreshQueued) return;
    requestRefreshQueued = true;
    Promise.resolve().then(async () => {
      try {
        await loadAccountData();
        window.dispatchEvent(new CustomEvent("fomo-auth-changed"));
      } finally {
        requestRefreshQueued = false;
      }
    }).catch((error) => {
      console.error("Could not refresh owner request status.", error);
      setStatus(error.message, "error");
    });
  }

  function stopWatchingRequests() {
    if (requestSubscription) requestSubscription.off("value", onRequestsChanged);
    requestSubscription = null;
    requestSubscriptionPath = null;
  }

  function activateAccountTab() {
    document.querySelectorAll(".panel-tabs .tab-button").forEach((button) => {
      const active = button === ui.navButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel-content > .tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel === ui.panel);
    });
  }

  function populateLocations() {
    const previous = ui.locationSelect.value;
    ui.locationSelect.replaceChildren();
    const prompt = element("option", "", "Alege orașul și locația");
    prompt.value = "";
    prompt.disabled = true;
    prompt.selected = true;
    ui.locationSelect.append(prompt);
    for (const location of state.locations) {
      const option = element("option", "", `${location.city} — ${location.name}`);
      option.value = location.id;
      if (location.ownerUid) {
        option.disabled = true;
        option.textContent += " · owner aprobat";
      }
      ui.locationSelect.append(option);
    }
    if (state.locations.some((item) => item.id === previous)) ui.locationSelect.value = previous;
  }

  function renderRequestList(container, requests, isAdmin) {
    container.replaceChildren();
    if (!requests.length) {
      container.append(element("p", "account-help", "Nu există solicitări de owner."));
      return;
    }
    for (const request of requests) {
      const card = element("article", "account-request-card");
      card.append(
        element("strong", "", `${request.city} — ${request.locationName}`),
        element("span", "", `${request.username} · ${request.email} · ${request.status === "pending" ? "În așteptare" : request.status === "approved" ? "Aprobată" : "Respinsă"}`),
      );
      if (isAdmin) {
        card.append(
          element("strong", "account-company-name", request.companyName || "Date de firmă indisponibile (solicitare veche)"),
          element("span", "", `Formă juridică: ${request.companyType || "—"} · Țară: ${request.companyCountry || "—"}`),
          element("span", "", `CUI/CIF: ${request.companyCui || "—"} · Registrul Comerțului: ${request.companyTradeRegister || "—"}`),
          element("span", "", `Sediu social: ${request.companyAddress || "—"}`),
        );
      }
      if (isAdmin && request.status === "pending") {
        const actions = element("div", "account-request-actions");
        for (const [decision, label] of [["rejected", "Respinge"], ["approved", "Aprobă"]]) {
          const button = element("button", decision === "approved" ? "approve" : "", label);
          button.type = "button";
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              const location = state.locations.find((item) => item.id === request.locationId);
              if (!location) throw new Error("Locația cererii nu mai există.");
              if (decision === "approved" && location.ownerUid && location.ownerUid !== request.userId) {
                throw new Error("Locația are deja un owner aprobat.");
              }
              const updates = {
                [`ownerRequests/${request.id}/status`]: decision,
                [`ownerRequests/${request.id}/reviewedAt`]: firebase.database.ServerValue.TIMESTAMP,
                [`ownerRequests/${request.id}/reviewedBy`]: state.user.uid,
              };
              if (decision === "approved") {
                updates[`locations/${request.locationId}/ownerUid`] = request.userId;
              }
              await api.db.ref().update(updates);
              await loadAccountData();
              setStatus(decision === "approved" ? "Ownerul locației a fost aprobat." : "Solicitarea a fost respinsă.", "success");
            } catch (error) {
              button.disabled = false;
              setStatus(error.message, "error");
            }
          });
          actions.append(button);
        }
        card.append(actions);
      }
      container.append(card);
    }
  }

  async function loadAccountData() {
    if (!api.configured) return;
    state.user = api.user();
    ui.signedOut.hidden = Boolean(state.user);
    ui.signedIn.hidden = !state.user;
    if (!state.user) {
      stopWatchingRequests();
      state.role = "user";
      state.emailVerified = false;
      ui.adminNoticeBadge.hidden = true;
      ui.adminNoticeBadge.textContent = "";
      ui.navButton.setAttribute("aria-label", "Cont");
      return;
    }

    await state.user.reload();
    state.user = api.user();
    state.emailVerified = state.user.emailVerified;
    await state.user.getIdToken(true);
    await api.ensureUserProfile(state.user);
    const [adminSnapshot, locations] = await Promise.all([
      api.db.ref(`admins/${state.user.uid}`).once("value"),
      api.locations(),
    ]);
    state.locations = locations;
    const isAdmin = state.emailVerified && adminSnapshot.val() === true;
    const ownedLocations = state.locations.filter((location) => location.ownerUid === state.user.uid);
    state.role = isAdmin ? "admin" : ownedLocations.length ? "owner" : "user";
    const roleLabel = state.role === "admin" ? "Administrator"
      : state.role === "owner" ? "Owner verificat"
        : "Utilizator";
    ui.profile.replaceChildren(
      element("strong", "", state.user.displayName || state.user.email),
      element("span", "", `${state.user.email}${state.emailVerified ? "" : " · email neconfirmat"}`),
      ui.roleBadge,
      ...(ownedLocations.length
        ? [element("span", "account-owned-locations", `Locații owner: ${ownedLocations.map((location) => location.name).join(", ")}`)]
        : []),
    );
    ui.roleBadge.textContent = roleLabel;
    ui.roleBadge.dataset.role = state.role;
    ui.resendButton.hidden = state.emailVerified;
    ui.ownership.hidden = !state.emailVerified;
    ui.adminSection.hidden = state.role !== "admin" || !state.emailVerified;

    populateLocations();
    if (!state.emailVerified) {
      stopWatchingRequests();
      ui.adminNoticeBadge.hidden = true;
      ui.adminNoticeBadge.textContent = "";
      ui.navButton.setAttribute("aria-label", "Cont");
      renderRequestList(ui.ownerRequests, [], false);
      renderRequestList(ui.adminRequests, [], true);
      return;
    }
    const requestsSnapshot = await (state.role === "admin"
      ? api.db.ref("ownerRequests").once("value")
      : api.db.ref(`ownerRequests/${state.user.uid}`).once("value"));
    watchRequests(state.role === "admin" ? "ownerRequests" : `ownerRequests/${state.user.uid}`);
    const requests = [];
    requestsSnapshot.forEach((userOrLocation) => {
      if (state.role === "admin") {
        userOrLocation.forEach((request) => {
          requests.push({ id: `${userOrLocation.key}/${request.key}`, ...request.val() });
        });
      } else {
        requests.push({ id: `${state.user.uid}/${userOrLocation.key}`, ...userOrLocation.val() });
      }
    });
    renderRequestList(ui.ownerRequests, state.role === "admin" ? [] : requests, false);
    if (state.role === "admin") {
      const pendingCount = requests.filter((request) => request.status === "pending").length;
      ui.adminNoticeBadge.hidden = pendingCount === 0;
      ui.adminNoticeBadge.textContent = pendingCount > 9 ? "9+" : String(pendingCount);
      ui.adminNoticeBadge.title = `${pendingCount} solicitări de owner în așteptare`;
      ui.navButton.setAttribute(
        "aria-label",
        pendingCount ? `Cont, ${pendingCount} solicitări de owner noi` : "Cont",
      );
      ui.adminHeading.textContent = pendingCount
        ? `Mesaje Owner · ${pendingCount} noi`
        : "Mesaje de solicitare Owner";
      renderRequestList(
        ui.adminRequests,
        requests.filter((request) => request.status === "pending"),
        true,
      );
    } else {
      ui.adminNoticeBadge.hidden = true;
      ui.adminNoticeBadge.textContent = "";
      ui.navButton.setAttribute("aria-label", "Cont");
    }
  }

  function setAuthMode(mode) {
    const signup = mode === "signup";
    ui.loginTab.classList.toggle("active", !signup);
    ui.signupTab.classList.toggle("active", signup);
    ui.loginForm.hidden = signup;
    ui.signupForm.hidden = !signup;
  }

  async function signUp(form) {
    const values = new FormData(form);
    const username = String(values.get("username")).trim();
    const email = String(values.get("email")).trim().toLowerCase();
    const password = String(values.get("password"));
    if (!username || username.length > 80 || password.length < 8) {
      setStatus("Introdu un username și o parolă de cel puțin 8 caractere.", "error");
      return;
    }
    const credential = await api.auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({ displayName: username });
    try {
      await api.db.ref(`users/${credential.user.uid}`).set({
        email,
        username,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      });
      await api.db.ref(`publicProfiles/${credential.user.uid}`).set({
        username,
        usernameKey: username.toLocaleLowerCase("ro"),
      });
      await credential.user.sendEmailVerification();
    } catch (error) {
      console.error("Account created, but profile or verification email could not be saved.", error);
      setStatus(`Contul a fost creat, dar pasul următor a eșuat: ${error.message}`, "error");
      return;
    }
    await loadAccountData();
    setStatus("Cont creat. Confirmă adresa din email înainte să trimiți evenimente sau cereri de owner.", "success");
  }

  async function signIn(form) {
    const values = new FormData(form);
    await api.auth.signInWithEmailAndPassword(
      String(values.get("email")).trim().toLowerCase(),
      String(values.get("password")),
    );
    await loadAccountData();
    setStatus(state.emailVerified ? "Autentificare reușită." : "Autentificare reușită. Confirmă adresa de email pentru a putea trimite solicitări.", state.emailVerified ? "success" : "error");
  }

  if (!api.configured) {
    ui.signedOut.hidden = true;
    ui.signedIn.hidden = true;
    setStatus(
      api.error
        ? "Firebase nu a putut porni. Verifică configurația proiectului și consola browserului."
        : "Completează firebase-config.js și configurează proiectul Firebase pentru a activa conturile și datele online.",
      "error",
    );
  } else {
    ui.navButton.addEventListener("click", activateAccountTab);
    ui.loginTab.addEventListener("click", () => setAuthMode("login"));
    ui.signupTab.addEventListener("click", () => setAuthMode("signup"));
    ui.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await signIn(ui.loginForm);
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    ui.signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await signUp(ui.signupForm);
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    ui.resendButton.addEventListener("click", async () => {
      try {
        await api.user().sendEmailVerification();
        setStatus("Am retrimis linkul de confirmare.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    ui.signOutButton.addEventListener("click", async () => {
      try {
        await api.auth.signOut();
        setStatus("Te-ai deconectat.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    ui.ownerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = ui.ownerForm.querySelector("button[type=submit]");
      submit.disabled = true;
      try {
        const location = state.locations.find((item) => item.id === ui.locationSelect.value);
        if (!location) throw new Error("Alege o locație validă.");
        if (location.ownerUid) throw new Error("Locația are deja un owner aprobat.");
        const values = new FormData(ui.ownerForm);
        const companyName = String(values.get("companyName") || "").trim();
        const companyType = String(values.get("companyType") || "").trim();
        const companyCountry = String(values.get("companyCountry") || "").trim();
        const companyCui = String(values.get("companyCui") || "").trim().toUpperCase().replace(/\s+/g, "");
        const companyTradeRegister = String(values.get("companyTradeRegister") || "").trim().toUpperCase();
        const companyAddress = String(values.get("companyAddress") || "").trim();
        const cuiDigits = companyCui.replace(/^RO/, "");
        if (!companyName || !companyType || companyCountry !== "RO" || !/^\d{2,10}$/.test(cuiDigits) ||
          !companyTradeRegister || !companyAddress) {
          throw new Error("Completează toate datele firmei. CUI/CIF trebuie să aibă între 2 și 10 cifre (prefixul RO este opțional).");
        }
        const requestId = `${state.user.uid}/${location.id}`;
        const existingRequest = await api.db.ref(`ownerRequests/${requestId}`).once("value");
        if (existingRequest.exists() && existingRequest.child("status").val() !== "rejected") {
          throw new Error("Ai deja o solicitare activă sau aprobată pentru această locație.");
        }
        await api.db.ref(`ownerRequests/${requestId}`).set({
          userId: state.user.uid,
          email: state.user.email,
          username: state.user.displayName || state.user.email,
          locationId: location.id,
          locationName: location.name,
          city: location.city,
          companyName,
          companyType,
          companyCountry,
          companyCui: companyCui.startsWith("RO") ? companyCui : `RO${companyCui}`,
          companyTradeRegister,
          companyAddress,
          status: "pending",
          submittedAt: firebase.database.ServerValue.TIMESTAMP,
        });
        ui.ownerForm.reset();
        await loadAccountData();
        setStatus("Solicitarea a fost trimisă administratorului.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });
    ui.seedButton.addEventListener("click", async () => {
      ui.seedButton.disabled = true;
      try {
        const response = await fetch("/locations.json");
        if (!response.ok) throw new Error(`Catalogul nu a putut fi încărcat (${response.status}).`);
        const locations = await response.json();
        if (!Array.isArray(locations) || locations.length !== 90) {
          throw new Error("Catalogul trebuie să conțină exact 90 de locații.");
        }
        const updates = {};
        for (const location of locations) {
          const existing = state.locations.find((item) => item.id === location.id);
          updates[`locations/${location.id}`] = {
            ...location,
            ...(existing && existing.ownerUid ? { ownerUid: existing.ownerUid } : {}),
            ...(existing && existing.imageUrl && !location.imageUrl ? { imageUrl: existing.imageUrl } : {}),
          };
        }
        await api.db.ref().update(updates);
        await loadAccountData();
        setStatus("Catalogul cu 90 de locații a fost încărcat în Realtime Database.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        ui.seedButton.disabled = false;
      }
    });
    api.auth.onAuthStateChanged(async () => {
      try {
        await loadAccountData();
        window.dispatchEvent(new CustomEvent("fomo-auth-changed"));
      } catch (error) {
        console.error("Could not refresh the signed-in account.", error);
        setStatus(error.message, "error");
      }
    });
  }
})();
