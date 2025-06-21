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

  const prompt = `次のテキストからイベント名、日付、オープン時間、予約価格、当日価格、チケットリンク、場所をJSONで返してください。
見つからない項目は null にしてください。
必ず有効な JSON オブジェクトだけを返してください。他の文章は不要です。
テキスト:
${message.content}`;

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }]
    });

    const resultText = response.data.choices[0].message.content;
    console.log("OpenAIレスポンス:", resultText);

    let data;
    try {
      data = JSON.parse(resultText);
    } catch (parseErr) {
      console.error("JSONパース失敗:", parseErr);
      message.reply("⚠ OpenAIの返答が不正な形式でした。再度試してね！");
      return;
    }

    // 必須項目だけチェック（チケットリンクは除外）
    const missing = [];
    if (!data["イベント名"]) missing.push("イベント名");
    if (!data["日付"]) missing.push("日付");
    if (!data["オープン時間"]) missing.push("オープン時間");
    if (!data["予約価格"]) missing.push("予約価格");
    if (!data["当日価格"]) missing.push("当日価格");
    if (!data["場所"]) missing.push("場所");

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

    // 告知メッセージ組み立て
    let content = `【🎤${data["イベント名"]}🎤】

◤${data["日付"]} ${data["オープン時間"]}
◤adv ¥${data["予約価格"]} / door ¥${data["当日価格"]}+1d
◤at ${data["場所"]}`;
    if (data["チケットリンク"]) {
      content += `\n◤ticket ▶︎ ${data["チケットリンク"]}`;
    }

    // 即時プレビュー送信
    message.reply({
      content: `✅ 以下の内容で告知予約したよ！\n\n${content}`,
      files: [flyer.url]
    });

    // スケジュールで投稿
    schedule.scheduleJob(scheduleDate, () => {
      const channel = client.channels.cache.get('1385390915249508464'); // チャンネルIDに置き換えてね
      if (channel) {
        channel.send({
          content: content,
          files: [flyer.url]
        });
      }
    });

  } catch (err) {
    console.error("OpenAI呼び出しエラー:", err);
    message.reply("⚠ データ抽出に失敗しました。もう一度試してください！！");
  }
});

client.login(process.env.BOT_TOKEN);
