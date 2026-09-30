const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTs } = require("./helpers.cjs");

const vaga = { id: "fixture-job", cargo: "Dev", empresa: "Empresa ficticia", localidade: "Remoto", linkVaga: "https://jobs.invalid/fixture", porcentagemAlinhamento: 100, recomendacao: "", pontosFortes: [], pontosFracos: [] };

function serviceFixture() {
  const events = [];
  const submissions = [];
  const page = { async goto() { events.push("goto"); }, async waitForTimeout() {} };
  const context = { async newPage() { return page; }, async storageState() { events.push("save-state"); } };
  const browser = { async newContext() { return context; }, async close() { events.push("close"); } };
  const service = loadTs("src/main/submitter/service.ts", {
    "node:fs": {
      existsSync() { return true; },
      readFileSync(filename) {
        assert.match(filename, /settings\.json$/);
        return JSON.stringify({ geminiApiKey: "fixture-key" });
      },
    },
    playwright: { chromium: { async launch() { events.push("launch"); return browser; } } },
    "./dom_submitter": { async processarSubmissao(receivedPage, job, cv) {
      assert.equal(receivedPage, page);
      submissions.push({ job, cv });
      return true;
    } },
    "./user-cv": { getUserCv() { assert.fail("CV must be loaded through the main session"); } },
  }, { process: { cwd: () => "fixture", env: {} } });
  return { service, events, submissions };
}

test("profile errors and empty CV prevent browser launch", async () => {
  for (const message of ["SESSION_EXPIRED", "PROFILE_UNAVAILABLE", "PROFILE_FORBIDDEN", "CV_NETWORK_ERROR"]) {
    const { service, events } = serviceFixture();
    await assert.rejects(service.runSubmitter([vaga], async () => { throw new Error(message); }), { message });
    assert.equal(events.length, 0);
  }
  const { service, events } = serviceFixture();
  await assert.rejects(service.runSubmitter([vaga], async () => "  "), { message: "CV_EMPTY" });
  assert.equal(events.length, 0);
});

test("automation receives fresh authenticated CV before opening each browser, including single runs", async () => {
  const { service, events, submissions } = serviceFixture();
  const result = await service.runSubmitter([vaga], async () => { events.push("cv-a"); return "CV A"; });
  assert.equal(result.success, 1);
  assert.equal(result.total, 1);
  assert.equal(await service.runSubmitterSingle(vaga, async () => { events.push("cv-b"); return "CV B"; }), true);
  assert.deepEqual(submissions.map(submission => submission.cv), ["CV A", "CV B"]);
  assert.ok(events.indexOf("cv-a") < events.indexOf("launch"));
  assert.ok(events.indexOf("cv-b") < events.lastIndexOf("launch"));
  assert.equal(events.filter(event => event === "close").length, 2);
});

test("DOM submitter rejects an empty explicit CV before touching the page or filesystem", async () => {
  const dom = loadTs("src/main/submitter/dom_submitter.ts", {
    fs: {
      existsSync() { assert.fail("must not access filesystem"); },
      readFileSync() { assert.fail("must not access filesystem"); },
      writeFileSync() { assert.fail("must not access filesystem"); },
    },
    path: require("node:path"),
    "./agent": {},
    "./service": {},
  });
  await assert.rejects(dom.processarSubmissao({}, vaga, " "), { message: "CV_EMPTY" });
  await assert.rejects(dom.processarSubmissao({}, vaga), { message: "CV_EMPTY" });
});
