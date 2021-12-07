const md5 = require('md5')
const Logger = require('./logger')
const logger = new Logger('app')

exports.uidGen = (req, res, next) => {
    if (req.ip) {
        const xip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
        req.uid = md5(xip)
        return next()
    }
    return res.status(401).send({
        code : 4632,
        err : 'Error creating access code'
    })
}

exports.uidGenSocket = (socket, next) => {
    let ip = socket.handshake.headers["x-real-ip"] || socket.request.connection.remoteAddress

    try {
        socket.uid = md5(ip)
        return next()
    } catch (err) {
        logger.fatal('Fatal error after check client uid')
    }
    return socket.disconnect()
}