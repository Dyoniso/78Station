require('dotenv').config()
const Logger = require('./logger')
const logger = new Logger('app')
const fs = require('fs')
const db = require('./database')
const utils = require('./utils')
const ffmpeg = require('fluent-ffmpeg')

const dirName = { 
    files : 'files',
}

exports.dirName = dirName
const filesPath = './public/files/'
exports.filesPath = filesPath

exports.updateFileSystem = async(table) => {
    if (!fs.existsSync(filesPath)) fs.mkdirSync(filesPath)

    try {
        logger.info('Starting boards dir sync..')
        let boards = await db.query(`SELECT * FROM ${table}`)
        for (b of boards) {
            if (!fs.existsSync(filesPath + b.path + '/')) {
                let boardPath = filesPath + b.path + '/'
                fs.mkdirSync(boardPath)
                fs.mkdirSync(boardPath + 'thumb')
                logger.ok(`Dir: ${b.path}/ Created in public directory.`)
            }
        }
        logger.info('Boards sync finished!')

    } catch (err) {
        logger.fatal('Error after check boards and file system', err)
    }
}

exports.registerFile = async(board, file) => {
    let path = filesPath + board
    let pathF = path + '/' + file.name
    let thumbName = ''

    if (!fs.existsSync(pathF)) {
        fs.writeFileSync(pathF, Buffer.from(file.base64, 'base64'))
        logger.ok(`File: ${file.name} successful registered in file system `)

        let mime = file.mime.split('/')[0]
        if (mime === 'video') { 
            try {
                thumbName = await exports.generateThumb(board, file.name)
            } catch (err) {
                logger.error('Error after create video thumb', err)        
            }
        }
    } else {
        logger.error('File already exists: '+file.name)
    }
    return thumbName
}

exports.deleteFile = async(board, file) => {
    let boardPath = filesPath + board + '/'
    let path = boardPath + file.name
    if (fs.existsSync(path)) {
        fs.unlinkSync(path)
        logger.ok(`File: ${file.name} successful deleted! `)

        if (file.thumbName && file.thumbName !== '') {
            let thumbPath = boardPath + 'thumb/' + file.thumbName
            if (fs.existsSync(thumbPath)) {
                fs.unlinkSync(thumbPath)
                logger.ok(`File Thumb: ${file.thumbName} successful deleted! `)
            } else {
                logger.error(`Error after delete: File not exists: ${file.thumbName}`)
            }
        }
    } else {
        logger.error(`Error after delete. File path not exists (Path: ${path})`)
    }
}

exports.generateThumb = async(board, filename) => {
    let boardPath = filesPath + board + '/'
    let ref = boardPath + filename

    if (fs.existsSync(ref)) {
        let thumbName = String(Math.floor(Math.random() * Date.now())).substr(0, 18)
        thumbName = thumbName + '.jpg'

        return await new Promise((resolve, reject) => {
            ffmpeg(ref)
            .on('end', () => {
                logger.info('Video screenshot taken. Name: ' + filename)
                resolve(thumbName)
            })
            .on('error', (err) => {
                logger.error('Error in salve video screenshot. ' + err)
                reject(err)
            })
            .screenshots({
                count: 1,
                filename : thumbName,
                folder: boardPath + 'thumb/'
            })
        })
    }
}