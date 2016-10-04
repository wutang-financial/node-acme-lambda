import updateTXTRecord from '../../aws/route53/updateTXTRecord'
import getHostedZoneId from '../../aws/route53/getHostedZoneId'
import { RSA } from 'rsa-compat'
import crypto from 'crypto'
import dns from 'dns'
import config from '../../../config/default.json'
import promisify from 'es6-promisify'
const resolveTxt = promisify(dns.resolveTxt)

const getTokenDigest = (dnsChallenge, acctKeyPair) =>
  crypto.createHash('sha256').update(`${dnsChallenge.token}.${RSA.thumbprint(acctKeyPair)}`).digest()

const urlB64 = (buffer) => buffer.toString('base64').replace(/[+]/g, '-').replace(/\//g, '_').replace(/=/g, '')

const updateDNSChallenge = (dnsChallenge, acctKeyPair) => {
  return getHostedZoneId()
  .then((id) => updateTXTRecord(id, config['acme-domain'], urlB64(getTokenDigest(dnsChallenge, acctKeyPair))))
  .then((updated) => validateDNSChallenge(dnsChallenge, acctKeyPair))
  .catch((e) => {
    console.log(`Couldn't write token digest to DNS record.`)
    throw e
  })
}

const delayPromise = (delay) => (data) =>
  new Promise((resolve, reject) => {
    setTimeout(() => { resolve(data) }, delay)
  })

const dnsPreCheck = (expect) => (tryCount) =>
  resolveTxt(`_acme-challenge.${config['acme-domain']}`)
  .then((data) => ({
    tryCount: ++tryCount,
    result: (data[0][0] === expect)
  }))

const validateDNSChallenge = (dnsChallenge, acctKeyPair) =>
  retry(0, dnsPreCheck(urlB64(getTokenDigest(dnsChallenge, acctKeyPair))))
  .then((data) => {
    if (data.result) {
      return data.result
    } else {
      throw new Error('Could not pre-validate DNS TXT record')
    }
  })

const retry = (tryCount, promise) =>
  promise(tryCount).then(delayPromise(config['acme-dns-retry-delay-ms']))
  .then((data) =>
    (tryCount < config['acme-dns-retry'] && !data.result)
      ? retry(data.tryCount, promise)
      : data
  )

module.exports = updateDNSChallenge