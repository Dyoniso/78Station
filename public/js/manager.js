$(document).ready((e) => {
    let shiftKey = false
    let isFinish = true
    let connected = false
    let socket = null
    let boardPath = $('#boardPath').val()
    let defaultName = localStorage.defaultUsername
    let selectedThid = -1

    let urlPath = location.pathname.split('/').pop()

    const PAGE_MODE_THREAD = 'thread'
    const PAGE_MODE_REPLY = 'reply'

    const smm = {
        FATAL : 'fatal',
        ERROR : 'error',
        SUCCESS : 'success'
    }

    let mode = PAGE_MODE_THREAD

    ;(() => {
        if (defaultName === '' || !defaultName) {
            let defaultNameBegin = 'Anon'
            localStorage.defaultName = defaultNameBegin
            defaultName = defaultNameBegin
        }

        if (urlPath !== '') connectSocket(urlPath)
    })()

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

    function handleMessage(mode, message) {
        let error = false

        switch(mode) {
            case smm.FATAL:
                $('#layerContent').html(`
                    <div class="error-container">
                        <hr>
                        <h2> 78 Station: IO error </h2>
                        <h5 class="error-message" style="color:red">${message}</h5>
                        <hr>
                    </div>
                `)
                finalizeApp()
                break

            case smm.ERROR:
                error = true

            case smm.SUCCESS:
                let el = $('#postMessage')
                el.text(message)
                if (error === true) el.css({'color' : 'red'})
                else el.css({'color' : 'green'})
                if (!el.is(':visible')) el.slideToggle(100)
                setTimeout(() => el.slideToggle(100), 5000)
                break
        }
    }

    function connectSocket(board) {
        if (socket) socket.disconnect()

        socket = io('/thread', { query : { board : board } })
        socket.off('connect').on('connect', () => {
            updateSocketListeners()
            boardPath = board
            connected = true
            scrollLock = false
            initLatencyStatus()
            initApp()
        })
        socket.off('connect_error').on('connect_error', err => {
            handleMessage(smm.FATAL, err)
            connected = false
        })
        socket.off('connect_failed').on('connect_failed', err => {
            handleMessage(smm.FATAL, err)
            connected = false
        })
        socket.on('disconnect', (err) => {
            connected = false
        })
    }
    
    let ltLatency = 'channel latency'
    let ltLayerThread = 'channel layer thread'
    let ltThreadBegin = 'channel layer thread begin'
    let ltLayerScroll = 'channel layer thread scroll'
    let ltReplyBegin = 'channel layer reply begin'
    let ltThreadView = 'channel layer thread view'
    let ltReply = 'channel layer reply'
    let ltMessage = 'channel status message'

    let pingInterval = null
    function initLatencyStatus() {
        if (pingInterval !== null) finalizeLatencyStatus()

        let el = $('#boardItem-'+boardPath)
        el.children('.pulse').css({ background : '#4bd6a3' })

        pingInterval = setInterval(() => {
            socket.emit(ltLatency, { current : Date.now() })
        }, 10000)
    }

    function finalizeLatencyStatus() {
        clearInterval(pingInterval)
        $('.pulse').css({ background : '#cc2c2c' }) 
        $('.latency-status').text('')
    }

    function updateSocketListeners() {
        socket.off(ltThreadView).on(ltThreadView, (obj) => {
            $('#layerContent').html(obj)
            $('#postSubject').hide()
        })
        socket.off(ltReply).on(ltReply, (obj) => {
            $('#replyContent').append(obj)
        })
        socket.off(ltReplyBegin).on(ltReplyBegin, (obj) => {
            $('#replyContent').html(obj)
        })
        socket.off(ltLayerThread).on(ltLayerThread, (obj) => {
            $('#layerContent').append(obj)
            scrollLock = false
            updateVisibility()
            updateListeners()
        })
        socket.off(ltThreadBegin).on(ltThreadBegin, (obj) => {
            $('#layerContent').html(obj)
            $('#postSubject').show()
            updateVisibility()
            updateListeners()
        })
        socket.off(ltLayerScroll).on(ltLayerScroll, (obj) => {
            if (obj !== '') {
                $('#layerContent').prepend(obj)
                .scrollTop($(scrollAnchor).offset().top)
            }
            setTimeout(() => scrollFetched = true, 3000)
        })
        socket.off(ltMessage).on(ltMessage, (obj) => {
            handleMessage(obj.mode, obj.message)
        })
        socket.off(ltLatency).on(ltLatency, (obj) => {
            let latency = obj.latency
            let el = $('#boardItem-'+boardPath)

            let color = '#4dd64b'
            if (latency > 300) color = '#fcdb38'
            if (latency > 600) color = '#ee3434'
            el.children('.pulse').css({ background : color })
            el.children('.latency-status').text(latency + ' ms')
        })
    }

    function updateVisibility() {
        //DEF STORAGE ITEM
        let storageItems = JSON.parse(localStorage.getItem(`hid-${boardPath}`))
        if (!storageItems) {
            localStorage.setItem(`hid-${boardPath}`, JSON.stringify([]))
            storageItems = []
        }
        
        for (r of storageItems) {
            try {
                $("#"+r).find('.btnVisibility').html(`<img src="/pub/btn_show.png" class="mb-1 pointer-effect"/>`)
                $("#"+r).children('.wrap-content').hide()
            } catch (err) {}
        } 
    }

    function updateListeners() {
        //Connect Thread
        $('.thread-header').off('click').on('click', (e) => {
            let id = $(e.target).data('id')
            mode = PAGE_MODE_REPLY
            selectedThid = id
            socket.emit('channel thread connect', { thid : id })
        })

        $('.btnVisibility').on('click', (e) => {
            let t = $(e.target)
            let el = t.parents('.thread-item').children('.wrap-content')
            let atrId = t.parents('.thread-item').attr('id')

            let storageItems = JSON.parse(localStorage.getItem(`hid-${boardPath}`))
            if (el.is(':visible')) {
                storageItems.push(atrId)

                t.replaceWith(`<img src="/pub/btn_show.png" class="mb-1 pointer-effect"/>`)
                el.hide()
            } else {
                if (storageItems.includes(atrId)) storageItems = storageItems.filter((i) => i !== atrId)

                t.replaceWith(`<img src="/pub/btn_hide.png" class="mb-1 pointer-effect"/>`)
                el.show()
            }
            localStorage.setItem(`hid-${boardPath}`, JSON.stringify(storageItems))
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

    $('.boardBtn').on('click', (e) => {
        let board = $(e.target).data('path')
        connectSocket(board)
        mode = PAGE_MODE_THREAD
    })

    function initApp() {
        if (isFinish === true) {
            isFinish = false

            $('.error-container').remove()
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
                        let title = $('#postSubject').val()
                        let content = $('#threadContent').val()

                        if (content.length <= 3) return handleMessage(smm.ERROR, 'Invalid thread. Write content longer than 3 characters')

                        let obj = {
                            username : $('#settingsUsername').val(),
                            content : content,
                            title : title,
                            file : file,
                        }
                        
                        if (obj.username <= 0) obj.username = 'Anon'
        
                        let postType = 'channel add thread'
                        if (mode === PAGE_MODE_REPLY) {
                            obj.thid = selectedThid
                            postType = 'channel add thread reply'
                            delete obj.title

                        } else if (file === null || file.length === 0) return handleMessage(smm.ERROR, 'Your post needs an image, after all this is an imageboard')

                        emitSocketData(postType, obj) 
                        clearInput()
                        scrollLock = false
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
    }

    function finalizeApp() {
        if (isFinish === false) {
            isFinish = true

            finalizeLatencyStatus()

            $('#postInput').slideToggle(100)

            $('#threadContent').off('keypress')
            $('#threadUsername').off('keypress')
            $('.logo').off('click')
            $(document).off('click').off('dragover').off('dragleave').off('drop')
            .off('keyup keydown')
        }
    }
})