const url = require("url");
const _fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const multiparty = require("multiparty");

const fs = {
  unlink: promisify(_fs.unlink)
};
const { authed, sendToAuthProvider } = require("./auth.js");
const { openFileMedia } = require("../import/media.js");
const { render } = require("./templates/index.js");
const sqlite = require("sqlite");

const PAGE_SIZE = 20;

module.exports = {
  get: async (req, res) => {
    const query = url.parse(req.url, true).query;

    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
    const offset = +query.offset || 0;
    const media = await db.all(
      `
      SELECT
        id,
        ext
      FROM media
      ORDER BY created DESC
      LIMIT ?2 OFFSET ?1
    `,
      { 1: offset, 2: PAGE_SIZE + 1 }
    );

    const moreMedia = media.length > PAGE_SIZE;

    return render("media.mustache", {
      user: user,
      media: media.slice(0, PAGE_SIZE).map(m => ({
        ...m,
        type: {
          image: m.ext.match("^(gif|jpe?g|png)$"),
          video: m.ext.match("^(mp4)$"),
          audio: m.ext.match("^(mp3)$"),
          text: m.ext.match("^(md|txt|markdown|html|js|css)$")
        }
      })),
      urls: {
        moreMedia: moreMedia && `/backstage/media/?offset=${offset + PAGE_SIZE}`
      }
    });
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const db = await sqlite.open(path.resolve(__dirname, "..", "posts.db"));
    if (req.post && req.post.delete) {
      const parsedMatch = req.post.delete.match(/^([a-z0-9_-]+).([a-z0-9]+)$/i);
      await db.run(`DELETE FROM media WHERE id = ?1 AND ext = ?2`, {
        1: parsedMatch[1],
        2: parsedMatch[2]
      });
      await fs.unlink(
        path.resolve(
          __dirname,
          process.env.DIST || "../dist",
          "media",
          req.post.delete
        )
      );
      res.writeHead(303, { Location: `/backstage/media/` });
      res.end();
      return;
    }

    const { files } = await new Promise((resolve, reject) => {
      const form = new multiparty.Form();
      form.parse(req, (err, fields, files) => {
        if (err) {
          return reject(err);
        }

        return resolve({ fields, files });
      });
    });

    for (const f of files.files) {
      const src = `:upload/size-${f.headers.size}/${f.originalFilename}`;
      await openFileMedia(src, f.path, db);
      await fs.unlink(f.path);
    }

    res.writeHead(303, { Location: `/backstage/media/` });
    res.end();
    return;
  }
};
