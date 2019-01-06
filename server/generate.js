const path = require("path");
const mime = require("mime");
const chunk = require("lodash.chunk");

const { authed, sendToAuthProvider } = require("./auth.js");

const generate = require("../index.js");
const { DIST, getMimeObj } = require("../common.js");
const { convertMedia, CONVERSION_TAGS } = require("./convert.js");
const { render } = require("./templates/index.js");

async function generateDefaultMedia(db, stdout /* , stderr */) {
  const media = await db.all("SELECT id from media");

  stdout.write(`total media: ${media.length}\n`);

  for (const mediaChunk of chunk(media, 16)) {
    await db
      .all(
        `SELECT * from media WHERE id IN (${mediaChunk
          .map(s => `"${s.id}"`)
          .join(",")})`
      )
      .then(loaded =>
        Promise.all(
          loaded.map(async m => {
            const mimeType = mime.getType(m.ext);
            const mimeObj = getMimeObj(null, mimeType);
            const mimeKey = Object.keys(mimeObj).find(k => mimeObj[k]);

            const defaultConversionTags =
              CONVERSION_TAGS[mimeKey] && CONVERSION_TAGS[mimeKey]._default;

            if (defaultConversionTags) {
              for (const tag of defaultConversionTags) {
                await convertMedia(
                  db,
                  tag,
                  m.data,
                  m.id,
                  mimeType,
                  path.resolve(DIST, "media")
                );
              }
              stdout.write(`+`);
            } else {
              stdout.write(`.`);
            }
          })
        )
      );
  }
}

module.exports = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    return render("generate.mustache");
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    res.writeHead(200, {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache"
    });

    res.write(
      `
        <body style="position: absolute; bottom: 0">
          <script>
            document.addEventListener("DOMContentLoaded", function() {
              document.body.style.position = "";
              document.body.scrollTop = document.body.scrollHeight;
            })
          </script>
          <pre style="word-wrap: break-word; white-space: pre-wrap;">`
    );

    const generator =
      req.post.generator === "default-media"
        ? async () => generateDefaultMedia(await req.db(), res, res)
        : async () => generate(await req.db(), res, res);

    return generator()
      .then(() => {
        res.end("\ndone");
      })
      .catch(e => {
        res.write(e.toString());
        res.end("\nfail");
      });
  }
};
