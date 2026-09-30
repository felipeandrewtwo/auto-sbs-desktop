const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTs } = require("./helpers.cjs");

function client(fetch) {
  return loadTs("src/main/submitter/user-cv.ts", {}, { fetch });
}

test("GET /users/me uses Bearer and only cvContent from the authenticated profile", async () => {
  const requests = [];
  const api = client(async (url, options) => {
    requests.push({ url, options });
    return Response.json({ _id: "fixture-a", nome: "Pessoa ficticia", cvContent: " CV atual A ", categoriaSugerida: "TI", subcategoriasSugeridas: [] });
  });
  assert.equal(await api.getUserCv("session-a", "https://api.invalid/api/"), " CV atual A ");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.invalid/api/users/me");
  assert.equal(requests[0].options.headers.Authorization, "Bearer session-a");
  assert.equal(requests[0].options.redirect, "error");
});

for (const [status, message] of [[401, "SESSION_EXPIRED"], [404, "PROFILE_UNAVAILABLE"], [403, "PROFILE_FORBIDDEN"], [500, "CV_HTTP_ERROR_500"]]) {
  test(`HTTP ${status} reports ${message} without probing other routes`, async () => {
    let requests = 0;
    const api = client(async () => { requests += 1; return new Response("", { status }); });
    await assert.rejects(api.getUserCv("session-a", "https://api.invalid"), { message });
    assert.equal(requests, 1);
  });
}

for (const [label, profile, message] of [
  ["blank CV", { cvContent: " \n " }, "CV_EMPTY"],
  ["null CV", { cvContent: null }, "CV_EMPTY"],
  ["missing CV", { _id: "fixture-a" }, "PROFILE_INVALID_RESPONSE"],
  ["legacy aliases", { cv: "local", data: { cvContent: "other" } }, "PROFILE_INVALID_RESPONSE"],
  ["null profile", null, "PROFILE_INVALID_RESPONSE"],
]) {
  test(`${label} fails without a local fallback`, async () => {
    let requests = 0;
    const api = client(async () => { requests += 1; return Response.json(profile); });
    await assert.rejects(api.getUserCv("session-a", "https://api.invalid"), { message });
    assert.equal(requests, 1);
  });
}

test("network and invalid JSON errors stay distinct", async () => {
  await assert.rejects(client(async () => { throw new Error("offline"); }).getUserCv("session-a", "https://api.invalid"), { message: "CV_NETWORK_ERROR" });
  await assert.rejects(client(async () => new Response("not-json")).getUserCv("session-a", "https://api.invalid"), { message: "PROFILE_INVALID_RESPONSE" });
});

test("missing session and invalid URL fail before fetching", async () => {
  const api = client(async () => { assert.fail("must not fetch"); });
  await assert.rejects(api.getUserCv("", "https://api.invalid"), { message: "SESSION_EXPIRED" });
  await assert.rejects(api.getUserCv("session-a", "file:///cv.md"), { message: "INVALID_API_URL" });
});

test("each request uses the current user and current API without caching CV", async () => {
  let token = "session-a";
  const requests = [];
  const api = client(async (url, options) => {
    requests.push(url);
    return Response.json({ cvContent: options.headers.Authorization === "Bearer session-a" ? "CV A" : "CV B" });
  });
  assert.equal(await api.getCurrentUserCv(() => token, "https://first.invalid"), "CV A");
  token = "session-b";
  assert.equal(await api.getCurrentUserCv(() => token, "https://second.invalid"), "CV B");
  assert.deepEqual(requests, ["https://first.invalid/users/me", "https://second.invalid/users/me"]);
});

test("a session switch during the request rejects the previous user's CV", async () => {
  let token = "session-a";
  const api = client(async () => {
    token = "session-b";
    return Response.json({ cvContent: "CV A" });
  });
  await assert.rejects(api.getCurrentUserCv(() => token, "https://api.invalid"), { message: "SESSION_CHANGED" });
});
