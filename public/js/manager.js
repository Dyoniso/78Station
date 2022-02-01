function openModal(e) {
    e = $(e)

    let filename = e.data('filename')
    let id = e.data('id')
    let size = e.data('size')
    let width = e.data('width')
    let heigth = e.data('height')
    let date = e.data('date')
    let href = e.data('href')
    let mime = e.data('mime')

    $('#btnDownloadImgPreview').attr('href', href)
    let dims = ''
    if (width && heigth) dims = ` ${width}x${heigth}px`
    $('#modalPreviewTitle').html(`
        ${id} - <a href="${href}" class="file-name text-warning">${filename}</a> (${size}${dims}) - ${date}
    `)

    href = location.origin + href
    $('#searchUrl').html(`
        Search: <a target="_blank" class="text-warning" href="//www.google.com/searchbyimage?image_url=${href}">Google</a> / <a target="_blank" class="text-warning" href="//iqdb.org/?url=${href}">IQDB</a> / <a target="_blank" class="text-warning" href="//saucenao.com/search.php?url=${href}">SauceNao</a>
    `)
    if (mime.includes('audio')) $('#modalImgPreview').html(`
        <audio controls loop autoplay class="m-4 modal-img-preview">
            <source src="${href}" />
        </audio>
    `)
    else if (mime.includes('video')) $('#modalImgPreview').html(`
        <video onloadstart="this.volume=0.5" controls loop autoplay class="modal-img-preview">
            <source src="${href}" />
        </video>
    `)
    else $('#modalImgPreview').html(`
        <img class="modal-img-preview" src="${href}" />
    `)
    $('#imgViewModal').modal('show')
}

