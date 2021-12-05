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

const POST_MODE_THREAD = 'thread'
const POST_MODE_REPLY = 'reply'

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
        let path = '/' + b.path
        app.get(path, (req, res) => {
            return renderLayerView(req, res, b.path)
        })
        logger.info(`> Board Express route added! [Route: ${path}]`)

        let threads = await db.query(`SELECT id FROM ${schema.BOARD}.${b.path}`)
        for (t of threads) {
            let path = `/${b.path}/${t.id}`
            app.get(path, (req, res) => {
                return renderLayerView(req, res, b.path)
            })
            logger.info(`- Thread Express route added! [Route: ${path}]`) 
        }
    }
})()

async function getThreadById(board, id, uid) {
    if (!id || isNaN(id)) id = -1

    let thread = null
    if (id > 0) {
        try {
            let q = await db.query(`SELECT * FROM ${schema.BOARD}.${board} WHERE id = $1`, id)
            q = q[0]
            if (q) thread = formatThread(q, uid)

        } catch (err) {
            logger.error('Error after get thread by id: '+ id, err)
        }
    }
    return thread
}

async function getThreadReplies(board, thid, uid, limit) {
    if (!limit || isNaN(limit)) limit = 25
    if (!thid || isNaN(thid)) thid = -1

    let replies = []
    if (thid > 0) {
        try {
            let q = await db.query(`SELECT * FROM ${schema.THREAD_REPLY}.${board} WHERE thid = $1 ORDER BY id DESC LIMIT $2`, [thid, limit])
            if (q) for (r of q) replies.push(formatThreadReply(r, uid))

        } catch (err) {
            logger.error('Error after get thread replies from thid: '+ thid, err)
        }
    }

    replies.sort((x, y) => x.id - y.id)
    return replies
}

async function getThreads(board, limit, uid, offSet) {
    if (!offSet || isNaN(offSet) || offSet < 0) offSet = 0

    let threads = []
    try {
        let rst = await db.query(`SELECT * FROM ${schema.BOARD}.${board} ORDER BY updated ASC OFFSET $2 LIMIT $1`, [limit, offSet])
        for (t of rst) threads.push(formatThread(t, uid))

    } catch (err) {
        logger.error('Error after get thread data', err)
    }

    threads.sort((x, y) => x.updated - y.updated)
    return threads
}

function formatThread(thread, uid) {
    if (thread.file_info && thread.file_info !== '') thread.file_info = JSON.parse(thread.file_info)

    let op = false
    if (uid && uid === thread.uid) op = true

    let thd = {
        id : thread.id,
        op : op,
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
            dims : thread.file_info.dims,
        }
    }
    return thd
}

