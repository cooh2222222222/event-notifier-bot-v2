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

const scheduledContents = {};

client.once('ready', () => {
  console.log(`✅ ログイン成功！: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.reference) {
    handleReply(message);
  } else if (message.attachments.size > 0) {
    handleNewAnnouncement(message);
  }
});

// 新規告知処理
async function handleNewAnnouncement(message) {
  const flyer = message.attachments.first();

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

    // JSON 部分だけ抽出
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      message.reply("⚠ OpenAI の返答が正しい JSON じゃなかったよ。もう一度試してね！");
      return;
    }

    const data = JSON.parse(jsonMatch[0]);

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

    let content = `【🎤${data["イベント名"]}🎤】

◤${data["日付"]} ${data["オープン時間"]}
◤adv ¥${data["予約価格"]} / door ¥${data["当日価格"]}+1d
◤at ${data["場所"]}`;
    if (data["チケットリンク"]) {
      content += `\n◤ticket ▶︎ ${data["チケットリンク"]}`;
    }

    scheduledContents[message.id] = {
      content: content,
      fileUrl: flyer.url
    };

    message.reply({
      content: `✅ 以下の内容で告知を保存したよ！\n\n${content}\n\n📌 告知解禁日をこのメッセージにリプライで送ってね！（例: 2025-07-30 または 7/30 または 7月30日）`,
      files: [flyer.url]
    });

  } catch (err) {
    console.error("エラー:", err);
    message.reply("⚠ データ抽出に失敗しました。再度試してね！");
  }
}

// リプライで解禁日指定
function handleReply(message) {
  const parentId = message.reference.messageId;
  const scheduled = scheduledContents[parentId];

  if (!scheduled) {
    message.reply("⚠ 元の告知が見つからないよ！");
    return;
  }

  const input = message.content.trim();
  const now = new Date();
  let dateStr = "";

  if (/^\d{1,2}\/\d{1,2}$/.test(input)) {
    dateStr = `${now.getFullYear()}-${input.replace('/', '-')}`;
  } else if (/^\d{1,2}月\d{1,2}日$/.test(input)) {
    dateStr = `${now.getFullYear()}-${input.replace('月', '-').replace('日', '')}`;
  } else {
    dateStr = input;
  }

  const finalDate = new Date(`${dateStr} 20:00`);
  if (isNaN(finalDate)) {
    message.reply("⚠ 日付の形式が不正です！例: 2025-07-30 または 7/30 または 7月30日");
    return;
  }

  schedule.scheduleJob(finalDate, () => {
    message.channel.send({
      content: scheduled.content,
      files: [scheduled.fileUrl]
    });
  });

  message.reply(`✅ ${finalDate.toLocaleString()} に告知をスケジュールしたよ！`);
}

client.login(process.env.BOT_TOKEN);
