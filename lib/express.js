const bodyParser = require('body-parser')
const morgan = require('morgan')
const xpath = require('xpath')

const { SignedXml, FileKeyInfo } = require('xml-crypto')
const { DOMParser } = require('xmldom')

const samlArtifact = require('./saml-artifact')

const domParser = new DOMParser()
const dom = xmlString => domParser.parseFromString(xmlString)

function config (app, { assertEndpoint, showLoginPage, serviceProviderCertPath }) {
  function verifySignature (xml) {
    const [ signature ] =
      xpath.select("//*[local-name(.)='Signature']", xml) || []
    const [ artifactResolvePayload ] =
      xpath.select("//*[local-name(.)='ArtifactResolve']", xml) || []
    const verifier = new SignedXml()
    verifier.keyInfoProvider = new FileKeyInfo(serviceProviderCertPath)
    verifier.loadSignature(signature.toString())
    return verifier.checkSignature(artifactResolvePayload.toString())
  }

  app.use(morgan('combined'))

  app.get('/logininitial', (req, res) => {
    const relayState = encodeURIComponent(req.query.Target)
    const samlArt = samlArtifact(req.query.PartnerId)
    const assertURL =
      `${assertEndpoint}?SAMLart=${samlArt}&RelayState=${relayState}`
    console.warn(`Redirecting to ${assertURL}`)
    if (showLoginPage) {
      res.send(`
        <html><body>Click to login <a href="${assertURL}">here</a></body></html>
      `)
    } else {
      res.redirect(assertURL)
    }
  })

  app.post(
    '/soap',
    bodyParser.text({ type: 'text/xml' }),
    (req, res) => {
      // Extract the body of the SOAP request
      const { body } = req
      const xml = dom(body)

      if (!verifySignature(xml)) {
        res.status(400).send('Request has bad signature')
      } else {
        // Grab the SAML artifact
        // TODO: verify the SAML artifact is something we sent
        // TODO: do something about the partner entity id
        const samlArtifact = xpath.select("string(//*[local-name(.)='Artifact'])", xml)
        console.warn(`Received SAML Artifact ${samlArtifact}`)
        // take the template and plug in the typical SingPass/CorpPass response
        // Encrypt the payload and sign at Assertion, and at Response
        res.send('OK')
      }
    }
  )

  return app
}

module.exports = { config }