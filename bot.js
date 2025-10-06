const mineflayer = require('mineflayer')
const express = require('express')
const app = express()
const port = process.env.PORT || 3000

// config cho 6 bot
const botsConfig = [
  { host: 'tuban.fun', port: 25643, username: 'lekhanhminh1',  password: 'lekhanhminh2401', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', port: 25643, username: 'Mayumi_', password: 'lekhanhminh2401', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', port: 25643, username: 'trabongchuppy', password: 'lekhanhminh2401', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', port: 25643, username: 'kminh_uwu', password: 'lekhanhminh2401', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', port: 25643, username: 'YangSeok', password: 'lekhanhminh2401', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', port: 25643, username: 'LeKangMin', password: 'lekhanhminh2401', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' }
]

// endpoint ping
app.get('/', (req, res) => res.send('Bot is alive'))
app.listen(port, () => console.log(`Server listening on port ${port}`))

// hàm tạo bot
function createBot(config, botName) {
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version
  })

  bot.on('messagestr', (message) => {
    const lower = message.toLowerCase()

    if (lower.includes('/login')) {
      bot.chat(`/login ${config.password}`)
      console.log(`! [${botName}] login`)
      return
    }

    if (lower.includes('/register')) {
      bot.chat(`/register ${config.password} ${config.password}`)
      console.log(`! [${botName}] register`)
      return
    }

    const regex = /^\[(.+) -> (.+)\] (.+)$/
    const match = message.match(regex)

    if (match) {
      const sender = match[1]
      let receiver = match[2]
      const command = match[3]

      if (sender.toLowerCase() === config.adminUser.toLowerCase()) {
        if (command.toLowerCase() === '/all') {
          config.allowedSender = '*'
          bot.chat(`/msg ${sender} Bot mở cho tất cả`)
          console.log(`! [${botName}] nhận lệnh từ ${sender}: ${command}`)
          return
        }
        if (command.toLowerCase() === '/me') {
          config.allowedSender = config.adminUser
          bot.chat(`/msg ${sender} Bot chỉ cho admin`)
          console.log(`! [${botName}] nhận lệnh từ ${sender}: ${command}`)
          return
        }
      }

      if (config.allowedSender === '*' || sender.toLowerCase() === config.allowedSender.toLowerCase()) {
        bot.chat(command)
        console.log(`! [${botName}] gửi lệnh: ${command}`)
      } else {
        bot.chat(`/msg ${sender} Bạn không có quyền!`)
        console.log(`! [${botName}] từ chối lệnh từ ${sender}: ${command}`)
      }
    }
  })

  bot.on('spawn', () => {
    console.log(`! [${botName}] spawn`)
    if (['chariuanh'].includes(botName)) {
      bot.activateItem()
    }
  })

bot.on('end', () => {
  console.log(`! [${botName}] disconnect, reconnect sau 5s`)
  bot.removeAllListeners() 
  setTimeout(() => createBot(config, botName), 5000 + Math.random() * 5000)
})

  bot.on('kicked', reason => console.log(`! [${botName}] kicked: ${reason}`))
  bot.on('error', err => console.log(`! [${botName}] lỗi: ${err.message}`))
}

// chạy bot lần lượt, mỗi bot cách nhau 9 giây
function startBots() {
  botsConfig.forEach((c, i) => {
    setTimeout(() => {
      createBot(c, c.username)
    }, i * 9000)
  })
}

startBots()
