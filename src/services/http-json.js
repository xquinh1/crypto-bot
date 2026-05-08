const https = require("https")

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = ""

        response.on("data", (chunk) => {
          body += chunk
        })

        response.on("end", () => {
          try {
            resolve(JSON.parse(body))
          } catch (error) {
            reject(new Error(`Invalid JSON response from ${url}`))
          }
        })
      })
      .on("error", reject)
  })
}

module.exports = {
  getJson,
}

