/* ============================================================
   ⚙️  CONFIGURATION — only edit these values
   ============================================================ */
const CFG = {
  SUPABASE_URL: "https://bjeftnxviovtmjkukshn.supabase.co", // e.g. https://xxxx.supabase.co
  SUPABASE_KEY: "sb_publishable_reA5_CCY_PfCmxUThMeJOg_hkLZDYKA", // your anon/public key (safe to expose)
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
  authed: false,
  userEmail: "",
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
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) {
    S.authed = true;
    S.userEmail = session.user.email;
  }

  // Listen for auth changes (login / logout)
  sb.auth.onAuthStateChange((event, session) => {
    S.authed = !!session;
    S.userEmail = session?.user?.email || "";
    if (event === "SIGNED_OUT") renderAdmin();
  });

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
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    S.all = all;
    updateCounts();
    filter();
    renderTable();
    nextQuizWord();
  } catch (e) {
    console.error(e);
    document.getElementById("tableBody").innerHTML = `
            <div class="empty-state">
                <div class="empty-ico">⚠️</div>
                <div class="empty-title">Could not connect</div>
                <div class="empty-sub">Check your Supabase credentials in the CFG block at the top of app.js.</div>
            </div>`;
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
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  admin: {
    eyebrow: "Admin",
    heading: "Add & Manage Words",
    cls: "active-admin",
    search: false,
  },
};

document.querySelectorAll(".nav-item[data-panel]").forEach((item) => {
  item.addEventListener("click", () => {
    const id = item.dataset.panel;
    document.querySelectorAll(".nav-item").forEach((n) => {
      n.classList.remove("active-dict", "active-quiz", "active-admin");
    });
    item.classList.add(PANEL_META[id].cls);

    document
      .querySelectorAll(".panel")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(`panel-${id}`).classList.add("active");

    const m = PANEL_META[id];
    document.getElementById("topEyebrow").textContent = m.eyebrow;
    document.getElementById("topHeading").textContent = m.heading;
    document.getElementById("searchWrap").style.visibility = m.search
      ? ""
      : "hidden";

    if (id === "quiz") nextQuizWord();
    if (id === "admin") renderAdmin();
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
  setTimeout(() => {
    document.getElementById("qCard").classList.remove("flipped");
    setTimeout(nextQuizWord, 90);
  }, 280);
}

// ── Admin Panel ─────────────────────────────────────────────
function renderAdmin() {
  const el = document.getElementById("adminContent");
  if (!S.authed) {
    el.innerHTML = `
            <div class="form-card" style="max-width:420px;">
                <div class="lock-screen">
                    <div class="lock-ico">🔐</div>
                    <div class="lock-title">Admin Sign In Required</div>
                    <div class="lock-sub">Sign in with your Supabase account to add, edit, or remove words.</div>
                    <button class="btn-unlock" onclick="openLoginModal()">
                        🔓 Sign In
                    </button>
                </div>
            </div>`;
  } else {
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
}

// ── Auth ────────────────────────────────────────────────────
function requireAuth(cb) {
  if (S.authed) {
    cb();
    return;
  }
  openLoginModal(cb);
}

function openLoginModal(cb = null) {
  S.pendingCb = cb;
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginErr").classList.remove("on");
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
  document.getElementById("loginErr").classList.remove("on");

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    showLoginErr("Invalid email or password. Try again.");
    btn.textContent = "Sign In";
    btn.disabled = false;
    return;
  }

  // Auth state change listener handles S.authed / S.userEmail
  const cb = S.pendingCb;
  S.pendingCb = null;
  closeLoginModal();
  renderAdmin();
  toast("Signed in successfully!", "success");
  if (cb) cb();
}

function showLoginErr(msg) {
  const el = document.getElementById("loginErr");
  el.textContent = msg;
  el.classList.add("on");
}

async function logout() {
  await sb.auth.signOut();
  S.authed = false;
  S.userEmail = "";
  renderAdmin();
  toast("Signed out.", "info");
}

document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitLogin();
});

// ── Add Word ────────────────────────────────────────────────
async function submitAdd() {
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
    toast("Failed to add. Check connection.", "error");
  }
}

// ── Edit ────────────────────────────────────────────────────
function openEdit(id, en, de) {
  requireAuth(() => {
    S.editId = id;
    document.getElementById("editEn").value = en;
    document.getElementById("editDe").value = de;
    document.getElementById("editModal").classList.add("open");
    setTimeout(() => document.getElementById("editEn").focus(), 80);
  });
}

document
  .getElementById("editConfirmBtn")
  .addEventListener("click", async () => {
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
  requireAuth(() => {
    S.deleteId = id;
    document.getElementById("delSub").textContent =
      `Delete "${en}"? This cannot be undone.`;
    document.getElementById("delModal").classList.add("open");
  });
}

document.getElementById("delConfirmBtn").addEventListener("click", async () => {
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
  el.innerHTML = `<span class="toast-ico">${icons[type]}</span>${msg}`;
  document.getElementById("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 240);
  }, 3000);
}

// ── Start ─────────────────────────────────────────────────
boot();
