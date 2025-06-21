try {
  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt + "\n必ず有効な JSON オブジェクトだけを返してください。他の文章は不要です。" }]
  });

  const resultText = response.data.choices[0].message.content;
  
  // レスポンスの中身をログ出力
  console.log("OpenAIレスポンス:", resultText);

  // パースに try-catch
  let data;
  try {
    data = JSON.parse(resultText);
  } catch (parseErr) {
    console.error("JSONパース失敗:", parseErr);
    message.reply("⚠ OpenAIの返答が不正な形式でした。再度試してね！");
    return;
  }

  // ここから元の処理
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
    const channel = client.channels.cache.get('1385390915249508464');
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
  console.error("OpenAI呼び出しエラー:", err);
  message.reply("⚠ データ抽出に失敗しました。もう一度試してください！！");
}
