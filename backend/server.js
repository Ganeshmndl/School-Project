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
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, ".env") });

console.log("Mongo URI loaded:", !!process.env.MONGODB_URI);

const Admission = require("./models/Admission");
const Teacher = require("./models/Teacher");
const Payment = require("./models/Payment");
const Class = require("./models/Class");
const ClassActivity = require("./models/ClassActivity");
const ClassBook = require("./models/ClassBook");

const app = express();
const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, "../frontend");
const DB_PATH = path.join(__dirname, "admissions.db");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    console.log("Connected to MongoDB Atlas successfully");
    seedInitialData();
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Helper function to get next id for each collection
async function getNextId(model) {
  const lastDoc = await model.findOne().sort({ id: -1 });
  return lastDoc ? lastDoc.id + 1 : 1;
}

// Seed initial data
async function seedInitialData() {
  try {
    // Seed teachers
    const teacherCount = await Teacher.countDocuments();
    if (teacherCount === 0) {
      const teacherSeeds = [
        {
          id: 1,
          name: "Ms. Anjali Sharma",
          qualification: "M.A., B.Ed",
          subject: "Subject: English",
          photo: "photos/image1.jpg",
        },
        {
          id: 2,
          name: "Mr. Ravi Kumar",
          qualification: "M.Sc., B.Ed",
          subject: "Subject: Mathematics",
          photo: "photos/image2.jpg",
        },
        {
          id: 3,
          name: "Ms. Neha Verma",
          qualification: "B.Sc., D.El.Ed",
          subject: "Subject: Science",
          photo: "photos/image4.jpg",
        },
        {
          id: 4,
          name: "Mr. Suresh Patel",
          qualification: "M.A., B.Ed",
          subject: "Subject: Social Studies",
          photo: "photos/image3.JPG",
        },
      ];
      await Teacher.insertMany(teacherSeeds);
      console.log("Seeded initial teachers data");
    }

    // Seed classes, activities, and books
    const classCount = await Class.countDocuments();
    if (classCount === 0) {
      const now = new Date().toISOString();
      const demoClasses = [
        {
          id: 1,
          class_name: "Nursery",
          age_group: "3–4 Years",
          session: "2026–2027",
          created_at: now,
          activities: ["Rhymes", "Drawing", "Storytelling", "Clay Modeling"],
          books: [
            {
              book_name: "First Coloring",
              publisher: "Color Joy",
              image_path: "photos/class-books/Book2.jpeg",
            },
            {
              book_name: "Early Rhymes",
              publisher: "Song Birds",
              image_path: "photos/class-books/books3.jpg",
            },
          ],
        },
        {
          id: 2,
          class_name: "LKG",
          age_group: "4–5 Years",
          session: "2026–2027",
          created_at: now,
          activities: ["Basic Writing", "Number Fun", "Music", "Coloring"],
          books: [
            {
              book_name: "Number Magic",
              publisher: "Math World",
              image_path: "photos/class-books/book4.jpg",
            },
            {
              book_name: "Art & Craft",
              publisher: "Creative Minds",
              image_path: "photos/class-books/Book2.jpeg",
            },
          ],
        },
        {
          id: 3,
          class_name: "UKG",
          age_group: "5–6 Years",
          session: "2026–2027",
          created_at: now,
          activities: ["Reading", "Simple Addition", "Drama", "Outdoor Play"],
          books: [
            {
              book_name: "My World",
              publisher: "Science Kids",
              image_path: "photos/class-books/Book1.jpg",
            },
            {
              book_name: "Reader's Choice",
              publisher: "Story Hub",
              image_path: "photos/class-books/books3.jpg",
            },
          ],
        },
      ];

      for (const c of demoClasses) {
        await Class.create(c);
        let activityId = 1;
        for (const a of c.activities) {
          await ClassActivity.create({
            id: activityId++,
            class_id: c.id,
            activity_name: a,
          });
        }
        let bookId = 1;
        for (const b of c.books) {
          await ClassBook.create({ id: bookId++, class_id: c.id, ...b });
        }
      }
      console.log("Seeded initial classes, activities, and books data");
    }
  } catch (err) {
    console.error("Error seeding initial data:", err);
  }
}

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

// Redirect static classes.html to dynamic /classes
app.get("/classes.html", (req, res) => {
  res.redirect("/classes");
});

