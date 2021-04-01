const { getSession, sendToAuthProvider } = require("./auth.js");

function weekNumberISO8601(date) {
  const tdt = new Date(date.valueOf());
  const dayn = (date.getDay() + 6) % 7;
  tdt.setDate(tdt.getDate() - dayn + 3);
  const firstThursday = tdt.valueOf();
  tdt.setMonth(0, 1);
  if (tdt.getDay() !== 4) {
    tdt.setMonth(0, 1 + ((4 - tdt.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - tdt) / 604800000);
}

async function getTraffic(days = 31) {
  const goaccessPath = process.env.GOACCESS_JSON;

  if (!goaccessPath) {
    return;
  }

  delete require.cache[require.resolve(goaccessPath)];

  return require(goaccessPath)
    .visitors.data.slice(0, days)
    .map((d) => ({
      date:
        d.data.slice(0, 4) +
        "-" +
        d.data.slice(4, 6) +
        "-" +
        d.data.slice(6, 8),
      hits: d.hits.count,
      visitors: d.visitors.count,
    }));
}

async function goaccessGraph(req, res) {
  if (!process.env.GOACCESS_JSON) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
    return;
  }

  const session = await getSession(req, res);
  if (!session) {
    return sendToAuthProvider(req, res);
  }

  const traffic = await getTraffic();

  if (!traffic) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
    return;
  }

  const width = traffic.length * 3;
  const aspectRatio = 3;
  const height = width / aspectRatio;

  const maxH = Math.max(...traffic.map((d) => Math.max(d.hits, d.visitors)));
  const hK = maxH ? height / maxH : 0;

  res.setHeader("Content-Type", "image/svg+xml");

  return `<?xml version="1.0" standalone="no"?>
    <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
    <svg viewBox="0 0 ${width} ${
    height + 2
  }" preserveAspectRatio="xMinYMin meet" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${width}, ${height + 2}) scale(-1,-1)">
        <!-- ${JSON.stringify(traffic)} -->
        <rect fill="gray"  />
        ${traffic
          .map((d) => new Date(d.date))
          .map((date, i) =>
            weekNumberISO8601(date) % 2
              ? `<rect x="${i * 3}" y="0" width="3" height="${
                  height + 2
                }" fill="${`hsl(${date.getMonth() * 30}, 100%, 78%)`}" />`
              : ""
          )
          .join("\n")}
        <polyline
          points="${traffic
            .map((d) => d.hits * hK)
            .map((h, i) => `${i * 3},${h} ${(i + 1) * 3},${h}`)
            .join(" ")}"
          fill="none"
          stroke="rgba(0, 0, 255, 0.5)"
          strokeWidth="10"
        />
        <polyline
          points="${traffic
            .map((d) => d.visitors * hK)
            .map((h, i) => `${i * 3},${h} ${(i + 1) * 3},${h}`)
            .join(" ")}"
          fill="none"
          stroke="rgba(255, 0, 0, 0.5)"
          strokeWidth="10"
        />
      </g>
    </svg>
  `;
}

module.exports = goaccessGraph;