$(document).ready((e) => {
    let shiftKey = false
    let isFinish = true
    let socket = null
    let boardPath = $('#boardPath').val()
    let defaultName = localStorage.defaultUsername
    let defaultPassword = ''
    let settingsLock = false
    let delObj = []
    let notifyLock = false
    let inputLocked = false

    let urlBoardPath = $('#boardPath').val()
    let bdgePath = $('#bdgePath').val()
    if (!bdgePath) bdgePath = ''

    const smm = {
        FATAL : 'fatal',
        ERROR : 'error',
        SUCCESS : 'success'
    }

    ;(() => {
        if (defaultName === '' || !defaultName) {
            let defaultNameBegin = 'Anon'
            localStorage.defaultName = defaultNameBegin
            defaultName = defaultNameBegin
        }

        if (urlBoardPath !== '') {
            connectSocket(urlBoardPath, (err) => {
                if (err) return
            })
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
    $("#imgViewModal").on("hidden.bs.modal", () => {
        let el = $('#modalImgPreview')
        el.children('video').trigger('pause')
        el.children('audio').trigger('pause')
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

        let fileFrame = `<img id="imgItem-${file.id}" src="${file.base64}" onerror="this.src='${bdgePath}/pub/404.jpg'">`
        if (type === 'video') fileFrame = `<video id="videoItem-${file.id}" controls="" loop=""><source src="${file.base64}" /></video>`
        if (type === 'audio') fileFrame = `<audio id="audioItem-${file.id}" controls="" loop=""><source src="${file.base64}" /></audio>`

        $('#filePreview').hide().html(`
            <div class="file-content">
                ${fileFrame}
                <small class="file-info">${name} / ${file.size}</small>
                <div class="btn-file-remove" id="btnRemoveFile">
                    <img src="${bdgePath}/pub/btn_hide.png" />
                </div>
            </div>
        `).fadeIn(200)

        filePreviewDisplay = true

        $('#btnRemoveFile').off('click').on('click', (e) => {
            $('#filePreview').html('')
            $('#dragFile').val('')
            $('#chatContent').css('height', '40px')

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

        $('#chatContent').css('height', 'auto')
    }

    function clearInput() {
        $('#postSubject').val('')
        $('#chatContent').val('')
        $('#replyUsername').val('')
        $('#dragFile').val('')
        $('#chatContent').removeAttr('style')
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
                unlockInput()

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
                messageTimeout = setTimeout(() => el.slideToggle(100), 5000)
                unlockInput()
                break
        }
        $('#layerContent').css('opacity', 1)
    }

    function connectSocket(board, callback) {
        $('#layerContent').css('opacity', 0.4)
        setUrl(`${bdgePath}/${board}`)
        setTitle(`/${board}/ Express - 78Station`)

        if (socket) socket.disconnect()

        socket = io(bdgePath + '/board', { query : { board : board } })
        socket.off('connect').on('connect', () => {  
            updateSocketListeners()
            boardPath = board
            scrollLock = false
            initLatencyStatus()
            initApp()
            if (callback) callback()
        })
        socket.off('connect_error').on('connect_error', err => {
            if (callback) callback(err)
            handleMessage(smm.FATAL, err)
        })
        socket.off('connect_failed').on('connect_failed', err => {
            if (callback) callback(err)
            handleMessage(smm.FATAL, err)
        })
        socket.on('disconnect', (err) => {
            if (callback) callback(err)
        })
    }
    
    let ltLatency = 'channel latency'
    let ltLayerBoard = 'channel layer board'
    let ltBoardBegin = 'channel layer board begin'
    let ltLayerScroll = 'channel layer board scroll'
    let ltMessage = 'channel status message'
    let ltReplyDelete = 'channel reply delete'
    let ltReplyMentions = 'channel reply mentions'

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

    let tinScrollListener = null
    let notifyCount = 0
    function updateSocketListeners() {
        socket.off(ltReplyMentions).on(ltReplyMentions, (obj) => {
            let c = 0
            for (m of obj) {
                $('#replyMention-'+m.id).append(`
                    <span class="pl-1 quote-reply" title="Click to reply to mention">&gt;&gt;${m.quoted}</span>
                    ${c++ > 4 ? '<br>' : ''}
                `)
                let el = $('#reply-'+m.id)
                el.css('background', 'var(--bgr-reply-preview)')
                setTimeout(() => el.removeAttr('style'), 650)
            }
        })
        socket.off(ltLayerBoard).on(ltLayerBoard, (obj) => {
            listenerScroll = false
            $('.error-container').remove()
            $('.empty-board-container').remove()
            $('#replyContent').append(obj.data)
            
            if (!obj.self) {
                notifyCount++
                if (notifyCount > 0 && notifyLock === false) {
                    $('#pageTitle').text(`(${notifyCount}) ` + defaultTitle)
                }            
            } else {
                unlockInput()
            }

            if (tinScrollListener) clearTimeout(tinScrollListener)
            setTimeout(() => listenerScroll = true, 500)
            setTimeout(() => scrollFetched = true, 1500)
            updateListeners()
        })
        socket.off(ltReplyDelete).on(ltReplyDelete, (obj) => {
            for (i of obj) {
                $('#reply-'+i).remove()
            }
        })
        socket.off(ltBoardBegin).on(ltBoardBegin, async(obj) => {
            $('#layerContent').css('opacity', 1).html(obj)
            $('#postSubject').show()

            hideDelBtn()
            updateListeners()

            let boardTitle = $('#boardTitle').val()
            setTitle(`/${boardPath}/ ${boardTitle} - 78Station Express`)

            setTimeout(() => scrollFetched = true, 1500)
        })
        socket.off(ltLayerScroll).on(ltLayerScroll, (obj) => {
            if (obj !== '') {
                $('#replyContent').prepend(obj)
                $('#layerContent').scrollTop($(scrollAnchor).offset().top)
                updateListeners()
            }
            setTimeout(() => scrollFetched = true, 1500)
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

    function quoteReply(id) {
        if (!isNaN(id) && id > 0) {
            let el = $('#chatContent')
            el.val(el.val() + '>>'+ id + '\n')
            el.css('height', (el.prop('scrollHeight') + 'px'))
        }
    }

    let tinBg = tinRef = null
    function showReplyBox(board, replyId, e) {
        let x = e.clientX + 5
        let y = e.clientY + 5

        let readed = false
        let element = $(`#reply-${replyId}`)
        tinBg = { el : element, bg : element.css('background') }

        if (Object.keys(element).length > 0) {
            let elTop = element.offset().top
            let elBottom = element.offset().top + element.outerHeight()
            let scBottom = $(window).scrollTop() + $(window).innerHeight()
            let scTop = $(window).scrollTop()
        
            if ((scBottom > elTop) && (scTop < elBottom)) readed = true
        } 

        if (readed === false) {
            $(e.target).css('cursor', 'wait')
            if (tinRef) clearTimeout(tinRef)
            tinRef = setTimeout(() => {
                fetch(`${bdgePath}/${board}/reply/${replyId}`, {
                    method: 'GET',
                    headers: { 'Content-Type' : 'text/html; charset=utf-8' },
                })
                .then(async(res) => {
                    if (res && res.status === 200) {
                        let data = await res.text()
                        $('body').append(data)

                        y = y - 80
                        $('.reply-preview').css({'top' : y+'px', 'left' : x+'px'})
                    }
                    $(e.target).removeAttr('style')
                })
            }, 300)
        } else {
            element.css('background', 'var(--bgr-reply-preview )')
        }
    }

    function updateListeners() {
        updateBoardBtn()

        //Reply View Box
        $('.quote-reply').off('click').on('click', (e) => {
            let replyId = parseInt($(e.target).text().replace('>>', ''))
            quoteReply(replyId)
        })
        $('.quote-reply').off('mouseenter mouseleave').hover(async(e) => {
            let replyId = parseInt($(e.target).text().replace('>>', ''))
            if (replyId && !isNaN(replyId)) showReplyBox(boardPath, replyId, e)

        }, (e) => {
            if (tinRef) clearTimeout(tinRef)
            if (tinBg && tinBg.el) tinBg.el.css('background', tinBg.bg)
            $('.reply-preview').remove()
        })

        $('.get-reply').off('click').on('click', (e) => {
            quoteReply(parseInt($(e.target).data('id')))
        })

        $('.layer-content').find('input[type=checkbox]').off('change').on('change', (e) => {
            let el = $(e.target)
            let id = parseInt(el.val())

            if (!isNaN(id) && id > 0) {
                if (el.prop('checked')) delObj.push({ id : id })
                else delObj = delObj.filter((i) => i.id !== id)
            }

            let elS = $('.settings-box')
            if (delObj.length > 0) {
                settingsLock = true
                $('#btnDelete').show()
                $('#delInfo').html(`
                    Items (${delObj.length})
                `)
                if (!elS.is(':visible')) elS.slideToggle(100)

            } else {
                hideDelBtn()
            }   
        })
    }

    function hideDelBtn() {
        delObj = []

        let elS = $('.settings-box')
        settingsLock = false
        $('#delInfo').text('')
        $('#btnDelete').hide()
        if (elS.is(':visible')) elS.slideToggle(100)
    }

    let listenerScroll = true
    let scrollLock = false
    let scrollFetched = false
    let scrollAnchor = ''

    function checkReplyContainerLeaked() {
        let replyContainer = $('#replyContainer').first().position()
        if (replyContainer && replyContainer.top < 0) $('#replyContainer').css('height', '100%')
        else $('#replyContainer').removeAttr('style')
    }

    $('#layerContent').on('scroll', (e) => {
        if (listenerScroll === false) return
        let el = $('#layerContent')

        let maxScrollTop = el[0].scrollHeight - el.outerHeight();
        if (maxScrollTop - el.scrollTop() > 30) scrollLock = true
        else scrollLock = false 

        if (el.scrollTop() < 800 && scrollFetched) {
            scrollFetched = false
            scrollAnchor = $('.reply-item')[0]
            emitSocketData(ltLayerScroll, { total : $('.reply-item').length })
        }
    })

    function updateBoardBtn() {
        $('.boardBtn').off('click').on('click', (e) => {
            e.preventDefault()

            let board = $(e.target).data('path')
            connectSocket(board)
        })
    }
    updateBoardBtn()

    function setUrl(f) {
        history.pushState('data', '', location.origin + f)
    }

    function setTitle(t) {
        $('#pageTitle').text(t)
        defaultTitle = t
    }

    let leakedInterval = null
    let scrollItenval = null

    function unlockInput() {
        inputLocked = false
        $('.progress-bar').hide()
        $('#chatContent').prop('placeholder', 'Type anything..')
        .prop('disabled', inputLocked)
        $('#dragFile').prop('disabled', inputLocked)
    }

    function lockInput() {
        inputLocked = true
        $('.progress-bar').show()
        $('#chatContent').prop('placeholder', 'Processing your reply...')
        .prop('disabled', inputLocked)
        $('#dragFile').prop('disabled', inputLocked)
    }

    function initApp() {
        $('#layerContent').css('opacity', 1)

        if (isFinish === true) {
            isFinish = false

            $('.error-container').remove()
            $('#settingsUsername').val(defaultName)
            $('#postInput').slideToggle(100)
            $('#postMessage').text('').hide()

            $('#replyUsername').off('keypress').on('keypress', (e) => {
                if (e.keyCode === 13) e.preventDefault()
            })
            $('#chatContent').off('keydown').on('keydown', (e) => {
                let key = e.keyCode || e.charCode

                if (shiftKey === false && key === 13) {
                    e.preventDefault()
        
                    let file = $('#dragFile').prop('files')[0]
        
                    function sendPostData(file) {
                        if (inputLocked) return

                        let title = $('#postSubject').val()
                        let content = $('#chatContent').val()

                        if (!file && content.length <= 0) return

                        let obj = {
                            username : $('#settingsUsername').val(),
                            content : content,
                            title : title,
                            file : file,
                            password : defaultPassword,
                        }
                        
                        if (obj.username <= 0) obj.username = 'Anon'
        
                        let postType = 'channel add reply'

                        scrollLock = false
                        filePreviewDisplay = false
                        notifyLock = true

                        emitSocketData(postType, obj) 
                        clearInput()
                        lockInput()
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
                if (delObj.length > 0) {
                    emitSocketData('channel post delete', {
                        password : defaultPassword,
                        items : delObj
                    })
                    
                    let elS = $('.settings-box')
                    if (!elS.is(':visible')) elS.slideToggle(100)
                    delObj = []
                    settingsLock = false
                }
            })

            $('#settingsBtn').off('click').on('click', (e) => {
                if (inputLocked) return
                let el = $('.settings-box')
                el.slideToggle(100)
                $('#settingsUsername').val(defaultName)
            })

            $('#dragFile').off('change').on('change', (e) => {
                addFile(e.target.files[0])
            })

            $(document).off('mousemove').on('mousemove', (e) => {
                if (notifyCount > 0) {
                    $('#pageTitle').text(defaultTitle)
                    notifyCount = 0
                    notifyLock = false
                }
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

            if (leakedInterval) clearInterval(leakedInterval)
            if (scrollItenval) clearInterval(scrollItenval)

            leakedInterval = setInterval(() => {
                checkReplyContainerLeaked()
            }, 800)

            scrollItenval = setInterval(() => {
                if (scrollLock === false) scrollDown()
            }, 300)
        }
    }

    function finalizeApp() {
        if (isFinish === false) {
            isFinish = true

            hideDelBtn()
            unlockInput()
            finalizeLatencyStatus()
            clearInput()

            $('#postMessage').hide()
            $('#postInput').slideToggle(100)

            let els = $('.settings-box')
            if (els.is(':visible')) els.slideToggle(100)

            $('#chatContent').off('keypress')
            $('#replyUsername').off('keypress')
            $('.logo').off('click')
            $(document).off('click').off('dragover').off('dragleave').off('drop')
            .off('keyup keydown')
        }
    }
})