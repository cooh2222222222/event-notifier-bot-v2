const { Client, GatewayIntentBits } = require('discord.js');
const schedule = require('node-schedule');
const { Configuration, OpenAIApi } = require("openai");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

client.once('ready', () => {
  console.log(`✅ ログイン成功！: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const flyer = message.attachments.first();
  if (!flyer) {
    message.reply("⚠ 画像を添付してください！！");
    return;
  }

  const prompt = `次のテキストからイベント名、日付、オープン時間、予約価格、当日価格、チケットリンク、場所、主催をJSONで返してください。
見つからない項目は null にしてください。
テキスト:
${message.content}`;

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }]
    });

    const resultText = response.data.choices[0].message.content;
    let data = JSON.parse(resultText);

    const missing = Object.keys(data).filter(key => !data[key]);
    if (missing.length > 0) {
      message.reply(`⚠ 次の項目が見つかりませんでした: ${missing.join(", ")}`);
      return;
    }

    let dateStr = `${data["日付"]} ${data["オープン時間"]}`;
    dateStr = dateStr
      .replace(/[／.]/g, '-')
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248))
      .replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const scheduleDate = new Date(dateStr);
    if (isNaN(scheduleDate)) {
      message.reply("⚠ 日付や時間の形式が不正です！！");
      return;
    }

    schedule.scheduleJob(scheduleDate, () => {
      const channel = client.channels.cache.get('YOUR_CHANNEL_ID');
      if (channel) {
        channel.send({
          content: `【🎤${data["イベント名"]}🎤】

◤${data["日付"]} ${data["オープン時間"]}
◤adv ¥${data["予約価格"]} / door ¥${data["当日価格"]}+1d
◤ticket ▶︎ ${data["チケットリンク"]}
◤at ${data["場所"]}
◤主催： ${data["主催"]}`,
          files: [flyer.url]
        });
      }
    });

    message.reply(`✅ 告知予約を受け付けたよ！！`);
  } catch (err) {
    console.error(err);
    message.reply("⚠ データ抽出に失敗しました。もう一度試してください!！");
  }
});

client.login(process.env.BOT_TOKEN);
