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

test("twitter without user image", async (t) => {
  const { db, asdb } = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("c696f1aa", ?1)
  `,
    {
      1: "![](https://twitter.com/zemlanin/status/1445493940254228481)",
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
          path.resolve(__dirname, "twitter-no-media.html"),
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

  await generate(db, asdb, tmpFolder, noopStream, noopStream);

  const post = await fs.promises.readFile(
    path.join(tmpFolder, "c696f1aa.html")
  );

  t.equalHtml(
    cheerio.load(post.toString())("article .card").html(),
    `
      <blockquote cite="https://twitter.com/zemlanin/status/1445493940254228481">
        Twitter stopped including \`og:video\` tags for tweets with videos, while not counting thumbnails as \`og:image:user_generated\`. Which is *just great*<br /><br />(and totally uninteresting for anybody but me)
      </blockquote>
      <a href="https://twitter.com/zemlanin/status/1445493940254228481"> </a>

      <figcaption>
        <a href="https://twitter.com/zemlanin/status/1445493940254228481"><b>Anton Verinov on Twitter</b><br /></a>
      </figcaption>
    `
  );
});

test("twitter with a photo", async (t) => {
  const { db, asdb } = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("79b46c30", ?1)
  `,
    {
      1: "![](https://twitter.com/zemlanin/status/1322221511776886784)",
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
        fs.readFileSync(path.resolve(__dirname, "twitter-photo.html"), "utf8"),
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

  await generate(db, asdb, tmpFolder, noopStream, noopStream);

  const post = await fs.promises.readFile(
    path.join(tmpFolder, "79b46c30.html")
  );

  t.equalHtml(
    cheerio.load(post.toString())("article .card").html(),
    `
      <a href="https://twitter.com/zemlanin/status/1322221511776886784">
        <img alt="Anton Verinov on Twitter" src="https://pbs.twimg.com/media/Ell5c5LXYAIR0ZK.jpg:large" />
      </a>

      <figcaption>
        <a href="https://twitter.com/zemlanin/status/1322221511776886784"><b>Anton Verinov on Twitter</b><br /></a>
        <i> COVID NUMBERS • JS </i>
      </figcaption>
    `
  );
});

test("twitter with a video", async (t) => {
  const { db, asdb } = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("793877ab", ?1)
  `,
    {
      1: "![](https://twitter.com/zemlanin/status/1317458198153015303)",
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
        fs.readFileSync(path.resolve(__dirname, "twitter-video.html"), "utf8"),
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

  await generate(db, asdb, tmpFolder, noopStream, noopStream);

  const post = await fs.promises.readFile(
    path.join(tmpFolder, "793877ab.html")
  );

  t.equalHtml(
    cheerio.load(post.toString())("article .card").html(),
    `
      <a href="https://twitter.com/zemlanin/status/1317458198153015303">
        <img alt="Anton Verinov on Twitter" src="https://pbs.twimg.com/ext_tw_video_thumb/1317458177013796864/pu/img/R34fXJahvnaWxFPD.jpg" />
      </a>

      <figcaption>
        <a href="https://twitter.com/zemlanin/status/1317458198153015303"><b>Anton Verinov on Twitter</b><br /></a>\n  <i> A E S T E T I C S • J S <a href="https://t.co/02Fhormr22">https://t.co/02Fhormr22</a> </i>
      </figcaption>
    `
  );
});
