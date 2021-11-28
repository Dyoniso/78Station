const app = require('../app').app
const Logger = require('./logger')
const logger = new Logger('app')
const db = require('./database')
const tables = require('./sync').tables

app.get('/', (req, res) => {
    return renderThreadView(req, res)
})

app.put('/thread', (req, res) => {
    threadLogic(req, res)
})

async function getBoardsList() {
    let boards = []
    try {
        let q = await db.query(`SELECT * FROM ${tables.BOARD}`)
        boards = boards.concat(q)

    } catch (err) {
        logger.error('Error after get all boards', err)
    }
    return boards
}

async function renderThreadView(req, res) {
    const boards = await getBoardsList()
    return res.render('./threadView.pug', { boards : boards })
}

function threadLogic(req, res) {
    let username = req.body.username
    let content = req.body.content
    let file = req.body.file

    try {
        db.query()
        return res.status(200).end()
    } catch (err) {
        logger.fatal('Error after register query')
        return res.status(500).end()
    }
}