const app = require('../app').app

app.get('/', (req, res) => {
    return res.render('./chatView.pug')
})