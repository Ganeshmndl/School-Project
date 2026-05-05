const path = require("path");
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, "../frontend");
const DB_PATH = path.join(__dirname, "admissions.db");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Block direct access to any .db file
app.use((req, res, next) => {
  if (req.path.toLowerCase().endsWith(".db")) {
    return res.status(403).send("Forbidden");
  }
  next();
});

// Session security
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 30 * 60 * 1000,
    },
  }),
);

// If admin is logged in and visits the public fees page, redirect to admin view
app.get("/fees.html", (req, res, next) => {
  if (req.session && req.session.admin === true) {
    return res.redirect("/fees");
  }
  next();
});

// Serve the existing static site
app.use(express.static(STATIC_DIR));
app.use("/photos", express.static(path.join(STATIC_DIR, "photos")));
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}
app.use("/uploads", express.static(UPLOAD_DIR));

// Handle Chrome DevTools probe to reduce 404 noise
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.json({});
});
// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      class_applied TEXT NOT NULL,
      dob TEXT NOT NULL,
      parent_first_name TEXT NOT NULL,
      parent_last_name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qualification TEXT,
      subject TEXT,
      photo TEXT
    )`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      address TEXT NOT NULL,
      class TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      receipt TEXT,
      created_at TEXT NOT NULL
    )`,
  );
  db.get("SELECT COUNT(*) AS c FROM teachers", [], (err, row) => {
    if (err) return;
    if (!row || !row.c) {
      const seeds = [
        {
          name: "Ms. Anjali Sharma",
          qualification: "M.A., B.Ed",
          subject: "Subject: English",
          photo: "photos/image1.jpg",
        },
        {
          name: "Mr. Ravi Kumar",
          qualification: "M.Sc., B.Ed",
          subject: "Subject: Mathematics",
          photo: "photos/image2.jpg",
        },
        {
          name: "Ms. Neha Verma",
          qualification: "B.Sc., D.El.Ed",
          subject: "Subject: Science",
          photo: "photos/image4.jpg",
        },
        {
          name: "Mr. Suresh Patel",
          qualification: "M.A., B.Ed",
          subject: "Subject: Social Studies",
          photo: "photos/image3.JPG",
        },
      ];
      const stmt = db.prepare(
        `INSERT INTO teachers (name, qualification, subject, photo) VALUES (?, ?, ?, ?)`,
      );
      seeds.forEach((t) =>
        stmt.run(t.name, t.qualification, t.subject, t.photo),
      );
      stmt.finalize();
    }
  });
});

