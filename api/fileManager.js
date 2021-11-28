require('dotenv').config()
const Logger = require('./logger')
const logger = new Logger('app')
const fs = require('fs')
const db = require('./database')

const dirName = { 
    files : 'files',
}

exports.dirName = dirName
const filesPath = './public/files/'

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
        throw err
        logger.fatal('Error after check boards and file system', err)
    }
}

exports.registerFile = async(file) => {



    /*let mime = file.mime.split('/')[0]
    let path = filesPath + dirName.image + '/' + file.name
    if (mime === 'video') path = filesPath + '/' + dirName.video + '/' + file.name
    if (mime === 'audio') path = filesPath + '/' + dirName.audio + '/' + file.name
 
    if (!fs.existsSync(path)) fs.writeFileSync(path, Buffer.from(file.base64, 'base64'))

    let thumbName = ''
    if (mime === 'video') {
        try {
            thumbName = await exports.generateThumb({ name : file.name })
        } catch (err) {
           logger.error('Error after create video thumb', err)        
        }
    }

    logger.info(`File: ${file.name} successful registered! `)
    return thumbName*/
}

exports.deleteFile = async(file) => {


    /*let thumbPath = ''
    let mime = file.mime.split('/')[0]
    let path = filesPath + dirName.image + '/' + file.name
    if (mime === 'audio') path = filesPath + dirName.audio + '/' + file.name
    if (mime === 'video') {
        thumbPath = filesPath + dirName.thumb + '/' + file.thumb
        path = filesPath + dirName.video + '/' + file.name
    }
    
    if (fs.existsSync(path)) {
        fs.unlinkSync(path)
        logger.info(`File: ${file.name} successful deleted! `)
    } else {
        logger.error(`Error after delete. File path not exists (Path: ${path})`)
    }

    if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath)
        logger.info(`Video thumb: ${file.thumb} successful deleted!`)
    } else if (file.thumb !== '') {
        logger.info(`Error after delete video thumb. Thumb not exists (Path: ${path})`)
    }*/
}