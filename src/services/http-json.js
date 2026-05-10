const https = require("https")
const http = require("http")

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

function getText(url, { maxBytes = 512000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === "http:" ? http : https
    let body = ""

    const request = client.get(parsedUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(getText(new URL(response.headers.location, parsedUrl).toString(), { maxBytes }))
        return
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume()
        reject(new Error(`HTTP ${response.statusCode} from ${url}`))
        return
      }

      response.setEncoding("utf8")

      response.on("data", (chunk) => {
        body += chunk

        if (Buffer.byteLength(body, "utf8") > maxBytes) {
          request.destroy(new Error(`Response exceeded ${maxBytes} bytes`))
        }
      })

      response.on("end", () => {
        resolve(body)
      })
    })

    request.setTimeout(15000, () => {
      request.destroy(new Error(`Request timed out for ${url}`))
    })

    request.on("error", reject)
  })
}

module.exports = {
  getJson,
  getText,
}
