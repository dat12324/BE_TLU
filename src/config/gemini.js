import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

export const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
}) : null;
