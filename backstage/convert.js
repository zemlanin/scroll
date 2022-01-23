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
  exists: promisify(fs.exists),
};

const mime = require("mime");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const isAnimatedGif = require("animated-gif-detector");
const { nanoid } = require("../common");

const { getSession, sendToAuthProvider } = require("./auth.js");
const { DIST } = require("../common.js");

const getMediaId = () => nanoid.media();

const SHARP_SUPPORTED_INPUT_MIMETYPES = new Set([
  "image/gif",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function getSharpConversionTags(mimeType) {
  const iconExt = "png";
  const fitExt = mimeType === "image/gif" ? "png" : mime.getExtension(mimeType);

  return {
    _default: ["icon128"],
    icon128: {
      ext: iconExt,
      async convert(input) {
        return await sharp(input)
          .rotate() // rotate according to EXIF data, which will be stripped later
          .resize({
            width: 128,
            height: 128,
            fit: "cover",
            strategy: "attention",
            withoutEnlargement: true,
          })
          .toFormat(iconExt)
          .toBuffer();
      },
    },
    fit200: {
      ext: fitExt,
      async convert(input) {
        return await sharp(input)
          .rotate() // rotate according to EXIF data, which will be stripped later
          .resize({
            width: 200,
            height: 200,
            fit: "inside",
            withoutEnlargement: true,
            progressive: true,
          })
          .toFormat(fitExt)
          .toBuffer();
      },
    },
    fit1000: {
      ext: fitExt,
      async convert(input) {
        return await sharp(input)
          .rotate() // rotate according to EXIF data, which will be stripped later
          .resize({
            width: 1000,
            height: 1000,
            fit: "inside",
            withoutEnlargement: true,
            progressive: true,
          })
          .toFormat(fitExt)
          .toBuffer();
      },
    },
    fit1600: {
      ext: fitExt,
      async convert(input) {
        return await sharp(input)
          .rotate() // rotate according to EXIF data, which will be stripped later
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
            progressive: true,
          })
          .toFormat(fitExt)
          .toBuffer();
      },
    },
  };
}

const isFfmpegInstalled = new Promise((resolve) => {
  ffmpeg.getAvailableFormats(function (err, formats) {
    return resolve(Boolean(!err && formats));
  });
});

function getGifToMP4Buffer(input) {
  return new Promise((resolve, reject) => {
    Promise.resolve()
      .then(async () => {
        if (!isAnimatedGif(input)) {
          return resolve();
        }

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
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          ])
          .videoCodec("libx264")
          .noAudio()
          .videoBitrate(1000)
          .toFormat("mp4")
          .save(outputFile)
          .on("end", function () {
            fsPromises.readFile(outputFile).then((blob) =>
              cleanup().then(() => {
                resolve(blob);
              })
            );
          })
          .on("error", function (err) {
            cleanup()
              .catch(() => {})
              .then(() => {
                reject(err);
              });
          });
      })
      .catch((err) => {
        reject(err);
      });
  });
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

        let ffmpegArgs = ffmpeg(inputFile)
          .inputFormat("mp4")
          .outputOptions(["-vframes 1"])
          .toFormat("image2");

        if (crop) {
          ffmpegArgs = ffmpegArgs.videoFilter([
            "crop=min(iw\\, ih):min(iw\\, ih)",
            `scale=${crop}:${crop}`,
          ]);
        }

        ffmpegArgs
          .on("end", function () {
            resolve(Buffer.concat(chunks));
            cleanup().catch(() => {});
          })
          .on("error", function (err) {
            cleanup()
              .catch(() => {})
              .then(() => {
                reject(err);
              });
          })
          .pipe()
          .on("data", function (chunk) {
            chunks.push(chunk);
          });
      })
      .catch((err) => {
        reject(err);
      });
  });
}

async function getConversionTags(mimeType) {
  if (mimeType === "image/gif" && (await isFfmpegInstalled)) {
    const sharpTags = getSharpConversionTags(mimeType);

    return {
      ...sharpTags,
      _default: sharpTags._default.concat("gifv"),
      gifv: {
        ext: "mp4",
        convert: getGifToMP4Buffer,
      },
    };
  }

  if (SHARP_SUPPORTED_INPUT_MIMETYPES.has(mimeType)) {
    return getSharpConversionTags(mimeType);
  }

  if (mimeType === "video/mp4" && (await isFfmpegInstalled)) {
    return {
      _default: ["icon128", "firstframe"],
      icon128: {
        ext: "jpeg",
        async convert(input) {
          return await getFirstFrameBuffer(input, 128);
        },
      },
      firstframe: {
        ext: "jpeg",
        convert: getFirstFrameBuffer,
      },
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
      media_id: alreadyConverted.media_id,
    };
  }

  const ctags = await getConversionTags(mimeType);

  if (!ctags || !ctags[tag]) {
    return;
  }

  const { ext, convert } = ctags[tag];

  const converted = await convert(blob);
  if (!converted) {
    return;
  }

  const result = {
    id: getMediaId(),
    media_id: mediaId,
    tag: tag,
    ext: ext,
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
      5: converted,
      6: new Date().toISOString(),
    }
  );

  const dpath = path.join(destination, mediaId);

  if (!(await fsPromises.exists(dpath))) {
    await fsPromises.mkdir(dpath);
  }

  await fsPromises.writeFile(path.join(dpath, `${tag}.${ext}`), converted);

  return result;
}

module.exports = {
  getConversionTags,
  convertMedia,
  post: async (req, res) => {
    const session = await getSession(req, res);
    if (!session) {
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

    const existing = await db.get(
      "SELECT id, ext from converted_media WHERE media_id = ?1 AND tag = ?2",
      {
        1: media.id,
        2: tag,
      }
    );

    if (req.post.delete) {
      if (existing) {
        await db.run(`DELETE FROM converted_media WHERE id = ?1`, {
          1: existing.id,
        });

        const fpath = path.join(
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

    if (!existing) {
      const mimeType = mime.getType(media.ext);

      const result = await convertMedia(
        db,
        tag,
        media.data,
        media.id,
        mimeType,
        path.join(DIST, "media")
      );

      if (!result) {
        res.writeHead(400);
        res.end(`unable to convert`);
      }
    }

    res.writeHead(303, { Location: `/backstage/media/?id=${media.id}` });
    res.end();
    return;
  },
};
