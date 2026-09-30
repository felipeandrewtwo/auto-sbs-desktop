const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTs } = require("./helpers.cjs");

function fixture({ failLogin = false, failPersistence = false, delayedPersistence = false } = {}) {
  const events = [];
  const states = ["login", null, "", false, false];
  let stateIndex = 0;
  let mainToken = "previous-fixture-session";
  let releasePersistence;
  const persistence = delayedPersistence ? new Promise(resolve => { releasePersistence = resolve; }) : Promise.resolve();
  const desktop = {
    auth: {
      async clearToken() { events.push("clear-main"); mainToken = null; },
      async setToken(token) {
        events.push("persist-start");
        await persistence;
        if (failPersistence) throw new Error("fixture persistence failed");
        mainToken = token;
        events.push("persist-done");
      },
    },
    submitter: {
      async getConfig() {
        assert.equal(mainToken, "new-fixture-session");
        events.push("config");
        return { geminiApiKey: "", hasLinkedInSession: false };
      },
    },
  };
  const app = loadTs("src/renderer/src/App.tsx", {
    react: {
      useState() {
        const index = stateIndex++;
        return [states[index], value => {
          states[index] = value;
          if (index === 1 && value) events.push("renderer-token");
          if (index === 0 && value === "setup") {
            assert.equal(mainToken, "new-fixture-session");
            events.push("setup-first-cv-session");
          }
        }];
      },
      useEffect() {},
      useMemo: callback => callback(),
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "@/pages/Dashboard": { Dashboard: "Dashboard" },
    "@/pages/Login": { Login: "Login" },
    "@/pages/Prefill": { Prefill: "Prefill" },
    "@/pages/Setup": { Setup: "Setup" },
    "@/services/api": {
      ApiError: class ApiError extends Error {},
      async login() {
        assert.equal(mainToken, null);
        events.push("login");
        if (failLogin) throw new Error("fixture login failed");
        return "new-fixture-session";
      },
      async getPrefillProfile() { return {}; },
    },
  }, { Error, window: { desktop }, localStorage: { getItem: () => null } });
  const login = app.default();
  assert.equal(login.type, "Login");
  return { submit: () => login.props.onSubmit("fixture@example.invalid", "fixture-password"), events, states, token: () => mainToken, release: () => releasePersistence() };
}

test("login waits for main persistence before renderer token, config and Setup's first CV session", async () => {
  const context = fixture({ delayedPersistence: true });
  const submitted = context.submit();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(context.events, ["clear-main", "login", "persist-start"]);
  assert.equal(context.states[0], "login");
  assert.equal(context.states[1], null);
  context.release();
  await submitted;
  assert.deepEqual(context.events, ["clear-main", "login", "persist-start", "persist-done", "renderer-token", "config", "setup-first-cv-session"]);
  assert.equal(context.token(), "new-fixture-session");
});

for (const failure of ["failLogin", "failPersistence"]) {
  test(`${failure} clears the previous session and stays unauthenticated`, async () => {
    const context = fixture({ [failure]: true });
    await context.submit();
    assert.equal(context.token(), null);
    assert.equal(context.states[0], "login");
    assert.equal(context.states[1], null);
    assert.ok(context.states[2].includes("fixture"));
    assert.equal(context.events.includes("config"), false);
    assert.equal(context.events.includes("setup-first-cv-session"), false);
  });
}
