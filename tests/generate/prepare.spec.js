const fs = require("fs");
const path = require("path");

const test = require("tape-promise/tape");
require("../equal-html.js");
const { getTestDB } = require("../db.js");

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
            <p>world&nbsp;<a href="#rfn:f69cd51a:1" rev="footnote">&#8617;&#xfe0e;</a></p>
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
            <p>world&nbsp;<a href="#rfn:f69cd51a:1" rev="footnote">&#8617;&#xfe0e;</a></p>
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
            <p>world ender&nbsp;<a href="#rfn:a22749bc:hacky" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:a22749bc:2" tabindex="-1">
            <p>inline footnote&nbsp;<a href="#rfn:a22749bc:2" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:a22749bc:bignote" tabindex="-1">
            <p>Here&#39;s one with multiple paragraphs and code.</p>
            <p>Indent paragraphs to include them in the footnote.</p>
            <p><code>{ my code }</code></p>
            <p>Add as many paragraphs as you like.&nbsp;<a href="#rfn:a22749bc:bignote" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:a22749bc:spec" tabindex="-1">
            <p>ipsum ode <a href="https://example.com">something</a>&nbsp;<a href="#rfn:a22749bc:spec" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:a22749bc:spec2" tabindex="-1">
            <p>whatever&nbsp;<a href="#rfn:a22749bc:spec2" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:a22749bc:word" tabindex="-1">
            <p>word&nbsp;<a href="#rfn:a22749bc:word" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:a22749bc:7" tabindex="-1">
            <p>слово&nbsp;<a href="#rfn:a22749bc:7" rev="footnote">&#8617;&#xfe0e;</a></p>
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
      id: "589870e6",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p><em>italic text<sup><a href="#fn:589870e6:1" id="rfn:589870e6:1" rel="footnote">1</a></sup></em></p>
      <p><strong>strong text<sup><a href="#fn:589870e6:2" id="rfn:589870e6:2" rel="footnote">2</a></sup></strong></p>
      <p><em>italic text<sup><a href="#fn:589870e6:3" id="rfn:589870e6:3" rel="footnote">3</a></sup></em></p>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:589870e6:1" tabindex="-1">
            <p><a href="https://example.com/media/a.pdf">a</a>&nbsp;<a href="#rfn:589870e6:1" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:589870e6:2" tabindex="-1">
            <p><a href="https://example.com/media/b.pdf">b</a>&nbsp;<a href="#rfn:589870e6:2" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:589870e6:3" tabindex="-1">
            <p><a href="https://example.com/media/c.pdf">c</a>&nbsp;<a href="#rfn:589870e6:3" rev="footnote">&#8617;&#xfe0e;</a></p>
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
      <pre><code class="language-js"><span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(<span class="hljs-string">"lorem"</span>);\n</code></pre>
      <p>ipsum<sup><a href="#fn:da4307d5:2" id="rfn:da4307d5:2" rel="footnote">2</a></sup></p>
      <pre><code class="language-js"><span class="hljs-variable language_">console</span>.<span class="hljs-title function_">log</span>(<span class="hljs-string">\`ipsum\`</span>);\n</code></pre>
      <div class="footnotes">
        <hr>
        <ol>
          <li id="fn:da4307d5:1" tabindex="-1">
            <p>something&nbsp;<a href="#rfn:da4307d5:1" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
          <li id="fn:da4307d5:2" tabindex="-1">
            <p>something else&nbsp;<a href="#rfn:da4307d5:2" rev="footnote">&#8617;&#xfe0e;</a></p>
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
            <p><a href="https://example.com/media/x.pdf">x</a>&nbsp;<a href="#rfn:96289b5d:xx" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
        </ol>
      </div>
    `
  );
});