// Serve the existing static site
app.use(express.static(STATIC_DIR));
app.use("/photos", express.static(path.join(STATIC_DIR, "photos")));
const UPLOAD_DIR = path.join(__dirname, "uploads");
const CLASS_BOOKS_DIR = path.join(STATIC_DIR, "photos", "class-books");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}
if (!fs.existsSync(CLASS_BOOKS_DIR)) {
  fs.mkdirSync(CLASS_BOOKS_DIR, { recursive: true });
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
  db.run(
    `CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_name TEXT NOT NULL,
      age_group TEXT,
      session TEXT,
      created_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS class_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      activity_name TEXT NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE
    )`,
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS class_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      book_name TEXT NOT NULL,
      publisher TEXT,
      image_path TEXT,
      FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE
    )`,
  );
  db.get("SELECT COUNT(*) AS c FROM teachers", [], (err, row) => {
    if (err || (row && row.c > 0)) return;
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
    seeds.forEach((t) => stmt.run(t.name, t.qualification, t.subject, t.photo));
    stmt.finalize();
  });

  db.get("SELECT COUNT(*) AS c FROM classes", [], (err, row) => {
    if (err || (row && row.c > 0)) return;
    const now = new Date().toISOString();
    const demoClasses = [
      {
        name: "Nursery",
        age: "3–4 Years",
        session: "2026–2027",
        activities: ["Rhymes", "Drawing", "Storytelling", "Clay Modeling"],
        books: [
          { name: "First Coloring", pub: "Color Joy", img: "Book2.jpeg" },
          { name: "Early Rhymes", pub: "Song Birds", img: "books3.jpg" },
        ],
      },
      {
        name: "LKG",
        age: "4–5 Years",
        session: "2026–2027",
        activities: ["Basic Writing", "Number Fun", "Music", "Coloring"],
        books: [
          { name: "Number Magic", pub: "Math World", img: "book4.jpg" },
          { name: "Art & Craft", pub: "Creative Minds", img: "Book2.jpeg" },
        ],
      },
      {
        name: "UKG",
        age: "5–6 Years",
        session: "2026–2027",
        activities: ["Reading", "Simple Addition", "Drama", "Outdoor Play"],
        books: [
          { name: "My World", pub: "Science Kids", img: "Book1.jpg" },
          { name: "Reader's Choice", pub: "Story Hub", img: "books3.jpg" },
        ],
      },
    ];

    db.serialize(() => {
      demoClasses.forEach((c) => {
        db.run(
          "INSERT INTO classes (class_name, age_group, session, created_at) VALUES (?, ?, ?, ?)",
          [c.name, c.age, c.session, now],
          function (err) {
            if (err) return console.error("Error inserting class:", err);
            const cid = this.lastID;
            c.activities.forEach((a) => {
              db.run(
                "INSERT INTO class_activities (class_id, activity_name) VALUES (?, ?)",
                [cid, a],
              );
            });
            c.books.forEach((b) => {
              const imgPath = `photos/class-books/${b.img}`;
              db.run(
                "INSERT INTO class_books (class_id, book_name, publisher, image_path) VALUES (?, ?, ?, ?)",
                [cid, b.name, b.pub, imgPath],
              );
            });
          },
        );
      });
    });
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

// Multer for class book images
const bookStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CLASS_BOOKS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "") || "";
    cb(null, "book-" + unique + ext);
  },
});

const uploadBook = multer({
  storage: bookStorage,
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

function handleBookError(err, req, res, next) {
  if (err) {
    const code =
      err.code === "LIMIT_FILE_SIZE"
        ? "LIMIT_FILE_SIZE"
        : err.message === "INVALID_FILE_TYPE"
          ? "INVALID_FILE_TYPE"
          : "UPLOAD";
    return res.redirect(`/classes?error=${code}`);
  }
  next();
}

// API endpoint to accept form submissions
app.post("/api/admissions", async (req, res) => {
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

  try {
    const created_at = new Date().toISOString();
    const id = await getNextId(Admission);
    const admission = new Admission({
      id,
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
      created_at,
    });
    await admission.save();
    return res.json({ ok: true, id });
  } catch (err) {
    console.error("DB insert error:", err);
    return res.status(500).json({ ok: false, error: "Database error" });
  }
});

// Simple admin listing endpoint (optional)
app.get("/api/admissions", async (req, res) => {
  try {
    const rows = await Admission.find().sort({ created_at: -1 });
    res.json({ ok: true, data: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Database error" });
  }
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

// Helper to generate admin navbar
function getAdminNavbar(activePage, isAdmin) {
  return `
    <header>
      <div class="logo"><span>B</span>eSchool</div>
      <div class="menu-toggle" id="menu">☰</div>
      <nav id="nav">
        <a href="/index.html">Home</a>
        <a href="/about.html">About us</a>
        <a class="${activePage === "classes" ? "active" : ""}" href="/classes">Classes</a>
        <a class="${activePage === "teachers" ? "active" : ""}" href="/teachers">Teachers</a>
        <a class="${activePage === "fees" ? "active" : ""}" href="${isAdmin ? "/fees" : "/fees.html"}">Fees</a>
        ${isAdmin ? `<a class="${activePage === "dashboard" ? "active" : ""}" href="/admin/dashboard">Dashboard</a>` : ""}
      </nav>
      <a href="/admissions.html" class="btn">Admissions</a>
    </header>
    <script>
      const menu = document.getElementById("menu");
      const nav = document.getElementById("nav");
      if (menu && nav) menu.addEventListener("click", () => nav.classList.toggle("active"));
    </script>
  `;
}

// Login handler
app.post(
  "/admin-login",
  maybeLoginLimiter,
  [body("username").trim().notEmpty(), body("password").notEmpty()],
  async (req, res) => {
    // Initialize attempts if not set
    if (typeof req.session.loginAttempts !== "number") {
      req.session.loginAttempts = 0;
    }

    // If already blocked (>= 5 attempts)
    if (req.session.loginAttempts >= 5) {
      return res.redirect("/admin-login?error=blocked");
    }

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

      const checkPassword = async () => {
        if (!nameMatches) return false;
        return await bcrypt.compare(password, envHash);
      };

      const ok = await checkPassword();

      if (!ok) {
        req.session.loginAttempts++;
        if (req.session.loginAttempts >= 5) {
          return res.redirect("/admin-login?error=blocked");
        }
        return res.redirect(
          `/admin-login?error=wrong&attempt=${req.session.loginAttempts}`,
        );
      }

      // Success
      req.session.admin = true;
      req.session.loginAttempts = 0; // Reset on success
      return res.redirect("/admin/dashboard");
    } catch (e) {
      console.error("Login error:", e);
      return res.redirect("/admin-login?error=1");
    }
  },
);

// Dashboard (protected)
app.get("/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const rows = await Admission.find().sort({ created_at: -1 });
    const total = await Admission.countDocuments();
    const today = await Admission.countDocuments({
      created_at: { $regex: `^${todayStr}` },
    });
    const classRows = await Admission.aggregate([
      { $group: { _id: "$class_applied", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).then((results) =>
      results.map((r) => ({ class: r._id, count: r.count })),
    );

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
    <link rel="stylesheet" href="/style.css?v=1.2" />
  </head>
  <body>
    <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    ${getAdminNavbar("dashboard", true)}
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
            <div class="stat-value">${total || 0}</div>
          </div>
          <div class="stat-icon">📚</div>
        </div>
        <div class="stat-card yellow">
          <div>
            <div class="stat-title">Today’s Admissions</div>
            <div class="stat-value">${today || 0}</div>
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
app.post("/admin/delete/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect("/admin/dashboard");
  try {
    await Admission.deleteOne({ id });
    return res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Delete admission error:", err);
    return res.status(500).send("Database error");
  }
});

// ===== Teachers (Dynamic) =====
const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// GET /teachers - public page, shows admin controls if logged in
app.get("/teachers", async (req, res) => {
  try {
    const rows = await Teacher.find().sort({ id: -1 });
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
    <link rel="stylesheet" href="/style.css?v=1.2" />
  </head>
  <body>
    <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    ${getAdminNavbar("teachers", isAdmin)}
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
  } catch (err) {
    console.error("Teachers route error:", err);
    return res.status(500).send("Database error");
  }
});

// Admin: add teacher
app.post(
  "/admin/teachers/add",
  requireAdmin,
  upload.single("photo"),
  handleUploadError,
  async (req, res) => {
    const { name, qualification, subject } = req.body || {};
    if (!name || !qualification || !subject) return res.redirect("/teachers");
    try {
      const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
      const id = await getNextId(Teacher);
      const teacher = new Teacher({
        id,
        name: name || "",
        qualification: qualification || "",
        subject: subject || "",
        photo: photoPath || null,
      });
      await teacher.save();
      return res.redirect("/teachers");
    } catch (dbErr) {
      console.error("Teacher insert error:", dbErr);
      return res.redirect("/teachers?upload_error=DB");
    }
  },
);

// Admin: edit teacher
app.post(
  "/admin/teachers/edit/:id",
  requireAdmin,
  upload.single("photo"),
  handleUploadError,
  async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect("/teachers");
    const { name, qualification, subject } = req.body || {};
    if (!name || !qualification || !subject) return res.redirect("/teachers");
    try {
      const newPhoto = req.file ? `/uploads/${req.file.filename}` : null;
      const existingTeacher = await Teacher.findOne({ id });
      const finalPhoto =
        newPhoto || (existingTeacher ? existingTeacher.photo : null);
      await Teacher.updateOne(
        { id },
        {
          name: name || "",
          qualification: qualification || "",
          subject: subject || "",
          photo: finalPhoto,
        },
      );
      return res.redirect("/teachers");
    } catch (err2) {
      console.error("Teacher update error:", err2);
      return res.redirect("/teachers?upload_error=DB");
    }
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty() || !req.file) {
      return res.redirect(
        `/fees.html?fees_error=${!req.file ? "RECEIPT_REQUIRED" : "INVALID"}`,
      );
    }
    try {
      const student_name = req.body.student_name || "";
      const address = req.body.address || "";
      const klass = req.body.class || "";
      const roll = req.body.roll || "";
      const receipt = req.file ? `/uploads/${req.file.filename}` : null;
      const created_at = new Date().toISOString();
      const id = await getNextId(Payment);
      const payment = new Payment({
        id,
        student_name,
        address,
        class: klass,
        roll_number: roll,
        receipt,
        created_at,
      });
      const savedPayment = await payment.save();
      console.log("Saved payment document:", savedPayment);
      return res.redirect("/fees.html?fees_status=ok");
    } catch (err) {
      console.error("Fee submission error:", err);
      return res.redirect("/fees.html?fees_error=DB");
    }
  },
);

// Admin view payments
app.get("/fees", requireAdmin, async (req, res) => {
  try {
    const rows = await Payment.find().sort({ created_at: -1 });
    console.log("Number of payments found:", rows.length);
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
    <link rel="stylesheet" href="/style.css?v=1.2" />
  </head>
  <body>
    <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    ${getAdminNavbar("fees", true)}
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
  } catch (err) {
    return res.status(500).send("Database error");
  }
});

// Backward-compatible redirect from /fee to /fees for admin
app.get("/fee", requireAdmin, (req, res) => {
  res.redirect("/fees");
});
// Admin: delete teacher
app.post("/admin/teachers/delete/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect("/teachers");
  try {
    await Teacher.deleteOne({ id });
    return res.redirect("/teachers");
  } catch (err) {
    return res.status(500).send("Database error");
  }
});

// Logout (protected)
app.get("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.clearCookie("connect.sid"); // Clear session cookie
    res.redirect("/index.html"); // Redirect to Home
  });
});

// ===== Classes (Dynamic) =====
app.get("/classes", async (req, res) => {
  const isAdmin = !!(req.session && req.session.admin === true);
  const error = req.query.error || "";

  try {
    const [classes, activities, books] = await Promise.all([
      Class.find().sort({ id: 1 }),
      ClassActivity.find(),
      ClassBook.find(),
    ]);

    const navLinks = classes
      .map(
        (c) =>
          `<a href="#class-${c.id}" class="class-nav-link">${esc(c.class_name)}</a>`,
      )
      .join("");

    const sections = classes
      .map((c) => {
        const classActivities = activities.filter((a) => a.class_id === c.id);
        const classBooks = books.filter((b) => b.class_id === c.id);

        const activityBadges = classActivities
          .map(
            (a) => `
          <div class="activity-badge-wrap">
            <span class="activity-badge">${esc(a.activity_name)}</span>
            ${
              isAdmin
                ? `
              <div class="crud-mini">
                <form action="/admin/classes/activity/delete/${a.id}" method="POST" onsubmit="return confirm('Delete activity?')">
                  <button type="submit" class="btn-icon">×</button>
                </form>
              </div>`
                : ""
            }
          </div>`,
          )
          .join("");

        const bookCards = classBooks
          .map(
            (b) => `
          <div class="book-card">
            <img src="/${b.image_path}" alt="${esc(b.book_name)}">
            <div class="book-info">
              <h4>${esc(b.book_name)}</h4>
              <p>Publisher: ${esc(b.publisher)}</p>
              ${
                isAdmin
                  ? `
                <div class="book-actions">
                  <form action="/admin/classes/book/delete/${b.id}" method="POST" onsubmit="return confirm('Delete book?')">
                    <button type="submit" class="action-btn danger small">Delete</button>
                  </form>
                </div>`
                  : ""
              }
            </div>
          </div>`,
          )
          .join("");

        return `
        <div class="class-section" id="class-${c.id}">
          <div class="class-header centered">
            <div class="class-title-wrap">
              <h2>${esc(c.class_name)}</h2>
              <span class="age-session">${esc(c.age_group)} | ${esc(c.session)}</span>
            </div>
            ${
              isAdmin
                ? `
              <div class="class-admin-actions" style="margin-top:15px;">
                <form action="/admin/classes/delete/${c.id}" method="POST" onsubmit="return confirm('Delete this class and all its data?')">
                  <button type="submit" class="action-btn danger small">Delete Class</button>
                </form>
              </div>`
                : ""
            }
          </div>
          
          <div class="class-content centered">
            <h4 class="section-subtitle">Activities & Learning</h4>
            <div class="title-underline mini"></div>
            <div class="activities-grid centered">
              ${activityBadges}
              ${
                isAdmin
                  ? `
                <form class="add-mini-form" action="/admin/classes/activity/add/${c.id}" method="POST">
                  <input name="activity_name" placeholder="New activity" required>
                  <button type="submit" class="btn-add">+</button>
                </form>`
                  : ""
              }
            </div>

            <h4 class="section-subtitle" style="margin-top:40px;">Prescribed Books</h4>
            <div class="title-underline mini"></div>
            <div class="books-grid">
              ${bookCards}
              ${
                isAdmin
                  ? `
                <div class="book-card add-book-card">
                  <details>
                    <summary class="add-book-summary">+ Add Book</summary>
                    <form action="/admin/classes/book/add/${c.id}" method="POST" enctype="multipart/form-data" class="add-book-form">
                      <input name="book_name" placeholder="Book Name" required>
                      <input name="publisher" placeholder="Publisher" required>
                      <input type="file" name="book_image" accept="image/*" required>
                      <button type="submit" class="action-btn yellow">Save Book</button>
                    </form>
                  </details>
                </div>`
                  : ""
              }
            </div>
          </div>
        </div>`;
      })
      .join("");

    const addClassForm = isAdmin
      ? `
      <div class="admin-panel" style="margin-bottom: 40px;">
        <details>
          <summary class="action-btn yellow">+ Add New Class</summary>
          <form action="/admin/classes/add" method="POST" style="margin-top:15px;">
            <div class="form-row">
              <div class="form-group">
                <label>Class Name</label>
                <input name="class_name" placeholder="e.g. Nursery" required>
              </div>
              <div class="form-group">
                <label>Age Group</label>
                <input name="age_group" placeholder="e.g. 3-4 Years" required>
              </div>
              <div class="form-group">
                <label>Session</label>
                <input name="session" placeholder="e.g. 2026-2027" required>
              </div>
            </div>
            <button type="submit" class="action-btn yellow">Create Class</button>
          </form>
        </details>
      </div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Classes | BeSchool</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css?v=1.2" />
</head>
<body>
  <div class="top-bar">
      <div>📞 +91 89057 11200</div>
      <div>🕒 Mon–Fri: 9:00 AM – 3:30 PM</div>
    </div>
    ${getAdminNavbar("classes", isAdmin)}

  <section class="hero" style="min-height: 40vh;">
    <div class="hero-text">
      <h1>Our Classes</h1>
      <p>A structured learning journey designed for early childhood development.</p>
    </div>
  </section>

  <div class="sticky-class-nav">
    ${navLinks}
  </div>

  <section class="why">
    <div class="container">
      ${
        error
          ? `<div class="input-error" style="margin-bottom:20px;">Error: ${esc(
              error,
            )}</div>`
          : ""
      }
      ${addClassForm}
      <div class="classes-container">
        ${sections || '<p style="text-align:center;">No classes found.</p>'}
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="footer-container">
      <div class="footer-box footer-about">
        <h3>BeSchool</h3>
        <p>A safe and joyful learning environment for young minds to grow with confidence and values.</p>
      </div>
      <div class="footer-row">
        <div class="footer-box">
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/index.html">Home</a></li>
            <li><a href="/about.html">About Us</a></li>
            <li><a href="/classes">Classes</a></li>
            <li><a href="/teachers">Teachers</a></li>
          </ul>
        </div>
        <div class="footer-box">
          <h4>Contact</h4>
          <p>📍 Your School Address</p>
          <p>📞 +91 89057 11200</p>
          <p>info@beschool.com</p>
        </div>
      </div>
    </div>
    <div class="footer-bottom">© 2026 BeSchool. All rights reserved.</div>
  </footer>

  <script>
    // Smooth scroll for sticky nav
    document.querySelectorAll('.class-nav-link').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          window.scrollTo({
            top: targetElement.offsetTop - 130, // nav height + buffer
            behavior: 'smooth'
          });
        }
      });
    });

    // Active state highlighting while scrolling
    const classSections = document.querySelectorAll('.class-section');
    const navLinks = document.querySelectorAll('.class-nav-link');

    window.addEventListener('scroll', () => {
      let current = '';
      classSections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (pageYOffset >= sectionTop - 150) {
          current = section.getAttribute('id');
        }
      });

      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').substring(1) === current) {
          link.classList.add('active');
        }
      });
    });
  </script>