function formatThreadReply(reply, uid) {
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
    if (reply.file_info && reply.file_info !== '') {
        rpy.fileInfo = {
            name : reply.file_info.name,
            rawSize : reply.file_info.size,
            size : utils.formatSize(reply.file_info.size),
            mime : reply.file_info.mime,
            dims : reply.file_info.dims,
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

function translateContent(content, option) {
    if (!option) option = { board : '', threadId : -1 }

    let threadId = option.threadId
    let board = option.board

    let rexhttp = new RegExp(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/g)
    let rexSpoiler = new RegExp(/\[spoiler\](.*)\[\/spoiler\]/g)
    let rexRainbow = new RegExp(/\(\(\((.*)\)\)\)/g)

    let rexIvQuote = new RegExp(/^&lt;(.*)$/mg)
    let rexBold = new RegExp(/\*\*(.*)\*\*/g)
    let rexItalic = new RegExp(/&#39;&#39;(.*)&#39;&#39;/g)
    let rexThrough = new RegExp(/~~(.*)~~/g)
    let rexStroke = new RegExp(/==(.*)==/g)
    let rexUnderline = new RegExp(/__(.*)__/g)
    let rexQuote = new RegExp(/^&gt;(.*)$/mg)
    let rexQuoteReply = new RegExp(/^&gt;&gt;(\d+)/mg)
    let rexQuoteTopic = new RegExp(/^&gt;&gt;&gt;(\d+)/mg)
    let rexQuoteChain = new RegExp(/^&gt;&gt;&gt;\/([a-zA-Z]+)\/(\d+)/mg)

    content = content
    .replace(rexhttp, '<a href="$1">$1</a>')
    .replace(rexSpoiler, '<span class="spoiler-content">$1</span>')
    .replace(rexRainbow, '<span class="rainbow_text_animated">((($1)))</span>')
    .replace(rexQuoteChain, `<a href="/boards/view?chain=$1&topic_id=$2" class="quote-chain" data-chain="$1">&gt;&gt;&gt;/$1/$2</a>`)
    .replace(rexQuoteTopic, `<a href="/${board}/${threadId}#$1" class="quote-topic">&gt;&gt;&gt;$1</a>`)
    .replace(rexQuoteReply, `<a href="/${board}/${threadId}#$1" class="quote-reply">&gt;&gt;$1</a>`)
    .replace(rexQuote, '<span class="quote">&gt;$1</span>')
    .replace(rexIvQuote, '<span class="iv-quote">&lt;$1</span>')
    .replace(rexBold, '<span class="td-bold">$1</span>')
    .replace(rexItalic, '<span class="td-italic">$1</span>')
    .replace(rexStroke, '<span class="td-stroke">$1</span>')
    .replace(rexUnderline, '<span class="td-underline">$1</span>')
    .replace(rexThrough, '<span class="td-through">$1</span>')
    return content
}


//Socket.io
io.of('thread').use((socket, next) => {
    return middle.uidGenSocket(socket, next)
})

io.of('thread').on('connection', async(socket) => {
    let handshakeData = socket.request;
    let board = handshakeData._query['board']
    let uid = socket.uid
    socket.insideThread = -1
    socket.board = board

    if (!(await checkBoardExists(board))) return throwMessage(smm.FATAL, `Selected board: ${board} not exists.`)
    
    async function clearOnlyThread(thid) {
        for (s of io.of('/thread').sockets.values()) {
            if (s.insideThread === thid && s.board === board) {
                s.emit('channel layer thread begin', '<h4 class="p-2"> Thread Deleted! </h4>')
            }
        }  
    }

    async function updateReplyList(thid) {
        let replies = await getThreadReplies(board, thid, uid, 25)
        let html = formatReplyToHtml(replies)

        for (s of io.of('/thread').sockets.values()) {
            if (s.insideThread === thid && s.board === board) {
                s.emit('channel layer reply begin', html)
            }
        }
    }

    function removeRoute(name) {
        let routes = app._router.stack
        routes.forEach((r, i) => {
            if (r.route) {
                if (r.route.path === name) routes.splice(i, 1)
            }
        })
    }

    async function updateThreadList() {
        let threads = await getThreads(board, 10, uid)
        let html = await formatThreadToHtml(threads)

        for (s of io.of('/thread').sockets.values()) {
            if (s.insideThread === -1 && s.board === board) {
                s.emit('channel layer thread begin', html)
            }
        }
    }

    function formatReplyToHtml(replies) {
        let html = ''
        for (r of replies) {
            html = html + pug.renderFile('./public/pug/templades/itemReply.pug', { 
                reply : r,
                board : board
            })
        }
        return html
    }

    async function formatThreadToHtml(threads) {
        let html = ''
        for(t of threads) {
            let replies = await getThreadReplies(board, t.id, uid, 5)
            html = html + pug.renderFile('./public/pug/templades/itemThread.pug', { thread : t, board : board, replies : replies })
        }
        return html
    }

    let threads = await getThreads(board, 10, uid)
    let html = await formatThreadToHtml(threads)
    socket.emit('channel layer thread begin', html)

    socket.latencyLimit = 1000
    socket.latencyCount = 0
    socket.on('channel latency', (obj) => {
        let latency = 0
        if (socket.latencyCount <= socket.latencyLimit) {
            let old = parseInt(obj.current)
            if (old < 0 || isNaN(old)) old = 0
            latency = Date.now() - old
            if (latency <= 0) latency = 0
        }
        socket.emit('channel latency', { latency : latency }) 
    })

    socket.on('channel post delete', async(obj) => {
        let threads = obj.threads
        let replies = obj.replies
        let password = obj.password

        if (Array.isArray(threads) === false) return throwMessage('Invalid thread request')
        if (Array.isArray(replies) === false) return throwMessage('Invalid reply request')

        let delCountThreads = 0
        let delCountReplies = 0
        let threadUpdate = []

        logger.info('Starting del thread sync from items: '+JSON.stringify(threads))
        for (t of threads) {
            try {
                let q = await db.query(`DELETE FROM ${schema.BOARD}.${board} WHERE id = $1 AND password = $2 RETURNING file_info,id`, [t.id, password])
                q = q[0]

                if (q && q.file_info && q.file_info !== '') {
                    let fileInfo = JSON.parse(q.file_info)
                    await fm.deleteFile(board, { name : fileInfo.name })
                }

                if (q && q.id && q.id > 0) {
                    logger.ok(`* Thread Deleted! ID: ${t.id}`)
                    delCountThreads++

                    let path = `/${board}/${q.id}`
                    removeRoute(path)

                    if (!threadUpdate.includes(q.id)) threadUpdate.push(q.id)

                    let rs = await db.query(`DELETE FROM ${schema.THREAD_REPLY}.${board} WHERE thid = $1 RETURNING file_info,id`, [t.id])
                    for (r of rs) {
                        if (r.file_info && r.file_info !== '') {
                            let fileInfo = JSON.parse(q.file_info)
                            await fm.deleteFile(board, { name : fileInfo.name })   
                        }
                        delCountReplies++
                        logger.ok(`* Reply Deleted! Thid: ${t.id} ID: ${r.id}`)
                    }
                }

            } catch (err) {
                logger.error('Error after delete thread item. ID: '+t.id, err)
            }
        }

        logger.info('Starting del reply sync from items: '+JSON.stringify(replies))
        for (r of replies) {
            try {
                let q = await db.query(`DELETE FROM ${schema.THREAD_REPLY}.${board} WHERE id = $1 AND password = $3 AND thid = $2 RETURNING file_info,id`, [r.id, r.thid, password])
                q = q[0]

                if (q && q.file_info && q.file_info !== '') {
                    fileInfo = JSON.parse(q.file_info)
                    await fm.deleteFile(board, { name : fileInfo.name })
                }
                if (q && q.id && q.id > 0) {
                    logger.ok(`* Reply Deleted! ID: ${r.id} Thid: ${r.thid}`)
                    delCountReplies++
                    if (!threadUpdate.includes(r.thid)) threadUpdate.push(r.thid)
                }

            } catch (err) {
                logger.error(`Error after delete reply item. ID: ${r.id} Thid: ${r.thid}`, err)
            }
        }

        if (delCountThreads <= 0 && delCountReplies <= 0) throwMessage(smm.ERROR, 'Wrong password. Check if you wrote correctly')
        else {
            if (delCountThreads > 0) {
                updateThreadList() 
                for (t of threadUpdate) {
                    clearOnlyThread(t)
                }
            }
            else if (delCountReplies > 0) {
                updateThreadList()
                for (t of threadUpdate) updateReplyList(t)
            }
        }
    })

    socket.on('channel thread connect', async(obj) => {
        let id = parseInt(obj.thid)

        if (!id || id < 0 || isNaN(id)) id = -1
        if (id < 0) return throwMessage(smm.FATAL, 'Invalid thread id! ID: '+id, true) 

        let thread = await getThreadById(board, id)
        if (thread) {
            socket.emit('channel layer thread view', pug.renderFile('./public/pug/templades/threadView.pug', {
                thread : thread,
                board : board,
            }))
            socket.insideThread = id
            let replies = await getThreadReplies(board, id, uid, 25)

            let html = ''
            for (r of replies) {
                html = html + pug.renderFile('./public/pug/templades/itemReply.pug', { 
                    reply : r,
                    board : board
                 })
            }
            socket.emit('channel layer reply begin', html)
            
        } else {
            return throwMessage(smm.FATAL, 'Thread not found! ID: '+id, true)
        }
    })

    socket.on('channel layer thread scroll', async(obj) => {
        let total = parseInt(obj.total)
        if (!total || total < 0 || isNaN(total)) total = -1
        if (total > 0) {
            let threads = await getThreads(board, 10, uid, total)
            let html = ''
            for (t of threads) {
                html = html + pug.renderFile('./public/pug/templades/itemThread.pug', { thread : t, board : board })
            }
            socket.emit('channel layer thread scroll', html)
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
            console.log(filename)

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
            logger.error(`Error after get base64 dims.`)
        }
        if (!dims.width || dims.width < 0 || isNaN(dims.width)) dims.width = 0
        if (!dims.width || dims.height < 0 || isNaN(dims.height)) dims.height = 0

        return {
            name : filename,
            mime : mime,
            base64 : base64,
            size : size,
            dims : dims
        }
    }

    async function addPost(obj, mode) {
        let username = obj.username
        let title = obj.title
        let password = obj.password
        let content = obj.content
        let file = obj.file
        let thid = -1

        if (username <= 0) username = 'Anon'
        if (!password || password.length <= 0) password = utils.generateHash(14)
        if (mode === POST_MODE_REPLY) {
            thid = parseInt(obj.thid)
            if (thid < 0 || isNaN(thid)) return throwMessage(smm.ERROR, 'Invalid thread id. ID: '+thid)
        }
        else if (file === null || file.length === 0) return handleMessage(smm.ERROR, 'Your post needs an image, after all this is an imageboard')
        if (content.length <= 3) return throwMessage(smm.ERROR, 'Invalid thread. Write content longer than 3 characters')
        if (!title || title.length === 0) title = ''
        
        content = translateContent(utils.htmlEnc(content), { board : board, threadId : thid })

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

        try {
            let now = new Date().getTime()
            let q = []
                
            if (mode === POST_MODE_REPLY) q = await db.query(`INSERT INTO ${schema.THREAD_REPLY}.${board}(thid,uid,username,content,file_info,password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id,date,file_info`, [thid, uid, username, content, fileInfo, password])
            else q = await db.query(`INSERT INTO ${schema.BOARD}.${board}(uid,title,username,content,file_info,password,updated) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id,date,file_info`, [uid, title, username, content, fileInfo, password, now])
            q = q[0]

            let ctn = content
            if (ctn.length > 120) ctn = ctn.substr(0, 120)

            if (fileInfo && fileInfo !== '') {
                await fm.registerFile(board, { name : fileInfo.name, base64 : base64 })
            }

            if (mode === POST_MODE_REPLY) {
                logger.ok(`Reply: ${q.id} added in thread: ${thid}. Content: ${content}`)
                
                await db.query(`UPDATE ${schema.BOARD}.${board} SET updated = $2 WHERE id = $1`, [thid, now])

                let reply = formatThreadReply({
                    id : q.id,
                    thid : thid,
                    uid : uid,
                    username : username,
                    content : content,
                    file_info : q.file_info,
                    date : q.date,
                }, uid)

                throwMessage(smm.SUCCESS, `Reply Updated! ID: ${reply.id} in Thread: ${thid}`)

                let threads = await getThreads(board, 10, uid)
                for (s of io.of('/thread').sockets.values()) {
                    if (s.insideThread === -1) {
                        let html = ''
                        for(t of threads) {
                            let replies = await getThreadReplies(board, t.id, uid, 5)
                            html = html + pug.renderFile('./public/pug/templades/itemThread.pug', { thread : t, board : board, replies : replies })
                        }
                        sock.emit('channel layer thread begin', html)

                    } else if (s.insideThread === thid) {
                        s.emit('channel layer reply', pug.renderFile('./public/pug/templades/itemReply.pug', { 
                            reply : reply,
                            board : board,
                        }))
                    }
                }

            } else {
                logger.ok(`Thread created! No. ${ctn} Title: ${0} Content: ${content}`)

                let thread = formatThread({
                    id : q.id,
                    title : title,
                    username : username,
                    content : content,
                    file_info : q.file_info,
                    date : q.date,
                }, uid)

                throwMessage(smm.SUCCESS, 'Thread Updated! ID: '+thread.id)

                let path = `/${board}/${thread.id}`
                app.get(path, (req, res) => {
                    return renderLayerView(req, res, path)
                })

                for (s of io.of('/thread').sockets.values()) {
                    if (s.insideThread === -1) {
                        s.emit('channel layer thread', pug.renderFile('./public/pug/templades/itemThread.pug', { 
                            thread : thread,
                            board : board,
                        }))
                    }
                }
            } 

        } catch (err) {
            logger.error('Error in register thread in db', err)
            throwMessage(smm.ERROR, 'Error in create thread!')
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