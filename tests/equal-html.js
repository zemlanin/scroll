const test = require("tape");
const inspectSymbol = require("util").inspect.custom;
const jsdiff = require("diff");
const cheerio = require("cheerio");
const prettier = require("prettier");

if (typeof test.Test.prototype.equalHtml === "undefined") {
  const getValue = (chunk) => chunk.value;
  const rejectAdded = (chunk) => !chunk.added;
  const rejectRemoved = (chunk) => !chunk.removed;
  const rejectModified = (chunk) => !chunk.added && !chunk.removed;

  test.Test.prototype.equalHtml = function equalHtml(a, b, msg, extra) {
    if (arguments.length < 2) {
      throw new TypeError("two arguments must be provided to compare");
    }

    const normalizedA = prettier.format(cheerio.load(a)("body").html(), {
      parser: "html",
      printWidth: Infinity
    });
    const normalizedB = prettier.format(cheerio.load(b)("body").html(), {
      parser: "html",
      printWidth: Infinity
    });

    const diff = jsdiff.diffLines(normalizedA, normalizedB);

    this._assert(diff.every(rejectModified), {
      message: typeof msg !== "undefined" ? msg : "should be equal as html",
      operator: "equalHtml",
      actual: {
        [inspectSymbol]: () =>
          // joining with a circle instead of `\n` because `tap-spec` can't do yaml
          // https://github.com/scottcorgan/tap-spec/issues/57
          diff
            .filter(rejectAdded)
            .map(getValue)
            .join(" 🔴 ")
            .replace(/\n/g, "\\n"),
      },
      expected: {
        [inspectSymbol]: () =>
          // joining with a circle instead of `\n` because `tap-spec` can't do yaml
          // https://github.com/scottcorgan/tap-spec/issues/57
          diff
            .filter(rejectRemoved)
            .map(getValue)
            .join(" 🔵 ")
            .replace(/\n/g, "\\n"),
      },
      extra: extra,
    });
  };
}
