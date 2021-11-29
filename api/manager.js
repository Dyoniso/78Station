const app = require('../app').app
const io = require('../app').io
const Logger = require('./logger')
const logger = new Logger('app')
const db = require('./database')
const tables = require('./sync').tables
const pug = require('pug')
const fm = require('./fileManager')
const utils = require('./utils')

app.get('/', (req, res) => {
    return renderThreadView(req, res)
})

;(async() => {
    let boards = await db.query(`SELECT * FROM ${tables.BOARD}`)
    for (b of boards) {
        app.get('/' + b.path, (req, res) => {
            return renderThreadView(req, res, b.path)
        })
    }
})()


async function getThreads(board, limit, offSet) {
    if (!offSet || isNaN(offSet) || offSet < 0) offSet = 0

    let threads = []
    try {
        let rst = await db.query(`SELECT * FROM ${tables.BOARD}.${board} ORDER BY id DESC OFFSET $2 LIMIT $1`, [limit, offSet])
        for (t of rst) threads.push(formatThread(t))

    } catch (err) {
        logger.error('Error after get thread data', err)
    }

    threads.sort((x, y) => x.id - y.id)
    return threads
}

function formatThread(thread) {
    if (thread.file_info && thread.file_info !== '') thread.file_info = JSON.parse(thread.file_info)
    let thd = {
        id : thread.id,
        title : thread.title,
        username : thread.username,
        content :  thread.content,
        rawDate : thread.date,
        date : utils.formatTimestamp(thread.date),
    }
    if (thread.file_info && thread.file_info) {
        thd.fileInfo = {
            name : thread.file_info.name,
            rawSize : thread.file_info.size,
            size : utils.formatSize(thread.file_info.size),
            mime : thread.file_info.mime,
        }
    }
    return thd
}

//Socket.io
io.of('thread').on('connection', async(socket) => {
    let board = 'b'
    let threads = await getThreads(board, 10)

    let html = ''
    for(t of threads) {
       html = html + pug.renderFile('./public/pug/templades/threadItem.pug', { thread : t, board : 'b' })
    }
    socket.emit('channel layer thread begin', html)

    socket.on('channel layer thread scroll', async(obj) => {
        let total = parseInt(obj.total)
        if (!total || total < 0 || isNaN(total)) total = -1
        if (total > 0) {
            let threads = await getThreads(board, 10, total)
            let html = ''
            for (t of threads) {
                html = html + pug.renderFile('./public/pug/templades/threadItem.pug', { thread : t, board : board })
            }
            socket.emit('channel layer thread scroll', html)
        }
    })

    socket.on('channel thread', async(obj) => {
        let username = obj.username
        let content = obj.content
        let file = obj.file
        let board = obj.path

        let fileInfo = ''
        let base64 = ''
        if (file !== null) {
            base64 = new Buffer.from(file.result.split(',')[1], 'base64'),
            fileInfo = {
                name : file.name
            }
            fileInfo.size = base64.length
            fileInfo.mime = file.result.match(/[^:/]\w+(?=;|,)/)[0]
        }

        try {
            let q = await db.query(`SELECT id FROM ${tables.BOARD} WHERE path = $1`, [board])
            if (q[0] && q[0].id) {
                let q = await db.query(`INSERT INTO ${tables.BOARD}.${board}(title,username,content,file_info) VALUES ($1, $2, $3, $4) RETURNING id,date,file_info`, ['', username, content, fileInfo])
                q = q[0]
                let ctn = content

                if (ctn.length > 120) ctn = ctn.substr(0, 120)
                if (fileInfo && fileInfo !== '') {
                    await fm.registerFile(board, { name : fileInfo.name, base64 : base64 })
                }
                logger.ok(`Thread created! No. ${ctn} Title: ${0} Content: ${content}`)
                
                let thread = formatThread({
                    id : q.id,
                    title : '',
                    username : username,
                    content : content,
                    file_info : q.file_info,
                    date : q.date,
                })

                for (socket of io.of('/thread').sockets.values()) {
                    socket.emit('channel layer thread', pug.renderFile('./public/pug/templades/threadItem.pug', { 
                        thread : thread,
                        board : board,
                    }))
                }
            }

        } catch (err) {
            logger.error('Error in register thread in db', err)
        }
    })
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

async function renderThreadView(req, res, path) {
    if (!path) path = 'b'
    const boards = await getBoardsList()
    return res.render('./threadView.pug', { boards : boards, path : path })
}