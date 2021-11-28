//Express
require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()

const PORT = process.env.PORT || process.env.SERVER_PORT
const HOSTNAME = process.env.HOSTNAME

const DEFAULT_BOARDS = [ { name : 'random', path : 'b' } ]
exports.DEFAULT_BOARDS = DEFAULT_BOARDS

const Logger = require('./api/logger')
const logger = new Logger('app')

app.set('view engine', 'pug')
app.set('views', __dirname + '/public/pug')
app.set('view options', { pretty: true })

app.use('/pub', express.static('public/lib'))
app.use('/pub', express.static('public/js'))
app.use('/pub', express.static('public/css'))
app.use('/pub', express.static('public/assets'))

app.use(express.json({ limit:'8mb' }))

const httpServer = http.createServer(app)
const io = new Server(httpServer)

httpServer.listen(PORT, HOSTNAME, () => {
    logger.ok(`Draweb API Started! Listening on port ${HOSTNAME}:${PORT}`)
})

module.exports.app = app
module.exports.io = io

let ms = Math.floor(process.hrtime()[0] * 1000000 + process.hrtime()[1] / 1000) + 'ms'
exports.sync = require('./api/sync')
exports.manager = require('./api/manager')
logger.ok(`Api Manager Started! [${ms}]`)
