const test = require("tape-promise/tape");
require("../equal-html.js");

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

test("dedent", async (t) => {
  t.equal(dedent("\nx\n"), "x\n");
  t.equal(dedent("x\ny"), "x\ny");
  t.equal(dedent("x\n  y"), "x\n  y");
  t.equal(dedent(" x\n  y"), "x\n y");
  t.equal(dedent("\n  x\n  y"), "x\ny");
  t.equal(dedent("  lorem\n    ipsum\n"), "lorem\n  ipsum\n");
  t.equal(dedent("  lorem\n\n  \n    ipsum\n"), "lorem\n\n\n  ipsum\n");
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
  t.equal(result.opengraph.image, null);
  t.equal(result.rss.title, "title");
  t.equal(result.longread, null);
  t.equal(result.created, "2020-05-21T18:49:46Z");
  t.equal(result.createdDate, "2020-05-21");
  t.equal(result.createdUTC, "Thu, 21 May 2020 18:49:46 GMT");

  t.equalHtml(
    result.htmlTitle,
    '<h1 id="title"><a href="https://example.com/f69cd51a.html">title</a></h1>'
  );

  t.equalHtml(
    result.html,
    `
      <p>hello<sup><a href="#fn:f69cd51a:1" id="rfn:f69cd51a:1" rel="footnote">1</a></sup></p>
      <h2 id="should-have-id">should have id</h2>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:f69cd51a:1" tabindex="-1">
            <p>world&nbsp;<a href="#rfn:f69cd51a:1" rev="footnote">&#8617;</a></p>
          </li>
        </ol>
      </div>
    `
  );

  t.equalHtml(
    result.html,
    `
      <p>hello<sup><a href="#fn:f69cd51a:1" id="rfn:f69cd51a:1" rel="footnote">1</a></sup></p>
      <h2 id="should-have-id">should have id</h2>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:f69cd51a:1" tabindex="-1">
            <p>world&nbsp;<a href="#rfn:f69cd51a:1" rev="footnote">&#8617;</a></p>
          </li>
        </ol>
      </div>
    `
  );
});

test("footnotes", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        hello[^hacky]

        yep[^inline footnote] [^bignote]

        lorem[^spec] xyz [^spec2] [^word] [^слово]

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

  t.equalHtml(
    result.html,
    `
      <p>hello<sup><a href="#fn:a22749bc:hacky" id="rfn:a22749bc:hacky" rel="footnote">1</a></sup></p>
      <p>yep<sup><a href="#fn:a22749bc:2" id="rfn:a22749bc:2" rel="footnote">2</a></sup> <sup><a href="#fn:a22749bc:bignote" id="rfn:a22749bc:bignote" rel="footnote">3</a></sup></p>
      <p>lorem<sup><a href="#fn:a22749bc:spec" id="rfn:a22749bc:spec" rel="footnote">4</a></sup> xyz <sup><a href="#fn:a22749bc:spec2" id="rfn:a22749bc:spec2" rel="footnote">5</a></sup> <sup><a href="#fn:a22749bc:word" id="rfn:a22749bc:word" rel="footnote">6</a></sup> <sup><a href="#fn:a22749bc:7" id="rfn:a22749bc:7" rel="footnote">7</a></sup></p>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:a22749bc:hacky" tabindex="-1">
            <p>world ender&nbsp;<a href="#rfn:a22749bc:hacky" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:2" tabindex="-1">
            <p>inline footnote&nbsp;<a href="#rfn:a22749bc:2" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:bignote" tabindex="-1">
            <p>Here&#39;s one with multiple paragraphs and code.</p>
            <p>Indent paragraphs to include them in the footnote.</p>
            <p><code>{ my code }</code></p>
            <p>Add as many paragraphs as you like.&nbsp;<a href="#rfn:a22749bc:bignote" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:spec" tabindex="-1">
            <p>ipsum ode <a href="https://example.com">something</a>&nbsp;<a href="#rfn:a22749bc:spec" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:spec2" tabindex="-1">
            <p>whatever&nbsp;<a href="#rfn:a22749bc:spec2" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:word" tabindex="-1">
            <p>word&nbsp;<a href="#rfn:a22749bc:word" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:7" tabindex="-1">
            <p>слово&nbsp;<a href="#rfn:a22749bc:7" rev="footnote">&#8617;</a></p>
          </li>
        </ol>
      </div>
    `
  );
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

  t.equalHtml(
    result.html,
    `
      <p><em>italic text<sup><a href="#fn:a22749bc:1" id="rfn:a22749bc:1" rel="footnote">1</a></sup></em></p>
      <p><strong>strong text<sup><a href="#fn:a22749bc:2" id="rfn:a22749bc:2" rel="footnote">2</a></sup></strong></p>
      <p><em>italic text<sup><a href="#fn:a22749bc:3" id="rfn:a22749bc:3" rel="footnote">3</a></sup></em></p>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:a22749bc:1" tabindex="-1">
            <p><a href="/media/a.pdf">a</a>&nbsp;<a href="#rfn:a22749bc:1" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:2" tabindex="-1">
            <p><a href="/media/b.pdf">b</a>&nbsp;<a href="#rfn:a22749bc:2" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:a22749bc:3" tabindex="-1">
            <p><a href="/media/c.pdf">c</a>&nbsp;<a href="#rfn:a22749bc:3" rev="footnote">&#8617;</a></p>
          </li>
        </ol>
      </div>
    `
  );
});

