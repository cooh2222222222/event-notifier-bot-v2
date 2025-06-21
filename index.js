const { Client, GatewayIntentBits } = require('discord.js');
const schedule = require('node-schedule');
const { Configuration, OpenAIApi } = require("openai");
const { Pool } = require('pg');

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

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

// 投稿データ保持用
const pendingAnnouncements = {};

client.once('ready', () => {
  console.log(`✅ ログイン成功！: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.reference) {
    // リプライで解禁日時設定
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

    schedule.scheduleJob(targetDate, () => {
      message.channel.send({
        content: pending.content,
        files: [pending.image]
      });
    });

    // DBに保存
    await db.query(
      `INSERT INTO announcements (content, image_url, scheduled_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [pending.content, pending.image, targetDate]
    );

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

    // 一時保存
    pendingAnnouncements[message.id] = {
      content,
      image: flyer.url
    };

    // DBに即保存（プレビュー用）
    await db.query(
      `INSERT INTO announcements (content, image_url, created_at)
       VALUES ($1, $2, NOW())`,
      [content, flyer.url]
    );

  } catch (err) {
    console.error("エラー:", err);
    message.reply("⚠ データ抽出に失敗しました。もう一度試してね！");
  }
});

client.login(process.env.BOT_TOKEN);
