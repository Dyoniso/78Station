function openModal(e) {
    e = $(e)

    let filename = e.data('filename')
    let id = e.data('id')
    let size = e.data('size')
    let width = e.data('width')
    let heigth = e.data('height')
    let date = e.data('date')
    let href = e.data('href')

    $('#btnDownloadImgPreview').attr('href', href)
    $('#modalPreviewTitle').html(`
        ${id} - <a href="${href}" class="file-name text-warning">${filename}</a> (${size} ${width}x${heigth}px) - ${date}
    `)
    href = location.origin + href
    $('#searchUrl').html(`
        Search: <a target="_blank" class="text-warning" href="//www.google.com/searchbyimage?image_url=${href}">Google</a> / <a target="_blank" class="text-warning" href="//iqdb.org/?url=${href}">IQDB</a> / <a target="_blank" class="text-warning" href="//saucenao.com/search.php?url=${href}">SauceNao</a>
    `)
    $('#modalImgPreview').attr('src', e.attr('src'))
    $('#imgViewModal').modal('show')
}

$(document).ready((e) => {
    let shiftKey = false
    let isFinish = true
    let connected = false
    let socket = null
    let boardPath = $('#boardPath').val()
    let defaultName = localStorage.defaultUsername
    let defaultPassword = ''
    let selectedThid = -1
    let settingsLock = false
    let delObj = { threads : [], replies : [] }
    let filePreviewDisplay = false
    let notifyLock = false

    let urlBoardPath = location.pathname.split('/')[1]
    let urlThreadPath = parseInt(location.pathname.split('/').pop())

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

        defaultPassword = localStorage.defaultPassword
        if (!defaultPassword || defaultPassword.length <= 0) {
            generatePassword()
        }
        $('#settingsPassword').val(defaultPassword)
    })()

    $('#btnCloseImgPreviewModal').on('click', (e) => {
        $('#imgViewModal').modal('hide')
    })

    function generatePassword() {
        defaultPassword = generateHash(8)
        localStorage.defaultPassword = defaultPassword
    }

    function generateHash(length) {
        let result = '';
        let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let charactersLength = characters.length;
        for (let i = 0; i < length; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result
    }

    function emitSocketData(channel, obj) {
        if (socket) socket.emit(channel, obj)
    }

    function updateFilePreview(file) {
        let type = file.type.split('/')[0]
        let name = file.name
        if (name.length > 30) name = name.substr(0, 30) + '...'

        let fileFrame = `<img id="imgItem-${file.id}" src="${file.base64}" onerror="this.src='/pub/404.jpg'">`
        if (type === 'video') fileFrame = `<video id="videoItem-${file.id}" controls="" loop=""><source src="${file.base64}" /></video>`
        if (type === 'audio') fileFrame = `<audio id="audioItem-${file.id}" controls="" loop=""><source src="${file.base64}" /></audio>`

        $('#filePreview').hide().html(`
            <div class="file-content">
                ${fileFrame}
                <small class="file-info">${name} / ${file.size}</small>
                <div class="btn-file-remove" id="btnRemoveFile">
                    <img src="/pub/btn_hide.png" />
                </div>
            </div>
        `).fadeIn(200)

        filePreviewDisplay = true

        $('#btnRemoveFile').off('click').on('click', (e) => {
            $('#filePreview').html('')
            $('#dragFile').val('')
            $('#threadContent').css('height', '40px')

            filePreviewDisplay = false
        })
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

        const dT = new DataTransfer();
        dT.items.add(file)
        $('#dragFile')[0].files = dT.files

        $('#threadContent').css('height', 'auto')
    }

    function clearInput() {
        $('#postSubject').val('')
        $('#threadContent').val('')
        $('#threadUsername').val('')
        $('#dragFile').val('')
        $('#threadContent').removeAttr('style')
        $('#filePreview').empty()
    }

    function scrollDown() {
        //Auto Scroll
        let el = $("#layerContent")
        el.scrollTop(el[0].scrollHeight)
    }

    let messageTimeout = null
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
                if (messageTimeout !== null) {
                    clearTimeout(messageTimeout)
                    el.hide()
                }

                el.text(message)
                if (error === true) el.css({'color' : 'red'})
                else el.css({'color' : 'green'})
                if (!el.is(':visible')) el.slideToggle(100)
                if (error === false) {
                    messageTimeout = setTimeout(() => el.slideToggle(100), 5000)
                }
                break
        }
    }

    function connectSocket(board, callback) {
        $('#layerContent').css('opacity', 0.4)
        setUrl(`/${board}`)
        setTitle(`/${board}/ Express - 78Station`)

        if (socket) socket.disconnect()

        socket = io('/board', { query : { board : board } })
        socket.off('connect').on('connect', () => {
            $('#layerContent').css('opacity', 1)
            
            updateSocketListeners()
            boardPath = board
            connected = true
            scrollLock = false
            initLatencyStatus()
            initApp()
            if (callback) callback()
        })
        socket.off('connect_error').on('connect_error', err => {
            $('#layerContent').css('opacity', )

            if (callback) callback(err)
            handleMessage(smm.FATAL, err)
            connected = false
        })
        socket.off('connect_failed').on('connect_failed', err => {
            $('#layerContent').css('opacity', 1)

            if (callback) callback(err)
            handleMessage(smm.FATAL, err)
            connected = false
        })
        socket.on('disconnect', (err) => {
            $('#layerContent').css('opacity', 1)

            if (callback) callback(err)
            connected = false
        })
    }
    
    let ltLatency = 'channel latency'
    let ltLayerBoard = 'channel layer board'
    let ltBoardBegin = 'channel layer board begin'
    let ltLayerScroll = 'channel layer board scroll'
    let ltMessage = 'channel status message'

    let pingInterval = null
    function initLatencyStatus() {
        if (pingInterval !== null) finalizeLatencyStatus()

        let el = $('.boardItem-'+boardPath)
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

    let notifyCount = 0
    function updateSocketListeners() {
        socket.off(ltLayerBoard).on(ltLayerBoard, (obj) => {
            $('.error-container').remove()
            $('.empty-board-container').remove()
            $('#layerContent').append(obj)
            
            listenerScroll = true
            scrollLock = false
            
            updateVisibility()
            updateListeners()
        })
        socket.off(ltBoardBegin).on(ltBoardBegin, (obj) => {
            if (obj && obj !== '') {
                $('#layerContent').css('opacity', 1).html(obj)

                $('#postSubject').show()

                hideDelBtn()
                updateVisibility()
                updateListeners()

            } else {
                $('#layerContent').html(`
                    <div class="empty-board-container">
                        <hr>
                            <h4 class="text-center"> This board has no content. Be the first to post </h4>
                        <hr>
                    </div>
                `)
            }
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
            let el = $('.boardItem-'+boardPath)

            let color = '#4dd64b'
            if (latency > 300) color = '#fcdb38'
            if (latency > 600) color = '#ff5722'
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
                $("#"+r).find('.wrap-content').hide()
            } catch (err) {}
        } 
    }

    function updateListeners() {
        $('.btnVisibility').on('click', (e) => {
            let t = $(e.target)
            let el = t.parents('.delThread').parent('.thread-item').find('.wrap-content')
            let atrId = t.parents('.delThread').parent('.thread-item').attr('id')

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

        $('.delThread').find('input[type=checkbox]').off('change').on('change', (e) => {
            let el = $(e.target)
            let thid = parseInt(el.parents('.delThread').data('id'))
            let type = el.data('type')

            if (type === PAGE_MODE_THREAD) {
                if (el.prop('checked')) delObj.threads.push({ id : thid })
                else delObj.threads = delObj.threads.filter((i) => i.id !== thid)

            } else {
                let rid = parseInt($(e.target).parents('.reply-item').data('id'))
                if (el.prop('checked')) delObj.replies.push({ thid : thid, id : rid })
                else delObj.replies = delObj.replies.filter((i) => i.id !== rid) 
            }

            let elS = $('.settings-box')
            if (delObj.threads.length > 0 || delObj.replies.length > 0) {
                settingsLock = true
                $('#btnDelete').show()
                $('#delInfo').html(`
                    Thread (${delObj.threads.length})
                `)
                /*$('#delInfo').html(`
                    Thread (${delObj.threads.length})
                    Reply (${delObj.replies.length})
                `)*/
                if (!elS.is(':visible')) elS.slideToggle(100)

            } else {
                hideDelBtn()
            }   
        })
    }

    function hideDelBtn() {
        delObj = { threads : [], replies : [] }

        let elS = $('.settings-box')
        settingsLock = false
        $('#delInfo').text('')
        $('#btnDelete').hide()
        if (elS.is(':visible')) elS.slideToggle(100)
    }

    let listenerScroll = true
    let scrollLock = false
    let scrollFetched = true
    let scrollAnchor = ''

    $('#layerContent').on('scroll', (e) => {
        if (listenerScroll === false) return
        let el = $('#layerContent')

        if (el.scrollTop() < 5 && scrollFetched) {
            emitSocketData('channel layer thread scroll', { total : $('.thread-item').length })
            scrollFetched = false
            scrollAnchor = $('.thread-item')[0]
        }

        let maxScrollTop = el[0].scrollHeight - el.outerHeight();
        if (maxScrollTop - el.scrollTop() > 30) scrollLock = true
        else scrollLock = false 
    })

    $('.boardBtn').on('click', (e) => {
        let board = $(e.target).data('path')
        connectSocket(board)
        mode = PAGE_MODE_THREAD
    })

    function setUrl(f) {
        history.pushState('data', '', location.origin + f)
    }

    function setTitle(t) {
        $('#pageTitle').text(t)
        defaultTitle = t
    }

    function initApp() {
        if (isFinish === true) {
            isFinish = false

            $('.error-container').remove()
            $('#settingsUsername').val(defaultName)
            $('#postInput').slideToggle(100)
            $('#postMessage').text('').hide()

            $('#threadUsername').off('keypress').on('keypress', (e) => {
                if (e.keyCode === 13) e.preventDefault()
            })
            $('#threadContent').off('keydown').on('keydown', (e) => {
                let key = e.keyCode || e.charCode

                if (shiftKey === false && key === 13) {
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
                            password : defaultPassword,
                        }
                        
                        if (obj.username <= 0) obj.username = 'Anon'
        
                        let postType = 'channel add reply'

                        listenerScroll = false
                        scrollLock = false
                        filePreviewDisplay = false
                        notifyLock = true

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

            $('#btnDelete').off('click').on('click', (e) => {
                if (delObj.threads.length > 0 || delObj.replies.length > 0) {
                    delObj.password = defaultPassword
                    emitSocketData('channel post delete', delObj)
                }
            })

            $('#settingsBtn').off('click').on('click', (e) => {
                let el = $('.settings-box')
                el.slideToggle(100)
                $('#settingsUsername').val(defaultName)
            })

            $('#dragFile').off('change').on('change', (e) => {
                addFile(e.target.files[0])
            })

            $(document).off('mousemove').on('mousemove', (e) => {
                $('#pageTitle').text(defaultTitle)
                notifyCount = 0
                notifyLock = false
            })

            $(document).off('keyup keydown').on('keyup keydown', (e) => {
                shiftKey = e.shiftKey

            }).off('dragleave').on('dragleave', (e) => {
                e.preventDefault()
                $('#layerContent').removeClass('drag-file-preview')

            }).off('drop').on('drop', (e) => {
                $('#layerContent').removeClass('drag-file-preview')
                e.preventDefault()
        
                let dt = e.originalEvent.dataTransfer
                if (dt && dt.files.length) {
                    addFile(dt.files[0])
                }

            }).off('dragover').on('dragover', (e) => {
                e.preventDefault()
                $('#layerContent').addClass('drag-file-preview')

            }).off('click').on('click', (e) => {
                let el = $(e.target)

                if (el) {
                    if (el.attr('id') !== 'settingsUsername'
                        && el.attr('id') !== 'settingsBtn' 
                        && el.attr('id') !== 'settingsPassword' 
                        && !(el.attr('class') && el.attr('class').includes('del-value'))
                        && $('.settings-box').is(':visible')) {
                            let username = $('#settingsUsername').val()
                            if (!username || username === '') username = 'Anon'
                            localStorage.defaultUsername = username
                            defaultName = username

                            if (settingsLock === false) $('.settings-box').slideToggle(100)
                    }

                    let password = $('#settingsPassword').val()
                    if (password.length > 0) {
                        defaultPassword = password
                        localStorage.defaultPassword = password

                    } else {
                        generatePassword()
                        $('#settingsPassword').val(defaultPassword)
                    }
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

            hideDelBtn()
            finalizeLatencyStatus()
            clearInput()

            $('#postMessage').hide()
            $('#postInput').slideToggle(100)

            let els = $('.settings-box')
            if (els.is(':visible')) els.slideToggle(100)

            $('#threadContent').off('keypress')
            $('#threadUsername').off('keypress')
            $('.logo').off('click')
            $(document).off('click').off('dragover').off('dragleave').off('drop')
            .off('keyup keydown')
        }
    }
})