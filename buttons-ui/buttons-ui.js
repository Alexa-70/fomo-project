(function () {
  const homeButton = document.querySelector("#home-button");
  const featuresButton = document.querySelector("#features-button");
  const friendsButton = document.querySelector("#friends-button");
  const searchButton = document.querySelector("#search-button");
  const profileButton = document.querySelector("#profile-button");
  const floatingPanel = document.querySelector("#floating-panel");
  const friendsPanel = document.querySelector("#friends-panel");
  const friendsFindButton = document.querySelector("#friends-find-button");
  const friendsSearchBox = document.querySelector("#friends-search-box");
  const friendsSearchForm = document.querySelector("#friends-search-form");
  const friendsSearchCancel = document.querySelector("#friends-search-cancel");
  const friendsSearchInput = document.querySelector("#friends-search-input");
  const friendsSearchResults = document.querySelector("#friends-search-results");
  const friendsStatus = document.querySelector("#friends-status");
  const friendsList = document.querySelector("#friends-list");
  const friendsCount = document.querySelector("#friends-count");
  const friendsRequestsSection = document.querySelector(".friends-requests-section");
  const friendsRequestsList = document.querySelector("#friends-requests-list");
  const friendsRequestsCount = document.querySelector("#friends-requests-count");
  const friendsCountBadge = document.querySelector("#friends-count-badge");
  const searchPanel = document.querySelector("#search-panel");
  const profilePanel = document.querySelector("#profile-panel");
  const searchInput = document.querySelector("#event-search-input");
  const searchFilters = document.querySelector("#search-filters");
  const searchResults = document.querySelector("#search-results");
  const searchResultsStatus = document.querySelector("#search-results-status");
  const profileUsername = document.querySelector("#profile-username");
  const profileAccountNote = document.querySelector("#profile-account-note");
  const profileNameEditor = document.querySelector("#profile-name-editor");
  const profileNameInput = document.querySelector("#profile-name-input");
  const profileEditName = document.querySelector("#profile-edit-name");
  const profileAuthSwitch = document.querySelector(".profile-auth-switch");
  const profileLoginTab = document.querySelector("#profile-login-tab");
  const profileSignupTab = document.querySelector("#profile-signup-tab");
  const profileLoginForm = document.querySelector("#profile-login-form");
  const profileSignupForm = document.querySelector("#profile-signup-form");
  const profileAuthPanel = document.querySelector(".profile-auth-panel");
  const profileAuthStatus = document.querySelector("#profile-auth-status");
  const profileResetPassword = document.querySelector("#profile-reset-password");
  const profileSignout = document.querySelector("#profile-signout");
  const profileBadges = document.querySelector("#profile-badges");
  const profilePlacesList = document.querySelector("#profile-places-list");
  const mapHint = document.querySelector("#map-hint");
  const profileNameKey = "fomo-profile-name-v1";
  const profileVisitsKey = "fomo-place-visits-v1";
  let friendUser = null;
  let friendPublicProfile = null;
  let friendRecords = {};
  let incomingFriendRequests = {};
  let friendSubscriptions = [];
  let friendSubscriptionUid = null;
  let activeSearchCategory = "all";

  function getBackgroundColor(element) {
    const values = getComputedStyle(element).backgroundColor.match(/[\d.]+/g);
    if (!values || values.length < 3) return null;
    return {
      red: Number(values[0]),
      green: Number(values[1]),
      blue: Number(values[2]),
      alpha: values.length > 3 ? Number(values[3]) : 1,
    };
  }

  function updateNavigationSurfaceTheme(view) {
    const surface = view === "features" ? floatingPanel
      : view === "friends" ? friendsPanel
        : view === "search" ? searchPanel
          : view === "profile" ? profilePanel
            : document.querySelector("#map");
    const foreground = getBackgroundColor(surface);
    const base = getBackgroundColor(document.body) || { red: 255, green: 253, blue: 250, alpha: 1 };
    const alpha = foreground ? foreground.alpha : 0;
    const color = foreground
      ? {
        red: foreground.red * alpha + base.red * (1 - alpha),
        green: foreground.green * alpha + base.green * (1 - alpha),
        blue: foreground.blue * alpha + base.blue * (1 - alpha),
      }
      : base;
    const luminance = (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) / 255;

    document.body.dataset.navigationSurface = luminance < 0.5 ? "dark" : "light";
  }

  function closeFriendsSearch() {
    friendsSearchBox.classList.remove("is-expanded");
    friendsFindButton.hidden = false;
    friendsFindButton.setAttribute("aria-expanded", "false");
    friendsSearchForm.hidden = true;
    friendsSearchInput.value = "";
    friendsStatus.textContent = "";
    friendsSearchResults.replaceChildren();
  }

  function setNavigationView(view) {
    updateNavigationSurfaceTheme(view);
    const featuresOpen = view === "features";
    const friendsOpen = view === "friends";
    const searchOpen = view === "search";
    const profileOpen = view === "profile";

    floatingPanel.classList.toggle("is-open", featuresOpen);
    friendsPanel.hidden = !friendsOpen;
    searchPanel.hidden = !searchOpen;
    profilePanel.hidden = !profileOpen;
    featuresButton.classList.toggle("active", featuresOpen);
    friendsButton.classList.toggle("active", friendsOpen);
    searchButton.classList.toggle("active", searchOpen);
    profileButton.classList.toggle("active", profileOpen);
    homeButton.classList.toggle("active", view === "home");
    featuresButton.setAttribute("aria-expanded", String(featuresOpen));
    friendsButton.setAttribute("aria-expanded", String(friendsOpen));
    searchButton.setAttribute("aria-expanded", String(searchOpen));
    profileButton.setAttribute("aria-expanded", String(profileOpen));
    [homeButton, featuresButton, friendsButton, searchButton, profileButton].forEach((button) => button.removeAttribute("aria-current"));
    const currentButton = view === "home" ? homeButton
      : featuresOpen ? featuresButton
        : friendsOpen ? friendsButton
          : searchOpen ? searchButton
        : profileOpen ? profileButton
          : null;
    if (currentButton) currentButton.setAttribute("aria-current", "page");
    mapHint.style.display = view === "home" ? "" : "none";
    document.body.dataset.navigationView = view;
    if (view === "home" && window.FomoRouteContext) {
      window.setTimeout(() => window.FomoRouteContext.map.invalidateSize(), 50);
    }
  }

  updateNavigationSurfaceTheme("home");

  function renderSearchResults() {
    searchResults.replaceChildren();
    if (!searchInput.value.trim() && activeSearchCategory === "all") {
      searchResultsStatus.textContent = "Scrie pentru a căuta evenimente.";
      return;
    }

    const matches = window.FomoSearch.search(searchInput.value, activeSearchCategory);
    if (!matches.length) {
      searchResultsStatus.textContent = "Nu am găsit evenimente pentru filtrul selectat.";
      return;
    }

    searchResultsStatus.textContent = `${matches.length} ${matches.length === 1 ? "rezultat" : "rezultate"}`;
    matches.forEach((event) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "search-result-button";
      button.type = "button";
      const title = document.createElement("span");
      title.className = "search-result-title";
      title.textContent = event.title;
      const details = document.createElement("span");
      details.className = "search-result-details";
      details.textContent = `${event.venue} · ${event.category}`;
      button.append(title, details);
      button.addEventListener("click", () => {
        window.FomoSearch.select(event.id);
        searchInput.value = "";
        activeSearchCategory = "all";
        searchFilters.querySelectorAll(".search-filter").forEach((filterButton) => {
          const isActive = filterButton.dataset.category === activeSearchCategory;
          filterButton.classList.toggle("active", isActive);
          filterButton.setAttribute("aria-pressed", String(isActive));
        });
        renderSearchResults();
        setNavigationView("home");
      });
      item.append(button);
      searchResults.append(item);
    });
  }

  function readStoredValue(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      console.error(`Could not read local profile data for "${key}".`, error);
      return "Indisponibil";
    }
  }

  function renderFriends() {
    const friends = Object.entries(friendRecords);
    friendsCount.textContent = String(friends.length);
    friendsCountBadge.hidden = !friendUser;
    friendsCountBadge.textContent = friends.length > 9 ? "9+" : String(friends.length);
    friendsButton.setAttribute("aria-label", `Friends, ${friends.length} ${friends.length === 1 ? "prieten" : "prieteni"}`);
    friendsList.replaceChildren();

    if (!friendUser) {
      friendsList.append(createFriendsEmpty("Autentifică-te cu un cont cu email confirmat pentru a folosi prietenii."));
      return;
    }
    if (!friends.length) {
      const empty = document.createElement("li");
      empty.className = "friends-empty";
      empty.textContent = "Nu ai încă prieteni. Caută username-ul exact al unei persoane.";
      friendsList.append(empty);
      return;
    }

    friends.forEach(([friendUid, friend]) => {
      const item = document.createElement("li");
      item.className = "friend-item";
      const avatar = document.createElement("span");
      avatar.className = "friend-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = String(friend.username || "?").trim().charAt(0).toLocaleUpperCase("ro") || "?";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = friend.username;
      const removeButton = document.createElement("button");
      removeButton.className = "friend-remove-button";
      removeButton.type = "button";
      removeButton.textContent = "Elimină";
      removeButton.setAttribute("aria-label", `Elimină ${friend.username} din lista de prieteni`);
      removeButton.addEventListener("click", async () => {
        removeButton.disabled = true;
        try {
          const updates = {
            [`friends/${friendUser.uid}/${friendUid}`]: null,
            [`friends/${friendUid}/${friendUser.uid}`]: null,
            [`friendRequests/${friendUser.uid}/${friendUid}`]: null,
            [`friendRequests/${friendUid}/${friendUser.uid}`]: null,
          };
          await window.FomoFirebase.db.ref().update(updates);
          friendsStatus.textContent = `${friend.username} a fost eliminat(ă) din lista de prieteni.`;
        } catch (error) {
          removeButton.disabled = false;
          friendsStatus.textContent = `Nu am putut elimina prietenul: ${error.message}`;
        }
      });
      item.append(avatar, name, removeButton);
      friendsList.append(item);
    });
  }

  function createFriendsEmpty(message) {
    const empty = document.createElement("li");
    empty.className = "friends-empty";
    empty.textContent = message;
    return empty;
  }

  function renderFriendRequests() {
    friendsRequestsList.replaceChildren();
    const requests = Object.entries(incomingFriendRequests)
      .filter(([, request]) => request.status === "pending" ||
        (request.status === "accepted" && !friendRecords[request.fromUid]));
    friendsRequestsSection.hidden = !requests.length;
    friendsRequestsCount.textContent = String(requests.length);
    requests.forEach(([requesterUid, request]) => {
      const item = document.createElement("li");
      item.className = "friend-item friend-request-item";
      const details = document.createElement("span");
      details.className = "friend-name";
      details.textContent = request.status === "accepted"
        ? `${request.fromUsername} · finalizează conectarea`
        : `${request.fromUsername} dorește să te adauge`;
      item.append(details);
      const actions = document.createElement("div");
      actions.className = "friend-request-actions";
      const acceptButton = document.createElement("button");
      acceptButton.className = "friends-add-button";
      acceptButton.type = "button";
      acceptButton.textContent = request.status === "accepted" ? "Finalizează" : "Acceptă";
      acceptButton.addEventListener("click", async () => {
        acceptButton.disabled = true;
        try {
          if (request.status !== "accepted") {
            await window.FomoFirebase.db.ref(`friendRequests/${friendUser.uid}/${requesterUid}`).update({
              status: "accepted",
              reviewedAt: firebase.database.ServerValue.TIMESTAMP,
            });
          }
          const updates = {};
          updates[`friends/${friendUser.uid}/${requesterUid}`] = {
            uid: requesterUid,
            username: request.fromUsername,
            since: firebase.database.ServerValue.TIMESTAMP,
          };
          updates[`friends/${requesterUid}/${friendUser.uid}`] = {
            uid: friendUser.uid,
            username: request.toUsername,
            since: firebase.database.ServerValue.TIMESTAMP,
          };
          await window.FomoFirebase.db.ref().update(updates);
          const friendsSnapshot = await window.FomoFirebase.db
            .ref(`friends/${friendUser.uid}`)
            .once("value");
          friendRecords = friendsSnapshot.val() || {};
          renderFriends();
          renderFriendRequests();
          friendsStatus.textContent = `Acum ești prieten(ă) cu ${request.fromUsername}.`;
        } catch (error) {
          acceptButton.disabled = false;
          friendsStatus.textContent = `Nu am putut accepta cererea: ${error.message}`;
        }
      });
      actions.append(acceptButton);
      if (request.status === "pending") {
        const rejectButton = document.createElement("button");
        rejectButton.className = "friend-remove-button";
        rejectButton.type = "button";
        rejectButton.textContent = "Refuză";
        rejectButton.addEventListener("click", async () => {
          rejectButton.disabled = true;
          try {
            await window.FomoFirebase.db.ref(`friendRequests/${friendUser.uid}/${requesterUid}`).update({
              status: "rejected",
              reviewedAt: firebase.database.ServerValue.TIMESTAMP,
            });
          } catch (error) {
            rejectButton.disabled = false;
            friendsStatus.textContent = `Nu am putut refuza cererea: ${error.message}`;
          }
        });
        actions.append(rejectButton);
      }
      item.append(actions);
      friendsRequestsList.append(item);
    });
  }

  function clearFriendSubscriptions() {
    friendSubscriptions.forEach((reference) => reference.off("value"));
    friendSubscriptions = [];
    friendSubscriptionUid = null;
    friendUser = null;
    friendPublicProfile = null;
    friendRecords = {};
    incomingFriendRequests = {};
    friendsCountBadge.hidden = true;
    friendsCountBadge.textContent = "";
    friendsButton.setAttribute("aria-label", "Friends");
    friendsRequestsSection.hidden = true;
    renderFriends();
    renderFriendRequests();
  }

  async function ensurePublicProfile(user) {
    const database = window.FomoFirebase.db;
    const profileRef = database.ref(`publicProfiles/${user.uid}`);
    const username = String(user.displayName || "").trim();
    if (!username) {
      throw new Error("Contul nu are username în Firebase Authentication. Actualizează numele profilului și reîncearcă.");
    }
    const publicProfile = {
      username,
      usernameKey: username.toLocaleLowerCase("ro"),
    };
    await profileRef.set(publicProfile);
    return publicProfile;
  }

  function getUsernameIndexKey(usernameKey) {
    const bytes = new TextEncoder().encode(usernameKey);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function ensureUsernameIndex(user, profile) {
    const indexRef = window.FomoFirebase.db.ref(`usernameIndex/${getUsernameIndexKey(profile.usernameKey)}`);
    const result = await indexRef.transaction((current) => {
      if (current === null) {
        return {
          uid: user.uid,
          username: profile.username,
          usernameKey: profile.usernameKey,
        };
      }
      return current.uid === user.uid ? current : undefined;
    });
    if (!result.committed || result.snapshot.child("uid").val() !== user.uid) {
      throw new Error("Username-ul este deja folosit de un alt cont.");
    }
    const indexedProfile = result.snapshot.val();
    if (indexedProfile.usernameKey !== profile.usernameKey) {
      throw new Error("Indexul username-ului nu corespunde profilului contului.");
    }
  }

  async function setupFriendAccount(user) {
    if (!user || !window.FomoFirebase?.configured) {
      clearFriendSubscriptions();
      friendsStatus.textContent = "Autentifică-te pentru a căuta și adăuga prieteni.";
      return;
    }
    if (friendSubscriptionUid === user.uid) return;
    clearFriendSubscriptions();
    friendUser = user;
    friendSubscriptionUid = user.uid;
    friendsStatus.textContent = "";
    try {
      await user.reload();
      await user.getIdToken(true);
      user = window.FomoFirebase.user();
      if (!user?.emailVerified) {
        clearFriendSubscriptions();
        friendsStatus.textContent = "Confirmă adresa de email pentru a folosi prietenii.";
        return;
      }
      friendPublicProfile = await ensurePublicProfile(user);
      await ensureUsernameIndex(user, friendPublicProfile);
      if (friendSubscriptionUid !== user.uid || window.FomoFirebase.user()?.uid !== user.uid) return;
      const friendsRef = window.FomoFirebase.db.ref(`friends/${user.uid}`);
      const requestsRef = window.FomoFirebase.db.ref(`friendRequests/${user.uid}`);
      const friendsListener = friendsRef.on("value", (snapshot) => {
        if (friendSubscriptionUid !== user.uid) return;
        friendRecords = snapshot.val() || {};
        renderFriends();
        renderFriendRequests();
      }, (error) => {
        if (friendSubscriptionUid !== user.uid) return;
        console.error("Could not load the friends list.", error);
        friendsStatus.textContent = `Nu am putut încărca lista de prieteni: ${error.message}`;
      });
      const requestsListener = requestsRef.on("value", (snapshot) => {
        if (friendSubscriptionUid !== user.uid) return;
        incomingFriendRequests = snapshot.val() || {};
        renderFriendRequests();
      }, (error) => {
        if (friendSubscriptionUid !== user.uid) return;
        console.error("Could not load friend requests.", error);
        friendsStatus.textContent = `Nu am putut încărca notificările: ${error.message}`;
      });
      friendSubscriptions = [
        { off: (event) => friendsRef.off(event, friendsListener) },
        { off: (event) => requestsRef.off(event, requestsListener) },
      ];
    } catch (error) {
      if (friendSubscriptionUid !== user.uid) return;
      friendSubscriptions.forEach((reference) => reference.off("value"));
      friendSubscriptions = [];
      friendSubscriptionUid = null;
      friendUser = user;
      friendPublicProfile = null;
      console.error("Could not prepare the friends account.", error);
      friendsStatus.textContent = `Nu am putut încărca prietenii: ${error.message}`;
    }
  }

  function setProfileAuthStatus(message, state = "") {
    profileAuthStatus.textContent = message;
    if (state) profileAuthStatus.dataset.state = state;
    else delete profileAuthStatus.dataset.state;
  }

  function profileAuthErrorMessage(error, action) {
    const isPermissionDenied = error.code === "PERMISSION_DENIED" ||
      String(error.message).includes("PERMISSION_DENIED");
    if (isPermissionDenied) {
      return `Firebase a refuzat ${action} profilului. Regulile Realtime Database active nu permit accesul la users/{UID}. Publică regulile din database.rules.json cu: npx --yes firebase-tools@latest deploy --only database --project fomo-68a85`;
    }
    return error.message;
  }

  function setProfileAuthMode(mode) {
    const isSignup = mode === "signup";
    profileLoginForm.hidden = isSignup;
    profileSignupForm.hidden = !isSignup;
    profileLoginTab.classList.toggle("active", !isSignup);
    profileSignupTab.classList.toggle("active", isSignup);
    profileLoginTab.setAttribute("aria-selected", String(!isSignup));
    profileSignupTab.setAttribute("aria-selected", String(isSignup));
    setProfileAuthStatus("");
  }

  async function renderProfileAccount(user) {
    const api = window.FomoFirebase;
    if (!api || !api.configured) {
      profileAuthPanel.hidden = false;
      profileAuthSwitch.hidden = true;
      profileLoginForm.hidden = true;
      profileSignupForm.hidden = true;
      profileSignout.hidden = true;
      profileEditName.hidden = true;
      setProfileAuthStatus(
        api && api.error
          ? "Firebase nu a putut porni. Verifică configurația și consola browserului."
          : "Autentificarea nu este disponibilă. Configurează Firebase pentru a continua.",
        "error",
      );
      return;
    }

    if (!user) {
      profileAuthPanel.hidden = false;
      profileAuthSwitch.hidden = false;
      profileSignout.hidden = true;
      profileEditName.hidden = false;
      profileAccountNote.textContent = "Profil local · autentifică-te pentru sincronizarea contului.";
      profileUsername.textContent = readStoredValue(profileNameKey, "Explorator");
      setProfileAuthMode("login");
      return;
    }

    profileAuthPanel.hidden = true;
    profileAuthSwitch.hidden = true;
    profileLoginForm.hidden = true;
    profileSignupForm.hidden = true;
    profileSignout.hidden = false;
    profileEditName.hidden = true;
    profileNameEditor.hidden = true;
    profileAccountNote.textContent = user.email || "Cont conectat prin Firebase Authentication.";
    profileUsername.textContent = user.displayName || user.email || "Utilizator";
    setProfileAuthStatus("");
    return true;
  }

  async function handleProfileLogin(event) {
    event.preventDefault();
    const submit = profileLoginForm.querySelector('button[type="submit"]');
    const values = new FormData(profileLoginForm);
    submit.disabled = true;
    setProfileAuthStatus("Se verifică datele de autentificare...");
    try {
      await window.FomoFirebase.auth.signInWithEmailAndPassword(
        String(values.get("email")).trim().toLowerCase(),
        String(values.get("password")),
      );
      const profileLoaded = await renderProfileAccount(window.FomoFirebase.user());
      if (profileLoaded) setProfileAuthStatus("Autentificare reușită.", "success");
    } catch (error) {
      console.error("Firebase profile sign-in failed.", error);
      setProfileAuthStatus(`Autentificarea a eșuat: ${profileAuthErrorMessage(error, "accesarea")}`, "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function handleProfileSignup(event) {
    event.preventDefault();
    const submit = profileSignupForm.querySelector('button[type="submit"]');
    const values = new FormData(profileSignupForm);
    const username = String(values.get("username")).trim();
    const email = String(values.get("email")).trim().toLowerCase();
    const password = String(values.get("password"));
    if (!username || username.length > 80 || password.length < 8) {
      setProfileAuthStatus("Introdu un nume și o parolă de cel puțin 8 caractere.", "error");
      return;
    }

    submit.disabled = true;
    setProfileAuthStatus("Se creează contul...");
    try {
      const credential = await window.FomoFirebase.auth.createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({ displayName: username });
      await window.FomoFirebase.db.ref(`users/${credential.user.uid}`).set({
        email,
        username,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      });
      await window.FomoFirebase.db.ref(`publicProfiles/${credential.user.uid}`).set({
        username,
        usernameKey: username.toLocaleLowerCase("ro"),
      });
      await credential.user.sendEmailVerification();
      await renderProfileAccount(credential.user);
      setProfileAuthStatus("Cont creat. Verifică emailul pentru a confirma adresa.", "success");
    } catch (error) {
      console.error("Firebase profile sign-up failed.", error);
      setProfileAuthStatus(`Înregistrarea nu a putut fi finalizată: ${profileAuthErrorMessage(error, "scrierea")}`, "error");
    } finally {
      submit.disabled = false;
    }
  }

  function loadProfileDetails() {
    profileUsername.textContent = readStoredValue(profileNameKey, "Explorator");
    const savedVisits = readStoredValue(profileVisitsKey, "[]");
    let visits = [];
    try {
      visits = savedVisits === "Indisponibil" ? [] : JSON.parse(savedVisits);
      if (!Array.isArray(visits)) throw new Error("Stored place visits are not a list.");
    } catch (error) {
      console.error("Could not parse saved place visits for the profile.", error);
    }

    const uniquePlaces = new Set(visits.map((visit) => visit.venue).filter(Boolean)).size;
    const badges = [
      { label: "Primul pas", detail: "Explorează prima locație", earned: uniquePlaces >= 1, icon: "✦" },
      { label: "Explorator", detail: "Descoperă 3 locații", earned: uniquePlaces >= 3, icon: "⌖" },
      { label: "Cunoscător", detail: "Descoperă 5 locații", earned: uniquePlaces >= 5, icon: "★" },
    ];
    profileBadges.replaceChildren();
    badges.forEach((badge) => {
      const item = document.createElement("div");
      item.className = `profile-badge${badge.earned ? " earned" : " locked"}`;
      item.title = badge.detail;
      const icon = document.createElement("span");
      icon.className = "profile-badge-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = badge.icon;
      const label = document.createElement("span");
      label.className = "profile-badge-label";
      label.textContent = badge.label;
      item.append(icon, label);
      profileBadges.append(item);
    });

    profilePlacesList.replaceChildren();
    const mostVisited = visits
      .filter((visit) => visit && typeof visit.venue === "string" && Number.isFinite(visit.count))
      .sort((left, right) => right.count - left.count || left.venue.localeCompare(right.venue, "ro"))
      .slice(0, 5);
    if (!mostVisited.length) {
      const empty = document.createElement("li");
      empty.className = "profile-places-empty";
      empty.textContent = "Locurile pe care le explorezi vor apărea aici.";
      profilePlacesList.append(empty);
    } else {
      mostVisited.forEach((visit) => {
        const item = document.createElement("li");
        item.className = "profile-place-item";
        const details = document.createElement("div");
        details.className = "profile-place-details";
        const venue = document.createElement("strong");
        venue.textContent = visit.venue;
        const event = document.createElement("span");
        event.textContent = visit.eventTitle || "Locație explorată";
        const count = document.createElement("span");
        count.className = "profile-place-count";
        count.textContent = `${visit.count} ${visit.count === 1 ? "vizită" : "vizite"}`;
        details.append(venue, event);
        item.append(details, count);
        profilePlacesList.append(item);
      });
    }
  }

  homeButton.addEventListener("click", () => setNavigationView("home"));
  featuresButton.addEventListener("click", () => {
    setNavigationView(floatingPanel.classList.contains("is-open") ? "home" : "features");
  });
  friendsButton.addEventListener("click", () => {
    const isOpening = friendsPanel.hidden;
    setNavigationView(isOpening ? "friends" : "home");
    if (isOpening) {
      renderFriends();
      renderFriendRequests();
      setupFriendAccount(window.FomoFirebase?.user() || null);
    }
  });
  friendsFindButton.addEventListener("click", () => {
    friendsSearchBox.classList.add("is-expanded");
    friendsFindButton.hidden = true;
    friendsFindButton.setAttribute("aria-expanded", "true");
    friendsSearchForm.hidden = false;
    friendsSearchInput.focus();
  });
  friendsSearchCancel.addEventListener("click", () => {
    closeFriendsSearch();
  });
  friendsSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = friendsSearchInput.value.trim();
    friendsSearchResults.replaceChildren();
    if (!username) {
      friendsStatus.textContent = "Scrie username-ul exact al persoanei.";
      friendsSearchInput.focus();
      return;
    }
    if (!friendUser) {
      friendsStatus.textContent = "Autentifică-te și confirmă emailul ca să poți căuta prieteni.";
      return;
    }
    if (!friendPublicProfile) {
      friendsStatus.textContent = "Profilul prietenilor nu s-a putut inițializa. Închide și redeschide Friends pentru a reîncerca.";
      return;
    }
    const submit = friendsSearchForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    friendsStatus.textContent = "Se caută username-ul...";
    try {
      const query = username.toLocaleLowerCase("ro");
      const match = await window.FomoFirebase.db
        .ref(`usernameIndex/${getUsernameIndexKey(query)}`)
        .once("value");
      const target = match.val();
      if (!target || target.usernameKey !== query) {
        friendsStatus.textContent = "";
        return;
      }
      if (target.uid === friendUser.uid) {
        friendsStatus.textContent = "Acesta este username-ul contului tău.";
        return;
      }
      if (friendRecords[target.uid]) {
        friendsStatus.textContent = `${target.username} este deja în lista ta de prieteni.`;
        return;
      }

      const item = document.createElement("li");
      item.className = "friend-item";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = target.username;
      const addButton = document.createElement("button");
      addButton.className = "friends-add-button";
      addButton.type = "button";
      addButton.textContent = "Adaugă";
      addButton.addEventListener("click", async () => {
        addButton.disabled = true;
        try {
          const database = window.FomoFirebase.db;
          const receivedRef = database.ref(`friendRequests/${friendUser.uid}/${target.uid}`);
          const sentRef = database.ref(`friendRequests/${target.uid}/${friendUser.uid}`);
          const [received, sent] = await Promise.all([
            receivedRef.once("value"),
            sentRef.once("value"),
          ]);
          if (received.child("status").val() === "pending") {
            friendsStatus.textContent = `${target.username} ți-a trimis deja o cerere. Accept-o în lista cererilor.`;
            return;
          }
          if (sent.child("status").val() === "pending") {
            friendsStatus.textContent = `Cererea către ${target.username} este deja trimisă.`;
            return;
          }
          await sentRef.set({
            fromUid: friendUser.uid,
            fromUsername: friendPublicProfile.username,
            toUid: target.uid,
            toUsername: target.username,
            status: "pending",
            createdAt: firebase.database.ServerValue.TIMESTAMP,
          });
          friendsStatus.textContent = `Cererea a fost trimisă lui ${target.username}. Va apărea în notificările sale.`;
          friendsSearchResults.replaceChildren();
          friendsSearchInput.value = "";
        } catch (error) {
          addButton.disabled = false;
          friendsStatus.textContent = `Nu am putut trimite cererea: ${error.message}`;
        }
      });
      item.append(name, addButton);
      friendsSearchResults.append(item);
      friendsStatus.textContent = "";
    } catch (error) {
      console.error("Could not search for an exact username.", error);
      friendsStatus.textContent = `Căutarea nu a reușit: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });
  searchButton.addEventListener("click", () => {
    const isOpen = !searchPanel.hidden;
    setNavigationView(isOpen ? "home" : "search");
    if (!isOpen) searchInput.focus();
  });
  searchInput.addEventListener("input", renderSearchResults);
  searchFilters.addEventListener("click", (event) => {
    const filterButton = event.target.closest(".search-filter");
    if (!filterButton) return;
    activeSearchCategory = filterButton.dataset.category;
    searchFilters.querySelectorAll(".search-filter").forEach((button) => {
      const isActive = button === filterButton;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    renderSearchResults();
  });
  profileButton.addEventListener("click", () => {
    const isOpen = !profilePanel.hidden;
    if (!isOpen) {
      loadProfileDetails();
      profileNameEditor.hidden = true;
      renderProfileAccount(window.FomoFirebase?.user() || null);
    }
    setNavigationView(isOpen ? "home" : "profile");
  });
  profileLoginTab.addEventListener("click", () => setProfileAuthMode("login"));
  profileSignupTab.addEventListener("click", () => setProfileAuthMode("signup"));
  profileLoginForm.addEventListener("submit", handleProfileLogin);
  profileSignupForm.addEventListener("submit", handleProfileSignup);
  profileResetPassword.addEventListener("click", async () => {
    const email = String(new FormData(profileLoginForm).get("email") || "").trim().toLowerCase();
    if (!email) {
      setProfileAuthStatus("Introdu adresa de email pentru a primi linkul de resetare.", "error");
      profileLoginForm.elements.email.focus();
      return;
    }
    try {
      await window.FomoFirebase.auth.sendPasswordResetEmail(email);
      setProfileAuthStatus("Am trimis un link de resetare dacă adresa există în sistem.", "success");
    } catch (error) {
      console.error("Firebase password reset failed.", error);
      setProfileAuthStatus(`Nu am putut trimite linkul de resetare: ${error.message}`, "error");
    }
  });
  profileSignout.addEventListener("click", async () => {
    try {
      await window.FomoFirebase.auth.signOut();
      loadProfileDetails();
      await renderProfileAccount(null);
      setProfileAuthStatus("Te-ai deconectat.", "success");
    } catch (error) {
      console.error("Firebase profile sign-out failed.", error);
      setProfileAuthStatus(`Deconectarea a eșuat: ${error.message}`, "error");
    }
  });
  if (window.FomoFirebase?.configured) {
    window.FomoFirebase.auth.onAuthStateChanged((user) => {
      setupFriendAccount(user).catch((error) => {
        console.error("Could not update Firebase friends state.", error);
        friendsStatus.textContent = `Nu am putut actualiza prietenii: ${error.message}`;
      });
      renderProfileAccount(user).catch((error) => {
        console.error("Could not update Firebase profile state.", error);
        setProfileAuthStatus(`Nu am putut actualiza starea contului: ${error.message}`, "error");
      });
    });
  } else {
    renderProfileAccount(null);
  }
  document.querySelector("#profile-edit-name").addEventListener("click", () => {
    profileNameInput.value = profileUsername.textContent;
    profileNameEditor.hidden = false;
    profileNameInput.focus();
  });
  profileNameEditor.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = profileNameInput.value.trim();
    if (!name) {
      profileNameInput.setCustomValidity("Introdu un nume pentru profil.");
      profileNameInput.reportValidity();
      profileNameInput.setCustomValidity("");
      return;
    }
    try {
      localStorage.setItem(profileNameKey, name);
    } catch (error) {
      console.error("Could not save the local profile name.", error);
      return;
    }
    profileUsername.textContent = name;
    profileNameEditor.hidden = true;
  });
  document.querySelector("#profile-name-cancel").addEventListener("click", () => {
    profileNameEditor.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNavigationView("home");
  });
  document.addEventListener("click", (event) => {
    if (!friendsSearchForm.hidden && !friendsSearchBox.contains(event.target)) {
      closeFriendsSearch();
    }
  });
})();
