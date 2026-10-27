/* ============================================================
   ⚙️  CONFIGURATION — only edit these values
   ============================================================ */
const CFG = {
  SUPABASE_URL: "https://hxbbhswgoglkuvwjxcng.supabase.co", // e.g. https://xxxx.supabase.co
  SUPABASE_KEY: "sb_publishable_Za1vsPJERCWqFuXrew6FXA_3dBSu9XV", // your anon/public key (safe to expose)
  PER_PAGE: 25,
  TABLE: "words",
  COL_EN: "english_word",
  COL_DE: "german_word",
};
/* ============================================================ */

// ── Supabase init ───────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

// ── App State ──────────────────────────────────────────────
const S = {
  all: [],
  filtered: [],
  page: 1,
  sortCol: CFG.COL_EN,
  sortAsc: true,
  query: "",
  user: null,
  isAdmin: false,
  authed: false,
  userEmail: "",
  authMode: "login", // 'login' or 'signup'
  quizDir: "en-de",
  qCorrect: 0,
  qWrong: 0,
  qTotal: 0,
  qWord: null,
  qFlipped: false,
  editId: null,
  deleteId: null,
  pendingCb: null,
};

// ── Boot ────────────────────────────────────────────────────
async function boot() {
  // Restore session if user was already signed in
  try {
    const {
      data: { session },
      error: sessionErr,
    } = await sb.auth.getSession();
    if (sessionErr) console.warn("Error restoring session:", sessionErr);
    if (session?.user) {
      S.user = session.user;
      S.authed = true;
      S.userEmail = session.user.email || "";
      await checkAdminStatus();
      await ensureUserProfile(session.user);
    }
  } catch (e) {
    console.error("Boot auth error:", e);
  }

  // Listen for auth changes (login, signup, logout)
  sb.auth.onAuthStateChange(async (event, session) => {
    S.user = session?.user || null;
    S.authed = !!session;
    S.userEmail = session?.user?.email || "";
    if (S.user) {
      await checkAdminStatus();
      await ensureUserProfile(S.user);
    } else {
      S.isAdmin = false;
    }
    updateGuestHint();
    renderAdmin();
    renderStats();
  });

  updateGuestHint();
  renderAdmin();

  try {
    // Paginated fetch — gets all rows regardless of Supabase row limit
    let all = [],
      from = 0;
    while (true) {
      const { data, error } = await sb
        .from(CFG.TABLE)
        .select("*")
        .order(CFG.COL_EN, { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      all = all.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    S.all = all;
    updateCounts();
    filter();
    renderTable();
    nextQuizWord();
  } catch (e) {
    console.error(e);
    toast("Could not connect to database.", "error");
    document.getElementById("tableBody").innerHTML = `
            <div class="empty-state">
                <div class="empty-ico">⚠️</div>
                <div class="empty-title">Could not connect</div>
                <div class="empty-sub">Check your Supabase credentials in the CFG block at the top of app.js.</div>
            </div>`;
  }
}

async function checkAdminStatus() {
  if (!S.user) {
    S.isAdmin = false;
    return;
  }
  try {
    const { data, error } = await sb.rpc("is_admin");
    if (error) {
      console.warn("is_admin rpc call error:", error);
      S.isAdmin = false;
    } else {
      S.isAdmin = !!data;
    }
  } catch (e) {
    console.warn("Failed to check admin status:", e);
    S.isAdmin = false;
  }
}

async function ensureUserProfile(user) {
  if (!user) return;
  try {
    const { data, error } = await sb
      .from("users")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data && user.user_metadata?.username) {
      await sb.from("users").insert([
        {
          user_id: user.id,
          username: user.user_metadata.username,
        },
      ]);
    }
  } catch (e) {
    console.error("ensureUserProfile error:", e);
  }
}

function updateGuestHint() {
  const el = document.getElementById("quizGuestHint");
  if (el) {
    el.style.display = S.user ? "none" : "block";
  }
}

function updateCounts() {
  const n = S.all.length.toLocaleString();
  document.getElementById("totalWords").textContent = n;
  document.getElementById("dictBadge").textContent = n;
}

// ── Filter + Sort ───────────────────────────────────────────
function filter() {
  let w = [...S.all];
  if (S.query) {
    const q = S.query.toLowerCase();
    w = w.filter(
      (r) =>
        r[CFG.COL_EN].toLowerCase().includes(q) ||
        r[CFG.COL_DE].toLowerCase().includes(q),
    );
  }
  w.sort((a, b) => {
    const va = (a[S.sortCol] || "").toLowerCase();
    const vb = (b[S.sortCol] || "").toLowerCase();
    return S.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  S.filtered = w;
  S.page = 1;
}

function hl(text, q) {
  if (!q) return esc(text);
  const e = esc(text);
  const re = esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return e.replace(new RegExp(`(${re})`, "gi"), '<mark class="hl">$1</mark>');
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Render Table ────────────────────────────────────────────
function renderTable() {
  const total = S.filtered.length;
  const pages = Math.max(1, Math.ceil(total / CFG.PER_PAGE));
  S.page = Math.min(S.page, pages);
  const start = (S.page - 1) * CFG.PER_PAGE;
  const slice = S.filtered.slice(start, start + CFG.PER_PAGE);

  const ri = document.getElementById("resultsInfo");
  if (S.query) {
    ri.innerHTML = `<strong>${total}</strong> result${total !== 1 ? "s" : ""} for "<em>${esc(S.query)}</em>"`;
  } else {
    ri.innerHTML = `Showing <strong>${start + 1}–${Math.min(start + CFG.PER_PAGE, total)}</strong> of <strong>${total.toLocaleString()}</strong>`;
  }

  if (!total) {
    document.getElementById("tableBody").innerHTML = `
            <div class="empty-state">
                <div class="empty-ico">🔍</div>
                <div class="empty-title">No results</div>
                <div class="empty-sub">Try a different search term.</div>
            </div>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  const rows = slice
    .map((r, i) => {
      const safeEn = esc(r[CFG.COL_EN]).replace(/'/g, "\\'");
      const safeDe = esc(r[CFG.COL_DE]).replace(/'/g, "\\'");
      return `
        <tr style="animation-delay:${i * 15}ms">
            <td>${start + i + 1}</td>
            <td><span class="w-en">${hl(r[CFG.COL_EN], S.query)}</span></td>
            <td><span class="w-de">${hl(r[CFG.COL_DE], S.query)}</span></td>
            <td>
                <div class="row-acts">
                    <button class="act-btn act-edit" title="Edit"
                        onclick="openEdit(${r.id},'${safeEn}','${safeDe}')">✎</button>
                    <button class="act-btn act-del" title="Delete"
                        onclick="openDelete(${r.id},'${safeEn}')">✕</button>
                </div>
            </td>
        </tr>`;
    })
    .join("");

  document.getElementById("tableBody").innerHTML = `
        <table class="word-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th><span class="chip chip-en">EN</span> English</th>
                    <th><span class="chip chip-de">DE</span> Deutsch</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;

  renderPagination(pages);
}

function renderPagination(total) {
  const el = document.getElementById("pagination");
  const cur = S.page;
  if (total <= 1) {
    el.innerHTML = "";
    return;
  }

  let pages = [];
  if (total <= 7) {
    pages = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    pages = [1, 2];
    if (cur > 4) pages.push("…");
    for (let i = Math.max(3, cur - 1); i <= Math.min(total - 2, cur + 1); i++)
      pages.push(i);
    if (cur < total - 3) pages.push("…");
    pages.push(total - 1, total);
    pages = [...new Set(pages)];
  }

  let h = `<button class="pg-btn" onclick="goPage(${cur - 1})" ${cur === 1 ? "disabled" : ""}>‹</button>`;
  pages.forEach((p) => {
    h +=
      p === "…"
        ? `<button class="pg-btn" disabled>…</button>`
        : `<button class="pg-btn ${p === cur ? "cur" : ""}" onclick="goPage(${p})">${p}</button>`;
  });
  h += `<button class="pg-btn" onclick="goPage(${cur + 1})" ${cur === total ? "disabled" : ""}>›</button>`;
  el.innerHTML = h;
}

function goPage(p) {
  S.page = p;
  renderTable();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Search ──────────────────────────────────────────────────
const $si = document.getElementById("searchInput");
const $sc = document.getElementById("searchClear");

$si.addEventListener("input", (e) => {
  S.query = e.target.value.trim();
  $sc.classList.toggle("on", S.query.length > 0);
  filter();
  renderTable();
});

$sc.addEventListener("click", () => {
  $si.value = "";
  S.query = "";
  $sc.classList.remove("on");
  filter();
  renderTable();
  $si.focus();
});

// ── Sort ────────────────────────────────────────────────────
document.getElementById("sortEn").addEventListener("click", () => {
  if (S.sortCol === CFG.COL_EN) S.sortAsc = !S.sortAsc;
  else {
    S.sortCol = CFG.COL_EN;
    S.sortAsc = true;
  }
  syncSortBtns();
  filter();
  renderTable();
});
document.getElementById("sortDe").addEventListener("click", () => {
  if (S.sortCol === CFG.COL_DE) S.sortAsc = !S.sortAsc;
  else {
    S.sortCol = CFG.COL_DE;
    S.sortAsc = true;
  }
  syncSortBtns();
  filter();
  renderTable();
});
function syncSortBtns() {
  const en = document.getElementById("sortEn");
  const de = document.getElementById("sortDe");
  en.classList.toggle("on", S.sortCol === CFG.COL_EN);
  de.classList.toggle("on", S.sortCol === CFG.COL_DE);
  en.classList.toggle("desc", S.sortCol === CFG.COL_EN && !S.sortAsc);
  de.classList.toggle("desc", S.sortCol === CFG.COL_DE && !S.sortAsc);
}

// ── Navigation ──────────────────────────────────────────────
const PANEL_META = {
  dictionary: {
    eyebrow: "Dictionary",
    heading: "All Words",
    cls: "active-dict",
    search: true,
  },
  quiz: {
    eyebrow: "Quiz Mode",
    heading: "Flashcard Practice",
    cls: "active-quiz",
    search: false,
  },
  stats: {
    eyebrow: "Progress",
    heading: "My Stats",
    cls: "active-stats",
    search: false,
  },
  admin: {
    eyebrow: "Admin",
    heading: "Add & Manage Words",
    cls: "active-admin",
    search: false,
  },
};

function switchPanel(id) {
  if (!PANEL_META[id]) return;

  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.remove("active-dict", "active-quiz", "active-stats", "active-admin");
  });
  const navItem = document.querySelector(`.nav-item[data-panel="${id}"]`);
  if (navItem) navItem.classList.add(PANEL_META[id].cls);

  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  const targetPanel = document.getElementById(`panel-${id}`);
  if (targetPanel) targetPanel.classList.add("active");

  const m = PANEL_META[id];
  document.getElementById("topEyebrow").textContent = m.eyebrow;
  document.getElementById("topHeading").textContent = m.heading;
  document.getElementById("searchWrap").style.visibility = m.search
    ? ""
    : "hidden";

  if (id === "quiz") nextQuizWord();
  if (id === "admin") renderAdmin();
  if (id === "stats") renderStats();
}

document.querySelectorAll(".nav-item[data-panel]").forEach((item) => {
  item.addEventListener("click", () => {
    switchPanel(item.dataset.panel);
  });
});

// ── Quiz ────────────────────────────────────────────────────
document.getElementById("dirEN").addEventListener("click", () => {
  S.quizDir = "en-de";
  document.getElementById("dirEN").classList.add("on");
  document.getElementById("dirDE").classList.remove("on");
  resetScore();
  nextQuizWord();
});
document.getElementById("dirDE").addEventListener("click", () => {
  S.quizDir = "de-en";
  document.getElementById("dirDE").classList.add("on");
  document.getElementById("dirEN").classList.remove("on");
  resetScore();
  nextQuizWord();
});

function resetScore() {
  S.qCorrect = 0;
  S.qWrong = 0;
  S.qTotal = 0;
  document.getElementById("scCorrect").textContent = "0";
  document.getElementById("scWrong").textContent = "0";
  document.getElementById("qFill").style.width = "0%";
}

function nextQuizWord() {
  if (!S.all.length) return;
  S.qWord = S.all[Math.floor(Math.random() * S.all.length)];
  S.qFlipped = false;

  const front =
    S.quizDir === "en-de" ? S.qWord[CFG.COL_EN] : S.qWord[CFG.COL_DE];
  const back =
    S.quizDir === "en-de" ? S.qWord[CFG.COL_DE] : S.qWord[CFG.COL_EN];
  const fl = S.quizDir === "en-de" ? "ENGLISH" : "DEUTSCH";
  const bl = S.quizDir === "en-de" ? "DEUTSCH" : "ENGLISH";

  document.getElementById("qFrontLbl").textContent = fl;
  document.getElementById("qFrontWord").textContent = front;
  document.getElementById("qBackLbl").textContent = bl;
  document.getElementById("qBackWord").textContent = back;
  document.getElementById("qCard").classList.remove("flipped");
  document.getElementById("qRevealBtn").style.display = "";
  document.getElementById("answerActs").classList.remove("on");
}

function flipCard() {
  if (S.qFlipped) return;
  S.qFlipped = true;
  document.getElementById("qCard").classList.add("flipped");
  document.getElementById("qRevealBtn").style.display = "none";
  document.getElementById("answerActs").classList.add("on");
}

document.getElementById("qCard").addEventListener("click", flipCard);

function grade(correct) {
  if (correct) {
    S.qCorrect++;
    document.getElementById("scCorrect").textContent = S.qCorrect;
  } else {
    S.qWrong++;
    document.getElementById("scWrong").textContent = S.qWrong;
  }
  S.qTotal++;
  const acc = S.qTotal ? (S.qCorrect / S.qTotal) * 100 : 0;
  document.getElementById("qFill").style.width = `${acc}%`;
  document.getElementById("answerActs").classList.remove("on");

  // Save quiz attempt for signed-in users asynchronously without blocking card transition
  if (S.user && S.qWord) {
    const attempt = {
      user_id: S.user.id,
      word_id: S.qWord.id,
      correct: !!correct,
    };
    sb.from("quiz_history")
      .insert([attempt])
      .then(({ error }) => {
        if (error) {
          console.error("Failed to save quiz attempt:", error);
          toast("Failed to save quiz attempt.", "error");
        }
      })
      .catch((err) => {
        console.error("Quiz history save error:", err);
        toast("Failed to save quiz attempt.", "error");
      });
  }

  setTimeout(() => {
    document.getElementById("qCard").classList.remove("flipped");
    setTimeout(nextQuizWord, 90);
  }, 280);
}

// ── My Stats Panel ──────────────────────────────────────────
async function renderStats() {
  const el = document.getElementById("statsContent");
  if (!el) return;

  if (!S.user) {
    el.innerHTML = `
      <div class="stats-wrap" style="max-width:420px; margin: 0 auto;">
        <div class="form-card">
          <div class="lock-screen">
            <div class="lock-ico">🔐</div>
            <div class="lock-title">Sign In Required</div>
            <div class="lock-sub">Sign in to see your stats.</div>
            <button class="btn-unlock" onclick="openLoginModal(() => { switchPanel('stats'); })">
              🔓 Sign In
            </button>
          </div>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-lbl">Loading your quiz statistics…</div>
    </div>`;

  try {
    let attempts = [];
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from("quiz_history")
        .select("word_id, correct")
        .eq("user_id", S.user.id)
        .range(from, from + 999);
      if (error) throw error;
      attempts = attempts.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }

    const total = attempts.length;
    const correctCount = attempts.filter((a) => a.correct).length;
    const accuracy = total > 0 ? ((correctCount * 100) / total).toFixed(2) + "%" : "—";

    let weakWordsHtml = "";
    if (total === 0) {
      weakWordsHtml = `
        <div class="table-card" style="margin-top: 24px;">
          <div class="empty-state">
            <div class="empty-ico">📊</div>
            <div class="empty-title">No quiz attempts yet</div>
            <div class="empty-sub">Take a quiz in Quiz Mode to start recording your practice history!</div>
          </div>
        </div>`;
    } else {
      const wrongAttempts = attempts.filter((a) => !a.correct);
      if (wrongAttempts.length === 0) {
        weakWordsHtml = `
          <div class="table-card" style="margin-top: 24px;">
            <div class="empty-state">
              <div class="empty-ico">🎉</div>
              <div class="empty-title">No wrong answers yet — nice work.</div>
              <div class="empty-sub">You have answered all quiz questions correctly!</div>
            </div>
          </div>`;
      } else {
        // Group wrong answers by word_id
        const missCounts = {};
        for (const a of wrongAttempts) {
          missCounts[a.word_id] = (missCounts[a.word_id] || 0) + 1;
        }

        const weakList = Object.keys(missCounts).map((wId) => {
          const numId = Number(wId);
          const w = S.all.find((item) => item.id === numId);
          return {
            id: numId,
            count: missCounts[wId],
            en: w ? w[CFG.COL_EN] : `Word #${numId}`,
            de: w ? w[CFG.COL_DE] : "—",
          };
        });

        // Sort: most wrong answers descending, then English A-Z
        weakList.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.en.localeCompare(b.en);
        });

        const top5 = weakList.slice(0, 5);

        const rows = top5
          .map(
            (item, idx) => `
            <tr>
              <td style="text-align: center; color: var(--text-3); font-weight: 500;">${idx + 1}</td>
              <td><span class="w-en">${esc(item.en)}</span></td>
              <td><span class="w-de">${esc(item.de)}</span></td>
              <td style="text-align: right; padding-right: 20px;">
                <span class="score-pill s-wrong" style="display:inline-block; padding: 3px 10px; font-size: 11px;">
                  wrong ${item.count} time${item.count === 1 ? "" : "s"}
                </span>
              </td>
            </tr>
          `,
          )
          .join("");

        weakWordsHtml = `
          <div class="table-card" style="margin-top: 24px;">
            <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--surface-2);">
              <div style="font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 600;">Top 5 Weak Words</div>
              <div style="font-size: 11.5px; color: var(--text-3); margin-top: 2px;">The words you've missed most often during quiz practice</div>
            </div>
            <table class="word-table">
              <thead>
                <tr>
                  <th style="width: 48px; text-align: center;">#</th>
                  <th><span class="chip chip-en">EN</span> English</th>
                  <th><span class="chip chip-de">DE</span> Deutsch</th>
                  <th style="text-align: right; padding-right: 20px;">Missed</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      }
    }

    el.innerHTML = `
      <div class="stats-wrap">
        <div class="stats-grid">
          <div class="stat-tile">
            <div class="stat-tile-num">${total.toLocaleString()}</div>
            <div class="stat-tile-lbl">Questions Attempted</div>
          </div>
          <div class="stat-tile">
            <div class="stat-tile-num" style="color: var(--green);">${correctCount.toLocaleString()}</div>
            <div class="stat-tile-lbl">Correct Answers</div>
          </div>
          <div class="stat-tile">
            <div class="stat-tile-num" style="color: var(--purple);">${accuracy}</div>
            <div class="stat-tile-lbl">Accuracy</div>
          </div>
        </div>
        ${weakWordsHtml}
      </div>`;
  } catch (err) {
    console.error("Error loading stats:", err);
    toast("Failed to load stats.", "error");
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-ico">⚠️</div>
        <div class="empty-title">Could not load stats</div>
        <div class="empty-sub">Check your connection and try again.</div>
      </div>`;
  }
}

// ── Admin Panel ─────────────────────────────────────────────
function renderAdmin() {
  const el = document.getElementById("adminContent");
  if (!el) return;

  if (!S.user) {
    el.innerHTML = `
            <div class="form-card" style="max-width:420px; margin: 0 auto;">
                <div class="lock-screen">
                    <div class="lock-ico">🔐</div>
                    <div class="lock-title">Admin Sign In Required</div>
                    <div class="lock-sub">Sign in with your Supabase admin account to add, edit, or remove words.</div>
                    <button class="btn-unlock" onclick="openLoginModal()">
                        🔓 Sign In
                    </button>
                </div>
            </div>`;
    return;
  }

  if (!S.isAdmin) {
    el.innerHTML = `
            <div class="form-card" style="max-width:440px; margin: 0 auto;">
                <div class="lock-screen">
                    <div class="lock-ico">🚫</div>
                    <div class="lock-title">Access Restricted</div>
                    <div class="lock-sub">This account doesn't have admin access.</div>
                    <div class="admin-user-bar" style="margin-bottom: 20px; width: 100%;">
                        <span>Signed in as</span>
                        <span class="admin-user-email">${esc(S.userEmail)}</span>
                    </div>
                    <button class="m-btn m-cancel" style="width: 100%;" onclick="logout()">Sign Out</button>
                </div>
            </div>`;
    return;
  }

  // Admin signed in
  el.innerHTML = `
            <div class="admin-wrap">
                <div class="admin-user-bar">
                    <span>✓ Signed in as</span>
                    <span class="admin-user-email">${esc(S.userEmail)}</span>
                    <button class="btn-lock" style="margin:0;padding:5px 12px;font-size:12px;" onclick="logout()">Sign Out</button>
                </div>
                <div class="form-card">
                    <div class="form-card-hd">
                        <div class="form-card-icon">＋</div>
                        <div>
                            <div class="form-card-title">Add New Word</div>
                            <div class="form-card-sub">Add an English–German translation pair</div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-lbl"><span class="chip chip-en">EN</span> English</label>
                            <input class="form-input" type="text" id="addEn" placeholder="e.g. apple" autocomplete="off">
                        </div>
                        <div class="form-group">
                            <label class="form-lbl"><span class="chip chip-de">DE</span> Deutsch</label>
                            <input class="form-input" type="text" id="addDe" placeholder="e.g. der Apfel" autocomplete="off">
                        </div>
                    </div>
                    <button class="btn-submit" onclick="submitAdd()">＋ Add Word</button>
                </div>
            </div>`;
  setTimeout(() => document.getElementById("addEn")?.focus(), 80);
}

// ── Auth Modal & Management ─────────────────────────────────
function setAuthMode(mode) {
  S.authMode = mode;
  const isSignup = mode === "signup";
  document.getElementById("authTabLogin").classList.toggle("on", !isSignup);
  document.getElementById("authTabSignup").classList.toggle("on", isSignup);
  document.getElementById("authModalTitle").textContent = isSignup
    ? "Create Account"
    : "Sign In";
  document.getElementById("authModalSub").textContent = isSignup
    ? "Create an account to track your quiz progress and stats."
    : "Sign in to save your quiz progress or manage words.";
  document.getElementById("signupUsernameGroup").style.display = isSignup
    ? "block"
    : "none";
  document.getElementById("loginBtn").textContent = isSignup
    ? "Create Account"
    : "Sign In";
  const errEl = document.getElementById("loginErr");
  errEl.classList.remove("on", "info");
}

function openLoginModal(cb = null) {
  S.pendingCb = cb;
  setAuthMode("login");
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  const un = document.getElementById("signupUsername");
  if (un) un.value = "";
  const errEl = document.getElementById("loginErr");
  errEl.classList.remove("on", "info");
  const btn = document.getElementById("loginBtn");
  btn.textContent = "Sign In";
  btn.disabled = false;
  document.getElementById("loginModal").classList.add("open");
  setTimeout(() => document.getElementById("loginEmail").focus(), 80);
}

function closeLoginModal() {
  document.getElementById("loginModal").classList.remove("open");
  S.pendingCb = null;
}

async function submitAuth() {
  if (S.authMode === "signup") {
    await submitSignup();
  } else {
    await submitLogin();
  }
}

async function submitLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showLoginErr("Enter your email and password.");
    return;
  }

  const btn = document.getElementById("loginBtn");
  btn.textContent = "Signing in…";
  btn.disabled = true;
  document.getElementById("loginErr").classList.remove("on", "info");

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      showLoginErr("Invalid email or password. Try again.");
      btn.textContent = "Sign In";
      btn.disabled = false;
      return;
    }

    S.user = data.user;
    S.authed = true;
    S.userEmail = data.user.email || "";
    await checkAdminStatus();
    await ensureUserProfile(data.user);

    const cb = S.pendingCb;
    S.pendingCb = null;
    closeLoginModal();
    updateGuestHint();
    renderAdmin();
    renderStats();
    toast("Signed in successfully!", "success");
    if (cb) cb();
  } catch (e) {
    console.error(e);
    showLoginErr("An error occurred while signing in.");
    toast("Sign in failed.", "error");
    btn.textContent = "Sign In";
    btn.disabled = false;
  }
}

async function submitSignup() {
  const username = document.getElementById("signupUsername").value.trim();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (username.length < 3 || username.length > 30) {
    showLoginErr("Username must be between 3 and 30 characters.");
    return;
  }

  if (!email || !password) {
    showLoginErr("Fill in all fields.");
    return;
  }

  const btn = document.getElementById("loginBtn");
  btn.textContent = "Creating account…";
  btn.disabled = true;
  document.getElementById("loginErr").classList.remove("on", "info");

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) {
      showLoginErr(error.message || "Failed to create account.");
      btn.textContent = "Create Account";
      btn.disabled = false;
      return;
    }

    // Check if email confirmation is on
    if (data.user && !data.session) {
      btn.textContent = "Create Account";
      btn.disabled = false;
      showLoginErr("Check your email to confirm.", true);
      toast("Check your email to confirm.", "info");
      return;
    }

    // If active session returned, insert profile row in users
    if (data.session && data.user) {
      const { error: userErr } = await sb
        .from("users")
        .insert([{ user_id: data.user.id, username }]);

      if (userErr) {
        console.error("users table insert error:", userErr);
        if (
          userErr.code === "23505" ||
          (userErr.message && userErr.message.toLowerCase().includes("unique"))
        ) {
          showLoginErr("That username is taken. Please choose another.");
        } else {
          showLoginErr(userErr.message || "Could not save user profile.");
        }
        btn.textContent = "Create Account";
        btn.disabled = false;
        return;
      }
    }

    S.user = data.user;
    S.authed = true;
    S.userEmail = data.user.email || "";
    await checkAdminStatus();

    const cb = S.pendingCb;
    S.pendingCb = null;
    closeLoginModal();
    updateGuestHint();
    renderAdmin();
    renderStats();
    toast("Account created successfully!", "success");
    if (cb) cb();
  } catch (e) {
    console.error(e);
    showLoginErr("Failed to create account. Please try again.");
    toast("Sign up failed.", "error");
    btn.textContent = "Create Account";
    btn.disabled = false;
  }
}