test("footnote with cheese", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        - мясо[^cheese] — основная часть скрипта, которую выполняет \`urllib.request\`
        - тесто — интерфейс, за который юзер будет «держать» скрипт
          - \`logging\` для красивого вывода с таймстампами
          - \`argparse\` для ввода опций для «соуса»

        [^cheese]: или «мясо + сыр», или «протеин»…
      `),
      id: "1ef75fa3",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <ul>
        <li>
          мясо<sup><a href="#fn:1ef75fa3:cheese" id="rfn:1ef75fa3:cheese" rel="footnote">1</a></sup> — основная часть скрипта, которую выполняет <code>urllib.request</code>
        </li>
        <li>
          тесто — интерфейс, за который юзер будет «держать» скрипт
          <ul>
            <li><code>logging</code> для красивого вывода с таймстампами</li>
            <li><code>argparse</code> для ввода опций для «соуса»</li>
          </ul>
        </li>
      </ul>
      <div class="footnotes">
        <hr />
        <ol>
          <li id="fn:1ef75fa3:cheese" tabindex="-1">
            <p>или «мясо + сыр», или «протеин»…&nbsp;<a href="#rfn:1ef75fa3:cheese" rev="footnote">&#8617;&#xfe0e;</a></p>
          </li>
        </ol>
      </div>
    `
  );
});

test("footnote in teaser", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        # footnote in teaser

        ![](/media/img.png)

        _aka "The Hard Part"[^1]_

        [^1]: image from somewhere

        ${Array.from(
          { length: 50 },
          () => "lorem ipsum something something"
        ).join("\n\n")}
      `),
      id: "6c42981d",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.longread.teaser,
    `
      <p><img src="https://example.com/media/img.png" alt="" /></p>

      <p><em>aka "The Hard Part"</em></p>
    `
  );

  t.equal(result.longread.more, "208 слов");

  t.equal(result.opengraph.description, `aka "The Hard Part"`);

  t.ok(
    result.html.includes(
      `<sup><a href="#fn:6c42981d:1" id="rfn:6c42981d:1" rel="footnote">1</a></sup>`
    )
  );
  t.ok(result.html.includes(`<li id="fn:6c42981d:1" tabindex="-1">`));
  t.ok(result.html.includes(`image from somewhere`));
});

