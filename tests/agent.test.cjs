const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTs } = require("./helpers.cjs");

test("both AI prompts receive the explicit CV and real cargo/empresa/descricao fields", async () => {
  const prompts = [];
  class GoogleGenAI {
    constructor() {
      this.models = { async generateContent(request) {
        prompts.push(request.config.systemInstruction);
        return { text: "[]" };
      } };
    }
  }
  const agent = loadTs("src/main/submitter/agent.ts", {
    "@google/genai": { GoogleGenAI, Type: { ARRAY: "ARRAY", OBJECT: "OBJECT", STRING: "STRING" } },
  });
  const vaga = { cargo: "Cargo fixture", empresa: "Empresa fixture", descricao: "Descricao fixture" };
  const profile = { currentCity: "Cidade ficticia", salaryExpectationClt: "A combinar" };
  await agent.generateFormAnswers("fixture-key", "CV autenticado fixture", profile, vaga, "[]");
  await agent.correctFormErrors("fixture-key", "CV autenticado fixture", profile, vaga, "[]");
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.ok(prompt.includes("CV autenticado fixture"));
    assert.ok(prompt.includes("Vaga: Cargo fixture"));
    assert.ok(prompt.includes("Empresa: Empresa fixture"));
    assert.ok(prompt.includes("Descrição: Descricao fixture"));
  }
});
