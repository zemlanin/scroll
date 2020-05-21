const test = require("tape-promise/tape");
const { prepare } = require("../../common.js");

const mockEmbedsLoader = {
  load(html) {
    return html;
  },
};

function dedent(text) {
  if (!text) {
    return text;
  }

  if (text[0] === "\n") {
    text = text.slice(1);
  }

  const spaceMatches = text.match(/^(\s*)/);

  if (!spaceMatches) {
    return text;
  }

  const spaces = spaceMatches[1].length;

  if (spaces) {
    return text
      .split("\n")
      .map((line) => line.slice(spaces))
      .join("\n");
  }

  return text;
}

test("general", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        # title

        hello[^1]

        [^1]: . "world"
      `),
      id: "f69cd51a",
      created: +new Date("2020-05-21T18:49:46Z"),
    },
    mockEmbedsLoader
  );

  t.equal(result.title, "title");
  t.equal(result.url, "https://example.com/f69cd51a.html");
  t.equal(result.opengraph.url, "https://example.com/f69cd51a.html");
  t.equal(result.opengraph.title, "title");
  t.equal(result.opengraph.description, null);
  t.equal(result.opengraph.image, "");
  t.equal(result.rss.title, "title");
  t.equal(result.longread, null);
  t.equal(result.created, "2020-05-21T18:49:46Z");
  t.equal(result.createdDate, "2020-05-21");
  t.equal(result.createdUTC, "Thu, 21 May 2020 18:49:46 GMT");

  t.equal(
    result.htmlTitle,
    '<h1 id="title"><a href="https://example.com/f69cd51a.html">title</a></h1>\n'
  );

  t.equal(
    result.html,
    dedent(`
      <p>hello<sup><a href="#fn:f69cd51a:1" id="rfn:f69cd51a:1" rel="footnote">1</a></sup></p>
      <div class="footnotes"><hr/><ol><li id="fn:f69cd51a:1" tabindex="-1"><p>world&nbsp;<a href="#rfn:f69cd51a:1" rev="footnote">&#8617;</a></p>
      </li></ol></div>`)
  );

  t.end();
});
