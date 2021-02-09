const fs = require("fs");
const os = require("os");
const path = require("path");

const test = require("tape-promise/tape");
const mockery = require("mockery");
const cheerio = require("cheerio");

const { getTestDB } = require("../db.js");
require("../equal-html.js");

const noopStream = new require("stream").Writable({
  write(chunk, encoding, callback) {
    setImmediate(callback);
  },
});

mockery.enable({
  warnOnReplace: false,
  warnOnUnregistered: false,
});

mockery.registerMock("request-promise-native", {
  head: function () {
    return {
      "content-type": "text/html; charset=utf-8",
    };
  },
  get: function ({ transform }) {
    return fs.promises
      .readFile(path.resolve(__dirname, "yt-rickroll.html"), "utf8")
      .then((body) =>
        transform(body, {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        })
      );
  },
  jar: () => {},
});

const { generate } = require("../../generate.js");

test.onFinish(() => {
  mockery.disable();
  mockery.deregisterAll();
});

test("empty database", async (t) => {
  const db = await getTestDB();

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  t.ok(true);
});

test("internal page", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, slug, internal, text)
    VALUES
      ("1", "internal", 1, "# internal\n\nsomething something");
  `
  );

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  t.rejects(
    () => fs.promises.readFile(path.join(tmpFolder, "1.html")),
    "should not create {id}.html"
  );

  const internalPage = (
    await fs.promises.readFile(path.join(tmpFolder, "internal.html"))
  ).toString();

  t.ok(
    internalPage.indexOf(`<h1 id="internal">internal</h1>`) > -1,
    internalPage.split("\n").find((line) => line.indexOf("<h1") > -1) ||
      internalPage.match(/<article>([\s\S]+)<\/article>/i)[1].trim()
  );
  t.ok(
    internalPage.indexOf(`<time`) === -1,
    internalPage.split("\n").find((line) => line.indexOf("<time") > -1) ||
      "no <time>"
  );
  t.ok(
    internalPage.indexOf(`/1.html`) === -1,
    internalPage.split("\n").find((line) => line.indexOf("/1.html") > -1) ||
      "no self urls (id)"
  );
  t.ok(
    internalPage.indexOf(`/internal.html`) === -1,
    internalPage
      .split("\n")
      .find((line) => line.indexOf("/internal.html") > -1) ||
      "no self urls (slug)"
  );
  t.ok(
    internalPage.indexOf(`og:url`) === -1,
    internalPage.split("\n").find((line) => line.indexOf("og:url") > -1) ||
      "no opengraph"
  );
});

test("database with posts and embeds", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("1", "lol"),
      ("2", "kek"),
      ("3", "# heading"),
      ("4", "![](/media/example.png)"),
      ("5", "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)"),
      ("6", ?6),
      ("7", ?7),
      ("8", ?8),
      ("9", ?9);
  `,
    {
      6: 'post with footnote [^1][]\n\n[^1]:. "footnote _text_"',
      7: '# titled\n\npost with title and footnote [^1][]\n\n[^1]:. "[text](https://example.net)"',
      8: 'post with named footnote [^name][]\n\n[^name]:. "**fn text**"',
      9: "# gallery\n\n* ![](/media/1.jpg)\n* ![](/media/2.jpg)\n* ![](/media/3.jpg)",
    }
  );

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  const post1 = await fs.promises.readFile(path.join(tmpFolder, "1.html"));
  t.ok(post1.indexOf("lol") > -1);

  const post2 = await fs.promises.readFile(path.join(tmpFolder, "2.html"));
  t.ok(post2.indexOf("kek") > -1);

  const post3 = await fs.promises.readFile(path.join(tmpFolder, "3.html"));
  t.ok(
    post3.indexOf(
      `<h1 id="heading"><a href="https://example.com/3.html">heading</a></h1>`
    ) > -1
  );

  const post4 = await fs.promises.readFile(path.join(tmpFolder, "4.html"));
  t.ok(
    post4.indexOf(
      `<img src="https://example.com/media/example.png" alt="" loading="lazy" >`
    ) > -1
  );

  const YTEmbed = `<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" class="future-frame" data-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-width="1280" data-height="720">
          <img alt="Rick Astley - Never Gonna Give You Up (Video)" src="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg">
      </a>`;
  const post5 = (
    await fs.promises.readFile(path.join(tmpFolder, "5.html"))
  ).toString();
  t.ok(
    post5.indexOf(YTEmbed) > -1,
    post5.indexOf(YTEmbed) > -1
      ? YTEmbed.split("\n")[0]
      : post5.match(/<article>([\s\S]+)<\/article>/i)[1].trim()
  );

  const post6 = await fs.promises.readFile(path.join(tmpFolder, "6.html"));
  t.ok(
    post6.indexOf(
      `<p>post with footnote <sup><a href="#fn:6:1" id="rfn:6:1" rel="footnote">1</a></sup></p>`
    ) > -1
  );
  t.ok(
    post6.indexOf(
      `<div class="footnotes"><hr><ol><li id="fn:6:1" tabindex="-1"><p>footnote <em>text</em>&nbsp;<a href="#rfn:6:1" rev="footnote">&#8617;</a></p>`
    ) > -1
  );

  const post7 = (
    await fs.promises.readFile(path.join(tmpFolder, "7.html"))
  ).toString();
  t.ok(
    post7.indexOf(
      `<h1 id="titled"><a href="https://example.com/7.html">titled</a></h1>`
    ) > -1
  );
  t.ok(
    post7.indexOf(
      `<p>post with title and footnote <sup><a href="#fn:7:1" id="rfn:7:1" rel="footnote">1</a></sup></p>`
    ) > -1,
    post7.split("\n").find((line) => line.indexOf("<sup>") > -1)
  );
  t.ok(
    post7.indexOf(
      `<div class="footnotes"><hr><ol><li id="fn:7:1" tabindex="-1"><p><a href="https://example.net">text</a>&nbsp;<a href="#rfn:7:1" rev="footnote">&#8617;</a></p>`
    ) > -1
  );

  const post8 = (
    await fs.promises.readFile(path.join(tmpFolder, "8.html"))
  ).toString();
  t.ok(
    post8.indexOf(`</h1>`) === -1,
    post8.split("\n").find((line) => line.indexOf("</h1>") > -1) || "no <h1>"
  );
  t.ok(
    post8.indexOf(
      `<p>post with named footnote <sup><a href="#fn:8:name" id="rfn:8:name" rel="footnote">1</a></sup></p>`
    ) > -1,
    post8.split("\n").find((line) => line.indexOf("<sup>") > -1)
  );
  t.ok(
    post8.indexOf(
      `<div class="footnotes"><hr><ol><li id="fn:8:name" tabindex="-1"><p><strong>fn text</strong>&nbsp;<a href="#rfn:8:name" rev="footnote">&#8617;</a></p>`
    ) > -1,
    post8
      .split("\n")
      .find((line) => line.indexOf('<div class="footnotes">') > -1)
  );

  const post9 = (
    await fs.promises.readFile(path.join(tmpFolder, "9.html"))
  ).toString();
  t.ok(
    post9.indexOf(`<ul data-gallery`) > -1,
    post9.split("\n").find((line) => line.indexOf("<ul data-gallery") > -1) ||
      post9.match(/<article>([\s\S]+)<\/article>/i)[1].trim()
  );
});

