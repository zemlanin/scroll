const url = require("url");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const mime = require("mime");
const formidable = require("formidable");

const fsPromises = {
  exists: promisify(fs.exists),
  unlink: promisify(fs.unlink),
  lstat: promisify(fs.lstat),
  rmdir: promisify(fs.rmdir),
  readdir: promisify(fs.readdir),
  readFile: promisify(fs.readFile),
  copyFile: promisify(fs.copyFile),
};
const { getSession, sendToAuthProvider } = require("./auth.js");
const { convertMedia, getConversionTags } = require("./convert.js");
const { DIST, getMimeObj, embedCallback } = require("../common.js");
const { render } = require("./render.js");

const PAGE_SIZE = 20;

const _id = require("nanoid/generate");
const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

async function rmrf(filepath) {
  if (await fsPromises.exists(filepath)) {
    for (const file of await fsPromises.readdir(filepath)) {
      const curPath = path.resolve(filepath, file);

      if ((await fsPromises.lstat(curPath)).isDirectory()) {
        await rmrf(curPath);
      } else {
        await fsPromises.unlink(curPath);
      }
    }
    await fsPromises.rmdir(filepath);
  }
}

async function openFileMedia(src, filePath, db) {
  const alreadyLoaded = await db.get("SELECT * from media WHERE src = ?1", [
    src,
  ]);

  if (alreadyLoaded) {
    return {
      id: alreadyLoaded.id,
      ext: alreadyLoaded.ext,
      src: alreadyLoaded.src,
    };
  }

  const resp = await fsPromises.readFile(filePath);

  const mimeType = mime.getType(src);
  const result = {
    id: getMediaId(),
    ext: mimeType
      ? mime.getExtension(mimeType)
      : src.match(/\.([a-z0-9]+)$/i)[1].toLowerCase(),
    src: src,
  };

  await db.run(
    "INSERT INTO media (id, ext, data, created) VALUES (?1, ?2, ?3, ?4)",
    {
      1: result.id,
      2: result.ext,
      3: resp,
      4: new Date().toISOString(),
    }
  );

  await fsPromises.copyFile(
    filePath,
    path.join(DIST, "media", `${result.id}.${result.ext}`)
  );

  const ctags = await getConversionTags(mimeType);

  if (ctags && ctags._default) {
    for (const tag of ctags._default) {
      await convertMedia(
        db,
        tag,
        resp,
        result.id,
        mimeType,
        path.join(DIST, "media")
      );
    }
  }

  return result;
}

const mediaId = {
  get: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
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

    const existingConversionsTags = existingConversions.map((r) => r.tag);

    const ctags = await getConversionTags(mime.getType(m.ext));

    const possibleConversions = Object.keys(ctags || {})
      .filter(
        (tag) => tag != "_default" && !existingConversionsTags.includes(tag)
      )
      .map((tag) => ({ tag, media_id: m.id, ext: ctags[tag].ext }));

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

    let poster, ffc;
    if ((ffc = existingConversions.find((c) => c.tag === "firstframe"))) {
      poster = `/media/${m.id}/${ffc.tag}.${ffc.ext}`;
    }

    return render("media-id.mustache", {
      posts: posts,
      existingConversions: existingConversions,
      possibleConversions: possibleConversions,
      media: {
        ...m,
        displayHtml: embedCallback(
          `/media/${m.id}.${m.ext}`,
          "",
          poster ? `poster="${poster}"` : ""
        ),
        type: getMimeObj(m.ext),
      },
    });
  },
  post: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
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
        1: m.id,
      });
      await rmrf(path.join(DIST, "media", m.id));

      await db.run(`DELETE FROM media WHERE id = ?1`, {
        1: m.id,
      });
      await fsPromises.unlink(path.join(DIST, "media", `${m.id}.${m.ext}`));

      res.writeHead(303, { Location: `/backstage/media/` });
      res.end();
      return;
    }
  },
};

module.exports = {
  getJson: async (db, { offset }) => {
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
        WHERE media_id IN (${media.map((m) => `"${m.id}"`).join(",")})
        ORDER BY tag ASC
      `
    );

    const conversionsMap = {};
    for (const m of media) {
      conversionsMap[m.id] = {
        existingConversions: [],
        possibleConversions: [],
        possibleCtags: (await getConversionTags(mime.getType(m.ext))) || {},
      };
      if (conversionsMap[m.id].possibleCtags._default) {
        delete conversionsMap[m.id].possibleCtags._default;
      }
    }

    for (const c of conversions) {
      conversionsMap[c.media_id].existingConversions.push(c);
      conversionsMap[c.media_id].possibleCtags[c.tag] = null;
    }

    for (const m of media) {
      for (const tag in conversionsMap[m.id].possibleCtags) {
        const ctag = conversionsMap[m.id].possibleCtags[tag];

        if (ctag) {
          conversionsMap[m.id].possibleConversions.push({
            tag,
            media_id: m.id,
            ext: ctag.ext,
          });
        }
      }

      delete conversionsMap[m.id].possibleCtags;
    }

    const iconsMap = conversions
      .filter((c) => c.tag === "icon128")
      .reduce(
        (acc, c) => ({
          ...acc,
          [c.media_id]: `/media/${c.media_id}/${c.tag}.${c.ext}`,
        }),
        {}
      );

    const moreMedia = media.length > PAGE_SIZE;

    return {
      media: media.slice(0, PAGE_SIZE).map((m) => {
        return {
          ...m,
          ...conversionsMap[m.id],
          icon: iconsMap[m.id],
          type: getMimeObj(m.ext),
        };
      }),
      urls: {
        moreMedia:
          moreMedia && `/backstage/media/?offset=${offset + PAGE_SIZE}`,
        moreMediaBar:
          moreMedia && `/backstage/media/?offset=${offset + PAGE_SIZE}&bar=1`,
      },
    };
  },
  get: async (req, res) => {
    const query = url.parse(req.url, true).query;
    if (query.id) {
      return await mediaId.get(req, res);
    }

    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const db = await req.db();
    const offset = +query.offset || 0;

    const template = query.bar ? "media-bar.mustache" : "media.mustache";

    return render(template, {
      ...(await module.exports.getJson(db, { offset })),
    });
  },
  post: async (req, res) => {
    const query = url.parse(req.url, true).query;
    if (query.id) {
      return await mediaId.post(req, res);
    }

    const session = await getSession(req, res);
    if (!session) {
      return sendToAuthProvider(req, res);
    }

    const { files } = await new Promise((resolve, reject) => {
      const form = formidable({ multiples: true });
      form.parse(req, (err, fields, files) => {
        if (err) {
          return reject(err);
        }

        if (Array.isArray(files.files)) {
          return resolve({ fields, files: files.files });
        }

        return resolve({ fields, files: [files.files] });
      });
    });

    const db = await req.db();
    let lastMedia = null;
    for (const f of files) {
      const src = `:upload/size-${f.size}/${f.name}`;
      lastMedia = await openFileMedia(src, f.path, db);
      await fsPromises.unlink(f.path);
    }

    let location;
    if (query.bar) {
      location = `/backstage/media/?bar=1`;
    } else if (files.length === 1) {
      location = `/backstage/media/?id=${lastMedia.id}`;
    } else {
      location = `/backstage/media/`;
    }

    res.writeHead(303, {
      Location: location,
    });
    res.end();
    return;
  },
};
