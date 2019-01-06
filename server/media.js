const url = require("url");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const mime = require("mime");
const multiparty = require("multiparty");

const fsPromises = {
  unlink: promisify(fs.unlink),
  readFile: promisify(fs.readFile),
  copyFile: promisify(fs.copyFile)
};
const { authed, sendToAuthProvider } = require("./auth.js");
const { convertMedia, CONVERSION_TAGS } = require("./convert.js");
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

  const mimeType = mime.getType(src);
  const result = {
    id: getMediaId(),
    ext: mimeType
      ? mime.getExtension(mimeType)
      : src.match(/\.([a-z0-9]+)$/i)[1].toLowerCase(),
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

  const mimeObj = getMimeObj(null, mimeType);
  const mimeKey = Object.keys(mimeObj).find(k => mimeObj[k]);

  const defaultConversionTags =
    CONVERSION_TAGS[mimeKey] && CONVERSION_TAGS[mimeKey]._default;

  if (defaultConversionTags) {
    for (const tag of defaultConversionTags) {
      await convertMedia(
        db,
        tag,
        resp,
        result.id,
        mimeType,
        path.resolve(DIST, "media")
      );
    }
  }

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
    // TODO check the performance hit of multiple `length(data)` in a query
    const m = await db.get(
      `
        SELECT
          id,
          ext,
          CASE 
            WHEN length(data) < 1024 THEN length(data) || 'B'
            WHEN length(data) >=  1024 AND length(data) < (1024 * 1024) THEN (length(data) / 1024) || 'KB'
            WHEN length(data) >= (1024 * 1024) THEN (length(data) / (1024 * 1024)) || 'MB'
          END AS size
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

    const existingConversions = await db.all(
      `
        SELECT
          id,
          media_id,
          tag,
          ext,
          CASE 
            WHEN length(data) < 1024 THEN length(data) || 'B'
            WHEN length(data) >=  1024 AND length(data) < (1024 * 1024) THEN (length(data) / 1024) || 'KB'
            WHEN length(data) >= (1024 * 1024) THEN (length(data) / (1024 * 1024)) || 'MB'
          END AS size
        FROM converted_media
        WHERE media_id = ?1
        ORDER BY tag ASC
      `,
      { 1: m.id }
    );

    const existingConversionsTags = existingConversions.map(r => r.tag);

    const mimeObj = getMimeObj(m.ext);
    const mimeKey = Object.keys(mimeObj).find(k => mimeObj[k]);

    const possibleConversions = CONVERSION_TAGS[mimeKey]
      ? Object.keys(CONVERSION_TAGS[mimeKey])
          .filter(
            tag => tag != "_default" && !existingConversionsTags.includes(tag)
          )
          .map(tag => ({ tag, media_id: m.id }))
      : [];

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
        ORDER BY datetime(created) DESC, id DESC
      `,
      { 1: `media/${m.id}` }
    );

    return render("media-id.mustache", {
      user: user,
      posts: posts,
      existingConversions: existingConversions,
      possibleConversions: possibleConversions,
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
      await db.run(`DELETE FROM converted_media WHERE media_id = ?1`, {
        1: m.id
      });
      await fsPromises.unlink(path.resolve(DIST, "media", m.id));

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

    const conversions = await db.all(
      `
        SELECT media_id, tag, ext
        FROM converted_media
        WHERE tag = ?1 AND media_id IN (${media
          .map(m => `"${m.id}"`)
          .join(",")})
      `,
      { 1: "icon128" }
    );

    const iconsMap = conversions.reduce(
      (acc, c) => ({
        ...acc,
        [c.media_id]: `/media/${c.media_id}/${c.tag}.${c.ext}`
      }),
      {}
    );

    const moreMedia = media.length > PAGE_SIZE;

    return render("media.mustache", {
      user: user,
      media: media.slice(0, PAGE_SIZE).map(m => {
        const mimeObj = getMimeObj(m.ext);
        return {
          ...m,
          icon:
            iconsMap[m.id] ||
            (mimeObj.image && `/media/${m.id}.${m.ext}?w=128&h=128`),
          type: mimeObj
        };
      }),
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