test("inline footnote in teaser", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
        # inline footnote in teaser

        ![](/media/picture.png)

        _easier part[^hello world]_

        ${Array.from(
          { length: 50 },
          () => "lorem ipsum something something"
        ).join("\n\n")}
      `),
      id: "83674bc3",
      created: +new Date(),
    },
    mockEmbedsLoader
  );

  t.equalHtml(
    result.longread.teaser,
    `
      <p><img src="https://example.com/media/picture.png" alt="" /></p>

      <p><em>easier part</em></p>
    `
  );

  t.equal(result.longread.more, "204 слова");

  t.equal(result.opengraph.description, "easier part");

  t.ok(
    result.html.includes(
      `<sup><a href="#fn:83674bc3:1" id="rfn:83674bc3:1" rel="footnote">1</a></sup>`
    )
  );
  t.ok(result.html.includes(`<li id="fn:83674bc3:1" tabindex="-1">`));
  t.ok(result.html.includes(`hello world`));
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
        <li><img src="https://example.com/media/one.png" alt="" ></li>
        <li><img src="https://example.com/media/two.png" alt="" ></li>
      </ul>

      <p><em>some description</em></p>
    `
  );
  t.equal(result.longread.more, "202 слова");
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
        autoplay muted loop disableRemotePlayback
      ></video></p>

      <p><em>some description</em></p>
    `
  );

  t.equal(result.longread.more, "202 слова");
});

test("media", async (t) => {
  const EmbedsLoader = require("../../embeds-loader.js");
  const embedsLoader = new EmbedsLoader(await getTestDB());

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
    embedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p><video
        playsinline
        src="https://example.com/media/w/gifv.mp4"
        title="gif &gt;_&lt;"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/y.pdf">
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%204px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Csvg%20x%3D%2260.8%22%20y%3D%2210%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2238.4px%22%20height%3D%2251.2px%22%20viewBox%3D%220%200%20384%20512%22%3E%0A%3Cpath%20fill%3D%22%2300a500%22%20d%3D%22M181.9%20256.1c-5-16-4.9-46.9-2-46.9%208.4%200%207.6%2036.9%202%2046.9zm-1.7%2047.2c-7.7%2020.2-17.3%2043.3-28.4%2062.7%2018.3-7%2039-17.2%2062.9-21.9-12.7-9.6-24.9-23.4-34.5-40.8zM86.1%20428.1c0%20.8%2013.2-5.4%2034.9-40.2-6.7%206.3-29.1%2024.5-34.9%2040.2zM248%20160h136v328c0%2013.3-10.7%2024-24%2024H24c-13.3%200-24-10.7-24-24V24C0%2010.7%2010.7%200%2024%200h200v136c0%2013.2%2010.8%2024%2024%2024zm-8%20171.8c-20-12.2-33.3-29-42.7-53.8%204.5-18.5%2011.6-46.6%206.2-64.2-4.7-29.4-42.4-26.5-47.8-6.8-5%2018.3-.4%2044.1%208.1%2077-11.6%2027.6-28.7%2064.6-40.8%2085.8-.1%200-.1.1-.2.1-27.1%2013.9-73.6%2044.5-54.5%2068%205.6%206.9%2016%2010%2021.5%2010%2017.9%200%2035.7-18%2061.1-61.8%2025.8-8.5%2054.1-19.1%2079-23.2%2021.7%2011.8%2047.1%2019.5%2064%2019.5%2029.2%200%2031.2-32%2019.7-43.4-13.9-13.6-54.3-9.7-73.6-7.2zM377%20105L279%207c-4.5-4.5-10.6-7-17-7h-6v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-74.1%20255.3c4.1-2.7-2.5-11.9-42.8-9%2037.1%2015.8%2042.8%209%2042.8%209z%22%3E%3C%2Fpath%3E%0A%3C%2Fsvg%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%0A%3Ctspan%20x%3D%2280%22%20dy%3D%2280%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3E%0Ahttps%3A%2F%2Fexample.com%2Fmedia%2Fy.pdf%0A%3C%2Ftspan%3E%0A%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          />
        </a>
      </p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/z.pdf">
          <img src="https://example.com/media/z/fit700.png" />
        </a>
      </p>
      <p>
        <figure class="card">
          <a href="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+" class="future-frame" data-src="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+" data-width="720" data-height="405">
            <img alt="time-stamp" src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPGJvZHkgb25sb2FkPSIoYT0%2Be%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E2xldCBiLGM9Xz0%2Be2Eud2lkdG%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Eg9ZS5jbGllbnRXaWR0aCxiPWE%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EuZ2V0Q29udGV4dCgnMmQnKSxi%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3ELmZvbnQ9JzQ4cHggTWVubG8nf%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A" />
          </a>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
    `
  );

  t.equalHtml(
    result.rss.html,
    `
      <p><video
        playsinline
        src="https://example.com/media/w/gifv.mp4"
        title="gif &gt;_&lt;"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/y.pdf">
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%204px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Csvg%20x%3D%2260.8%22%20y%3D%2210%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2238.4px%22%20height%3D%2251.2px%22%20viewBox%3D%220%200%20384%20512%22%3E%0A%3Cpath%20fill%3D%22%2300a500%22%20d%3D%22M181.9%20256.1c-5-16-4.9-46.9-2-46.9%208.4%200%207.6%2036.9%202%2046.9zm-1.7%2047.2c-7.7%2020.2-17.3%2043.3-28.4%2062.7%2018.3-7%2039-17.2%2062.9-21.9-12.7-9.6-24.9-23.4-34.5-40.8zM86.1%20428.1c0%20.8%2013.2-5.4%2034.9-40.2-6.7%206.3-29.1%2024.5-34.9%2040.2zM248%20160h136v328c0%2013.3-10.7%2024-24%2024H24c-13.3%200-24-10.7-24-24V24C0%2010.7%2010.7%200%2024%200h200v136c0%2013.2%2010.8%2024%2024%2024zm-8%20171.8c-20-12.2-33.3-29-42.7-53.8%204.5-18.5%2011.6-46.6%206.2-64.2-4.7-29.4-42.4-26.5-47.8-6.8-5%2018.3-.4%2044.1%208.1%2077-11.6%2027.6-28.7%2064.6-40.8%2085.8-.1%200-.1.1-.2.1-27.1%2013.9-73.6%2044.5-54.5%2068%205.6%206.9%2016%2010%2021.5%2010%2017.9%200%2035.7-18%2061.1-61.8%2025.8-8.5%2054.1-19.1%2079-23.2%2021.7%2011.8%2047.1%2019.5%2064%2019.5%2029.2%200%2031.2-32%2019.7-43.4-13.9-13.6-54.3-9.7-73.6-7.2zM377%20105L279%207c-4.5-4.5-10.6-7-17-7h-6v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-74.1%20255.3c4.1-2.7-2.5-11.9-42.8-9%2037.1%2015.8%2042.8%209%2042.8%209z%22%3E%3C%2Fpath%3E%0A%3C%2Fsvg%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%0A%3Ctspan%20x%3D%2280%22%20dy%3D%2280%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3E%0Ahttps%3A%2F%2Fexample.com%2Fmedia%2Fy.pdf%0A%3C%2Ftspan%3E%0A%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          />
        </a>
      </p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/z.pdf">
          <img src="https://example.com/media/z/fit700.png" />
        </a>
      </p>
      <p>
        <figure class="card">
          <iframe src="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0+e2xldCBiLGM9Xz0+e2Eud2lkdGg9ZS5jbGllbnRXaWR0aCxiPWEuZ2V0Q29udGV4dCgnMmQnKSxiLmZvbnQ9JzQ4cHggTWVubG8nfSxkPShnLGgsaixrPTYsbD00NCk9PntiLmZpbGxTdHlsZT0nIzBhMCcsYi5maWxsUmVjdCgwLDAsYS53aWR0aCxhLmhlaWdodCksYi5maWxsU3R5bGU9JyNmZmYnO2ZvcihoIG9mIGcuc3BsaXQoJyAnKSlqPTI4LjkqaC5sZW5ndGgsNjxrJiZrK2o+PWEud2lkdGgmJihrPTYsbCs9NDgpLGIuZmlsbFRleHQoaCxrLGwpLGsrPWorMjguOTttLnNyYz1hLnRvRGF0YVVSTCgpfSxmPV89PmQoaS52YWx1ZXx8bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1wuXGQrLywnJykpOyhvbnJlc2l6ZT1fPT5mKGMoKSkpKCksc2V0SW50ZXJ2YWwoaS5vbmlucHV0PWYsMWUzKX0pKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKSI+PGlucHV0IGlkPWkgcGxhY2Vob2xkZXI9bGFiZWw+PGltZyBpZD1tPjxwIGlkPWU+" frameborder="0" width="720" height="405" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen="1"></iframe>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
    `
  );
});

