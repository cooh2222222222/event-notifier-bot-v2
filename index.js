const { Client, GatewayIntentBits } = require('discord.js');
const schedule = require('node-schedule');
const { Configuration, OpenAIApi } = require("openai");
const { Client: PgClient } = require('pg');

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

const pgClient = new PgClient({
  connectionString: process.env.DATABASE_URL
});

// 投稿データ保持用
const pendingAnnouncements = {};

// DB 初期化
(async () => {
  try {
    await pgClient.connect();
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        message_id TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        release_time TIMESTAMP,
        posted BOOLEAN DEFAULT FALSE
      )
    `);
    console.log("✅ テーブル確認・作成が完了しました！");
  } catch (err) {
    console.error("❌ DB初期化エラー:", err);
  }
})();

client.once('ready', () => {
  console.log(`✅ ログイン成功！: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.reference) {
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
    const pending = pendingAnnouncements[repliedMessage.id];
    if (!pending) {
      message.reply("⚠ 元の告知データが見つかりませんでした！");
      return;
    }

    let input = message.content.trim()
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248))
      .replace(/[／.]/g, '-')
      .replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, '')
      .replace(/時/g, ':').replace(/分/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!input.match(/\d{1,2}:\d{2}/)) {
      input += ' 20:00';
    }

    let targetDate = new Date(input);
    if (isNaN(targetDate)) {
      message.reply("⚠ 日付・時間の形式が不正です。例: `2025-07-30 19:00` または `7/30 20:00`");
      return;
    }

    // DB保存
    try {
      await pgClient.query(
        'INSERT INTO announcements (message_id, content, image_url, release_time) VALUES ($1, $2, $3, $4)',
        [repliedMessage.id, pending.content, pending.image, targetDate]
      );
      console.log("✅ データをDBに保存しました！");
    } catch (dbErr) {
      console.error("❌ DB保存エラー:", dbErr);
    }

    schedule.scheduleJob(targetDate, () => {
      message.channel.send({
        content: pending.content,
        files: [pending.image]
      });
    });

    message.reply(`✅ ${targetDate.toLocaleString()} に告知予約しました！`);
    return;
  }

  if (message.attachments.size === 0) {
    message.reply("⚠ 画像を添付してください！");
    return;
  }

  const flyer = message.attachments.first();
  const prompt = `次のテキストからイベント名、日付、オープン時間、予約価格、当日価格、チケットリンク、場所を含む有効な JSON オブジェクトのみを返してください。
絶対に他の文章、説明、補足は不要です。
1行の JSON のみを返してください。
テキスト:
${message.content}`;

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }]
    });

    const resultText = response.data.choices[0].message.content.trim();
    const data = JSON.parse(resultText);

    let content = `【🎤${data["イベント名"]}🎤】

◤${data["日付"]} ${data["オープン時間"]}
◤adv ¥${data["予約価格"]} / door ¥${data["当日価格"]}+1d
◤at ${data["場所"]}`;
    if (data["チケットリンク"]) {
      const link = data["チケットリンク"];
      if (!link.includes("instagram.com") && !link.includes("x.com") && !link.includes("twitter.com")) {
        content += `\n◤ticket ▶︎ ${link}`;
      }
    }

    await message.reply(`✅ プレビュー:\n${content}\n\n💡 このメッセージに「解禁日と時間」をリプしてね！（例: 2025-07-30 19:00 または 7/30 20:00）`);

    pendingAnnouncements[message.id] = {
      content,
      image: flyer.url
    };

  } catch (err) {
    console.error("❌ OpenAIエラー:", err);
    message.reply("⚠ データ抽出に失敗しました。もう一度試してね！");
  }
});

client.login(process.env.BOT_TOKEN);
