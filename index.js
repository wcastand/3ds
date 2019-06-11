const crypto = require('crypto')
const { stringify, parse } = require('querystring')
const FormData = require('form-data')
const fetch = require('node-fetch')
const uuid = require('uuid/v4')
const { send, json, text, buffer } = require('micro')
const { router, get, post } = require('microrouter')
const h = require('vhtml')
const html = require('htm').bind(h)

const key = 'Circle4Take40Idea'
const cardstream_int_url = 'https://gateway.cardstream.com/direct/'
const cardstream_merchant_id_3ds = '100856'
const test_card = {
  number: '4929421234600821',
  cvv: 356,
  expirem: 12,
  expirey: 19,
  address: `Flat 6 Primrose Rise 347 Lavender Road Northampton`,
  postcode: 'NN17 8YG',
}
const transactionUnique = uuid()
const test_data = (threeDSMD, threeDSPaRes) => ({
  action: 'VERIFY',
  amount: 0,
  cardCVV: test_card.cvv,
  cardExpiryMonth: test_card.expirem,
  cardExpiryYear: test_card.expirey,
  cardNumber: test_card.number,
  countryCode: 'GB',
  currencyCode: 'GBP',
  customerAddress: test_card.address.replace(/ /g, ''),
  customerPostCode: test_card.postcode.replace(/ /g, ''),
  merchantID: cardstream_merchant_id_3ds,
  ...(threeDSMD && { threeDSMD }),
  ...(threeDSPaRes && { threeDSPaRes }),
  threeDSRequired: 'Y',
  transactionUnique,
  type: 1,
})

const generateBody = (SIGNATURE_KEY, obj) => {
  const body = stringify(obj)
  return (
    body +
    '&signature=' +
    crypto
      .createHash('SHA512')
      .update(body + SIGNATURE_KEY)
      .digest('hex')
  )
}

const callc = params => {
  const body = generateBody(key, params)
  return fetch(cardstream_int_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  })
    .then(res => res.buffer())
    .then(buffer => buffer.toString('utf8'))
    .then(str => parse(str))
}

const callback = async (req, res) => {
  const parsedRes = parse(await text(req))
  return await callc(test_data(parsedRes.MD, parsedRes.PaRes))
    .then(async data => {
      if (data.responseCode === '0') return send(res, 200, 'Transaction successfull')
      else return send(res, 200, data)
    })
    .catch(e => send(res, 500, e.message))
}
const send3DS = async (res, { uri, MD, PaReq, TermUrl }) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html`
    <html>
      <head>
        <style>
          body {
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div>
          <h1>HTM λ News</h1>
          <p>We need 3D secure auth from you.</p>
          <form action="${uri}" method="POST">
            <input type="hidden" name="MD" value="${MD}" />
            <input type="hidden" name="PaReq" value="${PaReq}" />
            <input type="hidden" name="TermUrl" value="${TermUrl}" />
            <button type="submit">Continue</button>
          </form>
        </div>
      </body>
    </html>
  `)
}

const index = async (req, res) => {
  console.log('index')
  const callback = `http://${req.headers.host}/callback`
  await callc(test_data())
    .then(async data => {
      console.log(data)
      if (data.responseCode === '65802')
        send3DS(res, {
          uri: data.threeDSACSURL,
          MD: data.threeDSMD,
          PaReq: data.threeDSPaReq,
          TermUrl: callback,
        })
      else send(res, 200, data)
    })
    .catch(e => send(res, 500, e.message))
}
const success = async (req, res) => {
  send(res, 200, 'Success Tx')
}

module.exports = router(post('/callback', callback), get('/success', success), get('/*', index))
