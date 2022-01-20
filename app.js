//Express
require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()

const PORT = process.env.PORT || process.env.SERVER_PORT
const HOSTNAME = process.env.HOSTNAME

const DEFAULT_BOARDS = [ 
    { name      :       'International',   path : 'int' },
    { name      :       'Random',          path : 'b'   },
    { name      :       'Debug',           path : 'd'   },
    { name      :       'Radio',           path : 'r'   },
    { name      :       'TV',              path : 'tv'   },
    { name      :       'Anime',           path : 'a'   },
    { name      :       'Hentai',          path : 'h'   },
]
exports.DEFAULT_BOARDS = DEFAULT_BOARDS

const Logger = require('./api/logger')
const logger = new Logger('app')

app.set('view engine', 'pug')
app.set('views', __dirname + '/public/pug')
app.set('view options', { pretty: true })

app.use('/files', express.static('public/files'))
app.use('/pub', express.static('public/lib'))
app.use('/pub', express.static('public/js'))
app.use('/pub', express.static('public/css'))
app.use('/pub', express.static('public/assets'))

app.use(express.json({ limit:'12mb' }))

const httpServer = http.createServer(app)
const io = new Server(httpServer, { maxHttpBufferSize: 12e8 })

httpServer.listen(PORT, HOSTNAME, () => {
    logger.ok(`78Station API Started! Listening on port ${HOSTNAME}:${PORT}`)
})

module.exports.app = app
module.exports.io = io

let ms = Math.floor(process.hrtime()[0] * 1000000 + process.hrtime()[1] / 1000) + 'ms'
exports.sync = require('./api/sync').init(() => {
    exports.manager = require('./api/manager')
    logger.ok(`Api Manager Started! [${ms}]`)
})
