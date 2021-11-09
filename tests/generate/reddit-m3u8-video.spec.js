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

test("reddit post page with m3u8 video", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("6ba5fbd5", ?1)
  `,
    {
      1: "![](https://www.reddit.com/r/ac_newhorizons/comments/qbcds8/my_farm_space_is_already_coming_together/)",
    }
  );

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
        fs.readFileSync(
          path.resolve(__dirname, "reddit-m3u8-video.html"),
          "utf8"
        ),
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
    path.join(tmpFolder, "6ba5fbd5.html")
  );

  t.equalHtml(
    cheerio.load(post.toString())("article .card").html(),
    `
      <video playsinline src="https://v.redd.it/ddvtu8tl0fu71/HLSPlaylist.m3u8?a=1639045123%2CNTk1Y2M3NGI3NzY4NjdlYzc0ODQ4OWI5ZTQwM2M3YWNjNzU1ZTRhMjk0M2RlZjU3ZjU1MGYzYzRkYWZlYTc4OQ%3D%3D&amp;v=1&amp;f=sd" controls="" preload="none" poster="https://external-preview.redd.it/CH0qoPnF963dQYG8wDyZsFOsLdLzoBq5fSGIWGOjpu8.png?format=pjpg&amp;auto=webp&amp;s=a6f20a068d82d68720161285624db4b546e73ff1"></video>

      <figcaption>
        <a href="https://www.reddit.com/r/ac_newhorizons/comments/qbcds8/my_farm_space_is_already_coming_together/"><b>r/ac_newhorizons - My farm space is already coming together🤗 Suggestions?</b> • reddit<br /></a>
        <i class="truncated"> 331 votes and 24 comments so far on Reddit </i>
      </figcaption>
    `
  );
});
