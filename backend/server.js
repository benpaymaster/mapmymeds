/**
 * MapMyMeds backend — real persistence, replacing the frontend's in-memory React state.
 *
 * Structured as createApp(db) + seedDatabase(db) so tests can spin up an isolated
 * in-memory database instead of touching the real mapmymeds.db file. Running this file
 * directly (`node server.js`) still boots the real server exactly as before.
 */

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const MEDS = [
  { id: "ator", name: "Atorvastatin", dose: "20mg" },
  { id: "amlo", name: "Amlodipine", dose: "5mg" },
  { id: "omep", name: "Omeprazole", dose: "20mg" },
  { id: "levo", name: "Levothyroxine", dose: "50mcg" },
  { id: "metf", name: "Metformin", dose: "500mg" },
  { id: "rami", name: "Ramipril", dose: "2.5mg" },
];

const PILOT_NODES = [
  { id: "ls1-1", postcode: "LS1 4DY", pharmacy: "Boar Lane Pharmacy", area: "LS1 City Centre", lat: 53.7958, lng: -1.5438, phone: "0113 496 0021", chain: "Northside Health", networkPartner: 0, emailDomain: "boarlanepharmacy.co.uk", demo: 1 },
  { id: "ls1-2", postcode: "LS1 5DR", pharmacy: "Wellington St. Chemist", area: "LS1 City Centre", lat: 53.7959, lng: -1.5551, phone: "0113 496 0044", chain: "Northside Health", networkPartner: 0, emailDomain: "wellingtonchemist.co.uk", demo: 1 },
  { id: "ls1-3", postcode: "LS1 6EL", pharmacy: "Merrion Health Pharmacy", area: "LS1 City Centre", lat: 53.7999, lng: -1.5406, phone: "0113 496 0078", chain: "Independent", networkPartner: 1, emailDomain: "merrionhealth.co.uk", demo: 1 },
  { id: "ls1-4", postcode: "LS1 3AX", pharmacy: "Kirkgate Community Pharmacy", area: "LS1 City Centre", lat: 53.7963, lng: -1.5386, phone: "0113 496 0103", chain: "CityCare Pharmacies", networkPartner: 0, emailDomain: "kirkgatepharmacy.co.uk", demo: 1 },
  { id: "ls13-1", postcode: "LS13 1AA", pharmacy: "Bramley Town St. Pharmacy", area: "LS13 Bramley", lat: 53.8117, lng: -1.6205, phone: "0113 256 0012", chain: "CityCare Pharmacies", networkPartner: 0, emailDomain: "bramleytownpharmacy.co.uk", demo: 1 },
  { id: "ls13-2", postcode: "LS13 2QF", pharmacy: "Broad Lane Chemist", area: "LS13 Bramley", lat: 53.8145, lng: -1.6108, phone: "0113 256 0034", chain: "Northside Health", networkPartner: 0, emailDomain: "broadlanechemist.co.uk", demo: 1 },
  { id: "ls13-3", postcode: "LS13 3JN", pharmacy: "Fairfield Pharmacy", area: "LS13 Bramley", lat: 53.8071, lng: -1.6247, phone: "0113 256 0056", chain: "Independent", networkPartner: 1, emailDomain: "fairfieldpharmacy.co.uk", demo: 1 },
  { id: "ls13-4", postcode: "LS13 4RT", pharmacy: "Cape Sq. Pharmacy", area: "LS13 Bramley", lat: 53.8098, lng: -1.6156, phone: "0113 256 0089", chain: "CityCare Pharmacies", networkPartner: 0, emailDomain: "capesqpharmacy.co.uk", demo: 1 },
  { id: "test-1", postcode: "LS1 0AA", pharmacy: "[TEST] Pharmacy One", area: "LS1 City Centre", lat: 53.7965, lng: -1.5478, phone: "0000 000 0001", chain: "Test Chain", networkPartner: 0, emailDomain: "test-pharmacy-1.mapmymeds-demo.co.uk", demo: 0, isTest: 1 },
  { id: "test-2", postcode: "LS13 0AA", pharmacy: "[TEST] Pharmacy Two", area: "LS13 Bramley", lat: 53.8117, lng: -1.6205, phone: "0000 000 0002", chain: "Independent", networkPartner: 1, emailDomain: "test-pharmacy-2.mapmymeds-demo.co.uk", demo: 0, isTest: 1 },
];

