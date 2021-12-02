$(document).ready((e) => {
    let shiftKey = false
    let socket = null
    let boardPath = $('#boardPath').val()
    let defaultName = localStorage.defaultUsername

    const PAGE_MODE_THREAD = 'thread'
    const PAGE_MODE_REPLY = 'reply'

    let mode = PAGE_MODE_THREAD

    if (defaultName === '' || !defaultName) {
        let defaultNameBegin = 'Anon'
        localStorage.defaultName = defaultNameBegin
        defaultName = defaultNameBegin
    }

    function emitSocketData(channel, obj) {
        socket.emit(channel, obj)
    }

    function updateFilePreview(file) {
        let type = file.type.split('/')[0]
        let name = file.name
        if (name.length > 30) name = name.substr(0, 30) + '...'

        let fileFrame = `<img id="imgItem-${file.id}" src="${file.base64}" onerror="this.src='/pub/404.jpg'">`
        if (type === 'video') fileFrame = `<video id="videoItem-${file.id}" controls="" loop=""><source src="${file.base64}" /></video>`
        if (type === 'audio') fileFrame = `<audio id="audioItem-${file.id}" controls="" loop=""><source src="${file.base64}" /></audio>`

        $('#filePreview').hide().html(`
            ${fileFrame}
            <small class="file-info">${name} / ${file.size}</small>
        `).fadeIn(200)

    }

    function addFile(file) {
        let reader = new FileReader()

        reader.onload = (b) => {
            updateFilePreview({
                id : b.target.id,
                name : b.target.filename,
                base64 : b.target.result,
                type : b.target.type,
                size : b.target.size,
            })  
        }
        reader.size = file.size
        reader.type = file.type
        reader.id = 1
        reader.filename = file.name
        reader.readAsDataURL(file)
    }

    function clearInput() {
        $('#threadContent').val('')
        $('#threadUsername').val('')
        $('#dragFile').val('')
        $('#filePreview').empty()
    }

    function scrollDown() {
        //Auto Scroll
        let el = $("#layerContent")
        el.scrollTop(el[0].scrollHeight)
    }

    let ltLayerThread = 'channel layer thread'
    let ltThreadBegin = 'channel layer thread begin'
    let ltLayerScroll = 'channel layer thread scroll'
    let ltReplyBegin = 'channel layer reply begin'
    let ltReply = 'channel layer reply'

    function updateSocketListeners() {
        socket.off(ltReplyBegin).on(ltReplyBegin, (obj) => {
            console.log(obj)
        })
        socket.off(ltReplyBegin).on(ltReplyBegin, (obj) => {
            $('#layerContent').html(obj)
        })
        socket.off(ltLayerThread).on(ltLayerThread, (obj) => {
            $('#layerContent').append(obj)
            scrollLock = false
        })
        socket.off(ltThreadBegin).on(ltThreadBegin, (obj) => {
            $('#layerContent').html(obj)
            updateListeners()
        })
        socket.off(ltLayerScroll).on(ltLayerScroll, (obj) => {
            if (obj !== '') {
                $('#layerContent').prepend(obj)
                .scrollTop($(scrollAnchor).offset().top)
            }
            setTimeout(() => scrollFetched = true, 3000)
        })
    }

    function updateListeners() {
        //Connect Thread
        $('.user-info').off('click').on('click', (e) => {
            let id = $(e.target).data('id')
            socket.emit('channel thread connect', { thid : id })
            mode = PAGE_MODE_REPLY
        })
    }

    let scrollLock = false
    let scrollFetched = true
    let scrollAnchor = ''

    $('#layerContent').on('mousewheel', (e) => {
        if ($('#layerContent').scrollTop() < 5 && scrollFetched) {
            emitSocketData('channel layer thread scroll', { total : $('.thread-item').length })
            scrollFetched = false
            scrollAnchor = $('.thread-item')[0]
        }
    
        if (e.originalEvent.wheelDelta >= 0) scrollLock = true
    })

    $('#boardBtn').on('click', (e) => {
        let board = $(e.target).data('path')
        if (board !== boardPath) {
            socket = io('/thread', { query : { board : board } })
            socket.on('connect', () => {
                updateSocketListeners()
                boardPath = board
                initApp()
            })

        } if (mode === PAGE_MODE_REPLY) {

        }
        mode = PAGE_MODE_THREAD
    })

    function initApp() {
        $('#settingsUsername').val(defaultName)
        $('#postInput').slideToggle(100)

        $('#threadUsername').on('keypress', (e) => {
            if (e.keyCode === 13) e.preventDefault()
        })
        $('#threadContent').on('keypress', (e) => {
            if (shiftKey === false && e.keyCode === 13) {
                e.preventDefault()
    
                let file = $('#dragFile').prop('files')[0]
    
                function sendPostData(file) {
                    let obj = {
                        username : $('#threadUsername').val(),
                        content : $('#threadContent').val(),
                        file : file,
                        path : boardPath
                    }
    
                    if (obj.username <= 0) obj.username = 'Anon'
    
                    let postType = 'channel add thread'
                    if (mode === PAGE_MODE_REPLY) postType = 'channel add thread reply'
                    emitSocketData(postType, obj) 
                    clearInput()
                }
    
                if (file) {
                    let reader = new FileReader()
                    reader.onload = (b) => {
                        sendPostData({ name : file.name, result : b.target.result })
                    }
                    reader.readAsDataURL(file)
                } else {
                    sendPostData(null)
                }
            }
        }).on('input', (e) => {
            let el = $(e.target)
            el.css('height', '5px')
            el.css('height', (el.prop('scrollHeight') + 'px'))
        })

        $('.logo').on('click', (e) => {
            socket.disconnect()
            selectedBoard = ''
        })

        $('#settingsBtn').on('click', (e) => {
            let el = $('.settings-box')
            el.slideToggle(100)
            $('#settingsUsername').val(defaultName)
        })

        $('#dragFile').on('change', (e) => {
            addFile(e.target.files[0])
        })

        $(document).on('keyup keydown', (e) => {
            shiftKey = e.shiftKey

        }).on('dragleave', (e) => {
            e.preventDefault()
            $('#layerContent').removeClass('drag-file-preview')

        }).on('drop', (e) => {
            $('#layerContent').removeClass('drag-file-preview')
            e.preventDefault()
    
            let dt = e.originalEvent.dataTransfer
            if (dt && dt.files.length) {
                addFile(dt.files[0])
            }

        }).on('dragover', (e) => {
            e.preventDefault()
            $('#layerContent').addClass('drag-file-preview')

        }).on('click', (e) => {
            let el = $(e.target)
            if (el.attr('id') !== 'settingsUsername'
                && el.attr('id') !== 'settingsBtn' && $('.settings-box').is(':visible')) {
                    let username = $('#settingsUsername').val()
                    if (!username || username === '') username = 'Anon'
                    localStorage.defaultUsername = username
                    defaultName = username
                    $('.settings-box').slideToggle(100)
            }
        })

        setInterval(() => {
            if (scrollLock === false) scrollDown()
        }, 300)
    }

    function finalizeApp() {
        $('#postInput').slideToggle(100)

        $('#threadContent').off('keypress')
        $('#threadUsername').off('keypress')
        $('.logo').off('click')
        $(document).off('click').off('dragover').off('dragleave').off('drop')
        .off('keyup keydown')
    }
})