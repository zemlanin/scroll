const fs = require("fs");
const os = require("os");
const path = require("path");

const test = require("tape-promise/tape");
const cheerio = require("cheerio");

const { getTestDB } = require("../db.js");
require("../equal-html.js");
require("../tape-mockery.js");

const { generate } = require("../../generate.js");

const noopStream = new require("stream").Writable({
  write(chunk, encoding, callback) {
    setImmediate(callback);
  },
});

test("spotify embed with <audio>", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("7a61432d", ?1)
  `,
    {
      1: "![](https://open.spotify.example/track/7uFERMScrK0arLmw4zHLS6)",
    }
  );

  t.mockery("request-promise-native", {
    head() {
      return {
        "content-type": "text/html; charset=utf-8",
      };
    },
    get({ transform }) {
      return transform(
        fs.readFileSync(path.resolve(__dirname, "spotify-song.html"), "utf8"),
        {
          "content-type": "text/html; charset=utf-8",
        }
      );
    },
    jar() {},
  });

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  const post = await fs.promises.readFile(
    path.join(tmpFolder, "7a61432d.html")
  );

  t.equalHtml(
    cheerio("article .card", post.toString()).html(),
    `
      <img class="audio-control" data-src="https://p.scdn.co/mp3-preview/8181e65039260f4842d825e19fa98c0ed0dcc332?cid=162b7dc01f3a4a2ca32ed3cec83d1e02&amp;utm_medium=facebook" alt=".getawayfortheweekend." src="https://i.scdn.co/image/ab67616d0000b273d6d1706ce469749028db3af5" />

      <audio controls="" preload="metadata" src="https://p.scdn.co/mp3-preview/8181e65039260f4842d825e19fa98c0ed0dcc332?cid=162b7dc01f3a4a2ca32ed3cec83d1e02&amp;utm_medium=facebook"></audio>

      <figcaption>
        <a href="https://open.spotify.com/track/7uFERMScrK0arLmw4zHLS6"><b>.getawayfortheweekend.</b> • Spotify<br /></a>
        <i class="truncated"> Dead Poet Society · Song · 2021 </i>
      </figcaption>
    `
  );
});
