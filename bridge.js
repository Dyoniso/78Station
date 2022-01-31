const express = require('express')
const Logger = require('./api/logger')
const fs = require('fs')

exports.MODE_BRIDGE = false

exports.static = (app, path, route) => {
    let br = ''
    if (p.route && p.route.length > 0) br = '/'
    app.use(br + route + '/files', express.static(path + '/public/files'))
    app.use(br + route + '/pub', express.static(path + '/public/lib'))
    app.use(br + route + '/pub', express.static(path + '/public/js'))
    app.use(br + route + '/pub', express.static(path + '/public/css'))
    app.use(br + route + '/pub', express.static(path + '/public/assets'))
}

exports.init = (path, app, p, io) => {
    const logger = new Logger(p.name)

    module.exports.app = app
    module.exports.io = io
    exports.MODE_BRIDGE = true
    exports.path = path
    exports.P = p

    let DEFAULT_BOARDS = []
    try {
        if (fs.existsSync('./boards.json')) DEFAULT_BOARDS = JSON.parse(fs.readFileSync('./boards.json'))
    } catch (err) {
        logger.fatal('Error after get boards file. Check the file syntax')
    }
    exports.DEFAULT_BOARDS = DEFAULT_BOARDS

    let ms = Math.floor(process.hrtime()[0] * 1000000 + process.hrtime()[1] / 1000) + 'ms'
    exports.manager = require('./api/manager')
    logger.ok(`Api Manager Started! [${ms}]`)
}