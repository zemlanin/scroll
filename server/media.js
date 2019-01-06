const url = require("url");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const multiparty = require("multiparty");

const fsPromises = {
  unlink: promisify(fs.unlink),
  readFile: promisify(fs.readFile),
  copyFile: promisify(fs.copyFile)
};
const { authed, sendToAuthProvider } = require("./auth.js");
const { DIST, getMimeObj, renderer } = require("../common.js");
const { render } = require("./templates/index.js");

const PAGE_SIZE = 20;

const _id = require("nanoid/generate");
const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

async function openFileMedia(src, filePath, db) {
  const alreadyLoaded = await db.get("SELECT * from media WHERE src = ?1", [
    src
  ]);

  if (alreadyLoaded) {
    return {
      id: alreadyLoaded.id,
      ext: alreadyLoaded.ext,
      src: alreadyLoaded.src
    };
  }

  const resp = await fsPromises.readFile(filePath);

  const result = {
    id: getMediaId(),
    ext: src.match(/\.([a-z0-9]+)$/i)[1].toLowerCase(),
    src: src
  };

  await db.run(
    "INSERT INTO media (id, ext, data, created) VALUES (?1, ?2, ?3, ?4)",
    {
      1: result.id,
      2: result.ext,
      3: resp,
      4: new Date().toISOString()
    }
  );

  await fsPromises.copyFile(
    filePath,
    path.resolve(DIST, "media", `${result.id}.${result.ext}`)
  );

  return result;
}

const mediaId = {
  get: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;
    const db = await req.db();
    const m = await db.get(
      `
        SELECT id, ext
        FROM media
        WHERE id = ?1
        LIMIT 1
      `,
      { 1: query.id }
    );

    if (!m) {
      res.writeHead(404);
      res.end();
      return;
    }

    const posts = await db.all(
      `
        SELECT
          id,
          slug,
          case when slug is not null
            then slug
            else id
          end as slugOrId,
          draft
        FROM posts
        WHERE instr(text, ?1) > 0
        ORDER BY created DESC, modified DESC, id DESC
      `,
      { 1: `media/${m.id}` }
    );

    return render("media-id.mustache", {
      user: user,
      posts: posts,
      media: {
        ...m,
        displayHtml: renderer.image(`media/${m.id}.${m.ext}`),
        type: getMimeObj(m.ext)
      }
    });
  },
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const query = url.parse(req.url, true).query;
    const db = await req.db();
    const m = await db.get(
      `
        SELECT id, ext
        FROM media
        WHERE id = ?1
        LIMIT 1
      `,
      { 1: query.id }
    );

    if (!m) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (req.post && req.post.delete) {
      await db.run(`DELETE FROM media WHERE id = ?1`, {
        1: m.id
      });
      await fsPromises.unlink(path.resolve(DIST, "media", `${m.id}.${m.ext}`));
      res.writeHead(303, { Location: `/backstage/media/` });
      res.end();
      return;
    }
  }
};

module.exports = {
  get: async (req, res) => {
    const query = url.parse(req.url, true).query;
    if (query.id) {
      return await mediaId.get(req, res);
    }

    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    const db = await req.db();
    const offset = +query.offset || 0;
    const media = await db.all(
      `
        SELECT id, ext
        FROM media
        ORDER BY created DESC, id DESC
        LIMIT ?2 OFFSET ?1
      `,
      { 1: offset, 2: PAGE_SIZE + 1 }
    );

    const moreMedia = media.length > PAGE_SIZE;

    return render("media.mustache", {
      user: user,
      media: media.slice(0, PAGE_SIZE).map(m => ({
        ...m,
        type: getMimeObj(m.ext)
      })),
      urls: {
        moreMedia: moreMedia && `/backstage/media/?offset=${offset + PAGE_SIZE}`
      }
    });
  },
  post: async (req, res) => {
    const query = url.parse(req.url, true).query;
    if (query.id) {
      return await mediaId.post(req, res);
    }

    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
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

    const db = await req.db();
    let lastMedia = null;
    for (const f of files.files) {
      const src = `:upload/size-${f.headers.size}/${f.originalFilename}`;
      lastMedia = await openFileMedia(src, f.path, db);
      await fsPromises.unlink(f.path);
    }

    res.writeHead(303, {
      Location:
        files.files.length === 1
          ? `/backstage/media/?id=${lastMedia.id}`
          : `/backstage/media/`
    });
    res.end();
    return;
  }
};