// ===== Multer config for teacher profile photos =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "") || "";
    cb(null, "teacher-" + unique + ext);
  },
});
const fileFilter = (req, file, cb) => {
  if (
    file &&
    typeof file.mimetype === "string" &&
    file.mimetype.startsWith("image/")
  ) {
    cb(null, true);
  } else {
    const err = new Error("INVALID_FILE_TYPE");
    err.code = "INVALID_FILE_TYPE";
    cb(err);
  }
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// Handle Multer errors centrally for routes that use upload.single("photo")
function handleUploadError(err, req, res, next) {
  if (err) {
    const code =
      err.code === "LIMIT_FILE_SIZE"
        ? "LIMIT_FILE_SIZE"
        : err.message === "INVALID_FILE_TYPE"
          ? "INVALID_FILE_TYPE"
          : "UPLOAD";
    return res.redirect(`/teachers?upload_error=${code}`);
  }
  next();
}

function handleReceiptError(err, req, res, next) {
  if (err) {
    const code =
      err.code === "LIMIT_FILE_SIZE"
        ? "LIMIT_FILE_SIZE"
        : err.message === "INVALID_FILE_TYPE"
          ? "INVALID_FILE_TYPE"
          : "UPLOAD";
    return res.redirect(`/fees.html?fees_error=${code}`);
  }
  next();
}

// API endpoint to accept form submissions
app.post("/api/admissions", (req, res) => {
  const {
    first_name,
    last_name,
    class_applied,
    dob,
    parent_first_name,
    parent_last_name,
    address,
    city,
    state,
    phone,
    email,
  } = req.body || {};

  // Basic validation
  const missing = [];
  if (!first_name) missing.push("first_name");
  if (!last_name) missing.push("last_name");
  if (!class_applied) missing.push("class_applied");
  if (!dob) missing.push("dob");
  if (!parent_first_name) missing.push("parent_first_name");
  if (!parent_last_name) missing.push("parent_last_name");
  if (!phone) missing.push("phone");
  if (!email) missing.push("email");

  if (missing.length) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing fields", fields: missing });
  }

  const created_at = new Date().toISOString();

  const stmt = db.prepare(
    `INSERT INTO admissions 
     (first_name, last_name, class_applied, dob, parent_first_name, parent_last_name, address, city, state, phone, email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  stmt.run(
    first_name,
    last_name,
    class_applied,
    dob,
    parent_first_name,
    parent_last_name,
    address || null,
    city || null,
    state || null,
    phone,
    email,
    created_at,
    function (err) {
      if (err) {
        console.error("DB insert error:", err);
        return res.status(500).json({ ok: false, error: "Database error" });
      }
      return res.json({ ok: true, id: this.lastID });
    },
  );
});

// Simple admin listing endpoint (optional)
app.get("/api/admissions", (req, res) => {
  db.all(
    "SELECT * FROM admissions ORDER BY created_at DESC",
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ ok: false, error: "Database error" });
      }
      res.json({ ok: true, data: rows });
    },
  );
});

// ===== Admin Auth and Dashboard (NEW) =====
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.admin === true) {
    return next();
  }
  return res.redirect("/admin-login");
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increased limit for debugging
  standardHeaders: true,
  legacyHeaders: false,
});

// Allow disabling rate limit via environment for debugging
const maybeLoginLimiter = (req, res, next) => {
  if (
    process.env.DISABLE_RATE_LIMIT === "1" ||
    process.env.DISABLE_RATE_LIMIT === "true"
  ) {
    return next();
  }
  return loginLimiter(req, res, next);
};
// Login page
app.get("/admin-login", (req, res) => {
  return res.sendFile(path.join(STATIC_DIR, "admin-login.html"));
});

// Login handler
app.post(
  "/admin-login",
  maybeLoginLimiter,
  [body("username").trim().notEmpty(), body("password").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.redirect("/admin-login?error=1");
    }
    try {
      const { username, password } = req.body;
      const envUser = (process.env.ADMIN_USER || "").trim();
      const envHash = (process.env.ADMIN_PASSWORD_HASH || "").trim();

      if (!envUser || !envHash) {
        return res.redirect("/admin-login?error=1");
      }

      const recvName = typeof username === "string" ? username.trim() : "";
      const envName = envUser.trim();
      const nameMatches = recvName === envName;
      if (!nameMatches) {
        return res.redirect("/admin-login?error=1");
      }

      const ok = await bcrypt.compare(password, envHash);
      if (!ok) {
        return res.redirect("/admin-login?error=1");
      }

      req.session.admin = true;
      return res.redirect("/admin/dashboard");
    } catch (e) {
      return res.redirect("/admin-login?error=1");
    }
  },
);

// Dashboard (protected)
app.get("/admin/dashboard", requireAdmin, async (req, res) => {
  const all = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.all(sql, p, (err, rows) => (err ? reject(err) : resolve(rows))),
    );
  const get = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.get(sql, p, (err, row) => (err ? reject(err) : resolve(row))),
    );

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [rows, totalRow, todayRow, classRows] = await Promise.all([
      all("SELECT * FROM admissions ORDER BY created_at DESC"),
      get("SELECT COUNT(*) AS total FROM admissions"),
      get("SELECT COUNT(*) AS today FROM admissions WHERE created_at LIKE ?", [
        `${todayStr}%`,
      ]),
      all(
        "SELECT class_applied AS class, COUNT(*) AS count FROM admissions GROUP BY class_applied ORDER BY class_applied",
      ),
    ]);

    const tableRows = rows
      .map((r) => {
        const student = `${r.first_name || ""} ${r.last_name || ""}`.trim();
        const parent =
          `${r.parent_first_name || ""} ${r.parent_last_name || ""}`.trim();
        const date = r.created_at
          ? new Date(r.created_at).toLocaleString()
          : "";
        return `<tr>
          <td>${student}</td>
          <td>${r.class_applied || ""}</td>
          <td>${parent}</td>
          <td>${r.phone || ""}</td>
          <td>${r.email || ""}</td>
          <td>${date}</td>
          <td>
            <form class="delete-form" action="/admin/delete/${r.id}" method="POST">
              <button type="submit" class="action-btn danger">Delete</button>
            </form>
          </td>
        </tr>`;
      })
      .join("");

    const classChips =
      classRows && classRows.length
        ? classRows
            .map(
              (c) =>
                `<span class="chip"><b>${c.class || "—"}</b>: ${c.count}</span>`,
            )
            .join("")
        : `<span class="chip">No class data</span>`;

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Dashboard | BeSchool</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    <header>
      <div class="logo"><span>B</span>eSchool</div>
      <nav id="nav">
        <a href="/index.html">Home</a>
        <a href="/about.html">About us</a>
        <a href="/teachers">Teachers</a>
        <a href="/fees">Fees</a>
      </nav>
      <a href="/admissions.html" class="btn">Admissions</a>
    </header>
    <section class="why">
      <div class="admin-header">
        <h2>Admin Dashboard</h2>
        <div class="admin-header-right">
          <span class="admin-user">Logged in as: admin</span>
          <a class="logout-btn" href="/admin/logout">Logout</a>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card red">
          <div>
            <div class="stat-title">Total Admissions</div>
            <div class="stat-value">${(totalRow && totalRow.total) || 0}</div>
          </div>
          <div class="stat-icon">📚</div>
        </div>
        <div class="stat-card yellow">
          <div>
            <div class="stat-title">Today’s Admissions</div>
            <div class="stat-value">${(todayRow && todayRow.today) || 0}</div>
          </div>
          <div class="stat-icon">🗓️</div>
        </div>
        <div class="stat-card white">
          <div>
            <div class="stat-title">Class-wise</div>
            <div class="stat-chips">${classChips}</div>
          </div>
          <div class="stat-icon">🏷️</div>
        </div>
      </div>

      <div class="admin-panel">
        <div class="admin-controls">
          <input id="admin-search" class="admin-search" type="text" placeholder="Search by student name, class, parent, phone or email" />
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Class</th>
                <th>Parent Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Submission Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="admin-tbody">
              ${tableRows || '<tr><td colspan="7">No admissions yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <script>
      // Mobile nav toggle (existing pattern)
      const menu = document.getElementById("menu");
      const nav = document.getElementById("nav");
      if (menu && nav) menu.addEventListener("click", () => nav.classList.toggle("active"));

      // Search filtering
      const searchInput = document.getElementById('admin-search');
      const tbody = document.getElementById('admin-tbody');
      if (searchInput && tbody) {
        searchInput.addEventListener('input', function () {
          const q = this.value.toLowerCase();
          Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            const text = tr.innerText.toLowerCase();
            tr.style.display = text.includes(q) ? '' : 'none';
          });
        });
      }

      // Delete confirm
      document.querySelectorAll('.delete-form').forEach(form => {
        form.addEventListener('submit', function (e) {
          const ok = confirm('Delete this admission record?');
          if (!ok) e.preventDefault();
        });
      });
    </script>
  </body>
</html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send("Database error");
  }
});

// Protected delete route
app.post("/admin/delete/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect("/admin/dashboard");
  db.run("DELETE FROM admissions WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).send("Database error");
    return res.redirect("/admin/dashboard");
  });
});

// ===== Teachers (Dynamic) =====
const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// GET /teachers - public page, shows admin controls if logged in
app.get("/teachers", (req, res) => {
  db.all("SELECT * FROM teachers ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).send("Database error");
    console.log("Session admin value:", req.session && req.session.admin);
    const isAdmin = !!(req.session && req.session.admin === true);
    const uploadErr = (req.query && req.query.upload_error) || "";
    const uploadErrMsg =
      uploadErr === "LIMIT_FILE_SIZE"
        ? "Maximum file size is 2MB"
        : uploadErr === "INVALID_FILE_TYPE"
          ? "Only image files are allowed"
          : uploadErr === "DB"
            ? "Something went wrong while saving. Please try again."
            : uploadErr
              ? "Upload failed. Please check the file and try again."
              : "";

    const cards =
      rows && rows.length
        ? rows
            .map((t) => {
              const photo =
                esc(t.photo) ||
                "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=1200&auto=format&fit=crop";
              const name = esc(t.name);
              const qualification = esc(t.qualification);
              const subject = esc(t.subject);
              const adminActions = isAdmin
                ? `
                <div class="teacher-actions" style="margin-top:12px; display:flex; gap:12px; justify-content:center;">
                  <details>
                    <summary class="action-btn white">Edit</summary>
                    <form action="/admin/teachers/edit/${t.id}" method="POST" enctype="multipart/form-data" style="margin-top:10px; text-align:left;">
                      <div class="form-group"><label>Full Name</label><input name="name" value="${name}" required></div>
                      <div class="form-group"><label>Highest Qualification</label><input name="qualification" value="${qualification}" required></div>
                      <div class="form-group"><label>Subject Taught</label><input name="subject" value="${subject}" required></div>
                      <div class="form-group"><label>Profile Photo</label><input type="file" name="photo" accept="image/*"></div>
                      <div style="display:flex; gap:10px; margin-top:8px;">
                        <button class="action-btn yellow" type="submit">Save</button>
                        <button class="action-btn" type="button" data-cancel>Cancel</button>
                      </div>
                    </form>
                  </details>
                  <form class="teacher-del" action="/admin/teachers/delete/${t.id}" method="POST">
                    <button class="action-btn danger" type="submit">Delete</button>
                  </form>
                </div>`
                : "";
              return `
              <div class="teacher-card">
                <img src="${photo}" alt="${name}">
                <h4>${name}</h4>
                <div class="qualification">${qualification || ""}</div>
                <div class="subject"><span class="subject-badge">${subject || ""}</span></div>
                ${adminActions}
              </div>`;
            })
            .join("")
        : `<div style="grid-column: 1/-1; padding:20px;">No teachers added yet.</div>`;

    const hasRows = Array.isArray(rows) && rows.length > 0;
    const addForm = isAdmin
      ? `
      <div class="admin-panel" style="text-align:left;">
        <details${hasRows ? "" : " open"}>
          <summary class="action-btn yellow" style="display:inline-block;">+ Add New Teacher</summary>
          <form action="/admin/teachers/add" method="POST" enctype="multipart/form-data" style="margin-top:12px;">
            <h3 style="margin-bottom:8px;">Add New Teacher</h3>
            <div class="form-row">
              <div class="form-group">
                <label>Full Name</label>
                <input name="name" placeholder="Full name" required>
              </div>
              <div class="form-group">
                <label>Highest Qualification</label>
                <input name="qualification" placeholder="B.Ed, M.Sc, PhD" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Subject Taught</label>
                <input name="subject" placeholder="Mathematics" required>
              </div>
              <div class="form-group">
                <label>Profile Photo</label>
                <input type="file" name="photo" accept="image/*">
                <div class="input-hint">Max 2MB • JPG/PNG only</div>
                ${uploadErrMsg ? `<div class="input-error">${uploadErrMsg}</div>` : ""}
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="action-btn yellow" type="submit">Save Teacher</button>
              <button class="action-btn" type="button" data-cancel>Cancel</button>
            </div>
          </form>
        </details>
      </div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Teachers | BeSchool</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    <header>
      <div class="logo"><span>B</span>eSchool</div>
      <nav id="nav">
        <a href="/index.html">Home</a>
        <a href="/about.html">About us</a>
        <a class="active" href="/teachers">Teachers</a>
        <a href="${isAdmin ? "/fees" : "/fees.html"}">Fees</a>
      </nav>
      <a href="/admissions.html" class="btn">Admissions</a>
    </header>
    <section class="why">
      <h2>Our Teachers</h2>
      <p>Meet the faculty guiding our students with dedication and expertise.</p>
      ${isAdmin ? `<div class="admin-header-right" style="justify-content:flex-end; margin-bottom:10px;"><span class="admin-user">Logged in as: admin</span><a class="logout-btn" href="/admin/logout">Logout</a></div>` : ""}
      ${addForm}
      <div class="teacher-grid">
        ${cards}
      </div>
    </section>
    <script>
      const menu = document.getElementById("menu");
      const nav = document.getElementById("nav");
      if (menu && nav) menu.addEventListener("click", () => nav.classList.toggle("active"));
      document.querySelectorAll('.teacher-del').forEach(f => {
        f.addEventListener('submit', function(e){
          if(!confirm('Delete this teacher?')) e.preventDefault();
        });
      });
      document.querySelectorAll('[data-cancel]').forEach(btn => {
        btn.addEventListener('click', function(){
          const d = this.closest('details');
          if (d) d.open = false;
        });
      });
      function validatePhoto(input){
        if(!input || !input.files || !input.files[0]) return true;
        const f = input.files[0];
        if(f.size > 2 * 1024 * 1024) return "Maximum file size is 2MB";
        if(!(f.type||"").startsWith("image/")) return "Only image files are allowed";
        return true;
      }
      function showError(input, msg){
        let el = input.parentElement.querySelector('.input-error');
        if(!el){
          el = document.createElement('div');
          el.className = 'input-error';
          input.parentElement.appendChild(el);
        }
        el.textContent = msg;
      }
      document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(form => {
        form.addEventListener('submit', function(e){
          const input = form.querySelector('input[type="file"][name="photo"]');
          const r = validatePhoto(input);
          if(r !== true){
            e.preventDefault();
            showError(input, r);
          }
        });
        const input = form.querySelector('input[type="file"][name="photo"]');
        if(input){
          input.addEventListener('change', function(){
            const r = validatePhoto(input);
            if(r !== true) showError(input, r);
            else {
              const el = input.parentElement.querySelector('.input-error');
              if(el) el.textContent = "";
            }
          });
        }
      });
    </script>
  </body>
  </html>`;
    res.send(html);
  });
});

// Admin: add teacher
app.post(
  "/admin/teachers/add",
  requireAdmin,
  upload.single("photo"),
  handleUploadError,
  (req, res) => {
    const { name, qualification, subject } = req.body || {};
    if (!name || !qualification || !subject) return res.redirect("/teachers");
    const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const stmt = db.prepare(
      `INSERT INTO teachers (name, qualification, subject, photo) VALUES (?, ?, ?, ?)`,
    );
    stmt.run(
      name || "",
      qualification || "",
      subject || "",
      photoPath || null,
      (dbErr) => {
        if (dbErr) {
          console.error("Teacher insert error:", dbErr);
          return res.redirect("/teachers?upload_error=DB");
        }
        return res.redirect("/teachers");
      },
    );
  },
);

// Admin: edit teacher
app.post(
  "/admin/teachers/edit/:id",
  requireAdmin,
  upload.single("photo"),
  handleUploadError,
  (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect("/teachers");
    const { name, qualification, subject } = req.body || {};
    if (!name || !qualification || !subject) return res.redirect("/teachers");
    const newPhoto = req.file ? `/uploads/${req.file.filename}` : null;
    db.get("SELECT photo FROM teachers WHERE id = ?", [id], (e, row) => {
      if (e) {
        console.error("Teacher select error:", e);
        return res.redirect("/teachers?upload_error=DB");
      }
      const finalPhoto = newPhoto || (row ? row.photo : null);
      db.run(
        `UPDATE teachers SET name = ?, qualification = ?, subject = ?, photo = ? WHERE id = ?`,
        [name || "", qualification || "", subject || "", finalPhoto, id],
        (err2) => {
          if (err2) {
            console.error("Teacher update error:", err2);
            return res.redirect("/teachers?upload_error=DB");
          }
          return res.redirect("/teachers");
        },
      );
    });
  },
);

// Path-scoped error handler to guarantee redirect for teacher upload errors
app.use("/admin/teachers", (err, req, res, next) => {
  if (!err) return next();
  const code =
    err.code === "LIMIT_FILE_SIZE"
      ? "LIMIT_FILE_SIZE"
      : err.code === "INVALID_FILE_TYPE" || err.message === "INVALID_FILE_TYPE"
        ? "INVALID_FILE_TYPE"
        : "UPLOAD";
  return res.redirect(`/teachers?upload_error=${code}`);
});

// ===== Global error handler to avoid error pages during uploads =====
app.use((err, req, res, next) => {
  if (!err) return next();
  const isTeachersRoute =
    req.path.startsWith("/admin/teachers") || req.path === "/teachers";
  const code =
    err.code === "LIMIT_FILE_SIZE"
      ? "LIMIT_FILE_SIZE"
      : err.code === "INVALID_FILE_TYPE" || err.message === "INVALID_FILE_TYPE"
        ? "INVALID_FILE_TYPE"
        : "UPLOAD";
  if (isTeachersRoute) {
    return res.redirect(`/teachers?upload_error=${code}`);
  }
  console.error("Unhandled error:", err);
  return res.status(500).send("Server error");
});

// Fees: submit receipt
app.post(
  "/fees/submit",
  upload.single("receipt"),
  handleReceiptError,
  [
    body("student_name").trim().notEmpty(),
    body("address").trim().notEmpty(),
    body("class").trim().notEmpty(),
    body("roll").trim().notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty() || !req.file) {
      return res.redirect(
        `/fees.html?fees_error=${!req.file ? "RECEIPT_REQUIRED" : "INVALID"}`,
      );
    }
    const student_name = req.body.student_name || "";
    const address = req.body.address || "";
    const klass = req.body.class || "";
    const roll = req.body.roll || "";
    const receipt = req.file ? `/uploads/${req.file.filename}` : null;
    const created_at = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO payments (student_name, address, class, roll_number, receipt, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(student_name, address, klass, roll, receipt, created_at, (err) => {
      if (err) return res.redirect("/fees.html?fees_error=DB");
      return res.redirect("/fees.html?fees_status=ok");
    });
  },
);

// Admin view payments
app.get("/fees", requireAdmin, (req, res) => {
  db.all("SELECT * FROM payments ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).send("Database error");
    const items =
      rows && rows.length
        ? rows
            .map((p) => {
              const when = p.created_at
                ? new Date(p.created_at).toLocaleString()
                : "";
              const rlink = p.receipt
                ? `<a href="${p.receipt}" target="_blank">View receipt</a>`
                : "—";
              return `<tr>
                <td>${p.student_name}</td>
                <td>${p.address}</td>
                <td>${p.class}</td>
                <td>${p.roll_number}</td>
                <td>${when}</td>
                <td>${rlink}</td>
              </tr>`;
            })
            .join("")
        : `<tr><td colspan="6" style="text-align:center;">No payments submitted yet.</td></tr>`;
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fees Submissions | BeSchool</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    <header>
      <div class="logo"><span>B</span>eSchool</div>
      <nav id="nav">
        <a href="/index.html">Home</a>
        <a href="/about.html">About us</a>
        <a href="/teachers">Teachers</a>
        <a class="active" href="/fees">Fees</a>
      </nav>
      <a href="/admissions.html" class="btn">Admissions</a>
    </header>
    <section class="why">
      <div class="admin-header">
        <h2>Fee Submissions</h2>
        <div class="admin-header-right">
          <span class="admin-user">Logged in as: admin</span>
          <a class="logout-btn" href="/admin/logout">Logout</a>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Address</th>
              <th>Class</th>
              <th>Roll No.</th>
              <th>Submitted At</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    </section>
  </body>
</html>`;
    res.send(html);
  });
});

// Backward-compatible redirect from /fee to /fees for admin
app.get("/fee", requireAdmin, (req, res) => {
  res.redirect("/fees");
});
// Admin: delete teacher
app.post("/admin/teachers/delete/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect("/teachers");
  db.run("DELETE FROM teachers WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).send("Database error");
    return res.redirect("/teachers");
  });
});

// Logout (protected)
app.get("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin-login");
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
