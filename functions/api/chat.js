export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405 }
      );
    }

    try {
      const { messages } = await request.json();

      const systemPrompt = {
        role: "system",
        content: `
你是一个中文的 AI 社交教练「交个朋友」。
你的任务：
1）理解用户描述的聊天场景；
2）给出富有共情、具体可执行的建议；
3）必须严格输出以下 JSON（绝不能多字或少字）：

{
  "reply": "提供三种自然回复建议，用\\n分行",
  "mood": "3~6 字情绪，例如：紧张期待",
  "insights": "对聊天节奏、关系的分析",
  "suggestions": [
    "建议 1",
    "建议 2"
  ],
  "topics": [
    "话题 1",
    "话题 2"
  ]
}
        `
      };

      const fullMessages = [systemPrompt, ...messages];

      const apiRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: fullMessages,
          temperature: 0.7
        })
      });

      const result = await apiRes.json();
      const reply = result.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      console.error("❌ Cloudflare Functions 失败：", err);
      return new Response(
        JSON.stringify({ reply: "后端处理失败" }),
        { status: 500 }
      );
    }
  }
};