test("database with patched embeds", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("patched-10", ?10),
      ("patched-11", ?11);
  `,
    {
      10: "```embed\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n```",
      11: "```embed\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n  poster: https://youtube.example/media/rickroll.jpg\n```",
    }
  );

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  const post10 = (
    await fs.promises.readFile(path.join(tmpFolder, "patched-10.html"))
  ).toString();
  t.equalHtml(
    cheerio(".card", post10).html(),
    `
      <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" class="future-frame" data-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-width="1280" data-height="720">
        <img
          alt="Rick Astley - Never Gonna Give You Up (Video)"
          src="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
        />
      </a>

      <figcaption>
        <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"><b>Rick Astley - Never Gonna Give You Up (Video)</b> • YouTube<br /></a>
        <i class="truncated">Rick Astley - Never Gonna Give You Up (Official Video) - Listen On Spotify: http://smarturl.it/AstleySpotify Learn more about the brand new album ‘Beautiful ...</i>
      </figcaption>
    `
  );

  const post11 = (
    await fs.promises.readFile(path.join(tmpFolder, "patched-11.html"))
  ).toString();
  t.equalHtml(
    cheerio(".card", post11).html(),
    `
      <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" class="future-frame" data-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-width="1280" data-height="720">
        <img
          alt="Rick Astley - Never Gonna Give You Up (Video)"
          src="https://youtube.example/media/rickroll.jpg"
        />
      </a>

      <figcaption>
        <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"><b>Rick Astley - Never Gonna Give You Up (Video)</b> • YouTube<br /></a>
        <i class="truncated">Rick Astley - Never Gonna Give You Up (Official Video) - Listen On Spotify: http://smarturl.it/AstleySpotify Learn more about the brand new album ‘Beautiful ...</i>
      </figcaption>
    `
  );
});

