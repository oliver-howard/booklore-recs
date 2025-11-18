import dotenv from 'dotenv';
import { AIProvider } from './types.js';

// Load environment variables
dotenv.config();

export const config = {
  booklore: {
    apiUrl: process.env.BOOKLORE_API_URL || 'https://ebooks.fiosa.us/api/v1',
    username: process.env.BOOKLORE_USERNAME || '',
    password: process.env.BOOKLORE_PASSWORD || '',
  },
  ai: {
    defaultProvider: (process.env.DEFAULT_AI_PROVIDER || 'anthropic') as AIProvider,
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    maxRecommendations: parseInt(process.env.MAX_RECOMMENDATIONS || '5', 10),
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
      // Use a stable, GA model that works with the public Generative Language API
      model: process.env.GOOGLE_MODEL || 'gemini-2.5-flash',
    },
  },
};

export function validateConfig(): void {
  if (!config.booklore.username || !config.booklore.password) {
    throw new Error('BookLore credentials not configured. Please set BOOKLORE_USERNAME and BOOKLORE_PASSWORD in .env');
  }

  const provider = config.ai.defaultProvider;
  const providerConfig = config.ai[provider];

  if (!providerConfig.apiKey) {
    throw new Error(`API key for ${provider} not configured. Please set ${provider.toUpperCase()}_API_KEY in .env`);
  }
}
