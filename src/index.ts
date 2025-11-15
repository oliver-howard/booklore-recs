#!/usr/bin/env node

import { RecommendationService } from './recommendation-service.js';
import { validateConfig } from './config.js';
import { RecommendationType } from './types.js';

async function main() {
  try {
    // Validate configuration
    validateConfig();

    const args = process.argv.slice(2);
    const command = args[0] || 'similar';

    const service = new RecommendationService();

    console.log('Authenticating with BookLore...');
    await service.initialize();
    console.log('✓ Authentication successful\n');

    switch (command) {
      case 'similar':
      case 's': {
        console.log('Getting similar book recommendations...');
        const recommendations = await service.getRecommendations('similar');
        console.log('\n=== SIMILAR BOOK RECOMMENDATIONS ===');
        console.log(
          RecommendationService.formatRecommendations(
            recommendations as any[]
          )
        );
        break;
      }

      case 'contrasting':
      case 'c': {
        console.log('Getting contrasting book recommendations...');
        const recommendations = await service.getRecommendations('contrasting');
        console.log('\n=== CONTRASTING PERSPECTIVES ===');
        console.log(
          RecommendationService.formatRecommendations(
            recommendations as any[]
          )
        );
        break;
      }

      case 'blindspots':
      case 'b': {
        console.log('Analyzing reading blind spots...');
        const analysis = await service.getRecommendations('blindspots');
        console.log(RecommendationService.formatReadingAnalysis(analysis as any));
        break;
      }

      case 'custom': {
        const criteria = args.slice(1).join(' ');
        if (!criteria) {
          console.error('Error: Please provide criteria for custom recommendations');
          console.log('Usage: npm run recommend custom "your criteria here"');
          process.exit(1);
        }
        console.log(`Getting custom recommendations for: "${criteria}"`);
        const recommendations = await service.getCustomRecommendations(criteria);
        console.log('\n=== CUSTOM RECOMMENDATIONS ===');
        console.log(
          RecommendationService.formatRecommendations(recommendations)
        );
        break;
      }

      case 'stats': {
        console.log('Fetching your reading statistics...');
        const stats = await service.getUserStats();
        console.log('\n=== YOUR READING STATISTICS ===');
        console.log(`Total books read: ${stats.totalBooksRead}`);
        console.log(`Books rated: ${stats.booksRated}`);
        console.log(`Average rating: ${stats.averageRating.toFixed(2)}/10`);
        console.log('\nTop genres:');
        stats.topGenres.forEach((genre, i) => console.log(`  ${i + 1}. ${genre}`));
        console.log('\nTop authors:');
        stats.topAuthors.forEach((author, i) =>
          console.log(`  ${i + 1}. ${author}`)
        );
        break;
      }

      case 'help':
      case 'h':
      default: {
        console.log(`
BookLore AI Book Recommendations

Usage:
  npm run recommend [command] [options]

Commands:
  similar, s           Get similar book recommendations based on your reading history
  contrasting, c       Get books with contrasting perspectives to challenge your views
  blindspots, b        Analyze your reading patterns and identify blind spots
  custom <criteria>    Get recommendations based on custom criteria
  stats               Show your reading statistics
  help, h             Show this help message

Examples:
  npm run recommend similar
  npm run recommend contrasting
  npm run recommend blindspots
  npm run recommend custom "science fiction with strong female protagonists"
  npm run recommend stats

Environment Variables:
  See .env.example for configuration options including:
  - BookLore API credentials
  - AI provider selection (anthropic, openai, google)
  - API keys for chosen AI provider
        `);
        break;
      }
    }
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
