const _fs = require("fs");
const { promisify, inspect } = require("util");

const fs = {
  mkdir: promisify(_fs.mkdir),
  access: promisify(_fs.access),
  readdir: promisify(_fs.readdir),
  readFile: promisify(_fs.readFile),
  writeFile: promisify(_fs.writeFile)
};

const sqlite = require("sqlite");
const _id = require("nanoid/generate");
const id = () =>
  _id("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 12);

let _seconds = 0;
function fakeClocks() {
  if (++_seconds > 3599) {
    _seconds = 0;
  }

  const m = parseInt(_seconds / 60);
  const s = parseInt(_seconds % 60);

  return `10:${m > 9 ? m : "0" + m}:${s > 9 ? s : "0" + s}`;
}
function resetClocks() {
  _seconds = 0;
}

function escape(text) {
  return text
    .replace(/\n/g, "  \n")
    .replace(/([\\\`\[\]])/g, "\\$1")
    .replace(/^\s*([\+\-\_\*])/gm, "\\$1")
    .replace(/\\\_\(ツ\)\_/gm, "\\\\_(ツ)\\_");
}

async function importTweets() {
  const files = (await fs.readdir("./tweets/")).map(v => v); //.slice(-5)

  const db = await sqlite.open("./posts.db");

  for (const file of files) {
    const content = (await fs.readFile("./tweets/" + file))
      .toString()
      .replace(/^.+=/, "");
    const tweets = JSON.parse(content).sort((a, b) => {
      if (a.created_at != b.created_at) {
        return a.created_at > b.created_at ? 1 : -1;
      }

      return a.id_str > b.id_str ? 1 : -1;
    });
    resetClocks();

    for (let tweet of tweets) {
      if (
        tweet.in_reply_to_user_id_str &&
        tweet.in_reply_to_user_id_str != "3408781"
      ) {
        continue;
      }

      let created = tweet.created_at;
      if (
        (created.startsWith("200") || created.startsWith("2010")) &&
        created.indexOf("00:00:00") > -1
      ) {
        created = created.replace("00:00:00", fakeClocks());
      }

      const slug = `twitter-${tweet.id_str}`;

      let raw = tweet.text;
      let text = escape(tweet.text);
      if (tweet.in_reply_to_status_id_str) {
        text = `> [https://twitter.com/${
          tweet.in_reply_to_screen_name
        }/status/${tweet.in_reply_to_status_id_str}](https://twitter.com/${
          tweet.in_reply_to_screen_name
        }/status/${tweet.in_reply_to_status_id_str})\n\n${text}`;
      } else if (tweet.retweeted_status) {
        tweet = tweet.retweeted_status;
        raw = `RT @${tweet.user.screen_name}: ${tweet.text}`;
        text = `RT [@${tweet.user.screen_name}](https://twitter.com/${
          tweet.user.screen_name
        }): ${escape(tweet.text)}`;
      }

      for (const url of tweet.entities.urls) {
        text = text.replace(
          url.url,
          `[${url.display_url}](${url.expanded_url})`
        );
        const youtubeId = url.expanded_url.match(
          /(youtu\.be\/|youtube\.com\/watch\?v=)([^&\\]+)/
        );
        if (youtubeId) {
          text =
            text + `\n\n![](https://www.youtube.com/embed/${youtubeId[2]})`;
        }

        const vimeoId = url.expanded_url.match(/(vimeo\.com\/)(\d+)/);
        if (vimeoId) {
          text = text + `\n\n![](https://player.vimeo.com/video/${vimeoId[2]})`;
        }
      }

      for (const media of tweet.entities.media) {
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

          text = text + `\n\n![${media.alt_text || ""}](${video_url})`;
          // } else if (media.media_url.indexOf("ext_tw_video_thumb") > -1) {
          //   // thumbnail "https://pbs.twimg.com/ext_tw_video_thumb/664723514167955456/pu/img/VNigdIRMGCn_tvIO.jpg"
          //   // video     "https://video.twimg.com/ext_tw_video/664723514167955456/pu/vid/640x360/pqxg8_jI0Kh0p4G6.mp4"

          //   const video_url = media.media_url
          //     .replace('pbs.twimg', 'video.twimg')
          //     .replace('ext_tw_video_thumb', 'ext_tw_video')
          //     .replace(/\.[a-z0-9]+$/i, '.mp4')
          //   }

          //   text = text + `\n\n![${media.alt_text || ''}](${video_url})`
        } else {
          text = text + `\n\n![${media.alt_text || ""}](${media.media_url})`;
        }
      }

      const url = `https://twitter.com/${tweet.user.screen_name}/status/${
        tweet.id_str
      }`;

      console.log(
        inspect(
          {
            text: text,
            created: created,
            slug: slug,
            url: url
          },
          { showHidden: false, depth: null }
        )
      );

      await db.run(
        "INSERT INTO posts (id, text, slug, link, created, raw_import) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        {
          1: id(),
          2: text,
          3: slug,
          4: url,
          5: created,
          6: raw
        }
      );
    }
  }
}

importTweets()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
