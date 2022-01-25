require('dotenv').config()
const app = require('../app').app
const io = require('../app').io
const Logger = require('./logger')
const logger = new Logger('app')
const db = require('./database')
const pug = require('pug')
const fm = require('./fileManager')
const utils = require('./utils')
const sizeOf = require('image-size')
const middle = require('./middle')
const fs = require('fs')

const tables = require('./sync').tables
const schema = require('./sync').schema

const smm = {
    FATAL : 'fatal',
    ERROR : 'error',
    SUCCESS : 'success'
}

const allowedFormats = ['jpeg','jpg','gif','bmp','png','m4v','avi','mpg','mp4','webm','webp','mp3', 'mpeg', 'ogg']

app.all('*', middle.uidGen, async(req, res, next) => {
    return next()      
})

app.get('/', (req, res) => {
    return renderLayerView(req, res)
})

;(async() => {
    logger.info('Starting Express route sync..')

    let boards = await db.query(`SELECT * FROM ${tables.BOARD}`)
    for (b of boards) {
        let board = b.path
        app.get('/' + board, (req, res) => {
            return renderLayerView(req, res, b.path)
        })
        app.get('/' + board + '/reply/:rid', async(req, res) => {
            return await renderReplyPreview(req, res, board, req.params.rid)
        })
        logger.info(`> Board Express route added! [Route: /${board}]`)
    }
})()

async function renderReplyPreview(req, res, board, rid) {
    rid = parseInt(rid)
    if (isNaN(rid) || rid <= 0) return res.status(400).end('Invalid reply id')

    let reply = await getReplyById(board, rid)
    return res.render('./templades/replyPreview.pug', {
        board : board,
        reply : reply,
    })
}

async function getReplyById(board, rid) {
    let reply = null
    try {
        let q = await db.query(`SELECT * FROM ${schema.BOARD}.${board} WHERE id = $1`, [rid])
        if (q[0]) reply = formatReply(q[0])

    } catch (err) {
        logger.error(`Error after get reply. Rid: ${rid} Board: ${board}`)
    }
    return reply
}

async function getBoardReplies(board, limit, uid, offSet) {
    if (!offSet || isNaN(offSet) || offSet < 0) offSet = 0

    let replies = []
    try {
        let rst = await db.query(`SELECT * FROM ${schema.BOARD}.${board} ORDER BY id DESC OFFSET $2 LIMIT $1`, [limit, offSet])
        for (t of rst) replies.push(formatReply(t, uid))

    } catch (err) {
        logger.error('Error after get board data', err)
    }

    replies.sort((x, y) =>  x.id - y.id)
    return replies
}

function formatReply(reply, uid) {
    if (reply.file_info && reply.file_info !== '') reply.file_info = JSON.parse(reply.file_info)

    let self = false
    if (uid && reply.uid === uid) self = true

    let rpy = {
        id : reply.id,
        self : self,
        username : reply.username,
        content : reply.content,
        rawDate : reply.date,
        date : utils.formatTimestamp(reply.date),
    }
    try {
        rpy.mentions = JSON.parse(reply.mentions)
    } catch (err) {
        rpy.mentions = []
    }
    if (reply.file_info && reply.file_info !== '') {
        let thumbName = reply.file_info.thumbName
        rpy.fileInfo = {
            name : reply.file_info.name,
            rawSize : reply.file_info.size,
            size : utils.formatSize(reply.file_info.size),
            mime : reply.file_info.mime,
            dims : reply.file_info.dims,
            thumbName : thumbName ? thumbName : '',
        }
    }
    return rpy
}

async function checkBoardExists(board) {
    let exists = false
    try {
        let q = await db.query(`SELECT path FROM ${tables.BOARD} WHERE path = $1`, [board])
        exists = Boolean(q[0] && q[0].path)

    } catch (err) {
        logger.error('Error after check if board exists. Board: '+board)
    }
    return exists
}