test("footnote before ticked code block", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        lorem [^1]

        [^1]: something

        \`\`\`js
        console.log("lorem");
        \`\`\`

        ipsum[^2]

        [^2]: something else

        \`\`\`js
        console.log(\`ipsum\`);
        \`\`\`
      `),
      id: "da4307d5",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p>lorem <sup><a href="#fn:da4307d5:1" id="rfn:da4307d5:1" rel="footnote">1</a></sup></p>
      <pre><code class="language-js"><span class="hljs-built_in">console</span>.log(<span class="hljs-string">"lorem"</span>);</code></pre>
      <p>ipsum<sup><a href="#fn:da4307d5:2" id="rfn:da4307d5:2" rel="footnote">2</a></sup></p>
      <pre><code class="language-js"><span class="hljs-built_in">console</span>.log(<span class="hljs-string">\`ipsum\`</span>);</code></pre>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:da4307d5:1" tabindex="-1">
            <p>something&nbsp;<a href="#rfn:da4307d5:1" rev="footnote">&#8617;</a></p>
          </li>
          <li id="fn:da4307d5:2" tabindex="-1">
            <p>something else&nbsp;<a href="#rfn:da4307d5:2" rev="footnote">&#8617;</a></p>
          </li>
        </ol>
      </div>
    `
  );
});

test("footnote with double squares", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        double squares[^xx][]

        [^xx]:. "[x](/media/x.pdf)"
      `),
      id: "96289b5d",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p>double squares<sup><a href="#fn:96289b5d:xx" id="rfn:96289b5d:xx" rel="footnote">1</a></sup></p>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:96289b5d:xx" tabindex="-1">
            <p><a href="/media/x.pdf">x</a>&nbsp;<a href="#rfn:96289b5d:xx" rev="footnote">&#8617;</a></p>
          </li>
        </ol>
      </div>
    `
  );
});

