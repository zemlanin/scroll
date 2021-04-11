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

test("shopify product page with secure_url images", async (t) => {
  const db = await getTestDB();

  await db.run(
    `
    INSERT INTO posts
      (id, text)
    VALUES
      ("ae85f124", ?1)
  `,
    {
      1: "![](https://keymastergames.com/collections/our-games/products/control)",
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
          path.resolve(__dirname, "shopify-product-page.html"),
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
    path.join(tmpFolder, "ae85f124.html")
  );

  t.equalHtml(
    cheerio("article .card", post.toString()).html(),
    `
      <a href="https://keymastergames.com/products/control">
        <img alt="Control (2nd Edition)" src="https://cdn.shopify.com/s/files/1/1898/8501/products/Control_Front_1200x1200.jpg?v=1604682445" loading="lazy" />
      </a>

      <figcaption>
        <a href="https://keymastergames.com/products/control"><b>Control (2nd Edition)</b> • Keymaster Games<br /></a>
        <i class="truncated"> A Keymaster Games classic, upgraded to a second edition! In this easy-to-pick-up-and-play card game, you are a time traveler fighting to escape a rupture in spacetime. You must tactically refuel your time machine while stopping other players from refueling theirs first. Will you escape? 2-4 PlayersQuick, easy setupRou </i>
      </figcaption>
    `
  );
});