test("embed code block", async (t) => {
  const EmbedsLoader = require("../../embeds-loader.js");
  const embedsLoader = new EmbedsLoader(await getTestDB());

  const result = await prepare(
    {
      text: dedent(`
          \`\`\`embed
          /media/w/gifv.mp4
          \`\`\`

          \`\`\`embed
          /media/x/gifv.mp4
            poster: /media/x/fit1000.png
          \`\`\`

          \`\`\`embed
          /media/y.pdf
          \`\`\`

          \`\`\`embed
          /media/z.pdf
            poster: /media/z/fit700.png
          \`\`\`

          \`\`\`embed
          data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0
          \`\`\`

          \`\`\`embed
          data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0
          - title: time-stamp
          \`\`\`
        `),
      id: "8d830862",
      created: +new Date(),
    },
    embedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p><video
        playsinline
        src="https://example.com/media/w/gifv.mp4"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/y.pdf">
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%204px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Csvg%20x%3D%2260.8%22%20y%3D%2210%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2238.4px%22%20height%3D%2251.2px%22%20viewBox%3D%220%200%20384%20512%22%3E%0A%3Cpath%20fill%3D%22%2300a500%22%20d%3D%22M181.9%20256.1c-5-16-4.9-46.9-2-46.9%208.4%200%207.6%2036.9%202%2046.9zm-1.7%2047.2c-7.7%2020.2-17.3%2043.3-28.4%2062.7%2018.3-7%2039-17.2%2062.9-21.9-12.7-9.6-24.9-23.4-34.5-40.8zM86.1%20428.1c0%20.8%2013.2-5.4%2034.9-40.2-6.7%206.3-29.1%2024.5-34.9%2040.2zM248%20160h136v328c0%2013.3-10.7%2024-24%2024H24c-13.3%200-24-10.7-24-24V24C0%2010.7%2010.7%200%2024%200h200v136c0%2013.2%2010.8%2024%2024%2024zm-8%20171.8c-20-12.2-33.3-29-42.7-53.8%204.5-18.5%2011.6-46.6%206.2-64.2-4.7-29.4-42.4-26.5-47.8-6.8-5%2018.3-.4%2044.1%208.1%2077-11.6%2027.6-28.7%2064.6-40.8%2085.8-.1%200-.1.1-.2.1-27.1%2013.9-73.6%2044.5-54.5%2068%205.6%206.9%2016%2010%2021.5%2010%2017.9%200%2035.7-18%2061.1-61.8%2025.8-8.5%2054.1-19.1%2079-23.2%2021.7%2011.8%2047.1%2019.5%2064%2019.5%2029.2%200%2031.2-32%2019.7-43.4-13.9-13.6-54.3-9.7-73.6-7.2zM377%20105L279%207c-4.5-4.5-10.6-7-17-7h-6v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-74.1%20255.3c4.1-2.7-2.5-11.9-42.8-9%2037.1%2015.8%2042.8%209%2042.8%209z%22%3E%3C%2Fpath%3E%0A%3C%2Fsvg%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%0A%3Ctspan%20x%3D%2280%22%20dy%3D%2280%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3E%0Ahttps%3A%2F%2Fexample.com%2Fmedia%2Fy.pdf%0A%3C%2Ftspan%3E%0A%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          />
        </a>
      </p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/z.pdf">
          <img src="https://example.com/media/z/fit700.png" />
        </a>
      </p>
      <p>
        <figure class="card">
          <a href="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0" class="future-frame" data-src="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0" data-width="720" data-height="405">
            <img src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPGJvZHkgb25sb2FkPSIoYT0%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A" />
          </a>
        </figure>
      </p>
      <p>
        <figure class="card">
          <a href="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0" class="future-frame" data-src="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0" data-width="720" data-height="405">
            <img alt="time-stamp" src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPGJvZHkgb25sb2FkPSIoYT0%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A" />
          </a>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
    `
  );

  t.equalHtml(
    result.rss.html,
    `
      <p><video
        playsinline
        src="https://example.com/media/w/gifv.mp4"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p><video
        playsinline
        src="https://example.com/media/x/gifv.mp4"
        poster="https://example.com/media/x/fit1000.png"
        autoplay muted loop disableRemotePlayback
      ></video></p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/y.pdf">
          <img
            src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%204px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Csvg%20x%3D%2260.8%22%20y%3D%2210%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2238.4px%22%20height%3D%2251.2px%22%20viewBox%3D%220%200%20384%20512%22%3E%0A%3Cpath%20fill%3D%22%2300a500%22%20d%3D%22M181.9%20256.1c-5-16-4.9-46.9-2-46.9%208.4%200%207.6%2036.9%202%2046.9zm-1.7%2047.2c-7.7%2020.2-17.3%2043.3-28.4%2062.7%2018.3-7%2039-17.2%2062.9-21.9-12.7-9.6-24.9-23.4-34.5-40.8zM86.1%20428.1c0%20.8%2013.2-5.4%2034.9-40.2-6.7%206.3-29.1%2024.5-34.9%2040.2zM248%20160h136v328c0%2013.3-10.7%2024-24%2024H24c-13.3%200-24-10.7-24-24V24C0%2010.7%2010.7%200%2024%200h200v136c0%2013.2%2010.8%2024%2024%2024zm-8%20171.8c-20-12.2-33.3-29-42.7-53.8%204.5-18.5%2011.6-46.6%206.2-64.2-4.7-29.4-42.4-26.5-47.8-6.8-5%2018.3-.4%2044.1%208.1%2077-11.6%2027.6-28.7%2064.6-40.8%2085.8-.1%200-.1.1-.2.1-27.1%2013.9-73.6%2044.5-54.5%2068%205.6%206.9%2016%2010%2021.5%2010%2017.9%200%2035.7-18%2061.1-61.8%2025.8-8.5%2054.1-19.1%2079-23.2%2021.7%2011.8%2047.1%2019.5%2064%2019.5%2029.2%200%2031.2-32%2019.7-43.4-13.9-13.6-54.3-9.7-73.6-7.2zM377%20105L279%207c-4.5-4.5-10.6-7-17-7h-6v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-74.1%20255.3c4.1-2.7-2.5-11.9-42.8-9%2037.1%2015.8%2042.8%209%2042.8%209z%22%3E%3C%2Fpath%3E%0A%3C%2Fsvg%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%0A%3Ctspan%20x%3D%2280%22%20dy%3D%2280%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3E%0Ahttps%3A%2F%2Fexample.com%2Fmedia%2Fy.pdf%0A%3C%2Ftspan%3E%0A%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A"
          />
        </a>
      </p>
      <p>
        <a class="embedded-pdf" href="https://example.com/media/z.pdf">
          <img src="https://example.com/media/z/fit700.png" />
        </a>
      </p>
      <p>
        <figure class="card">
          <iframe src="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0" frameborder="0" width="720" height="405" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen="1" ></iframe>
        </figure>
      </p>
      <p>
        <figure class="card">
          <iframe src="data:text/html;base64,PGJvZHkgb25sb2FkPSIoYT0" frameborder="0" width="720" height="405" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen="1" ></iframe>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
    `
  );
});

test("embed code block (image gallery)", async (t) => {
  const EmbedsLoader = require("../../embeds-loader.js");
  const embedsLoader = new EmbedsLoader(await getTestDB());

  const result = await prepare(
    {
      text: dedent(`
        \`\`\`embed
        /media/x.png
        - poster: /media/x/fit700.png
        - description: something

        /media/a.png
        - poster: /media/a/fit700.png
        - description: else
        \`\`\`
      `),
      id: "9e540796",
      created: +new Date(),
    },
    embedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <ul data-gallery style="list-style:none;padding:0">
        <li><figure class="card">
          <a href="https://example.com/media/x.png">
            <img src="https://example.com/media/x/fit700.png" />
          </a>

          <figcaption>
            <i> something </i>
          </figcaption>
        </figure></li>
        <li><figure class="card">
          <a href="https://example.com/media/a.png">
            <img src="https://example.com/media/a/fit700.png" />
          </a>

          <figcaption>
            <i> else </i>
          </figcaption>
        </figure></li>
      </ul>
    `
  );
});

test("embed-html code block", async (t) => {
  const EmbedsLoader = require("../../embeds-loader.js");
  const embedsLoader = new EmbedsLoader(await getTestDB());

  const result = await prepare(
    {
      text: dedent(`
          \`\`\`embed-html
          <title>time-stamp</title>
          <meta property="og:image" content="/media/t.png">
          <p>hello world</p>
          \`\`\`

          \`\`\`embed-html
          <title>time-stamp</title>
          <p>hello world</p>
          \`\`\`
        `),
      id: "74244a20",
      created: +new Date(),
    },
    embedsLoader
  );

  t.equalHtml(
    result.html,
    `
      <p>
        <figure class="card">
          <a href="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2UiIGNvbnRlbnQ9Ii9tZWRpYS90LnBuZyI+CjxwPmhlbGxvIHdvcmxkPC9wPg==" class="future-frame" data-src="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2UiIGNvbnRlbnQ9Ii9tZWRpYS90LnBuZyI+CjxwPmhlbGxvIHdvcmxkPC9wPg==" data-width="720" data-height="405">
            <img alt="time-stamp" src="/media/t.png" />
          </a>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
      <p>
        <figure class="card">
          <a href="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8cD5oZWxsbyB3b3JsZDwvcD4=" class="future-frame" data-src="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8cD5oZWxsbyB3b3JsZDwvcD4=" data-width="720" data-height="405">
            <img alt="time-stamp" src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPHRpdGxlPnRpbWUtc3RhbXA8L%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E3RpdGxlPgo8cD5oZWxsbyB3b3%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EJsZDwvcD4%3D%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A" />
          </a>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
    `
  );

  t.equalHtml(
    result.rss.html,
    `
      <p>
        <figure class="card">
          <iframe src="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2UiIGNvbnRlbnQ9Ii9tZWRpYS90LnBuZyI+CjxwPmhlbGxvIHdvcmxkPC9wPg==" frameborder="0" width="720" height="405" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen="1" ></iframe>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
      <p>
        <figure class="card">
          <iframe src="data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8cD5oZWxsbyB3b3JsZDwvcD4=" frameborder="0" width="720" height="405" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen="1" ></iframe>

          <figcaption>time-stamp<br /></figcaption>
        </figure>
      </p>
    `
  );
});

