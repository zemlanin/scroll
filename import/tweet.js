const _fs = require("fs");
const sqlite = require("sqlite");
const request = require("request-promise-native");
const { promisify, inspect } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

function escape(text) {
  return text
    .replace(/\n/g, "  \n")
    .replace(/([\\`[\]])/g, "\\$1")
    .replace(/^\s*([+\-_*])/gm, "\\$1")
    .replace(/\\_\(ツ\)_/gm, "\\\\_(ツ)\\_");
}

async function getTime(tweet) {
  if (tweet.created_at.indexOf("00:00:00") > -1) {
    const twitterUrl = `https://twitter.com/${tweet.user.screen_name}/status/${
      tweet.id_str
    }`;
    const resp = await request.get(twitterUrl);

    const timestamp = resp.match(/data-time-ms="(\d+)"/);
    if (timestamp) {
      return new Date(+timestamp[1]).toISOString();
    }
  }

  return new Date(tweet.created_at).toISOString();
}

const _id = require("nanoid/generate");
const getMediaId = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 26);

async function loadMedia(src, db) {
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

  const resp = await request.get(src, { encoding: null });

  const result = {
    id: getMediaId(),
    ext: src.match(/\.([a-z0-9]+)$/)[1],
    src: src
  };

  await db.run(
    "INSERT INTO media (id, ext, data, src) VALUES (?1, ?2, ?3, ?4)",
    {
      1: result.id,
      2: result.ext,
      3: resp,
      4: result.src
    }
  );

  return result;
}

async function loadTwitterVideo(expanded_url, tweet_id, db) {
  /* generating with_video.json
    BEARER_TOKEN="https://developer.twitter.com/en/docs/basics/authentication/overview/application-only" \
    ls ./import/tweets/20* | xargs -I {} tail -n +2 {} | \
    jq '.[] | (if .retweeted_status then .retweeted_status else . end) | select(.entities.media | any(.media_url | contains("ext_tw_video_thumb"))) | .id_str' -cr | \
    xargs -I {} -n1 curl "https://api.twitter.com/1.1/statuses/show.json?include_user_entities=false&id={}" -H 'Authorization: Bearer $BEARER_TOKEN' > tweets/with_video.json
  */

  // for some reason, video in this tweet:
  //   https://twitter.com/cabel/status/792210427732045824/video/1
  // doesn't have an .entities.media :rolling_eyes:

  const withVideo = JSON.parse(
    (await fs.readFile("./import/tweets/with_video.json")).toString()
  );

  const fullTweet = withVideo.find(t => t.id_str == tweet_id);

  if (!fullTweet) {
    throw new Error("no tweet in tweets/with_video.json: " + tweet_id);
  }

  if (!fullTweet.extended_entities) {
    throw new Error("no extended_entities in tweet: " + tweet_id);
  }

  const targetMedia = fullTweet.extended_entities.media.find(
    m => m.type === "video" && m.expanded_url === expanded_url
  );

  if (!targetMedia) {
    throw new Error("no video in tweet: " + tweet_id);
  }

  const video_url = targetMedia.video_info.variants
    .filter(v => v.content_type === "video/mp4")
    .sort((a, b) => b.bitrate - a.bitrate)[0].url;

  return await loadMedia(video_url, db);
}

async function importTweet(tweet, db) {
  if (
    tweet.in_reply_to_user_id_str &&
    tweet.in_reply_to_user_id_str != "3408781"
  ) {
    return;
  }

  const id = `twitter-${tweet.id_str}`;
  const url = `https://twitter.com/${tweet.user.screen_name}/status/${
    tweet.id_str
  }`;

  if (await db.get("SELECT * FROM posts WHERE import_url = ?1", [url])) {
    return;
  }

  const created = await getTime(tweet);
  let raw = tweet.text;
  let text = escape(tweet.text);

  if (tweet.in_reply_to_status_id_str) {
    text = `> [https://twitter.com/${tweet.in_reply_to_screen_name}/status/${
      tweet.in_reply_to_status_id_str
    }](https://twitter.com/${tweet.in_reply_to_screen_name}/status/${
      tweet.in_reply_to_status_id_str
    })\n\n${text}`;
  } else if (tweet.retweeted_status) {
    if (
      tweet.retweeted_status.text.indexOf("@zemlanin") === -1 &&
      tweet.text.indexOf("@marsianin") === -1
    ) {
      return;
    }

    tweet = tweet.retweeted_status;
    raw = `RT @${tweet.user.screen_name}: ${tweet.text}`;
    text = `RT [@${tweet.user.screen_name}](https://twitter.com/${
      tweet.user.screen_name
    }): ${escape(tweet.text)}`;
  } else if (
    tweet.text.startsWith("RT @") &&
    tweet.text.indexOf("@zemlanin") === -1 &&
    tweet.text.indexOf("@marsianin") === -1
  ) {
    return;
  }

  for (const url of tweet.entities.urls) {
    text = text.replace(url.url, `[${url.display_url}](${url.expanded_url})`);
    const youtubeId = url.expanded_url.match(
      /(youtu\.be\/|youtube\.com\/watch\?v=)([^&\\]+)/
    );
    if (youtubeId) {
      text = text + `\n\n![](https://www.youtube.com/embed/${youtubeId[2]})`;
    }

    const vimeoId = url.expanded_url.match(/(vimeo\.com\/)(\d+)/);
    if (vimeoId) {
      text = text + `\n\n![](https://player.vimeo.com/video/${vimeoId[2]})`;
    }
  }

  for (const media of tweet.entities.media || []) {
    text = text.replace(
      media.url,
      `[${media.display_url}](${media.expanded_url})`
    );

    if (media.media_url.indexOf("tweet_video_thumb") > -1) {
      // thumbnail "http://pbs.twimg.com/tweet_video_thumb/DWRKv3HX4AAXrXG.jpg"
      // video gif    "https://video.twimg.com/tweet_video/DWRKv3HX4AAXrXG.mp4"
      const video_url = media.media_url
        .replace("pbs.twimg", "video.twimg")
        .replace("tweet_video_thumb", "tweet_video")
        .replace(/\.[a-z0-9]+$/i, ".mp4");

      let srcUrl = video_url;

      try {
        const loaded = await loadMedia(srcUrl, db);
        srcUrl = `/media/${loaded.id}.${loaded.ext}`;
      } catch (e) {
        //
      }

      text = text + `\n\n![${media.alt_text || ""}](${srcUrl})`;
    } else if (
      tweet.extended_entities &&
      tweet.extended_entities.media &&
      tweet.extended_entities.media.some(
        m => m.type === "video" && m.expanded_url === media.expanded_url
      )
    ) {
      const expanded_url = media.expanded_url;

      const targetMedia = tweet.extended_entities.media.find(
        m => m.type === "video" && m.expanded_url === expanded_url
      );

      const video_url = targetMedia.video_info.variants
        .filter(v => v.content_type === "video/mp4")
        .sort((a, b) => b.bitrate - a.bitrate)[0].url;

      return await loadMedia(video_url, db);
    } else if (media.media_url.indexOf("ext_tw_video_thumb") > -1) {
      // thumbnail "https://pbs.twimg.com/ext_tw_video_thumb/664723514167955456/pu/img/VNigdIRMGCn_tvIO.jpg"
      // video     "https://video.twimg.com/ext_tw_video/664723514167955456/pu/vid/640x360/pqxg8_jI0Kh0p4G6.mp4"

      let image_url = media.media_url;
      try {
        const loaded = await loadMedia(image_url, db);
        image_url = `/media/${loaded.id}.${loaded.ext}`;
      } catch (e) {
        //
      }

      let video_url;
      try {
        const loaded = await loadTwitterVideo(
          media.expanded_url,
          tweet.id_str,
          db
        );
        video_url = `/media/${loaded.id}.${loaded.ext}`;
      } catch (e) {
        //
      }

      if (video_url) {
        text =
          text +
          `\n\n<video controls src="${video_url}" poster="${image_url}"></video>`;
      } else {
        text = text + `\n\n![${media.alt_text || ""}](${image_url})`;
      }
    } else {
      let srcUrl = media.media_url;

      try {
        const loaded = await loadMedia(srcUrl, db);
        srcUrl = `/media/${loaded.id}.${loaded.ext}`;
      } catch (e) {
        //
      }

      text = text + `\n\n![${media.alt_text || ""}](${srcUrl})`;
    }
  }

  console.log(
    inspect(
      {
        text: text,
        created: created,
        id: id,
        url: url
      },
      { showHidden: false, depth: null }
    )
  );

  await db.run(
    "INSERT INTO posts (id, text, import_url, created, import_raw) VALUES (?1, ?2, ?4, ?5, ?6)",
    {
      1: id,
      2: text,
      4: url,
      5: created,
      6: raw
    }
  );
}

if (require.main) {
  /*
    BEARER_TOKEN="https://developer.twitter.com/en/docs/basics/authentication/overview/application-only" \
    curl "https://api.twitter.com/1.1/statuses/show.json?include_user_entities=false&id=986673788929675264" \
      -H 'Authorization: Bearer $BEARER_TOKEN' \
      | node import/tweet.js
  */
  process.stdin.setEncoding("utf8");

  let stdin = "";

  process.stdin.on("readable", () => {
    const chunk = process.stdin.read();
    if (chunk !== null) {
      stdin += chunk;
    }
  });

  process.stdin.on("end", () => {
    const tweet = JSON.parse(stdin);

    sqlite
      .open("./posts.db")
      .then(db => importTweet(tweet, db))
      .then(() => {
        console.log("done");
        process.exit(0);
      })
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  });
} else {
  module.exports = {
    importTweet
  };
}