function showLoginErr(msg, isInfo = false) {
  const el = document.getElementById("loginErr");
  el.textContent = msg;
  el.classList.toggle("info", isInfo);
  el.classList.add("on");
}

async function logout() {
  try {
    await sb.auth.signOut();
  } catch (e) {
    console.error("Sign out error:", e);
    toast("Sign out failed.", "error");
  }
  S.user = null;
  S.authed = false;
  S.isAdmin = false;
  S.userEmail = "";
  updateGuestHint();
  renderAdmin();
  renderStats();
  toast("Signed out.", "info");
}

document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAuth();
});

const $su = document.getElementById("signupUsername");
if ($su) {
  $su.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAuth();
  });
}

// ── Add Word ────────────────────────────────────────────────
async function submitAdd() {
  if (!S.user || !S.isAdmin) {
    toast("This account doesn't have admin access.", "error");
    return;
  }

  const en = document.getElementById("addEn").value.trim();
  const de = document.getElementById("addDe").value.trim();
  if (!en || !de) {
    toast("Fill in both fields.", "error");
    return;
  }
  try {
    const { data, error } = await sb
      .from(CFG.TABLE)
      .insert([{ [CFG.COL_EN]: en, [CFG.COL_DE]: de }])
      .select();
    if (error) throw error;
    S.all.push(data[0]);
    S.all.sort((a, b) => a[CFG.COL_EN].localeCompare(b[CFG.COL_EN]));
    updateCounts();
    filter();
    renderTable();
    document.getElementById("addEn").value = "";
    document.getElementById("addDe").value = "";
    document.getElementById("addEn").focus();
    toast(`"${en}" added!`, "success");
  } catch (e) {
    console.error(e);
    toast("Failed to add. Check permissions or connection.", "error");
  }
}