const PERSONAL_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "live.com", "aol.com", "protonmail.com", "msn.com"];

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      postcode TEXT NOT NULL,
      pharmacy TEXT NOT NULL,
      area TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      phone TEXT,
      chain TEXT NOT NULL,
      networkPartner INTEGER NOT NULL DEFAULT 0,
      emailDomain TEXT UNIQUE,
      demo INTEGER NOT NULL DEFAULT 0,
      isTest INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dose TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock (
      nodeId TEXT NOT NULL,
      medId TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'unreported',
      trend TEXT NOT NULL DEFAULT 'steady',
      cost REAL,
      history TEXT NOT NULL DEFAULT '[]',
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (nodeId, medId),
      FOREIGN KEY (nodeId) REFERENCES nodes(id),
      FOREIGN KEY (medId) REFERENCES meds(id)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      medId TEXT NOT NULL,
      holderNodeId TEXT NOT NULL,
      receiverNodeId TEXT,
      initiatedBy TEXT NOT NULL CHECK (initiatedBy IN ('holder','receiver')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','unavailable','completed')),
      quantity INTEGER,
      note TEXT,
      expiryDate TEXT,
      batchSize TEXT,
      createdAt INTEGER NOT NULL
    );
  `);
}

function seedDatabase(db, { silent = false } = {}) {
  const seededCount = db.prepare("SELECT COUNT(*) AS n FROM nodes").get().n;
  if (seededCount > 0) return;

  const insertMed = db.prepare("INSERT INTO meds (id, name, dose) VALUES (@id, @name, @dose)");
  MEDS.forEach((m) => insertMed.run(m));

  const insertNode = db.prepare(`
    INSERT INTO nodes (id, postcode, pharmacy, area, lat, lng, phone, chain, networkPartner, emailDomain, demo, isTest)
    VALUES (@id, @postcode, @pharmacy, @area, @lat, @lng, @phone, @chain, @networkPartner, @emailDomain, @demo, @isTest)
  `);
  PILOT_NODES.forEach((n) => insertNode.run({ isTest: 0, ...n }));

  function seedRand(seed) {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  const BASE_COST = { ator: 2.85, amlo: 1.4, omep: 3.6, levo: 1.95, metf: 1.1, rami: 1.65 };
  const insertStock = db.prepare(`
    INSERT INTO stock (nodeId, medId, level, trend, cost, history, updatedAt)
    VALUES (@nodeId, @medId, @level, @trend, @cost, @history, @updatedAt)
  `);

  MEDS.forEach((m, mi) => {
    const rnd = seedRand(mi * 131 + 17);
    PILOT_NODES.forEach((n) => {
      if (!n.demo) {
        insertStock.run({ nodeId: n.id, medId: m.id, level: "unreported", trend: "steady", cost: null, history: "[]", updatedAt: Date.now() });
        return;
      }
      const history = [];
      let v = 20 + rnd() * 60;
      for (let i = 0; i < 6; i++) {
        v = Math.max(0, v + (rnd() - 0.52) * 18);
        history.push(Math.round(v));
      }
      const last = history[history.length - 1];
      let level = last < 6 ? "out" : last < 22 ? "low" : last < 45 ? "medium" : "high";
      const slope = history[5] - history[1];
      const trend = slope > 6 ? "rising" : slope < -6 ? "falling" : "steady";
      const cost = +(BASE_COST[m.id] * (0.9 + rnd() * 0.25)).toFixed(2);
      insertStock.run({ nodeId: n.id, medId: m.id, level, trend, cost, history: JSON.stringify(history), updatedAt: Date.now() });
    });
  });

  db.prepare("UPDATE stock SET level='low', trend='falling' WHERE nodeId='ls13-2' AND medId='omep'").run();
  db.prepare("UPDATE stock SET level='high', trend='steady' WHERE nodeId='ls13-2' AND medId='amlo'").run();
  db.prepare("UPDATE stock SET level='out', trend='falling' WHERE nodeId='ls1-3' AND medId='amlo'").run();

  if (!silent) console.log("Seeded database with pilot nodes, meds, and demo stock.");
}

function rowToNode(r) {
  return { ...r, networkPartner: !!r.networkPartner, demo: !!r.demo, isTest: !!r.isTest };
}
function rowToStock(r) {
  return { level: r.level, trend: r.trend, cost: r.cost, history: JSON.parse(r.history) };
}
function canSeeCommercialDetail(a, b) {
  if (!a || !b) return false;
  if (a.chain === b.chain) return true;
  return !!a.networkPartner || !!b.networkPartner;
}

function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/meds", (req, res) => {
    res.json({ meds: db.prepare("SELECT * FROM meds").all() });
  });

  app.get("/api/nodes", (req, res) => {
    const includeTest = req.query.includeTest === "true";
    const rows = includeTest
      ? db.prepare("SELECT * FROM nodes").all()
      : db.prepare("SELECT * FROM nodes WHERE isTest = 0").all();
    res.json({ nodes: rows.map(rowToNode) });
  });

  app.post("/api/nodes", (req, res) => {
    const { id, postcode, pharmacy, area, lat, lng, phone, chain, networkPartner, emailDomain } = req.body;
    if (!id || !postcode || !pharmacy || !area || lat == null || lng == null || !chain || !emailDomain) {
      return res.status(400).json({ error: "missing required field" });
    }
    try {
      db.prepare(`
        INSERT INTO nodes (id, postcode, pharmacy, area, lat, lng, phone, chain, networkPartner, emailDomain, demo, isTest)
        VALUES (@id, @postcode, @pharmacy, @area, @lat, @lng, @phone, @chain, @networkPartner, @emailDomain, 0, 0)
      `).run({ id, postcode, pharmacy, area, lat, lng, phone: phone || null, chain, networkPartner: networkPartner ? 1 : 0, emailDomain: emailDomain.toLowerCase() });

      const meds = db.prepare("SELECT id FROM meds").all();
      const insertStock = db.prepare("INSERT INTO stock (nodeId, medId, level, trend, cost, history, updatedAt) VALUES (?, ?, 'unreported', 'steady', NULL, '[]', ?)");
      meds.forEach((m) => insertStock.run(id, m.id, Date.now()));

      res.status(201).json({ node: rowToNode(db.prepare("SELECT * FROM nodes WHERE id = ?").get(id)) });
    } catch (e) {
      if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "a node with this id or email domain already exists" });
      res.status(500).json({ error: "insert failed" });
    }
  });

  app.post("/api/auth/lookup", (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const atIndex = email.indexOf("@");
    if (atIndex < 1 || !email.slice(atIndex).includes(".")) return res.status(400).json({ error: "invalid email" });
    const domain = email.slice(atIndex + 1);
    if (PERSONAL_EMAIL_DOMAINS.includes(domain)) return res.status(403).json({ error: "personal email domain not accepted" });
    const node = db.prepare("SELECT * FROM nodes WHERE emailDomain = ?").get(domain);
    if (!node) return res.status(404).json({ error: "not-registered", domain });
    res.json({ node: rowToNode(node) });
  });

  app.get("/api/stock", (req, res) => {
    const { medId } = req.query;
    if (!medId) return res.status(400).json({ error: "medId required" });
    const rows = db.prepare("SELECT * FROM stock WHERE medId = ?").all(medId);
    const result = {};
    rows.forEach((r) => { result[r.nodeId] = rowToStock(r); });
    res.json({ medId, stock: result });
  });

  app.post("/api/stock", (req, res) => {
    const { nodeId, medId, level } = req.body;
    const validLevels = ["out", "low", "medium", "high"];
    if (!nodeId || !medId || !validLevels.includes(level)) return res.status(400).json({ error: "nodeId, medId, and a valid level are required" });
    const exists = db.prepare("SELECT 1 FROM stock WHERE nodeId = ? AND medId = ?").get(nodeId, medId);
    if (!exists) return res.status(404).json({ error: "no such node/medication pair" });
    db.prepare("UPDATE stock SET level = ?, trend = 'steady', updatedAt = ? WHERE nodeId = ? AND medId = ?").run(level, Date.now(), nodeId, medId);
    res.json({ stock: rowToStock(db.prepare("SELECT * FROM stock WHERE nodeId = ? AND medId = ?").get(nodeId, medId)) });
  });

  app.get("/api/requests", (req, res) => {
    const { nodeId } = req.query;
    const rows = nodeId
      ? db.prepare("SELECT * FROM requests WHERE holderNodeId = ? OR receiverNodeId = ? ORDER BY createdAt DESC").all(nodeId, nodeId)
      : db.prepare("SELECT * FROM requests ORDER BY createdAt DESC").all();
    res.json({ requests: rows });
  });

  app.post("/api/requests", (req, res) => {
    const { medId, holderNodeId, receiverNodeId, initiatedBy, quantity, note, expiryDate, batchSize } = req.body;
    if (!medId || !holderNodeId || !initiatedBy) return res.status(400).json({ error: "medId, holderNodeId, initiatedBy required" });

    const holder = db.prepare("SELECT * FROM nodes WHERE id = ?").get(holderNodeId);
    const receiver = receiverNodeId ? db.prepare("SELECT * FROM nodes WHERE id = ?").get(receiverNodeId) : null;
    if (!holder) return res.status(404).json({ error: "holder node not found" });
    if (receiverNodeId && !receiver) return res.status(404).json({ error: "receiver node not found" });

    if (receiver && !canSeeCommercialDetail(rowToNode(holder), rowToNode(receiver))) {
      return res.status(403).json({ error: "these two pharmacies are not in the same chain and neither has opted in as a network partner" });
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO requests (id, medId, holderNodeId, receiverNodeId, initiatedBy, status, quantity, note, expiryDate, batchSize, createdAt)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(id, medId, holderNodeId, receiverNodeId || null, initiatedBy, quantity || null, note || null, expiryDate || null, batchSize || null, Date.now());

    res.status(201).json({ request: db.prepare("SELECT * FROM requests WHERE id = ?").get(id) });
  });

  app.patch("/api/requests/:id", (req, res) => {
    const { id } = req.params;
    const { action } = req.body;
    if (!["accepted", "rejected", "completed"].includes(action)) return res.status(400).json({ error: "invalid action" });

    const target = db.prepare("SELECT * FROM requests WHERE id = ?").get(id);
    if (!target) return res.status(404).json({ error: "request not found" });

    db.prepare("UPDATE requests SET status = ? WHERE id = ?").run(action, id);

    if (action === "accepted") {
      db.prepare(`
        UPDATE requests SET status = 'unavailable'
        WHERE id != ? AND holderNodeId = ? AND medId = ? AND status = 'pending'
      `).run(id, target.holderNodeId, target.medId);
    }

    res.json({ request: db.prepare("SELECT * FROM requests WHERE id = ?").get(id) });
  });

  return app;
}

module.exports = { createApp, initSchema, seedDatabase, MEDS, PILOT_NODES, canSeeCommercialDetail };

// Only boots a real server + touches the real file when run directly (`node server.js`),
// never when required as a module — which is what lets tests import createApp/seedDatabase
// safely without ever starting an HTTP server or writing to mapmymeds.db.
if (require.main === module) {
  const path = require("path");
  const PORT = process.env.PORT || 4000;
  const db = new Database(path.join(__dirname, "mapmymeds.db"));
  db.pragma("journal_mode = WAL");
  initSchema(db);
  seedDatabase(db);
  const app = createApp(db);
  app.listen(PORT, () => {
    console.log(`MapMyMeds backend listening on http://localhost:${PORT}`);
  });
}