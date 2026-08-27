/**
 * Automated tests for the MapMyMeds backend. Covers every behavior verified by hand during
 * development — persistence, auth, chain-gating (enforced server-side, not just hidden by
 * the UI), anti-double-claim, and honest "unreported" defaults for real onboarded pharmacies.
 *
 * Run: node --test test/server.test.js
 * (Node's built-in test runner — no extra dependencies needed.)
 *
 * Each test gets a fresh in-memory database, so tests never interfere with each other or
 * touch the real mapmymeds.db file.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const Database = require("better-sqlite3");
const { createApp, initSchema, seedDatabase } = require("../server.js");

// Spins up a real HTTP server on an ephemeral port, backed by a fresh in-memory DB.
// Returns a small `api()` helper plus a `close()` to tear it down after the test.
async function startTestServer({ seeded = true } = {}) {
  const db = new Database(":memory:");
  initSchema(db);
  if (seeded) seedDatabase(db, { silent: true });
  const app = createApp(db);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  async function api(path, options = {}) {
    const res = await fetch(`${base}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  return { api, db, close: () => new Promise((resolve) => server.close(resolve)) };
}

/* ------------------------------- Seeding ------------------------------- */

test("seeds exactly the expected pilot pharmacies, excluding test nodes by default", async () => {
  const { api, close } = await startTestServer();
  const { status, data } = await api("/api/nodes");
  assert.equal(status, 200);
  assert.equal(data.nodes.length, 8, "8 real pilot pharmacies, test nodes excluded by default");
  assert.ok(data.nodes.every((n) => !n.isTest), "no test nodes leaked into the default listing");
  await close();
});

test("includeTest=true reveals the 2 test pharmacies on top of the 8 pilot ones", async () => {
  const { api, close } = await startTestServer();
  const { data } = await api("/api/nodes?includeTest=true");
  assert.equal(data.nodes.length, 10);
  await close();
});

test("demo pharmacies get real seeded stock; nothing starts as unreported for them", async () => {
  const { api, close } = await startTestServer();
  const { data } = await api("/api/stock?medId=ator");
  const demoNodeIds = ["ls1-1", "ls1-2", "ls1-3", "ls1-4", "ls13-1", "ls13-2", "ls13-3", "ls13-4"];
  demoNodeIds.forEach((id) => assert.notEqual(data.stock[id].level, "unreported", `${id} should have real demo stock`));
  await close();
});

/* ------------------------------- Auth ------------------------------- */

test("auth lookup succeeds for a registered pharmacy's email domain", async () => {
  const { api, close } = await startTestServer();
  const { status, data } = await api("/api/auth/lookup", { method: "POST", body: JSON.stringify({ email: "anyone@broadlanechemist.co.uk" }) });
  assert.equal(status, 200);
  assert.equal(data.node.pharmacy, "Broad Lane Chemist");
  await close();
});

test("auth lookup rejects personal email domains with 403", async () => {
  const { api, close } = await startTestServer();
  const { status, data } = await api("/api/auth/lookup", { method: "POST", body: JSON.stringify({ email: "me@gmail.com" }) });
  assert.equal(status, 403);
  assert.equal(data.error, "personal email domain not accepted");
  await close();
});

test("auth lookup returns 404 with the domain for an unregistered business email", async () => {
  const { api, close } = await startTestServer();
  const { status, data } = await api("/api/auth/lookup", { method: "POST", body: JSON.stringify({ email: "owner@somenewpharmacy.co.uk" }) });
  assert.equal(status, 404);
  assert.equal(data.domain, "somenewpharmacy.co.uk");
  await close();
});

test("auth lookup rejects a malformed email with 400", async () => {
  const { api, close } = await startTestServer();
  const { status } = await api("/api/auth/lookup", { method: "POST", body: JSON.stringify({ email: "not-an-email" }) });
  assert.equal(status, 400);
  await close();
});

/* ------------------------------- Node registration (field onboarding) ------------------------------- */