// ── Edit ────────────────────────────────────────────────────
function openEdit(id, en, de) {
  if (!S.user) {
    openLoginModal(() => {
      if (S.isAdmin) openEdit(id, en, de);
      else toast("This account doesn't have admin access.", "error");
    });
    return;
  }
  if (!S.isAdmin) {
    toast("This account doesn't have admin access.", "error");
    return;
  }
  S.editId = id;
  document.getElementById("editEn").value = en;
  document.getElementById("editDe").value = de;
  document.getElementById("editModal").classList.add("open");
  setTimeout(() => document.getElementById("editEn").focus(), 80);
}

document
  .getElementById("editConfirmBtn")
  .addEventListener("click", async () => {
    if (!S.user || !S.isAdmin) {
      toast("This account doesn't have admin access.", "error");
      return;
    }
    const en = document.getElementById("editEn").value.trim();
    const de = document.getElementById("editDe").value.trim();
    if (!en || !de) {
      toast("Both fields required.", "error");
      return;
    }
    try {
      const { error } = await sb
        .from(CFG.TABLE)
        .update({ [CFG.COL_EN]: en, [CFG.COL_DE]: de })
        .eq("id", S.editId);
      if (error) throw error;
      const i = S.all.findIndex((w) => w.id === S.editId);
      if (i !== -1) {
        S.all[i][CFG.COL_EN] = en;
        S.all[i][CFG.COL_DE] = de;
      }
      filter();
      renderTable();
      closeEditModal();
      toast("Word updated!", "success");
    } catch (e) {
      console.error(e);
      toast("Update failed.", "error");
    }
  });

