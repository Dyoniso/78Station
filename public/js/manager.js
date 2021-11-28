$(document).ready((e) => {
    $('#threadContent').on('keypress', (e) => {
        if (e.keyCode === 13) {
            e.preventDefault()

            let obj = {
                username : $('#inputUsername').val(),
                content : $('#threadContent').val(),
                file : $('#dragFile').prop('files')[0]
            }

            console.log(obj)
        }
    }).on('input', (e) => {
        let el = $(e.target)
        el.css('height', '5px')
        el.css('height', (el.prop('scrollHeight') + 'px'))
    })

    function updateFilePreview(file) {
        console.log(file)

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
})