test("a new pharmacy can be registered on the fly and can sign in immediately", async () => {
  const { api, close } = await startTestServer();
  const { status: createStatus, data: created } = await api("/api/nodes", {
    method: "POST",
    body: JSON.stringify({
      id: "barry-1", postcode: "CF62 7AB", pharmacy: "Test Barry Pharmacy", area: "Barry",
      lat: 51.4045, lng: -3.2733, phone: "01446 000000", chain: "Independent", emailDomain: "testbarrypharmacy.co.uk",
    }),
  });
  assert.equal(createStatus, 201);
  assert.equal(created.node.demo, false, "a newly registered pharmacy must never be marked as demo data");

  const { status: loginStatus, data: loginData } = await api("/api/auth/lookup", { method: "POST", body: JSON.stringify({ email: "owner@testbarrypharmacy.co.uk" }) });
  assert.equal(loginStatus, 200);
  assert.equal(loginData.node.id, "barry-1");
  await close();
});

test("a newly registered pharmacy starts every medication as honestly unreported, never fabricated stock", async () => {
  const { api, close } = await startTestServer();
  await api("/api/nodes", {
    method: "POST",
    body: JSON.stringify({
      id: "barry-2", postcode: "CF62 9AA", pharmacy: "Another Barry Pharmacy", area: "Barry",
      lat: 51.4, lng: -3.27, chain: "Independent", emailDomain: "anotherbarry.co.uk",
    }),
  });
  const { data } = await api("/api/stock?medId=ator");
  assert.equal(data.stock["barry-2"].level, "unreported");
  assert.equal(data.stock["barry-2"].cost, null);
  assert.deepEqual(data.stock["barry-2"].history, []);
  await close();
});

test("registering with a duplicate id or email domain fails cleanly with 409, not a crash", async () => {
  const { api, close } = await startTestServer();
  const payload = { id: "dup-1", postcode: "X", pharmacy: "X", area: "X", lat: 0, lng: 0, chain: "X", emailDomain: "dupdomain.co.uk" };
  const first = await api("/api/nodes", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(first.status, 201);
  const second = await api("/api/nodes", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(second.status, 409);
  await close();
});

test("registering with a missing required field returns 400", async () => {
  const { api, close } = await startTestServer();
  const { status } = await api("/api/nodes", { method: "POST", body: JSON.stringify({ pharmacy: "Missing Fields Pharmacy" }) });
  assert.equal(status, 400);
  await close();
});

/* ------------------------------- Stock reporting ------------------------------- */

test("a pharmacist can report their own stock level and it persists", async () => {
  const { api, close } = await startTestServer();
  const { status } = await api("/api/stock", { method: "POST", body: JSON.stringify({ nodeId: "ls13-2", medId: "ator", level: "low" }) });
  assert.equal(status, 200);
  const { data } = await api("/api/stock?medId=ator");
  assert.equal(data.stock["ls13-2"].level, "low");
  await close();
});

test("reporting an invalid level is rejected with 400", async () => {
  const { api, close } = await startTestServer();
  const { status } = await api("/api/stock", { method: "POST", body: JSON.stringify({ nodeId: "ls13-2", medId: "ator", level: "extremely high" }) });
  assert.equal(status, 400);
  await close();
});

test("reporting stock for a node/medication pair that doesn't exist returns 404", async () => {
  const { api, close } = await startTestServer();
  const { status } = await api("/api/stock", { method: "POST", body: JSON.stringify({ nodeId: "does-not-exist", medId: "ator", level: "low" }) });
  assert.equal(status, 404);
  await close();
});

test("stock survives a full server restart against the same database", async () => {
  const db = new Database(":memory:");
  initSchema(db);
  seedDatabase(db, { silent: true });

  const app1 = createApp(db);
  const server1 = http.createServer(app1);
  await new Promise((r) => server1.listen(0, r));
  const port1 = server1.address().port;
  await fetch(`http://localhost:${port1}/api/stock`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodeId: "ls1-1", medId: "amlo", level: "out" }),
  });
  await new Promise((r) => server1.close(r));

  // Same db instance, brand new app/server — simulating a process restart against the same data.
  const app2 = createApp(db);
  const server2 = http.createServer(app2);
  await new Promise((r) => server2.listen(0, r));
  const port2 = server2.address().port;
  const res = await fetch(`http://localhost:${port2}/api/stock?medId=amlo`);
  const data = await res.json();
  assert.equal(data.stock["ls1-1"].level, "out");
  await new Promise((r) => server2.close(r));
});