function closeEditModal() {
  document.getElementById("editModal").classList.remove("open");
  S.editId = null;
}

// ── Delete ──────────────────────────────────────────────────
function openDelete(id, en) {
  if (!S.user) {
    openLoginModal(() => {
      if (S.isAdmin) openDelete(id, en);
      else toast("This account doesn't have admin access.", "error");
    });
    return;
  }
  if (!S.isAdmin) {
    toast("This account doesn't have admin access.", "error");
    return;
  }
  S.deleteId = id;
  document.getElementById("delSub").textContent =
    `Delete "${en}"? This cannot be undone.`;
  document.getElementById("delModal").classList.add("open");
}

document.getElementById("delConfirmBtn").addEventListener("click", async () => {
  if (!S.user || !S.isAdmin) {
    toast("This account doesn't have admin access.", "error");
    return;
  }
  try {
    const { error } = await sb.from(CFG.TABLE).delete().eq("id", S.deleteId);
    if (error) throw error;
    S.all = S.all.filter((w) => w.id !== S.deleteId);
    updateCounts();
    filter();
    renderTable();
    closeDelModal();
    toast("Word deleted.", "info");
  } catch (e) {
    console.error(e);
    toast("Delete failed.", "error");
  }
});

function closeDelModal() {
  document.getElementById("delModal").classList.remove("open");
  S.deleteId = null;
}

// ── Close modals on backdrop click ──────────────────────────
["loginModal", "delModal", "editModal"].forEach((id) => {
  document.getElementById(id).addEventListener("click", (e) => {
    if (e.target !== e.currentTarget) return;
    if (id === "loginModal") closeLoginModal();
    if (id === "delModal") closeDelModal();
    if (id === "editModal") closeEditModal();
  });
});

// ── Keyboard shortcuts ───────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLoginModal();
    closeDelModal();
    closeEditModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    document.getElementById("searchInput").focus();
  }
});

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-ico">${icons[type] || "ℹ"}</span>${msg}`;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 240);
  }, 3000);
}

// ── Start ─────────────────────────────────────────────────
boot();