function translateContent(content, board) {
    let rexhttp = new RegExp(/(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/g)
    let rexSpoiler = new RegExp(/\[spoiler\](.*)\[\/spoiler\]/g)

    let rexIvQuote = new RegExp(/^&lt;(.*)$/mg)
    let rexBold = new RegExp(/\*\*(.*)\*\*/g)
    let rexItalic = new RegExp(/&#39;&#39;(.*)&#39;&#39;/g)
    let rexThrough = new RegExp(/~~(.*)~~/g)
    let rexStroke = new RegExp(/==(.*)==/g)
    let rexUnderline = new RegExp(/__(.*)__/g)
    let rexQuote = new RegExp(/^&gt;(.*)$/mg)
    let rexQuoteReply = new RegExp(/^&gt;&gt;(\d+)/mg)
    let rexQuoteBoard = new RegExp(/^&gt;&gt;&gt;\/([a-zA-Z]+)\//mg)

    let quotedReplies = []
    let rexQuotedReplies = content.match(rexQuoteReply)
    if (rexQuotedReplies) {
        for (r of rexQuotedReplies) {
            try {
                quotedReplies.push(parseInt(r.replace(/&gt;&gt;/, '')))
            } catch (err) {}
        }
    }

    content = content
    .replace(rexhttp, '<a href="$1">$1</a>')
    .replace(rexSpoiler, '<span class="spoiler-content">$1</span>')
    .replace(rexQuoteBoard, `<a href="/$1" class="quote-board boardBtn" data-path="$1">&gt;&gt;&gt;/$1/</a>`)
    .replace(rexQuoteReply, `<a href="/${board}#$1" class="quote-reply">&gt;&gt;$1</a>`)
    .replace(rexQuote, '<span class="quote">&gt;$1</span>')
    .replace(rexIvQuote, '<span class="iv-quote">&lt;$1</span>')
    .replace(rexBold, '<span class="td-bold">$1</span>')
    .replace(rexItalic, '<span class="td-italic">$1</span>')
    .replace(rexStroke, '<span class="td-stroke">$1</span>')
    .replace(rexUnderline, '<span class="td-underline">$1</span>')
    .replace(rexThrough, '<span class="td-through">$1</span>')

    return { content : content, quoted : quotedReplies } 
}

//Board Title
async function getBoardTitle(board) {
    let title = ''
    try {
        let q = await db.query(`SELECT name FROM ${tables.BOARD} WHERE path = $1`, [board])
        if (q[0] && q[0].name) title = q[0].name
    } catch (err) {
        logger.error('Error after get board title', err)
    }
    return title
}

//ENV
let adminPassword = process.env.ADMIN_PASSWORD
let boardSize = parseInt(process.env.BOARD_SIZE)
let pageSize = parseInt(process.env.PAGE_SIZE)
if (!adminPassword) adminPassword = 'admin'
if (isNaN(boardSize) || boardSize <= 0) boardSize = 200
if (isNaN(pageSize) || pageSize <= 0) boardSize = 20


//Socket.io
let boardInterval = process.env.BOARD_INTERVAL
let waitList = []

function checkWaitList(uid) {
    waitList.push(uid)
    if (!waitList.includes(uid)) {
        setTimeout(() => {
            waitList = waitList.filter((i) => i !== uid)
        }, boardInterval * 1000)
        return true       
    }
    return false
}

io.of('board').use((socket, next) => {
    return middle.uidGenSocket(socket, next)
})

io.of('board').on('connection', async(socket) => {
    let handshakeData = socket.request;
    let board = handshakeData._query['board']
    let uid = socket.uid

    if (!(await checkBoardExists(board))) return throwMessage(smm.FATAL, `Selected board: ${board} not exists.`)
    socket.board = board
    
    function removeRoute(name) {
        let routes = app._router.stack
        routes.forEach((r, i) => {
            if (r.route) {
                if (r.route.path === name) routes.splice(i, 1)
            }
        })
    }

    let boardTitle = await getBoardTitle(board)

    function formatReplyToHtml(replies) {
        let html = pug.renderFile('./public/pug/templades/replyGroup.pug', { 
            replies : replies,
            board : board,
            boardTitle : boardTitle,
        })
        return html
    }

    let replies = await getBoardReplies(board, 20, uid)
    let html = formatReplyToHtml(replies)
    socket.emit('channel layer board begin', html)

    socket.latencyLimit = 1000
    socket.latencyCount = 0
    socket.on('channel latency', (obj) => {
        let latency = 0
        if (socket.latencyCount <= socket.latencyLimit) {
            let old = parseInt(obj.current)
            if (old < 0 || isNaN(old)) old = 0
            latency = Math.round((Date.now() - old) / 2)
            if (latency <= 0) latency = 0
        }
        socket.emit('channel latency', { latency : latency }) 
    })

    socket.on('channel post delete', async(obj) => {
        let replies = obj.items
        let password = obj.password

        if (Array.isArray(replies) === false) return throwMessage('Invalid reply request')

        let replyUpdated = []
        let delCountReplies = 0

        logger.info('Starting del reply sync from items: '+JSON.stringify(replies))
        for (r of replies) {
            try {
                let passQuery = ' AND password = $2'
                if (password === adminPassword) passQuery = ''
                let q = await db.query(`DELETE FROM ${schema.BOARD}.${board} WHERE id = $1${passQuery} RETURNING file_info,id`, [r.id, password])
                q = q[0]

                if (q) {
                    if (q.file_info && q.file_info !== '') {
                        let fileInfo = JSON.parse(q.file_info)
                        await fm.deleteFile(board, { name : fileInfo.name, thumbName : fileInfo.thumbName, })
                    }
    
                    if (q.id && q.id > 0) {
                        logger.ok(`* Reply Deleted! ID: ${t.id}`)
                        delCountReplies++
                        replyUpdated.push(q.id)
                    }
                }

            } catch (err) {
                logger.error('Error after delete Reply item. ID: '+r.id, err)
            }
        }

        if (delCountReplies > 0) {
            for (s of io.of('/board').sockets.values()) {
                if (s.board === board) {
                    s.emit('channel reply delete', replyUpdated)
                }
            }
            throwMessage(smm.SUCCESS, 'Reply successful deleted!')
            
        } else {
            throwMessage(smm.ERROR, 'Invalid Password')
        }
    })

    socket.on('channel layer board scroll', async(obj) => {
        let total = parseInt(obj.total)
        if (!total || total < 0 || isNaN(total)) total = -1
        if (total > 0) {
            let replies = await getBoardReplies(board, pageSize, uid, total)
            let html = ''
            for (r of replies) {
                html = html + pug.renderFile('./public/pug/templades/itemReply.pug', { 
                    reply : r, board : board
                })
            }
            socket.emit('channel layer board scroll', html)
        }
    })

    function throwMessage(mode, message, error) {
        let channel = 'channel status message'
        if (!error) error = false

        let obj = { mode : mode, message : message }
        switch (mode) {
            case smm.FATAL:
                socket.emit(channel, obj)
                socket.disconnect()
                break
                
            case smm.ERROR:
            case smm.SUCCESS:
                socket.emit(channel, obj)
                break
        }
    }

    function createFileInfo(file, board) {
        let filename = file.name
        let mime = file.result.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0]
        let base64 = new Buffer.from(file.result.split(',')[1], 'base64')
        let size = base64.length
        let dims = { width : 0, height : 0, }

        if (filename < 3) filename = utils.generateHash(12)
        if (filename > 120) filename = filename.substr(0, 120)

        try {
            let path = fm.filesPath + board
            if (fs.existsSync(path+'/'+filename)) filename = utils.generateHash(18) + '.' + mime.split('/').pop()

        } catch (err) {
            logger.error('Error in check if file exists')
        }

        let allowed = false
        for (f of allowedFormats) {
            if (f === mime.split('/').pop()) {
                allowed = true
                break
            }
        }
        if (allowed === false) return { error : 1, type : mime }

        try {
            dims = sizeOf(base64)

        } catch (err) {
            logger.info(`Error after get base64 dims. Mime type not allowed!`)
        }
        if (!dims.width || dims.width < 0 || isNaN(dims.width)) dims.width = 0
        if (!dims.width || dims.height < 0 || isNaN(dims.height)) dims.height = 0

        return {
            name : filename,
            mime : mime,
            base64 : base64,
            size : size,
            dims : dims,
            thumbName : '',
        }
    }

    async function addReplyPost(obj) {
        let username = obj.username
        let password = obj.password
        let content = obj.content
        let file = obj.file

        if (checkWaitList(uid) === true) {
            let intervalTime = boardInterval
            return throwMessage(smm.ERROR, `You must wait ${intervalTime} seconds to post again.`)
        }

        if (username <= 0) username = 'Anon'
        if (!password || password.length <= 0) password = utils.generateHash(14)
        if (!file && content.length <= 0) return throwMessage(smm.ERROR, 'Content cannot be empty')
        if (content.length > 8000) return throwMessage(smm.ERROR, 'The content of your post must be less than 8000 characters.')
        
        username = utils.htmlEnc(username)
        let converted = translateContent(utils.htmlEnc(content), board)
        content = converted.content
        
        let quoted = converted.quoted
        let fileInfo = ''
        let base64 = ''
        if (file !== null) {
            fileInfo = createFileInfo(file, board)
            if (fileInfo.error && fileInfo.error === 1) {
                return throwMessage(smm.ERROR, 'Your file does not have a valid format! Format: '+fileInfo.type)
            }

            base64 = fileInfo.base64
            delete fileInfo.base64
        }

        async function mentionReplyById(id, rid) {
            let max = 10

            try {
                let sequence = await db.query(`SELECT mentions FROM ${schema.BOARD}.${board} WHERE id = $1`, [ id ])
                sequence = sequence[0]
                if (sequence) {
                    try {
                        sequence = JSON.parse(sequence.mentions)
                        sequence.push(rid)
                        sequence.sort((x, y) => y - x)
                        if (sequence.length >= max) sequence.pop()
                        await db.query(`UPDATE ${schema.BOARD}.${board} SET mentions = $2 WHERE id = $1`, [ id, JSON.stringify(sequence) ])
                        
                    } catch (err) {}
                }
    
            } catch (err) {
                logger.error('Error after quote reply. Rid: '+rid)
            }
        }

        try {
            if (fileInfo && fileInfo !== '') {
                fileInfo.thumbName = await fm.registerFile(board, { name : fileInfo.name, base64 : base64, mime : fileInfo.mime })
            }

            let q = await db.query(`INSERT INTO ${schema.BOARD}.${board}(uid,username,content,file_info,password) VALUES ($1, $2, $3, $4, $5) RETURNING id,date,file_info`, [
                uid,
                username,
                content,
                fileInfo,
                password,
            ])
            q = q[0]
            
            if (q) {
                let mentionBundle = []
                for (r of quoted) {
                    mentionReplyById(r, q.id)
                    mentionBundle.push({ id : r, quoted : q.id })
                }
                for (s of io.of('/board').sockets.values()) {
                    if (s.board === board) {
                        s.emit('channel reply mentions', mentionBundle)
                    }
                }

                logger.ok(`Reply: ${q.id} added! Content: ${content}`)

                let ctn = content
                if (ctn.length > 120) ctn = ctn.substr(0, 120)

                let reply = formatReply({
                    id : q.id,
                    uid : uid,
                    username : username,
                    content : content,
                    file_info : q.file_info,
                    date : q.date,
                    mentions : [],
                }, uid)

                //Stack Size
                try {
                    let len = await db.query(`SELECT COUNT(*) FROM ${schema.BOARD}.${board}`)
                    len = len[0]
                    if (len) len = parseInt(len.count)
                    if (isNaN(len) || len <= 0) len = 0

                    if (len >= boardSize) {
                        let items = await db.query(`
                            DELETE FROM ${schema.BOARD}.${board} WHERE id IN (
                                SELECT id FROM ${schema.BOARD}.${board} ORDER BY id ASC LIMIT 1
                            ) RETURNING id,file_info;
                        `)
                            
                        let replyUpdated = []
                        for (q of items) {
                            logger.info(`Reply: ${q.id} overflowed the maximum board size. Reply Removed!`)

                            if (q && q.file_info && q.file_info !== '') {
                                let fileInfo = JSON.parse(q.file_info)
                                await fm.deleteFile(board, { name : fileInfo.name, thumbName : fileInfo.thumbName, })
                            }
                            replyUpdated.push(q.id)
                        }

                        for (s of io.of('/board').sockets.values()) {
                            if (s.board === board) {
                                s.emit('channel reply delete', replyUpdated)
                            }
                        }
                    }
    
                } catch (err) {
                    logger.error('Error after check stack size', err)
                }

                reply.self = false
                let html = pug.renderFile('./public/pug/templades/itemReply.pug', { 
                    reply : reply,
                    board : board
                })
                for (s of io.of('/board').sockets.values()) {
                    if (s.board === board && s.uid === uid) {
                        reply.self = true
                        s.emit('channel layer board', {
                            self : reply.self,
                            data : pug.renderFile('./public/pug/templades/itemReply.pug', { 
                                reply : reply,
                                board : board
                            })
                        })
                    } else if (board === s.board) {
                        s.emit('channel layer board', html)
                    }
                }    
            }

        } catch (err) {
            logger.error('Error in register reply in db', err)
            throwMessage(smm.ERROR, 'Error in create reply!')
        }
    }

    socket.on('channel add reply', async(obj) => {
        await addReplyPost(obj)
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