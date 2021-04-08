const path = require("path");
const mime = require("mime");
const chunk = require("lodash.chunk");

const { getSession, sendToAuthProvider } = require("./auth.js");

const { generate } = require("../generate.js");
const { checkAndUpdate } = require("../linklist.js");
const { DIST } = require("../common.js");
const { convertMedia, getConversionTags } = require("./convert.js");
const { render } = require("./render.js");

async function generateDefaultMedia(db, destination, stdout, stderr) {
  const media = await db.all("SELECT id from media");

  stdout.write(`total media: ${media.length}\n`);

  for (const mediaChunk of chunk(media, 16)) {
    await db
      .all(
        `SELECT * from media WHERE id IN (${mediaChunk
          .map((s) => `"${s.id}"`)
          .join(",")})`
      )
      .then((loaded) =>
        Promise.all(
          loaded.map(async (m) => {
            const mimeType = mime.getType(m.ext);
            const ctags = await getConversionTags(mimeType);

            const defaultConversionTags = ctags && ctags._default;

            try {
              if (defaultConversionTags) {
                for (const tag of defaultConversionTags) {
                  await convertMedia(
                    db,
                    tag,
                    m.data,
                    m.id,
                    mimeType,
                    path.join(destination, "media")
                  );
                }
                stdout.write(`+`);
              } else {
                stdout.write(`.`);
              }
            } catch (e) {
              stderr.write(
                `\nfailed converting ${m.id}.${m.ext} [${
                  defaultConversionTags && defaultConversionTags.join(",")
                }]`
              );
              throw e;
            }
          })
        )
      );
  }
}

const TEN_BYTES = "\n\n\n\n\n\n\n\n\n\n";
const writePadding = (out) => {
  // Browsers wait for a few KB before displaying long-polling/server-sent content
  for (let i = 0; i < 800; i++) {
    out.write(TEN_BYTES);
  }
};

module.exports = {
  get: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    return render("generate.mustache");
  },
  post: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    res.writeHead(200, {
      "Content-Type": "text/html",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache",
    });

    writePadding(res);

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

    let generator = async () =>
      res.write(`Unknown generator: ${req.post.generator}\n`);

    switch (req.post.generator) {
      case "default-media":
        generator = async () =>
          generateDefaultMedia(await req.db(), DIST, res, res);
        break;
      case "pages":
        generator = async () => generate(await req.db(), DIST, res, res);
        break;
      case "linklist":
        generator = async () => checkAndUpdate(res, res);
        break;
    }

    return generator()
      .then(() => {
        res.end("\ndone");
      })
      .catch((e) => {
        res.write(e.toString());
        res.end("\nfail");
      });
  },
};
