(function () {
  const config = window.FOMO_FIREBASE_CONFIG;
  const configured = config &&
    ["apiKey", "authDomain", "projectId", "appId"].every((key) =>
      typeof config[key] === "string" &&
      config[key].length > 0 &&
      !config[key].startsWith("COMPLETEAZA_")
    );

  if (!configured || !window.firebase) {
    window.FomoFirebase = { configured: false };
    window.dispatchEvent(new CustomEvent("fomo-firebase-ready"));
    return;
  }

  try {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
    const auth = app.auth();
    const db = app.database();
    window.FomoFirebase = {
      configured: true,
      auth,
      db,
      user: () => auth.currentUser,
      locations: async () => {
        const snapshot = await db.ref("locations").once("value");
        return Object.entries(snapshot.val() || {})
          .map(([id, location]) => ({ id, ...location }))
          .sort((left, right) =>
            left.city.localeCompare(right.city, "ro") ||
            left.name.localeCompare(right.name, "ro")
          );
      },
    };
    window.dispatchEvent(new CustomEvent("fomo-firebase-ready"));
  } catch (error) {
    console.error("Firebase could not be initialized.", error);
    window.FomoFirebase = { configured: false, error };
    window.dispatchEvent(new CustomEvent("fomo-firebase-ready"));
  }
})();