</body>
</html>`;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// Admin: Class CRUD
app.post("/admin/classes/add", requireAdmin, async (req, res) => {
  const { class_name, age_group, session } = req.body;
  if (!class_name) return res.redirect("/classes?error=MissingData");
  try {
    const now = new Date().toISOString();
    const id = await getNextId(Class);
    const newClass = new Class({
      id,
      class_name,
      age_group,
      session,
      created_at: now,
    });
    await newClass.save();
    res.redirect("/classes");
  } catch (err) {
    return res.redirect("/classes?error=DB");
  }
});

app.post("/admin/classes/delete/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await Class.deleteOne({ id });
    await ClassActivity.deleteMany({ class_id: id });
    const booksToDelete = await ClassBook.find({ class_id: id });
    for (const book of booksToDelete) {
      if (book.image_path) {
        const fullPath = path.join(STATIC_DIR, book.image_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    }
    await ClassBook.deleteMany({ class_id: id });
    res.redirect("/classes");
  } catch (err) {
    res.redirect("/classes");
  }
});

// Admin: Activity CRUD
app.post("/admin/classes/activity/add/:cid", requireAdmin, async (req, res) => {
  const { activity_name } = req.body;
  const cid = parseInt(req.params.cid, 10);
  if (!activity_name) return res.redirect("/classes");
  try {
    const id = await getNextId(ClassActivity);
    const activity = new ClassActivity({ id, class_id: cid, activity_name });
    await activity.save();
    res.redirect("/classes");
  } catch (err) {
    res.redirect("/classes");
  }
});

app.post(
  "/admin/classes/activity/delete/:id",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
      await ClassActivity.deleteOne({ id });
      res.redirect("/classes");
    } catch (err) {
      res.redirect("/classes");
    }
  },
);

// Admin: Book CRUD
app.post(
  "/admin/classes/book/add/:cid",
  requireAdmin,
  uploadBook.single("book_image"),
  handleBookError,
  async (req, res) => {
    const { book_name, publisher } = req.body;
    const cid = parseInt(req.params.cid, 10);
    if (!book_name || !req.file)
      return res.redirect("/classes?error=MissingBookData");
    try {
      const id = await getNextId(ClassBook);
      const image_path = `photos/class-books/${req.file.filename}`;
      const book = new ClassBook({
        id,
        class_id: cid,
        book_name,
        publisher,
        image_path,
      });
      await book.save();
      res.redirect("/classes");
    } catch (err) {
      res.redirect("/classes");
    }
  },
);

app.post("/admin/classes/book/delete/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const book = await ClassBook.findOne({ id });
    if (book && book.image_path) {
      const fullPath = path.join(STATIC_DIR, book.image_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await ClassBook.deleteOne({ id });
    res.redirect("/classes");
  } catch (err) {
    res.redirect("/classes");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
