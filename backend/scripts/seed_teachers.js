const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "..", "admissions.db");
const db = new sqlite3.Database(DB_PATH);

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

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      qualification TEXT,
      subject TEXT,
      photo TEXT
    )`,
  );
  db.get("SELECT COUNT(*) AS c FROM teachers", [], (err, row) => {
    if (err) {
      console.error("Error reading teachers count:", err);
      return db.close();
    }
    if (row && row.c > 0) {
      console.log("Teachers already seeded:", row.c);
      return db.close();
    }
    const stmt = db.prepare(
      `INSERT INTO teachers (name, qualification, subject, photo) VALUES (?, ?, ?, ?)`,
    );
    seeds.forEach((t) => stmt.run(t.name, t.qualification, t.subject, t.photo));
    stmt.finalize(() => {
      console.log("Seeded teachers:", seeds.length);
      db.close();
    });
  });
});
