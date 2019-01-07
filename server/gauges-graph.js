const url = require("url");
const https = require("https");

const { authed, sendToAuthProvider } = require("./auth.js");

async function getTraffic(date) {
  return new Promise(resolve => {
    const req = https.request(
      {
        host: "secure.gaug.es",
        path: `/gauges/${process.env.GAUGES_ID}/traffic${date ? "?date=" + date : ""}`,
        method: "get",
        headers: {
          "X-Gauges-Token": process.env.GAUGES_TOKEN
        }
      },
      resp => {
        let result = "";

        resp.on("data", function(chunk) {
          result += chunk;
        });
        resp.on("end", function() {
          resolve(JSON.parse(result));
        });
        resp.on("error", function(err) {
          resolve(err);
        });
      }
    );

    req.on("error", function(err) {
      resolve(err);
    });

    req.end();
  });
}

module.exports = async (req, res) => {
  const query = url.parse(req.url, true).query;

  const user = authed(req, res);

  if (!user) {
    return sendToAuthProvider(req, res);
  }

  const thisMonthResp = await getTraffic();
  const lastMonthDate = new url.URL(thisMonthResp.urls.older)
    .searchParams.get("date")
  const lastMonthResp = await getTraffic(lastMonthDate);
  
  const traffic = {
    traffic: lastMonthResp.traffic.concat(thisMonthResp.traffic).slice(-30),
  }
  
  traffic.views = traffic.traffic.reduce((acc, d) => acc + d.views, 0);
  traffic.people = traffic.traffic.reduce((acc, d) => acc + d.people, 0);

  const width = traffic.traffic.length * 3 + 4;
  const aspectRatio =
    query.h && query.w ? parseInt(query.w) / parseInt(query.h) : 3;

  const height = width / aspectRatio;

  const viewsMax = Math.max.apply(null, traffic.traffic.map(d => d.views));
  const viewsK = viewsMax ? height / viewsMax : 0;
  const peopleMax = Math.max.apply(null, traffic.traffic.map(d => d.people));
  const peopleK = peopleMax ? height / peopleMax : 0;

  res.setHeader("Content-Type", "image/svg+xml");

  return `<?xml version="1.0" standalone="no"?>
    <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
    <svg viewBox="0 0 ${width} ${height +
    2}" preserveAspectRatio="xMinYMin meet" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${width}"
        y="${height / 2}"
        font-size="${height / 2}"
        font-family="Menlo,'Roboto Mono','Courier New',monospace"
        text-anchor="end"
        fill="rgb(0, 0, 255)"
      >${traffic.views}</text>
      <text
        x="${width}"
        y="${height}"
        font-size="${height / 2}"
        font-family="Menlo,'Roboto Mono','Courier New',monospace"
        text-anchor="end"
        fill="rgb(255, 0, 0)"
      >${traffic.people}</text>
      <g transform="translate(0, ${height + 2}) scale(1,-1)">
        <polyline
          points="${traffic.traffic
            .map(d => d.views * viewsK)
            .map((h, i) => `${i * 3},${h} ${(i + 1) * 3},${h}`)
            .join(" ")}"
          fill="none"
          stroke="rgba(0, 0, 255, 0.5)"
          strokeWidth="10"
        />
        <polyline
          points="${traffic.traffic
            .map(d => d.people * peopleK)
            .map((h, i) => `${i * 3},${h} ${(i + 1) * 3},${h}`)
            .join(" ")}"
          fill="none"
          stroke="rgba(255, 0, 0, 0.5)"
          strokeWidth="10"
        />
      </g>
    </svg>
  `;
};
module.exports.getTraffic = getTraffic;
