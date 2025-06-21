const { Client, GatewayIntentBits } = require('discord.js');
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
  if (message.attachments.size === 0) {
    message.reply("⚠ 画像を添付してください！");
    return;
  }

  const flyer = message.attachments.first();

  const prompt = `次のテキストからイベント名、日付、オープン時間、予約価格、当日価格、チケットリンク、場所を含む有効な JSON オブジェクトだけを返してください。
絶対に他の文章や説明、補足は不要です。JSON のみを返してください。
テキスト:
${message.content}`;

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: prompt }]
    });

    const resultText = response.data.choices[0].message.content;
    console.log("OpenAIレスポンス:", resultText);

    // JSON 部分だけを抽出
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      message.reply("⚠ OpenAI の返答が正しい JSON じゃなかったよ。もう一度試してね！");
      return;
    }

    const data = JSON.parse(jsonMatch[0]);

    // 必須項目確認
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

    // 告知文組み立て
    let content = `【🎤${data["イベント名"]}🎤】

◤${data["日付"]} ${data["オープン時間"]}
◤adv ¥${data["予約価格"]} / door ¥${data["当日価格"]}+1d
◤at ${data["場所"]}`;
    if (data["チケットリンク"]) {
      content += `\n◤ticket ▶︎ ${data["チケットリンク"]}`;
    }

    // 告知即送信
    message.channel.send({
      content: content,
      files: [flyer.url]
    });

  } catch (err) {
    console.error("エラー:", err);
    message.reply("⚠ データ抽出に失敗しました。もう一度試してね！");
  }
});

client.login(process.env.BOT_TOKEN);
