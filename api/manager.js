const app = require('../app').app
const io = require('../app').io
const Logger = require('./logger')
const logger = new Logger('app')
const db = require('./database')
const pug = require('pug')
const fm = require('./fileManager')
const utils = require('./utils')

const tables = require('./sync').tables
const schema = require('./sync').schema

const POST_MODE_THREAD = 'thread'
const POST_MODE_REPLY = 'reply'

app.get('/', (req, res) => {
    return renderLayerView(req, res)
})

;(async() => {
    let boards = await db.query(`SELECT * FROM ${tables.BOARD}`)
    for (b of boards) {
        app.get('/' + b.path, (req, res) => {
            return renderLayerView(req, res, b.path)
        })
    }
})()

async function getThreadById(board, id) {
    if (!id || isNaN(id)) id = -1

    let thread = null
    if (id > 0) {
        try {
            let q = await db.query(`SELECT * FROM ${schema.BOARD}.${board} WHERE id = $1`, id)
            q = q[0]
            if (q) thread = formatThread(q)

        } catch (err) {
            logger.error('Error after get thread by id: '+ id, err)
        }
    }
    return thread
}

async function getThreadReplies(board, thid, limit) {
    if (!limit || isNaN(limit)) limit = 25
    if (!thid || isNaN(thid)) thid = -1

    let replies = []
    if (thid > 0) {
        try {
            let q = await db.query(`SELECT * FROM ${schema.THREAD_REPLY}.${board} WHERE thid = $1 LIMIT $2`, [thid, limit])
            if (q) for (r of q) replies.push(formatThreadReply(r))

        } catch (err) {
            logger.error('Error after get thread replies from thid: '+ thid, err)
        }
    }
    return replies
}

async function getThreads(board, limit, offSet) {
    if (!offSet || isNaN(offSet) || offSet < 0) offSet = 0

    let threads = []
    try {
        let rst = await db.query(`SELECT * FROM ${schema.BOARD}.${board} ORDER BY id DESC OFFSET $2 LIMIT $1`, [limit, offSet])
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

function formatThreadReply(reply) {
    if (reply.file_info && reply.file_info !== '') reply.file_info = JSON.parse(reply.file_info)
    let rpy = {
        id : reply.id,
        username : reply.username,
        content : reply.content,
        rawDate : reply.date,
        date : utils.formatTimestamp(reply.date),
    }
    if (reply.file_info && reply.file_info !== '') {
        rpy.fileInfo = {
            name : reply.file_info.name,
            rawSize : reply.file_info.size,
            size : utils.formatSize(reply.file_info.size),
            mime : reply.file_info.mime,
        }
    }
    return rpy
}

//Socket.io
io.of('thread').on('connection', async(socket) => {
    let handshakeData = socket.request;
    let board = handshakeData._query['board']
    let threads = await getThreads(board, 10)

    let html = ''
    for(t of threads) {
       html = html + pug.renderFile('./public/pug/templades/itemThread.pug', { thread : t, board : 'b' })
    }
    socket.emit('channel layer thread begin', html)

    socket.on('channel thread connect', async(obj) => {
        let id = parseInt(obj.thid)

        if (!id || id < 0 || isNaN(id)) id = -1
        if (id < 0) {} //ERROR MESSAGE

        let thread = await getThreadById(board, id)
        if (thread) {
            socket.emit('channel layer reply begin', pug.renderFile('./public/pug/templades/threadView.pug', {
                thread : thread,
                board : board,
            }))
            socket.insideThread = id
        } else {
            //ERROR MESSAGE
        }
    })

    socket.on('channel layer thread scroll', async(obj) => {
        let total = parseInt(obj.total)
        if (!total || total < 0 || isNaN(total)) total = -1
        if (total > 0) {
            let threads = await getThreads(board, 10, total)
            let html = ''
            for (t of threads) {
                html = html + pug.renderFile('./public/pug/templades/itemThread.pug', { thread : t, board : board })
            }
            socket.emit('channel layer thread scroll', html)
        }
    })

    async function addPost(obj, mode) {
        let username = obj.username
        let content = obj.content
        let file = obj.file
        let board = obj.path
        let thid = -1

        if (mode === POST_MODE_REPLY) thid = obj.thid

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
                let q = []
                
                if (mode === POST_MODE_REPLY) q = await db.query(`INSERT INTO ${schema.THREAD_REPLY}.${board}(thid, username,content,file_info) VALUES ($1, $2, $3, $4) RETURNING id,date,file_info`, [thid, username, content, fileInfo])
                else q = await db.query(`INSERT INTO ${schema.BOARD}.${board}(title,username,content,file_info) VALUES ($1, $2, $3, $4) RETURNING id,date,file_info`, ['', username, content, fileInfo])
                q = q[0]

                let ctn = content
                if (ctn.length > 120) ctn = ctn.substr(0, 120)

                if (fileInfo && fileInfo !== '') {
                    await fm.registerFile(board, { name : fileInfo.name, base64 : base64 })
                }

                if (POST_MODE_REPLY) {
                    logger.ok(`Reply: ${q.id} added in thread: ${thid}. Content: ${content}`)

                    let reply = formatThreadReply({
                        id : q.id,
                        thid : thid,
                        username : username,
                        content : content,
                        file_info : q.file_info,
                        date : q.date,
                    })
    
                    for (socket of io.of('/thread').sockets.values()) {
                        if (socket.insideThread === thid) {
                            socket.emit('channel layer reply', pug.renderFile('./public/pug/templades/itemReply.pug', { 
                                reply : reply,
                                board : board,
                            }))
                        }
                    }

                } else {
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
                        socket.emit('channel layer thread', pug.renderFile('./public/pug/templades/itemThread.pug', { 
                            thread : thread,
                            board : board,
                        }))
                    }
                } 
            }

        } catch (err) {
            logger.error('Error in register thread in db', err)
        }

    }

    socket.on('channel add thread reply', async(obj) => {
        await addPost(obj, POST_MODE_REPLY)
    })

    socket.on('channel add thread', async(obj) => {
        await addPost(obj, POST_MODE_THREAD)
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

async function renderLayerView(req, res, path) {
    if (!path) path = ''
    const boards = await getBoardsList()
    return res.render('./layerView.pug', { boards : boards, path : path })
}