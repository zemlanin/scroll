const test = require("tape");
const inspectSymbol = require("util").inspect.custom;
const { HtmlDiffer } = require("html-differ");

if (typeof test.Test.prototype.equalHtml === "undefined") {
  const htmlDiffer = new HtmlDiffer();
  const getValue = (chunk) => chunk.value;
  const rejectAdded = (chunk) => !chunk.added;
  const rejectRemoved = (chunk) => !chunk.removed;
  const rejectModified = (chunk) => !chunk.added && !chunk.removed;

  test.Test.prototype.equalHtml = function equalHtml(a, b, msg, extra) {
    if (arguments.length < 2) {
      throw new TypeError("two arguments must be provided to compare");
    }

    const diff = htmlDiffer.diffHtml(a, b);

    this._assert(diff.every(rejectModified), {
      message: typeof msg !== "undefined" ? msg : "should be equal as html",
      operator: "equalHtml",
      actual: {
        [inspectSymbol]: () =>
          // joining with a circle instead of `\n` because `tap-spec` can't do yaml
          // https://github.com/scottcorgan/tap-spec/issues/57
          diff.filter(rejectAdded).map(getValue).join(" 🔴 "),
      },
      expected: {
        [inspectSymbol]: () =>
          // joining with a circle instead of `\n` because `tap-spec` can't do yaml
          // https://github.com/scottcorgan/tap-spec/issues/57
          diff.filter(rejectRemoved).map(getValue).join(" 🔵 "),
      },
      extra: extra,
    });
  };
}
