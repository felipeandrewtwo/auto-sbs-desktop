const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relativePath, overrides = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(filename, "utf8").replaceAll("import.meta.env", "({})");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    __dirname: path.dirname(filename),
    console: { log() {}, error() {}, warn() {} },
    URL,
    Response,
    process,
    require(specifier) {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith("node:")) return require(specifier);
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
    ...globals,
  };
  vm.runInNewContext(compiled, context, { filename });
  return module.exports;
}

module.exports = { loadTs };
