const { render } = require("./render.js");

const PAGE_SIZE = 20;

module.exports = {
  index,
};

async function index(req, res) {
  const asdb = await req.asdb();

  const { searchParams } = new URL(req.url, req.absolute);

  const offset = +searchParams.get("offset") || 0;
  const query = searchParams.get("q");

  if (!query && searchParams.has("q")) {
    res.setHeader("Location", "/backstage/notifications");
    res.writeHead(302);
    return;
  }

  const totalCount = (
    await asdb.get(
      query
        ? `SELECT count(*) as c FROM inbox WHERE actor_id = ?1 OR object_id = ?1`
        : `SELECT count(*) as c FROM inbox`,
      { 1: query || undefined }
    )
  ).c;

  const inbox = await asdb.all(
    query
      ? `
        SELECT
          i.id,
          i.actor_id,
          i.object_id,
          i.type,
          i.hidden,
          r.object,
          a.name,
          a.icon,
          a.url
        FROM inbox i
        LEFT OUTER JOIN replies r ON i.object_id = r.id
        LEFT OUTER JOIN actors a ON i.actor_id = a.id
        WHERE i.actor_id = ?3 OR i.object_id = ?3
        ORDER BY i.created DESC
        LIMIT ?2 OFFSET ?1;
      `
      : `
        SELECT
          i.id,
          i.actor_id,
          i.object_id,
          i.type,
          i.hidden,
          r.object,
          a.name,
          a.icon,
          a.url
        FROM inbox i
        LEFT OUTER JOIN replies r ON i.object_id = r.id
        LEFT OUTER JOIN actors a ON i.actor_id = a.id
        ORDER BY i.created DESC
        LIMIT ?2 OFFSET ?1;
      `,
    {
      1: offset,
      2: PAGE_SIZE,
      3: query || undefined,
    }
  );

  const queueCount = (
    await asdb.get(
      `SELECT count(*) as c FROM deliveries WHERE next_try IS NOT NULL;`
    )
  ).c;

  const notifications = inbox.map((msg) => {
    const knownTypes = ["Follow", "Like", "Announce", "Create"];
    const knownTypesConditions = knownTypes.reduce((acc, t) => {
      acc[`type=${t}`] = msg.type === t;
      return acc;
    }, {});
    const hasUnknownType = !Object.values(knownTypesConditions).some(Boolean);

    const replyObject =
      msg.type === "Create" && msg.object ? JSON.parse(msg.object) : null;

    return {
      id: msg.id,
      type: msg.type,
      ...knownTypesConditions,
      "type=unknown": hasUnknownType,
      hidden: msg.hidden,
      object: replyObject
        ? {
            id: replyObject.inReplyTo,
          }
        : {
            id: msg.object_id,
          },
      reply: replyObject,
      actor: {
        id: msg.actor_id,
        name: msg.name || msg.actor_id,
        icon: msg.icon,
        url: msg.url,
      },
      urls: {
        hide: "", // TODO
      },
    };
  });

  return render("notifications.mustache", {
    q: query,
    notifications,
    queueCount,
    urls: {
      ...getPaginationUrls(new URL(req.url, req.absolute), totalCount),
    },
  });
}

function getPaginationUrls(base, totalCount) {
  const offset = +new URL(base).searchParams.get("offset") || 0;

  const newest = offset ? new URL(base) : null;
  newest?.searchParams.delete("offset");

  const newer = offset ? new URL(base) : null;
  if (offset > PAGE_SIZE) {
    newer?.searchParams.set("offset", offset - PAGE_SIZE);
  } else {
    newer?.searchParams.delete("offset");
  }

  const older = offset + PAGE_SIZE < totalCount ? new URL(base) : null;
  older?.searchParams.set("offset", offset + PAGE_SIZE);

  return {
    newest: newest?.toString(),
    newer: newer?.toString(),
    older: older?.toString(),
  };
}
