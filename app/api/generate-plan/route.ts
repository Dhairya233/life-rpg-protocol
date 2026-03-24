import { NextResponse } from 'next/server';

// Fallback stub if no API key is provided
const generateMockQuests = (entry: string) => {
  const isTired = entry.toLowerCase().includes('tired') || entry.toLowerCase().includes('exhausted');
  
  if (isTired) {
    return [
      { title: 'Gentle Stretching', description: 'Take 10 minutes to stretch your muscles and recover.', skill_type: 'fitness', xp_reward: 20, duration_minutes: 10 },
      { title: 'Read a Fiction Book', description: 'Unwind with a non-technical book before bed.', skill_type: 'focus', xp_reward: 30, duration_minutes: 30 }
    ];
  }

  return [
    { title: 'Morning Code Kata', description: 'Start the day with a quick 15-minute algorithm challenge.', skill_type: 'coding', xp_reward: 50, duration_minutes: 15 },
    { title: 'Hydration Walk', description: 'Walk outside for 20 minutes while drinking a full bottle of water.', skill_type: 'fitness', xp_reward: 40, duration_minutes: 20 },
    { title: 'Creative Brainstorm', description: 'Jot down 5 new ideas for side projects or art.', skill_type: 'creative', xp_reward: 35, duration_minutes: 15 }
  ];
};

export async function POST(req: Request) {
  try {
    const { entry } = await req.json();

    if (!entry) {
      return NextResponse.json({ error: 'Diary entry is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;

    // Use a stub if no API key is configured to ensure the app doesn't break
    if (!apiKey) {
      console.warn("No LLM API Key found. Returning stubbed AI quests.");
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      return NextResponse.json({ quests: generateMockQuests(entry) });
    }

    // Example OpenAI completion request
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or gpt-3.5-turbo
        messages: [
          {
            role: "system",
            content: `You are an AI game master for a real-life RPG protocol. 
Your goal is to read the user's daily diary entry and generate 1 to 3 "Private Quests" for them to complete tomorrow. 
If they had a stressful or tiring day, suggest recovery or light focus quests. If they had a highly productive day, suggest ambitious or creative quests.

You MUST follow these economy constraints strictly:
- xp_reward MUST be an integer between 10 and 200.
- duration_minutes MUST be an integer between 5 and 180.
- skill_type MUST be exactly one of: "focus", "coding", "fitness", "creative".

Output raw JSON containing an array of quest objects. Do NOT wrap the JSON in markdown formatting (no \`\`\`json). The format must be:
[
  {
    "title": "String (max 40 chars)",
    "description": "String (max 100 chars)",
    "skill_type": "coding",
    "xp_reward": 50,
    "duration_minutes": 30
  }
]`
          },
          {
            role: "user",
            content: `Diary Entry: "${entry}"`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("LLM API Error:", errorData);
      return NextResponse.json({ quests: generateMockQuests(entry) }); // Fallback to stub on error
    }

    const data = await response.json();
    let rawContent = data.choices[0].message.content.trim();
    
    // Safety cleanup in case the LLM wrapped it in markdown anyway
    if (rawContent.startsWith('\`\`\`json')) {
      rawContent = rawContent.replace(/^\`\`\`json/g, '').replace(/\`\`\`$/g, '').trim();
    }

    const parsedQuests = JSON.parse(rawContent);
    return NextResponse.json({ quests: parsedQuests });

  } catch (error) {
    console.error('Error generating plan:', error);
    // Graceful degradation fallback
    return NextResponse.json({ quests: generateMockQuests("General") });
  }
}
