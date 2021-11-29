$(document).ready((e) => {
    let shiftKey = false
    let socket = io('/thread')
    let boardPath = $('#boardPath').val()

    $(document).on('keyup keydown', (e) => {
        shiftKey = e.shiftKey
    })

    $('#threadUsername').on('keypress', (e) => {
        if (e.keyCode === 13) e.preventDefault()
    })
    $('#threadContent').on('keypress', (e) => {
        if (shiftKey === false && e.keyCode === 13) {
            e.preventDefault()

            let file = $('#dragFile').prop('files')[0]

            function sendThreadData(file) {
                let obj = {
                    username : $('#threadUsername').val(),
                    content : $('#threadContent').val(),
                    file : file,
                    path : boardPath
                }

                if (obj.username <= 0) obj.username = 'Anon'
                emitSocketData('channel thread', obj)
                clearInput()
            }

            if (file) {
                let reader = new FileReader()
                reader.onload = (b) => {
                    sendThreadData({ name : file.name, result : b.target.result })
                }
                reader.readAsDataURL(file)
            } else {
                sendThreadData(null)
            }
        }
    }).on('input', (e) => {
        let el = $(e.target)
        el.css('height', '5px')
        el.css('height', (el.prop('scrollHeight') + 'px'))
    })

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

    $('#dragFile').on('change', (e) => {
        let el = e.target
        let reader = new FileReader()
        let file = el.files[0]

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
    })

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

    socket.on('channel layer thread', (obj) => {
        $('#layerContent').append(obj)
        scrollLock = false
    })
    socket.on('channel layer thread begin', (obj) => {
        $('#layerContent').html(obj)
    })
    socket.on('channel layer thread scroll', (obj) => {
        if (obj !== '') {
            $('#layerContent').prepend(obj)
            .scrollTop($(scrollAnchor).offset().top)
        }
        setTimeout(() => scrollFetched = true, 3000)
    })

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

    setInterval(() => {
        if (scrollLock === false) scrollDown()
    }, 300)
})