/* ------------------------------- Chain-gating (server-enforced) ------------------------------- */

test("a transfer request between different chains, no partner opt-in, is rejected with 403", async () => {
  const { api, close } = await startTestServer();
  // ls1-4 (CityCare Pharmacies) and ls13-2 (Northside Health) — different chains, neither is a network partner.
  const { status, data } = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "ator", holderNodeId: "ls1-4", receiverNodeId: "ls13-2", initiatedBy: "receiver", quantity: 10 }),
  });
  assert.equal(status, 403);
  assert.match(data.error, /not in the same chain/);
  await close();
});

test("a transfer request within the same chain is accepted", async () => {
  const { api, close } = await startTestServer();
  // ls1-1 and ls13-2 are both Northside Health.
  const { status } = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "ator", holderNodeId: "ls1-1", receiverNodeId: "ls13-2", initiatedBy: "receiver", quantity: 15 }),
  });
  assert.equal(status, 201);
  await close();
});

test("a transfer request succeeds across chains when the holder has opted in as a network partner", async () => {
  const { api, close } = await startTestServer();
  // ls1-3 (Merrion Health, Independent chain) is networkPartner: true.
  const { status } = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "ator", holderNodeId: "ls1-3", receiverNodeId: "ls13-4", initiatedBy: "receiver", quantity: 5 }),
  });
  assert.equal(status, 201);
  await close();
});

/* ------------------------------- Anti-double-claim ------------------------------- */

test("accepting one request auto-closes every other pending request on the same holder+medication", async () => {
  const { api, close } = await startTestServer();

  const req1 = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "ator", holderNodeId: "ls1-1", receiverNodeId: "ls13-2", initiatedBy: "receiver", quantity: 15 }),
  });
  const req2 = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "ator", holderNodeId: "ls1-1", receiverNodeId: "ls1-2", initiatedBy: "receiver", quantity: 5 }),
  });
  assert.equal(req1.status, 201);
  assert.equal(req2.status, 201);

  const accept = await api(`/api/requests/${req1.data.request.id}`, { method: "PATCH", body: JSON.stringify({ action: "accepted" }) });
  assert.equal(accept.status, 200);
  assert.equal(accept.data.request.status, "accepted");

  const { data } = await api("/api/requests?nodeId=ls1-1");
  const secondRequest = data.requests.find((r) => r.id === req2.data.request.id);
  assert.equal(secondRequest.status, "unavailable", "the competing request must be auto-closed, not left pending");
  await close();
});

test("rejecting a request does not affect other pending requests on the same batch", async () => {
  const { api, close } = await startTestServer();
  const req1 = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "omep", holderNodeId: "ls1-1", receiverNodeId: "ls13-2", initiatedBy: "receiver", quantity: 10 }),
  });
  const req2 = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "omep", holderNodeId: "ls1-1", receiverNodeId: "ls1-2", initiatedBy: "receiver", quantity: 8 }),
  });
  await api(`/api/requests/${req1.data.request.id}`, { method: "PATCH", body: JSON.stringify({ action: "rejected" }) });
  const { data } = await api("/api/requests?nodeId=ls1-1");
  const stillPending = data.requests.find((r) => r.id === req2.data.request.id);
  assert.equal(stillPending.status, "pending", "rejecting one request must not touch unrelated pending requests");
  await close();
});

test("an invalid PATCH action is rejected with 400", async () => {
  const { api, close } = await startTestServer();
  const created = await api("/api/requests", {
    method: "POST",
    body: JSON.stringify({ medId: "ator", holderNodeId: "ls1-1", receiverNodeId: "ls13-2", initiatedBy: "receiver", quantity: 1 }),
  });
  const { status } = await api(`/api/requests/${created.data.request.id}`, { method: "PATCH", body: JSON.stringify({ action: "made-up-status" }) });
  assert.equal(status, 400);
  await close();
});

test("PATCHing a request that doesn't exist returns 404", async () => {
  const { api, close } = await startTestServer();
  const { status } = await api("/api/requests/does-not-exist", { method: "PATCH", body: JSON.stringify({ action: "accepted" }) });
  assert.equal(status, 404);
  await close();
});