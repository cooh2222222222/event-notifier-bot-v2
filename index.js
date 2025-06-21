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
      if (
        !link.includes("instagram.com") &&
        !link.includes("x.com") &&
        !link.includes("twitter.com")
      ) {
        content += `\n◤ticket ▶︎ ${link}`;
      }
    }

    // 即時プレビューを返す
    await message.reply({
      content: `✅ プレビュー:\n${content}`,
      files: [flyer.url]
    });

  } catch (err) {
    console.error("エラー:", err);
    message.reply("⚠ データ抽出に失敗しました。もう一度試してね！");
  }
});

client.login(process.env.BOT_TOKEN);