test("embed-html code block (mock embedsLoader)", async (t) => {
  const result = await prepare(
    {
      text: dedent(`
          \`\`\`embed-html
          <title>time-stamp</title>
          <meta property="og:image" content="/media/t.png">
          <p>hello world</p>
          \`\`\`

          \`\`\`embed-html
          <title>time-stamp</title>
          <p>hello world</p>
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
      <p><x-embed>{"href":"data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2UiIGNvbnRlbnQ9Ii9tZWRpYS90LnBuZyI+CjxwPmhlbGxvIHdvcmxkPC9wPg==","title":"time-stamp","poster":"/media/t.png","mimetype":"text/html"}</x-embed></p>
      <p><x-embed>{"href":"data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8cD5oZWxsbyB3b3JsZDwvcD4=","title":"time-stamp","poster":"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPHRpdGxlPnRpbWUtc3RhbXA8L%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E3RpdGxlPgo8cD5oZWxsbyB3b3%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EJsZDwvcD4%3D%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A","mimetype":"text/html"}</x-embed></p>
    `
  );

  t.equalHtml(
    result.rss.html,
    `
      <p><x-embed>{"href":"data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8bWV0YSBwcm9wZXJ0eT0ib2c6aW1hZ2UiIGNvbnRlbnQ9Ii9tZWRpYS90LnBuZyI+CjxwPmhlbGxvIHdvcmxkPC9wPg==","title":"time-stamp","poster":"/media/t.png","mimetype":"text/html"}</x-embed></p>
      <p><x-embed>{"href":"data:text/html;base64,PHRpdGxlPnRpbWUtc3RhbXA8L3RpdGxlPgo8cD5oZWxsbyB3b3JsZDwvcD4=","title":"time-stamp","poster":"data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20160%2090%22%3E%0A%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%0Atext%20%7B%0Afont-size%3A%2011px%3B%0Afont-family%3A%20%22SF%20Mono%22%2C%20%22Menlo-Regular%22%2C%20Consolas%2C%20%22Andale%20Mono%20WT%22%2C%0A%22Andale%20Mono%22%2C%20%22Lucida%20Console%22%2C%20%22Lucida%20Sans%20Typewriter%22%2C%0A%22DejaVu%20Sans%20Mono%22%2C%20%22Bitstream%20Vera%20Sans%20Mono%22%2C%20%22Liberation%20Mono%22%2C%0A%22Nimbus%20Mono%20L%22%2C%20Monaco%2C%20%22Courier%20New%22%2C%20Courier%2C%20monospace%3B%0A%7D%0A%3C%2Fstyle%3E%3C%2Fdefs%3E%0A%3Crect%20x%3D%220%22%20y%3D%220%22%20height%3D%2290%22%20width%3D%22160%22%20fill%3D%22white%22%20%2F%3E%0A%3Ctext%20x%3D%220%22%20y%3D%220%22%20fill%3D%22%23888%22%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3Edata%3Atext%2Fhtml%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EPHRpdGxlPnRpbWUtc3RhbXA8L%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3E3RpdGxlPgo8cD5oZWxsbyB3b3%3C%2Ftspan%3E%3Ctspan%20x%3D%2280%22%20dy%3D%2212%22%20fill%3D%22%2300a500%22%20text-anchor%3D%22middle%22%3Etime-stamp%3C%2Ftspan%3E%3Ctspan%20x%3D%220%22%20dy%3D%2212%22%3EJsZDwvcD4%3D%3C%2Ftspan%3E%3C%2Ftext%3E%0A%3C%2Fsvg%3E%0A","mimetype":"text/html"}</x-embed></p>
    `
  );
});

test("show embed in teaser", async (t) => {
  const EmbedsLoader = require("../../embeds-loader.js");
  t.mockery("request-promise-native", {
    head({ url }) {
      return {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
        request: {
          href: url,
        },
      };
    },
    get({ transform }) {
      return transform(
        fs.readFileSync(path.resolve(__dirname, "yt-rwm.html"), "utf8"),
        {
          "content-type": "text/html; charset=utf-8",
        }
      );
    },
    jar() {},
  });

  const embedsLoader = new EmbedsLoader(await getTestDB());

  const result = await prepare(
    {
      text: dedent(`
        # Усатый ядерщик

        \`\`\`embed
        https://www.youtube.com/watch?v=vEUylyDMFIA
        - poster: /media/jjxvmnCEDWrO9oSohxjhH68Pbc/fit1600.jpeg
        - title: React with mustaches
        - description: Are there good parts inside an abandoned project? What could we learn from it? Could we apply some patterns in our current projects?
        \`\`\`

        _Выковыривая полезные идеи из заброшенного модуля_

        > _Адаптировано из выступления “React with mustaches” на React Kyiv ([видео](https://youtu.be/vEUylyDMFIA) и [слайды](/media/7TZEn3OXO0kfBsTz213YNxhM4W.pdf))_

        Бывает так, что гоняешься не за тем, за чем стоило бы. В разработке, это зачастую выражается в странных решениях временных или надуманных проблем. Для таких решений пишется код, который либо никогда не увидит продакшена, либо довольно быстро будет удалён за ненадобностью

        ${Array.from(
          { length: 50 },
          () => "lorem ipsum something something"
        ).join("\n\n")}
      `),
      id: "2d95abd5",
      created: +new Date(),
    },
    embedsLoader
  );

  t.equalHtml(
    result.longread.teaser,
    `
      <p>
        <figure class="card">
          <a href="https://www.youtube.com/watch?v=vEUylyDMFIA" class="future-frame" data-src="https://www.youtube.com/embed/vEUylyDMFIA?autoplay=1" data-width="480" data-height="360" data-full-width>
            <img alt="React with mustaches" src="/media/jjxvmnCEDWrO9oSohxjhH68Pbc/fit1600.jpeg">
          </a>

          <figcaption>
            <a href="https://www.youtube.com/watch?v=vEUylyDMFIA"><b>React with mustaches</b> • YouTube<br></a>
              <i>
                Are there good parts inside an abandoned project? What could we learn from it? Could we apply some patterns in our current projects?
              </i>
          </figcaption>
        </figure>
      </p>
      <p><em>Выковыривая полезные идеи из заброшенного модуля</em></p>
    `
  );

  t.equal(result.longread.more, "286 слов");

  t.equal(
    result.opengraph.image,
    `https://example.com/media/jjxvmnCEDWrO9oSohxjhH68Pbc/fit1600.jpeg`
  );
});