test("opengraph", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, created, text)
    VALUES
      ("1", "2019-01-10T17:00:00+03:00", ?1),
      ("2", "2019-02-11T17:00:00+03:00", ?2),
      ("3", "2019-03-12T17:00:00+03:00", ?3),
      ("4", "2019-04-13T17:00:00+03:00", ?4),
      ("5", "2019-05-14T17:00:00+03:00", ?5),
      ("6", "2019-06-15T17:00:00+03:00", ?6),
      ("7", "2019-07-15T17:00:00+03:00", ?7),
      ("8", "2019-08-15T17:00:00+03:00", ?8),
      ("9", "2019-09-15T17:00:00+03:00", ?9),
      ("10", "2019-10-01T17:00:00+03:00", ?10),
      ("11", "2019-10-11T17:00:00+03:00", ?11);
  `,
    {
      1: "lorem ipsum",
      2: "# title\n\nlorem ipsum",
      3: "# img\n\n![](/something.png)\n\nlorem ipsum",
      4: "# embed\n\n![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\nsome text",
      5:
        "# with teaser\n\n_teaser text_\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      6:
        "# without teaser\n\nextra " +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      7:
        '# teaser with footnote\n\n![](/media/example.png)\n\n_post with title and footnote [^1][]_\n\n[^1]:. "[text](https://example.net)"\n\n' +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      8:
        "# teaser with gallery and description\n\n* ![](/media/one.png)\n* ![](/media/two.png)\n\n_some description_\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      9:
        "# teaser with gallery\n\n* ![](/media/uno.png)\n* ![](/media/dos.png)\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20) +
        "_italics in the end_",
      10:
        "# teaser with anchored image\n\n[![](/media/one.png)](https://example.com)\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
      11:
        "# teaser with image after second heading\n\n_text text [link](http://example.com)_\n\n" +
        "## TASBot\n\n![](/media/Lo0W4v7P9xFrZPblds6psIWMWb.jpg)\n\n" +
        ("lorem ".repeat(10) + "\n\n").repeat(20),
    }
  );

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  const post1 = await fs.promises.readFile(path.join(tmpFolder, "1.html"));
  t.ok(post1.indexOf(`<meta property="og:title" content="2019-01-10" />`) > -1);
  t.ok(post1.indexOf(`<meta property="og:description"`) === -1);
  t.ok(post1.indexOf(`<meta property="og:image"`) === -1);

  const post2 = await fs.promises.readFile(path.join(tmpFolder, "2.html"));
  t.ok(post2.indexOf(`<meta property="og:title" content="title" />`) > -1);
  t.ok(post2.indexOf(`<meta property="og:description"`) === -1);
  t.ok(post2.indexOf(`<meta property="og:image"`) === -1);

  const post3 = await fs.promises.readFile(path.join(tmpFolder, "3.html"));
  t.ok(post3.indexOf(`<meta property="og:title" content="img" />`) > -1);
  t.ok(post3.indexOf(`<meta property="og:description"`) === -1);
  t.ok(
    post3.indexOf(
      `<meta property="og:image" content="https://example.com/something.png" />`
    ) > -1
  );

  const post4 = await fs.promises.readFile(path.join(tmpFolder, "4.html"));
  t.ok(post4.indexOf(`<meta property="og:title" content="embed" />`) > -1);
  t.ok(post4.indexOf(`<meta property="og:description"`) === -1);
  t.ok(
    post4.indexOf(
      `<meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg" />`
    ) > -1
  );

  const post5 = await fs.promises.readFile(path.join(tmpFolder, "5.html"));
  t.ok(
    post5.indexOf(`<meta property="og:title" content="with teaser" />`) > -1
  );
  t.ok(post5.indexOf(`<meta property="og:image"`) === -1);
  t.ok(
    post5.indexOf(`<meta property="og:description" content="teaser text" />`) >
      -1
  );

  const post6 = await fs.promises.readFile(path.join(tmpFolder, "6.html"));
  t.ok(
    post6.indexOf(`<meta property="og:title" content="without teaser" />`) > -1
  );
  t.ok(post6.indexOf(`<meta property="og:image"`) === -1);
  t.ok(
    post6.indexOf(`<meta property="og:description" content="201 слово" />`) > -1
  );

  const post7 = (
    await fs.promises.readFile(path.join(tmpFolder, "7.html"))
  ).toString();
  t.ok(
    post7.indexOf(
      `<meta property="og:title" content="teaser with footnote" />`
    ) > -1,
    post7.split("\n").find((line) => line.indexOf("og:title") > -1)
  );
  t.ok(
    post7.indexOf(
      `<meta property="og:image" content="https://example.com/media/example.png" />`
    ) > -1,
    post7.split("\n").find((line) => line.indexOf("og:image") > -1)
  );
  t.ok(
    post7.indexOf(
      `<meta property="og:description" content="post with title and footnote" />`
    ) > -1,
    post7.split("\n").find((line) => line.indexOf("og:description") > -1)
  );

  const post8 = (
    await fs.promises.readFile(path.join(tmpFolder, "8.html"))
  ).toString();
  t.ok(
    post8.indexOf(
      `<meta property="og:title" content="teaser with gallery and description" />`
    ) > -1,
    post8.split("\n").find((line) => line.indexOf("og:title") > -1)
  );
  t.ok(
    post8.indexOf(
      `<meta property="og:image" content="https://example.com/media/one.png" />`
    ) > -1,
    post8.split("\n").find((line) => line.indexOf("og:image") > -1)
  );
  t.ok(
    post8.indexOf(
      `<meta property="og:description" content="some description" />`
    ) > -1,
    post8.split("\n").find((line) => line.indexOf("og:description") > -1)
  );

  const post9 = (
    await fs.promises.readFile(path.join(tmpFolder, "9.html"))
  ).toString();
  t.ok(
    post9.indexOf(
      `<meta property="og:title" content="teaser with gallery" />`
    ) > -1,
    post9.split("\n").find((line) => line.indexOf("og:title") > -1)
  );
  t.ok(
    post9.indexOf(
      `<meta property="og:image" content="https://example.com/media/uno.png" />`
    ) > -1,
    post9.split("\n").find((line) => line.indexOf("og:image") > -1)
  );
  t.ok(
    post9.indexOf(`<meta property="og:description" content="204 слова" />`) >
      -1,
    post9.split("\n").find((line) => line.indexOf("og:description") > -1)
  );

  const post10 = (
    await fs.promises.readFile(path.join(tmpFolder, "10.html"))
  ).toString();
  t.ok(
    post10.indexOf(
      `<meta property="og:title" content="teaser with anchored image" />`
    ) > -1,
    post10.split("\n").find((line) => line.indexOf("og:title") > -1)
  );
  t.ok(post10.indexOf(`<meta property="og:description"`) === -1);
  t.ok(
    post10.indexOf(
      `<meta property="og:image" content="https://example.com/media/one.png" />`
    ) > -1,
    post10.split("\n").find((line) => line.indexOf("og:image") > -1)
  );

  const post11 = (
    await fs.promises.readFile(path.join(tmpFolder, "11.html"))
  ).toString();
  t.ok(
    post11.indexOf(
      `<meta property="og:title" content="teaser with image after second heading" />`
    ) > -1,
    post11.split("\n").find((line) => line.indexOf("og:title") > -1)
  );
  t.ok(
    post11.indexOf(
      `<meta property="og:description" content="text text link" />`
    ) > -1,
    post11.split("\n").find((line) => line.indexOf("og:description") > -1)
  );
  t.ok(post11.indexOf(`<meta property="og:image"`) === -1);
});
