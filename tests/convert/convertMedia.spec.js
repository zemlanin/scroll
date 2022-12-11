const test = require("tape-promise/tape");

const fs = require("fs");
const os = require("os");
const path = require("path");

const { getTestDB } = require("../db.js");
const { convertMedia } = require("../../backstage/convert.js");

test("convertMedia: smoke", async (t) => {
  const { db } = await getTestDB();

  const tag = "icon128";
  const mediaId = "b638a9ce05cd";
  const mimeType = "image/png";
  const blob = await fs.promises.readFile(
    path.resolve(__dirname, "pink-heart-u4q.png")
  );
  const destination = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "scroll-tests-")
  );

  await convertMedia(db, tag, blob, mediaId, mimeType, destination);

  t.ok(true);
});
