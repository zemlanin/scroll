const fs = require("fs");
const os = require("os");
const path = require("path");
const { promisify } = require("util");

const fsPromises = {
  readFile: promisify(fs.readFile),
  writeFile: promisify(fs.writeFile),
  unlink: promisify(fs.unlink),
  mkdir: promisify(fs.mkdir),
  mkdtemp: promisify(fs.mkdtemp),
  exists: promisify(fs.exists)
};

const mime = require("mime");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const isAnimatedGif = require("animated-gif-detector");
const _id = require("nanoid/generate");

const { authed, sendToAuthProvider } = require("./auth.js");
const { DIST } = require("../common.js");

const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

const SHARP_SUPPORTED_INPUT_MIMETYPES = new Set([
  "image/gif",
  "image/png",
  "image/jpeg",
  "image/webp"
]);

const SHARP_CONVERSION_TAGS = {
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
};

const isFfmpegInstalled = new Promise(resolve => {
  ffmpeg.getAvailableFormats(function(err, formats) {
    return resolve(Boolean(!err && formats));
  });
});

function getGifToMP4Buffer(input) {
  return new Promise((resolve, reject) => {
    Promise.resolve()
      .then(async () => {
        const tmpFolder = await fsPromises.mkdtemp(
          path.join(os.tmpdir(), "scrollconvert-")
        );
        const inputFile = path.join(tmpFolder, "input.gif");
        const outputFile = path.join(tmpFolder, "output.mp4");

        await fsPromises.writeFile(inputFile, input);

        const cleanup = async () => {
          await fsPromises.unlink(inputFile);
          await fsPromises.unlink(outputFile);
        };

        ffmpeg(inputFile)
          .outputOptions([
            "-movflags +faststart+frag_keyframe+empty_moov",
            "-pix_fmt yuv420p",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2"
          ])
          .videoCodec("libx264")
          .noAudio()
          .videoBitrate(1000)
          .toFormat("mp4")
          .save(outputFile)
          .on("end", function() {
            fsPromises.readFile(outputFile).then(blob =>
              cleanup().then(() => {
                resolve(blob);
              })
            );
          })
          .on("error", function(err) {
            cleanup()
              .catch(() => {})
              .then(() => {
                reject(err);
              });
          });
      })
      .catch(err => {
        reject(err);
      });
  });
}

async function gifvConvert(input) {
  if (!(await isFfmpegInstalled)) {
    return;
  }

  if (!isAnimatedGif(input)) {
    return;
  }

  return {
    ext: "mp4",
    data: await getGifToMP4Buffer(input)
  };
}

function getFirstFrameBuffer(input, crop = null) {
  return new Promise((resolve, reject) => {
    Promise.resolve()
      .then(async () => {
        const tmpFolder = await fsPromises.mkdtemp(
          path.join(os.tmpdir(), "scrollconvert-")
        );
        const inputFile = path.join(tmpFolder, "input.mp4");

        await fsPromises.writeFile(inputFile, input);

        const cleanup = async () => {
          await fsPromises.unlink(inputFile);
          chunks = null;
        };

        let chunks = [];

        ffmpeg(inputFile)
          .inputFormat("mp4")
          .outputOptions(["-vframes 1"])
          .toFormat("image2")
          .videoFilter(
            crop
              ? ["crop=min(iw\\, ih):min(iw\\, ih)", `scale=${crop}:${crop}`]
              : null
          )
          .on("end", function() {
            resolve(Buffer.concat(chunks));
            cleanup().catch(() => {});
          })
          .on("error", function(err) {
            cleanup()
              .catch(() => {})
              .then(() => {
                reject(err);
              });
          })
          .pipe()
          .on("data", function(chunk) {
            chunks.push(chunk);
          });
      })
      .catch(err => {
        reject(err);
      });
  });
}

async function firstFrameConvert(input) {
  if (!(await isFfmpegInstalled)) {
    return;
  }

  return {
    ext: "jpeg",
    data: await getFirstFrameBuffer(input)
  };
}

async function firstFrameIconConvert(input) {
  if (!(await isFfmpegInstalled)) {
    return;
  }

  return {
    ext: "jpeg",
    data: await getFirstFrameBuffer(input, 128)
  };
}

async function getConversionTags(mimeType) {
  if (mimeType === "image/gif" && (await isFfmpegInstalled)) {
    return {
      ...SHARP_CONVERSION_TAGS,
      _default: SHARP_CONVERSION_TAGS._default.concat("gifv"),
      gifv: gifvConvert
    };
  }

  if (SHARP_SUPPORTED_INPUT_MIMETYPES.has(mimeType)) {
    return SHARP_CONVERSION_TAGS;
  }

  if (mimeType === "video/mp4") {
    return {
      _default: ["icon128", "firstframe"],
      icon128: firstFrameIconConvert,
      firstframe: firstFrameConvert
    };
  }
}

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

  const ctags = await getConversionTags(mimeType);

  if (!ctags) {
    return;
  }

  const convertFunc = ctags[tag];
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
  getConversionTags,
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
