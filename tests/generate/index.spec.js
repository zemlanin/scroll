const fs = require("fs");
const os = require("os");
const path = require("path");

const test = require("tape-promise/tape");
const sqlite = require("sqlite");
const mockery = require("mockery");

const noopStream = new require("stream").Writable({
  write(chunk, encoding, callback) {
    setImmediate(callback);
  }
});

mockery.enable({
  warnOnReplace: false,
  warnOnUnregistered: false,
  useCleanCache: true
});

mockery.registerMock("request-promise-native", {
  head: function() {
    return {
      "content-type": "text/html; charset=utf-8"
    };
  },
  get: function({ transform }) {
    return fs.promises
      .readFile(path.resolve(__dirname, "yt-rickroll.html"), "utf8")
      .then(body =>
        transform(body, {
          headers: {
            "content-type": "text/html; charset=utf-8"
          }
        })
      );
  }
});

const { generate } = require("../../generate.js");

test.onFinish(() => {
  mockery.disable();
  mockery.deregisterAll();
});

test("empty database", async t => {
  const db = await sqlite.open(":memory:");
  await db.migrate();

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  t.ok(true);

  t.end();
});

test("database with posts and embeds", async t => {
  const db = await sqlite.open(":memory:");
  await db.migrate();

  await db.run(`
    INSERT INTO posts
      (id, text)
    VALUES
      ("1", "lol"),
      ("2", "kek"),
      ("3", "# heading"),
      ("4", "![](/media/example.png)"),
      ("5", "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)");
  `);

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
    post3.indexOf(`<h1 id="heading"><a href="./3.html">heading</a></h1>`) > -1
  );

  const post4 = await fs.promises.readFile(path.join(tmpFolder, "4.html"));
  t.ok(
    post4.indexOf(`<img src="/media/example.png" alt="" loading="lazy" >`) > -1
  );

  const YTEmbed = `<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" class="future-frame" data-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-width="1280" data-height="720">
          <img src="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg">
      </a>`;
  const post5 = await fs.promises.readFile(path.join(tmpFolder, "5.html"));
  t.ok(post5.indexOf(YTEmbed) > -1);

  t.end();
});
