(function () {
  const rootElement = document.querySelector("#profile-xp-bar");
  if (!rootElement || !window.React || !window.ReactDOM) {
    console.error("ProfileXPBar requires React and its profile mount point.");
    return;
  }

  const { createElement: h, useState } = React;
  let root = null;
  let currentLoad = 0;

  function ProfileXPBar({ xp, level, rank_title, rewards }) {
    const [visibleRewardId, setVisibleRewardId] = useState(null);
    const safeXp = Number.isFinite(Number(xp)) ? Math.max(0, Math.floor(Number(xp))) : 0;
    const safeLevel = Math.min(5, Math.max(1, Math.floor(Number(level) || 1)));
    const levelStart = [0, 0, 101, 301, 701, 1500][safeLevel];
    const nextLevelStart = [0, 101, 301, 701, 1500, null][safeLevel];
    const progress = nextLevelStart === null
      ? 100
      : Math.min(100, Math.max(0, ((safeXp - levelStart) / (nextLevelStart - levelStart)) * 100));
    const xpRemaining = nextLevelStart === null ? 0 : Math.max(0, nextLevelStart - safeXp);
    const availableRewards = Array.isArray(rewards) ? rewards : [];

    return h("section", {
      className: "overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-xl sm:p-6",
      "aria-labelledby": "profile-xp-title",
    },
    h("div", { className: "flex items-start justify-between gap-4" },
      h("div", null,
        h("p", { className: "text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300" }, "Progresul tău"),
        h("h2", { id: "profile-xp-title", className: "mt-2 text-2xl font-black tracking-tight" }, rank_title || "FOMO Explorer"),
        h("p", { className: "mt-1 text-sm text-slate-300" }, `${safeXp.toLocaleString("ro-RO")} XP`)
      ),
      h("span", {
        className: "shrink-0 rounded-full border border-fuchsia-300/30 bg-fuchsia-400/15 px-3 py-1.5 text-sm font-extrabold text-fuchsia-100",
        "aria-label": `Nivelul ${safeLevel}`,
      }, `LVL ${safeLevel}`)
    ),
    h("div", { className: "mt-5" },
      h("div", {
        className: "h-3 overflow-hidden rounded-full bg-slate-800",
        role: "progressbar",
        "aria-label": "Progres XP către următorul nivel",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(Math.round(progress)),
      }, h("div", {
        className: "h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-400 transition-[width] duration-500",
        style: { width: `${progress}%` },
      })),
      h("p", { className: "mt-2 text-right text-xs font-medium text-slate-300" },
        nextLevelStart === null ? "Ai atins nivelul maxim." : `Îți mai trebuie ${xpRemaining} XP până la nivelul ${safeLevel + 1}.`
      )
    ),
    h("div", { className: "mt-6 border-t border-white/10 pt-5" },
      h("div", { className: "flex items-center justify-between gap-3" },
        h("h3", { className: "text-lg font-extrabold" }, "Recompense deblocate"),
        h("span", { className: "rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-slate-200" }, String(availableRewards.length))
      ),
      availableRewards.length === 0
        ? h("p", { className: "mt-3 text-sm leading-relaxed text-slate-300" }, "Nu ai deblocat încă recompense. Crește în nivel pentru vouchere noi.")
        : h("ul", { className: "mt-3 space-y-3" }, ...availableRewards.map((reward) =>
          h("li", {
            key: reward.id,
            className: "rounded-2xl border border-white/10 bg-white/[0.06] p-4",
          },
          h("div", { className: "flex items-start justify-between gap-3" },
            h("div", { className: "min-w-0" },
              h("p", { className: "truncate font-bold text-white" }, reward.title),
              h("p", { className: "mt-1 text-xs text-slate-300" }, `${reward.partner_name} · Nivel ${reward.required_level}`)
            ),
            h("span", {
              className: "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold " +
                (reward.is_redeemed ? "bg-emerald-400/15 text-emerald-200" : "bg-violet-400/15 text-violet-200"),
            }, reward.is_redeemed ? "Folosit" : "Deblocat")
          ),
          h("p", { className: "mt-2 text-sm leading-relaxed text-slate-300" }, reward.description),
          h("div", { className: "mt-3 flex flex-wrap items-center gap-3" },
            h("button", {
              className: "rounded-xl bg-gradient-to-r from-violet-600 to-pink-500 px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-fuchsia-950/30 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-pink-300",
              type: "button",
              "aria-expanded": String(visibleRewardId === reward.id),
              onClick: () => setVisibleRewardId(visibleRewardId === reward.id ? null : reward.id),
            }, visibleRewardId === reward.id ? "Ascunde codul" : "Vezi codul promoțional"),
            visibleRewardId === reward.id
              ? h("code", { className: "rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold tracking-wider text-pink-200" }, reward.promo_code)
              : null
          )
          )
        ))
    ));
  }

  function renderMessage(message, error = false) {
    root.render(h("p", {
      className: error
        ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        : "rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600",
      role: error ? "alert" : "status",
    }, message));
  }

  function getRoot() {
    if (!root) root = ReactDOM.createRoot(rootElement);
    return root;
  }

  async function mount(user) {
    const loadId = ++currentLoad;
    const activeRoot = getRoot();
    if (!user) {
      activeRoot.render(null);
      return;
    }
    if (!user.emailVerified) {
      renderMessage("Confirmă adresa de email pentru a vedea progresul și recompensele.");
      return;
    }
    renderMessage("Se încarcă progresul și recompensele...");

    try {
      const database = window.FomoFirebase && window.FomoFirebase.db;
      if (!database) throw new Error("Conexiunea la Firebase nu este disponibilă.");
      const [profileSnapshot, userRewardsSnapshot] = await Promise.all([
        database.ref(`users/${user.uid}`).once("value"),
        database.ref(`user_rewards/${user.uid}`).once("value"),
      ]);
      if (loadId !== currentLoad) return;
      if (!profileSnapshot.exists()) throw new Error("Profilul Firebase nu a fost găsit.");

      const profile = profileSnapshot.val();
      const userRewards = userRewardsSnapshot.val() || {};
      const unlockedRewards = (await Promise.all(Object.entries(userRewards)
        .filter(([, assignment]) => assignment)
        .map(async ([id, assignment]) => {
          const rewardSnapshot = await database.ref(`rewards/${id}`).once("value");
          if (!rewardSnapshot.exists()) return null;
          return {
            id,
            ...rewardSnapshot.val(),
            is_redeemed: assignment.is_redeemed === true,
          };
        })))
        .filter(Boolean)
        .sort((left, right) =>
          Number(left.required_level) - Number(right.required_level) ||
          String(left.title).localeCompare(String(right.title), "ro")
        );

      activeRoot.render(h(ProfileXPBar, {
        xp: profile.xp,
        level: profile.level,
        rank_title: profile.rank_title,
        rewards: unlockedRewards,
      }));
    } catch (error) {
      if (loadId !== currentLoad) return;
      console.error("Profile XP and rewards could not be loaded.", error);
      renderMessage(`Progresul și recompensele nu au putut fi încărcate: ${error.message}`, true);
    }
  }

  function clear() {
    currentLoad += 1;
    if (root) root.render(null);
  }

  function refresh() {
    const user = window.FomoFirebase && window.FomoFirebase.user();
    if (!user) {
      clear();
      return Promise.resolve();
    }
    return mount(user);
  }

  window.FomoProfileXPBar = { mount, refresh, clear, Component: ProfileXPBar };
})();
