require('dotenv').config()
const Logger = require('./logger')
const logger = new Logger('app')
const fs = require('fs')
const db = require('./database')
const utils = require('./utils')

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
                fs.mkdirSync(filesPath + b.path)
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
    if (!fs.existsSync(pathF)) fs.writeFileSync(pathF, Buffer.from(file.base64, 'base64'))
    logger.ok(`File: ${file.name} successful registered in file system `)
}

exports.deleteFile = async(board, file) => {
    let path = filesPath + board + '/' + file.name
    if (fs.existsSync(path)) {
        fs.unlinkSync(path)
        logger.ok(`File: ${file.name} successful deleted! `)
    } else {
        logger.error(`Error after delete. File path not exists (Path: ${path})`)
    }
}