const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const fsPromises = {
  writeFile: promisify(fs.writeFile),
  unlink: promisify(fs.unlink),
  mkdir: promisify(fs.mkdir),
  exists: promisify(fs.exists)
};

const mime = require("mime");
const sharp = require("sharp");
const _id = require("nanoid/generate");

const { authed, sendToAuthProvider } = require("./auth.js");
const { getMimeObj, DIST } = require("../common.js");

const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

const CONVERSION_TAGS = {
  image: {
    _default: ["icon128"],
    async icon128(input) {
      const ext = "png";
      return {
        ext,
        data: await sharp(input)
          .resize({
            width: 128,
            height: 128,
            fit: "cover",
            strategy: "attention",
            withoutEnlargement: true
          })
          .toFormat(ext)
          .toBuffer()
      };
    },
    async fit200(input, mimeType) {
      const ext = mimeType != "image/gif" ? mime.getExtension(mimeType) : "png";
      return {
        ext,
        data: await sharp(input)
          .resize({
            width: 200,
            height: 200,
            fit: "inside",
            withoutEnlargement: true
          })
          .toFormat(ext)
          .toBuffer()
      };
    },
    async fit1000(input, mimeType) {
      const ext = mimeType != "image/gif" ? mime.getExtension(mimeType) : "png";
      return {
        ext,
        data: await sharp(input)
          .resize({
            width: 1000,
            height: 1000,
            fit: "inside",
            withoutEnlargement: true
          })
          .toFormat(ext)
          .toBuffer()
      };
    },
    async fit1600(input, mimeType) {
      const ext = mimeType != "image/gif" ? mime.getExtension(mimeType) : "png";
      return {
        ext,
        data: await sharp(input)
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true
          })
          .toFormat(ext)
          .toBuffer()
      };
    }
    //   async gifv(input, mimeType) {}
  }
  // video: {
  //   _default: ["icon128", "firstframe"],
  //   async icon128(input) {},
  //   async firstframe(input) {}
  // },
  // pdf: {
  //   _default: ["icon128"],
  //   async icon128(input) {},
  //   async firstpage1600(input) {}
  // }
};

async function convertMedia(db, tag, blob, mediaId, mimeType, destination) {
  const alreadyConverted = await db.get(
    "SELECT * from converted_media WHERE media_id = ?1 AND tag = ?2",
    [mediaId, tag]
  );

  if (alreadyConverted) {
    return {
      id: alreadyConverted.id,
      ext: alreadyConverted.ext,
      tag: alreadyConverted.tag,
      media_id: alreadyConverted.media_id
    };
  }

  const mimeObj = getMimeObj(null, mimeType);
  const mimeKey = Object.keys(mimeObj).find(k => mimeObj[k]);

  if (!mimeKey || !CONVERSION_TAGS[mimeKey]) {
    return;
  }

  const convertFunc = CONVERSION_TAGS[mimeKey][tag];
  const converted = convertFunc && (await convertFunc(blob, mimeType));
  if (!converted) {
    return;
  }

  // { data, ext } = converted

  const result = {
    id: getMediaId(),
    media_id: mediaId,
    tag: tag,
    ext: converted.ext
  };

  await db.run(
    `
      INSERT INTO converted_media (id, media_id, tag, ext, data, created)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `,
    {
      1: result.id,
      2: result.media_id,
      3: result.tag,
      4: result.ext,
      5: converted.data,
      6: new Date().toISOString()
    }
  );

  const dpath = path.join(destination, mediaId);

  if (!(await fsPromises.exists(dpath))) {
    await fsPromises.mkdir(dpath);
  }

  await fsPromises.writeFile(
    path.join(dpath, `${tag}.${converted.ext}`),
    converted.data
  );

  return result;
}

module.exports = {
  CONVERSION_TAGS,
  convertMedia,
  post: async (req, res) => {
    const user = authed(req, res);

    if (!user) {
      return sendToAuthProvider(req, res);
    }

    // TODO transform the original file. maybe here, maybe in some `transform.js`
    const { id: mediaId, tag } = req.post;

    if (!(mediaId && tag)) {
      res.writeHead(404);
      res.end("404");

      return;
    }

    const db = await req.db();
    const media = await db.get("SELECT * from media WHERE id = ?1", [mediaId]);

    if (!media) {
      res.writeHead(404);
      res.end("404");

      return;
    }

    if (req.post.delete) {
      const existing = await db.get(
        "SELECT id, ext from converted_media WHERE media_id = ?1 AND tag = ?2",
        {
          1: media.id,
          2: tag
        }
      );

      if (existing) {
        await db.run(`DELETE FROM converted_media WHERE id = ?1`, {
          1: existing.id
        });

        const fpath = path.resolve(
          DIST,
          "media",
          media.id,
          `${tag}.${existing.ext}`
        );

        if (await fsPromises.exists(fpath)) {
          await fsPromises.unlink(fpath);
        }
      }

      res.writeHead(303, { Location: `/backstage/media/?id=${media.id}` });
      res.end();
      return;
    }

    const mimeType = mime.getType(media.ext);

    await convertMedia(
      db,
      tag,
      media.data,
      media.id,
      mimeType,
      path.resolve(DIST, "media")
    );

    res.writeHead(303, { Location: `/backstage/media/?id=${media.id}` });
    res.end();
    return;
  }
};