test("description after gallery", async (t) => {
  const result = await prepare(
    {
      text:
        dedent(`
          # description after gallery

          * ![](/media/one.png)
          * ![](/media/two.png)

          _some description_
        `) +
        "\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      id: "ff077d25",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equal(result.opengraph.image, "https://example.com/media/one.png");
  t.equal(result.opengraph.description, "some description");
  t.equalHtml(
    result.longread.teaser,
    `
      <ul data-gallery style="list-style:none;padding:0">
        <li><img src="https://example.com/media/one.png" alt="" loading="lazy" ></li>
        <li><img src="https://example.com/media/two.png" alt="" loading="lazy" ></li>
      </ul>

      <p><em>some description</em></p>

      <a href="https://example.com/ff077d25.html" class="more">202 слова &rarr;</a>
    `
  );
});

test("poster as a opengraph image", async (t) => {
  const result = await prepare(
    {
      text:
        dedent(`
          # poster as a opengraph image

          ![poster="/media/x/fit1000.png"](/media/x/gifv.mp4)

          _some description_
        `) +
        "\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      id: "1871cf2d",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equal(result.opengraph.image, "https://example.com/media/x/fit1000.png");
  t.equalHtml(
    result.longread.teaser,
    `
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay muted loop
      ></video></p>

      <p><em>some description</em></p>

      <a href="https://example.com/1871cf2d.html" class="more">202 слова &rarr;</a>
    `
  );
});

test("media", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
          ![title="gif >_<"](/media/w/gifv.mp4)

          ![poster="/media/x/fit1000.png"](/media/x/gifv.mp4)

          ![](/media/y.pdf)

          ![poster=/media/z/fit700.png](/media/z.pdf)

          ![time-stamp](data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+)
        `),
      id: "b0199568",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p><video
        playsinline
        src="https://example.com/media/w/gifv.mp4"
        title="gif &gt;_&lt;"
        autoplay
        muted
        loop
      ></video></p>
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay
        muted
        loop
      ></video></p>
      <p><iframe
        src="https://drive.google.com/viewerng/viewer?pid=explorer&efh=false&a=v&chrome=false&embedded=true&url=https%3A%2F%2Fexample.com%2Fmedia%2Fy.pdf"
        frameborder="0"
        width="640"
        height="360"
        allow="autoplay; encrypted-media"
        allowfullscreen="1"
        loading="lazy"
      ></iframe></p>
      <p>
        <a
          class="future-frame"
          href="https://example.com/media/z.pdf"
          data-src="https://drive.google.com/viewerng/viewer?pid=explorer&efh=false&a=v&chrome=false&embedded=true&url=https%3A%2F%2Fexample.com%2Fmedia%2Fz.pdf"
        >
          <img src="https://example.com/media/z/fit700.png" loading="lazy">
        </a>
      </p>
      <p>
        <a
          class="future-frame"
          href="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+"
          data-background="#fff"
        >
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPGJvZHkgb25sb2FkPSIoYT0%2Be%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E2xldCBiLGM9Xz0%2Be2Eud2lkdG%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Eg9ZS5jbGllbnRXaWR0aCxiPWE%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EuZ2V0Q29udGV4dCgnMmQnKSxi%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3ELmZvbnQ9JzQ4cHggTWVubG8nf%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          >
        </a>
      </p>
    `
  );
});

test("embed code block", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
          \`\`\`embed
          /media/w/gifv.mp4
          \`\`\`

          \`\`\`embed
          {"video": { "poster": "/media/x/fit1000.png" }, "href": "/media/x/gifv.mp4" }
          \`\`\`

          \`\`\`embed
          /media/y.pdf
          \`\`\`

          \`\`\`embed
          {"pdf": { "poster": "/media/z/fit700.png" }, "href": "/media/z.pdf" }
          \`\`\`

          \`\`\`embed
          data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+
          \`\`\`

          \`\`\`embed
          {"title": "time-stamp", "href": "data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+" }
          \`\`\`
        `),
      id: "8d830862",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p><video
        playsinline
        src="https://example.com/media/w/gifv.mp4"
        autoplay
        muted
        loop
      ></video></p>
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay
        muted
        loop
      ></video></p>
      <p><iframe
        src="https://drive.google.com/viewerng/viewer?pid=explorer&efh=false&a=v&chrome=false&embedded=true&url=https%3A%2F%2Fexample.com%2Fmedia%2Fy.pdf"
        frameborder="0"
        width="640"
        height="360"
        allow="autoplay; encrypted-media"
        allowfullscreen="1"
        loading="lazy"
      ></iframe></p>
      <p>
        <a
          class="future-frame"
          href="https://example.com/media/z.pdf"
          data-src="https://drive.google.com/viewerng/viewer?pid=explorer&efh=false&a=v&chrome=false&embedded=true&url=https%3A%2F%2Fexample.com%2Fmedia%2Fz.pdf"
        >
          <img src="https://example.com/media/z/fit700.png" loading="lazy">
        </a>
      </p>
      <p>
        <a
          class="future-frame"
          href="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+"
          data-background="#fff"
        >
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPGJvZHkgb25sb2FkPSIoYT0%2Be%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E2xldCBiLGM9Xz0%2Be2Eud2lkdG%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Eg9ZS5jbGllbnRXaWR0aCxiPWE%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EuZ2V0Q29udGV4dCgnMmQnKSxi%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3ELmZvbnQ9JzQ4cHggTWVubG8nf%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3ESxkPShnLGgsaixrPTYsbD00NC%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          >
        </a>
      </p>
      <p>
        <a
          class="future-frame"
          href="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+"
          data-background="#fff"
        >
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPGJvZHkgb25sb2FkPSIoYT0%2Be%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E2xldCBiLGM9Xz0%2Be2Eud2lkdG%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Eg9ZS5jbGllbnRXaWR0aCxiPWE%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EuZ2V0Q29udGV4dCgnMmQnKSxi%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3ELmZvbnQ9JzQ4cHggTWVubG8nf%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          >
        </a>
      </p>
    `
  );
});

test("embed-html code block", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
          \`\`\`embed-html
          <title>time-stamp</title>
          <meta property="og:image" content="/media/t.png">
          <body onload="(a=>{let b,c=_=>{a.width=e.clientWidth,b=a.getContext('2d'),b.font='48px Menlo'},d=(g,h,j,k=6,l=44)=>{b.fillStyle='#0a0',b.fillRect(0,0,a.width,a.height),b.fillStyle='#fff';for(h of g.split(' '))j=28.9*h.length,6<k&&k+j>=a.width&&(k=6,l+=48),b.fillText(h,k,l),k+=j+28.9;m.src=a.toDataURL()},f=_=>d(i.value||new Date().toISOString().replace(/\\.\\d+/,''));(onresize=_=>f(c()))(),setInterval(i.oninput=f,1e3)})(document.createElement('canvas'))"><input id=i placeholder=label><img id=m><p id=e>
          \`\`\`

          \`\`\`embed-html
          <title>time-stamp</title>
          <body onload="(a=>{let b,c=_=>{a.width=e.clientWidth,b=a.getContext('2d'),b.font='48px Menlo'},d=(g,h,j,k=6,l=44)=>{b.fillStyle='#0a0',b.fillRect(0,0,a.width,a.height),b.fillStyle='#fff';for(h of g.split(' '))j=28.9*h.length,6<k&&k+j>=a.width&&(k=6,l+=48),b.fillText(h,k,l),k+=j+28.9;m.src=a.toDataURL()},f=_=>d(i.value||new Date().toISOString().replace(/\\.\\d+/,''));(onresize=_=>f(c()))(),setInterval(i.oninput=f,1e3)})(document.createElement('canvas'))"><input id=i placeholder=label><img id=m><p id=e>
          \`\`\`
        `),
      id: "74244a20",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p>
        <a
          class="future-frame"
          href="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2UiIGNvbnRlbnQ9Ii9tZWRpYS90LnBuZyI+Cjxib2R5IG9ubG9hZD0iKGE9PntsZXQgYixjPV89PnthLndpZHRoPWUuY2xpZW50V2lkdGgsYj1hLmdldENvbnRleHQoJzJkJyksYi5mb250PSc0OHB4IE1lbmxvJ30sZD0oZyxoLGosaz02LGw9NDQpPT57Yi5maWxsU3R5bGU9JyMwYTAnLGIuZmlsbFJlY3QoMCwwLGEud2lkdGgsYS5oZWlnaHQpLGIuZmlsbFN0eWxlPScjZmZmJztmb3IoaCBvZiBnLnNwbGl0KCcgJykpaj0yOC45KmgubGVuZ3RoLDY8ayYmaytqPj1hLndpZHRoJiYoaz02LGwrPTQ4KSxiLmZpbGxUZXh0KGgsayxsKSxrKz1qKzI4Ljk7bS5zcmM9YS50b0RhdGFVUkwoKX0sZj1fPT5kKGkudmFsdWV8fG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5yZXBsYWNlKC9cLlxkKy8sJycpKTsob25yZXNpemU9Xz0+ZihjKCkpKSgpLHNldEludGVydmFsKGkub25pbnB1dD1mLDFlMyl9KShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKSkiPjxpbnB1dCBpZD1pIHBsYWNlaG9sZGVyPWxhYmVsPjxpbWcgaWQ9bT48cCBpZD1lPg=="
          data-background="#fff"
        >
          <img src="https://example.com/media/t.png">
        </a>
      </p>
      <p>
        <a
          class="future-frame"
          href="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8Ym9keSBvbmxvYWQ9IihhPT57bGV0IGIsYz1fPT57YS53aWR0aD1lLmNsaWVudFdpZHRoLGI9YS5nZXRDb250ZXh0KCcyZCcpLGIuZm9udD0nNDhweCBNZW5sbyd9LGQ9KGcsaCxqLGs9NixsPTQ0KT0+e2IuZmlsbFN0eWxlPScjMGEwJyxiLmZpbGxSZWN0KDAsMCxhLndpZHRoLGEuaGVpZ2h0KSxiLmZpbGxTdHlsZT0nI2ZmZic7Zm9yKGggb2YgZy5zcGxpdCgnICcpKWo9MjguOSpoLmxlbmd0aCw2PGsmJmsraj49YS53aWR0aCYmKGs9NixsKz00OCksYi5maWxsVGV4dChoLGssbCksays9aisyOC45O20uc3JjPWEudG9EYXRhVVJMKCl9LGY9Xz0+ZChpLnZhbHVlfHxuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZSgvXC5cZCsvLCcnKSk7KG9ucmVzaXplPV89PmYoYygpKSkoKSxzZXRJbnRlcnZhbChpLm9uaW5wdXQ9ZiwxZTMpfSkoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykpIj48aW5wdXQgaWQ9aSBwbGFjZWhvbGRlcj1sYWJlbD48aW1nIGlkPW0+PHAgaWQ9ZT4="
          data-background="#fff"
        >
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPHRpdGxlPnRpbWUtc3RhbXA8L%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E3RpdGxlPgo8Ym9keSBvbmxvYW%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EQ9IihhPT57bGV0IGIsYz1fPT5%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E7YS53aWR0aD1lLmNsaWVudFdp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EZHRoLGI9YS5nZXRDb250ZXh0K%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          >
        </a>
      </p>
    `
  );
});
