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

test("embed with custom poster", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("39bedb8d", ?1)
  `,
    {
      1: "![poster=https://some.example/firstframe.jpeg](https://some.example/video.mp4)",
    }
  );

  t.mockery("request-promise-native", {
    head() {
      return {
        "content-type": "video/mp4",
      };
    },
    jar() {},
  });

  const tmpFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await generate(db, tmpFolder, noopStream, noopStream);

  const post = await fs.promises.readFile(
    path.join(tmpFolder, "39bedb8d.html")
  );

  t.equalHtml(
    cheerio("article p", post.toString()).html(),
    `
      <video playsinline controls preload="metadata" poster="https://some.example/firstframe.jpeg" src="https://some.example/video.mp4"></video>
    `
  );
});
