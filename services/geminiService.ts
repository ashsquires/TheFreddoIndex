import { GoogleGenAI, Type } from "@google/genai";
import { CommentaryResponse } from '../types';
import { GEMINI_SYSTEM_INSTRUCTION } from '../constants';

let ai: GoogleGenAI | null = null;

const getAI = () => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
};

export const fetchFreddoCommentary = async (year: number, price: number): Promise<CommentaryResponse> => {
  try {
    const client = getAI();
    
    // Using 2.5 Flash for speed and low latency
    const modelName = 'gemini-2.5-flash';
    
    const response = await client.models.generateContent({
      model: modelName,
      contents: `The year is ${year}. The price of a Freddo is ${price}p. Give me a quote from a citizen.`,
      config: {
        systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quote: { type: Type.STRING, description: "The fictional quote." },
            author: { type: Type.STRING, description: "The name and location of the speaker." }
          },
          required: ["quote", "author"],
        }
      }
    });

    const text = response.text;
    if (!text) {
        throw new Error("No response from Gemini");
    }

    return JSON.parse(text) as CommentaryResponse;

  } catch (error) {
    console.error("Failed to fetch Freddo wisdom:", error);
    return {
      quote: "I'm absolutely speechless.",
      author: "Barry, Birmingham"
    };
  }
};