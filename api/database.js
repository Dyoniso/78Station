require('dotenv').config()
const promise = require('pg-promise')()
const db = promise(process.env.DATABASE_URL)

module.exports = {
    query: async(text, params) => await db.any(text, params)
}