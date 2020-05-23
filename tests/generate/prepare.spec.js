const test = require("tape-promise/tape");
const { prepare } = require("../../common.js");

const mockEmbedsLoader = {
  load(html) {
    return html;
  },
};

function dedent(text) {
  // doesn't handle tabs,
  // doesn't handle multiple newlines at the beginning of a string,
  // etc.
  if (!text) {
    return text;
  }

  if (text[0] === "\n") {
    text = text.slice(1);
  }

  const spaceMatches = text.match(/^([ ]+)/);

  if (!spaceMatches) {
    return text;
  }

  const spaces = spaceMatches[1].length;

  if (spaces) {
    return text.replace(new RegExp(`^[ ]{1,${spaces}}`, "gm"), "");
  }

  return text;
}

test("dedent", (t) => {
  t.equal(dedent("\nx\n"), "x\n");
  t.equal(dedent("x\ny"), "x\ny");
  t.equal(dedent("x\n  y"), "x\n  y");
  t.equal(dedent(" x\n  y"), "x\n y");
  t.equal(dedent("\n  x\n  y"), "x\ny");
  t.equal(dedent("  lorem\n    ipsum\n"), "lorem\n  ipsum\n");
  t.equal(dedent("  lorem\n\n  \n    ipsum\n"), "lorem\n\n\n  ipsum\n");

  t.end();
});

test("general", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        # title

        hello[^1]

        ## should have id

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
      <h2 id="should-have-id">should have id</h2>
      <div class="footnotes"><hr/><ol><li id="fn:f69cd51a:1" tabindex="-1"><p>world&nbsp;<a href="#rfn:f69cd51a:1" rev="footnote">&#8617;</a></p>
      </li></ol></div>`)
  );

  t.end();
});

test("footnotes", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        hello[^hacky]

        yep[^inline footnote] [^bignote]

        lorem[^spec] xyz [^spec2]

        [^hacky]: . "world ender"

        [^spec2]: whatever

        [^spec]: ipsum ode [something](https://example.com)

        [^bignote]: Here's one with multiple paragraphs and code.

            Indent paragraphs to include them in the footnote.

            \`{ my code }\`

            Add as many paragraphs as you like.
      `),
      id: "a22749bc",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equal(
    result.html,
    dedent(`
      <p>hello<sup><a href="#fn:a22749bc:hacky" id="rfn:a22749bc:hacky" rel="footnote">1</a></sup></p>
      <p>yep<sup><a href="#fn:a22749bc:2" id="rfn:a22749bc:2" rel="footnote">2</a></sup> <sup><a href="#fn:a22749bc:bignote" id="rfn:a22749bc:bignote" rel="footnote">3</a></sup></p>
      <p>lorem<sup><a href="#fn:a22749bc:spec" id="rfn:a22749bc:spec" rel="footnote">4</a></sup> xyz <sup><a href="#fn:a22749bc:spec2" id="rfn:a22749bc:spec2" rel="footnote">5</a></sup></p>
      <div class="footnotes"><hr/><ol><li id="fn:a22749bc:hacky" tabindex="-1"><p>world ender&nbsp;<a href="#rfn:a22749bc:hacky" rev="footnote">&#8617;</a></p>
      </li>
      <li id="fn:a22749bc:2" tabindex="-1"><p>inline footnote&nbsp;<a href="#rfn:a22749bc:2" rev="footnote">&#8617;</a></p>
      </li>
      <li id="fn:a22749bc:bignote" tabindex="-1"><p>Here&#39;s one with multiple paragraphs and code.</p>
      <p>Indent paragraphs to include them in the footnote.</p>
      <p><code>{ my code }</code></p>
      <p>Add as many paragraphs as you like.&nbsp;<a href="#rfn:a22749bc:bignote" rev="footnote">&#8617;</a></p>
      </li>
      <li id="fn:a22749bc:spec" tabindex="-1"><p>ipsum ode <a href="https://example.com">something</a>&nbsp;<a href="#rfn:a22749bc:spec" rev="footnote">&#8617;</a></p>
      </li>
      <li id="fn:a22749bc:spec2" tabindex="-1"><p>whatever&nbsp;<a href="#rfn:a22749bc:spec2" rev="footnote">&#8617;</a></p>
      </li></ol></div>`)
  );

  t.end();
});

test("footnote inside non-paragraph blocks", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        _italic text[^1]_

        [^1]: . "[a](/media/a.pdf)"

        **strong text[^2]**

        [^2]: [b](/media/b.pdf)

        *italic text[^3]*

        [^3]:
            [c](/media/c.pdf)
      `),
      id: "a22749bc",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equal(
    result.html,
    dedent(`
      <p><em>italic text<sup><a href="#fn:a22749bc:1" id="rfn:a22749bc:1" rel="footnote">1</a></sup></em></p>
      <p><strong>strong text<sup><a href="#fn:a22749bc:2" id="rfn:a22749bc:2" rel="footnote">2</a></sup></strong></p>
      <p><em>italic text<sup><a href="#fn:a22749bc:3" id="rfn:a22749bc:3" rel="footnote">3</a></sup></em></p>
      <div class="footnotes"><hr/><ol><li id="fn:a22749bc:1" tabindex="-1"><p><a href="/media/a.pdf">a</a>&nbsp;<a href="#rfn:a22749bc:1" rev="footnote">&#8617;</a></p>
      </li>
      <li id="fn:a22749bc:2" tabindex="-1"><p><a href="/media/b.pdf">b</a>&nbsp;<a href="#rfn:a22749bc:2" rev="footnote">&#8617;</a></p>
      </li>
      <li id="fn:a22749bc:3" tabindex="-1"><p><a href="/media/c.pdf">c</a>&nbsp;<a href="#rfn:a22749bc:3" rev="footnote">&#8617;</a></p>
      </li></ol></div>`)
  );

  t.end();
});
