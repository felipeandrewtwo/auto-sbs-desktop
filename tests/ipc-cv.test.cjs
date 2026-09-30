const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTs } = require("./helpers.cjs");

test("Setup and both run IPCs use main session/config despite a different renderer payload", async () => {
  let token = "main-session-a";
  const handlers = new Map();
  const requests = [];
  const cv = loadTs("src/main/submitter/user-cv.ts", {}, {
    fetch: async (url, options) => {
      requests.push({ url, token: options.headers.Authorization });
      return Response.json({ cvContent: options.headers.Authorization === "Bearer main-session-a" ? "CV A" : "CV B" });
    },
  });
  class Window {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    once() {}
    loadFile() {}
  }
  loadTs("src/main/index.ts", {
    electron: {
      app: { isPackaged: true, whenReady: () => Promise.resolve(), on() {} },
      BrowserWindow: Window,
      ipcMain: { handle(channel, callback) { handlers.set(channel, callback); } },
      shell: {},
    },
    "./token-store": { getToken: () => token },
    "./submitter/user-cv": cv,
    "./submitter/service": {
      runSubmitter: async (_jobs, loadCv) => loadCv(),
      runSubmitterSingle: async (_job, loadCv) => loadCv(),
    },
  }, { process: { env: { VITE_API_URL: "https://configured.invalid/api" }, platform: "win32" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await handlers.get("submitter:get-user-cv")({}, { token: "renderer-other-user", apiUrl: "https://other.invalid" }), "CV A");
  token = "main-session-b";
  assert.equal(await handlers.get("submitter:run")({}, []), "CV B");
  assert.equal(await handlers.get("submitter:run-single")({}, {}), "CV B");
  assert.deepEqual(requests, [
    { url: "https://configured.invalid/api/users/me", token: "Bearer main-session-a" },
    { url: "https://configured.invalid/api/users/me", token: "Bearer main-session-b" },
    { url: "https://configured.invalid/api/users/me", token: "Bearer main-session-b" },
  ]);
  token = null;
  await assert.rejects(handlers.get("submitter:get-user-cv")({}, { token: "renderer-session" }), { message: "SESSION_EXPIRED" });
  assert.equal(requests.length, 3);
});
