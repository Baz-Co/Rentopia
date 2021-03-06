let router = require('koa-router')()
let braintree = require('braintree')
let config = require('../.././braintreeConfig.js')
let Landlords = require('./landlords.js')
let Promise = require('bluebird')

let gateway = braintree.connect({
  environment: braintree.Environment.Sandbox,
  merchantId: config.MERCHANT_ID,
  publicKey: config.PUBLIC_KEY,
  privateKey: config.PRIVATE_KEY
})

const getSenderTransactions = async (ctx, tenantOrLandlord) => {
  let results = ctx.db.query(`SELECT * FROM transactions WHERE sender_id = ${tenantOrLandlord.user_id};`)
  return results.rows
}

const getRecipientTransactions = async (ctx, tenantOrLandlord) => {
  let results = ctx.db.query(`SELECT * FROM transactions WHERE recipient_id = ${tenantOrLandlord.user_id};`)
  return results.rows
}

const getUserTransactions = async (ctx, tenantOrLandlord) => {
  let output, sent, received
  [sent, received] = await Promise.all([
    getSenderTransactions(ctx, tenantOrLandlord),
    getRecipientTransactions(ctx, tenantOrLandlord)
  ])
  output = { sentPayments: sent }
  output.receivedPayments = received
  return output
}
exports.getUserTransactions = getUserTransactions

const createTransaction = async (ctx, paymentIdentifier) => {
  let results = await ctx.db.query(`INSERT INTO transactions (payment_identifier, transaction_amount, sender_id, recipient_id) VALUES ('${paymentIdentifier}', ${ctx.request.body.transaction_amount}, ${ctx.request.body.sender_id}, ${ctx.request.body.recipient_id}) RETURNING *;`)
  results = results.rows[0]
  return results
}
exports.createTransaction = createTransaction

router
  .get('/:id', async (ctx, next) => {
    let paymentRows
    paymentRows = ctx.db.query(`SELECT * FROM transactions WHERE transaction_id = ${ctx.params.id};`)
    ctx.body = await paymentRows.rows[0]
  })
  .post('/payRent', async ctx => {
    // ctx.request.body = {transaction_amount, sender_id, recipient_id}  ID's are user_id's
    let nonceFromClient = ctx.request.body.nonce

    let result = await gateway.transaction.sale({
      merchantAccountId: 'jordan_hoang_instant_8n6sfbpx',
      amount: "500.00",
      paymentMethodNonce: 'fake-valid-nonce',
      options: {
        submitForSettlement: true
      },
      serviceFeeAmount: "00.00"
    })

    // console.log(result)
    let paymentIdentifier = result.transaction.id
    if (result.success) {
      //create transaction record here
      let transaction = await createTransaction(ctx, paymentIdentifier)
      if(transaction) {
        ctx.response.status = 201
        ctx.body = 'Successful payment'
      } else {
        ctx.response.status = 400
        ctx.body = 'Error creating transaction'
      }
    }
  })
  .put('/submerchantCreation/:landlord_id', async ctx => {
    ctx.request.body.merchantAccountParams.masterMerchantAccountId = config.MERCHANT_ACCOUNT_ID
    let merchantAccountParams = ctx.request.body.merchantAccountParams

    let result = await gateway.merchantAccount.create(merchantAccountParams)
    if (!result.success) {
      ctx.response.status = 400
      ctx.body = result.message
    } else {      
      // update the landlord record with the merchantAccount id using ctx.request.body.landlord_id  
      ctx.request.body.merchant_id = result.merchantAccount.id
      let landlord = await Landlords.updateMerchant(ctx, ctx.params.landlord_id)  
      if(landlord) {
        ctx.response.status = 201
        ctx.body = landlord   
      } else {
        ctx.response.status = 400
        ctx.body = 'Error updating Landlord'
      }
    }
  }) 
  exports.routes = router

// module.exports = {
//   routes: router,
//   getUserTransactions: getUserTransactions,
// }
