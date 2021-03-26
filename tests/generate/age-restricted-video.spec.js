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

test("age restricted youtube embed", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("e516ad18", ?1)
  `,
    {
      1: "![](https://www.youtube.com/watch?v=Z1EbSXxrZ34)",
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
        fs.readFileSync(
          path.resolve(__dirname, "yt-age-restricted.html"),
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
    path.join(tmpFolder, "e516ad18.html")
  );

  t.equalHtml(
    cheerio("article .card", post.toString()).html(),
    `
      <a href="https://www.youtube.com/watch?v=Z1EbSXxrZ34">
        <img alt="The Suicide Squad - August 2021" width="1280" height="720" src="https://i.ytimg.com/vi/Z1EbSXxrZ34/maxresdefault.jpg" />
      </a>

      <figcaption>
        <a href="https://www.youtube.com/watch?v=Z1EbSXxrZ34"><b>The Suicide Squad - August 2021</b> • YouTube<br /></a>
        <i class="truncated"> From writer/director James Gunn comes Warner Bros. Pictures’ superhero action adventure “The Suicide Squad,” featuring a collection of the most degenerate de... </i>
      </figcaption>
    `
  );
});
